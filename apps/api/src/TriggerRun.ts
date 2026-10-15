import type { Invoice, StatusChange } from "@payment-trigger/domain/Models"
import { paymentLinkParams, resolveSettlement } from "@payment-trigger/domain/Routing"
import {
  HistoryEntry,
  InvoiceOutcome,
  InvoiceView,
  Overview,
  RunSummary,
  type FinalOutcome,
  type Outcome,
} from "@payment-trigger/domain/Run"
import {
  entersOverdue,
  evaluateInvoice,
  type TriggerDecision,
} from "@payment-trigger/domain/Trigger"
import { Context, DateTime, Duration, Effect, Layer, Result } from "effect"
import { StripePaymentLinks } from "./StripePaymentLinks.ts"
import { Decision, TriggerStore, type Snapshot } from "./TriggerStore.ts"

/** How long a pending claim may go without completing before another run takes it over. */
export const claimLease = Duration.minutes(2)

/** One link per invoice, so one key per invoice. Stable across retries and reruns. */
export const idempotencyKey = (invoiceId: number) => `payment-link:invoice:${invoiceId}`

/** The outcome recorded for each new history row once the invoice reached a final outcome. */
const rowOutcome = (
  change: StatusChange,
  decision: TriggerDecision,
  invoiceOutcome: FinalOutcome,
): FinalOutcome => {
  if (decision._tag === "Triggered" && decision.change.id === change.id) return invoiceOutcome
  return entersOverdue(change) ? "superseded" : "not_a_trigger"
}

const isFinal = (outcome: Outcome): outcome is FinalOutcome =>
  outcome === "link_created" ||
  outcome === "already_linked" ||
  outcome === "superseded" ||
  outcome === "not_a_trigger"

export class TriggerRun extends Context.Service<TriggerRun>()("payment-trigger/api/TriggerRun", {
  make: Effect.gen(function* () {
    const store = yield* TriggerStore
    const stripe = yield* StripePaymentLinks

    /** Claim → call Stripe → complete. Never calls Stripe without holding the claim. */
    const ensureLink = Effect.fn("TriggerRun.ensureLink")(function* (
      invoice: Invoice,
      triggerChangeId: number,
      snapshot: Snapshot,
    ) {
      const now = yield* DateTime.now
      const nowIso = DateTime.formatIso(now)
      const key = idempotencyKey(invoice.id)

      const routing = resolveSettlement(invoice, snapshot)
      if (Result.isFailure(routing)) {
        return { outcome: "routing_failed", detail: routing.failure._tag } as const
      }
      const customer = snapshot.customers.find((candidate) => candidate.id === invoice.customerId)
      if (customer === undefined) {
        return { outcome: "customer_missing", detail: `customer ${invoice.customerId}` } as const
      }

      let params = paymentLinkParams(invoice, customer, routing.success)
      const claimed = yield* store.claimLink({
        invoiceId: invoice.id,
        triggerChangeId,
        idempotencyKey: key,
        params,
        claimedAt: nowIso,
      })
      if (!claimed) {
        const existing = yield* store.findLink(invoice.id)
        if (existing === undefined) return yield* Effect.die("claim lost but no link row exists")
        if (existing.state === "created") {
          return { outcome: "already_linked", detail: existing.stripePaymentLinkId } as const
        }
        const staleBefore = DateTime.formatIso(DateTime.subtractDuration(now, claimLease))
        const reclaimed = yield* store.reclaimStale(invoice.id, staleBefore, nowIso)
        if (!reclaimed) return { outcome: "in_progress", detail: null } as const
        // Retry with the originally claimed params: Stripe rejects a reused key with different params.
        params = existing.params
      }

      return yield* stripe.create(params, key).pipe(
        Effect.flatMap((link) =>
          store
            .completeLink(invoice.id, link, nowIso)
            .pipe(
              Effect.as({ outcome: "link_created", detail: link.stripePaymentLinkId } as const),
            ),
        ),
        Effect.catchTag("StripeStubError", (error) =>
          store
            .releaseClaim(invoice.id)
            .pipe(Effect.as({ outcome: "stub_failed", detail: error.message } as const)),
        ),
      )
    })

    const run = Effect.fn("TriggerRun.run")(function* () {
      const startedAt = DateTime.formatIso(yield* DateTime.now)
      const runId = yield* store.startRun(startedAt)
      const snapshot = yield* store.loadSnapshot()
      const asOf = yield* DateTime.now

      const handled = new Set(snapshot.decisions.map((decision) => decision.changeId))
      const newChanges = snapshot.history.filter((change) => !handled.has(change.id))
      const invoiceIds = [...new Set(newChanges.map((change) => change.invoiceId))]

      const outcomes: Array<InvoiceOutcome> = []
      for (const invoiceId of invoiceIds) {
        const invoice = snapshot.invoices.find((candidate) => candidate.id === invoiceId)
        if (invoice === undefined) continue
        const decision = evaluateInvoice(invoice, snapshot.history, asOf)

        const result: { readonly outcome: Outcome; readonly detail: string | null } =
          decision._tag === "Triggered"
            ? yield* ensureLink(invoice, decision.change.id, snapshot)
            : decision._tag === "Inconsistent"
              ? { outcome: "inconsistent", detail: null }
              : decision._tag === "Superseded"
                ? { outcome: "superseded", detail: decision.currentStatus }
                : { outcome: "not_a_trigger", detail: decision.status }

        const outcome = result.outcome
        if (isFinal(outcome)) {
          yield* store.recordDecisions(
            newChanges
              .filter((change) => change.invoiceId === invoiceId)
              .map(
                (change) =>
                  new Decision({
                    changeId: change.id,
                    invoiceId,
                    outcome: rowOutcome(change, decision, outcome),
                    runId,
                  }),
              ),
            DateTime.formatIso(yield* DateTime.now),
          )
        }
        outcomes.push(new InvoiceOutcome({ invoiceId, outcome, detail: result.detail }))
      }

      const summary = new RunSummary({
        runId,
        startedAt,
        finishedAt: DateTime.formatIso(yield* DateTime.now),
        newChanges: newChanges.length,
        outcomes,
      })
      yield* store.finishRun(summary)
      yield* Effect.logInfo("trigger run finished", summary)
      return summary
    })

    const overview = Effect.fn("TriggerRun.overview")(function* () {
      const asOf = yield* DateTime.now
      const [snapshot, runs, stubCalls] = yield* Effect.all([
        store.loadSnapshot(),
        store.recentRuns(10),
        store.stubCalls(),
      ])
      const decisions = new Map(snapshot.decisions.map((decision) => [decision.changeId, decision]))
      const invoices = snapshot.invoices.map((invoice) => {
        const routing = resolveSettlement(invoice, snapshot)
        return new InvoiceView({
          invoice,
          customer:
            snapshot.customers.find((candidate) => candidate.id === invoice.customerId) ?? null,
          history: snapshot.history
            .filter((change) => change.invoiceId === invoice.id)
            .map(
              (change) =>
                new HistoryEntry({
                  change,
                  outcome: decisions.get(change.id)?.outcome ?? null,
                  runId: decisions.get(change.id)?.runId ?? null,
                }),
            ),
          decision: evaluateInvoice(invoice, snapshot.history, asOf),
          routing: Result.isSuccess(routing) ? routing.success : routing.failure,
          link: snapshot.links.find((link) => link.invoiceId === invoice.id) ?? null,
        })
      })
      return new Overview({ asOf: DateTime.formatIso(asOf), invoices, runs, stubCalls })
    })

    return { run, overview }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
