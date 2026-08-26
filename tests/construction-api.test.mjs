import test from "node:test";
import assert from "node:assert/strict";
import { MemoryStorage, PlanCatalogStore, PlanSnapshotStore } from "../dist-test/src/persistence.js";
import { compileBuiltInProfiles } from "../dist-test/src/profiles.js";
import { FinitePlanRuntime } from "../dist-test/src/runtime.js";
import { sha256 } from "../dist-test/src/crypto.js";
import { handleConstructionPacketRequest } from "../dist-test/worker/construction-packet.js";

class Statement {
  values = [];
  constructor(db, query) { this.db = db; this.query = query; }
  bind(...values) { this.values = values; return this; }
  async first() { return this.db.first(this.query, this.values); }
  async all() { return { results: [] }; }
}

class PacketDb {
  packet = null;
  constructor({ profileHash, orderId, orderVersion, orderChecksum }) {
    this.profileHash = profileHash;
    this.orderId = orderId;
    this.orderVersion = orderVersion;
    this.orderChecksum = orderChecksum;
  }
  prepare(query) { return new Statement(this, query); }
  async first(query) {
    if (query.includes("FROM tenant_accounts")) return { scope_id: "scope_test" };
    if (query.includes("FROM plan_heads")) return { profile_hash: this.profileHash, revision: 1 };
    if (query.includes("FROM arrival_orders")) return { order_id: this.orderId, version: this.orderVersion, status: "interpretation_confirmed", packet_checksum: this.orderChecksum };
    if (query.includes("FROM construction_packets")) return this.packet;
    throw new Error(`Unhandled first query: ${query}`);
  }
  async batch(statements) {
    for (const statement of statements) {
      if (statement.query.includes("INSERT INTO construction_packets")) {
        const values = statement.values;
        this.packet = {
          packet_id: values[1], packet_json: values[2], checksum: values[3], base_plan_id: values[4], base_profile_hash: values[5], base_revision: values[6], kind: values[7],
          source_order_id: values[8], source_order_version: values[9], source_order_checksum: values[10], created_at: values[11], expires_at: values[12], cleared_at: null, updated_at: values[13],
        };
      } else if (statement.query.includes("UPDATE construction_packets SET cleared_at")) {
        this.packet.cleared_at = statement.values[0];
        this.packet.updated_at = statement.values[1];
      }
      else throw new Error(`Unhandled batch query: ${statement.query}`);
    }
    return statements.map(() => ({ success: true, meta: { changes: 1 } }));
  }
}

const requestHeaders = { origin: "https://finite.example", "content-type": "application/json", "oai-authenticated-user-id": "site-user-123" };

test("authenticated construction API shares only the exact current arrival-bound packet and clears by id", async () => {
  const profiles = await compileBuiltInProfiles();
  const storage = new MemoryStorage();
  const catalog = new PlanCatalogStore(storage);
  const runtime = new FinitePlanRuntime(profiles, new PlanSnapshotStore(storage), "travel", catalog, [], () => new Date("2026-08-26T18:00:00.000Z"));
  const orderId = "arrival_cross_surface";
  const orderChecksum = "a".repeat(64);
  const assessed = await runtime.assessPlanIntake({
    sourceArrival: { orderId, orderVersion: 27, orderChecksum },
    constructionMode: "adaptive_shell",
    profileId: "travel",
    planId: "plan_api_cross_surface",
    name: "Cross-surface plan",
    brief: "Build a current arrival-bound travel shell.",
    allocation: { totalBudgetMinor: 1_000_000 },
    actuals: [],
    locks: ["total_budget"],
    preferenceLabels: ["preserve_flexibility"],
    entityEstimates: {
      trip_days: { days: { value: 30, basis: "One-month working estimate.", sourcePaths: ["reviewed_interpretation"] } },
      booked_segment_days: { days: { value: 0, basis: "No recorded bookings.", sourcePaths: ["reviewed_interpretation"] } },
    },
    stages: [{ stageId: "europe", label: "Europe", status: "planned" }],
  });
  const staged = await runtime.compileIntakeToDraft({ packetId: assessed.constructionPacket.packetId, expectedChecksum: assessed.constructionPacket.checksum });
  const packet = catalog.loadConstructionPacket();
  const db = new PacketDb({ profileHash: runtime.kernel.profile.profileHash, orderId, orderVersion: 27, orderChecksum });

  const saved = await handleConstructionPacketRequest(new Request("https://finite.example/api/construction-packet", { method: "PUT", headers: requestHeaders, body: JSON.stringify({ packet }) }), db);
  assert.equal(saved.status, 201);
  assert.equal((await saved.json()).code, "CONSTRUCTION_PACKET_SAVED");
  const loaded = await handleConstructionPacketRequest(new Request("https://finite.example/api/construction-packet", { headers: { "oai-authenticated-user-id": "site-user-123" } }), db);
  assert.equal((await loaded.json()).packet.packetId, staged.constructionPacket.packetId);

  const stale = structuredClone(packet);
  stale.payload.sourceArrival.orderVersion = 26;
  const { packetId: _packetId, checksum: _checksum, ...content } = stale;
  stale.checksum = await sha256(content);
  stale.packetId = `construction_${stale.checksum.slice(0, 16)}`;
  const refused = await handleConstructionPacketRequest(new Request("https://finite.example/api/construction-packet", { method: "PUT", headers: requestHeaders, body: JSON.stringify({ packet: stale }) }), db);
  assert.equal(refused.status, 409);
  assert.equal((await refused.json()).code, "CONSTRUCTION_ARRIVAL_STALE");

  const cleared = await handleConstructionPacketRequest(new Request(`https://finite.example/api/construction-packet/${packet.packetId}`, { method: "DELETE", headers: { origin: "https://finite.example", "oai-authenticated-user-id": "site-user-123" } }), db);
  assert.equal((await cleared.json()).code, "CONSTRUCTION_PACKET_CLEARED");
  const missing = await handleConstructionPacketRequest(new Request("https://finite.example/api/construction-packet", { headers: { "oai-authenticated-user-id": "site-user-123" } }), db);
  assert.equal(missing.status, 410);

  const resurrected = await handleConstructionPacketRequest(new Request("https://finite.example/api/construction-packet", { method: "PUT", headers: requestHeaders, body: JSON.stringify({ packet }) }), db);
  assert.equal(resurrected.status, 409);
  assert.equal((await resurrected.json()).code, "CONSTRUCTION_PACKET_TOMBSTONED");
});
