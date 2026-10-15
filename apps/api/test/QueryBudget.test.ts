import { expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { SqlClient } from "effect/sql"
import { StatementSync } from "node:sqlite"
import { TriggerRun } from "../src/TriggerRun.ts"
import { atCaseStudyToday, triggerLayer } from "./support.ts"

// Counts executed statements. Vitest runs each test file in its own context, so this
// patch does not leak into other files.
let executed = 0
for (const method of ["all", "run", "get", "iterate"] as const) {
  const original = StatementSync.prototype[method] as (...args: Array<unknown>) => unknown
  StatementSync.prototype[method] = function (this: StatementSync, ...args: Array<unknown>) {
    executed++
    return original.apply(this, args)
  } as never
}

/** D1 allows 1000 queries per Worker invocation on Workers Paid. */
const d1QueryLimit = 1000

it.effect("a run with a large backlog stays under D1's per-invocation query limit", () =>
  Effect.gen(function* () {
    yield* atCaseStudyToday
    const sql = yield* SqlClient.SqlClient
    for (let i = 0; i < 400; i++) {
      const id = 10_000 + i
      yield* sql`INSERT INTO invoices VALUES (${id}, 100, 11, 1000, 'EUR', 'overdue', '2026-07-01', '2026-07-15')`
      yield* sql`INSERT INTO payment_status_history (invoice_id, old_status, new_status, changed_at) VALUES
        (${id}, NULL, 'open', '2026-07-01T09:00:00Z'), (${id}, 'open', 'overdue', '2026-07-16T00:05:00Z')`
    }
    const trigger = yield* TriggerRun

    executed = 0
    const summary = yield* trigger.run()

    expect(summary.outcomes).toHaveLength(100)
    expect(summary.deferredInvoices).toBe(304)
    expect(executed).toBeLessThan(d1QueryLimit)
  }).pipe(Effect.provide(triggerLayer())),
)
