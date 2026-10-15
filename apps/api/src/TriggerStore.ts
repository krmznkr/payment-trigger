import {
  BankAccount,
  Customer,
  Invoice,
  LegalEntity,
  Park,
  StatusChange,
} from "@payment-trigger/domain/Models"
import { PaymentLinkParams } from "@payment-trigger/domain/Routing"
import {
  CreatedPaymentLink,
  FinalOutcome,
  PaymentLink,
  RunSummary,
  StubCall,
} from "@payment-trigger/domain/Run"
import { Context, Effect, Layer, Schema } from "effect"
import { SqlClient, SqlSchema } from "effect/sql"

/** Everything the trigger and the overview read. The dataset is tiny; see README for scaling. */
export interface Snapshot {
  readonly invoices: ReadonlyArray<Invoice>
  readonly history: ReadonlyArray<StatusChange>
  readonly customers: ReadonlyArray<Customer>
  readonly parks: ReadonlyArray<Park>
  readonly legalEntities: ReadonlyArray<LegalEntity>
  readonly bankAccounts: ReadonlyArray<BankAccount>
  readonly decisions: ReadonlyArray<Decision>
  readonly links: ReadonlyArray<PaymentLink>
}

export class Decision extends Schema.Class<Decision>("Decision")({
  changeId: Schema.Int,
  invoiceId: Schema.Int,
  outcome: FinalOutcome,
  runId: Schema.Int,
}) {}

const LinkRow = Schema.Struct({
  ...PaymentLink.fields,
  params: Schema.fromJsonString(PaymentLinkParams),
})

const StubCallRow = Schema.Struct({
  ...StubCall.fields,
  params: Schema.fromJsonString(PaymentLinkParams),
  result: Schema.NullOr(Schema.fromJsonString(CreatedPaymentLink)),
})

const RunRow = Schema.Struct({ summary: Schema.fromJsonString(RunSummary) })

const ClaimedRow = Schema.Struct({ invoiceId: Schema.Int })

const encodeJson = <S extends Schema.Top>(schema: S, value: S["Type"]) =>
  Schema.encodeEffect(Schema.fromJsonString(schema))(value)

