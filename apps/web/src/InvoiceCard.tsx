import type { ReactNode } from "react"
import type { InvoiceStatus } from "@payment-trigger/domain/Models"
import type { InvoiceView } from "@payment-trigger/domain/Run"
import { MarkOverdueButton } from "./DemoControls.tsx"
import { explainInvoice, explainRoutingError, outcomeLabel, type Tone } from "./explain.ts"
import { formatInstant, invoiceAmount } from "./format.ts"
import { Card, Label } from "./ui.tsx"

const statusBadge: Record<InvoiceStatus, string> = {
  open: "bg-sky-50 text-sky-700 ring-sky-600/20",
  overdue: "bg-amber-50 text-amber-800 ring-amber-600/25",
  paid: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  void: "bg-slate-100 text-slate-600 ring-slate-500/20",
}

const verdictStyles: Record<Tone, { readonly panel: string; readonly dot: string }> = {
  trigger: { panel: "border-emerald-500 bg-emerald-50/60", dot: "bg-emerald-500" },
  none: { panel: "border-slate-300 bg-slate-50", dot: "bg-slate-400" },
  flag: { panel: "border-amber-500 bg-amber-50/70", dot: "bg-amber-500" },
}

const StatusBadge = ({ status }: { readonly status: InvoiceStatus }) => (
  <span
    className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${statusBadge[status]}`}
  >
    {status}
  </span>
)

const Connector = () => (
  <svg
    aria-hidden
    viewBox="0 0 16 16"
    className="size-4 shrink-0 rotate-90 text-slate-400 md:rotate-0"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
  >
    <path d="M3 8h10m-4-4 4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

function Routing({ view }: { readonly view: InvoiceView }) {
  const routing = view.routing
  if (routing._tag !== "Settlement") {
    return (
      <p
        role="alert"
        className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-600/20 ring-inset"
      >
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
    <ol
      className="flex flex-col gap-1.5 md:flex-row md:items-stretch md:gap-2"
      aria-label="Settlement route"
    >
      {steps.map((step, index) => {
        const destination = index === steps.length - 1
        return (
          <li
            key={step.kind}
            className="flex min-w-0 flex-col items-start gap-1.5 md:flex-row md:items-center md:gap-2"
          >
            {index > 0 && <Connector />}
            <div
              className={`w-full min-w-0 self-stretch rounded-lg px-3 py-2 ring-1 ring-inset md:h-full ${destination ? "bg-slate-900 text-white ring-slate-900" : "bg-white ring-slate-200"}`}
            >
              <div
                className={`text-[11px] font-medium tracking-wide uppercase ${destination ? "text-slate-300" : "text-slate-500"}`}
              >
                {destination ? "Settles into · " : ""}
                {step.kind}
              </div>
              <div className="text-sm font-medium">{step.title}</div>
              <div
                className={`font-mono text-xs wrap-break-word ${destination ? "text-slate-300" : "text-slate-500"}`}
              >
                {step.sub}
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function Link({ view }: { readonly view: InvoiceView }) {
  const link = view.link
  if (link === null) {
    return (
      <p className="text-sm text-slate-600">
        {view.decision._tag === "Triggered" ? "None yet. Run the trigger to create it." : "None."}
      </p>
    )
  }
  const rows: ReadonlyArray<readonly [string, ReactNode, boolean]> = [
    ["State", link.state, false],
    ["URL", link.url ?? "—", true],
    ["Stripe id", link.stripePaymentLinkId ?? "—", true],
    ["Settles into", `bank account #${link.params.settlementBankAccountId}`, false],
    ["Triggered by", `history #${link.triggerChangeId}`, false],
    ["Idempotency key", link.idempotencyKey, true],
    ["Created", link.createdAt === null ? "—" : formatInstant(link.createdAt), false],
  ]
  return (
    <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
      {rows.map(([term, value, mono]) => (
        <div key={term} className="contents">
          <dt className="text-slate-500">{term}</dt>
          <dd
            className={mono ? "font-mono text-[13px] break-all text-slate-800" : "text-slate-800"}
          >
            {value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function History({ view }: { readonly view: InvoiceView }) {
  return (
    <ol className="space-y-1.5 text-sm">
      {view.history.map(({ change, outcome, runId }) => (
        <li key={change.id} className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-2">
          <span className="font-mono text-xs leading-5 text-slate-400">#{change.id}</span>
          <div className="min-w-0">
            <div className="text-slate-800">
              {change.oldStatus ?? "—"} →{" "}
              <strong className="font-semibold">{change.newStatus}</strong>
              <span className="ml-2 text-xs text-slate-500 tabular-nums">
                {formatInstant(change.changedAt)}
              </span>
            </div>
            <div className="text-xs text-slate-500">
              {outcome === null ? (
                <em>not handled yet</em>
              ) : (
                `run #${runId}: ${outcomeLabel[outcome]}`
              )}
            </div>
          </div>
        </li>
      ))}
    </ol>
  )
}

export function InvoiceCard({ view }: { readonly view: InvoiceView }) {
  const { invoice, customer } = view
  const verdict = explainInvoice(view)
  const tone = verdictStyles[verdict.tone]
  return (
    <article aria-labelledby={`invoice-${invoice.id}`} data-testid={`invoice-${invoice.id}`}>
      <Card className="overflow-hidden">
        <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 px-5 pt-5">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h3 id={`invoice-${invoice.id}`} className="text-base font-semibold tracking-tight">
                Invoice <span className="font-mono">{invoice.id}</span>
              </h3>
              <StatusBadge status={invoice.status} />
              {invoice.status === "open" && <MarkOverdueButton invoiceId={invoice.id} />}
            </div>
            <p className="text-sm text-slate-600">
              {customer === null
                ? `customer ${invoice.customerId} missing`
                : `${customer.fullName} · ${customer.email}`}
              {customer !== null && (
                <span className="text-slate-500">
                  {" "}
                  · Stripe customer:{" "}
                  {customer.stripeCustomerId === null ? (
                    <em>none yet</em>
                  ) : (
                    <span className="font-mono text-[13px]">{customer.stripeCustomerId}</span>
                  )}
                </span>
              )}
            </p>
          </div>
          <div className="sm:text-right">
            <div className="text-lg font-semibold tabular-nums">{invoiceAmount(invoice)}</div>
            <div className="text-xs text-slate-500 tabular-nums">due {invoice.dueDate}</div>
          </div>
        </header>

        <div className="space-y-4 px-5 pt-4 pb-5">
          <div className={`rounded-lg border-l-4 px-4 py-3 ${tone.panel}`} data-testid="verdict">
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <span aria-hidden className={`size-2 shrink-0 rounded-full ${tone.dot}`} />
              {verdict.headline}
            </p>
            <p className="mt-1 text-sm text-slate-700">{verdict.reason}</p>
          </div>

          <section className="space-y-2">
            <Label>Money routes to</Label>
            <Routing view={view} />
          </section>
        </div>

        <div className="grid gap-5 border-t border-slate-100 bg-slate-50/70 px-5 py-4 lg:grid-cols-2">
          <section className="min-w-0 space-y-2">
            <Label>Payment link</Label>
            <div data-testid="payment-link">
              <Link view={view} />
            </div>
          </section>
          <section className="min-w-0 space-y-2">
            <Label>Status history</Label>
            <History view={view} />
          </section>
        </div>
      </Card>
    </article>
  )
}
