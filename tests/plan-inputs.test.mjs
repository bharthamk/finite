import test from "node:test";
import assert from "node:assert/strict";
import { validatePlanInput } from "../dist-test/src/plan-input.js";
import { handlePlanInputRequest } from "../dist-test/worker/plan-inputs.js";
import { authSha256 } from "../dist-test/worker/auth.js";

class Statement {
  constructor(db, query) { this.db = db; this.query = query; this.values = []; }
  bind(...values) { this.values = values; return this; }
  async first() {
    if (this.query.includes("FROM plan_heads")) return this.db.heads.get(`${this.values[0]}:${this.values[1]}`) ?? null;
    if (this.query.includes("FROM plan_input_receipts")) return this.db.receipts.get(`${this.values[0]}:${this.values[1]}`) ?? null;
    if (this.query.includes("FROM plan_inputs WHERE scope_id = ? AND input_id")) return this.db.inputs.get(`${this.values[0]}:${this.values[1]}`) ?? null;
    return null;
  }
  async all() {
    if (!this.query.includes("FROM plan_inputs")) return { results: [] };
    const [scopeId, planId] = this.values;
    return { results: [...this.db.inputs.values()].filter((item) => item.scope_id === scopeId && item.plan_id === planId && item.status === "open").sort((a, b) => b.created_at.localeCompare(a.created_at)) };
  }
}

class PlanInputDb {
  heads = new Map();
  inputs = new Map();
  receipts = new Map();
  prepare(query) { return new Statement(this, query); }
  async batch(statements) {
    for (const statement of statements) {
      if (statement.query.startsWith("INSERT INTO plan_inputs")) {
        const [scopeId, inputId, planId, planRevision, kind, handlingMode, section, contextId, contextLabel, message, sourceSurface, createdAt] = statement.values;
        this.inputs.set(`${scopeId}:${inputId}`, { scope_id: scopeId, input_id: inputId, plan_id: planId, plan_revision: planRevision, kind, handling_mode: handlingMode, section, context_id: contextId, context_label: contextLabel, message, status: "open", source_surface: sourceSurface, created_at: createdAt, handled_at: null });
      } else if (statement.query.startsWith("UPDATE plan_inputs")) {
        if (statement.query.includes("SET kind")) {
          const [kind, handlingMode, section, contextId, contextLabel, message, sourceSurface, scopeId, inputId, planId] = statement.values;
          const item = this.inputs.get(`${scopeId}:${inputId}`);
          if (item && item.plan_id === planId && item.status === "open") this.inputs.set(`${scopeId}:${inputId}`, { ...item, kind, handling_mode: handlingMode, section, context_id: contextId, context_label: contextLabel, message, source_surface: sourceSurface });
          continue;
        }
        const [handledAt, scopeId, inputId, planId] = statement.values;
        const item = this.inputs.get(`${scopeId}:${inputId}`);
        if (item && item.plan_id === planId) this.inputs.set(`${scopeId}:${inputId}`, { ...item, status: "handled", handled_at: item.handled_at ?? handledAt });
      } else if (statement.query.startsWith("INSERT INTO plan_input_receipts")) {
        const [scopeId, idempotencyKey, requestHash, receiptJson] = statement.values;
        this.receipts.set(`${scopeId}:${idempotencyKey}`, { request_hash: requestHash, receipt_json: receiptJson });
      }
    }
    return statements.map(() => ({ success: true }));
  }
}

