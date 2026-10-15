import { Api } from "@payment-trigger/domain/Api"
import { Config, Effect, Layer } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { Demo } from "./Demo.ts"
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

const DemoHandlers = HttpApiBuilder.group(
  Api,
  "demo",
  Effect.fn(function* (handlers) {
    const demo = yield* Demo
    return handlers
      .handle("markOverdue", ({ params }) => demo.markOverdue(params.invoiceId))
      .handle("setRoutingScenario", ({ payload }) => demo.setRoutingScenario(payload.scenario))
      .handle("reset", () => demo.reset())
  }),
)

/** The deployed commit, so CI can wait until the build it tests is the one serving. */
const buildVersion = Config.String("BUILD_VERSION").pipe(Config.withDefault("dev"))

const SystemHandlers = HttpApiBuilder.group(
  Api,
  "system",
  Effect.fn(function* (handlers) {
    const version = yield* buildVersion
    return handlers.handle("health", () => Effect.succeed({ ok: true, version }))
  }),
)

export const ServicesLayer = Layer.mergeAll(TriggerRun.layer, Demo.layer).pipe(
  Layer.provide(StripePaymentLinks.mock),
  Layer.provideMerge(TriggerStore.layer),
)

export const ApiLayer = HttpApiBuilder.layer(Api).pipe(
  Layer.provide([TriggerHandlers, DemoHandlers, SystemHandlers]),
  Layer.provide(ServicesLayer),
)
