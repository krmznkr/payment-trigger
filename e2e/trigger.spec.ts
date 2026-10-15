import { expect, test, type Locator, type Page } from "@playwright/test"

const expected1002 = {
  invoiceId: 1002,
  amountCents: 24000,
  currency: "EUR",
  customerEmail: "anna.keller@example.com",
  stripeCustomerId: "cus_A1B2C3",
  settlementBankAccountId: 2,
}

const expected1003 = {
  invoiceId: 1003,
  amountCents: 18000,
  currency: "EUR",
  customerEmail: "marc.petit@example.fr",
  stripeCustomerId: null,
  settlementBankAccountId: 3,
}

const card = (page: Page, invoiceId: number) => page.getByTestId(`invoice-${invoiceId}`)
const runs = (page: Page) => page.getByTestId("run-log").getByRole("listitem")
const stubCalls = (page: Page) => page.getByTestId("stub-calls").getByRole("listitem")
const stubParams = async (call: Locator) =>
  JSON.parse(await call.locator("pre").first().innerText())

/**
 * Clicks "Run trigger", waits for the run request itself to finish, then for the new
 * run to appear in the log (not for text that may already be there).
 */
const runTrigger = async (page: Page) => {
  const before = await runs(page).count()
  const response = page.waitForResponse(
    (candidate) => candidate.url().endsWith("/api/runs") && candidate.request().method() === "POST",
  )
  await page.getByRole("button", { name: "Run trigger" }).click()
  expect((await response).ok()).toBe(true)
  await expect(runs(page)).toHaveCount(before + 1)
  return runs(page).first()
}

test.beforeEach(async ({ request, page }) => {
  expect((await request.post("/api/demo/reset")).ok()).toBe(true)
  await page.goto("/")
  await expect(page.getByText("No runs yet.")).toBeVisible()
})

test.afterAll(async ({ request }) => {
  // Leave the shared demo on the brief's seed data for reviewers.
  await request.post("/api/demo/reset")
})

test("explains every seed invoice before anything runs", async ({ page }) => {
  await expect(card(page, 1002).getByTestId("verdict")).toContainText(
    "Qualifies for a payment link",
  )
  await expect(card(page, 1002).getByTestId("verdict")).toContainText("history #4")
  const route1002 = card(page, 1002).getByRole("list", { name: "Settlement route" })
  await expect(route1002).toContainText("Storage24 München Süd GmbH")
  await expect(route1002).toContainText("Commerzbank")
  await expect(route1002).toContainText("#2 · DE44 7002 0270 0009876543")

  await expect(card(page, 1001).getByTestId("verdict")).toContainText("No link: paid")
  await expect(card(page, 1004).getByTestId("verdict")).toContainText("No link: void")
  await expect(card(page, 1003).getByTestId("verdict")).toContainText(
    "past due, but no overdue change recorded",
  )
  await expect(page.getByText("The stub has not been called.")).toBeVisible()
})

test("1002 gets one link routed to account 2, and a rerun never calls the stub again", async ({
  page,
}) => {
  const first = await runTrigger(page)
  await expect(first).toContainText("1002: link created")
  await expect(stubCalls(page)).toHaveCount(1)
  expect(await stubParams(stubCalls(page).first())).toEqual(expected1002)

  const link = card(page, 1002).getByTestId("payment-link")
  await expect(link).toContainText("bank account #2")
  await expect(link).toContainText("history #4")
  const linkText = await link.innerText()

  const second = await runTrigger(page)
  await expect(second).toContainText("0 new status changes · nothing to do")
  await expect(stubCalls(page)).toHaveCount(1)
  expect(await link.innerText()).toBe(linkText)
})

test("1003 marked overdue gets a link on account 3 without a Stripe customer", async ({ page }) => {
  await runTrigger(page)
  const c1003 = card(page, 1003)
  await c1003.getByRole("button", { name: /mark overdue/ }).click()
  await expect(c1003.getByTestId("verdict")).toContainText("Qualifies for a payment link")

  const run = await runTrigger(page)
  await expect(run).toContainText("1 new status change · 1003: link created")
  await expect(stubCalls(page)).toHaveCount(2)
  expect(await stubParams(stubCalls(page).nth(1))).toEqual(expected1003)
  await expect(c1003.getByTestId("payment-link")).toContainText("bank account #3")
})

test("an unroutable trigger is blocked, creates nothing, and goes through once routing is fixed", async ({
  page,
}) => {
  await runTrigger(page)
  const c1003 = card(page, 1003)
  await page.getByRole("button", { name: "Two EUR accounts" }).click()
  await expect(c1003.getByText(/Cannot route/)).toContainText("refusing to guess")
  await c1003.getByRole("button", { name: /mark overdue/ }).click()
  await expect(c1003.getByTestId("verdict")).toContainText("Qualifies, but blocked")

  const blocked = await runTrigger(page)
  await expect(blocked).toContainText(
    "1003: routing failed, will retry (AmbiguousSettlementAccount)",
  )
  await expect(stubCalls(page)).toHaveCount(1)

  await page.getByRole("button", { name: "One EUR account (seed)" }).click()
  await expect(c1003.getByRole("list", { name: "Settlement route" })).toContainText(
    "Société Générale",
  )
  const fixed = await runTrigger(page)
  await expect(fixed).toContainText("1003: link created")
  expect(await stubParams(stubCalls(page).nth(1))).toEqual(expected1003)
})
