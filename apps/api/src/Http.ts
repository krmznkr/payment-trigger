import { Api } from "@payment-trigger/domain/Api"
import { Effect, Layer } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { StripePaymentLinks } from "./StripePaymentLinks.ts"
import { TriggerRun } from "./TriggerRun.ts"
import { TriggerStore } from "./TriggerStore.ts"

const TriggerHandlers = HttpApiBuilder.group(
  Api,
  "trigger",
  Effect.fn(function* (handlers) {
    const trigger = yield* TriggerRun
    return handlers
      .handle("overview", () => trigger.overview().pipe(Effect.orDie))
      .handle("run", () => trigger.run().pipe(Effect.orDie))
  }),
)

const SystemHandlers = HttpApiBuilder.group(Api, "system", (handlers) =>
  handlers.handle("health", () => Effect.succeed({ ok: true })),
)

export const ServicesLayer = TriggerRun.layer.pipe(
  Layer.provide(StripePaymentLinks.mock),
  Layer.provideMerge(TriggerStore.layer),
)

export const ApiLayer = HttpApiBuilder.layer(Api).pipe(
  Layer.provide([TriggerHandlers, SystemHandlers]),
  Layer.provide(ServicesLayer),
)
