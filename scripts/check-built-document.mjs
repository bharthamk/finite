import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import worker from "../dist/server/index.js";

const client = new URL("../dist/client/", import.meta.url);
await assert.rejects(access(new URL("index.html", client)), { code: "ENOENT" });
const shell = await readFile(new URL("finite-shell.html", client), "utf8");
const ASSETS = {
  async fetch(request) {
    if (new URL(request.url).pathname === "/finite-shell.html") return Response.redirect("https://finite.example/finite-shell", 307);
    return new URL(request.url).pathname === "/finite-shell"
      ? new Response(shell, { headers: { "content-type": "text/html" } })
      : new Response(null, { status: 404 });
  },
};
for (const path of ["/", "/index.html", "/?start=demo-active&tour=complete", "/share/synthetic", "/collaborate/synthetic"]) {
  const response = await worker.fetch(new Request(`https://finite.example${path}`), { ASSETS });
  assert.equal(response.status, 200, path);
  assert.equal(response.headers.get("origin-agent-cluster"), "?1", path);
  assert.equal(response.headers.get("cross-origin-opener-policy"), "same-origin", path);
  assert.match(response.headers.get("permissions-policy"), /tools=\(self\)/);
  const html = await response.text();
  assert.match(html, /<script[^>]+src="\/assets\//);
  if (path.startsWith("/share/")) assert.match(html, /Shared plan — Finite/);
  if (path.startsWith("/collaborate/")) assert.match(html, /Plan invitation — Finite/);
  console.log(`PASS built Worker document ${path}`);
}
