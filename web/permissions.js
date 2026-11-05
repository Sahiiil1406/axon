import {
  $,
  $$,
  addrLink,
  api,
  escapeHtml,
  fetchState,
  setChip,
  setNet,
  shortHash,
  toast,
  txLink,
} from "./common.js";

let state = null;
let dirty = false;
const sessionTxs = [];
const budgetInput = $("#budget-input");
const form = $("#permission-form");

init();

function init() {
  bind();
  reload();
}

function bind() {
  form.addEventListener("submit", save);
  $("#reset-form").addEventListener("click", () => {
    dirty = false;
    hydrate(requireState());
    toast("form reset from chain");
  });
  $("#revoke-grant").addEventListener("click", revoke);
  $("#reload-permission").addEventListener("click", () => reload(true));
  $("#refresh-permission").addEventListener("click", () => reload(true));

  budgetInput.addEventListener("input", () => {
    dirty = true;
  });

  $$("#allowlist input").forEach((input) => {
    input.addEventListener("change", () => {
      dirty = true;
    });
  });

  $$("[data-budget]").forEach((button) => {
    button.addEventListener("click", () => {
      budgetInput.value = button.dataset.budget ?? "";
      dirty = true;
      budgetInput.focus();
    });
  });
}

async function reload(notify = false) {
  try {
    state = await fetchState();
    render(state, true);
    if (notify) toast("grant refreshed");
  } catch (error) {
    setNet(null, false);
    setChip($("#grant-status"), "offline", "bad");
    toast(error.message, "bad");
  }
}

function requireState() {
  if (!state) throw new Error("state is not loaded yet");
  return state;
}

function render(next, hydrateForm = false) {
  setNet(next.network, true);

  const grant = next.grant ?? {};
  const contracts = next.contracts ?? {};

  setText("#foot-registry", contracts.registry ?? "—");
  setChip($("#grant-status"), grant.active ? "active" : "revoked", grant.active ? "good" : "bad");

  setText("#grant-budget", `${grant.budgetEth ?? "—"} ETH`);
  setText("#grant-spent", `${grant.spentEth ?? "—"} ETH`);
  setText("#grant-remaining", `${grant.remainingEth ?? "—"} ETH`);

  const remainingText = $("#grant-remaining");
  if (remainingText) {
    remainingText.className = BigInt(grant.remaining ?? "0") > 0n ? "good" : "warn";
  }

  setText("#grant-epoch", formatDuration(grant.epochLengthSec));
  setHtml("#grant-account", addrLink(contracts.agentAccount));
  setHtml("#grant-agent-key", addrLink(grant.agentKey));
  setHtml("#grant-owner", addrLink(grant.owner));
  setHtml("#grant-hash", `<span title="${escapeHtml(grant.grantHash ?? "")}">${escapeHtml(shortHash(grant.grantHash))}</span>`);
  setText("#grant-version", grant.version ?? "—");
  setText("#grant-expires", formatExpiry(grant));
  setText("#grant-scheme", grant.keyScheme ?? "—");

  if (hydrateForm) {
    dirty = false;
    hydrate(next);
  }

  renderAfter(next);
}

function hydrate(next) {
  const grant = next.grant ?? {};
  budgetInput.value = grant.budgetEth ?? "";
  $$("#allowlist input").forEach((input) => {
    input.checked = Boolean(next.allowlist?.[input.dataset.fn]);
  });
  $("#update-hint").innerHTML = grant.active
    ? `Saving writes <code>permissionRegistry.grantAgent(...)</code> from the owner key.
       Set the budget below the amount you plan to send and the next agent spend is
       rejected before the counter runs. Raising it again makes the same call pass.`
    : `The grant is currently <strong>revoked</strong>. Saving re-grants the agent with the
       budget and selectors above; the counter will classify it as
       <code>AGENT</code> again.`;
}

