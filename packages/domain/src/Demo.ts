import { Schema } from "effect"
import { InvoiceStatus } from "./Models.ts"

/** Bank-account setups for Storage24 France SAS (legal entity 3), to show routing failures. */
export const RoutingScenario = Schema.Literals(["seed", "no-eur-account", "two-eur-accounts"])
export type RoutingScenario = typeof RoutingScenario.Type

export class InvoiceNotFound extends Schema.TaggedError<InvoiceNotFound>()(
  "InvoiceNotFound",
  { invoiceId: Schema.Int },
  { httpApiStatus: 404 },
) {}

/** Only an open invoice can be moved to overdue by the simulated status job. */
export class InvoiceNotOpen extends Schema.TaggedError<InvoiceNotOpen>()(
  "InvoiceNotOpen",
  { invoiceId: Schema.Int, status: InvoiceStatus },
  { httpApiStatus: 409 },
) {}
