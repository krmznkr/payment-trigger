import { PaymentLinkParams } from "@payment-trigger/domain/Routing"
import type { RunSummary } from "@payment-trigger/domain/Run"
import { assert, describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Ref } from "effect"
import { SqlClient } from "effect/sql"
import { TestClock } from "effect/testing"
import { StripePaymentLinks, StripeStubError } from "../src/StripePaymentLinks.ts"
import { claimLease, idempotencyKey, TriggerRun } from "../src/TriggerRun.ts"
import { TriggerStore } from "../src/TriggerStore.ts"
import { atCaseStudyToday, triggerLayer } from "./support.ts"

const expected1002 = new PaymentLinkParams({
  invoiceId: 1002,
  amountCents: 24000,
  currency: "EUR",
  customerEmail: "anna.keller@example.com",
  stripeCustomerId: "cus_A1B2C3",
  settlementBankAccountId: 2,
})

const outcomeOf = (summary: RunSummary, invoiceId: number) =>
  summary.outcomes.find((outcome) => outcome.invoiceId === invoiceId)?.outcome

describe("TriggerRun on the seed", () => {
  it.effect("first run calls the stub exactly once, for 1002, with the routed inputs", () =>
    Effect.gen(function* () {
      yield* atCaseStudyToday
      const trigger = yield* TriggerRun
      const store = yield* TriggerStore

      const summary = yield* trigger.run()

      const calls = yield* store.stubCalls()
      expect(calls).toHaveLength(1)
      expect(calls[0]?.params).toEqual(expected1002)
      expect(calls[0]?.idempotencyKey).toBe(idempotencyKey(1002))

      expect(summary.newChanges).toBe(7)
      expect(outcomeOf(summary, 1002)).toBe("link_created")
      expect(outcomeOf(summary, 1001)).toBe("not_a_trigger")
      expect(outcomeOf(summary, 1003)).toBe("not_a_trigger")
      expect(outcomeOf(summary, 1004)).toBe("not_a_trigger")

      const link = yield* store.findLink(1002)
      expect(link?.state).toBe("created")
      expect(link?.triggerChangeId).toBe(4)
      expect(link?.url).toBe(calls[0]?.result?.url)

      const snapshot = yield* store.loadSnapshot()
      expect(snapshot.decisions.map((decision) => [decision.changeId, decision.outcome])).toEqual([
        [1, "not_a_trigger"],
        [2, "not_a_trigger"],
        [3, "not_a_trigger"],
        [4, "link_created"],
        [5, "not_a_trigger"],
        [6, "not_a_trigger"],
        [7, "not_a_trigger"],
      ])
    }).pipe(Effect.provide(triggerLayer())),
  )

  it.effect("a rerun sees no new changes and never calls the stub again", () =>
    Effect.gen(function* () {
      yield* atCaseStudyToday
      const trigger = yield* TriggerRun
      const store = yield* TriggerStore

      yield* trigger.run()
      const first = yield* store.findLink(1002)
      const rerun = yield* trigger.run()

      expect(rerun.newChanges).toBe(0)
      expect(rerun.outcomes).toEqual([])
      expect(yield* store.stubCalls()).toHaveLength(1)
      expect(yield* store.findLink(1002)).toEqual(first)
    }).pipe(Effect.provide(triggerLayer())),
  )

  it.effect("two concurrent runs create one link with one stub call", () =>
    Effect.gen(function* () {
      yield* atCaseStudyToday
      const trigger = yield* TriggerRun
      const store = yield* TriggerStore

      yield* Effect.all([trigger.run(), trigger.run()], { concurrency: "unbounded" })

      expect(yield* store.stubCalls()).toHaveLength(1)
      expect((yield* store.loadSnapshot()).links).toHaveLength(1)
    }).pipe(Effect.provide(triggerLayer())),
  )

  it.effect("re-entering overdue later reuses the existing link", () =>
    Effect.gen(function* () {
      yield* atCaseStudyToday
      const trigger = yield* TriggerRun
      const store = yield* TriggerStore
      const sql = yield* SqlClient.SqlClient

      yield* trigger.run()
      yield* sql`INSERT INTO payment_status_history (id, invoice_id, old_status, new_status, changed_at) VALUES
        (8, 1002, 'overdue', 'open', '2026-10-01T00:00:00Z'),
        (9, 1002, 'open', 'overdue', '2026-10-10T00:00:00Z')`
      const summary = yield* trigger.run()

      expect(outcomeOf(summary, 1002)).toBe("already_linked")
      expect(yield* store.stubCalls()).toHaveLength(1)
    }).pipe(Effect.provide(triggerLayer())),
  )
})

/** Fails the first `failures` calls, then behaves like the mock and records every attempt. */
const flakyStripe = (failures: number) =>
  Layer.effect(
    StripePaymentLinks,
    Effect.gen(function* () {
      const mock = yield* StripePaymentLinks
      const remaining = yield* Ref.make(failures)
      return StripePaymentLinks.of({
        create: (params, key) =>
          Ref.getAndUpdate(remaining, (n) => n - 1).pipe(
            Effect.flatMap((n) =>
              n > 0
                ? Effect.fail(new StripeStubError({ message: "Stripe timed out" }))
                : mock.create(params, key),
            ),
          ),
      })
    }),
  ).pipe(Layer.provide(StripePaymentLinks.mock))

describe("TriggerRun failure handling", () => {
  it.effect(
    "a failed Stripe call leaves the change new and the next run retries with the same key",
    () =>
      Effect.gen(function* () {
        yield* atCaseStudyToday
        const trigger = yield* TriggerRun
        const store = yield* TriggerStore

        const failed = yield* trigger.run()
        expect(outcomeOf(failed, 1002)).toBe("stub_failed")
        expect((yield* store.findLink(1002))?.state).toBe("pending")
        assert.isFalse(
          (yield* store.loadSnapshot()).decisions.some((decision) => decision.changeId === 4),
        )

        const retried = yield* trigger.run()
        expect(retried.newChanges).toBe(2)
        expect(outcomeOf(retried, 1002)).toBe("link_created")
        expect((yield* store.findLink(1002))?.state).toBe("created")

        const calls = yield* store.stubCalls()
        expect(calls).toHaveLength(1)
        expect(calls[0]?.idempotencyKey).toBe(idempotencyKey(1002))
      }).pipe(Effect.provide(triggerLayer(flakyStripe(1)))),
  )

  it.effect(
    "a claim left pending by a crashed run is taken over only after the lease expires",
    () =>
      Effect.gen(function* () {
        yield* atCaseStudyToday
        const trigger = yield* TriggerRun
        const store = yield* TriggerStore

        // Simulate a run that claimed 1002 and died before calling Stripe.
        yield* store.claimLink({
          invoiceId: 1002,
          triggerChangeId: 4,
          idempotencyKey: idempotencyKey(1002),
          params: expected1002,
          claimedAt: "2026-10-15T12:00:00.000Z",
        })

        const during = yield* trigger.run()
        expect(outcomeOf(during, 1002)).toBe("in_progress")
        expect(yield* store.stubCalls()).toHaveLength(0)

        yield* TestClock.adjust(claimLease)
        yield* TestClock.adjust("1 second")
        const after = yield* trigger.run()
        expect(outcomeOf(after, 1002)).toBe("link_created")
        expect(yield* store.stubCalls()).toHaveLength(1)
      }).pipe(Effect.provide(triggerLayer())),
  )
})
