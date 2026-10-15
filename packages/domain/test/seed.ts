// The brief's seed data (section 4), as domain values.
import { BankAccount, Customer, Invoice, LegalEntity, Park, StatusChange } from "../src/Models.ts"

export const legalEntities = [
  new LegalEntity({ id: 1, name: "Storage24 München Nord GmbH", country: "DE" }),
  new LegalEntity({ id: 2, name: "Storage24 München Süd GmbH", country: "DE" }),
  new LegalEntity({ id: 3, name: "Storage24 France SAS", country: "FR" }),
]

export const bankAccounts = [
  new BankAccount({
    id: 1,
    legalEntityId: 1,
    iban: "DE12 5001 0517 0001234567",
    bankName: "Deutsche Bank",
    currency: "EUR",
  }),
  new BankAccount({
    id: 2,
    legalEntityId: 2,
    iban: "DE44 7002 0270 0009876543",
    bankName: "Commerzbank",
    currency: "EUR",
  }),
  new BankAccount({
    id: 3,
    legalEntityId: 3,
    iban: "FR76 3000 6000 0112345678901",
    bankName: "Société Générale",
    currency: "EUR",
  }),
]

export const parks = [
  new Park({
    id: 10,
    name: "Storage24 München Nord",
    city: "Munich",
    country: "DE",
    legalEntityId: 1,
  }),
  new Park({
    id: 11,
    name: "Storage24 München Süd",
    city: "Munich",
    country: "DE",
    legalEntityId: 2,
  }),
  new Park({ id: 12, name: "Storage24 Lyon", city: "Lyon", country: "FR", legalEntityId: 3 }),
]

export const customers = [
  new Customer({
    id: 100,
    fullName: "Anna Keller",
    email: "anna.keller@example.com",
    stripeCustomerId: "cus_A1B2C3",
  }),
  new Customer({
    id: 101,
    fullName: "Marc Petit",
    email: "marc.petit@example.fr",
    stripeCustomerId: null,
  }),
  new Customer({
    id: 102,
    fullName: "Julia Wagner",
    email: "julia.wagner@example.com",
    stripeCustomerId: "cus_D4E5F6",
  }),
]

export const invoices = [
  new Invoice({
    id: 1001,
    customerId: 100,
    parkId: 10,
    amountCents: 15000,
    currency: "EUR",
    status: "paid",
    createdAt: "2026-06-01",
    dueDate: "2026-06-15",
  }),
  new Invoice({
    id: 1002,
    customerId: 100,
    parkId: 11,
    amountCents: 24000,
    currency: "EUR",
    status: "overdue",
    createdAt: "2026-07-01",
    dueDate: "2026-07-15",
  }),
  new Invoice({
    id: 1003,
    customerId: 101,
    parkId: 12,
    amountCents: 18000,
    currency: "EUR",
    status: "open",
    createdAt: "2026-08-10",
    dueDate: "2026-08-24",
  }),
  new Invoice({
    id: 1004,
    customerId: 102,
    parkId: 10,
    amountCents: 9800,
    currency: "EUR",
    status: "void",
    createdAt: "2026-05-20",
    dueDate: "2026-06-03",
  }),
]

export const history = [
  new StatusChange({
    id: 1,
    invoiceId: 1001,
    oldStatus: null,
    newStatus: "open",
    changedAt: "2026-06-01T09:00:00Z",
  }),
  new StatusChange({
    id: 2,
    invoiceId: 1001,
    oldStatus: "open",
    newStatus: "paid",
    changedAt: "2026-06-10T14:32:00Z",
  }),
  new StatusChange({
    id: 3,
    invoiceId: 1002,
    oldStatus: null,
    newStatus: "open",
    changedAt: "2026-07-01T09:00:00Z",
  }),
  new StatusChange({
    id: 4,
    invoiceId: 1002,
    oldStatus: "open",
    newStatus: "overdue",
    changedAt: "2026-07-16T00:05:00Z",
  }),
  new StatusChange({
    id: 5,
    invoiceId: 1003,
    oldStatus: null,
    newStatus: "open",
    changedAt: "2026-08-10T09:00:00Z",
  }),
  new StatusChange({
    id: 6,
    invoiceId: 1004,
    oldStatus: null,
    newStatus: "open",
    changedAt: "2026-05-20T09:00:00Z",
  }),
  new StatusChange({
    id: 7,
    invoiceId: 1004,
    oldStatus: "open",
    newStatus: "void",
    changedAt: "2026-05-25T11:00:00Z",
  }),
]

export const invoice = (id: number): Invoice => {
  const found = invoices.find((candidate) => candidate.id === id)
  if (found === undefined) throw new Error(`No seed invoice ${id}`)
  return found
}
