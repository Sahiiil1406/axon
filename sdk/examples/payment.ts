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
