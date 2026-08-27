import test from "node:test";
import assert from "node:assert/strict";
import { handlePlanShareRequest } from "../dist-test/worker/plan-shares.js";

class Statement {
  constructor(db, query, values = []) { this.db = db; this.query = query; this.values = values; }
  bind(...values) { return new Statement(this.db, this.query, values); }
  first() { return this.db.first(this.query, this.values); }
  all() { return this.db.all(this.query, this.values); }
}

const definition = {
  profileId: "travel",
  name: "Europe, reworked",
  surface: {
    hero: { eyebrow: "18 days · Europe", title: "More Paris, without losing the trip.", brief: "Add three nights while protecting the fixed flights." },
    primaryMeasures: [
      { label: "Trip length", selector: "entities", path: ["trip_days", "values", "days"], format: "days" },
      { label: "Remaining room", selector: "allocations", path: ["bufferMinor"], format: "money" },
    ],
    stages: [
      { label: "London", detail: "Flights fixed", marker: "01–04", status: "locked" },
      { label: "Paris", detail: "Three nights added", marker: "05–11", status: "current" },
    ],
  },
};

const snapshot = (revision = 3, bufferMinor = 50_000) => ({
  lifecycle: { status: "active" },
  accepted: { totalBudgetMinor: 650_000, spentMinor: 120_000, committedMinor: 265_000, forecastMinor: 215_000 - (50_000 - bufferMinor), bufferMinor },
  entities: { trip_days: { values: { days: revision === 3 ? 18 : 20 } } },
  events: [
    { title: "Paris extended", baseRevision: 1, evidenceRefs: ["private-evidence"] },
    { title: "Amsterdam rebalanced", baseRevision: 2, evidenceRefs: ["private-evidence-2"] },
  ],
  receipts: [{ receiptId: "private-receipt" }],
  evidenceRecords: [{ content: "private evidence" }],
});

class ShareDb {
  shares = [];
  plan = { revision: 3, updated_at: "2026-08-27T10:00:00.000Z", snapshot_json: JSON.stringify(snapshot()), definition_json: JSON.stringify(definition) };
  prepare(query) { return new Statement(this, query); }
  async first(query, values) {
    if (query.includes("FROM plan_heads h") || query.includes("JOIN plan_heads h")) {
      if (values.length === 2) return { share_id: "", plan_id: values[1], mode: "", sections_json: "[]", frozen_projection_json: null, label: "", created_at: "", revoked_at: null, ...this.plan };
      const share = this.shares.find((item) => item.token_hash === values[0]);
      return share ? { ...share, ...this.plan } : null;
    }
    if (query.includes("FROM plan_shares WHERE scope_id = ? AND share_id = ?")) return this.shares.find((item) => item.scope_id === values[0] && item.share_id === values[1]) ?? null;
    if (query.includes("FROM demo_sessions")) return null;
    return null;
  }
  async all(query, values) {
    if (query.includes("FROM plan_shares WHERE scope_id = ? AND plan_id = ?")) return { results: this.shares.filter((item) => item.scope_id === values[0] && item.plan_id === values[1]).reverse() };
    return { results: [] };
  }
  async batch(statements) {
    for (const { query, values } of statements) {
      if (query.startsWith("INSERT INTO plan_shares")) this.shares.push({ scope_id: values[0], share_id: values[1], token_hash: values[2], plan_id: values[3], mode: values[4], sections_json: values[5], frozen_projection_json: values[6], label: values[7], created_at: values[8], revoked_at: null });
      if (query.startsWith("UPDATE plan_shares SET revoked_at")) {
        const share = this.shares.find((item) => item.scope_id === values[1] && item.share_id === values[2]);
        if (share && !share.revoked_at) share.revoked_at = values[0];
      }
    }
    return statements.map(() => ({ success: true }));
  }
}

const ownerHeaders = { "oai-authenticated-user-id": "owner-123", origin: "https://finite.example", "content-type": "application/json" };
const create = (db, body) => handlePlanShareRequest(new Request("https://finite.example/api/plan-shares", { method: "POST", headers: ownerHeaders, body: JSON.stringify(body) }), db);

