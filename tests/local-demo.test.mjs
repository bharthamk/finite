import test from "node:test";
import assert from "node:assert/strict";
import { installLocalDemoWriteGuard, localDemoModeEnabled, localDemoStorageScope, setLocalDemoMode } from "../dist-test/src/local-demo.js";
import { MemoryStorage, ScopedStorage } from "../dist-test/src/persistence.js";
import { MemoryArrivalRepository } from "../dist-test/src/arrival.js";

test("local Demo mode is browser-owned and blocks every same-origin API mutation", async () => {
  const storage = new MemoryStorage();
  assert.equal(localDemoModeEnabled(storage), false);
  setLocalDemoMode(storage, true);
  assert.equal(localDemoModeEnabled(storage), true);
  const scope = localDemoStorageScope(storage, () => "12345678-1234-1234-1234-1234567890ab");
  assert.equal(scope, "local_demo_123456781234123412341234567890ab");
  let nativeCalls = 0;
  const target = { location: { href: "https://finite.example/", origin: "https://finite.example" }, fetch: async () => { nativeCalls += 1; return new Response("ok"); } };
  const restore = installLocalDemoWriteGuard(target, true);
  const blocked = await target.fetch("/api/plan-inputs", { method: "POST" });
  assert.equal(blocked.status, 409);
  assert.equal((await blocked.json()).code, "LOCAL_DEMO_REMOTE_WRITE_BLOCKED");
  assert.equal(nativeCalls, 0);
  await target.fetch("/api/auth/session");
  assert.equal(nativeCalls, 1);
  restore();
  await target.fetch("/api/plan-inputs", { method: "POST" });
  assert.equal(nativeCalls, 2);
});

test("local Demo arrivals survive reload inside their isolated browser namespace", async () => {
  const storage = new MemoryStorage();
  const scoped = new ScopedStorage(storage, "local_demo_123456781234123412341234567890ab");
  const first = new MemoryArrivalRepository(() => new Date("2026-08-31T00:00:00.000Z"), scoped);
  const created = await first.create({ idempotencyKey: "local-arrival-0001", rawOutcome: "Plan a local-only Hobart trip", sourceSurface: "site" });
  assert.equal(created.code, "ARRIVAL_ORDER_CREATED");
  const reloaded = new MemoryArrivalRepository(() => new Date("2026-08-31T01:00:00.000Z"), scoped);
  const opened = await reloaded.open();
  assert.equal(opened.order.orderId, created.order.orderId);
  assert.equal(opened.order.rawOutcome, "Plan a local-only Hobart trip");
});
