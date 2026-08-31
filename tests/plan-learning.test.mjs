import test from "node:test";
import assert from "node:assert/strict";
import { BrowserPlanLearningRepository, validateProfileMemory, validateRetrospective } from "../dist-test/src/plan-learning.js";
import { MemoryStorage } from "../dist-test/src/persistence.js";
import { handlePlanLearningRequest } from "../dist-test/worker/plan-learning.js";
import { authSha256 } from "../dist-test/worker/auth.js";

class Statement {
  constructor(db, query) { this.db = db; this.query = query; this.values = []; }
  bind(...values) { this.values = values; return this; }
  async first() {
    if (this.query.includes("FROM plan_heads")) return this.db.heads.get(`${this.values[0]}:${this.values[1]}`) ?? null;
    if (this.query.includes("FROM plan_retrospectives")) return this.db.retrospectives.get(`${this.values[0]}:${this.values[1]}`) ?? null;
    if (this.query.includes("FROM plan_learning_receipts")) return this.db.receipts.get(`${this.values[0]}:${this.values[1]}`) ?? null;
    if (this.query.includes("FROM profile_memories") && this.query.includes("memory_id = ?")) return this.db.memories.get(`${this.values[0]}:${this.values[1]}`) ?? null;
    if (this.query.includes("FROM profile_memories") && this.query.includes("status IN ('rejected', 'retired')")) return [...this.db.memories.values()].find((item) => item.scope_id === this.values[0] && item.kind === this.values[1] && item.evidence === this.values[2] && ["rejected", "retired"].includes(item.status)) ?? null;
    return null;
  }
  async all() {
    if (!this.query.includes("FROM profile_memories")) return { results: [] };
    return { results: [...this.db.memories.values()].filter((item) => item.scope_id === this.values[0]).sort((a, b) => b.updated_at.localeCompare(a.updated_at)) };
  }
}

class LearningDb {
  heads = new Map();
  retrospectives = new Map();
  memories = new Map();
  receipts = new Map();
  prepare(query) { return new Statement(this, query); }
  async batch(statements) {
    for (const statement of statements) {
      if (statement.query.startsWith("INSERT INTO plan_retrospectives")) {
        const [scopeId, planId, planRevision, worked, changed, nextTime, createdAt, updatedAt] = statement.values;
        const prior = this.retrospectives.get(`${scopeId}:${planId}`);
        this.retrospectives.set(`${scopeId}:${planId}`, { scope_id: scopeId, plan_id: planId, plan_revision: planRevision, worked, changed, next_time: nextTime, created_at: prior?.created_at ?? createdAt, updated_at: updatedAt });
      } else if (statement.query.startsWith("INSERT INTO profile_memories")) {
        const [scopeId, memoryId, family, kind, statementText, evidence, sourcePlanId, sourceSurface, status, createdAt, updatedAt, decidedAt] = statement.values;
        this.memories.set(`${scopeId}:${memoryId}`, { scope_id: scopeId, memory_id: memoryId, family, kind, statement: statementText, evidence, source_plan_id: sourcePlanId, source_surface: sourceSurface, status, created_at: createdAt, updated_at: updatedAt, decided_at: decidedAt });
      } else if (statement.query.startsWith("UPDATE profile_memories")) {
        const values = statement.values;
        const withKind = statement.query.includes("SET kind = ?");
        const [kind, statementText, status, updatedAt, decidedAt, scopeId, memoryId] = withKind
          ? values
          : [undefined, ...values];
        const existing = this.memories.get(`${scopeId}:${memoryId}`);
        if (existing) this.memories.set(`${scopeId}:${memoryId}`, { ...existing, ...(kind ? { kind } : {}), statement: statementText, status, updated_at: updatedAt, decided_at: decidedAt });
      } else if (statement.query.startsWith("DELETE FROM profile_memories")) {
        const [scopeId, memoryId] = statement.values;
        this.memories.delete(`${scopeId}:${memoryId}`);
      } else if (statement.query.startsWith("INSERT INTO plan_learning_receipts")) {
        const [scopeId, idempotencyKey, requestHash, receiptJson] = statement.values;
        this.receipts.set(`${scopeId}:${idempotencyKey}`, { request_hash: requestHash, receipt_json: receiptJson });
      }
    }
    return statements.map(() => ({ success: true }));
  }
}

