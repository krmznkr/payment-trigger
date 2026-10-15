# payment-trigger — agent notes

Take-home case study: detect when an invoice should get a hosted payment link,
route the payment to the right bank account, call a mocked
`createStripePaymentLink`, and show the result in a React UI. Budget ~3h.
An honest "what I'd do next" beats a rushed finish.

## Hard rules

- **Anonymous.** No real names, emails, phone numbers, usernames or
  username-bearing paths anywhere: code, comments, docs, commits, UI, or chat
  output. Seed data from the brief (fictional customers on `example.com`) is fine.
- **No secrets in output.** `.env` holds `CLOUDFLARE_API_TOKEN`,
  `CLOUDFLARE_ACCOUNT_ID`, `ALCHEMY_PASSWORD`. Never print values. Inspect with
  `sed -E 's/=.*/=<redacted>/' .env`. The same three exist as GitHub Actions secrets.
- `brief.pdf` and `.env` are git-excluded (`.gitignore`). Keep it that way.
  They live in the main checkout, not in worktrees.
- **Always deploy with an explicit `--stage`.** Alchemy's default stage is
  `live_$USER` (deploy) / `dev_$USER` (dev), which leaks the OS username into
  resource names and URLs.
- Neutral naming only: `payment-trigger`. Avoid the hiring company's name
  outside seed data.
- Don't print Cloudflare account listings (other workers' names) or the
  browser-control `status` output (lists unrelated open tabs). Use a dedicated
  browser-control session for this project.
- Transcript export: the brief's export prompt redacts names, emails, keys and
  username paths. Also redact the Cloudflare worker-name list and the
  browser-control status dump from early in the first session.

## How we work

1. Deploy a thin version early, then add **one behaviour at a time, end to end**
   (domain → API → UI → test → browser check → commit).
2. Check real docs (`node_modules/*/` sources, alchemy.run, docs.stripe.com).
   Don't guess APIs.
3. Verify every behaviour **in the browser** (browser-control skill), not only tests.
4. **Ask the user on judgment calls**: trigger semantics, routing ambiguity, scope.
5. Infra timebox: if deploy isn't working ~45 min in, fall back to the simplest
   thing that deploys (or local only) and note it. Logic > plumbing.

## Learning more about Effect

This repository uses the Effect TypeScript library (v4, stable `effect@4.0.x`).

Before writing any Effect code, first read `node_modules/effect/AGENTS.md`
**completely**, and follow the links in the file when required.

If you need to learn more about particular Effect APIs and concepts that the
guide doesn't cover, search through the source code in `node_modules/effect/src`.

Conventions from that guide: `Effect.gen` / `Effect.fn("name")`;
`Context.Service` + static `layer`; `Schema.TaggedError` for errors; `Schema`
for all parsing (no manual predicates); `DateTime` instead of `Date`;
`@effect/vitest` `it.effect` for tests.

## Verified stack facts (Oct 2026)

| Thing | Fact |
|---|---|
| `effect` | 4.0.5 stable. Subpath modules: `effect/http`, `effect/http-api`, `effect/sql`, `effect/reactivity` (Atom, AtomHttpApi). |
| `@effect/platform-cloudflare` | **Not on npm.** Janitor uses a pkg.pr.new build. Not needed: alchemy's `Cloudflare.Worker` hosts Effect handlers. |
| `@effect/sql-d1` | 4.0.5 (also a dependency of alchemy). `alchemy/SQL/D1` wraps it. |
| `@effect/atom-react` | 4.0.5, React 19. |
| `@effect/vitest` | 4.0.5, peer `vitest >=5`. |
| `alchemy` | 2.0.0-beta.83 (Effect-native). `Alchemy.Stack`, `Cloudflare.Worker`, `Cloudflare.D1.Database({ migrations })`, `Cloudflare.Website.Vite`, `Cloudflare.state()`. Docs: https://alchemy.run/llms.txt |
| Alchemy state | Cloudflare remote state is already bootstrapped on the account. CI token needs **Secrets Store Write**. v2 docs don't mention `ALCHEMY_PASSWORD`. |
| workers.dev | On by default, URL `<worker-name>.<account-subdomain>.workers.dev`. The account subdomain was checked and contains no personal handle. |
| Reference repo | Effect-TS/janitor: pnpm + vite-plus (`vp check` = oxfmt + oxlint + typecheck), no turborepo, alchemy `Cloudflare.Worker` class form. |

## Layout and commands

- `packages/domain`: Schema models + the shared `HttpApi` contract (`Api.ts`).
- `apps/api`: D1 migrations (schema + seed, verbatim from the brief),
  repositories, handlers, `src/worker.ts` (plain `fetch` export building the
  Effect web handler with `@effect/sql-d1` over `env.DB`).
