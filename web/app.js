import {
  $,
  $$,
  addrLink,
  api,
  escapeHtml,
  eth,
  fetchState,
  laneCount,
  setChip,
  setNet,
  shortAddr,
  shortHash,
  statusKind,
  statusLabel,
  timeLabel,
  toast,
  txLink,
} from "./common.js";

let state = null;
let functions = [];
let hydrated = false;
const last = { human: null, agent: null };

const humanButton = $("#human-call");
const agentButton = $("#agent-call");
const functionSelect = $("#function-select");
const amountRow = $("#amount-row");
const amountInput = $("#amount-input");
const amountPresets = $("#amount-presets");
const banner = $("#banner");

init();

function init() {
  bind();
  refresh();
}

function bind() {
  functionSelect.addEventListener("change", () => {
    syncAmountRow();
    renderHint();
  });

  $$("#amount-presets button").forEach((button) => {
    button.addEventListener("click", () => {
      amountInput.value = button.dataset.amount ?? "";
      amountInput.focus();
    });
  });

  humanButton.addEventListener("click", () => runCall("human"));
  agentButton.addEventListener("click", () => runCall("agent"));

  $("#refresh-state").addEventListener("click", () => refresh(true));
}

async function refresh(notify = false) {
  try {
    const next = await fetchState();
    state = next;
    applyState(next);
    if (notify) toast("state refreshed");
  } catch (error) {
    setNet(null, false);
    toast(error.message, "bad");
    showBanner(`Cannot reach the demo server: ${error.message}`, true);
  }
}

function applyState(next) {
  setNet(next.network, true);

  const contracts = next.contracts ?? {};
  setText("#hero-counter", shortAddr(contracts.counter));
  setTitle("#hero-counter", contracts.counter);
  setText("#hero-account", shortAddr(contracts.agentAccount));
  setTitle("#hero-account", contracts.agentAccount);
  setText("#hero-grant", shortHash(next.grant?.grantHash));
  setTitle("#hero-grant", next.grant?.grantHash);
  setText("#foot-counter", contracts.counter ?? "—");

  const counter = next.counter ?? {};
  setText("#stat-human", counter.humanCount ?? "0");
  setText("#stat-agent", counter.agentCount ?? "0");
  setText("#stat-human-paid", `${eth(counter.humanPaid)} ETH`);
  setText("#stat-agent-paid", `${eth(counter.agentPaid)} ETH`);
  setText(
    "#stat-remaining",
    next.grant
      ? `${next.grant.remainingEth} / ${next.grant.budgetEth} ETH`
      : "—",
  );

  functions = next.functions ?? [];
  syncFunctions();

  const history = next.history ?? [];
  renderHistory(history);

  if (!hydrated) {
    hydrated = true;
    const human = history.find((entry) => entry.lane === "human");
    const agent = history.find((entry) => entry.lane === "agent");
    if (human) {
      last.human = human;
      renderLane("human", human);
    }
    if (agent) {
      last.agent = agent;
      renderLane("agent", agent);
    }
    if (human || agent) {
      renderCompare();
      renderDetail(history[0]);
    }
  }
}

function syncFunctions() {
  if (functions.length === 0) return;
  const previous = functionSelect.value;
  functionSelect.innerHTML = functions
    .map((fn) => `<option value="${escapeHtml(fn.id)}">${escapeHtml(fn.signature)}</option>`)
    .join("");
  if (functions.some((fn) => fn.id === previous)) functionSelect.value = previous;
  syncAmountRow();
  renderHint();
}

function selectedFunction() {
  return functions.find((fn) => fn.id === functionSelect.value) ?? functions[0] ?? null;
}

function syncAmountRow() {
  const fn = selectedFunction();
  const needsAmount = Boolean(fn?.needsAmount);
  amountRow.hidden = !needsAmount;
  amountPresets.hidden = !needsAmount;
  if (needsAmount && amountInput.value.trim() === "") amountInput.value = "0.05";
}

