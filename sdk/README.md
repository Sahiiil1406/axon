# Axon SDK guide

The Axon SDK builds, signs, simulates and submits EIP-8141 agent-account transactions. An owner defines permission in a live registry; an agent key signs an action within that authority; the account and destination protocol enforce the rules. This guide documents the checked-in implementation, including its current limitations.

## 1. What the SDK does

AxonClient operates on one configured agent account. It reads grants and budgets, converts manifest actions into intents, prepares a signed two-frame transaction, simulates it against the execution RPC, submits it through the alternative-mempool sidecar and polls for a result. Lower-level exports expose intent encoding, frame construction, serialization and signing.

The SDK does not deploy accounts, connect browser wallets, verify World ID proofs, grant owner permissions or register ENS names through high-level client methods. Those tasks belong to your application onboarding and owner-authorized contract transactions. The existing demo server implements some of that orchestration separately.

The SDK has Node dependencies, including node:fs in the manifest module, and AxonClient requires an agent private key. Use it in trusted server or agent processes. Do not import this signing client into a public browser bundle or expose its private key through a VITE_ variable.

```text
Owner wallet → PermissionRegistry grant + allowed actions
Agent process → AxonClient → signed two-frame transaction
Execution RPC → simulation and canonical eligibility
Sidecar → alternative admission → inclusion on the same devnet
AgentAccount → live authority validation → protocol execution
```

## 2. Install and run locally

The package is named @axon/sdk, version 0.1.0, and is marked private. There is no published-package installation promised by this repository. The examples below use relative source imports and run from the repository through tsx. The SDK exports TypeScript sources directly, so use a TypeScript-aware runtime or a bundler configured for those sources.

From the repository root, install the SDK dependencies and run its checks. The commands below use the SDK's installed tsx binary so they do not depend on a global installation.

```bash
npm ci --prefix sdk
npm run typecheck --prefix sdk
npm test --prefix sdk

# The checked-in example is at sdk/examples/payment.ts.
# Set variables through your trusted shell or secret manager first.
./sdk/node_modules/.bin/tsx sdk/examples/payment.ts

# Explicitly opt in to sending a devnet transaction:
./sdk/node_modules/.bin/tsx sdk/examples/payment.ts --submit
```

The manifest tests expect codegen/manifest.json to exist and currently assert the historical AgentVault fixture. If that generated artifact is missing, npm test fails before those tests execute. The frame and builder suites can be run independently with: ./sdk/node_modules/.bin/tsx --test sdk/test/builder.test.ts sdk/test/frame.test.ts. Generating a manifest requires the compiled contracts and matching deployment metadata; do not fabricate addresses just to satisfy a test.

Scripts do not automatically load every .env file. Explicitly configure environment loading in your runner, or export the variables before starting it. The demo server has its own environment-loading behavior; that is not a feature of AxonClient.

## 3. Prerequisites and deployment configuration

You need an EIP-8141-compatible RPC, a compatible sidecar, a deployed PermissionRegistry, a deployed AgentAccount registered to its owner, and a deployed agent-native target. A normal Ethereum RPC without these experimental frame methods cannot execute this flow. The account needs funds for execution and the stake required by the sidecar's admission rules.

The agent key must match the active grant. The target address and function selector must be allowlisted. Confirm addresses after a devnet reset: old addresses can have no code or refer to unrelated deployments. Read final/deployment.json for the integrated demo rather than copying an address from an old screenshot.

Configuration is explicit. AxonClient does not read environment variables, deployment files or a manifest automatically. Your application passes those values into the constructor.

| Field | Required | Meaning |
| --- | --- | --- |
| account | Yes | AgentAccount that will validate and execute the action |
| registry | Yes | PermissionRegistry used for grant and scope reads |
| vault | Yes | Vault address for getVaultState; not the generic action target |
| oracle | Yes | Oracle address for getVaultState |
| agentPrivateKey | Yes | Agent signing key in trusted runtime memory |
| chainId | No | Defaults to 1337; must match the execution network |
| rpc | No | Defaults to https://altmempool.forshtat.com |
| sidecar | No | Defaults to https://altmempool.forshtat.com/rpc |
| stakingRegistry | No | Stored configuration; the client does not automatically stake |
| ensRpc | No | Separate Sepolia RPC enabling ENS resolution |
| ensChainId | No | Defaults to 11155111; see the ENS implementation caveat below |