function renderAfter(next) {
  const grant = next.grant ?? {};
  const allow = next.allowlist ?? {};
  const list = $("#after-list");
  if (!list) return;

  list.innerHTML = `
    <div><dt>budget</dt><dd>${escapeHtml(grant.budgetEth ?? "—")} ETH</dd></div>
    <div><dt>spent</dt><dd>${escapeHtml(grant.spentEth ?? "—")} ETH</dd></div>
    <div><dt>remaining</dt><dd class="${BigInt(grant.remaining ?? "0") > 0n ? "good" : "warn"}">${escapeHtml(grant.remainingEth ?? "—")} ETH</dd></div>
    <div><dt>active</dt><dd class="${grant.active ? "good" : "bad"}">${grant.active ? "yes" : "no"}</dd></div>
    <div><dt>increment()</dt><dd class="${allow.increment ? "good" : "bad"}">${allow.increment ? "allowed" : "denied"}</dd></div>
    <div><dt>pay()</dt><dd class="${allow.pay ? "good" : "bad"}">${allow.pay ? "allowed" : "denied"}</dd></div>
    <div><dt>payAmount()</dt><dd class="${allow.payAmount ? "good" : "bad"}">${allow.payAmount ? "allowed" : "denied"}</dd></div>`;
}

async function save(event) {
  event.preventDefault();
  requireState();

  const budgetEth = budgetInput.value.trim();
  if (budgetEth === "" || Number(budgetEth) <= 0 || Number.isNaN(Number(budgetEth))) {
    toast("Enter a budget greater than 0", "bad");
    budgetInput.focus();
    return;
  }

  const allow = {};
  $$("#allowlist input").forEach((input) => {
    allow[input.dataset.fn] = input.checked;
  });

  setBusy(true);
  setChip($("#update-status"), "submitting…", "warn");

  try {
    const result = await api("/api/permission", {
      method: "POST",
      body: JSON.stringify({ budgetEth, allow }),
    });
    const txs = result.txs ?? [];
    remember(txs);
    render(result.state, true);
    setChip($("#update-status"), txs.length ? `${txs.length} tx confirmed` : "no change", txs.length ? "good" : "muted");
    toast(txs.length ? `permission updated in ${txs.length} tx` : "permission already matched — nothing to send");
    if (result.state) {
      state = result.state;
    }
  } catch (error) {
    setChip($("#update-status"), "failed", "bad");
    toast(error.message, "bad");
  } finally {
    setBusy(false);
  }
}

async function revoke() {
  if (!window.confirm("Revoke the agent grant? Agent calls will be rejected until it is re-granted.")) {
    return;
  }

  setBusy(true);
  setChip($("#update-status"), "revoking…", "warn");

  try {
    const result = await api("/api/permission", {
      method: "POST",
      body: JSON.stringify({ active: false }),
    });
    const txs = result.txs ?? [];
    remember(txs);
    state = result.state;
    render(result.state, true);
    setChip($("#update-status"), "grant revoked", "bad");
    toast("agent grant revoked");
  } catch (error) {
    setChip($("#update-status"), "failed", "bad");
    toast(error.message, "bad");
  } finally {
    setBusy(false);
  }
}

function remember(txs) {
  for (const tx of txs) sessionTxs.unshift(tx);
  renderTxs();
}

function renderTxs() {
  const list = $("#tx-list");
  if (!list) return;

  if (sessionTxs.length === 0) {
    list.innerHTML = `<li><span class="tx-label">No permission change in this session yet.</span><span></span></li>`;
    return;
  }

  list.innerHTML = sessionTxs
    .map(
      (tx) => `<li>
        <span class="tx-label">${escapeHtml(tx.label)}</span>
        <span>${txLink(tx.hash)}</span>
      </li>`,
    )
    .join("");
}

function setBusy(busy) {
  $("#save-permission").disabled = busy;
  $("#revoke-grant").disabled = busy;
  $("#reset-form").disabled = busy;
  $("#save-permission").setAttribute("aria-busy", String(busy));
}

function formatDuration(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return "—";
  const hours = value / 3600;
  if (Number.isInteger(hours)) return `${hours}h`;
  const minutes = value / 60;
  if (Number.isInteger(minutes)) return `${minutes}m`;
  return `${value}s`;
}

function formatExpiry(grant) {
  const seconds = Number(grant.expiresInSec ?? 0);
  if (!Number.isFinite(seconds) || seconds <= 0) return "expired";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return `in ${days}d ${hours}h`;
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `in ${hours}h ${minutes}m`;
  return `in ${minutes}m`;
}

function setText(selector, value) {
  const element = $(selector);
  if (element) element.textContent = value ?? "—";
}

function setHtml(selector, html) {
  const element = $(selector);
  if (element) element.innerHTML = html;
}
