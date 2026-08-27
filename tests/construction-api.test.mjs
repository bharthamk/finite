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
  review = null;
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
    if (query.includes("FROM construction_return_reviews")) return this.review;
    throw new Error(`Unhandled first query: ${query}`);
  }
  async batch(statements) {
    for (const statement of statements) {
      if (statement.query.includes("INSERT INTO construction_packets")) {
        const values = statement.values;
        this.packet = {
          packet_id: values[1], packet_json: values[2], checksum: values[3], base_plan_id: values[4], base_profile_hash: values[5], base_revision: values[6], kind: values[7],
          source_order_id: values[8], source_order_version: values[9], source_order_checksum: values[10], created_at: values[11], expires_at: values[12], cleared_at: null,
          disposition: "current", return_reason_code: null, return_message: null, returned_at: null, updated_at: values[13],
        };
      } else if (statement.query.includes("INSERT INTO construction_return_reviews")) {
        const values = statement.values;
        this.review = { return_id: values[1], packet_id: values[2], packet_json: values[3], draft_id: values[4], reason_code: values[5], message: values[6], status: "returned", returned_at: values[7], resolved_by_packet_id: null, resolved_at: null, updated_at: values[8] };
      } else if (statement.query.includes("UPDATE construction_return_reviews SET status = 'resolved'")) {
        this.review.status = "resolved";
        this.review.resolved_by_packet_id = statement.values[0];
        this.review.resolved_at = statement.values[1];
        this.review.updated_at = statement.values[2];
      } else if (statement.query.includes("UPDATE construction_return_reviews SET status = 'discarded'")) {
        this.review.status = "discarded";
        this.review.updated_at = statement.values[0];
      } else if (statement.query.includes("disposition = 'returned'")) {
        this.packet.cleared_at = statement.values[0];
        this.packet.disposition = "returned";
        this.packet.return_reason_code = statement.values[1];
        this.packet.return_message = statement.values[2];
        this.packet.returned_at = statement.values[3];
        this.packet.updated_at = statement.values[4];
      } else if (statement.query.includes("UPDATE construction_packets SET cleared_at")) {
        this.packet.cleared_at = statement.values[0];
        this.packet.disposition = "discarded";
        this.packet.return_reason_code = null;
        this.packet.return_message = null;
        this.packet.returned_at = null;
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

  db.packet.cleared_at = "2026-08-26T18:40:00.000Z";
  db.packet.disposition = "current";
  const legacyRead = await handleConstructionPacketRequest(new Request("https://finite.example/api/construction-packet/returned", { headers: { "oai-authenticated-user-id": "site-user-123" } }), db);
  const legacyBody = await legacyRead.json();
  assert.equal(legacyBody.code, "CONSTRUCTION_RETURN_FEEDBACK_REQUIRED");
  assert.equal(legacyBody.review.feedbackRequired, true);

  const returned = await handleConstructionPacketRequest(new Request(`https://finite.example/api/construction-packet/${packet.packetId}/return`, { method: "POST", headers: requestHeaders, body: JSON.stringify({ reasonCode: "structure", message: "Keep the route and decision dependencies primary; the budget is a constraint, not the page." }) }), db);
  assert.equal(returned.status, 200);
  assert.equal((await returned.json()).code, "CONSTRUCTION_DRAFT_RETURNED");
  const returnedRead = await handleConstructionPacketRequest(new Request("https://finite.example/api/construction-packet/returned", { headers: { "oai-authenticated-user-id": "site-user-123" } }), db);
  const returnedBody = await returnedRead.json();
  assert.equal(returnedBody.review.draftId, staged.draft.draftId);
  assert.equal(returnedBody.review.reasonCode, "structure");
  assert.equal(returnedBody.review.feedbackRequired, false);

  const cleared = await handleConstructionPacketRequest(new Request(`https://finite.example/api/construction-packet/${packet.packetId}`, { method: "DELETE", headers: { origin: "https://finite.example", "oai-authenticated-user-id": "site-user-123" } }), db);
  assert.equal((await cleared.json()).code, "CONSTRUCTION_PACKET_CLEARED");
  const missing = await handleConstructionPacketRequest(new Request("https://finite.example/api/construction-packet", { headers: { "oai-authenticated-user-id": "site-user-123" } }), db);
  assert.equal(missing.status, 410);

  const resurrected = await handleConstructionPacketRequest(new Request("https://finite.example/api/construction-packet", { method: "PUT", headers: requestHeaders, body: JSON.stringify({ packet }) }), db);
  assert.equal(resurrected.status, 409);
  assert.equal((await resurrected.json()).code, "CONSTRUCTION_PACKET_TOMBSTONED");

  const nextOrderId = "arrival_next_project";
  const nextOrderChecksum = "b".repeat(64);
  const nextProject = structuredClone(packet);
  nextProject.payload.sourceArrival = { orderId: nextOrderId, orderVersion: 3, orderChecksum: nextOrderChecksum };
  nextProject.createdAt = "2026-08-26T18:41:00.000Z";
  nextProject.expiresAt = "2026-09-02T18:41:00.000Z";
  const { packetId: _nextPacketId, checksum: _nextChecksum, ...nextContent } = nextProject;
  nextProject.checksum = await sha256(nextContent);
  nextProject.packetId = `construction_${nextProject.checksum.slice(0, 16)}`;
  db.orderId = nextOrderId;
  db.orderVersion = 3;
  db.orderChecksum = nextOrderChecksum;
  const nextSaved = await handleConstructionPacketRequest(new Request("https://finite.example/api/construction-packet", { method: "PUT", headers: requestHeaders, body: JSON.stringify({ packet: nextProject }) }), db);
  const nextSavedBody = await nextSaved.json();
  assert.equal(nextSaved.status, 200, JSON.stringify(nextSavedBody));
  assert.equal(nextSavedBody.code, "CONSTRUCTION_PACKET_REPLACED");
});
