import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * A 20-line `.env` reader. The demo scripts are meant to be runnable with
 * `npx tsx scripts/run.ts`, not only after `set -a; source .env`. Existing
 * environment variables win, so CI can override any value.
 */
export function loadEnv(root: string): void {
  const path = resolve(root, ".env");
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (value == null || value === "") throw new Error(`${name} is required (see .env.example)`);
  return value;
}
