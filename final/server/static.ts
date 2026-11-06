import type { IncomingMessage, ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp",
  ".ico": "image/x-icon", ".woff2": "font/woff2", ".woff": "font/woff",
  ".otf": "font/otf", ".ttf": "font/ttf", ".txt": "text/plain; charset=utf-8",
};

export function createStaticHandler(directory: string) {
  const root = resolve(directory);
  return async function serveStatic(req: IncomingMessage, res: ServerResponse, pathname: string) {
    let path: string;
    try { path = decodeURIComponent(pathname); }
    catch { res.writeHead(400).end("invalid path"); return; }
    if (["/demo", "/demo/", "/permissions", "/permissions/"].includes(path)) {
      res.writeHead(302, { location: path.startsWith("/permissions") ? "/app/permissions" : "/app" }).end();
      return;
    }
    // Check the requested path before routing it to the SPA entrypoint.
    const requested = resolve(root, `.${path}`);
    if (requested !== root && !requested.startsWith(`${root}${sep}`)) {
      res.writeHead(403).end("forbidden"); return;
    }
    if (path.startsWith("/api/")) { res.writeHead(404).end("not found"); return; }
    const page = path === "/" || (!extname(path) && /^\/(?:app|docs|design-system)(?:\/|$)/.test(path));
    const file = page ? resolve(root, "index.html") : requested;
    try {
      const body = await readFile(file);
      res.writeHead(200, {
        "content-type": MIME[extname(file).toLowerCase()] ?? "application/octet-stream",
        "cache-control": extname(file) === ".html" ? "no-cache" : path.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "public, max-age=3600",
        "content-length": body.length,
        "x-content-type-options": "nosniff",
      });
      res.end(req.method === "HEAD" ? undefined : body);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "EISDIR" || code === "ENOTDIR") res.writeHead(404).end("not found");
      else { console.error("static:", error); res.writeHead(500).end("internal error"); }
    }
  };
}
