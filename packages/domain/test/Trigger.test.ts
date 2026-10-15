import { describe, expect, it } from "@effect/vitest"
import { DateTime, Result, Schema } from "effect"
import { Invoice, StatusChange } from "../src/Models.ts"
import {
  evaluateInvoice,
  Inconsistent,
  NeverOverdue,
  Superseded,
  Triggered,
} from "../src/Trigger.ts"
import { history, invoice } from "./seed.ts"

// The case study's "today". Passed in explicitly so nothing depends on the wall clock.
const asOf = DateTime.makeUnsafe("2026-10-15T12:00:00Z")

const change = (
  id: number,
  oldStatus: StatusChange["oldStatus"],
  newStatus: StatusChange["newStatus"],
  changedAt: string,
) => new StatusChange({ id, invoiceId: 1, oldStatus, newStatus, changedAt })

const fixture = (status: Invoice["status"], dueDate = "2026-09-01") =>
  new Invoice({
    id: 1,
    customerId: 1,
    parkId: 1,
    amountCents: 100,
    currency: "EUR",
    status,
    createdAt: "2026-08-01",
    dueDate,
  })

describe("evaluateInvoice on the seed", () => {
  it("1002 triggers on its recorded open → overdue change (history #4)", () => {
    const decision = evaluateInvoice(invoice(1002), history, asOf)
    expect(decision).toBeInstanceOf(Triggered)
    expect((decision as Triggered).change.id).toBe(4)
  })

  it("1001 (paid) never went overdue, so no link", () => {
    expect(evaluateInvoice(invoice(1001), history, asOf)).toEqual(
      new NeverOverdue({ status: "paid", pastDue: false }),
    )
  })

  it("1004 (void) never went overdue, so no link even though its due date passed", () => {
    expect(evaluateInvoice(invoice(1004), history, asOf)).toEqual(
      new NeverOverdue({ status: "void", pastDue: false }),
    )
  })

  it("1003 is past due but has no recorded overdue change: flagged, not triggered", () => {
    expect(evaluateInvoice(invoice(1003), history, asOf)).toEqual(
      new NeverOverdue({ status: "open", pastDue: true }),
    )
  })
})

describe("evaluateInvoice edge cases", () => {
  it("an invoice created directly as overdue triggers", () => {
    const created = change(1, null, "overdue", "2026-09-02T00:00:00Z")
    expect(evaluateInvoice(fixture("overdue"), [created], asOf)).toEqual(
      new Triggered({ change: created }),
    )
  })

  it("overdue then paid before processing is superseded", () => {
    const overdue = change(2, "open", "overdue", "2026-09-02T00:00:00Z")
    const decision = evaluateInvoice(
      fixture("paid"),
      [
        change(1, null, "open", "2026-08-01T00:00:00Z"),
        overdue,
        change(3, "overdue", "paid", "2026-09-03T00:00:00Z"),
      ],
      asOf,
    )
    expect(decision).toEqual(new Superseded({ change: overdue, currentStatus: "paid" }))
  })

  it("re-entering overdue triggers on the latest entry, not the first", () => {
    const second = change(4, "open", "overdue", "2026-10-02T00:00:00Z")
    const decision = evaluateInvoice(
      fixture("overdue"),
      [
        change(1, null, "open", "2026-08-01T00:00:00Z"),
        change(2, "open", "overdue", "2026-09-02T00:00:00Z"),
        change(3, "overdue", "open", "2026-09-10T00:00:00Z"),
        second,
      ],
      asOf,
    )
    expect(decision).toEqual(new Triggered({ change: second }))
  })

  it("orders history by time, not by insertion order", () => {
    const entry = change(2, "open", "overdue", "2026-09-02T00:00:00Z")
    const decision = evaluateInvoice(
      fixture("overdue"),
      [entry, change(1, null, "open", "2026-08-01T00:00:00Z")],
      asOf,
    )
    expect(decision).toEqual(new Triggered({ change: entry }))
  })

  it("a snapshot that disagrees with the latest history row is inconsistent, not a trigger", () => {
    const decision = evaluateInvoice(
      fixture("overdue"),
      [change(1, null, "open", "2026-08-01T00:00:00Z")],
      asOf,
    )
    expect(decision).toEqual(
      new Inconsistent({ snapshotStatus: "overdue", latestHistoryStatus: "open" }),
    )
  })

  it("an invoice without any history is inconsistent", () => {
    expect(evaluateInvoice(fixture("open"), [], asOf)).toEqual(
      new Inconsistent({ snapshotStatus: "open", latestHistoryStatus: null }),
    )
  })

  it("the due date itself is not past due; the day after is", () => {
    const open = [change(1, null, "open", "2026-08-01T00:00:00Z")]
    const onDueDate = DateTime.makeUnsafe("2026-09-01T23:59:00Z")
    const dayAfter = DateTime.makeUnsafe("2026-09-02T00:00:00Z")
    expect(evaluateInvoice(fixture("open"), open, onDueDate)).toEqual(
      new NeverOverdue({ status: "open", pastDue: false }),
    )
    expect(evaluateInvoice(fixture("open"), open, dayAfter)).toEqual(
      new NeverOverdue({ status: "open", pastDue: true }),
    )
  })

  it("orders by actual instant even when timestamps carry a UTC offset", () => {
    // 23:30Z on Sep 1 is after 01:00+02:00 on Sep 2 (= 23:00Z on Sep 1), but sorts before it as text.
    const first = change(1, null, "overdue", "2026-08-16T00:00:00Z")
    const reopened = change(2, "overdue", "open", "2026-09-02T01:00:00+02:00")
    const overdueAgain = change(3, "open", "overdue", "2026-09-01T23:30:00Z")
    expect(evaluateInvoice(fixture("overdue"), [first, reopened, overdueAgain], asOf)).toEqual(
      new Triggered({ change: overdueAgain }),
    )
  })

  it("rejects a history row whose timestamp is not an instant when decoding it", () => {
    const decoded = Schema.decodeUnknownResult(StatusChange)({
      id: 1,
      invoiceId: 1,
      oldStatus: null,
      newStatus: "open",
      changedAt: "yesterday-ish",
    })
    expect(Result.isFailure(decoded) && decoded.failure.message).toContain(
      "expected an ISO 8601 instant",
    )
  })
})
