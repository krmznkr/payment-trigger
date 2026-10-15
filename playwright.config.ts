import { defineConfig, devices } from "@playwright/test"

const baseURL = process.env.E2E_BASE_URL
if (baseURL === undefined)
  throw new Error("Set E2E_BASE_URL to the deployed app, e.g. the demo stage URL")

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/wait-for-version.ts",
  // The specs share one deployed database, so they must not run in parallel.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
})
