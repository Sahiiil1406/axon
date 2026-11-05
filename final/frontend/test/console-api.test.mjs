import { afterEach, test } from "node:test"
import assert from "node:assert/strict"
import {
  fetchConsoleState,
  request,
  submitCall,
  updatePermission,
  validateAmount,
  validateBudget,
} from "../src/console/api.ts"
import { delta, eth, receiptId, resultStatus } from "../src/console/format.ts"
const originalFetch = globalThis.fetch
const originalWindow = globalThis.window
globalThis.window = { setTimeout, clearTimeout }
afterEach(() => {
  globalThis.fetch = originalFetch
})
process.on("exit", () => {
  globalThis.window = originalWindow
})
const response = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
test("ETH inputs retain wei precision and reject amounts the API cannot encode", () => {
  for (const amount of [
    "0.000000000000000001",
    "0.05",
    "1",
    "1000000000000000000.123456789012345678",
  ])
    assert.equal(validateAmount(amount), null)
  for (const amount of [
    "",
    "0",
    "0.0",
    "-1",
    "NaN",
    "Infinity",
    "1e2",
    "1.0000000000000000001",
    "0x10",
  ])
    assert.ok(validateAmount(amount))
  assert.equal(validateBudget("340282366920938463463.374607431768211455"), null)
  assert.match(
    validateBudget("340282366920938463463.374607431768211456"),
    /uint128/
  )
})
test("human and agent call payloads match the existing server contract", async () => {
  const seen = []
  globalThis.fetch = async (url, options) => {
    seen.push({ url, options })
    return response({
      ok: false,
      result: { ok: false, preflight: { code: "E_EPOCH_BUDGET" } },
      state: {},
    })
  }
  const blocked = await submitCall("agent", "payAmount", "0.050000000000000001")
  assert.equal(blocked.ok, false)
  assert.equal(seen[0].url, "/api/call")
  assert.equal(seen[0].options.method, "POST")
  assert.deepEqual(JSON.parse(seen[0].options.body), {
    lane: "agent",
    function: "payAmount",
    amountEth: "0.050000000000000001",
  })
  await submitCall("human", "increment", null)
  assert.deepEqual(JSON.parse(seen[1].options.body), {
    lane: "human",
    function: "increment",
    amountEth: null,
  })
})
test("save and revoke use the owner permission API without adding implicit fields", async () => {
  const bodies = []
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "/api/permission")
    bodies.push(JSON.parse(options.body))
    return response({ ok: true, txs: [], state: {} })
  }
  const allow = { increment: true, pay: false, payAmount: true }
  await updatePermission({ budgetEth: "0.5", allow })
  await updatePermission({ active: false })
  assert.deepEqual(bodies, [{ budgetEth: "0.5", allow }, { active: false }])
})
test("API failures preserve server messages and invalid HTML cannot masquerade as state", async () => {
  globalThis.fetch = async () =>
    response({ error: "RPC connection refused" }, 400)
  await assert.rejects(request("/api/state"), /RPC connection refused/)
  globalThis.fetch = async () =>
    new Response("<html>proxy failure</html>", { status: 502 })
  await assert.rejects(request("/api/state"), /invalid response/)
  globalThis.fetch = async () => response({ ok: true })
  await assert.rejects(fetchConsoleState(), /incomplete state/)
})
test("state requests are read-only and a network outage gives an actionable error", async () => {
  let headers
  globalThis.fetch = async (url, options) => {
    headers = options.headers
    return response({
      ok: true,
      network: {},
      counter: {},
      grant: {},
      functions: [],
      history: [],
    })
  }
  assert.equal((await fetchConsoleState()).ok, true)
  assert.equal(headers["content-type"], undefined)
  globalThis.fetch = async () => {
    throw new TypeError("Failed to fetch")
  }
  await assert.rejects(fetchConsoleState(), /Cannot reach the demo API/)
})
test("counter deltas and wei formatting remain exact beyond Number.MAX_SAFE_INTEGER", () => {
  assert.equal(eth("1000000000000000001"), "1.000000000000000001")
  assert.equal(
    delta(
      {
        ok: true,
        before: { humanCount: "9007199254740993" },
        after: { humanCount: "9007199254740994" },
      },
      "humanCount"
    ),
    "+1"
  )
  assert.equal(
    resultStatus({
      ok: false,
      preflight: { ok: false, code: "E_TARGET_DENIED" },
    }).label,
    "E_TARGET_DENIED"
  )
  const failed = {
    lane: "agent",
    function: "pay",
    at: "2026-11-06T01:00:00.000Z",
  }
  assert.equal(receiptId(failed, 1), receiptId(failed, 12))
})
