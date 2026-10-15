import type { RoutingError } from "@payment-trigger/domain/Routing"
import type { InvoiceView, Outcome } from "@payment-trigger/domain/Run"
import type { TriggerDecision } from "@payment-trigger/domain/Trigger"
import type { Invoice } from "@payment-trigger/domain/Models"
import { formatInstant } from "./format.ts"

export type Tone = "trigger" | "none" | "flag"

export interface Verdict {
  readonly tone: Tone
  readonly headline: string
  readonly reason: string
}

/** Plain-language reason for the trigger decision, for reviewers who don't read the code. */
export const explainDecision = (decision: TriggerDecision, invoice: Invoice): Verdict => {
  switch (decision._tag) {
    case "Triggered":
      return {
        tone: "trigger",
        headline: "Qualifies for a payment link",
        reason: `Entered overdue on ${formatInstant(decision.change.changedAt)} (history #${decision.change.id}: ${decision.change.oldStatus ?? "new"} → overdue) and is still overdue.`,
      }
    case "Superseded":
      return {
        tone: "none",
        headline: "No link: no longer overdue",
        reason: `Went overdue on ${formatInstant(decision.change.changedAt)} (history #${decision.change.id}) but is now ${decision.currentStatus}.`,
      }
    case "Inconsistent":
      return {
        tone: "flag",
        headline: "Not triggered: data is inconsistent",
        reason: `The invoice says "${decision.snapshotStatus}" but its latest history row says "${decision.latestHistoryStatus ?? "nothing"}". Nothing is sent until they agree.`,
      }
    case "NeverOverdue":
      if (decision.status === "paid") {
        return {
          tone: "none",
          headline: "No link: paid",
          reason: "Paid without ever going overdue.",
        }
      }
      if (decision.status === "void") {
        return {
          tone: "none",
          headline: "No link: void",
          reason: "Voided, so there is nothing to collect, even though the due date has passed.",
        }
      }
      if (decision.pastDue) {
        return {
          tone: "flag",
          headline: "Not triggered: past due, but no overdue change recorded",
          reason: `Due ${invoice.dueDate} and still "open". The trigger follows the recorded status history, not the calendar, so no link is sent. Worth checking why the status job never marked it overdue.`,
        }
      }
      return {
        tone: "none",
        headline: "No link: not due yet",
        reason: `Open and due ${invoice.dueDate}.`,
      }
  }
}

/** A trigger that cannot be routed is blocked, not "qualifying": say so in the verdict itself. */
export const explainInvoice = (view: InvoiceView): Verdict => {
  const verdict = explainDecision(view.decision, view.invoice)
  if (
    view.decision._tag !== "Triggered" ||
    view.routing._tag === "Settlement" ||
    view.link !== null
  ) {
    return verdict
  }
  return {
    tone: "flag",
    headline: "Qualifies, but blocked: the money cannot be routed",
    reason: `${verdict.reason} ${explainRoutingError(view.routing)} No link is created; the change stays unhandled and is retried on every run.`,
  }
}

export const explainRoutingError = (error: RoutingError): string => {
  switch (error._tag) {
    case "ParkNotFound":
      return `Park ${error.parkId} does not exist.`
    case "LegalEntityNotFound":
      return `Legal entity ${error.legalEntityId} does not exist.`
    case "NoSettlementAccount":
      return `Legal entity ${error.legalEntityId} has no ${error.currency} bank account.`
    case "AmbiguousSettlementAccount":
      return `Legal entity ${error.legalEntityId} has several ${error.currency} accounts (${error.bankAccountIds.join(", ")}); refusing to guess.`
  }
}

export const outcomeLabel: Record<Outcome, string> = {
  link_created: "link created",
  already_linked: "already had a link",
  superseded: "superseded",
  not_a_trigger: "not a trigger",
  inconsistent: "inconsistent data, will retry",
  routing_failed: "routing failed, will retry",
  customer_missing: "customer missing, will retry",
  stub_failed: "Stripe call failed, will retry",
  in_progress: "another run holds the claim",
}
