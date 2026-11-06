import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStaticHandler } from "../static.ts";

test("serves the SPA, assets and deep links without exposing files outside public", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "axon-static-"));
  const root = join(temporary, "public");
  await mkdir(join(root, "assets"), { recursive: true });
  await writeFile(join(root, "index.html"), "<main>Axon</main>");
  await writeFile(join(root, "assets/app-123.js"), "console.log('axon')");
  await writeFile(join(root, "font name.otf"), "font");
  await writeFile(join(temporary, "private.txt"), "not public");
  const handler = createStaticHandler(root);
  const server = createServer((req, res) => { void handler(req, res, new URL(req.url!, "http://localhost").pathname); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No HTTP address");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    for (const page of ["/", "/app/profile", "/app/transactions/0x123", "/docs/sdk/frame-builder", "/docs/architecture/grants", "/design-system"]) {
      const response = await fetch(base + page);
      assert.equal(response.status, 200, page);
      assert.match(response.headers.get("content-type")!, /text\/html/);
      assert.equal(await response.text(), "<main>Axon</main>");
      assert.equal(response.headers.get("cache-control"), "no-cache");
    }
    const asset = await fetch(base + "/assets/app-123.js");
    assert.match(asset.headers.get("content-type")!, /javascript/);
    assert.match(asset.headers.get("cache-control")!, /immutable/);
    assert.equal((await fetch(base + "/font%20name.otf")).headers.get("content-type"), "font/otf");
    const head = await fetch(base + "/app/profile", { method: "HEAD" });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), "");
    for (const path of ["/assets/missing.js", "/docs/missing.js", "/api/unknown"]) assert.equal((await fetch(base + path)).status, 404);
    assert.equal((await fetch(base + "/%2e%2e%2fprivate.txt")).status, 403);
    assert.equal((await fetch(base + "/%ZZ")).status, 400);
    const redirect = await fetch(base + "/demo", { redirect: "manual" });
    assert.equal(redirect.headers.get("location"), "/app");
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(temporary, { recursive: true, force: true });
  }
});
