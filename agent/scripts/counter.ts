import { readFileSync } from "node:fs"
import { parseEnv } from "node:util"
import { createPublicClient, decodeErrorResult, encodeAbiParameters, getAddress, hexToString, http, isHash, parseAbi, parseEther, toFunctionSelector, type Hex } from "viem"
import { sepolia } from "viem/chains"
import { normalize } from "viem/ens"
import { AxonClient } from "../../sdk/src/client.ts"

let stage = "setup"
let hash: Hex | undefined

async function run() {
  const [action, ...args] = process.argv.slice(2)
  const amount = action === "pay" ? args.shift() : undefined
  let name: string | undefined
  let simulateOnly = false
  while (args.length) {
    const option = args.shift()
    if (option === "--agent" && args[0] && !args[0].startsWith("--")) name = args.shift()!
    else if (option === "--simulate") simulateOnly = true
    else throw new Error("Usage: counter.ts increment|pay <ETH> [--agent <name>] [--simulate]")
  }
  if (action !== "increment" && action !== "pay") throw new Error("Choose increment or pay <ETH>.")
  if (action === "pay" && (!amount || !/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(amount) || !/[1-9]/.test(amount)))
    throw new Error("Payment amount must be a positive ETH decimal with at most 18 decimal places.")

  const env = { ...parseEnv(readFileSync(new URL("../../final/server/.env", import.meta.url), "utf8")), ...process.env }
  const required = (key: string) => {
    if (!env[key]) throw new Error(`Missing ${key} in Axon's server environment.`)
    return env[key]!
  }
  const chainId = Number(required("CHAIN_ID"))
  if (chainId !== 1337) throw new Error("This demo only submits on Axon devnet chain 1337.")
  const target = getAddress(required("FINAL_COUNTER_ADDRESS"))
  const rpc = required("RPC")
  const sidecar = required("SIDECAR")
  let account: Hex
  let namedKey: Hex | undefined
  if (name) {
    name = normalize(name)
    const ens = createPublicClient({ chain: sepolia, transport: http(required("SEPOLIA_RPC"), { timeout: 8000, retryCount: 0 }) })
    if (await ens.getChainId() !== sepolia.id) throw new Error("ENS RPC is not connected to Sepolia.")
    const resolver = getAddress(required("ENS_REGISTRY"))
    const abi = parseAbi(["function text(string name, string key) view returns (string)"])
    const resolvedName = name
    const [accountRecord, keyRecord] = await Promise.all(["axon.account", "axon.agentKey"].map(key =>
      ens.readContract({ address: resolver, abi, functionName: "text", args: [resolvedName, key] })
    ))
    if (!accountRecord || !keyRecord) throw new Error(`No Axon account binding for ${name}.`)
    account = getAddress(accountRecord)
    namedKey = getAddress(keyRecord)
  } else {
    account = getAddress(required("ACCOUNT_ADDRESS"))
  }
  const client = new AxonClient({
    account, registry: getAddress(required("REGISTRY_ADDRESS")), vault: target, oracle: target,
    agentPrivateKey: required("AGENT_PRIVATE_KEY") as Hex, rpc, sidecar, chainId,
  })
  if (await client.publicClient.getChainId() !== chainId) throw new Error("Execution RPC chain ID mismatch.")
  const [grant, nonce, now, remaining] = await Promise.all([
    client.getGrant(), client.getIntentNonce(), client.getBlockTimestamp(), client.remainingBudget(),
  ])
  if ((namedKey && client.agentAddress.toLowerCase() !== namedKey.toLowerCase()) ||
      client.agentAddress.toLowerCase() !== grant.agentKey.toLowerCase())
    throw new Error("Configured agent signer does not match the name and live grant.")
  const signature = action === "pay" ? "payAmount(uint256)" : "increment()"
  const value = amount ? parseEther(amount) : 0n
  const intent = {
    target, selector: toFunctionSelector(signature),
    args: value ? encodeAbiParameters([{ type: "uint256" }], [value]) : "0x" as Hex,
    value, spend: value, nonce, deadline: now + 3600n, grantHash: grant.grantHash,
  }
  const allowed = await client.isAllowed(target, intent.selector)
  const policy = { active: grant.active, allowed, remainingWei: remaining.toString(), requestedWei: value.toString() }
  stage = "simulation"
  const prepared = await client.prepare(intent)
  const { result: simulated } = await client.simulateIntent(intent, { prepared })
  const simulation = {
    status: simulated.executionStatus, error: simulated.executionError,
    frames: simulated.frames, canonicalMempoolViolation: simulated.canonicalMempoolViolation,
  }
  const diagnosis = simulated.frames?.[0]?.succeeded && simulated.frames[1]?.succeeded === false && value > remaining
    ? "Simulation indicates the SENDER frame exceeded the remaining epoch budget." : undefined
  const details = { name: name ?? "default", account, action: signature, policy, simulation, diagnosis }
  if (simulateOnly) return { ...details, outcome: "simulated" }

  // Submit exactly once. The SDK's general RPC helper can retry transport errors.
  stage = "submission"
  const response = await fetch(sidecar, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_sendFrameTransaction", params: [prepared.json] }),
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error(`Sidecar returned HTTP ${response.status}.`)
  const payload = await response.json()
  if (payload.error) {
    const reason = String(payload.error.message ?? "Sidecar rejected the request.")
    const frame = reason.match(/validation frame (\d+): reverted with data (0x[\da-f]+)/i)
    let code: string | undefined
    if (frame) {
      try {
        const decoded = decodeErrorResult({ abi: parseAbi(["error Rejected(bytes32)"]), data: frame[2] as Hex })
        code = hexToString(decoded.args[0]).replace(/\0+$/, "")
      } catch { /* Preserve the original node message. */ }
    }
    return { ...details, outcome: "rejected", frame: frame ? Number(frame[1]) : undefined, code, reason }
  }
  if (!isHash(payload.result)) throw new Error("Sidecar did not return a valid transaction hash.")
  hash = payload.result
  stage = "inclusion"
  const status = await client.waitForStatus(hash)
  const [admission, receipt] = await Promise.all([
    client.getAdmission(hash).catch(() => null),
    client.publicClient.getTransactionReceipt({ hash }).catch(() => null),
  ])
  const failedFrame = admission?.frameStatuses?.findIndex(frame => ["failure", "reverted", "failed"].includes(frame))
  const reverted = status === "Reverted" || receipt?.status === "reverted" || (failedFrame ?? -1) >= 0
  const included = receipt?.status === "success" || status === "OnChain" || status === "Finalized"
  const outcome = reverted ? "reverted" : included ? "confirmed" : status === "Cancelled" ? "cancelled" : "pending"
  return { ...details, outcome, status, hash, explorer: `https://altmempoolexplorer.forshtat.com/tx/${hash}`,
    frameStatuses: admission?.frameStatuses, failedFrame: reverted && (failedFrame ?? -1) >= 0 ? failedFrame : undefined }
}

try {
  const result = await run()
  console.log(JSON.stringify(result, null, 2))
  process.exitCode = ["confirmed", "simulated"].includes(result.outcome) ? 0 : result.outcome === "pending" ? 2 : 1
} catch (error) {
  // Avoid printing transport details that can contain private RPC URLs.
  const reason = stage === "setup" || stage === "simulation"
    ? (error as Error).message.split("\n")[0].replace(/https?:\/\/\S+/g, "[RPC URL]")
    : "Submission or inclusion could not be confirmed. Check transaction status before retrying."
  const outcome = stage === "submission" || stage === "inclusion" ? "uncertain" : "error"
  console.log(JSON.stringify({ outcome, stage, reason, hash, explorer: hash && `https://altmempoolexplorer.forshtat.com/tx/${hash}` }, null, 2))
  process.exitCode = outcome === "uncertain" ? 2 : 1
}
