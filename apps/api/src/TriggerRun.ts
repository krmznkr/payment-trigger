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

/**
 * Invoices handled per run. A run costs about 5 D1 queries per invoice and D1 allows
 * 1000 queries per Worker invocation (50 on the free plan), so a run stops at the cap
 * and the next run continues where it left off.
 */
export const MaxInvoicesPerRun = Context.Reference<number>(
  "payment-trigger/api/MaxInvoicesPerRun",
  {
    defaultValue: () => 100,
  },
)

/** One link per invoice, so one key per invoice. Stable across retries and reruns. */
export const idempotencyKey = (invoiceId: number) => `payment-link:invoice:${invoiceId}`

interface LinkResult {
  readonly outcome: Outcome
  readonly detail: string | null
  /** The decision for the triggering row, if it differs from (outcome, this run). */
  readonly triggerDecision?: { readonly outcome: FinalOutcome; readonly runId: number }
}

const isFinal = (outcome: Outcome): outcome is FinalOutcome =>
  outcome === "link_created" ||
  outcome === "already_linked" ||
  outcome === "superseded" ||
  outcome === "not_a_trigger"

/** The decision recorded for each new history row once its invoice reached a final outcome. */
const rowDecision = (
  change: StatusChange,
  decision: TriggerDecision,
  result: LinkResult & { readonly outcome: FinalOutcome },
  runId: number,
): Decision => {
  const isTrigger = decision._tag === "Triggered" && decision.change.id === change.id
  const { outcome, runId: decidedBy } = isTrigger
    ? (result.triggerDecision ?? { outcome: result.outcome, runId })
    : {
        outcome: entersOverdue(change) ? ("superseded" as const) : ("not_a_trigger" as const),
        runId,
      }
  return new Decision({
    changeId: change.id,
    invoiceId: change.invoiceId,
    outcome,
    runId: decidedBy,
  })
}

export class TriggerRun extends Context.Service<TriggerRun>()("payment-trigger/api/TriggerRun", {
  make: Effect.gen(function* () {
    const store = yield* TriggerStore
    const stripe = yield* StripePaymentLinks

    /** Claim → call Stripe → complete. Never calls Stripe without holding the claim. */
    const ensureLink = Effect.fn("TriggerRun.ensureLink")(function* (
      invoice: Invoice,
      triggerChangeId: number,
      snapshot: Snapshot,
      runId: number,
    ): Effect.fn.Return<LinkResult, unknown> {
      const now = yield* DateTime.now
      const nowIso = DateTime.formatIso(now)
      const key = idempotencyKey(invoice.id)

      const routing = resolveSettlement(invoice, snapshot)
      if (Result.isFailure(routing)) {
        return { outcome: "routing_failed", detail: routing.failure._tag }
      }
      const customer = snapshot.customers.find((candidate) => candidate.id === invoice.customerId)
      if (customer === undefined) {
        return { outcome: "customer_missing", detail: `customer ${invoice.customerId}` }
      }
      const built = paymentLinkParams(invoice, customer, routing.success)
      if (Result.isFailure(built)) {
        return { outcome: "invalid_params", detail: built.failure.message }
      }

      let params = built.success
      const claimed = yield* store.claimLink({
        invoiceId: invoice.id,
        triggerChangeId,
        idempotencyKey: key,
        params,
        claimedAt: nowIso,
      })
      if (!claimed) {
        const existing = yield* store.findLink(invoice.id)
        // No row and no claim: the invoice stopped being overdue after our snapshot.
        if (existing === undefined) return { outcome: "changed_during_run", detail: null }
        if (existing.state === "created") {
          // Created for this very change by another run: record it as that run's creation.
          const creator =
            existing.triggerChangeId === triggerChangeId ? existing.createdByRunId : null
          return {
            outcome: "already_linked",
            detail: existing.stripePaymentLinkId,
            ...(creator === null
              ? {}
              : { triggerDecision: { outcome: "link_created", runId: creator } }),
          }
        }
        const staleBefore = DateTime.formatIso(DateTime.subtractDuration(now, claimLease))
        const reclaimed = yield* store.reclaimStale(invoice.id, staleBefore, nowIso)
        if (!reclaimed) return { outcome: "in_progress", detail: null }
        // Retry with the originally claimed params: Stripe rejects a reused key with different params.
        params = existing.params
      }

      return yield* stripe.create(params, key).pipe(
        Effect.flatMap((link) =>
          store
            .completeLink(invoice.id, link, nowIso, runId)
            .pipe(
              Effect.as<LinkResult>({ outcome: "link_created", detail: link.stripePaymentLinkId }),
            ),
        ),
        Effect.catchTag("StripeStubError", (error) =>
          store
            .releaseClaim(invoice.id)
            .pipe(Effect.as<LinkResult>({ outcome: "stub_failed", detail: error.message })),
        ),
      )
    })

    const run = Effect.fn("TriggerRun.run")(function* () {
      const maxInvoices = yield* MaxInvoicesPerRun
      const startedAt = DateTime.formatIso(yield* DateTime.now)
      const runId = yield* store.startRun(startedAt)
      const snapshot = yield* store.loadSnapshot()
      const asOf = yield* DateTime.now

      const handled = new Set(snapshot.decisions.map((decision) => decision.changeId))
      const newChanges = snapshot.history.filter((change) => !handled.has(change.id))
      // Oldest new change first, so a capped run always makes progress on the backlog.
      const pending = [...new Set(newChanges.map((change) => change.invoiceId))]
      const invoiceIds = pending.slice(0, maxInvoices)

      const outcomes: Array<InvoiceOutcome> = []
      for (const invoiceId of invoiceIds) {
        const invoice = snapshot.invoices.find((candidate) => candidate.id === invoiceId)
        if (invoice === undefined) continue
        const decision = evaluateInvoice(invoice, snapshot.history, asOf)

        const result: LinkResult =
          decision._tag === "Triggered"
            ? yield* ensureLink(invoice, decision.change.id, snapshot, runId)
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
              .map((change) => rowDecision(change, decision, { ...result, outcome }, runId)),
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
        deferredInvoices: pending.length - invoiceIds.length,
      })
      yield* store.finishRun(summary)
      yield* Effect.logInfo("trigger run finished", summary)
      return summary
    })

    /** Why a routable trigger still could not be sent, for the UI. */
    const paymentInputError = (view: {
      readonly invoice: Invoice
      readonly decision: TriggerDecision
      readonly snapshot: Snapshot
    }): string | null => {
      if (view.decision._tag !== "Triggered") return null
      const routing = resolveSettlement(view.invoice, view.snapshot)
      if (Result.isFailure(routing)) return null
      const customer = view.snapshot.customers.find((c) => c.id === view.invoice.customerId)
      if (customer === undefined) return `Customer ${view.invoice.customerId} does not exist.`
      const built = paymentLinkParams(view.invoice, customer, routing.success)
      return Result.isFailure(built) ? built.failure.message : null
    }

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
        const decision = evaluateInvoice(invoice, snapshot.history, asOf)
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
          decision,
          routing: Result.isSuccess(routing) ? routing.success : routing.failure,
          paymentInputError: paymentInputError({ invoice, decision, snapshot }),
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