function renderHint() {
  const fn = selectedFunction();
  const hint = $("#call-hint");
  if (!hint) return;
  if (!fn) {
    hint.textContent =
      "The human path is an ordinary EOA transaction. The agent path builds and signs a two-frame EIP-8141 transaction with the agent key.";
    return;
  }
  const lane = fn.id === "payAmount" ? "For the agent, spend equals the amount and counts against the epoch budget." : fn.note;
  hint.innerHTML = `<code>${escapeHtml(fn.signature)}</code> — ${escapeHtml(lane)}.
    The human path is an ordinary EOA transaction; the agent path is a real
    <strong>VERIFY + SENDER</strong> frame transaction.`;
}

async function runCall(lane) {
  const fn = selectedFunction();
  if (!fn) {
    toast("No function loaded yet", "bad");
    return;
  }

  let amountEth = null;
  if (fn.needsAmount) {
    amountEth = amountInput.value.trim();
    if (amountEth === "" || Number(amountEth) <= 0 || Number.isNaN(Number(amountEth))) {
      toast("Enter an amount greater than 0", "bad");
      amountInput.focus();
      return;
    }
  }

  setBusy(true);
  hideBanner();
  setChip($("#call-chip"), `sending ${lane}…`, "warn");
  setChip($("#detail-status"), "pending", "warn");

  try {
    const payload = await api("/api/call", {
      method: "POST",
      body: JSON.stringify({ lane, function: fn.id, amountEth }),
    });

    const result = payload.result;
    last[lane] = result;
    state = payload.state;
    applyState(payload.state);

    renderLane(lane, result);
    renderCompare();
    renderDetail(result);
    setChip($("#call-chip"), `${lane} call returned`, payload.ok ? "good" : "bad");

    if (payload.ok) {
      toast(`${lane} call ${result.status === "OnChain" ? "settled on chain" : "succeeded"}`);
    } else {
      toast(`${lane} call failed: ${failureReason(result)}`, "bad");
      showBanner(
        `${lane.toUpperCase()} CALL BLOCKED — ${failureReason(result)}. ` +
          (result.preflight?.ok === false
            ? "Open the permissions page to raise the grant, then run the same call again."
            : "Inspect the receipt below."),
        true,
      );
    }
  } catch (error) {
    toast(error.message, "bad");
    showBanner(`${lane} call failed before submission: ${error.message}`, true);
    setChip($("#call-chip"), "error", "bad");
  } finally {
    setBusy(false);
  }
}

function setBusy(busy) {
  humanButton.disabled = busy;
  agentButton.disabled = busy;
  [humanButton, agentButton].forEach((button) => {
    button.setAttribute("aria-busy", String(busy));
  });
}

function renderLane(lane, result) {
  const card = $(`#lane-${lane}`);
  const status = $(`#${lane}-status`);
  card.classList.add("live");

  setChip(status, statusLabel(result), statusKind(result));
  setText(`#${lane}-fn`, result.signature ? `${result.signature}` : "—");

  const before = result.before?.[lane === "human" ? "humanCount" : "agentCount"];
  const after = result.after?.[lane === "human" ? "humanCount" : "agentCount"];
  const delta =
    before != null && after != null ? Number(after) - Number(before) : result.ok ? null : 0;
  setText(`#${lane}-delta`, delta == null ? "—" : delta >= 0 ? `+${delta}` : `${delta}`);

  setHtml(`#${lane}-tx`, txLink(result.hash));
  setText(`#${lane}-block`, result.blockNumber ?? "—");
  setText(`#${lane}-gas`, result.gasUsed ? Number(result.gasUsed).toLocaleString() : "—");
  setText(`#${lane}-paid`, paidLabel(result));
  setHtml(`#${lane}-caller`, addrLink(result.caller));

  if (lane === "agent") {
    setText(`#agent-frames`, result.frames ?? "2");
    setText(`#agent-admission`, admissionLabel(result.admission));
  }

  const note = $(`#${lane}-note`);
  note.className = "lane-note";
  if (result.ok) {
    note.classList.add("good");
    note.textContent =
      lane === "human"
        ? "Classified HUMAN by PermissionRegistry.isAccount(msg.sender) · step +1."
        : "Classified AGENT by PermissionRegistry.isAccount(msg.sender) · VERIFY + SENDER · step +10.";
  } else {
    note.classList.add("bad");
    note.textContent = failureReason(result);
  }
}

