import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import { Invoice } from "./Models.ts"

export class InvoicesGroup extends HttpApiGroup.make("invoices")
  .add(HttpApiEndpoint.get("list", "/", { success: Schema.Array(Invoice) }))
  .prefix("/api/invoices") {}

export class SystemGroup extends HttpApiGroup.make("system").add(
  HttpApiEndpoint.get("health", "/api/health", { success: Schema.Struct({ ok: Schema.Boolean }) }),
) {}

export class Api extends HttpApi.make("payment-trigger").add(InvoicesGroup).add(SystemGroup) {}
