import { Array, DateTime, Option, Order, Schema } from "effect"
import { Invoice, InvoiceStatus, StatusChange } from "./Models.ts"

/**
 * Why an invoice does or does not qualify for a payment link right now.
 *
 * The trigger is a *recorded* change into `overdue` (from any other status, or
 * from none). The due date alone never triggers: the status history is the
 * system of record, and paid or void invoices are past due too.
 */
export class Triggered extends Schema.TaggedClass<Triggered>()("Triggered", {
  change: StatusChange,
}) {}

/** Entered overdue at some point, but has since moved on (paid, void, reopened). */
export class Superseded extends Schema.TaggedClass<Superseded>()("Superseded", {
  change: StatusChange,
  currentStatus: InvoiceStatus,
}) {}

/** Never entered overdue. `pastDue` flags an open invoice whose due date has passed anyway. */
export class NeverOverdue extends Schema.TaggedClass<NeverOverdue>()("NeverOverdue", {
  status: InvoiceStatus,
  pastDue: Schema.Boolean,
}) {}

/** The status snapshot and the history disagree, so neither can be trusted to trigger. */
export class Inconsistent extends Schema.TaggedClass<Inconsistent>()("Inconsistent", {
  snapshotStatus: InvoiceStatus,
  latestHistoryStatus: Schema.NullOr(InvoiceStatus),
}) {}

export const TriggerDecision = Schema.Union([Triggered, Superseded, NeverOverdue, Inconsistent])
export type TriggerDecision = typeof TriggerDecision.Type

/** A change that moves an invoice into `overdue`. `overdue → overdue` rows are not an entry. */
export const entersOverdue = (change: StatusChange): boolean =>
  change.newStatus === "overdue" && change.oldStatus !== "overdue"

const byOccurrence = Order.combine(
  Order.mapInput(Order.String, (change: StatusChange) => change.changedAt),
  Order.mapInput(Order.Number, (change: StatusChange) => change.id),
)

/** True once the whole due date has passed: an invoice due on the 15th is past due from the 16th. */
export const isPastDue = (invoice: Invoice, asOf: DateTime.Utc): boolean =>
  DateTime.isGreaterThanOrEqualTo(
    asOf,
    DateTime.add(DateTime.makeUnsafe(invoice.dueDate), { days: 1 }),
  )

export const evaluateInvoice = (
  invoice: Invoice,
  history: ReadonlyArray<StatusChange>,
  asOf: DateTime.Utc,
): TriggerDecision => {
  const ordered = Array.sort(
    history.filter((change) => change.invoiceId === invoice.id),
    byOccurrence,
  )
  const latest = Array.last(ordered)
  const latestStatus = Option.getOrNull(Option.map(latest, (change) => change.newStatus))
  if (latestStatus !== invoice.status) {
    return new Inconsistent({ snapshotStatus: invoice.status, latestHistoryStatus: latestStatus })
  }

  const lastEntry = Array.findLast(ordered, entersOverdue)
  if (Option.isNone(lastEntry)) {
    return new NeverOverdue({
      status: invoice.status,
      pastDue: invoice.status === "open" && isPastDue(invoice, asOf),
    })
  }
  return invoice.status === "overdue"
    ? new Triggered({ change: lastEntry.value })
    : new Superseded({ change: lastEntry.value, currentStatus: invoice.status })
}
