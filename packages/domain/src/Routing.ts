import { Result, Schema } from "effect"
import { BankAccount, Customer, Invoice, LegalEntity, Park } from "./Models.ts"

/**
 * Where an invoice's money settles: invoice → park → legal entity → that
 * entity's bank account in the invoice currency. Parks in the same city can
 * belong to different legal entities, so neither the customer nor the city
 * says anything about the destination.
 */
export class Settlement extends Schema.TaggedClass<Settlement>()("Settlement", {
  park: Park,
  legalEntity: LegalEntity,
  bankAccount: BankAccount,
}) {}

export class ParkNotFound extends Schema.TaggedError<ParkNotFound>()("ParkNotFound", {
  parkId: Schema.Int,
}) {}

export class LegalEntityNotFound extends Schema.TaggedError<LegalEntityNotFound>()(
  "LegalEntityNotFound",
  { legalEntityId: Schema.Int },
) {}

export class NoSettlementAccount extends Schema.TaggedError<NoSettlementAccount>()(
  "NoSettlementAccount",
  { legalEntityId: Schema.Int, currency: Schema.String },
) {}

/** More than one candidate account: we never guess where money goes. */
export class AmbiguousSettlementAccount extends Schema.TaggedError<AmbiguousSettlementAccount>()(
  "AmbiguousSettlementAccount",
  { legalEntityId: Schema.Int, currency: Schema.String, bankAccountIds: Schema.Array(Schema.Int) },
) {}

export const RoutingError = Schema.Union([
  ParkNotFound,
  LegalEntityNotFound,
  NoSettlementAccount,
  AmbiguousSettlementAccount,
])
export type RoutingError = typeof RoutingError.Type

export interface RoutingData {
  readonly parks: ReadonlyArray<Park>
  readonly legalEntities: ReadonlyArray<LegalEntity>
  readonly bankAccounts: ReadonlyArray<BankAccount>
}

export const resolveSettlement = (
  invoice: Invoice,
  data: RoutingData,
): Result.Result<Settlement, RoutingError> => {
  const park = data.parks.find((candidate) => candidate.id === invoice.parkId)
  if (park === undefined) return Result.fail(new ParkNotFound({ parkId: invoice.parkId }))

  const legalEntity = data.legalEntities.find((candidate) => candidate.id === park.legalEntityId)
  if (legalEntity === undefined) {
    return Result.fail(new LegalEntityNotFound({ legalEntityId: park.legalEntityId }))
  }

  const candidates = data.bankAccounts.filter(
    (account) => account.legalEntityId === legalEntity.id && account.currency === invoice.currency,
  )
  const [bankAccount, ...others] = candidates
  if (bankAccount === undefined) {
    return Result.fail(
      new NoSettlementAccount({ legalEntityId: legalEntity.id, currency: invoice.currency }),
    )
  }
  if (others.length > 0) {
    return Result.fail(
      new AmbiguousSettlementAccount({
        legalEntityId: legalEntity.id,
        currency: invoice.currency,
        bankAccountIds: candidates.map((account) => account.id),
      }),
    )
  }
  return Result.succeed(new Settlement({ park, legalEntity, bankAccount }))
}

/** Exactly the input of `createStripePaymentLink` from the brief's stub spec. */
export class PaymentLinkParams extends Schema.Class<PaymentLinkParams>("PaymentLinkParams")({
  invoiceId: Schema.Int,
  amountCents: Schema.Int,
  currency: Schema.String,
  customerEmail: Schema.String,
  stripeCustomerId: Schema.NullOr(Schema.String),
  settlementBankAccountId: Schema.Int,
}) {}

/**
 * A missing Stripe customer id is passed through as null: the hosted checkout
 * creates (or matches) the Stripe customer from the email.
 */
export const paymentLinkParams = (
  invoice: Invoice,
  customer: Customer,
  settlement: Settlement,
): PaymentLinkParams =>
  new PaymentLinkParams({
    invoiceId: invoice.id,
    amountCents: invoice.amountCents,
    currency: invoice.currency,
    customerEmail: customer.email,
    stripeCustomerId: customer.stripeCustomerId,
    settlementBankAccountId: settlement.bankAccount.id,
  })

export const RoutingResult = Schema.Union([Settlement, RoutingError])
export type RoutingResult = typeof RoutingResult.Type
