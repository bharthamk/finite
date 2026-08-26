import test from "node:test";
import assert from "node:assert/strict";
import { finiteRelease, serveFiniteReleaseShell } from "../dist-test/worker/index.js";

const oldHtml = `<!doctype html><html><head><meta name="finite-build" content="old" /><link rel="stylesheet" href="/assets/index-old.css"><title>Finite</title></head><body><script type="module" src="/assets/index-old.js"></script></body></html>`;

class ReleaseAssets {
  constructor(available = true) { this.available = available; }
  async fetch(request) {
    const pathname = new URL(request.url).pathname;
    if (pathname === "/" || pathname === "/index.html") return new Response(oldHtml, { headers: { "content-type": "text/html; charset=utf-8", etag: "old" } });
    if (this.available && [finiteRelease.script, finiteRelease.stylesheet].includes(pathname)) return new Response("release asset", { status: 200 });
    return new Response("missing", { status: 404 });
  }
}

test("the Worker serves one no-store release shell only when its exact client assets exist", async () => {
  const response = await serveFiniteReleaseShell(new Request("https://finite.example/?fresh=1"), new ReleaseAssets());
  const html = await response.text();
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-finite-build"), finiteRelease.build);
  assert.equal(response.headers.has("etag"), false);
  assert(html.includes(`content="${finiteRelease.build}"`));
  assert(html.includes(`src="${finiteRelease.script}"`));
  assert(html.includes(`href="${finiteRelease.stylesheet}"`));
  assert.equal(html.includes("index-old"), false);
});

test("release-shell selection fails safely when the saved version lacks its exact assets", async () => {
  const response = await serveFiniteReleaseShell(new Request("https://finite.example/"), new ReleaseAssets(false));
  assert.equal(await response.text(), oldHtml);
  assert.equal(response.headers.get("x-finite-build"), null);
  assert.equal(await serveFiniteReleaseShell(new Request("https://finite.example/api/anything"), new ReleaseAssets()), null);
});