vault and oracle are required by the current TypeScript interface even if your target is FinalCounter. For a non-vault integration, explicitly use zeroAddress for those two unused fields and do not call getVaultState. This is an interface limitation, not a requirement that every protocol deploy a vault and oracle.

```typescript
// sdk/examples/config.ts
import { AxonClient } from "../src/index.ts";
import { isAddress, isHex, zeroAddress, type Address, type Hex } from "viem";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}
function address(name: string): Address {
  const value = required(name);
  if (!isAddress(value)) throw new Error(`Invalid address: ${name}`);
  return value;
}
const key = required("AGENT_PRIVATE_KEY");
if (!isHex(key) || key.length !== 66) {
  throw new Error("AGENT_PRIVATE_KEY must be a 32-byte hex key");
}
export const client = new AxonClient({
  account: address("ACCOUNT_ADDRESS"),
  registry: address("REGISTRY_ADDRESS"),
  vault: zeroAddress,  // Not using the vault-specific reader.
  oracle: zeroAddress,
  agentPrivateKey: key as Hex,
  chainId: 1337,
  rpc: required("RPC"),
  sidecar: required("SIDECAR"),
  ensRpc: process.env.ENS_RPC,
});
export const counterAddress = address("COUNTER_ADDRESS");
```

AxonClient exposes config, publicClient, ensPublicClient and agentAddress. agentAddress is derived from the supplied private key, not copied from registry data. Changing the grant does not silently replace the client's signer.

## 4. Complete payment example

This example targets FinalCounter.payAmount(uint256). It uses the integrated demo's agent payment amount, 0.0001 ETH. The destination contract, allowlist, active grant, account funding and required stake must already exist. No owner key is needed in this payment script.

The manifest action below is constructed explicitly to make each field visible. In a larger integration, load the generated manifest instead. The action ID is application metadata; the function signature determines the selector. The amount argument, transferred value and declared spend agree for this payment.

```typescript
// sdk/examples/payment.ts
import { parseEther, toFunctionSelector } from "viem";
import type { ManifestAction } from "../src/index.ts";
import { client, counterAddress } from "./config.ts";

const payment: ManifestAction = {
  id: "FinalCounter.payAmount",
  contract: "FinalCounter",
  address: counterAddress,
  name: "payAmount",
  signature: "payAmount(uint256)",
  selector: toFunctionSelector("payAmount(uint256)"),
  inputs: [{ name: "amount", type: "uint256" }],
  outputs: [{ name: "lane", type: "uint8" }, { name: "step", type: "uint256" }],
  stateMutability: "payable",
  description: "Pay a positive amount through the agent account",
  policy: [], // Metadata is not a substitute for onchain protocol checks.
  source: "final/contract/src/FinalCounter.sol",
};

const grant = await client.getGrant();
if (!grant.active) throw new Error("Owner must activate the grant");
if (grant.agentKey.toLowerCase() !== client.agentAddress.toLowerCase()) {
  throw new Error("Configured agent key does not match the live grant");
}
if (!await client.isAllowed(counterAddress, payment.selector)) {
  throw new Error("Owner must allow FinalCounter.payAmount");
}

const amount = parseEther("0.0001");
if (await client.remainingBudget() < amount) {
  throw new Error("Insufficient remaining epoch budget");
}
const intent = await client.buildIntent(
  payment,
  { amount: amount.toString() },
  { value: amount, spend: amount, deadlineSeconds: 300 },
);
const prepared = await client.prepare(intent);
const { result: simulation } = await client.simulateIntent(intent, { prepared });
console.log("Execution:", simulation.executionStatus);
console.log("Canonical eligible:", simulation.canonicalMempoolValid);
console.log("Canonical reason:", simulation.canonicalMempoolViolation);

if (simulation.executionError || simulation.frames?.some(f => !f.succeeded)) {
  throw new Error(client.explain(simulation.executionError ?? "Frame failed"));
}
if (!simulation.frames || simulation.frames.length !== 2) {
  throw new Error("Expected two simulated frames; inspect the RPC response");
}

// Default to simulation only. Sending requires an explicit CLI flag.
if (!process.argv.includes("--submit")) {
  console.log("Simulation complete. Pass --submit to send on the devnet.");
  process.exit(0);
}

// A canonical storage violation alone does not mean execution failed.
// Submission still has to pass the sidecar's alternative admission checks.
const submitted = await client.submitIntent(intent, {
  prepared,
  timeoutMs: 90_000,
  pollMs: 3_000,
});
console.log("Transaction:", submitted.hash);
console.log("Status:", submitted.status);
console.log("Admission:", await client.getAdmission(submitted.hash));
if (submitted.status === "Reverted" || submitted.status === "Cancelled") {
  throw new Error(`Transaction ended as ${submitted.status}`);
}
```

