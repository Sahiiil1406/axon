import type { CallResult, Tone } from "./types"
export const EXPLORER = "https://altmempoolexplorer.forshtat.com"
export function short(value?: string | null, head = 6, tail = 4) {
  return !value
    ? "—"
    : value.length <= head + tail + 2
      ? value
      : `${value.slice(0, head)}…${value.slice(-tail)}`
}
export function eth(value?: string | null) {
  if (value == null || value === "") return "—"
  try {
    const n = BigInt(value)
    const whole = n / 10n ** 18n
    const fraction = (n % 10n ** 18n)
      .toString()
      .padStart(18, "0")
      .replace(/0+$/, "")
    return fraction ? `${whole}.${fraction}` : whole.toString()
  } catch {
    return "—"
  }
}
export function integer(value?: string | number | null) {
  if (value == null) return "—"
  try {
    return BigInt(value).toLocaleString()
  } catch {
    return String(value)
  }
}
export function duration(seconds?: number) {
  if (!seconds || seconds <= 0) return "—"
  if (seconds % 86400 === 0)
    return `${seconds / 86400} day${seconds === 86400 ? "" : "s"}`
  if (seconds % 3600 === 0) return `${seconds / 3600} hours`
  return `${seconds.toLocaleString()} seconds`
}
export function expiry(timestamp?: string) {
  if (!timestamp) return "—"
  const date = new Date(Number(timestamp) * 1000)
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString()
}
export function time(iso?: string) {
  if (!iso) return "—"
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
}
export function resultStatus(result?: CallResult | null): {
  label: string
  tone: Tone
} {
  if (!result) return { label: "No call yet", tone: "muted" }
  if (result.ok)
    return {
      label:
        result.status === "OnChain" || result.status === "Finalized"
          ? "On chain"
          : "Success",
      tone: "good",
    }
  if (result.preflight?.ok === false)
    return { label: result.preflight.code ?? "Blocked", tone: "bad" }
  return {
    label: result.status?.toLowerCase() === "reverted" ? "Reverted" : "Failed",
    tone: "bad",
  }
}
export function failureReason(result: CallResult) {
  return result.preflight?.ok === false
    ? `${result.preflight.code ?? "Blocked"}${result.preflight.message ? `: ${result.preflight.message}` : ""}`
    : (result.error ??
        result.simulation?.executionError ??
        "The transaction did not succeed.")
}
export function delta(result: CallResult, key: "humanCount" | "agentCount") {
  try {
    if (result.before?.[key] != null && result.after?.[key] != null) {
      const n = BigInt(result.after[key]) - BigInt(result.before[key])
      return `${n >= 0n ? "+" : ""}${n}`
    }
  } catch {
    /* Missing or malformed snapshots do not imply a successful delta. */
  }
  return result.ok ? "—" : "+0"
}
export function receiptId(result: CallResult, index = 0) {
  return (
    result.hash ??
    (result.at
      ? `attempt-${Date.parse(result.at)}-${result.lane}-${result.function}`
      : `attempt-${index}`)
  )
}
