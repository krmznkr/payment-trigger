import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import { InvoiceNotFound, InvoiceNotOpen, RoutingScenario } from "./Demo.ts"
import { Overview, RunSummary } from "./Run.ts"

export class TriggerGroup extends HttpApiGroup.make("trigger")
  .add(HttpApiEndpoint.get("overview", "/overview", { success: Overview }))
  .add(HttpApiEndpoint.post("run", "/runs", { success: RunSummary }))
  .prefix("/api") {}

/** Controls for reviewers. They change the demo data, never the trigger logic. */
export class DemoGroup extends HttpApiGroup.make("demo")
  .add(
    HttpApiEndpoint.post("markOverdue", "/invoices/:invoiceId/mark-overdue", {
      params: { invoiceId: Schema.NumberFromString },
      error: [InvoiceNotFound, InvoiceNotOpen],
    }),
  )
  .add(
    HttpApiEndpoint.post("setRoutingScenario", "/routing-scenario", {
      payload: Schema.Struct({ scenario: RoutingScenario }),
    }),
  )
  .add(HttpApiEndpoint.post("reset", "/reset"))
  .prefix("/api/demo") {}

export class SystemGroup extends HttpApiGroup.make("system").add(
  HttpApiEndpoint.get("health", "/api/health", { success: Schema.Struct({ ok: Schema.Boolean }) }),
) {}

export class Api extends HttpApi.make("payment-trigger")
  .add(TriggerGroup)
  .add(DemoGroup)
  .add(SystemGroup) {}