The state reads before building are useful feedback, not a reservation of authority. The owner can revoke the grant or another action can consume budget before inclusion. The account enforces the current rules during validation and execution.

## 5. Read authority before acting

getGrant(account?) reads registry.current. Omitting the argument uses config.account. The returned Grant contains owner, agentKey, keyScheme, budgetPerEpoch, epochLength, expiresAt, active, version and grantHash. Monetary quantities and timestamps are bigint values; expiry is in seconds, not JavaScript milliseconds.

isAllowed(target, selector, account?) checks one target-selector pair. It does not enumerate the entire allowlist. getIntentNonce, remainingBudget and getSpent read the configured account. Unlike getGrant and isAllowed, those three methods do not accept a different account argument.

```typescript
import { formatEther, toFunctionSelector } from "viem";
import { client, counterAddress } from "./config.ts";

const [grant, budget, nonce, timestamp] = await Promise.all([
  client.getGrant(),
  client.remainingBudget(),
  client.getIntentNonce(),
  client.getBlockTimestamp(),
]);
console.log({
  owner: grant.owner,
  signer: grant.agentKey,
  active: grant.active,
  version: grant.version.toString(),
  grantHash: grant.grantHash,
  remainingETH: formatEther(budget),
  nonce: nonce.toString(),
  expiresAt: new Date(Number(grant.expiresAt) * 1000).toISOString(),
  expired: grant.expiresAt <= timestamp,
});
const selector = toFunctionSelector("payAmount(uint256)");
console.log("Allowed:", await client.isAllowed(counterAddress, selector));
// Supply the epoch index whose recorded spend you want to inspect.
if (grant.epochLength === 0n) throw new Error("No initialized policy epoch");
const epoch = timestamp / grant.epochLength;
console.log("Recorded spend:", await client.getSpent(epoch));
```

Check that epochLength is nonzero before computing an epoch for uninitialized or untrusted data. Prefer the chain timestamp from getBlockTimestamp over your machine clock when interpreting onchain deadlines. Reading several values with Promise.all does not pin them to one block; this SDK does not expose snapshot block parameters on these helpers.

## 6. Understand every intent field

An Intent describes the action to execute, not an owner permission grant. It cannot give itself more authority. buildIntent reads the current grant, account intent nonce and latest block timestamp, coerces the manifest arguments, ABI-encodes the call and separates its first four bytes from the remaining argument bytes.

| Field | Type | Purpose |
| --- | --- | --- |
| target | address | Destination protocol contract |
| selector | bytes4 | First four bytes identifying the function |
| args | bytes | ABI-encoded arguments without the selector |
| value | bigint | Native ETH value transferred to the target |
| spend | bigint | Declared spend checked against account policy |
| nonce | bigint | Account intent replay-protection counter |
| deadline | bigint | Absolute chain timestamp in seconds |
| grantHash | bytes32 | Binds the action to the live grant version |

