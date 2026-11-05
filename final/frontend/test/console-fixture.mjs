/** Test-only HTTP fixture. Never imported by or enabled in the application. */
import { createServer } from "node:http"
import { pathToFileURL } from "node:url"
export function createFixtureServer() {
  const address = (n) => `0x${n.toString(16).padStart(40, "0")}`
  let serial = 0
  const hash = () => `0x${(++serial).toString(16).padStart(64, "0")}`
  const wei = (eth) => {
    const [a, b = ""] = String(eth).split(".")
    return BigInt(a) * 10n ** 18n + BigInt(b.padEnd(18, "0"))
  }
  const format = (n) => {
    const f = (n % 10n ** 18n).toString().padStart(18, "0").replace(/0+$/, "")
    return `${n / 10n ** 18n}${f ? "." + f : ""}`
  }
  const functions = [
    {
      id: "increment",
      signature: "increment()",
      selector: "0xd09de08a",
      needsAmount: false,
      label: "increment()",
      note: "Human +1 · agent +10",
    },
    {
      id: "pay",
      signature: "pay()",
      selector: "0x1b9265b8",
      needsAmount: false,
      label: "pay()",
      note: "Human 0.001 ETH · agent 0.0001 ETH",
    },
    {
      id: "payAmount",
      signature: "payAmount(uint256)",
      selector: "0x5f936256",
      needsAmount: true,
      label: "payAmount(uint256)",
      note: "Explicit amount · agent spend counts against the grant",
    },
  ]
  let state = {
    ok: true,
    checkedAt: new Date().toISOString(),
    network: {
      chainId: 1337,
      rpc: "fixture://local-tests-only",
      sidecar: "fixture://sidecar",
      blockNumber: "1000",
    },
    contracts: {
      counter: address(1),
      registry: address(2),
      agentAccount: address(3),
      owner: address(4),
      agentKey: address(5),
    },
    counter: {
      humanCount: "0",
      agentCount: "0",
      humanPaid: "0",
      agentPaid: "0",
      humanPrice: "1000000000000000",
      agentPrice: "100000000000000",
      humanPriceEth: "0.001",
      agentPriceEth: "0.0001",
    },
    grant: {
      owner: address(4),
      agentKey: address(5),
      keyScheme: 1,
      budgetPerEpoch: wei("0.5").toString(),
      budgetEth: "0.5",
      epochLength: "86400",
      epochLengthSec: 86400,
      expiresAt: String(Math.floor(Date.now() / 1000) + 86400 * 7),
      expiresInSec: 86400 * 7,
      active: true,
      version: "1",
      grantHash: hash(),
      epoch: "1",
      spent: "0",
      spentEth: "0",
      remaining: wei("0.5").toString(),
      remainingEth: "0.5",
    },
    allowlist: { increment: true, pay: true, payAmount: true },
    functions,
    agentBalance: wei("2").toString(),
    agentBalanceEth: "2",
    intentNonce: "0",
    history: [],
  }
  const requests = []
  const sync = () => {
    state.checkedAt = new Date().toISOString()
    const remaining =
      BigInt(state.grant.budgetPerEpoch) - BigInt(state.grant.spent)
    state.grant.remaining = (remaining > 0n ? remaining : 0n).toString()
    state.grant.remainingEth = format(BigInt(state.grant.remaining))
  }
  const send = (res, status, body) => {
    res.writeHead(status, {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
    })
    res.end(JSON.stringify(body))
  }
  const server = createServer(async (req, res) => {
    try {
      if (req.url === "/api/state" && req.method === "GET") {
        sync()
        send(res, 200, state)
        return
      }
      if (req.url === "/api/health") {
        send(res, 200, { ok: true, fixture: true, chainId: 1337 })
        return
      }
      if (req.url === "/__fixture/requests") {
        send(res, 200, requests)
        return
      }
      let data = ""
      for await (const chunk of req) data += chunk
      const body = data ? JSON.parse(data) : {}
      requests.push({ path: req.url, method: req.method, body })
      if (req.url === "/api/call" && req.method === "POST") {
        const fn = functions.find((f) => f.id === body.function)
        if (!fn || !["human", "agent"].includes(body.lane)) {
          send(res, 400, { error: "Invalid function or lane" })
          return
        }
        const lane = body.lane
        const before = structuredClone(state.counter)
        const value =
          fn.id === "increment"
            ? 0n
            : fn.id === "pay"
              ? wei(lane === "agent" ? "0.0001" : "0.001")
              : wei(body.amountEth)
        let preflight = { ok: true }
        if (lane === "agent" && !state.grant.active)
          preflight = {
            ok: false,
            code: "E_GRANT_INACTIVE",
            message: "the owner revoked the agent grant",
          }
        else if (lane === "agent" && !state.allowlist[fn.id])
          preflight = {
            ok: false,
            code: "E_TARGET_DENIED",
            message: `${fn.signature} is not allowlisted`,
          }
        else if (lane === "agent" && value > BigInt(state.grant.remaining))
          preflight = {
            ok: false,
            code: "E_EPOCH_BUDGET",
            message: "Intent exceeds the remaining epoch budget",
            budgetEth: state.grant.budgetEth,
            spentEth: state.grant.spentEth,
            remainingEth: state.grant.remainingEth,
            spendEth: format(value),
          }
        const ok = preflight.ok
        let tx
        if (ok) {
          tx = hash()
          state.network.blockNumber = String(+state.network.blockNumber + 1)
          const count = lane === "agent" ? "agentCount" : "humanCount"
          state.counter[count] = (
            BigInt(state.counter[count]) + (lane === "agent" ? 10n : 1n)
          ).toString()
          const paid = lane === "agent" ? "agentPaid" : "humanPaid"
          state.counter[paid] = (BigInt(state.counter[paid]) + value).toString()
          if (lane === "agent") {
            state.grant.spent = (BigInt(state.grant.spent) + value).toString()
            state.grant.spentEth = format(BigInt(state.grant.spent))
            state.intentNonce = String(+state.intentNonce + 1)
          }
        }
        sync()
        const result = {
          ok,
          lane,
          function: fn.id,
          signature: fn.signature,
          hash: tx,
          status: ok ? (lane === "agent" ? "OnChain" : "success") : "Reverted",
          blockNumber: ok ? state.network.blockNumber : null,
          gasUsed: ok ? (lane === "agent" ? "95000" : "42000") : null,
          caller:
            lane === "agent"
              ? state.contracts.agentAccount
              : state.contracts.owner,
          value: value.toString(),
          valueEth: format(value),
          spendEth: lane === "agent" ? format(value) : undefined,
          frames: lane === "agent" ? 2 : undefined,
          before,
          after: structuredClone(state.counter),
          preflight: lane === "agent" ? preflight : undefined,
          simulation:
            lane === "agent"
              ? {
                  executionStatus: ok ? "success" : "reverted",
                  executionError: ok ? null : preflight.code,
                  canonicalMempoolValid: false,
                  canonicalMempoolViolation: "foreign SLOAD",
                  frames: [
                    { gasUsed: "45000", succeeded: ok },
                    { gasUsed: "50000", succeeded: ok },
                  ],
                }
              : undefined,
          admission:
            lane === "agent"
              ? {
                  id: serial,
                  outcome: ok ? "accepted" : "rejected",
                  passed: ok ? 3 : 1,
                  failed: ok ? 0 : 1,
                  checks: [
                    { rule: "signature", verdict: "pass", frameIndex: 0 },
                    {
                      rule: "permission",
                      verdict: ok ? "pass" : "fail",
                      reason: ok ? "Live grant verified" : preflight.code,
                      frameIndex: 0,
                    },
                    {
                      rule: "execution",
                      verdict: ok ? "pass" : "skip",
                      frameIndex: 1,
                    },
                  ],
                }
              : undefined,
          error: ok ? null : preflight.message,
          at: new Date().toISOString(),
        }
        state.history.unshift(result)
        state.history = state.history.slice(0, 20)
        send(res, 200, { ok, result, state })
        return
      }
      if (req.url === "/api/permission" && req.method === "POST") {
        const txs = []
        if (body.active === false) {
          state.grant.active = false
          txs.push({ label: "revoke grant", hash: hash() })
        } else {
          if (body.budgetEth) {
            state.grant.budgetEth = body.budgetEth
            state.grant.budgetPerEpoch = wei(body.budgetEth).toString()
            state.grant.active = true
            txs.push({
              label: `grant ${body.budgetEth} ETH / 86400s`,
              hash: hash(),
            })
          }
          for (const [fn, allowed] of Object.entries(body.allow ?? {})) {
            if (state.allowlist[fn] !== allowed) {
              state.allowlist[fn] = allowed
              txs.push({
                label: `${allowed ? "allow" : "disallow"} ${fn}`,
                hash: hash(),
              })
            }
          }
        }
        state.grant.version = String(+state.grant.version + 1)
        state.grant.grantHash = hash()
        sync()
        send(res, 200, { ok: true, txs, state })
        return
      }
      send(res, 404, { error: "Not found" })
    } catch (error) {
      send(res, 400, { error: error.message })
    }
  })
  return server
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.AXON_FIXTURE_PORT ?? 8901)
  createFixtureServer().listen(port, "127.0.0.1", () =>
    console.log(`Test fixture only: http://127.0.0.1:${port}`)
  )
}
