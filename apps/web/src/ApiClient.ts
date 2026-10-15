import { Api } from "@payment-trigger/domain/Api"
import { FetchHttpClient } from "effect/http"
import { AtomHttpApi } from "effect/reactivity"

export class ApiClient extends AtomHttpApi.Service<ApiClient>()("payment-trigger/web/ApiClient", {
  api: Api,
  httpClient: FetchHttpClient.layer,
  baseUrl: window.location.origin,
}) {}

/** Mutations invalidate this key, so the overview refetches after a run. */
const triggerData = ["trigger-data"]

export const overviewAtom = ApiClient.query("trigger", "overview", { reactivityKeys: triggerData })
export const runAtom = ApiClient.mutation("trigger", "run")
export const runRequest = { reactivityKeys: triggerData }
