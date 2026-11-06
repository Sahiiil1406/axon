import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";

export interface LocalAgentPolicy {
  budget: string;
  allow: Record<string, boolean>;
}

interface Registration {
  parent: string;
  name: string;
  hash?: `0x${string}`;
  localPolicy?: LocalAgentPolicy;
}

export function openAgentStore(path: string) {
  let registrations: Registration[] = existsSync(path)
    ? JSON.parse(readFileSync(path, "utf8"))
    : [];
  if (!Array.isArray(registrations)) throw new Error("Invalid agent registration file");

  return {
    names(parent: string) {
      return registrations.filter((agent) => agent.parent === parent).map((agent) => agent.name);
    },
    hash(name: string) {
      return registrations.find((agent) => agent.name === name)?.hash;
    },
    policy(name: string) {
      return registrations.find((agent) => agent.name === name)?.localPolicy;
    },
    save(parent: string, name: string, hash?: Registration["hash"], localPolicy?: LocalAgentPolicy) {
      const existing = registrations.find((agent) => agent.name === name);
      if (existing?.parent === parent && (!hash || hash === existing.hash) && !localPolicy) return;
      const registration = { parent, name, hash: hash ?? existing?.hash, localPolicy: localPolicy ?? existing?.localPolicy };
      const next = existing
        ? registrations.map((agent) => agent === existing ? registration : agent)
        : [...registrations, registration];
      const temporary = `${path}.${process.pid}.tmp`;
      writeFileSync(temporary, JSON.stringify(next, null, 2) + "\n");
      renameSync(temporary, path);
      registrations = next;
    },
  };
}
