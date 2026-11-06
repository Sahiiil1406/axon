import solc from "solc";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");
const input = {language: "Solidity", sources: {"src/FinalCounter.sol": {content: readFileSync(resolve(root, "src/FinalCounter.sol"), "utf8")}}, settings: {optimizer: {enabled: true, runs: 200}, evmVersion: "cancun", outputSelection: {"*": {"*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"]}}}};
const output = JSON.parse(solc.compile(JSON.stringify(input), {import: path => {
  if (!path.startsWith("axon/")) return {error: `Unsupported import: ${path}`};
  return {contents: readFileSync(resolve(root, "../../contracts/src", path.slice(5)), "utf8")};
}}));
for (const error of output.errors ?? []) console.error(error.formattedMessage);
if ((output.errors ?? []).some(error => error.severity === "error")) process.exit(1);
const contract = output.contracts["src/FinalCounter.sol"].FinalCounter;
const dir = resolve(root, "out/FinalCounter.sol");
mkdirSync(dir, {recursive: true});
writeFileSync(resolve(dir, "FinalCounter.json"), JSON.stringify({abi: contract.abi, bytecode: {object: `0x${contract.evm.bytecode.object}`}, deployedBytecode: {object: `0x${contract.evm.deployedBytecode.object}`}}, null, 2) + "\n");
console.log(`Compiled FinalCounter with solc ${solc.version()}`);

// Build the authority contracts for a fresh devnet deployment.
for (const name of ["PermissionRegistry", "AgentAccount"]) {
  const source = `src/${name}.sol`;
  const stackInput = {...input, sources: {[source]: {content: readFileSync(resolve(root, "../../contracts", source), "utf8")}}};
  const stack = JSON.parse(solc.compile(JSON.stringify(stackInput), {import: path => {
    return {contents: readFileSync(resolve(root, "../../contracts", path), "utf8")};
  }}));
  for (const error of stack.errors ?? []) console.error(error.formattedMessage);
  if ((stack.errors ?? []).some(error => error.severity === "error")) process.exit(1);
  const compiled = stack.contracts[source][name];
  const target = resolve(root, `out/${name}.sol`);
  mkdirSync(target, {recursive: true});
  writeFileSync(resolve(target, `${name}.json`), JSON.stringify({abi: compiled.abi, bytecode: {object: `0x${compiled.evm.bytecode.object}`}}, null, 2) + "\n");
  console.log(`Compiled ${name}`);
}
