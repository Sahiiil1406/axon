import type { RpContext } from "@worldcoin/idkit"
import type {
  AgentAllowlistEntry,
  WorldIdProof,
  CallPayload,
  ConsoleState,
  EnsState,
  FunctionId,
  Lane,
  PermissionInput,
  PermissionPayload,
} from "./types"

const base = (import.meta.env?.VITE_AXON_API_URL ?? "").replace(/\/$/, "")
const registrationBase =
  base || (import.meta.env?.DEV ? "http://127.0.0.1:8900" : "")

export async function request<T>(
  path: string,
  init: RequestInit = {},
  apiBase = base,
  timeoutMs = init.method === "POST" ? 180_000 : 20_000
): Promise<T> {
  const controller = new AbortController()
  const timeout =
    timeoutMs > 0
      ? window.setTimeout(() => controller.abort(), timeoutMs)
      : undefined
  try {
    const response = await fetch(`${apiBase}${path}`, {
      ...init,
      headers: {
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...init.headers,
      },
      signal: controller.signal,
      cache: "no-store",
    })
    const text = await response.text()
    let body: unknown
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      throw new Error(
        "The demo API returned an invalid response. Check the API connection and refresh."
      )
    }
    if (!response.ok) {
      const error =
        body && typeof body === "object" && "error" in body
          ? String(body.error)
          : `Request failed (HTTP ${response.status})`
      throw new Error(error)
    }
    if (!body || typeof body !== "object")
      throw new Error("The demo API returned an empty response.")
    return body as T
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw new Error(
        "The API request timed out. Refresh state before retrying the action.",
        { cause: error }
      )
    if (error instanceof TypeError)
      throw new Error(
        "Cannot reach the demo API. Check the server connection, then refresh state.",
        { cause: error }
      )
    throw error
  } finally {
    if (timeout !== undefined) window.clearTimeout(timeout)
  }
}
export const fetchConsoleState = async () => {
  const state = await request<ConsoleState>("/api/state")
  if (
    !state.ok ||
    !state.network ||
    !state.counter ||
    !state.grant ||
    !Array.isArray(state.functions) ||
    !Array.isArray(state.history)
  )
    throw new Error("The demo API returned an incomplete state response.")
  return state
}
export const submitCall = (
  lane: Lane,
  fn: FunctionId,
  amountEth: string | null,
  agentName?: string
) =>
  request<CallPayload>("/api/call", {
    method: "POST",
    body: JSON.stringify({ lane, function: fn, amountEth, agentName }),
  })
export const updatePermission = (input: PermissionInput) =>
  request<PermissionPayload>("/api/permission", {
    method: "POST",
    body: JSON.stringify(input),
  })

export const fetchEnsState = async (): Promise<EnsState> => {
  const state = await request<ConsoleState>("/api/state")
  return state.ens ?? { humanName: null, agents: [] }
}
export const resolveEnsAgent = async (name: string) => {
  return request<{
    ok: boolean
    name: string
    account: string
    agentKey: string
    active: boolean
    budget: string
    version: string
    allowlist: AgentAllowlistEntry[]
  }>(`/api/ens/resolve?name=${encodeURIComponent(name)}`)
}
export const requestWorldIdContext = () =>
  request<RpContext>(
    "/api/world-id/request",
    { method: "POST" },
    registrationBase
  )

export const registerEnsAgent = (input: {
  subdomain: string
  agentKey: string
  agentAccount: string
  worldIdProof?: WorldIdProof
}) =>
  request<{
    ok: true
    agent: string
    txs: Array<{ label: string; hash: string }>
  }>(
    "/api/ens/register",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
    registrationBase,
    0
  )

/** Exact decimal validation: never convert an ETH amount to a floating point number. */
export function validateAmount(value: string): string | null {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(value.trim()))
    return "Enter a valid ETH amount with up to 18 decimal places."
  const [whole, fraction = ""] = value.trim().split(".")
  const wei = BigInt(whole) * 10n ** 18n + BigInt(fraction.padEnd(18, "0"))
  if (wei <= 0n) return "Enter an amount greater than 0."
  return null
}
export function validateBudget(value: string): string | null {
  const error = validateAmount(value)
  if (error) return error
  const [whole, fraction = ""] = value.trim().split(".")
  if (
    BigInt(whole) * 10n ** 18n + BigInt(fraction.padEnd(18, "0")) >
    2n ** 128n - 1n
  )
    return "The epoch budget exceeds the registry’s uint128 limit."
  return null
}


export const runZkProofDemo = () =>
  request<{
    root: string
    amountWei: string
    verified: boolean
    tamperedAmountRejected: boolean
    overLimitRejected: boolean
  }>("/api/zk/demo", { method: "POST" })
