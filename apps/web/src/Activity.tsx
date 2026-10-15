import type { InvoiceOutcome, RunSummary, StubCall } from "@payment-trigger/domain/Run"
import { outcomeLabel } from "./explain.ts"
import { formatInstant } from "./format.ts"

const describeOutcome = (outcome: InvoiceOutcome) =>
  outcome.outcome === "routing_failed" ||
  outcome.outcome === "stub_failed" ||
  outcome.outcome === "invalid_params"
    ? `${outcome.invoiceId}: ${outcomeLabel[outcome.outcome]} (${outcome.detail})`
    : `${outcome.invoiceId}: ${outcomeLabel[outcome.outcome]}`

export function RunLog({ runs }: { readonly runs: ReadonlyArray<RunSummary> }) {
  if (runs.length === 0) {
    return <p className="px-5 py-4 text-sm text-slate-500">No runs yet.</p>
  }
  return (
    <ul className="divide-y divide-slate-100 text-sm" data-testid="run-log">
      {runs.map((run) => (
        <li key={run.runId} className="flex flex-col gap-0.5 px-5 py-2.5">
          <span className="shrink-0 font-mono text-xs leading-5 text-slate-500">
            Run #{run.runId} <span className="tabular-nums">{formatInstant(run.startedAt)}</span>
          </span>
          <span className="text-slate-800">
            {run.newChanges} new status change{run.newChanges === 1 ? "" : "s"}
            {run.outcomes.length === 0
              ? " · nothing to do"
              : ` · ${run.outcomes.map(describeOutcome).join(", ")}`}
            {run.deferredInvoices > 0 &&
              ` · ${run.deferredInvoices} invoices left for the next run`}
          </span>
        </li>
      ))}
    </ul>
  )
}

const Code = ({ caption, children }: { readonly caption: string; readonly children: string }) => (
  <div className="min-w-0">
    <p className="text-xs text-slate-500">{caption}</p>
    <pre className="mt-1 overflow-x-auto rounded-lg bg-slate-900 p-3 font-mono text-xs leading-relaxed text-slate-100">
      {children}
    </pre>
  </div>
)

/** Every call the Stripe stub received, with its exact inputs, as logged by the mock. */
export function StubCallLog({ calls }: { readonly calls: ReadonlyArray<StubCall> }) {
  if (calls.length === 0) {
    return <p className="px-5 py-4 text-sm text-slate-500">The stub has not been called.</p>
  }
  return (
    <ol className="divide-y divide-slate-100" data-testid="stub-calls">
      {calls.map((call) => (
        <li key={call.id} className="space-y-3 px-5 py-4 text-sm">
          <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-medium">Invoice {call.invoiceId}</span>
            <span className="text-xs text-slate-500 tabular-nums">
              call #{call.id} · {formatInstant(call.calledAt)}
            </span>
            <span className="font-mono text-xs break-all text-slate-500">
              {call.idempotencyKey}
            </span>
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <Code caption="createStripePaymentLink(params)">
              {JSON.stringify(call.params, null, 2)}
            </Code>
            <Code caption="returned">{call.error ?? JSON.stringify(call.result, null, 2)}</Code>
          </div>
        </li>
      ))}
    </ol>
  )
}
