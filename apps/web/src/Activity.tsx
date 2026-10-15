import type { InvoiceOutcome, RunSummary, StubCall } from "@payment-trigger/domain/Run"
import { outcomeLabel } from "./explain.ts"
import { formatInstant } from "./format.ts"

const describeOutcome = (outcome: InvoiceOutcome) =>
  outcome.outcome === "routing_failed" || outcome.outcome === "stub_failed"
    ? `${outcome.invoiceId}: ${outcomeLabel[outcome.outcome]} (${outcome.detail})`
    : `${outcome.invoiceId}: ${outcomeLabel[outcome.outcome]}`

export function RunLog({ runs }: { readonly runs: ReadonlyArray<RunSummary> }) {
  if (runs.length === 0) return <p className="text-sm text-stone-600">No runs yet.</p>
  return (
    <ul className="space-y-1 text-sm" data-testid="run-log">
      {runs.map((run) => (
        <li key={run.runId}>
          <span className="font-mono">Run #{run.runId}</span>{" "}
          <span className="text-stone-500">{formatInstant(run.startedAt)}</span> · {run.newChanges}{" "}
          new status change{run.newChanges === 1 ? "" : "s"}
          {run.outcomes.length === 0
            ? " · nothing to do"
            : ` · ${run.outcomes.map(describeOutcome).join(", ")}`}
        </li>
      ))}
    </ul>
  )
}

/** Every call the Stripe stub received, with its exact inputs, as logged by the mock. */
export function StubCallLog({ calls }: { readonly calls: ReadonlyArray<StubCall> }) {
  if (calls.length === 0) {
    return <p className="text-sm text-stone-600">The stub has not been called.</p>
  }
  return (
    <ol className="space-y-3" data-testid="stub-calls">
      {calls.map((call) => (
        <li key={call.id} className="rounded border border-stone-200 bg-white p-3 text-sm">
          <p>
            <span className="font-mono">Call #{call.id}</span> · invoice {call.invoiceId} ·{" "}
            {formatInstant(call.calledAt)} · key{" "}
            <span className="font-mono">{call.idempotencyKey}</span>
          </p>
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            <div>
              <p className="text-xs text-stone-500">createStripePaymentLink(params)</p>
              <pre className="mt-1 overflow-x-auto rounded bg-stone-900 p-2 text-xs text-stone-100">
                {JSON.stringify(call.params, null, 2)}
              </pre>
            </div>
            <div>
              <p className="text-xs text-stone-500">returned</p>
              <pre className="mt-1 overflow-x-auto rounded bg-stone-900 p-2 text-xs text-stone-100">
                {call.error ?? JSON.stringify(call.result, null, 2)}
              </pre>
            </div>
          </div>
        </li>
      ))}
    </ol>
  )
}
