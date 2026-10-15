import { D1Client } from "@effect/sql-d1"
import { Layer, String } from "effect"
import { HttpRouter, HttpServer } from "effect/http"
import { ApiLayer } from "./Http.ts"

export interface Env {
  readonly DB: D1Database
}

type WebHandler = ReturnType<typeof makeWebHandler>

const makeWebHandler = (env: Env) =>
  HttpRouter.toWebHandler(
    ApiLayer.pipe(
      Layer.provide(D1Client.layer({ db: env.DB, transformResultNames: String.snakeToCamel })),
      Layer.provide(HttpServer.layerServices),
    ),
  )

// Bindings are fixed for the lifetime of an isolate, so the layer is built once.
let webHandler: WebHandler | undefined

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    webHandler ??= makeWebHandler(env)
    return webHandler.handler(request)
  },
} satisfies ExportedHandler<Env>
