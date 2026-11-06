// The demo API signs and submits the same two-frame transaction as the web console.
function fail(message) {
  console.log(JSON.stringify({ ok: false, outcome: "error", reason: message }, null, 2))
  process.exitCode = 1
}

const [action, ...args] = process.argv.slice(2)
const functions = new Map([["increment", "increment"], ["pay", "payAmount"]])
const fn = functions.get(action)
const amount = action === "pay" ? args.shift() : undefined
const name = args[0] === "--agent" && args.length === 2 ? args[1] : undefined
const validAmount = amount && /^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(amount) && /[1-9]/.test(amount)

if (!fn || (args.length && !name) || (action === "pay" && !validAmount)) {
  fail("Usage: node agent/scripts/counter.mjs increment|pay <ETH amount> [--agent <ENS name>]")
} else {
  try {
    const base = process.env.AXON_API_URL ?? "http://127.0.0.1:8900"
    const response = await fetch(new URL("/api/call", base), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        lane: "agent",
        function: fn,
        amountEth: amount,
        agentName: name,
        includeState: false,
      }),
      signal: AbortSignal.timeout(180_000),
    })
    const payload = await response.json()
    if (!response.ok || !payload.result) {
      fail(payload.error ?? `Axon API returned HTTP ${response.status}`)
    } else {
      const result = payload.result
      const pending = result.hash && ["New", "Pending", "Submitted"].includes(result.status)
      const outcome = result.ok ? "confirmed" : pending ? "pending" : "failed"
      console.log(JSON.stringify({
        ok: result.ok,
        outcome,
        action: result.signature,
        agent: result.agent?.name,
        account: result.caller ?? result.agent?.account,
        transactionHash: result.hash,
        explorer: result.explorer,
        frameStatuses: result.admission?.frameStatuses,
        reason: result.error,
        policyCheck: result.preflight?.ok === false ? result.preflight : undefined,
        simulation: result.simulation,
        counterBefore: result.before?.agentCount,
        counterAfter: result.after?.agentCount,
      }, null, 2))
      if (!result.ok) process.exitCode = pending ? 2 : 1
    }
  } catch (error) {
    fail(`Could not confirm the Axon API result: ${error.message}. Check the console before retrying.`)
  }
}
