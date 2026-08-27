import test from "node:test";
import assert from "node:assert/strict";
import { finiteRelease, serveFiniteReleaseShell, withSecurityHeaders } from "../dist-test/worker/index.js";

const oldHtml = `<!doctype html><html><head><meta name="description" content="Kitchen"><meta property="og:title" content="Kitchen"><meta property="og:description" content="Kitchen"><meta property="og:url" content="https://finite.example/"><meta property="og:image" content="https://finite.example/og.png"><meta property="og:image:width" content="1200"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="Kitchen"><meta name="twitter:description" content="Kitchen"><meta name="twitter:image" content="https://finite.example/og.png"><meta name="finite-build" content="old" /><link rel="stylesheet" href="/assets/index-old.css"><title>Finite</title></head><body><script type="module" src="/assets/index-old.js"></script></body></html>`;

class ReleaseAssets {
  async fetch(request) {
    const pathname = new URL(request.url).pathname;
    if (pathname === "/" || pathname === "/index.html") return new Response(oldHtml, { headers: { "content-type": "text/html; charset=utf-8", etag: "old" } });
    return new Response("missing", { status: 404 });
  }
}

test("the Worker serves one no-store release shell from the single release source", async () => {
  const response = await serveFiniteReleaseShell(new Request("https://finite.example/?fresh=1"), new ReleaseAssets());
  const html = await response.text();
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-finite-build"), finiteRelease.build);
  assert.equal(response.headers.has("etag"), false);
  assert(html.includes(`content="${finiteRelease.build}"`));
  assert(html.includes("index-old"));
});

test("release-shell selection ignores non-page routes", async () => {
  assert.equal(await serveFiniteReleaseShell(new Request("https://finite.example/api/anything"), new ReleaseAssets()), null);
});

test("a standalone share route receives the release shell without entering an API route", async () => {
  const response = await serveFiniteReleaseShell(new Request("https://finite.example/share/opaque-token"), new ReleaseAssets());
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-finite-build"), finiteRelease.build);
  assert.match(html, /<title>Shared plan — Finite<\/title>/);
  assert.match(html, /content="https:\/\/finite\.example\/share\/opaque-token"/);
  assert.doesNotMatch(html, /og:image|twitter:image|og\.png/);
});

test("every Worker response receives the production isolation and content-security contract", async () => {
  const response = withSecurityHeaders(new Response("ok", { headers: { "content-type": "text/plain" } }));
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.get("cross-origin-opener-policy"), "same-origin");
  assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin");
  assert.equal(response.headers.get("origin-agent-cluster"), "?1");
  assert.match(response.headers.get("permissions-policy"), /tools=\(self\)/);
  assert.match(response.headers.get("content-security-policy"), /object-src 'none'/);
  assert.equal(await response.text(), "ok");
});