function renderCompare() {
  const human = last.human;
  const agent = last.agent;
  const chip = $("#compare-chip");
  const foot = $("#compare-foot");

  if (!human && !agent) {
    setChip(chip, "waiting", "muted");
    foot.innerHTML = "<span>Run both calls to compare the same function on the two lanes.</span>";
    return;
  }

  setChip(chip, human && agent ? "both lanes" : "one lane", human && agent ? "good" : "warn");

  if (!human || !agent) {
    const missing = human ? "agentCall" : "humanCall";
    foot.innerHTML = `<span>Run <strong>${missing}</strong> to complete the side-by-side comparison.</span>`;
    return;
  }

  const sameFunction = human.function === agent.function;
  const humanDelta = Number(laneCount(human, "human")) - Number(human.before?.humanCount ?? 0);
  const agentDelta = Number(laneCount(agent, "agent")) - Number(agent.before?.agentCount ?? 0);

  foot.innerHTML = `
    <div>
      ${sameFunction ? "same selector" : "different selectors"}
      · <strong>${escapeHtml(human.signature)}</strong> vs <strong>${escapeHtml(agent.signature)}</strong>
    </div>
    <div>
      human <span class="hl-human">+${humanDelta}</span> ·
      agent <span class="hl-agent">+${agentDelta}</span> ·
      frames <strong>${human.hash ? 1 : 0}</strong> vs <strong>${agent.frames ?? 2}</strong> ·
      status <strong>${escapeHtml(statusLabel(human))}</strong> vs <strong>${escapeHtml(statusLabel(agent))}</strong>
    </div>
    <div>
      gas <strong>${human.gasUsed ? Number(human.gasUsed).toLocaleString() : "—"}</strong> vs
      <strong>${agent.gasUsed ? Number(agent.gasUsed).toLocaleString() : "—"}</strong>
    </div>`;
}

function renderDetail(result) {
  setText("#detail-title", `${result.lane} · ${result.signature ?? "call"}`);
  setChip($("#detail-status"), statusLabel(result), statusKind(result));

  const summary = $("#detail-summary");
  const extra = $("#detail-extra");

  summary.innerHTML = `
    <h3>receipt</h3>
    <dl class="kv-list">
      <div><dt>lane</dt><dd>${escapeHtml(result.lane)}</dd></div>
      <div><dt>function</dt><dd>${escapeHtml(result.signature ?? "—")}</dd></div>
      <div><dt>tx hash</dt><dd>${txLink(result.hash)}</dd></div>
      <div><dt>status</dt><dd class="${statusKind(result) === "good" ? "good" : statusKind(result) === "bad" ? "bad" : "warn"}">${escapeHtml(result.status ?? statusLabel(result))}</dd></div>
      <div><dt>block</dt><dd>${result.blockNumber ?? "—"}</dd></div>
      <div><dt>gas used</dt><dd>${result.gasUsed ? Number(result.gasUsed).toLocaleString() : "—"}</dd></div>
      <div><dt>value</dt><dd>${paidLabel(result)}</dd></div>
      ${result.lane === "agent" ? `<div><dt>spend</dt><dd>${result.spendEth ?? "0"} ETH</dd></div>` : ""}
      <div><dt>caller</dt><dd>${addrLink(result.caller)}</dd></div>
      <div><dt>human count</dt><dd>${result.before?.humanCount ?? "—"} → ${result.after?.humanCount ?? "—"}</dd></div>
      <div><dt>agent count</dt><dd>${result.before?.agentCount ?? "—"} → ${result.after?.agentCount ?? "—"}</dd></div>
    </dl>`;

  if (result.lane === "agent") {
    extra.innerHTML = agentExtra(result);
  } else {
    extra.innerHTML = `
      <h3>what changed</h3>
      <dl class="kv-list">
        <div><dt>path</dt><dd>ordinary EOA transaction</dd></div>
        <div><dt>frames</dt><dd>1 (the call itself)</dd></div>
        <div><dt>human paid</dt><dd>${eth(result.before?.humanPaid)} → ${eth(result.after?.humanPaid)} ETH</dd></div>
        <div><dt>human count</dt><dd>${result.before?.humanCount ?? "—"} → ${result.after?.humanCount ?? "—"}</dd></div>
      </dl>
      <p class="hint" style="margin-top:12px">
        The counter classifies the caller from the registry. An unregistered EOA
        always lands on the human lane, so a human cannot obtain the agent price
        or the +10 step.
      </p>`;
  }

  renderPreflight(result);

  const raw = $("#detail-json");
  if (raw) raw.textContent = JSON.stringify(result, null, 2);
}

