import test from "node:test";
import assert from "node:assert/strict";
import { validateAgenticName } from "../dist-test/src/settings.js";
import { handleSettingsRequest } from "../dist-test/worker/settings.js";

class SettingsDb {
  settings = new Map();
  receipts = new Map();
  prepare(query) {
    const db = this;
    return {
      values: [], query,
      bind(...values) { this.values = values; return this; },
      async first() {
        if (query.includes("FROM tenant_settings_receipts")) return db.receipts.get(`${this.values[0]}:${this.values[1]}`) ?? null;
        if (query.includes("FROM tenant_settings WHERE")) return db.settings.get(this.values[0]) ?? null;
        return null;
      },
      async all() { return { results: [] }; },
    };
  }
  async batch(statements) {
    for (const statement of statements) {
      if (statement.query.startsWith("INSERT INTO tenant_settings (")) {
        const [scopeId, agenticName, updatedAt] = statement.values;
        this.settings.set(scopeId, { agentic_name: agenticName, updated_at: updatedAt });
      } else if (statement.query.startsWith("INSERT INTO tenant_settings_receipts")) {
        const [scopeId, idempotencyKey, requestHash, receiptJson] = statement.values;
        this.receipts.set(`${scopeId}:${idempotencyKey}`, { request_hash: requestHash, receipt_json: receiptJson });
      }
    }
    return statements.map(() => ({ success: true }));
  }
}

const request = (method = "GET", body, extras = {}) => new Request("https://finite.example/api/settings", {
  method,
  headers: { "oai-authenticated-user-id": "user_settings_test", ...(body ? { "content-type": "application/json", origin: "https://finite.example" } : {}), ...extras },
  ...(body ? { body: JSON.stringify(body) } : {}),
});

test("agentic names are short, human-readable single-line labels", () => {
  assert.deepEqual(validateAgenticName("  Ari  "), { ok: true, name: "Ari" });
  assert.equal(validateAgenticName("🌿 Planner").ok, true);
  assert.equal(validateAgenticName("").ok, false);
  assert.equal(validateAgenticName("a".repeat(41)).ok, false);
  assert.equal(validateAgenticName("Line one\nLine two").ok, false);
});

test("account settings default to Codex, persist, replay, and reject conflicting idempotency", async () => {
  const db = new SettingsDb();
  const initial = await (await handleSettingsRequest(request(), db)).json();
  assert.equal(initial.settings.agenticName, "Codex");
  const input = { agenticName: "Ari", idempotencyKey: "settings-save-0001", sourceSurface: "site" };
  const saved = await (await handleSettingsRequest(request("PUT", input), db)).json();
  assert.equal(saved.code, "AGENTIC_NAME_SAVED");
  assert.equal(saved.settings.agenticName, "Ari");
  const loaded = await (await handleSettingsRequest(request(), db)).json();
  assert.equal(loaded.settings.agenticName, "Ari");
  const replay = await (await handleSettingsRequest(request("PUT", input), db)).json();
  assert.deepEqual(replay, saved);
  const conflict = await handleSettingsRequest(request("PUT", { ...input, agenticName: "Nova" }), db);
  assert.equal(conflict.status, 409);
});

test("settings refuse cross-origin and anonymous persistence", async () => {
  const db = new SettingsDb();
  const input = { agenticName: "Ari", idempotencyKey: "settings-save-0002", sourceSurface: "site" };
  const crossOrigin = await handleSettingsRequest(request("PUT", input, { origin: "https://other.example" }), db);
  assert.equal(crossOrigin.status, 403);
  const anonymous = await handleSettingsRequest(new Request("https://finite.example/api/settings", { method: "PUT", headers: { "content-type": "application/json", origin: "https://finite.example" }, body: JSON.stringify(input) }), db);
  assert.equal(anonymous.status, 401);
});