buildIntent(action, rawArgs, options?) accepts value, spend, deadlineSeconds and grantHash. value defaults to 0n. spend defaults to value, then 0n. deadlineSeconds defaults to 3600. deadlineSeconds is a duration; the SDK adds it to the latest block timestamp. An action with address: null throws because there is no deployed target.

The grantHash override exists for controlled tests such as stale-authority demonstrations. Supplying it also bypasses buildIntent's default inactive-grant check. It does not bypass the account's onchain validation. Avoid it in ordinary execution code.

```typescript
// A nonpayable action with no arguments.
const incrementIntent = await client.buildIntent(incrementAction, {}, {
  value: 0n,
  spend: 0n,
  deadlineSeconds: 120,
});

// A payable action: use bigint wei, not a floating-point ETH number.
const paymentIntent = await client.buildIntent(paymentAction, {
  amount: "100000000000000", // Decimal JSON-safe integer string.
}, {
  value: 100000000000000n,
  spend: 100000000000000n,
  deadlineSeconds: 300,
});
```

incrementAction and paymentAction above stand for ManifestAction objects loaded or defined by your application. buildIntent does not run a full policy preflight: it does not guarantee scope, remaining budget, expiry, signer validity or protocol acceptance. Simulate and let the contracts enforce the rules.

## 7. Work with action manifests

A Manifest has version: 1, chainId, network, generatedAt and actions. Each ManifestAction describes a deployed address, canonical function signature, selector, named inputs, outputs, mutability, description, policy metadata and source path. codegen/ produces this metadata from annotated Solidity, compiled ABIs and deployment information.

loadManifest reads JSON from disk. It parses rather than fully validates the document at runtime, so use trusted generated files and validate deployment addresses for your environment. findAction searches by exact ID first, then name, then selector. Prefer a unique ID when multiple contracts expose the same function name.

```typescript
import {
  loadManifest, findAction, actionsFor,
  coerceArgs, encodeActionCall, selectorOf, inputSchema,
} from "../src/index.ts";

const manifest = loadManifest("./codegen/manifest.json");
const action = findAction(manifest, "FinalCounter.payAmount");
console.log(actionsFor(manifest, "FinalCounter"));
console.log("Selector:", selectorOf(action));
console.log("Tool schema:", inputSchema(action));

const values = coerceArgs(action, { amount: "100000000000000" });
const calldata = encodeActionCall(action, values);
console.log("Full calldata:", calldata);
// A different manifest may use a different action ID or omit FinalCounter.
```

coerceArgs rejects unknown top-level keys and missing named arguments. Integer arguments accept bigint, safe integer numbers or unsigned decimal strings. Boolean arguments must be actual booleans. Dynamic arrays require arrays; tuple inputs use objects with the expected component names. Address and string inputs are passed through; ABI encoding performs additional checks. This is not a comprehensive standalone input-validation layer.

inputSchema produces a small JSON Schema intended for tool inputs. It sets additionalProperties: false at the top level and represents integers as decimal strings. It is not a complete Solidity type-system validator; do not assume every fixed-size array or exotic ABI type is handled by its simplified conversion.

```typescript
// Example raw arguments for an action declaring these exact input names.
const raw = {
  amount: "1000000000000000000",
  enabled: true,
  recipients: ["0x1111111111111111111111111111111111111111"],
  limits: { maxSpend: "500", expiresAt: "1900000000" },
};
// coerceArgs(action, raw) converts integers and preserves ABI argument order.
// An undeclared key or omitted required argument throws before signing.
```

## 8. Prepare once, simulate and submit the same transaction

prepare(intent) returns tx, raw and json. tx is the in-memory FrameTx; raw is its encoded transaction bytes; json is the sidecar submission representation. prepare reads the execution transaction nonce using eth_getTransactionCount(account, latest) and signs with the configured agent key.

