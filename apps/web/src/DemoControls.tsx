import { useAtom } from "@effect/atom-react"
import type { RoutingScenario } from "@payment-trigger/domain/Demo"
import type { InvoiceView } from "@payment-trigger/domain/Run"
import { AsyncResult } from "effect/reactivity"
import { demoReactivity, markOverdueAtom, resetAtom, routingScenarioAtom } from "./ApiClient.ts"

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

const buttonClass =
  "rounded border border-stone-300 bg-white px-3 py-1.5 text-sm hover:bg-stone-100 disabled:opacity-50 aria-pressed:border-stone-900 aria-pressed:bg-stone-900 aria-pressed:text-white"

export function DemoControls({ invoices }: { readonly invoices: ReadonlyArray<InvoiceView> }) {
  const [scenarioResult, setScenario] = useAtom(routingScenarioAtom)
  const [resetResult, reset] = useAtom(resetAtom)
  const active = activeScenario(invoices)
  const busy = scenarioResult.waiting || resetResult.waiting
  return (
    <section
      aria-labelledby="demo"
      className="space-y-3 rounded-lg border border-dashed border-stone-300 p-4"
    >
      <h2 id="demo" className="text-sm font-semibold">
        Demo controls{" "}
        <span className="font-normal text-stone-500">
          (change the data like upstream systems would; the trigger still has to be run)
        </span>
      </h2>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-stone-700">
          Bank accounts of Storage24 France SAS (Lyon):
        </span>
        {scenarios.map((scenario) => (
          <button
            key={scenario.id}
            type="button"
            aria-pressed={active === scenario.id}
            disabled={busy}
            onClick={() => setScenario({ payload: { scenario: scenario.id }, ...demoReactivity })}
            className={buttonClass}
          >
            {scenario.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => reset(demoReactivity)}
        className={buttonClass}
      >
        {resetResult.waiting ? "Resetting…" : "Reset to the brief's seed data"}
      </button>
      {(AsyncResult.isFailure(scenarioResult) || AsyncResult.isFailure(resetResult)) && (
        <p role="alert" className="text-sm text-red-700">
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
      className="rounded border border-dashed border-stone-400 px-2 py-0.5 text-xs text-stone-700 hover:bg-stone-100"
    >
      Demo: mark overdue (status job)
    </button>
  )
}
