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
