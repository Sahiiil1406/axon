/**
 * npx tsx scripts/generate.ts [--check] [--out codegen/manifest.json]
 *
 * `--check` fails when the committed manifest is stale, so CI catches a
 * contract change that was not re-generated.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { generateManifest, sameManifest, writeManifest, type Manifest } from "../src/generate.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const args = process.argv.slice(2);
const check = args.includes("--check");
const outIndex = args.indexOf("--out");
const out = resolve(ROOT, outIndex >= 0 && args[outIndex + 1] ? args[outIndex + 1] : "codegen/manifest.json");

const manifest = generateManifest({ root: ROOT });

if (check) {
  if (!existsSync(out)) {
    console.error(`manifest missing: ${out}`);
    process.exit(1);
  }
  const committed = JSON.parse(readFileSync(out, "utf8")) as Manifest;
  if (!sameManifest(committed, manifest)) {
    console.error(`manifest is stale: ${out} — run \`npm run generate\``);
    process.exit(1);
  }
  console.log(`manifest ok: ${manifest.actions.length} actions`);
} else {
  writeManifest(out, manifest);
  console.log(`wrote ${out}`);
  for (const a of manifest.actions) {
    console.log(`  ${a.id.padEnd(24)} ${a.selector}  ${a.signature}`);
  }
}