test("the owner chooses an exact bounded projection before publication", async () => {
  const db = new ShareDb();
  const preview = await handlePlanShareRequest(new Request("https://finite.example/api/plan-shares/preview", { method: "POST", headers: ownerHeaders, body: JSON.stringify({ planId: "plan_europe", mode: "live", sections: ["overview", "stages"] }) }), db);
  const body = await preview.json();
  assert.equal(body.code, "PLAN_PUBLICATION_PREVIEW");
  assert.equal(body.publication.mode, "live");
  assert.deepEqual(body.publication.sections, ["overview", "stages"]);
  assert.equal(body.publication.plan.headline, "More Paris, without losing the trip.");
  assert.equal(body.publication.plan.stages.length, 2);
  assert.equal("allocation" in body.publication.plan, false);
  assert.equal("measures" in body.publication.plan, false);
  assert.equal("changes" in body.publication.plan, false);
  const serialized = JSON.stringify(body);
  for (const privateField of ["plan_europe", "private-evidence", "private-receipt", "snapshotHash", "profileHash", "scopeId"]) assert.equal(serialized.includes(privateField), false);
});

test("a frozen page stores only the sanitized confirmed plate and never tracks later kitchen changes", async () => {
  const db = new ShareDb();
  const created = await create(db, { planId: "plan_europe", mode: "frozen", sections: ["overview", "allocation"], label: "Family update" });
  const createdBody = await created.json();
  assert.equal(created.status, 201);
  assert.match(createdBody.publication.path, /^\/share\/[A-Za-z0-9_-]{43}$/);
  const token = createdBody.publication.path.split("/").at(-1);
  assert.equal(db.shares[0].token_hash.includes(token), false);
  assert.equal(db.shares[0].frozen_projection_json.includes("private evidence"), false);
  db.plan = { ...db.plan, revision: 4, updated_at: "2026-08-28T10:00:00.000Z", snapshot_json: JSON.stringify(snapshot(4, 30_000)) };
  const published = await handlePlanShareRequest(new Request(`https://finite.example/api/publications/${token}`), db);
  const body = await published.json();
  assert.equal(body.label, "Family update");
  assert.equal(body.publication.mode, "frozen");
  assert.equal(body.publication.plan.revision, 3);
  assert.equal(body.publication.plan.allocation.bufferMinor, 50_000);
});

test("a live page tracks only its selected fields and revocation closes the plate", async () => {
  const db = new ShareDb();
  const created = await create(db, { planId: "plan_europe", mode: "live", sections: ["overview", "measures"], label: "Trip tracker" });
  const createdBody = await created.json();
  const token = createdBody.publication.path.split("/").at(-1);
  db.plan = { ...db.plan, revision: 4, updated_at: "2026-08-28T10:00:00.000Z", snapshot_json: JSON.stringify(snapshot(4, 30_000)) };
  const published = await handlePlanShareRequest(new Request(`https://finite.example/api/publications/${token}`), db);
  const body = await published.json();
  assert.equal(body.publication.plan.revision, 4);
  assert.equal(body.publication.plan.measures[0].value, 20);
  assert.equal("allocation" in body.publication.plan, false);
  const revoked = await handlePlanShareRequest(new Request(`https://finite.example/api/plan-shares/${createdBody.publication.shareId}`, { method: "DELETE", headers: ownerHeaders }), db);
  assert.equal((await revoked.json()).code, "PLAN_PUBLICATION_REVOKED");
  const closed = await handlePlanShareRequest(new Request(`https://finite.example/api/publications/${token}`), db);
  assert.equal(closed.status, 410);
  assert.equal((await closed.json()).code, "PUBLICATION_REVOKED");
});

test("publishing is account-only, same-origin, and refuses unapproved or malformed selections", async () => {
  const db = new ShareDb();
  const anonymous = await handlePlanShareRequest(new Request("https://finite.example/api/plan-shares?planId=plan_europe"), db);
  assert.equal(anonymous.status, 401);
  const crossOrigin = await handlePlanShareRequest(new Request("https://finite.example/api/plan-shares", { method: "POST", headers: { ...ownerHeaders, origin: "https://attacker.example" }, body: "{}" }), db);
  assert.equal(crossOrigin.status, 403);
  const missingOverview = await create(db, { planId: "plan_europe", mode: "frozen", sections: ["allocation"], label: "Bad" });
  assert.equal(missingOverview.status, 422);
  const unknown = await create(db, { planId: "plan_europe", mode: "live", sections: ["overview", "evidence"], label: "Bad" });
  assert.equal(unknown.status, 422);
  assert.equal(db.shares.length, 0);
});
