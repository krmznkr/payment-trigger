import type { Invoice } from "@payment-trigger/domain/Models"

export const formatAmount = (amountCents: number, currency: string) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amountCents / 100)

export const invoiceAmount = (invoice: Invoice) =>
  formatAmount(invoice.amountCents, invoice.currency)

/** "2026-07-16T00:05:00Z" → "2026-07-16 00:05 UTC". */
export const formatInstant = (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`