There are two distinct nonces: intent.nonce is read from AgentAccount.intentNonce; the envelope nonceSeq comes from the execution RPC transaction count. They serve different layers of replay protection. Do not substitute one for the other. The current client does not reserve pending nonces or serialize concurrent submissions.

```typescript
const intent = await client.buildIntent(action, args, options);
const prepared = await client.prepare(intent);

const simulation = await client.simulateIntent(intent, { prepared });
// Review simulation.result before proceeding.
const submission = await client.submitIntent(intent, { prepared });
console.log(submission.raw === simulation.raw); // true
```

If you omit prepared, simulateIntent and submitIntent each call prepare independently. State or the envelope nonce can change between those calls, so you cannot assume the signed bytes will be identical. Passing prepared is the explicit way to preserve the exact transaction.

When prepared is supplied, simulation uses prepared.raw and submission uses prepared.json. The methods do not verify that these representations match each other or the intent argument. Keep the original prepare result together; do not edit its raw bytes or JSON independently. Treat signed transaction data as sensitive operational data because it may be relayable while valid.

## 9. Interpret simulation correctly

simulateIntent calls ethrex_simulateFrameTransaction(raw, latest, { trace: true }) on config.rpc. It returns result and raw. Inspect executionError, executionStatus and frames for execution behavior, and canonicalMempoolValid plus canonicalMempoolViolation for public-mempool eligibility. The trace, trace error, gas, maxCost, payer and prefixShape provide additional diagnostics.

A transaction can simulate successfully while being canonically ineligible. In the live-registry demo, StorageReadNonSender indicates a foreign storage read during validation. That is why this account uses alternative admission. It does not mean every canonical failure is safe to ignore or that the sidecar must accept the transaction.

```typescript
const { result } = await client.simulateIntent(intent, { prepared });
console.table((result.frames ?? []).map((frame, index) => ({
  frame: index,
  succeeded: frame.succeeded,
  gasUsed: frame.gasUsed,
})));
if (result.executionError) {
  console.error(client.explain(result.executionError));
}
if (!result.canonicalMempoolValid) {
  console.warn(client.explain(result.canonicalMempoolViolation));
}
if (result.erc7562TraceError) {
  console.warn("Trace unavailable:", result.erc7562TraceError);
}
```

The SDK does not automatically block submission after an unsuccessful simulation. Your application must decide whether the response is complete and acceptable. A simulation is a latest-state observation, not a guarantee about the eventual inclusion state.

## 10. Submission, status and admission reports

submitIntent sends prepared.json with eth_sendFrameTransaction to config.sidecar, then polls skandha_frameTransactionStatus. Its result contains hash, status, raw and tx. Default polling is every 3000 milliseconds for up to 90000 milliseconds, excluding any extra time spent inside RPC requests.

The status values are New, Pending, Submitted, OnChain, Finalized, Reverted and Cancelled. waitForStatus stops at OnChain, Finalized, Reverted or Cancelled. OnChain is therefore a returned stopping point, not a promise that the SDK waited for finality. If the polling window expires, it returns the last observed status rather than throwing a timeout error.

```typescript
const submitted = await client.submitIntent(intent, {
  prepared,
  timeoutMs: 120_000,
  pollMs: 2_000,
});
if (["New", "Pending", "Submitted"].includes(submitted.status)) {
  console.log("Still unresolved; retain the hash and reconcile later");
  const later = await client.waitForStatus(submitted.hash, 60_000, 3_000);
  console.log("Later status:", later);
}
const admission = await client.getAdmission(submitted.hash);
if (admission) {
  console.log("Admission outcome:", admission.outcome);
  console.table(admission.checks);
}
```

getAdmission calls skandha_explorer_getTransaction and returns its admission field or null. Null means no admission record was returned; it does not establish success or failure. Preserve the hash and inspect the chain receipt separately when your application needs explicit receipt evidence. Distinguish admission rejection, execution revert and successful execution in the UI.

