import { InvoiceNotFound, InvoiceNotOpen, type RoutingScenario } from "@payment-trigger/domain/Demo"
import { InvoiceStatus } from "@payment-trigger/domain/Models"
import { Context, DateTime, Effect, Layer, Schema } from "effect"
import { SqlClient, SqlSchema } from "effect/sql"
import seedSql from "../migrations/0002_seed.sql?raw"
import { sqlStatements } from "./SqlScript.ts"

/** Tables in delete order (children first). The brief's tables are re-seeded afterwards. */
const resetOrder = [
  "stripe_stub_calls",
  "trigger_decisions",
  "payment_links",
  "trigger_runs",
  "payment_status_history",
  "invoices",
  "customers",
  "parks",
  "bank_accounts",
  "legal_entities",
] as const

/**
 * Reviewer controls. They change data the way upstream systems would (a status
 * job marking an invoice overdue, finance editing bank accounts); the trigger
 * itself is unchanged and still has to be run.
 */
export class Demo extends Context.Service<Demo>()("payment-trigger/api/Demo", {
  make: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    const findStatus = SqlSchema.findAll({
      Request: Schema.Int,
      Result: Schema.Struct({ status: InvoiceStatus }),
      execute: (id) => sql`SELECT status FROM invoices WHERE id = ${id}`,
    })

    /**
     * Simulates the status job. Two statements, no transaction (D1 has none): if the
     * second fails, history and snapshot disagree and the trigger refuses the invoice
     * as inconsistent, which is the safe direction.
     */
    const markOverdue = Effect.fn("Demo.markOverdue")(function* (invoiceId: number) {
      const [row] = yield* findStatus(invoiceId).pipe(Effect.orDie)
      if (row === undefined) return yield* new InvoiceNotFound({ invoiceId })
      if (row.status !== "open") return yield* new InvoiceNotOpen({ invoiceId, status: row.status })
      const now = DateTime.formatIso(yield* DateTime.now)
      yield* sql`INSERT INTO payment_status_history (invoice_id, old_status, new_status, changed_at)
                 VALUES (${invoiceId}, 'open', 'overdue', ${now})`.pipe(Effect.orDie)
      yield* sql`UPDATE invoices SET status = 'overdue' WHERE id = ${invoiceId} AND status = 'open'`.pipe(
        Effect.orDie,
      )
    })

    const setRoutingScenario = Effect.fn("Demo.setRoutingScenario")(function* (
      scenario: RoutingScenario,
    ) {
      yield* sql`DELETE FROM bank_accounts WHERE id = 4`
      yield* sql`UPDATE bank_accounts SET currency = ${scenario === "no-eur-account" ? "USD" : "EUR"}
                 WHERE id = 3`
      if (scenario === "two-eur-accounts") {
        yield* sql`INSERT INTO bank_accounts (id, legal_entity_id, iban, bank_name, currency)
                   VALUES (4, 3, 'FR76 1027 8060 0000 0202 0280 160', 'Crédit Mutuel', 'EUR')`
      }
    }, Effect.orDie)

    const reset = Effect.fn("Demo.reset")(function* () {
      for (const table of resetOrder) yield* sql.unsafe(`DELETE FROM ${table}`)
      for (const statement of sqlStatements(seedSql)) yield* sql.unsafe(statement)
    }, Effect.orDie)

    return { markOverdue, setRoutingScenario, reset }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
