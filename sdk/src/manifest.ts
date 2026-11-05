import { readFileSync } from "node:fs";
import { encodeFunctionData, toFunctionSelector, type Abi, type AbiParameter } from "viem";
import type { AbiInput, Manifest, ManifestAction } from "../../codegen/src/generate.ts";

export type { AbiInput, Manifest, ManifestAction };

/**
 * The manifest is the single source of truth produced by `codegen/`.
 * This module only reads it: it does not know about AgentVault, and the agent
 * cannot construct an action the contract did not annotate.
 */

export function loadManifest(path: string): Manifest {
  return JSON.parse(readFileSync(path, "utf8")) as Manifest;
}

export function findAction(manifest: Manifest, idOrName: string): ManifestAction {
  const found =
    manifest.actions.find((a) => a.id === idOrName) ??
    manifest.actions.find((a) => a.name === idOrName) ??
    manifest.actions.find((a) => a.selector === idOrName);
  if (found == null) {
    const known = manifest.actions.map((a) => a.id).join(", ");
    throw new Error(`unknown agent action "${idOrName}" (known: ${known})`);
  }
  return found;
}

export function actionsFor(manifest: Manifest, contract: string): ManifestAction[] {
  return manifest.actions.filter((a) => a.contract === contract);
}

const toAbiParam = (input: AbiInput): AbiParameter => {
  if (input.type.startsWith("tuple")) {
    return {
      name: input.name,
      type: input.type,
      components: (input.components ?? []).map(toAbiParam),
    } as AbiParameter;
  }
  return { name: input.name, type: input.type } as AbiParameter;
};

/** The action as a one-function ABI, suitable for viem. */
export function actionAbi(action: ManifestAction): Abi {
  return [
    {
      type: "function",
      name: action.name,
      stateMutability: action.stateMutability,
      inputs: action.inputs.map(toAbiParam),
      outputs: action.outputs.map(toAbiParam),
    },
  ] as Abi;
}

export function encodeActionCall(action: ManifestAction, args: readonly unknown[]): `0x${string}` {
  return encodeFunctionData({
    abi: actionAbi(action),
    functionName: action.name,
    args: args as never,
  });
}

export function selectorOf(action: ManifestAction): `0x${string}` {
  return toFunctionSelector(action.signature);
}

/** JSON Schema for a tool definition. Kept deliberately small: primitives and arrays. */
export function inputSchema(action: ManifestAction): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const input of action.inputs) {
    properties[input.name || `arg${required.length}`] = schemaFor(input);
    required.push(input.name || `arg${required.length - 1}`);
  }

  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}

function schemaFor(input: AbiInput): Record<string, unknown> {
  if (input.type.startsWith("tuple")) {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const c of input.components ?? []) {
      properties[c.name] = schemaFor(c);
      required.push(c.name);
    }
    return { type: "object", properties, required, additionalProperties: false };
  }
  if (input.type.endsWith("[]")) {
    return { type: "array", items: schemaFor({ ...input, type: input.type.slice(0, -2) }) };
  }
  switch (input.type) {
    case "address":
      return { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" };
    case "bool":
      return { type: "boolean" };
    case "bytes":
    case "bytes32":
    case "bytes4":
    case "string":
      return { type: "string" };
    default:
      return {
        type: "string",
        pattern: "^[0-9]+$",
        description: `${input.type} encoded as a base-10 string (JSON has no bigint)`,
      };
  }
}

/**
 * Coerce the string values a model (or a JSON file) produces into the types
 * viem expects. Unknown extra keys are rejected so a typo cannot silently
 * become a zero value.
 */
export function coerceArgs(action: ManifestAction, raw: Record<string, unknown>): unknown[] {
  const allowed = new Set(action.inputs.map((i) => i.name));
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) throw new Error(`${action.id}: unknown argument "${key}"`);
  }
  return action.inputs.map((input, i) => {
    const value = raw[input.name];
    if (value === undefined) throw new Error(`${action.id}: missing argument "${input.name}"`);
    return coerceValue(input, value, `${action.id}.${input.name || i}`);
  });
}

function coerceValue(input: AbiInput, value: unknown, path: string): unknown {
  if (input.type.startsWith("tuple")) {
    if (typeof value !== "object" || value == null) throw new Error(`${path}: expected an object`);
    const out: Record<string, unknown> = {};
    for (const c of input.components ?? []) {
      const v = (value as Record<string, unknown>)[c.name];
      if (v === undefined) throw new Error(`${path}: missing "${c.name}"`);
      out[c.name] = coerceValue(c, v, `${path}.${c.name}`);
    }
    return out;
  }
  if (input.type.endsWith("[]")) {
    if (!Array.isArray(value)) throw new Error(`${path}: expected an array`);
    const item = { ...input, type: input.type.slice(0, -2) };
    return value.map((v, i) => coerceValue(item, v, `${path}[${i}]`));
  }
  switch (input.type) {
    case "address":
    case "string":
      return value;
    case "bool":
      if (typeof value !== "boolean") throw new Error(`${path}: expected a boolean`);
      return value;
    case "bytes":
    case "bytes32":
    case "bytes4":
      if (typeof value !== "string") throw new Error(`${path}: expected a hex string`);
      return value;
    default:
      if (typeof value === "bigint") return value;
      if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
      if (typeof value === "string" && /^[0-9]+$/.test(value)) return BigInt(value);
      throw new Error(`${path}: expected an integer`);
  }
}
