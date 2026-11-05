import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { keccak_256 } from "@noble/hashes/sha3";

/**
 * One source of truth for what an agent may call.
 *
 *   contracts/src/**\/*.sol   -- @agentAction / @agentPolicy / @agentDescription
 *            +
 *   contracts/out/**\/*.json  -- the compiled ABI
 *            +
 *   deployments.json          -- where the contract lives
 *            ↓
 *   codegen/manifest.json     -- consumed by the SDK, simulator and LLM tools
 */

export interface AbiInput {
  name: string;
  type: string;
  components?: AbiInput[];
}

export interface ManifestAction {
  id: string;
  contract: string;
  address: `0x${string}` | null;
  name: string;
  signature: string;
  selector: `0x${string}`;
  inputs: AbiInput[];
  outputs: AbiInput[];
  stateMutability: string;
  description: string;
  policy: string[];
  source: string;
}

export interface Manifest {
  version: 1;
  chainId: number;
  network: string;
  generatedAt: string;
  actions: ManifestAction[];
}

interface DeploymentFile {
  chainId: number;
  network?: string;
  contracts?: Record<string, `0x${string}`>;
}

const hex = (b: Uint8Array): `0x${string}` =>
  `0x${Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("")}`;

const selectorOf = (signature: string): `0x${string}` =>
  hex(keccak_256(new TextEncoder().encode(signature))).slice(0, 10) as `0x${string}`;

const canonicalType = (input: AbiInput): string =>
  input.type.startsWith("tuple")
    ? `(${(input.components ?? []).map(canonicalType).join(",")})`
    : input.type;

const signatureOf = (name: string, inputs: AbiInput[]): string =>
  `${name}(${inputs.map(canonicalType).join(",")})`;

export function walkSol(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const st = statSync(path);
    if (st.isDirectory()) out.push(...walkSol(path));
    else if (entry.endsWith(".sol")) out.push(path);
  }
  return out.sort();
}

interface Annotation {
  action: string;
  policy: string[];
  description: string;
}

/** Parse the NatSpec block immediately above one function. */
function annotationOf(block: string): Annotation | null {
  const lines = block
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*\/\/\/\s?/, "").trim())
    .filter(Boolean);

  let action: string | null = null;
  let description = "";
  const policy: string[] = [];

  for (const line of lines) {
    const tag = /^@([\w:-]+)\s*(.*)$/.exec(line);
    if (tag == null) {
      if (action != null && description === "") description = line;
      continue;
    }
    const [, key, value] = tag;
    // Solidity only permits lowercase letters and "-" in a custom tag, so the
    // namespace is `@custom:agent-action`. Plain `@agentAction` is accepted
    // for fixtures and for other tooling.
    const plain = key.replace(/^custom:/, "").replace(/-/g, "").toLowerCase();
    if (plain === "agentaction") action = value;
    else if (plain === "agentpolicy") policy.push(...value.split(",").map((p) => p.trim()).filter(Boolean));
    else if (plain === "agentdescription") description = value;
    else if (key === "notice" && description === "") description = value;
  }

  return action == null ? null : { action, policy, description };
}

interface ContractRegion {
  name: string;
  text: string;
  file: string;
}

function contractsIn(file: string): ContractRegion[] {
  const text = readFileSync(file, "utf8");
  const declarations = [...text.matchAll(/\b(?:abstract\s+)?contract\s+(\w+)/g)];
  return declarations.map((m, i) => ({
    name: m[1],
    file,
    text: text.slice(m.index!, declarations[i + 1]?.index ?? text.length),
  }));
}

interface FoundAction {
  contract: string;
  annotation: Annotation;
  file: string;
}

function annotatedActions(root: string): FoundAction[] {
  const out: FoundAction[] = [];
  for (const file of walkSol(resolve(root, "contracts/src"))) {
    for (const region of contractsIn(file)) {
      // A NatSpec block is one or more contiguous `///` lines immediately
      // followed by a function declaration.
      const re = /((?:[ \t]*\/\/\/[^\n]*\n)+)[ \t]*function[ \t]+(\w+)[ \t]*\(/g;
      for (const match of region.text.matchAll(re)) {
        const annotation = annotationOf(match[1]);
        if (annotation == null) continue;
        // The signature in the annotation is the human-readable contract; the
        // ABI is authoritative for types. We only require the names to match.
        if (!annotation.action.startsWith(`${match[2]}(`)) {
          throw new Error(
            `${file}: @agentAction ${annotation.action} is above function ${match[2]} — names must match`,
          );
        }
        out.push({ contract: region.name, annotation, file });
      }
    }
  }
  return out;
}

interface AbiFunction {
  type: string;
  name: string;
  inputs: AbiInput[];
  outputs: AbiInput[];
  stateMutability: string;
}

function artifactAbi(root: string, contract: string, file: string): AbiFunction[] | null {
  const artifact = resolve(root, "contracts/out", `${basename(file)}/${contract}.json`);
  if (!existsSync(artifact)) return null;
  const json = JSON.parse(readFileSync(artifact, "utf8")) as { abi?: AbiFunction[] };
  return (json.abi ?? []).filter((e) => e.type === "function");
}

function readDeployments(root: string): DeploymentFile {
  const path = resolve(root, "deployments.json");
  if (!existsSync(path)) return { chainId: 1337 };
  return JSON.parse(readFileSync(path, "utf8")) as DeploymentFile;
}

export interface GenerateOptions {
  root: string;
  generatedAt?: string;
}

export function generateManifest(options: GenerateOptions): Manifest {
  const { root } = options;
  const deployments = readDeployments(root);
  const actions: ManifestAction[] = [];
  const missing: string[] = [];

  for (const found of annotatedActions(root)) {
    const abi = artifactAbi(root, found.contract, found.file);
    if (abi == null) {
      missing.push(`${found.contract} (${found.file}) has no artifact — run \`forge build\` first`);
      continue;
    }
    const name = found.annotation.action.slice(0, found.annotation.action.indexOf("("));
    const fn = abi.find((e) => e.name === name);
    if (fn == null) {
      missing.push(`${found.contract}.${name} is annotated but absent from the ABI`);
      continue;
    }
    const signature = signatureOf(fn.name, fn.inputs);
    actions.push({
      id: `${found.contract}.${fn.name}`,
      contract: found.contract,
      address: deployments.contracts?.[found.contract] ?? null,
      name: fn.name,
      signature,
      selector: selectorOf(signature),
      inputs: fn.inputs,
      outputs: fn.outputs,
      stateMutability: fn.stateMutability,
      description: found.annotation.description,
      policy: found.annotation.policy,
      source: found.file.replace(`${root}/`, ""),
    });
  }

  if (missing.length > 0) throw new Error(`manifest incomplete:\n  ${missing.join("\n  ")}`);

  actions.sort((a, b) => a.contract.localeCompare(b.contract) || a.name.localeCompare(b.name));
  return {
    version: 1,
    chainId: deployments.chainId,
    network: deployments.network ?? "unknown",
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    actions,
  };
}

/** `--check` compares everything except the timestamp. */
export function sameManifest(a: Manifest, b: Manifest): boolean {
  const strip = (m: Manifest) => JSON.stringify({ ...m, generatedAt: "" });
  return strip(a) === strip(b);
}

export function writeManifest(path: string, manifest: Manifest): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
}
