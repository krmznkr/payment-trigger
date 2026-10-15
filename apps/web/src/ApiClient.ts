import { Api } from "@payment-trigger/domain/Api"
import { FetchHttpClient } from "effect/http"
import { AtomHttpApi } from "effect/reactivity"

export class ApiClient extends AtomHttpApi.Service<ApiClient>()("payment-trigger/web/ApiClient", {
  api: Api,
  httpClient: FetchHttpClient.layer,
  baseUrl: window.location.origin,
}) {}
