import { useAtom, useAtomValue } from "@effect/atom-react"
import { AsyncResult } from "effect/reactivity"
import { RunLog, StubCallLog } from "./Activity.tsx"
import { overviewAtom, runAtom, runRequest } from "./ApiClient.ts"
import { DemoControls } from "./DemoControls.tsx"
import { formatInstant } from "./format.ts"
import { InvoiceCard } from "./InvoiceCard.tsx"
import { buttonStyles, Card } from "./ui.tsx"

function RunButton() {
  const [result, run] = useAtom(runAtom)
  return (
    <div className="flex items-center gap-3">
      {AsyncResult.isFailure(result) && (
        <span role="alert" className="text-sm text-rose-700">
          Run failed. See the server logs.
        </span>
      )}
      <button
        type="button"
        onClick={() => run(runRequest)}
        disabled={result.waiting}
        className={buttonStyles.primary}
      >
        {result.waiting ? "Running…" : "Run trigger"}
      </button>
    </div>
  )
}

const SectionTitle = ({ id, children }: { readonly id: string; readonly children: string }) => (
  <h2 id={id} className="text-sm font-semibold text-slate-900">
    {children}
  </h2>
)

export function App() {
  const overview = useAtomValue(overviewAtom)

  return (
    <div className="min-h-dvh">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div
              aria-hidden
              className="grid size-9 place-items-center rounded-lg bg-slate-900 text-white"
            >
              <svg
                viewBox="0 0 20 20"
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
              >
                <rect x="3" y="5" width="14" height="10" rx="2" />
                <path d="M3 8.5h14M6.5 12h3" strokeLinecap="round" />
              </svg>
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight">
                Overdue invoice → payment link
              </h1>
              <p className="text-xs text-slate-500">Collections · Stripe payment links (mocked)</p>
            </div>
          </div>
          <RunButton />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {AsyncResult.builder(overview)
          .onInitial(() => <p className="text-sm text-slate-500">Loading…</p>)
          .onFailure(() => (
            <p role="alert" className="text-sm text-rose-700">
              Could not load the overview.
            </p>
          ))
          .onSuccess((data) => (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
              <section aria-labelledby="invoices" className="min-w-0 space-y-4 lg:col-start-1">
                <SectionTitle id="invoices">Invoices</SectionTitle>
                {data.invoices.map((view) => (
                  <InvoiceCard key={view.invoice.id} view={view} />
                ))}
              </section>
              <aside className="space-y-6 lg:sticky lg:top-6 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
                <Card className="space-y-2 p-5">
                  <SectionTitle id="rule">How it decides</SectionTitle>
                  <p className="text-sm leading-relaxed text-slate-600">
                    A link is created when an invoice's status history records a change{" "}
                    <strong className="font-semibold text-slate-900">into overdue</strong> that has
                    not been handled yet, and the invoice is still overdue. Money settles via{" "}
                    <strong className="font-semibold text-slate-900">
                      invoice → park → legal entity → that entity's bank account in the invoice
                      currency
                    </strong>
                    . Each invoice gets at most one link; rerunning never calls Stripe twice.
                  </p>
                </Card>
                <Card className="p-5">
                  <DemoControls invoices={data.invoices} />
                </Card>
                <Card>
                  <section aria-labelledby="runs">
                    <div className="flex items-baseline justify-between gap-2 border-b border-slate-100 px-5 py-3">
                      <SectionTitle id="runs">Runs</SectionTitle>
                      <span className="text-xs text-slate-500 tabular-nums">
                        as of {formatInstant(data.asOf)}
                      </span>
                    </div>
                    <RunLog runs={data.runs} />
                  </section>
                </Card>
              </aside>
              <section aria-labelledby="stub" className="min-w-0 space-y-2 lg:col-start-1">
                <div>
                  <SectionTitle id="stub">Stripe stub calls</SectionTitle>
                  <p className="text-sm text-slate-500">
                    Logged by the mock{" "}
                    <code className="font-mono text-[13px]">createStripePaymentLink</code>: exactly
                    what it received and returned.
                  </p>
                </div>
                <Card>
                  <StubCallLog calls={data.stubCalls} />
                </Card>
              </section>
            </div>
          ))
          .render()}
      </main>
    </div>
  )
}