Transport and HTTP errors are retried up to four attempts with increasing delays. JSON-RPC errors are treated as deterministic and are not retried by that helper. There is no explicit fetch timeout or AbortSignal option. A transport failure during submission can be ambiguous: do not blindly rebuild and send a new action without reconciling the original transaction and account state.

## 11. ENS identity and account selection

Set ensRpc to enable a separate Sepolia public client. normalizeEnsName normalizes an ENS name; resolveEnsAddress resolves its address; getEnsTextRecord reads a text record; resolveAgent reads axon.account and axon.agentKey, validates their address format, reads the live grant for that account and requires the record key to match the grant key.

resolveAgent(name, selectors?) returns AgentPermission or null. Its allowlist contains only the supplied target-selector pairs that currently pass isAllowed; it is not a full onchain enumeration. Its textRecords field is currently an empty object. The returned budget is budgetPerEpoch, not remainingBudget.

```typescript
const identity = await client.resolveAgent("treasury.example.eth", [
  { target: counterAddress, selector: paymentAction.selector },
]);
if (!identity || !identity.account || !identity.agentKey) {
  throw new Error("Missing or inconsistent ENS agent identity");
}
console.log(identity.name, identity.active, identity.allowlist);

// Resolution does not change the existing client's configured account.
if (identity.account.toLowerCase() !== client.config.account.toLowerCase()) {
  throw new Error("Select a client configured for the resolved account");
}
if (identity.agentKey.toLowerCase() !== client.agentAddress.toLowerCase()) {
  throw new Error("The configured signer does not own this agent identity");
}
```

With no ensRpc, resolveAgent returns null. An active flag of false can still be returned for a correctly linked but revoked grant. DNS-like naming is identity context, not permission to execute. Validate live authority regardless of the name shown in the UI.

Although ensChainId is stored in configuration, the current ENS public client is explicitly created with viem's sepolia chain. Changing ensChainId alone does not implement arbitrary-chain ENS resolution. ENS writes, name registration and World ID verification are not methods on this SDK client.

## 12. Demonstrate live revocation safely

A useful test prepares a transaction under an active grant, pauses, lets the owner revoke that grant, then resimulates the exact signed bytes. This demonstrates live authority without silently replacing the transaction with a freshly built one.

```typescript
// Phase A: agent process, while the grant is active.
const intent = await client.buildIntent(action, args, options);
const prepared = await client.prepare(intent);
const before = await client.simulateIntent(intent, { prepared });
console.log("Before:", before.result);

// Pause here. In a separate owner-authorized flow, revoke this account's
// grant and wait for that transaction to be included. The SDK does not
// provide a client.revoke() convenience method.

// Phase B: same process, after the owner transaction is included.
const grantAfter = await client.getGrant();
if (grantAfter.active) throw new Error("Wait for owner revocation first");
const after = await client.simulateIntent(intent, { prepared });
console.log("After:", after.result);
console.log("Identical signed bytes:", before.raw === after.raw);
```

Inspect the actual rejection: a revoked grant or stale hash is expected to fail the corresponding account checks, but error presentation depends on the RPC response. Do not automatically rebuild the intent after revocation. Restore permission only through an explicit owner-authorized action before continuing normal demonstrations.

## 13. Lower-level frame construction

Use the builder functions when you need explicit gas limits or envelope fields. AxonClient.prepare currently uses builder defaults and does not expose all BuildOptions. buildAgentFrameTx creates an unsigned structure, signAgentFrameTx fills signature entry zero and mutates that structure, and buildSignedAgentTx combines both operations.

```typescript
import {
  buildSignedAgentTx, toFrameTxJson, encodeFrameTx, bytesToHex,
} from "../src/index.ts";

const tx = buildSignedAgentTx({
  account: client.config.account,
  agentKey: client.agentAddress,
  agentPrivateKey: client.config.agentPrivateKey,
  intent,
  chainId: BigInt(client.config.chainId),
  nonceSeq: 7n, // Example only: read the correct envelope nonce from RPC.
  verifyGas: 100_000n,
  verifyStateGas: 0n,
  executeGas: 600_000n,
  executeStateGas: 500_000n,
  maxPriorityFeePerGas: 1n,
  maxFeePerGas: 9n,
});
const raw = bytesToHex(encodeFrameTx(tx));
const json = toFrameTxJson(tx);
// Keep these two representations together when simulating/submitting.
```

