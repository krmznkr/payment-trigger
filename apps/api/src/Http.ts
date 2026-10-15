import { Api } from "@payment-trigger/domain/Api"
import { Effect, Layer } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { InvoiceRepo } from "./InvoiceRepo.ts"

const InvoicesHandlers = HttpApiBuilder.group(
  Api,
  "invoices",
  Effect.fn(function* (handlers) {
    const repo = yield* InvoiceRepo
    return handlers.handle("list", () => repo.list().pipe(Effect.orDie))
  }),
)

const SystemHandlers = HttpApiBuilder.group(Api, "system", (handlers) =>
  handlers.handle("health", () => Effect.succeed({ ok: true })),
)

export const ApiLayer = HttpApiBuilder.layer(Api).pipe(
  Layer.provide([InvoicesHandlers, SystemHandlers]),
  Layer.provide(InvoiceRepo.layer),
)
