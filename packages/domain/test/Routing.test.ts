import { describe, expect, it } from "@effect/vitest"
import { Result } from "effect"
import { BankAccount, Customer, Invoice, LegalEntity, Park } from "../src/Models.ts"
import {
  AmbiguousSettlementAccount,
  LegalEntityNotFound,
  NoSettlementAccount,
  PaymentLinkParams,
  ParkNotFound,
  paymentLinkParams,
  resolveSettlement,
} from "../src/Routing.ts"
import * as Seed from "./seed.ts"

const seedData = {
  parks: Seed.parks,
  legalEntities: Seed.legalEntities,
  bankAccounts: Seed.bankAccounts,
}

// Ids deliberately all different: in the seed, bank account ids equal legal entity ids,
// so passing the entity id where the account id belongs would go unnoticed.
const park = new Park({ id: 7, name: "Park", city: "Basel", country: "CH", legalEntityId: 40 })
const entity = new LegalEntity({ id: 40, name: "Entity", country: "CH" })
const account = (id: number, currency: string, legalEntityId = 40) =>
  new BankAccount({ id, legalEntityId, iban: `CH00 ${id}`, bankName: "Bank", currency })
const invoiceAt = (parkId: number, currency = "CHF") =>
  new Invoice({
    id: 5000,
    customerId: 1,
    parkId,
    amountCents: 100,
    currency,
    status: "overdue",
    createdAt: "2026-09-01",
    dueDate: "2026-09-15",
  })

describe("resolveSettlement", () => {
  it("routes 1002 via park 11 to München Süd GmbH and its Commerzbank account (#2)", () => {
    const settlement = Result.getOrThrow(resolveSettlement(Seed.invoice(1002), seedData))
    expect(settlement.park.id).toBe(11)
    expect(settlement.legalEntity.name).toBe("Storage24 München Süd GmbH")
    expect(settlement.bankAccount.id).toBe(2)
    expect(settlement.bankAccount.bankName).toBe("Commerzbank")
  })

  it("routes by the invoice's park, not the customer: 1001 (same customer, park 10) goes to account #1", () => {
    expect(Result.getOrThrow(resolveSettlement(Seed.invoice(1001), seedData)).bankAccount.id).toBe(
      1,
    )
  })

  it("returns the bank account id, not the legal entity id", () => {
    const data = { parks: [park], legalEntities: [entity], bankAccounts: [account(900, "CHF")] }
    const settlement = Result.getOrThrow(resolveSettlement(invoiceAt(7), data))
    expect(settlement.legalEntity.id).toBe(40)
    expect(settlement.bankAccount.id).toBe(900)
  })

  it("picks the entity's account in the invoice currency", () => {
    const data = {
      parks: [park],
      legalEntities: [entity],
      bankAccounts: [account(900, "EUR"), account(901, "CHF"), account(902, "CHF", 41)],
    }
    expect(Result.getOrThrow(resolveSettlement(invoiceAt(7, "CHF"), data)).bankAccount.id).toBe(901)
  })

  it("fails when the entity has no account in the invoice currency", () => {
    const data = { parks: [park], legalEntities: [entity], bankAccounts: [account(900, "EUR")] }
    expect(resolveSettlement(invoiceAt(7, "CHF"), data)).toEqual(
      Result.fail(new NoSettlementAccount({ legalEntityId: 40, currency: "CHF" })),
    )
  })

  it("fails instead of guessing when several accounts match", () => {
    const data = {
      parks: [park],
      legalEntities: [entity],
      bankAccounts: [account(900, "CHF"), account(901, "CHF")],
    }
    expect(resolveSettlement(invoiceAt(7), data)).toEqual(
      Result.fail(
        new AmbiguousSettlementAccount({
          legalEntityId: 40,
          currency: "CHF",
          bankAccountIds: [900, 901],
        }),
      ),
    )
  })

  it("fails on a missing park or legal entity", () => {
    expect(
      resolveSettlement(invoiceAt(8), { parks: [park], legalEntities: [entity], bankAccounts: [] }),
    ).toEqual(Result.fail(new ParkNotFound({ parkId: 8 })))
    expect(
      resolveSettlement(invoiceAt(7), { parks: [park], legalEntities: [], bankAccounts: [] }),
    ).toEqual(Result.fail(new LegalEntityNotFound({ legalEntityId: 40 })))
  })
})

describe("paymentLinkParams", () => {
  it("builds exactly the stub input for 1002", () => {
    const settlement = Result.getOrThrow(resolveSettlement(Seed.invoice(1002), seedData))
    const customer = Seed.customers.find((candidate) => candidate.id === 100) as Customer
    expect(paymentLinkParams(Seed.invoice(1002), customer, settlement)).toEqual(
      new PaymentLinkParams({
        invoiceId: 1002,
        amountCents: 24000,
        currency: "EUR",
        customerEmail: "anna.keller@example.com",
        stripeCustomerId: "cus_A1B2C3",
        settlementBankAccountId: 2,
      }),
    )
  })

  it("sends the bank account id as settlementBankAccountId, never the legal entity id", () => {
    const data = { parks: [park], legalEntities: [entity], bankAccounts: [account(900, "CHF")] }
    const settlement = Result.getOrThrow(resolveSettlement(invoiceAt(7), data))
    const customer = new Customer({
      id: 1,
      fullName: "Test",
      email: "test@example.com",
      stripeCustomerId: null,
    })
    expect(paymentLinkParams(invoiceAt(7), customer, settlement).settlementBankAccountId).toBe(900)
  })

  it("passes a missing Stripe customer through as null (1003's customer)", () => {
    const settlement = Result.getOrThrow(resolveSettlement(Seed.invoice(1003), seedData))
    const customer = Seed.customers.find((candidate) => candidate.id === 101) as Customer
    const params = paymentLinkParams(Seed.invoice(1003), customer, settlement)
    expect(params.stripeCustomerId).toBeNull()
    expect(params.customerEmail).toBe("marc.petit@example.fr")
    expect(params.settlementBankAccountId).toBe(3)
  })
})
