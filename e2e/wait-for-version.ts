/**
 * Right after a deploy, Cloudflare serves old and new versions interchangeably
 * for a few seconds (observed ~15 s). Wait until the commit under test answers
 * several times in a row before any spec runs.
 */
const consecutive = 5
const deadline = Date.now() + 180_000

export default async function waitForVersion() {
  const expected = process.env.E2E_EXPECT_VERSION
  const baseURL = process.env.E2E_BASE_URL
  if (expected === undefined || baseURL === undefined) return

  let streak = 0
  let last = "no response"
  while (Date.now() < deadline) {
    const body = await fetch(new URL("/api/health", baseURL), { cache: "no-store" })
      .then((response) => response.json() as Promise<{ version?: string }>)
      .catch((error: unknown) => ({ version: `error: ${String(error)}` }))
    last = body.version ?? "unversioned"
    streak = last === expected ? streak + 1 : 0
    if (streak >= consecutive) return
    await new Promise((resolve) => setTimeout(resolve, 1_000))
  }
  throw new Error(`Deployed version never settled on ${expected}; last seen ${last}`)
}