Default builder values: chainId 1337n, nonceKeys [0n], priority fee 1n, max fee 9n, VERIFY execution gas 80000n, VERIFY state gas 0n, SENDER execution gas 500000n and SENDER state gas 500000n. Fees are integer wei-per-gas values, not gwei. These defaults are devnet choices, not portable production estimates.

The first frame is VERIFY with execution-and-payment scope; the second is SENDER. Both target the sender implicitly through target: null. Their outer value is zero; the encoded intent carries the target payment. Signature entry zero is SECP256K1 with an explicit agent signer. Entry one is an ARBITRARY structural witness. The agent signs the frame transaction hash, not an Ethereum personal-sign message or a detached intent digest.

signAgentFrameTx uses computeSigHash(tx, "empty") for this devnet's hashing convention. Do not replace it with wallet.signMessage or assume another EIP-8141 deployment uses identical wire behavior. toFrameTxJson hex-encodes numeric fields for the sidecar; encodeFrameTx produces the raw transaction encoding.

## 14. Errors and recovery examples

client.explain(reason) translates known account and protocol codes, can decode hex-encoded ASCII reasons, and provides generic explanations for Storage and OP- prefixed violations. It is not a complete ABI custom-error decoder. Preserve raw diagnostics alongside readable text.

| Code or symptom | Meaning | Recovery |
| --- | --- | --- |
| E_NO_GRANT | No grant for the account | Complete owner registration and permission setup |
| E_GRANT_INACTIVE | Grant revoked | Owner must explicitly restore authority |
| E_GRANT_STALE | Intent uses an older grant hash | Review current policy, then rebuild and sign if still authorized |
| E_BAD_SIG | Signer differs from the granted key | Check the configured key and live grant |
| E_NONCE | Intent nonce is no longer current | Reconcile earlier actions before building another intent |
| E_TARGET_DENIED | Target and selector not allowed | Ask the owner for the required scope |
| E_EPOCH_BUDGET | Spend exceeds available policy budget | Reduce spend or request an owner policy change |
| E_EXPIRED / E_DEADLINE | Grant or intent expired | Renew owner authority or build a fresh authorized intent |
| E_PROTOCOL / E_CALL_FAILED | Destination rules or call failed | Inspect protocol diagnostics and action arguments |
| StorageReadNonSender | Canonical foreign-storage restriction | Inspect simulation and use the configured alternative admission path |
| Missing contract code | Wrong address or reset devnet | Reload deployment configuration and verify the network |
| Pending after timeout | No terminal status within polling window | Retain the hash and poll/reconcile; do not assume failure |

```typescript
try {
  const result = await client.submitIntent(intent, { prepared });
  console.log(result.hash, result.status);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error("Readable:", client.explain(message));
  // If message contains a wrapped RPC error rather than a bare reason code,
  // inspect the original response; explain() does not parse every wrapper.
  throw error;
}
```

Handle scope denial by requesting owner approval, not by changing the target selector to evade a check. Handle stale authority by reviewing the new policy before signing again. A model or agent planner must never decide to grant itself a larger budget.

## 15. Integrate with an application or agent runtime

Keep owner authorization, agent signing and browser presentation separate. The browser requests a scoped action through your authenticated application API. A trusted agent process builds and signs it. The backend should verify that the requesting user is allowed to operate the selected account before touching its signer; a valid onchain permission is not a substitute for application authentication.

Serialize actions per account in the current implementation. Building two intents concurrently can read the same intent nonce, and prepare uses latest rather than a pending nonce reservation. For multi-user services, maintain an explicit account-to-signer association and reconcile unresolved transactions before issuing replacements.

