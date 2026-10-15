import type { ReactNode } from "react"
import type { InvoiceView } from "@payment-trigger/domain/Run"
import { MarkOverdueButton } from "./DemoControls.tsx"
import { explainInvoice, explainRoutingError, outcomeLabel, type Tone } from "./explain.ts"
import { formatInstant, invoiceAmount } from "./format.ts"

const toneStyles: Record<Tone, string> = {
  trigger: "border-emerald-300 bg-emerald-50 text-emerald-900",
  none: "border-stone-200 bg-stone-50 text-stone-700",
  flag: "border-amber-300 bg-amber-50 text-amber-900",
}

const Label = ({ children }: { readonly children: ReactNode }) => (
  <h4 className="text-xs font-semibold tracking-wide text-stone-500 uppercase">{children}</h4>
)

function Routing({ view }: { readonly view: InvoiceView }) {
  const routing = view.routing
  if (routing._tag !== "Settlement") {
    return (
      <p role="alert" className="text-sm text-red-700">
        Cannot route: {explainRoutingError(routing)}
      </p>
    )
  }
  const steps = [
    {
      kind: "Park",
      title: routing.park.name,
      sub: `#${routing.park.id} · ${routing.park.city}, ${routing.park.country}`,
    },
    {
      kind: "Legal entity",
      title: routing.legalEntity.name,
      sub: `#${routing.legalEntity.id} · ${routing.legalEntity.country}`,
    },
    {
      kind: "Bank account",
      title: `${routing.bankAccount.bankName} · ${routing.bankAccount.currency}`,
      sub: `#${routing.bankAccount.id} · ${routing.bankAccount.iban}`,
    },
  ]
  return (
    <ol className="flex flex-wrap items-stretch gap-2 text-sm" aria-label="Settlement route">
      {steps.map((step, index) => (
        <li key={step.kind} className="flex items-center gap-2">
          {index > 0 && (
            <span aria-hidden className="text-stone-400">
              →
            </span>
          )}
          <div className="rounded border border-stone-200 bg-white px-3 py-1.5">
            <div className="text-xs text-stone-500">{step.kind}</div>
            <div className="font-medium">{step.title}</div>
            <div className="font-mono text-xs text-stone-500">{step.sub}</div>
          </div>
        </li>
      ))}
    </ol>
  )
}

function Link({ view }: { readonly view: InvoiceView }) {
  const link = view.link
  if (link === null) {
    return (
      <p className="text-sm text-stone-600">
        {view.decision._tag === "Triggered" ? "None yet. Run the trigger to create it." : "None."}
      </p>
    )
  }
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
      <dt className="text-stone-500">State</dt>
      <dd>{link.state}</dd>
      <dt className="text-stone-500">URL</dt>
      <dd className="font-mono break-all">{link.url ?? "—"}</dd>
      <dt className="text-stone-500">Stripe id</dt>
      <dd className="font-mono">{link.stripePaymentLinkId ?? "—"}</dd>
      <dt className="text-stone-500">Settles into</dt>
      <dd>bank account #{link.params.settlementBankAccountId}</dd>
      <dt className="text-stone-500">Triggered by</dt>
      <dd>history #{link.triggerChangeId}</dd>
      <dt className="text-stone-500">Idempotency key</dt>
      <dd className="font-mono">{link.idempotencyKey}</dd>
      <dt className="text-stone-500">Created</dt>
      <dd>{link.createdAt === null ? "—" : formatInstant(link.createdAt)}</dd>
    </dl>
  )
}

export function InvoiceCard({ view }: { readonly view: InvoiceView }) {
  const { invoice, customer } = view
  const verdict = explainInvoice(view)
  return (
    <article
      aria-labelledby={`invoice-${invoice.id}`}
      data-testid={`invoice-${invoice.id}`}
      className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm"
    >
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h3 id={`invoice-${invoice.id}`} className="font-mono text-lg font-semibold">
          Invoice {invoice.id}
        </h3>
        <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium">
          {invoice.status}
        </span>
        <span className="font-medium">{invoiceAmount(invoice)}</span>
        <span className="text-sm text-stone-600">due {invoice.dueDate}</span>
        <span className="text-sm text-stone-600">
          {customer === null
            ? `customer ${invoice.customerId} missing`
            : `${customer.fullName} · ${customer.email}`}
          {customer !== null && (
            <> · Stripe customer: {customer.stripeCustomerId ?? <em>none yet</em>}</>
          )}
        </span>
        {invoice.status === "open" && <MarkOverdueButton invoiceId={invoice.id} />}
      </header>

      <div
        className={`mt-4 rounded border px-4 py-3 ${toneStyles[verdict.tone]}`}
        data-testid="verdict"
      >
        <p className="font-semibold">{verdict.headline}</p>
        <p className="mt-0.5 text-sm">{verdict.reason}</p>
      </div>

      <section className="mt-4">
        <Label>Money routes to</Label>
        <div className="mt-2">
          <Routing view={view} />
        </div>
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section>
          <Label>Payment link</Label>
          <div className="mt-2" data-testid="payment-link">
            <Link view={view} />
          </div>
        </section>
        <section>
          <Label>Status history</Label>
          <table className="mt-2 w-full text-left text-sm">
            <tbody>
              {view.history.map(({ change, outcome, runId }) => (
                <tr key={change.id} className="border-t border-stone-100">
                  <td className="py-1 pr-3 font-mono text-stone-500">#{change.id}</td>
                  <td className="pr-3">{formatInstant(change.changedAt)}</td>
                  <td className="pr-3">
                    {change.oldStatus ?? "—"} → <strong>{change.newStatus}</strong>
                  </td>
                  <td className="text-stone-600">
                    {outcome === null ? (
                      <em>not handled yet</em>
                    ) : (
                      `run #${runId}: ${outcomeLabel[outcome]}`
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </article>
  )
}