export class TriggerStore extends Context.Service<TriggerStore>()(
  "payment-trigger/api/TriggerStore",
  {
    make: Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient

      const all = <S extends Schema.Top>(Result: S, query: string) =>
        SqlSchema.findAll({ Request: Schema.Void, Result, execute: () => sql.unsafe(query) })(
          undefined,
        )

      const loadSnapshot = Effect.fn("TriggerStore.loadSnapshot")(function* () {
        const [invoices, history, customers, parks, legalEntities, bankAccounts, decisions, links] =
          yield* Effect.all([
            all(Invoice, "SELECT * FROM invoices ORDER BY id"),
            all(StatusChange, "SELECT * FROM payment_status_history ORDER BY id"),
            all(Customer, "SELECT * FROM customers ORDER BY id"),
            all(Park, "SELECT * FROM parks ORDER BY id"),
            all(LegalEntity, "SELECT * FROM legal_entities ORDER BY id"),
            all(BankAccount, "SELECT * FROM bank_accounts ORDER BY id"),
            all(Decision, "SELECT * FROM trigger_decisions ORDER BY change_id"),
            all(LinkRow, "SELECT *, params_json AS params FROM payment_links ORDER BY invoice_id"),
          ])
        return {
          invoices,
          history,
          customers,
          parks,
          legalEntities,
          bankAccounts,
          decisions,
          links: links.map((row) => new PaymentLink(row)),
        } satisfies Snapshot
      })

      const recentRuns = Effect.fn("TriggerStore.recentRuns")(function* (limit: number) {
        const rows = yield* SqlSchema.findAll({
          Request: Schema.Int,
          Result: RunRow,
          execute: (n) =>
            sql`SELECT summary_json AS summary FROM trigger_runs
                WHERE summary_json IS NOT NULL ORDER BY id DESC LIMIT ${n}`,
        })(limit)
        return rows.map((row) => row.summary)
      })

      const stubCalls = Effect.fn("TriggerStore.stubCalls")(function* () {
        const rows = yield* all(
          StubCallRow,
          `SELECT id, invoice_id, idempotency_key, params_json AS params,
                  result_json AS result, error, called_at
           FROM stripe_stub_calls ORDER BY id`,
        )
        return rows.map((row) => new StubCall(row))
      })

      const startRun = Effect.fn("TriggerStore.startRun")(function* (startedAt: string) {
        const [row] = yield* sql<{
          readonly id: number
        }>`INSERT INTO trigger_runs (started_at) VALUES (${startedAt}) RETURNING id`
        if (row === undefined) return yield* Effect.die("trigger_runs insert returned no id")
        return row.id
      })

      const finishRun = Effect.fn("TriggerStore.finishRun")(function* (summary: RunSummary) {
        const json = yield* encodeJson(RunSummary, summary)
        yield* sql`UPDATE trigger_runs SET finished_at = ${summary.finishedAt}, summary_json = ${json}
                   WHERE id = ${summary.runId}`
      })

      /**
       * Idempotent: a row already decided keeps its decision. Multi-row inserts, at most
       * 20 rows (100 bound parameters, D1's limit) per statement, to save D1 queries.
       */
      const recordDecisions = Effect.fn("TriggerStore.recordDecisions")(function* (
        decisions: ReadonlyArray<Decision>,
        decidedAt: string,
      ) {
        for (let start = 0; start < decisions.length; start += 20) {
          const rows = decisions.slice(start, start + 20).map((decision) => ({
            change_id: decision.changeId,
            invoice_id: decision.invoiceId,
            outcome: decision.outcome,
            run_id: decision.runId,
            decided_at: decidedAt,
          }))
          yield* sql`INSERT INTO trigger_decisions ${sql.insert(rows)} ON CONFLICT (change_id) DO NOTHING`
        }
      })

      /**
       * Atomically claims the invoice's single payment link, but only while the invoice
       * is still overdue *now*: the run decided from a snapshot that may be stale (e.g.
       * paid in the meantime). Only the caller that gets `true` may call Stripe. One
       * statement, because D1 has no interactive transactions.
       */
      const claimLink = Effect.fn("TriggerStore.claimLink")(function* (claim: {
        readonly invoiceId: number
        readonly triggerChangeId: number
        readonly idempotencyKey: string
        readonly params: PaymentLinkParams
        readonly claimedAt: string
      }) {
        const params = yield* encodeJson(PaymentLinkParams, claim.params)
        const rows = yield* SqlSchema.findAll({
          Request: Schema.Void,
          Result: ClaimedRow,
          execute: () =>
            sql`INSERT INTO payment_links
                  (invoice_id, trigger_change_id, idempotency_key, params_json, state, claimed_at)
                SELECT ${claim.invoiceId}, ${claim.triggerChangeId}, ${claim.idempotencyKey},
                       ${params}, 'pending', ${claim.claimedAt}
                WHERE EXISTS (SELECT 1 FROM invoices WHERE id = ${claim.invoiceId} AND status = 'overdue')
                ON CONFLICT (invoice_id) DO NOTHING
                RETURNING invoice_id`,
        })(undefined)
        return rows.length === 1
      })

      /** Takes over a pending claim whose holder stopped renewing it (crashed or timed out). */
      const reclaimStale = Effect.fn("TriggerStore.reclaimStale")(function* (
        invoiceId: number,
        staleBefore: string,
        claimedAt: string,
      ) {
        const rows = yield* SqlSchema.findAll({
          Request: Schema.Void,
          Result: ClaimedRow,
          execute: () =>
            sql`UPDATE payment_links SET claimed_at = ${claimedAt}
                WHERE invoice_id = ${invoiceId} AND state = 'pending' AND claimed_at < ${staleBefore}
                  AND EXISTS (SELECT 1 FROM invoices WHERE id = ${invoiceId} AND status = 'overdue')
                RETURNING invoice_id`,
        })(undefined)
        return rows.length === 1
      })

      /** Gives a claim back after an observed failure so the next run retries immediately. */
      const releaseClaim = (invoiceId: number) =>
        sql`UPDATE payment_links SET claimed_at = '1970-01-01T00:00:00.000Z'
            WHERE invoice_id = ${invoiceId} AND state = 'pending'`.pipe(
          Effect.asVoid,
          Effect.withSpan("TriggerStore.releaseClaim"),
        )

      const completeLink = (
        invoiceId: number,
        link: CreatedPaymentLink,
        createdAt: string,
        runId: number,
      ) =>
        sql`UPDATE payment_links
            SET state = 'created', url = ${link.url},
                stripe_payment_link_id = ${link.stripePaymentLinkId}, created_at = ${createdAt},
                created_by_run_id = ${runId}
            WHERE invoice_id = ${invoiceId}`.pipe(
          Effect.asVoid,
          Effect.withSpan("TriggerStore.completeLink"),
        )

      const findLink = Effect.fn("TriggerStore.findLink")(function* (invoiceId: number) {
        const rows = yield* SqlSchema.findAll({
          Request: Schema.Int,
          Result: LinkRow,
          execute: (id) =>
            sql`SELECT *, params_json AS params FROM payment_links WHERE invoice_id = ${id}`,
        })(invoiceId)
        const [row] = rows
        return row === undefined ? undefined : new PaymentLink(row)
      })

      const logStubCall = Effect.fn("TriggerStore.logStubCall")(function* (call: {
        readonly idempotencyKey: string
        readonly params: PaymentLinkParams
        readonly result: CreatedPaymentLink | null
        readonly error: string | null
        readonly calledAt: string
      }) {
        const params = yield* encodeJson(PaymentLinkParams, call.params)
        const result =
          call.result === null ? null : yield* encodeJson(CreatedPaymentLink, call.result)
        yield* sql`INSERT INTO stripe_stub_calls
                     (invoice_id, idempotency_key, params_json, result_json, error, called_at)
                   VALUES (${call.params.invoiceId}, ${call.idempotencyKey}, ${params}, ${result},
                           ${call.error}, ${call.calledAt})`
      })

      return {
        loadSnapshot,
        recentRuns,
        stubCalls,
        startRun,
        finishRun,
        recordDecisions,
        claimLink,
        reclaimStale,
        releaseClaim,
        completeLink,
        findLink,
        logStubCall,
      }
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make)
}
