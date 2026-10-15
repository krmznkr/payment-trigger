import { useAtom, useAtomValue } from "@effect/atom-react"
import { AsyncResult } from "effect/reactivity"
import { RunLog, StubCallLog } from "./Activity.tsx"
import { overviewAtom, runAtom, runRequest } from "./ApiClient.ts"
import { DemoControls } from "./DemoControls.tsx"
import { formatInstant } from "./format.ts"
import { InvoiceCard } from "./InvoiceCard.tsx"

function RunButton() {
  const [result, run] = useAtom(runAtom)
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => run(runRequest)}
        disabled={result.waiting}
        className="rounded bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
      >
        {result.waiting ? "Running…" : "Run trigger"}
      </button>
      {AsyncResult.isFailure(result) && (
        <span role="alert" className="text-sm text-red-700">
          Run failed. See the server logs.
        </span>
      )}
    </div>
  )
}

export function App() {
  const overview = useAtomValue(overviewAtom)

  return (
    <main className="mx-auto max-w-6xl space-y-8 p-6 md:p-10">
      <header className="space-y-3">
        <h1 className="text-2xl font-semibold">Overdue invoice → payment link</h1>
        <p className="max-w-3xl text-sm text-stone-700">
          A link is created when an invoice's status history records a change{" "}
          <strong>into overdue</strong> that has not been handled yet, and the invoice is still
          overdue. Money settles via{" "}
          <strong>
            invoice → park → legal entity → that entity's bank account in the invoice currency
          </strong>
          . Each invoice gets at most one link; rerunning never calls Stripe twice.
        </p>
        <RunButton />
      </header>

      {AsyncResult.builder(overview)
        .onInitial(() => <p className="text-stone-500">Loading…</p>)
        .onFailure(() => (
          <p role="alert" className="text-red-700">
            Could not load the overview.
          </p>
        ))
        .onSuccess((data) => (
          <>
            <DemoControls invoices={data.invoices} />
            <section aria-labelledby="runs" className="space-y-2">
              <h2 id="runs" className="text-lg font-semibold">
                Runs{" "}
                <span className="text-sm font-normal text-stone-500">
                  (as of {formatInstant(data.asOf)})
                </span>
              </h2>
              <RunLog runs={data.runs} />
            </section>
            <section aria-labelledby="invoices" className="space-y-4">
              <h2 id="invoices" className="text-lg font-semibold">
                Invoices
              </h2>
              {data.invoices.map((view) => (
                <InvoiceCard key={view.invoice.id} view={view} />
              ))}
            </section>
            <section aria-labelledby="stub" className="space-y-2">
              <h2 id="stub" className="text-lg font-semibold">
                Stripe stub calls
              </h2>
              <p className="text-sm text-stone-600">
                Logged by the mock <code>createStripePaymentLink</code>: exactly what it received
                and returned.
              </p>
              <StubCallLog calls={data.stubCalls} />
            </section>
          </>
        ))
        .render()}
    </main>
  )
}
