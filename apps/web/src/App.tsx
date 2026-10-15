import { useAtomValue } from "@effect/atom-react"
import type { Invoice } from "@payment-trigger/domain/Models"
import { AsyncResult } from "effect/reactivity"
import { ApiClient } from "./ApiClient.ts"

const invoicesAtom = ApiClient.query("invoices", "list", {})

const formatAmount = (invoice: Invoice) =>
  new Intl.NumberFormat("en", { style: "currency", currency: invoice.currency }).format(
    invoice.amountCents / 100,
  )

export function App() {
  const invoices = useAtomValue(invoicesAtom)

  return (
    <main className="mx-auto max-w-5xl p-8">
      <h1 className="text-2xl font-semibold">Payment trigger</h1>
      <p className="mt-1 text-sm text-stone-600">Invoices loaded from the database seed.</p>
      <section className="mt-6">
        {AsyncResult.builder(invoices)
          .onInitial(() => <p className="text-stone-500">Loading…</p>)
          .onFailure((cause) => (
            <p role="alert" className="text-red-700">
              Could not load invoices: {String(cause)}
            </p>
          ))
          .onSuccess((rows) => (
            <table className="w-full border-collapse text-left text-sm">
              <thead className="border-b border-stone-300 text-stone-500">
                <tr>
                  <th className="py-2">Invoice</th>
                  <th>Status</th>
                  <th>Amount</th>
                  <th>Due</th>
                  <th>Customer</th>
                  <th>Park</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((invoice) => (
                  <tr key={invoice.id} className="border-b border-stone-200">
                    <td className="py-2 font-mono">{invoice.id}</td>
                    <td>{invoice.status}</td>
                    <td>{formatAmount(invoice)}</td>
                    <td>{invoice.dueDate}</td>
                    <td>{invoice.customerId}</td>
                    <td>{invoice.parkId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))
          .render()}
      </section>
    </main>
  )
}
