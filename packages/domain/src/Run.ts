import { Schema } from "effect"
import { Customer, Invoice, StatusChange } from "./Models.ts"
import { PaymentLinkParams, RoutingResult } from "./Routing.ts"
import { TriggerDecision } from "./Trigger.ts"

/** Recorded once per history row; the row is then no longer "new". */
export const FinalOutcome = Schema.Literals([
  "link_created",
  "already_linked",
  "superseded",
  "not_a_trigger",
])
export type FinalOutcome = typeof FinalOutcome.Type

/** Not recorded: the invoice's new rows are evaluated again on the next run. */
export const RetryableOutcome = Schema.Literals([
  "inconsistent",
  "routing_failed",
  "customer_missing",
  "invalid_params",
  "stub_failed",
  "in_progress",
  "changed_during_run",
])
export type RetryableOutcome = typeof RetryableOutcome.Type

export const Outcome = Schema.Union([FinalOutcome, RetryableOutcome])
export type Outcome = typeof Outcome.Type

export class InvoiceOutcome extends Schema.Class<InvoiceOutcome>("InvoiceOutcome")({
  invoiceId: Schema.Int,
  outcome: Outcome,
  detail: Schema.NullOr(Schema.String),
}) {}

export class RunSummary extends Schema.Class<RunSummary>("RunSummary")({
  runId: Schema.Int,
  startedAt: Schema.String,
  finishedAt: Schema.String,
  newChanges: Schema.Int,
  outcomes: Schema.Array(InvoiceOutcome),
  /** Invoices with new changes left for the next run because of the per-run cap. */
  deferredInvoices: Schema.Int,
}) {}

export class CreatedPaymentLink extends Schema.Class<CreatedPaymentLink>("CreatedPaymentLink")({
  url: Schema.String,
  stripePaymentLinkId: Schema.String,
}) {}

export class PaymentLink extends Schema.Class<PaymentLink>("PaymentLink")({
  invoiceId: Schema.Int,
  triggerChangeId: Schema.Int,
  idempotencyKey: Schema.String,
  params: PaymentLinkParams,
  state: Schema.Literals(["pending", "created"]),
  claimedAt: Schema.String,
  stripePaymentLinkId: Schema.NullOr(Schema.String),
  url: Schema.NullOr(Schema.String),
  createdAt: Schema.NullOr(Schema.String),
  createdByRunId: Schema.NullOr(Schema.Int),
}) {}

export class StubCall extends Schema.Class<StubCall>("StubCall")({
  id: Schema.Int,
  invoiceId: Schema.Int,
  idempotencyKey: Schema.String,
  params: PaymentLinkParams,
  result: Schema.NullOr(CreatedPaymentLink),
  error: Schema.NullOr(Schema.String),
  calledAt: Schema.String,
}) {}

export class HistoryEntry extends Schema.Class<HistoryEntry>("HistoryEntry")({
  change: StatusChange,
  outcome: Schema.NullOr(FinalOutcome),
  runId: Schema.NullOr(Schema.Int),
}) {}

export class InvoiceView extends Schema.Class<InvoiceView>("InvoiceView")({
  invoice: Invoice,
  customer: Schema.NullOr(Customer),
  history: Schema.Array(HistoryEntry),
  decision: TriggerDecision,
  routing: RoutingResult,
  /** Why a routable trigger still cannot be sent (bad amount, email, missing customer). */
  paymentInputError: Schema.NullOr(Schema.String),
  link: Schema.NullOr(PaymentLink),
}) {}

export class Overview extends Schema.Class<Overview>("Overview")({
  asOf: Schema.String,
  invoices: Schema.Array(InvoiceView),
  runs: Schema.Array(RunSummary),
  stubCalls: Schema.Array(StubCall),
}) {}
