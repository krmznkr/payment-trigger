import { describe, expect, it } from "@effect/vitest"
import { InvoiceNotOpen } from "@payment-trigger/domain/Demo"
import { PaymentLinkParams } from "@payment-trigger/domain/Routing"
import type { RunSummary } from "@payment-trigger/domain/Run"
import { Effect } from "effect"
import { Demo } from "../src/Demo.ts"
import { TriggerRun } from "../src/TriggerRun.ts"
import { TriggerStore } from "../src/TriggerStore.ts"
import { atCaseStudyToday, triggerLayer } from "./support.ts"

const outcomeOf = (summary: RunSummary, invoiceId: number) =>
  summary.outcomes.find((outcome) => outcome.invoiceId === invoiceId)

describe("1003 marked overdue by the status job", () => {
  it.effect(
    "triggers on the next run, routed to Lyon's account #3, without a Stripe customer",
    () =>
      Effect.gen(function* () {
        yield* atCaseStudyToday
        const demo = yield* Demo
        const trigger = yield* TriggerRun
        const store = yield* TriggerStore

        yield* trigger.run()
        yield* demo.markOverdue(1003)
        const summary = yield* trigger.run()

        expect(summary.newChanges).toBe(1)
        expect(outcomeOf(summary, 1003)?.outcome).toBe("link_created")
        const calls = yield* store.stubCalls()
        expect(calls.map((call) => call.params)).toEqual([
          expect.objectContaining({ invoiceId: 1002 }),
          new PaymentLinkParams({
            invoiceId: 1003,
            amountCents: 18000,
            currency: "EUR",
            customerEmail: "marc.petit@example.fr",
            stripeCustomerId: null,
            settlementBankAccountId: 3,
          }),
        ])
      }).pipe(Effect.provide(triggerLayer())),
  )

  it.effect("only an open invoice can be marked overdue", () =>
    Effect.gen(function* () {
      const demo = yield* Demo
      const error = yield* Effect.flip(demo.markOverdue(1001))
      expect(error).toEqual(new InvoiceNotOpen({ invoiceId: 1001, status: "paid" }))
    }).pipe(Effect.provide(triggerLayer())),
  )
})

describe("routing failures", () => {
  for (const [scenario, error] of [
    ["two-eur-accounts", "AmbiguousSettlementAccount"],
    ["no-eur-account", "NoSettlementAccount"],
  ] as const) {
    it.effect(
      `${scenario}: no stub call, the change stays new, and fixing routing lets it through`,
      () =>
        Effect.gen(function* () {
          yield* atCaseStudyToday
          const demo = yield* Demo
          const trigger = yield* TriggerRun
          const store = yield* TriggerStore

          yield* trigger.run()
          yield* demo.setRoutingScenario(scenario)
          yield* demo.markOverdue(1003)

          const failed = yield* trigger.run()
          expect(outcomeOf(failed, 1003)).toEqual(
            expect.objectContaining({ outcome: "routing_failed", detail: error }),
          )
          expect((yield* store.stubCalls()).map((call) => call.invoiceId)).toEqual([1002])
          expect(yield* store.findLink(1003)).toBeUndefined()

          const stillFailing = yield* trigger.run()
          expect(stillFailing.newChanges).toBe(1)

          yield* demo.setRoutingScenario("seed")
          const fixed = yield* trigger.run()
          expect(outcomeOf(fixed, 1003)?.outcome).toBe("link_created")
          expect((yield* store.findLink(1003))?.params.settlementBankAccountId).toBe(3)
        }).pipe(Effect.provide(triggerLayer())),
    )
  }
})

describe("reset", () => {
  it.effect("restores the brief's seed and clears links, decisions, runs and stub calls", () =>
    Effect.gen(function* () {
      yield* atCaseStudyToday
      const demo = yield* Demo
      const trigger = yield* TriggerRun
      const store = yield* TriggerStore
      const pristine = yield* store.loadSnapshot()

      yield* demo.setRoutingScenario("two-eur-accounts")
      yield* demo.markOverdue(1003)
      yield* trigger.run()
      yield* demo.reset()

      expect(yield* store.loadSnapshot()).toEqual(pristine)
      expect(yield* store.stubCalls()).toEqual([])
      expect(yield* store.recentRuns(10)).toEqual([])

      const again = yield* trigger.run()
      expect(outcomeOf(again, 1002)?.outcome).toBe("link_created")
    }).pipe(Effect.provide(triggerLayer())),
  )
})
