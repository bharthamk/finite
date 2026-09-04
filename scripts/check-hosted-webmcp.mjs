import assert from "node:assert/strict";

// Read-only deployment check: local preview and Worker unit tests cannot prove
// that the hosted static-asset path forwards the document isolation contract.
const origin = new URL(process.argv[2] ?? "https://finite.bharthamk.chatgpt.site");
assert(["https:", "http:"].includes(origin.protocol));
for (const path of ["/", "/?start=demo-active&tour=complete", "/?start=explore-demo&plan=1"]) {
  const response = await fetch(new URL(path, origin), {
    headers: { accept: "text/html" }, redirect: "manual", signal: AbortSignal.timeout(20000),
  });
  assert.equal(response.status, 200, `${path}: HTTP status`);
  assert.match(response.headers.get("content-type") ?? "", /text\/html/, `${path}: document response`);
  assert.equal(response.headers.get("origin-agent-cluster"), "?1", `${path}: missing WebMCP origin isolation`);
  assert.equal(response.headers.get("cross-origin-opener-policy"), "same-origin", `${path}: missing opener isolation`);
  assert.match(response.headers.get("permissions-policy") ?? "", /(?:^|,\s*)tools=\(self\)(?:,|$)/, `${path}: missing same-origin tools policy`);
  await response.body?.cancel();
  console.log(`PASS ${path}: WebMCP document headers`);
}