- `apps/web`: React + Vite + Tailwind v4. Data via `AtomHttpApi` +
  `@effect/atom-react`. `apps/web/worker.ts` re-exports the API worker as the
  deployed entry.
- `alchemy.run.ts`: D1 database + one `Cloudflare.Website.Vite` Worker with
  `runWorkerFirst: ["/api/*"]` and SPA fallback.

```sh
bun run check            # oxfmt --check, oxlint --deny-warnings, tsc per package
bun run test             # vitest
set -a; . <main checkout>/.env; set +a; CI=true bunx alchemy deploy --stage demo --yes
```

Gotchas: alchemy's CLI under Bun needs `@effect/platform-bun` and
`@effect/platform-node` installed (dev deps). `CI=true` avoids interactive
prompts. Seed lives in a migration, so it's applied once per database.

## Domain rules (confirmed with the user)

- **Trigger = any recorded status transition into `overdue`** (from any other status, or none) in
  `payment_status_history`, not the due date alone. At processing time the
  invoice snapshot must still be `overdue`. Otherwise the event is superseded.
- **"Just changed" = not yet handled**, not "recent in wall-clock time". 1002 went
  overdue in July and must still trigger. Each history row is evaluated once and
  recorded in a decisions table keyed by `history_id`. Use an anti-join, not a
  max-id cursor: ids don't guarantee commit order.
- **Routing:** invoice → park → legal entity → that entity's bank account whose
  currency equals the invoice currency. Zero or more than one match is a
  routing error, surfaced in the UI. Never guess where money settles.
- **One payment link per invoice** (`UNIQUE(invoice_id)`). Flow: claim a row
  (pending) → call stub with stable idempotency key `payment-link:invoice:<id>`
  → store url/id. Rerun reuses the row and never makes a second call. Pending
  rows that are too old are retried with the same key.
- Snapshot vs history disagreement is an anomaly: flag it, don't trigger.

## Seed-data traps (brief §4)

- **1002** (customer 100, park 11 "München Süd") is the real trigger
  (`open→overdue` 2026-07-16). It must route to **entity 2 / bank account 2
  (Commerzbank)**, not to the Nord entity, even though customer 100's other
  invoice (1001) is at park 10 (Nord) and both parks are in Munich.
- **1003** (park 12 Lyon, customer 101 with `stripe_customer_id = NULL`) is
  still `open` but its due date 2026-08-24 has passed. No overdue transition
  is recorded. Don't trigger. Show it as "past due, no overdue transition
  recorded". It would be the null-Stripe-customer path if it triggered.
- **1001** paid, **1004** void. Both are past due, so a due-date-only rule would
  misfire on them. Never trigger.
- Bank-account ids equal legal-entity ids (1,2,3) in the seed, so passing
  `legalEntityId` as `settlementBankAccountId` would pass seed-based tests.
  Tests must use fixtures with distinct ids.
- Every entity has exactly one EUR account in the seed, but the schema allows
  many per entity. Hence the currency match and the ambiguity error.

## Stripe facts (docs.stripe.com, checked)

- `POST /v1/payment_links` has **no `customer` / `customer_email`**. It has
  `customer_creation` (`always` | `if_required`). Checkout Sessions take
  `customer` / `customer_email` but expire within 30 min–24 h. The stub's
  params look like a Checkout Session; document this.
- Payment links are reusable. Limit them with
  `restrictions.completed_sessions.limit`. Deactivate with `active: false`. They
  have no expiry.
- `Idempotency-Key` header. Keys can be pruned after ≥24h. Reusing a key with
  different params errors. So the long-term duplicate guard must be our DB.
- `metadata` is copied to checkout sessions. `payment_intent_data.metadata`
  carries the invoice id to the PaymentIntent.
- Connect: `on_behalf_of`, `transfer_data.destination` route funds to a
  connected account. A settlement bank account likely maps to a per-entity
  Stripe account. This is an assumption.
- Webhooks: duplicates happen, ordering is not guaranteed, retries go on for up
  to 3 days. Dedupe by event id.

## Deliverables / done

- Live URL: every invoice shows why it did or didn't trigger and where the
  money routes. 1002 gets a link to account 2. A rerun creates no duplicates.
  1001/1003/1004 are handled sensibly.
- Tests + CI green. README, design note (receipt notification, webhook → status
  update), assumptions doc as PDF (brief §5 template), "what I'd do next".
- Nothing personal in the repo. The transcript is exported at the end with the
  brief's prompt.

## Decisions log

- Trigger: any change into `overdue` (user, step 0).
- Routing ambiguity: error, never guess (user).
- Demo controls (mark 1003 overdue, reset): include, keep small (user).
- Stage: `demo`. One Worker (API + assets) instead of Pages. No turborepo, no
  vite-plus. Dev-only SQLite driver allowed for SQL tests (user).
