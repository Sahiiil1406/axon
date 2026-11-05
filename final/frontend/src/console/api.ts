import type {
  CallPayload,
  ConsoleState,
  FunctionId,
  Lane,
  PermissionInput,
  PermissionPayload,
} from "./types"

const base = (import.meta.env?.VITE_AXON_API_URL ?? "").replace(/\/$/, "")

export async function request<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const controller = new AbortController()
  const timeout = window.setTimeout(
    () => controller.abort(),
    init.method === "POST" ? 180_000 : 20_000
  )
  try {
    const response = await fetch(`${base}${path}`, {
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
        "The API request timed out. Refresh state before retrying the action."
      )
    if (error instanceof TypeError)
      throw new Error(
        "Cannot reach the demo API. Check the server connection, then refresh state."
      )
    throw error
  } finally {
    window.clearTimeout(timeout)
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
  amountEth: string | null
) =>
  request<CallPayload>("/api/call", {
    method: "POST",
    body: JSON.stringify({ lane, function: fn, amountEth }),
  })
export const updatePermission = (input: PermissionInput) =>
  request<PermissionPayload>("/api/permission", {
    method: "POST",
    body: JSON.stringify(input),
  })

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