function agentExtra(result) {
  const simulation = result.simulation;
  const admission = result.admission;
  const frames = simulation?.frames ?? [];

  const frameRows = frames.length
    ? frames
        .map(
          (frame, index) => `
          <li>
            <span class="idx">frame ${index}</span>
            <span>${index === 0 ? "VERIFY" : "SENDER"} · ${index === 0 ? "grant + signature checks" : "execute intent"}</span>
            <span class="${frame.succeeded ? "pass" : "fail"}">${frame.succeeded ? "pass" : "fail"}</span>
          </li>`,
        )
        .join("")
    : `<li><span class="idx">frames</span><span>2-frame transaction</span><span class="pass">built</span></li>`;

  const checks = (admission?.checks ?? [])
    .slice(0, 10)
    .map((check) => {
      const kind = check.verdict === "pass" ? "" : check.verdict === "skip" ? "skip" : "fail";
      return `<li>
        <span class="rule">${escapeHtml(check.rule)}${check.reason ? ` — ${escapeHtml(check.reason)}` : ""}</span>
        <span></span>
        <span class="check-verdict ${kind}">${escapeHtml(check.verdict)}</span>
      </li>`;
    })
    .join("");

  return `
    <h3>agent transaction</h3>
    <dl class="kv-list">
      <div><dt>frames</dt><dd>${frames.length || 2}</dd></div>
      <div><dt>intent spend</dt><dd>${result.spendEth ?? "0"} ETH</dd></div>
      <div><dt>simulation</dt><dd class="${simulation?.executionError ? "bad" : "good"}">${escapeHtml(simulation?.executionStatus ?? "not run")}</dd></div>
      <div><dt>canonical probe</dt><dd class="${simulation?.canonicalMempoolValid === false ? "warn" : "good"}">${simulation?.canonicalMempoolValid === false ? `advisory: ${escapeHtml(simulation.canonicalMempoolViolation ?? "invalid")}` : "valid"}</dd></div>
      <div><dt>admission</dt><dd>${admissionLabel(admission)}</dd></div>
    </dl>
    <ul class="frame-list" style="margin-top:10px">${frameRows}</ul>
    ${checks ? `<h3 style="margin-top:14px">ERC-8421 checks</h3><ul class="check-list-demo">${checks}</ul>` : ""}
    ${
      simulation?.canonicalMempoolValid === false
        ? `<p class="hint" style="margin-top:12px">
            The bare canonical mempool probe reports <code>${escapeHtml(simulation.canonicalMempoolViolation ?? "a storage-read violation")}</code>
            for these frames. The devnet routes them through the ERC-8421 sidecar instead;
            its admission checks are authoritative, and this transaction settled on chain.
          </p>`
        : ""
    }
    <p class="hint" style="margin-top:12px">
      Human path: 1 ordinary transaction. Agent path: 1 frame transaction with a
      <strong>VERIFY</strong> frame that proves the grant and a <strong>SENDER</strong> frame that
      executes the intent.
    </p>`;
}

