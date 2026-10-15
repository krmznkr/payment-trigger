import { useAtom } from "@effect/atom-react"
import type { RoutingScenario } from "@payment-trigger/domain/Demo"
import type { InvoiceView } from "@payment-trigger/domain/Run"
import { AsyncResult } from "effect/reactivity"
import { demoReactivity, markOverdueAtom, resetAtom, routingScenarioAtom } from "./ApiClient.ts"
import { buttonStyles } from "./ui.tsx"

const FRANCE_SAS = 3

const scenarios: ReadonlyArray<{ readonly id: RoutingScenario; readonly label: string }> = [
  { id: "seed", label: "One EUR account (seed)" },
  { id: "no-eur-account", label: "No EUR account" },
  { id: "two-eur-accounts", label: "Two EUR accounts" },
]

/** Which scenario is live, read back from the routing the server computed (not from local state). */
const activeScenario = (invoices: ReadonlyArray<InvoiceView>): RoutingScenario => {
  for (const { routing } of invoices) {
    if (routing._tag === "NoSettlementAccount" && routing.legalEntityId === FRANCE_SAS)
      return "no-eur-account"
    if (routing._tag === "AmbiguousSettlementAccount" && routing.legalEntityId === FRANCE_SAS) {
      return "two-eur-accounts"
    }
  }
  return "seed"
}

const optionClass =
  "flex items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60 aria-pressed:bg-slate-50 aria-pressed:font-medium aria-pressed:text-slate-900"

export function DemoControls({ invoices }: { readonly invoices: ReadonlyArray<InvoiceView> }) {
  const [scenarioResult, setScenario] = useAtom(routingScenarioAtom)
  const [resetResult, reset] = useAtom(resetAtom)
  const active = activeScenario(invoices)
  const busy = scenarioResult.waiting || resetResult.waiting
  return (
    <section aria-labelledby="demo" className="space-y-3">
      <div>
        <h2 id="demo" className="text-sm font-semibold">
          Demo controls
        </h2>
        <p className="text-sm text-slate-500">
          Change the data the way upstream systems would. The trigger still has to be run.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-slate-600">
          Bank accounts of Storage24 France SAS (Lyon)
        </span>
        <div className="flex flex-col divide-y divide-slate-200 overflow-hidden rounded-lg bg-white shadow-xs ring-1 ring-slate-300">
          {scenarios.map((scenario) => (
            <button
              key={scenario.id}
              type="button"
              aria-pressed={active === scenario.id}
              disabled={busy}
              onClick={() => setScenario({ payload: { scenario: scenario.id }, ...demoReactivity })}
              className={optionClass}
            >
              <span
                aria-hidden
                className={`size-3.5 shrink-0 rounded-full ring-1 ring-inset ${active === scenario.id ? "bg-slate-900 ring-slate-900 shadow-[inset_0_0_0_3px_white]" : "ring-slate-300"}`}
              />
              {scenario.label}
            </button>
          ))}
        </div>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => reset(demoReactivity)}
        className={buttonStyles.secondary}
      >
        {resetResult.waiting ? "Resetting…" : "Reset to the brief's seed data"}
      </button>
      {(AsyncResult.isFailure(scenarioResult) || AsyncResult.isFailure(resetResult)) && (
        <p role="alert" className="text-sm text-rose-700">
          The demo action failed.
        </p>
      )}
    </section>
  )
}

/** Simulates the upstream status job for an open invoice. */
export function MarkOverdueButton({ invoiceId }: { readonly invoiceId: number }) {
  const [result, markOverdue] = useAtom(markOverdueAtom)
  return (
    <button
      type="button"
      disabled={result.waiting}
      onClick={() => markOverdue({ params: { invoiceId }, ...demoReactivity })}
      className="rounded-md border border-dashed border-slate-300 px-2 py-0.5 text-xs font-medium text-slate-600 hover:border-slate-400 hover:bg-slate-50 disabled:opacity-60"
    >
      Demo: mark overdue (status job)
    </button>
  )
}