const userId = "learning_user";
const scopeId = `user_${(await authSha256({ siteUserId: userId })).slice(0, 32)}`;
const planId = "plan_dinner_learning";
const request = (path, method = "GET", body, extras = {}) => new Request(`https://finite.example${path}`, {
  method,
  headers: { "oai-authenticated-user-id": userId, ...(body ? { "content-type": "application/json", origin: "https://finite.example" } : {}), ...extras },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
const seed = (db) => db.heads.set(`${scopeId}:${planId}`, { revision: 3, profile_id: "event" });

test("retrospectives and reusable memories require concise evidence-backed text", () => {
  assert.equal(validateRetrospective({ worked: "Cooking together was fun.", changed: "", nextTime: "" }).ok, true);
  assert.equal(validateRetrospective({ worked: "", changed: "", nextTime: "" }).ok, false);
  assert.equal(validateProfileMemory({ kind: "preference", statement: "I like collaborative cooking.", evidence: "The group chose to cook together." }).ok, true);
  assert.equal(validateProfileMemory({ kind: "preference", statement: "I like collaborative cooking.", evidence: "" }).ok, false);
});

test("local Demo mode accepts a person's own memory while keeping Codex reads proposed", async () => {
  const repository = new BrowserPlanLearningRepository(new MemoryStorage(), "test-learning", () => new Date("2026-08-31T00:00:00.000Z"));
  const human = await repository.addMemory({ planId, kind: "working_pattern", statement: "Keep outdoor days flexible.", evidence: "Added by you after this plan.", sourceSurface: "site" });
  assert.equal(human.memory.status, "accepted");
  assert.equal(human.memory.sourcePlanId, planId);
  const codex = await repository.addMemory({ planId, kind: "preference", statement: "You may prefer indoor backups.", evidence: "The plan changed after a rain forecast.", sourceSurface: "codex" });
  assert.equal(codex.memory.status, "proposed");
});

test("a finished plan keeps its own lessons while Codex suggestions remain proposed until the person accepts them", async () => {
  const db = new LearningDb(); seed(db);
  const initial = await (await handlePlanLearningRequest(request(`/api/plan-learning?planId=${planId}`), db)).json();
  assert.equal(initial.retrospective.worked, "");
  const retrospectiveInput = { planId, expectedRevision: 3, worked: "Cooking together was the highlight.", changed: "Two unexpected guests arrived.", nextTime: "Keep a flexible backup portion.", idempotencyKey: "learning-retro-0001", sourceSurface: "site" };
  const saved = await (await handlePlanLearningRequest(request("/api/plan-learning/retrospective", "PUT", retrospectiveInput), db)).json();
  assert.equal(saved.code, "RETROSPECTIVE_SAVED");
  assert.equal(saved.retrospective.nextTime, "Keep a flexible backup portion.");

  const proposalInput = { planId, expectedRevision: 3, kind: "preference", statement: "I enjoy cooking collaboratively before dinner.", evidence: "The host chose cooking together with wine and described it as fun.", idempotencyKey: "learning-propose-0001", sourceSurface: "codex" };
  const proposed = await (await handlePlanLearningRequest(request("/api/plan-learning/memories", "POST", proposalInput), db)).json();
  assert.equal(proposed.memory.status, "proposed");
  const memoryId = proposed.memory.memoryId;
  const accepted = await (await handlePlanLearningRequest(request(`/api/plan-learning/memories/${memoryId}/decision`, "POST", { planId, expectedRevision: 3, memoryId, status: "accepted", statement: "I enjoy cooking with guests before dinner.", idempotencyKey: "learning-accept-0001", sourceSurface: "site" }), db)).json();
  assert.equal(accepted.memory.status, "accepted");
  assert.equal(accepted.memory.statement, "I enjoy cooking with guests before dinner.");
  const loaded = await (await handlePlanLearningRequest(request(`/api/plan-learning?planId=${planId}`), db)).json();
  assert.equal(loaded.memories[0].status, "accepted");
  assert.equal(loaded.retrospective.worked, "Cooking together was the highlight.");
});

test("learning writes fail closed on stale plans, cross-origin requests, and conflicting retries", async () => {
  const db = new LearningDb(); seed(db);
  const base = { planId, expectedRevision: 3, kind: "interest", statement: "I like seasonal menus.", evidence: "The chosen menu used seasonal produce.", idempotencyKey: "learning-guard-0001", sourceSurface: "site" };
  assert.equal((await handlePlanLearningRequest(request("/api/plan-learning/memories", "POST", { ...base, expectedRevision: 2 }), db)).status, 409);
  assert.equal((await handlePlanLearningRequest(request("/api/plan-learning/memories", "POST", base, { origin: "https://other.example" }), db)).status, 403);
  assert.equal((await handlePlanLearningRequest(request("/api/plan-learning/memories", "POST", base), db)).status, 200);
  assert.equal((await handlePlanLearningRequest(request("/api/plan-learning/memories", "POST", { ...base, statement: "Different" }), db)).status, 409);
});

test("rejected evidence cannot silently return as another Codex profile read", async () => {
  const db = new LearningDb(); seed(db);
  const proposal = { planId, expectedRevision: 3, kind: "working_pattern", statement: "I prefer late decisions.", evidence: "The final menu changed on the day.", idempotencyKey: "learning-reject-proposal", sourceSurface: "codex" };
  const proposed = await (await handlePlanLearningRequest(request("/api/plan-learning/memories", "POST", proposal), db)).json();
  const memoryId = proposed.memory.memoryId;
  const rejected = await handlePlanLearningRequest(request(`/api/plan-learning/memories/${memoryId}/decision`, "POST", { planId, expectedRevision: 3, memoryId, status: "rejected", statement: proposal.statement, idempotencyKey: "learning-reject-choice", sourceSurface: "site" }), db);
  assert.equal(rejected.status, 200);
  const repeated = await (await handlePlanLearningRequest(request("/api/plan-learning/memories", "POST", { ...proposal, statement: "I like leaving decisions late.", idempotencyKey: "learning-reject-repeat" }), db)).json();
  assert.equal(repeated.code, "PROFILE_MEMORY_EVIDENCE_REJECTED");
});

test("About you exposes every memory and uses optimistic human controls independent of a source plan revision", async () => {
  const db = new LearningDb(); seed(db);
  const proposed = await (await handlePlanLearningRequest(request("/api/plan-learning/memories", "POST", { planId, expectedRevision: 3, kind: "preference", statement: "I like collaborative cooking.", evidence: "The host chose to cook with guests.", idempotencyKey: "learning-profile-proposal", sourceSurface: "codex" }), db)).json();
  const memoryId = proposed.memory.memoryId;

  const catalog = await (await handlePlanLearningRequest(request("/api/plan-learning/profile"), db)).json();
  assert.equal(catalog.code, "PROFILE_MEMORIES_LOADED");
  assert.equal(catalog.memories[0].status, "proposed");

  const accepted = await (await handlePlanLearningRequest(request(`/api/plan-learning/profile/memories/${memoryId}`, "PATCH", { action: "accept", expectedUpdatedAt: proposed.memory.updatedAt, kind: "preference", statement: "I enjoy cooking with guests.", idempotencyKey: "learning-profile-accept", sourceSurface: "site" }), db)).json();
  assert.equal(accepted.memory.status, "accepted");
  assert.equal(accepted.memory.statement, "I enjoy cooking with guests.");
  assert.notEqual(accepted.memory.updatedAt, proposed.memory.updatedAt);

  const stale = await handlePlanLearningRequest(request(`/api/plan-learning/profile/memories/${memoryId}`, "PATCH", { action: "retire", expectedUpdatedAt: proposed.memory.updatedAt, kind: "preference", statement: "I enjoy cooking with guests.", idempotencyKey: "learning-profile-stale", sourceSurface: "site" }), db);
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).code, "PROFILE_MEMORY_CONFLICT");

  const retired = await (await handlePlanLearningRequest(request(`/api/plan-learning/profile/memories/${memoryId}`, "PATCH", { action: "retire", expectedUpdatedAt: accepted.memory.updatedAt, kind: "preference", statement: accepted.memory.statement, idempotencyKey: "learning-profile-retire", sourceSurface: "site" }), db)).json();
  assert.equal(retired.memory.status, "retired");
  const repeated = await (await handlePlanLearningRequest(request("/api/plan-learning/memories", "POST", { planId, expectedRevision: 3, kind: "preference", statement: "Collaborative cooking works for me.", evidence: proposed.memory.evidence, idempotencyKey: "learning-profile-retired-repeat", sourceSurface: "codex" }), db)).json();
  assert.equal(repeated.code, "PROFILE_MEMORY_EVIDENCE_REJECTED");
});

test("a person can add and permanently delete an explicit About you memory", async () => {
  const db = new LearningDb();
  const added = await (await handlePlanLearningRequest(request("/api/plan-learning/profile/memories", "POST", { kind: "working_pattern", statement: "I prefer short planning sessions.", evidence: "Added by you in About you.", idempotencyKey: "learning-profile-direct", sourceSurface: "site" }), db)).json();
  assert.equal(added.memory.sourcePlanId, "profile");
  assert.equal(added.memory.status, "accepted");
  const deleted = await (await handlePlanLearningRequest(request(`/api/plan-learning/profile/memories/${added.memory.memoryId}`, "PATCH", { action: "delete", expectedUpdatedAt: added.memory.updatedAt, kind: added.memory.kind, statement: added.memory.statement, idempotencyKey: "learning-profile-delete", sourceSurface: "site" }), db)).json();
  assert.equal(deleted.code, "PROFILE_MEMORY_DELETED");
  assert.equal(deleted.memories.length, 0);
});
