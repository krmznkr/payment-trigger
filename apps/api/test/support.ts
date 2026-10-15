import { SqliteClient } from "@effect/sql-sqlite-node"
import { Effect, Layer, String } from "effect"
import { SqlClient } from "effect/sql"
import { TestClock } from "effect/testing"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { StripePaymentLinks } from "../src/StripePaymentLinks.ts"
import { TriggerRun } from "../src/TriggerRun.ts"
import { TriggerStore } from "../src/TriggerStore.ts"

const migrationsDir = join(import.meta.dirname, "..", "migrations")

/** Applies the same migration files the deploy applies to D1. */
const migrate = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  for (const file of readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    const statements = readFileSync(join(migrationsDir, file), "utf8")
      .replace(/--.*$/gm, "")
      .split(";")
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0)
    for (const statement of statements) yield* sql.unsafe(statement)
  }
})

/** A fresh in-memory database per test, migrated and seeded. */
export const Database = Layer.effectDiscard(migrate).pipe(
  Layer.provideMerge(
    SqliteClient.layer({ filename: ":memory:", transformResultNames: String.snakeToCamel }),
  ),
)

/** The trigger with the given Stripe implementation (defaults to the logging mock). */
export const triggerLayer = (
  stripe: Layer.Layer<StripePaymentLinks, never, TriggerStore> = StripePaymentLinks.mock,
) =>
  TriggerRun.layer.pipe(
    Layer.provideMerge(stripe),
    Layer.provideMerge(TriggerStore.layer),
    Layer.provideMerge(Database),
  )

/** The case study's "today", so 1003 is past due regardless of when tests run. */
export const atCaseStudyToday = TestClock.setTime(Date.parse("2026-10-15T12:00:00Z"))