function renderPreflight(result) {
  const box = $("#preflight");
  const preflight = result.preflight;

  if (!preflight) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }

  if (preflight.ok) {
    box.hidden = false;
    box.className = "preflight good";
    box.innerHTML = `
      <div class="preflight-head">
        <code>preflight passed</code>
        <span class="chip good">ready</span>
      </div>
      <p>The agent client checked the grant, allowlist, and epoch budget before submitting.</p>`;
    return;
  }

  box.hidden = false;
  box.className = "preflight";
  box.innerHTML = `
    <div class="preflight-head">
      <code>${escapeHtml(preflight.code ?? "E_DENIED")}</code>
      <span class="chip bad">blocked</span>
    </div>
    <p>${escapeHtml(preflight.message ?? "The agent call cannot be admitted.")}</p>
    ${
      preflight.remainingEth != null
        ? `<p style="margin-top:6px">
            budget <strong>${escapeHtml(preflight.budgetEth)} ETH</strong> ·
            spent <strong>${escapeHtml(preflight.spentEth)} ETH</strong> ·
            remaining <strong>${escapeHtml(preflight.remainingEth)} ETH</strong> ·
            this call <strong>${escapeHtml(preflight.spendEth)} ETH</strong>
          </p>`
        : ""
    }
    <a class="preflight-link" href="./permissions">change permission →</a>`;
}

function renderHistory(history) {
  const body = $("#history-body");
  if (!body) return;

  if (!history || history.length === 0) {
    body.innerHTML = `<tr class="empty-row"><td colspan="6">No calls in this server session yet.</td></tr>`;
    return;
  }

  body.innerHTML = history
    .map((entry) => {
      const lane = entry.lane ?? "—";
      const before = entry.before?.[lane === "human" ? "humanCount" : "agentCount"] ?? "—";
      const after = entry.after?.[lane === "human" ? "humanCount" : "agentCount"] ?? "—";
      return `<tr>
        <td>${timeLabel(entry.at)}</td>
        <td class="lane-${escapeHtml(lane)}">${escapeHtml(lane)}</td>
        <td>${escapeHtml(entry.signature ?? entry.function ?? "—")}</td>
        <td class="${entry.ok ? "ok" : "bad"}">${escapeHtml(statusLabel(entry))}</td>
        <td>${escapeHtml(before)} → ${escapeHtml(after)}</td>
        <td>${txLink(entry.hash)}</td>
      </tr>`;
    })
    .join("");
}

function paidLabel(result) {
  if (!result) return "—";
  const amount = result.amountEth ?? result.valueEth;
  if (amount == null) return "—";
  return `${amount} ETH`;
}

function admissionLabel(admission) {
  if (!admission) return "—";
  return `${admission.passed ?? 0} pass / ${admission.failed ?? 0} fail · ${admission.outcome}`;
}

function failureReason(result) {
  if (!result) return "unknown error";
  if (result.preflight?.ok === false) {
    return `${result.preflight.code}: ${result.preflight.message}`;
  }
  if (result.error) return result.error;
  if (result.status === "Reverted") return "transaction reverted";
  return "call failed";
}

function showBanner(text, bad = false) {
  banner.textContent = text;
  banner.className = bad ? "banner bad" : "banner";
  banner.hidden = false;
}

function hideBanner() {
  banner.hidden = true;
}

function setText(selector, value) {
  const element = $(selector);
  if (element) element.textContent = value ?? "—";
}

function setTitle(selector, value) {
  const element = $(selector);
  if (element) element.title = value ?? "";
}

function setHtml(selector, html) {
  const element = $(selector);
  if (element) element.innerHTML = html;
}
