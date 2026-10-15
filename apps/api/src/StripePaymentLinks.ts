import type { PaymentLinkParams } from "@payment-trigger/domain/Routing"
import { CreatedPaymentLink } from "@payment-trigger/domain/Run"
import { Context, DateTime, Effect, Layer, Schema } from "effect"
import { Hex } from "effect/encoding"
import { TriggerStore } from "./TriggerStore.ts"

export class StripeStubError extends Schema.TaggedError<StripeStubError>()("StripeStubError", {
  message: Schema.String,
}) {}

/**
 * `createStripePaymentLink` from the brief, plus the idempotency key the real
 * wrapper must send as Stripe's `Idempotency-Key` header. The brief's signature
 * has no slot for it; without one a retry after a timeout can create a second link.
 */
export class StripePaymentLinks extends Context.Service<
  StripePaymentLinks,
  {
    readonly create: (
      params: PaymentLinkParams,
      idempotencyKey: string,
    ) => Effect.Effect<CreatedPaymentLink, StripeStubError>
  }
>()("payment-trigger/api/StripePaymentLinks") {
  /**
   * The stub: returns a fake URL and logs its inputs, as the brief asks. The id is
   * derived from the idempotency key, so a retried call returns the same link,
   * like Stripe does within its idempotency window. `.invalid` is a reserved TLD.
   */
  static readonly mock = Layer.effect(
    StripePaymentLinks,
    Effect.gen(function* () {
      const store = yield* TriggerStore
      return StripePaymentLinks.of({
        create: Effect.fn("StripePaymentLinks.create")(function* (params, idempotencyKey) {
          const digest = yield* Effect.promise(() =>
            crypto.subtle.digest("SHA-256", new TextEncoder().encode(idempotencyKey)),
          )
          const id = `plink_mock_${Hex.encode(new Uint8Array(digest)).slice(0, 16)}`
          const link = new CreatedPaymentLink({
            url: `https://payments.invalid/mock/${id}`,
            stripePaymentLinkId: id,
          })
          yield* Effect.logInfo("createStripePaymentLink (mock)", { idempotencyKey, params })
          yield* store
            .logStubCall({
              idempotencyKey,
              params,
              result: link,
              error: null,
              calledAt: DateTime.formatIso(yield* DateTime.now),
            })
            .pipe(Effect.orDie)
          return link
        }),
      })
    }),
  )
}