```typescript
// Simplified application orchestration, not an HTTP-auth implementation.
async function runAuthorizedAction() {
  const intent = await client.buildIntent(action, args, options);
  const prepared = await client.prepare(intent);
  const simulation = await client.simulateIntent(intent, { prepared });
  await reviewSimulation(simulation.result); // Your policy/UI decision.
  const submission = await client.submitIntent(intent, { prepared });
  return {
    hash: submission.hash,
    status: submission.status,
    admission: await client.getAdmission(submission.hash),
  };
}
// action, args, options and reviewSimulation are application-supplied.
// Run this through an account-scoped queue, not concurrent fire-and-forget.
```

The repository's agent/ runtime already separates observation, planning, intent construction, simulation, optional submission and explanation. An optional LLM chooses candidate actions and arguments. A manifest describes available tools; the account and protocol remain the final authority boundary. Neither a manifest nor a successful model response grants permission.

getVaultState is a protocol-specific convenience reader for vault deposits, positions, cooldown, trade limits, oracle values and timestamps. Use it only with compatible vault and oracle contracts. For FinalCounter or a custom protocol, read that protocol's ABI through publicClient instead.

## 16. API reference and implementation map

| API | Result / behavior |
| --- | --- |
| new AxonClient(config) | Configures one execution account and agent signer |
| getGrant(account?) | Promise of Grant from live registry |
| isAllowed(target, selector, account?) | Promise of boolean for one scope pair |
| getIntentNonce() | Promise of configured account intent nonce |
| remainingBudget() | Promise of current available policy budget |
| getSpent(epoch) | Promise of spend recorded for an epoch |
| getBlockTimestamp() | Promise of latest block timestamp |
| getVaultState() | Promise of compatible vault/oracle state |
| normalizeEnsName(name) | Normalized ENS string |
| resolveEnsAddress(name) | Promise of address or null |
| getEnsTextRecord(name, key) | Promise of text value or null |
| resolveAgent(name, selectors?) | Promise of verified identity binding or null |
| buildIntent(action, args, opts?) | Promise of Intent; does not sign |
| prepare(intent) | Promise of signed tx, raw and json |
| simulateIntent(intent, opts?) | Promise of result and raw bytes |
| submitIntent(intent, opts?) | Promise of hash, last status, raw and JSON tx |
| waitForStatus(hash, timeoutMs?, pollMs?) | Promise of settled or last observed status |
| getAdmission(hash) | Promise of admission record or null |
| explain(reason) | Human-readable diagnostic string |
| loadManifest / findAction / actionsFor | Read and select generated action metadata |
| coerceArgs / encodeActionCall / actionAbi | Convert inputs and build function ABI/calldata |
| selectorOf / inputSchema | Derive selector and simplified tool schema |
| encodeIntent / encodeValidate / encodeExecute | Encode intent and account entrypoint calldata |
| buildAgentFrameTx / signAgentFrameTx | Construct and sign low-level frame transactions |
| buildSignedAgentTx / toFrameTxJson | Combined builder and sidecar JSON conversion |

Implementation sources: sdk/src/client.ts contains RPC orchestration and readers; builder.ts contains intents and signing; manifest.ts contains metadata helpers; frame/ contains types, RLP, encoding and gas helpers. Tests live in sdk/test/. The demo API integration lives separately in final/server/index.ts.

## 17. Operational checklist

Before signing: confirm chain and deployed code, verify the account-to-signer association, read the active grant, check target scope, estimate spend and use a short appropriate deadline. Before submitting: inspect both frame results, canonical eligibility and diagnostics, then reuse the exact prepared transaction. After submitting: retain the hash, distinguish unresolved from terminal states, inspect admission and receipt evidence, and reconcile state before the next action.

This SDK is a devnet prototype. It does not currently provide a browser wallet adapter, a deployment factory client, owner-write convenience methods, automatic funding/staking, a durable nonce queue, a finality guarantee, a complete error decoder or arbitrary-network ENS configuration. Build those application capabilities explicitly rather than assuming constructor configuration enables them.
