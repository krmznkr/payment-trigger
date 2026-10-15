import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import { Overview, RunSummary } from "./Run.ts"

export class TriggerGroup extends HttpApiGroup.make("trigger")
  .add(HttpApiEndpoint.get("overview", "/overview", { success: Overview }))
  .add(HttpApiEndpoint.post("run", "/runs", { success: RunSummary }))
  .prefix("/api") {}

export class SystemGroup extends HttpApiGroup.make("system").add(
  HttpApiEndpoint.get("health", "/api/health", { success: Schema.Struct({ ok: Schema.Boolean }) }),
) {}

export class Api extends HttpApi.make("payment-trigger").add(TriggerGroup).add(SystemGroup) {}