const userId = "plan_input_user";
const scopeId = `user_${(await authSha256({ siteUserId: userId })).slice(0, 32)}`;
const planId = "plan_dinner_test";
const request = (path, method = "GET", body, extras = {}) => new Request(`https://finite.example${path}`, {
  method,
  headers: { "oai-authenticated-user-id": userId, ...(body ? { "content-type": "application/json", origin: "https://finite.example" } : {}), ...extras },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
const seed = (db) => { db.heads.set(`${scopeId}:${planId}`, { revision: 1 }); };

test("plan input text is bounded and can target a specific plan area", () => {
  assert.deepEqual(validatePlanInput({ kind: "decision", mode: "direct", section: "timeline", contextId: "choose_date", contextLabel: "Choose the Monday", message: "  We decided on 12 October.  " }), { ok: true, value: { kind: "decision", mode: "direct", section: "timeline", contextId: "choose_date", contextLabel: "Choose the Monday", message: "We decided on 12 October." } });
  assert.equal(validatePlanInput({ kind: "", mode: "direct", section: "general", message: "" }).ok, false);
  assert.equal(validatePlanInput({ kind: "decision", mode: "unknown", section: "general", message: "Keep this" }).ok, false);
  assert.equal(validatePlanInput({ kind: "decision", mode: "direct", section: "unknown", message: "Keep this" }).ok, false);
});

test("a person can add, reload, and handle a revision-bound plan decision", async () => {
  const db = new PlanInputDb(); seed(db);
  const input = { planId, expectedRevision: 1, kind: "decision", mode: "direct", section: "timeline", contextId: "choose_date", contextLabel: "Choose the Monday", message: "Use Monday 12 October.", idempotencyKey: "plan-input-add-0001", sourceSurface: "site" };
  const saved = await (await handlePlanInputRequest(request("/api/plan-inputs", "POST", input), db)).json();
  assert.equal(saved.code, "PLAN_INPUT_ADDED");
  assert.equal(saved.input.contextLabel, "Choose the Monday");
  assert.equal(saved.input.mode, "direct");
  assert.equal(saved.input.acceptedStateChanged, undefined);
  const replay = await (await handlePlanInputRequest(request("/api/plan-inputs", "POST", input), db)).json();
  assert.deepEqual(replay, saved);
  const listed = await (await handlePlanInputRequest(request(`/api/plan-inputs?planId=${planId}`), db)).json();
  assert.equal(listed.inputs.length, 1);
  assert.equal(listed.inputs[0].baseCurrent, true);
  const handled = await (await handlePlanInputRequest(request(`/api/plan-inputs/${saved.input.inputId}/resolve`, "POST", { inputId: saved.input.inputId, planId, expectedRevision: 1, idempotencyKey: "plan-input-handle-0001", sourceSurface: "site" }), db)).json();
  assert.equal(handled.code, "PLAN_INPUT_HANDLED");
  assert.equal(handled.inputs.length, 0);
});

test("a person can change a direct plan item or hand it to Codex", async () => {
  const db = new PlanInputDb(); seed(db);
  const added = await (await handlePlanInputRequest(request("/api/plan-inputs", "POST", { planId, expectedRevision: 1, kind: "decision", mode: "direct", section: "money", message: "Keep $40 aside.", idempotencyKey: "plan-input-add-0003", sourceSurface: "site" }), db)).json();
  const changed = await (await handlePlanInputRequest(request(`/api/plan-inputs/${added.input.inputId}`, "POST", { inputId: added.input.inputId, planId, expectedRevision: 1, kind: "update", mode: "codex", section: "money", message: "Rework the budget with $50 set aside.", idempotencyKey: "plan-input-update-0003", sourceSurface: "site" }), db)).json();
  assert.equal(changed.code, "PLAN_INPUT_UPDATED");
  assert.equal(changed.input.mode, "codex");
  assert.equal(changed.input.message, "Rework the budget with $50 set aside.");
  const listed = await (await handlePlanInputRequest(request(`/api/plan-inputs?planId=${planId}`), db)).json();
  assert.equal(listed.inputs[0].mode, "codex");
});

test("plan inputs refuse stale, cross-origin, anonymous, and idempotency-conflicting writes", async () => {
  const db = new PlanInputDb(); seed(db);
  const base = { planId, expectedRevision: 1, kind: "update", mode: "codex", section: "general", message: "Two guests may be late.", idempotencyKey: "plan-input-add-0002", sourceSurface: "codex" };
  assert.equal((await handlePlanInputRequest(request("/api/plan-inputs", "POST", { ...base, expectedRevision: 2 }), db)).status, 409);
  assert.equal((await handlePlanInputRequest(request("/api/plan-inputs", "POST", base, { origin: "https://other.example" }), db)).status, 403);
  assert.equal((await handlePlanInputRequest(new Request("https://finite.example/api/plan-inputs", { method: "POST", headers: { "content-type": "application/json", origin: "https://finite.example" }, body: JSON.stringify(base) }), db)).status, 401);
  assert.equal((await handlePlanInputRequest(request("/api/plan-inputs", "POST", base), db)).status, 201);
  assert.equal((await handlePlanInputRequest(request("/api/plan-inputs", "POST", { ...base, message: "Different message" }), db)).status, 409);
});
