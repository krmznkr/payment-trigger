import { Invoice } from "@payment-trigger/domain/Models"
import { Context, Effect, Layer, Schema } from "effect"
import { SqlClient, SqlSchema } from "effect/sql"

export class InvoiceRepo extends Context.Service<InvoiceRepo>()("payment-trigger/api/InvoiceRepo", {
  make: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    const list = SqlSchema.findAll({
      Request: Schema.Void,
      Result: Invoice,
      execute: () => sql`SELECT * FROM invoices ORDER BY id`,
    })

    return { list: () => list(undefined) }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
