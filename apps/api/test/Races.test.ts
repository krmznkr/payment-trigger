import { describe, expect, it } from "@effect/vitest"
import { PaymentLinkParams } from "@payment-trigger/domain/Routing"
import type { RunSummary } from "@payment-trigger/domain/Run"
import { Effect, Layer, Ref } from "effect"
import { SqlClient } from "effect/sql"
import { StripePaymentLinks } from "../src/StripePaymentLinks.ts"
import { idempotencyKey, MaxInvoicesPerRun, TriggerRun } from "../src/TriggerRun.ts"
import { TriggerStore } from "../src/TriggerStore.ts"
import { atCaseStudyToday, Database, triggerLayer } from "./support.ts"

const outcomeOf = (summary: RunSummary, invoiceId: number) =>
  summary.outcomes.find((outcome) => outcome.invoiceId === invoiceId)?.outcome

const decisionFor = (changeId: number) =>
  TriggerStore.use((store) => store.loadSnapshot()).pipe(
    Effect.map((snapshot) => snapshot.decisions.find((decision) => decision.changeId === changeId)),
  )

/** A store whose first snapshot is immediately followed by the customer paying 1002. */
const paidRightAfterSnapshot = Layer.effect(
  TriggerStore,
  Effect.gen(function* () {
    const store = yield* TriggerStore.make
    const sql = yield* SqlClient.SqlClient
    const first = yield* Ref.make(true)
    const pay = Effect.all([
      sql`UPDATE invoices SET status = 'paid' WHERE id = 1002`,
      sql`INSERT INTO payment_status_history (invoice_id, old_status, new_status, changed_at)
          VALUES (1002, 'overdue', 'paid', '2026-10-15T12:00:01Z')`,
    ])
    return TriggerStore.of({
      ...store,
      loadSnapshot: () =>
        store
          .loadSnapshot()
          .pipe(
            Effect.tap(() =>
              Ref.getAndSet(first, false).pipe(
                Effect.flatMap((isFirst) => (isFirst ? pay : Effect.void)),
              ),
            ),
          ),
    })
  }),
)

describe("races and bad data", () => {
  it.effect("an invoice paid between snapshot and claim gets no link", () =>
    Effect.gen(function* () {
      yield* atCaseStudyToday
      const trigger = yield* TriggerRun
      const store = yield* TriggerStore

      const racing = yield* trigger.run()
      expect(outcomeOf(racing, 1002)).toBe("changed_during_run")
      expect(yield* store.stubCalls()).toEqual([])
      expect(yield* store.findLink(1002)).toBeUndefined()

      const next = yield* trigger.run()
      expect(outcomeOf(next, 1002)).toBe("superseded")
      expect((yield* decisionFor(4))?.outcome).toBe("superseded")
    }).pipe(
      Effect.provide(
        TriggerRun.layer.pipe(
          Layer.provideMerge(StripePaymentLinks.mock),
          Layer.provideMerge(paidRightAfterSnapshot),
          Layer.provideMerge(Database),
        ),
      ),
    ),
  )

  it.effect("the triggering row is recorded as created by the run that created the link", () =>
    Effect.gen(function* () {
      yield* atCaseStudyToday
      const trigger = yield* TriggerRun
      const store = yield* TriggerStore
      const stripe = yield* StripePaymentLinks

      // Another run claims and completes 1002's link, then dies before recording decisions.
      const otherRun = yield* store.startRun("2026-10-15T11:59:00.000Z")
      const params = new PaymentLinkParams({
        invoiceId: 1002,
        amountCents: 24000,
        currency: "EUR",
        customerEmail: "anna.keller@example.com",
        stripeCustomerId: "cus_A1B2C3",
        settlementBankAccountId: 2,
      })
      yield* store.claimLink({
        invoiceId: 1002,
        triggerChangeId: 4,
        idempotencyKey: idempotencyKey(1002),
        params,
        claimedAt: "2026-10-15T11:59:00.000Z",
      })
      const link = yield* stripe.create(params, idempotencyKey(1002))
      yield* store.completeLink(1002, link, "2026-10-15T11:59:01.000Z", otherRun)
      expect(yield* decisionFor(4)).toBeUndefined()

      const summary = yield* trigger.run()
      expect(outcomeOf(summary, 1002)).toBe("already_linked")
      const decision = yield* decisionFor(4)
      expect(decision?.outcome).toBe("link_created")
      expect(decision?.runId).toBe(otherRun)
      expect(yield* store.stubCalls()).toHaveLength(1)
    }).pipe(Effect.provide(triggerLayer())),
  )

  it.effect("an invalid amount never reaches Stripe and the change stays new until fixed", () =>
    Effect.gen(function* () {
      yield* atCaseStudyToday
      const sql = yield* SqlClient.SqlClient
      const trigger = yield* TriggerRun
      const store = yield* TriggerStore

      yield* sql`UPDATE invoices SET amount_cents = 0 WHERE id = 1002`
      const invalid = yield* trigger.run()
      expect(outcomeOf(invalid, 1002)).toBe("invalid_params")
      expect(yield* store.stubCalls()).toEqual([])
      expect(yield* decisionFor(4)).toBeUndefined()

      yield* sql`UPDATE invoices SET amount_cents = 24000 WHERE id = 1002`
      expect(outcomeOf(yield* trigger.run(), 1002)).toBe("link_created")
    }).pipe(Effect.provide(triggerLayer())),
  )

  it.effect("a capped run defers the rest, and the next run continues without duplicates", () =>
    Effect.gen(function* () {
      yield* atCaseStudyToday
      const sql = yield* SqlClient.SqlClient
      const trigger = yield* TriggerRun
      const store = yield* TriggerStore
      for (const id of [2001, 2002, 2003]) {
        yield* sql`INSERT INTO invoices VALUES (${id}, 100, 11, 1000, 'EUR', 'overdue', '2026-07-01', '2026-07-15')`
        yield* sql`INSERT INTO payment_status_history (invoice_id, old_status, new_status, changed_at)
                   VALUES (${id}, 'open', 'overdue', '2026-07-16T00:05:00Z')`
      }

      const runs: Array<RunSummary> = []
      for (let i = 0; i < 4; i++) {
        runs.push(yield* trigger.run().pipe(Effect.provideService(MaxInvoicesPerRun, 2)))
      }

      expect(runs.map((run) => [run.outcomes.length, run.deferredInvoices])).toEqual([
        [2, 5],
        [2, 3],
        [2, 1],
        [1, 0],
      ])
      const linked = (yield* store.stubCalls()).map((call) => call.invoiceId).sort()
      expect(linked).toEqual([1002, 2001, 2002, 2003])
    }).pipe(Effect.provide(triggerLayer())),
  )
})
