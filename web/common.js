/**
 * Shared helpers for the FinalCounter demo pages.
 * No framework, no build step — plain ES modules served by server.ts.
 */

export const EXPLORER = "https://altmempoolexplorer.forshtat.com";

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

export async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json", ...(options.headers ?? {}) },
    ...options,
  });
  const text = await response.text();
  let body;
  try {
    body = text === "" ? null : JSON.parse(text);
  } catch {
    throw new Error(text.slice(0, 300) || `HTTP ${response.status}`);
  }
  if (!response.ok) {
    throw new Error(body?.error ?? `HTTP ${response.status}`);
  }
  return body;
}

export const fetchState = () => api("/api/state");

export function eth(wei) {
  if (wei == null || wei === "") return "—";
  const value = BigInt(wei);
  const whole = value / 10n ** 18n;
  const fraction = (value % 10n ** 18n).toString().padStart(18, "0").replace(/0+$/, "");
  return fraction === "" ? whole.toString() : `${whole}.${fraction}`;
}

export function short(value, head = 6, tail = 4) {
  if (!value) return "—";
  const text = String(value);
  if (text.length <= head + tail + 2) return text;
  return `${text.slice(0, head)}…${text.slice(-tail)}`;
}

export const shortHash = (hash) => (hash ? short(hash, 8, 6) : "—");
export const shortAddr = (addr) => (addr ? short(addr, 6, 4) : "—");

export const txUrl = (hash) => `${EXPLORER}/tx/${hash}`;
export const addressUrl = (address) => `${EXPLORER}/address/${address}`;

export function txLink(hash) {
  if (!hash) return "—";
  return `<a href="${txUrl(hash)}" target="_blank" rel="noreferrer" title="${hash}">${shortHash(hash)} ↗</a>`;
}

export function addrLink(address) {
  if (!address) return "—";
  return `<a href="${addressUrl(address)}" target="_blank" rel="noreferrer" title="${address}">${shortAddr(address)} ↗</a>`;
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function setChip(element, label, kind = "muted") {
  if (!element) return;
  element.textContent = label;
  element.className = `chip ${kind}`;
}

let toastTimer = null;
export function toast(message, kind = "info") {
  const element = $("#toast");
  if (!element) return;
  element.textContent = message;
  element.className = `toast show${kind === "bad" ? " bad" : ""}`;
  element.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    element.classList.remove("show");
    setTimeout(() => {
      element.hidden = true;
    }, 200);
  }, 3600);
}

export function setNet(network, ok = true) {
  const dot = $("#net-dot");
  const label = $("#net-label");
  if (dot) dot.style.background = ok ? "var(--green)" : "var(--red)";
  if (label) label.textContent = ok ? `chain ${network?.chainId ?? "—"}` : "offline";
}

export function timeLabel(iso) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function statusKind(result) {
  if (!result) return "muted";
  if (result.ok) return "good";
  if (result.status === "Reverted" || result.preflight?.ok === false) return "bad";
  return "warn";
}

export function statusLabel(result) {
  if (!result) return "idle";
  if (result.ok) return result.status === "OnChain" ? "on chain" : "success";
  if (result.preflight?.ok === false) return result.preflight.code ?? "blocked";
  if (result.status === "Reverted") return "reverted";
  return "failed";
}

export function laneCount(result, lane) {
  const key = lane === "human" ? "humanCount" : "agentCount";
  return result?.after?.[key] ?? result?.before?.[key] ?? "0";
}

export function copyText(text) {
  if (!navigator.clipboard) return Promise.reject(new Error("clipboard unavailable"));
  return navigator.clipboard.writeText(text);
}
