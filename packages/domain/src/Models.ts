import { DateTime, Option, Schema } from "effect"

export const InvoiceStatus = Schema.Literals(["open", "overdue", "paid", "void"])
export type InvoiceStatus = typeof InvoiceStatus.Type

export class LegalEntity extends Schema.Class<LegalEntity>("LegalEntity")({
  id: Schema.Int,
  name: Schema.String,
  country: Schema.String,
}) {}

export class BankAccount extends Schema.Class<BankAccount>("BankAccount")({
  id: Schema.Int,
  legalEntityId: Schema.Int,
  iban: Schema.String,
  bankName: Schema.String,
  currency: Schema.String,
}) {}

export class Park extends Schema.Class<Park>("Park")({
  id: Schema.Int,
  name: Schema.String,
  city: Schema.String,
  country: Schema.String,
  legalEntityId: Schema.Int,
}) {}

export class Customer extends Schema.Class<Customer>("Customer")({
  id: Schema.Int,
  fullName: Schema.String,
  email: Schema.String,
  stripeCustomerId: Schema.NullOr(Schema.String),
}) {}

export class Invoice extends Schema.Class<Invoice>("Invoice")({
  id: Schema.Int,
  customerId: Schema.Int,
  parkId: Schema.Int,
  amountCents: Schema.Int,
  currency: Schema.String,
  status: InvoiceStatus,
  createdAt: Schema.String,
  dueDate: Schema.String,
}) {}

/**
 * An ISO 8601 instant, kept as the original text for display. Rows whose timestamp
 * cannot be parsed fail loudly at the boundary instead of being ordered as text.
 */
export const Instant = Schema.String.check(
  Schema.makeFilter(
    (text: string) => Option.isSome(DateTime.make(text)) || "expected an ISO 8601 instant",
  ),
)

export class StatusChange extends Schema.Class<StatusChange>("StatusChange")({
  id: Schema.Int,
  invoiceId: Schema.Int,
  oldStatus: Schema.NullOr(InvoiceStatus),
  newStatus: InvoiceStatus,
  changedAt: Instant,
}) {}
