import * as Alchemy from "alchemy"
import * as Cloudflare from "alchemy/Cloudflare"
import * as Effect from "effect/Effect"

// Always pass an explicit --stage: the default stage name embeds the OS username.
export default Alchemy.Stack(
  "payment-trigger",
  { providers: Cloudflare.providers(), state: Cloudflare.state() },
  Effect.gen(function* () {
    const db = yield* Cloudflare.D1.Database("Database", {
      migrations: "apps/api/migrations",
    })

    // One Worker: /api/* runs the Effect HttpApi, everything else is the React build.
    const app = yield* Cloudflare.Website.Vite("App", {
      rootDir: "apps/web",
      main: "worker.ts",
      env: { DB: db, BUILD_VERSION: process.env.BUILD_VERSION ?? "local" },
      assets: { runWorkerFirst: ["/api/*"], notFoundHandling: "single-page-application" },
      memo: { include: ["**/*", "../api/src/**", "../../packages/domain/src/**"], lockfile: true },
    })

    return { url: app.url }
  }),
)
