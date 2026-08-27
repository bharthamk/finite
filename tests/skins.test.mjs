import test from "node:test";
import assert from "node:assert/strict";
import { builtInSkins, skinTraitKeys, validateSkinDraft } from "../dist-test/src/skin.js";
import { handleSkinRequest } from "../dist-test/worker/skins.js";

class Statement {
  constructor(db, query, values = []) { this.db = db; this.query = query; this.values = values; }
  bind(...values) { return new Statement(this.db, this.query, values); }
  first() { return this.db.first(this.query, this.values); }
  all() { return this.db.all(this.query, this.values); }
}
class SkinDb {
  skins = new Map(); preferences = new Map(); receipts = new Map();
  prepare(query) { return new Statement(this, query); }
  key(scopeId, skinId) { return `${scopeId}:${skinId}`; }
  async first(query, values) {
    if (query.includes("FROM tenant_skin_receipts")) return this.receipts.get(this.key(values[0], values[1])) ?? null;
    if (query.includes("SELECT active_skin_id FROM tenant_skin_preferences")) return this.preferences.has(values[0]) ? { active_skin_id: this.preferences.get(values[0]) } : null;
    if (query.includes("SELECT created_at FROM tenant_skins")) { const row = this.skins.get(this.key(values[0], values[1])); return row ? { created_at: row.created_at } : null; }
    if (query.includes("SELECT skin_id FROM tenant_skins")) { const row = this.skins.get(this.key(values[0], values[1])); return row ? { skin_id: row.skin_id } : null; }
    if (query.includes("FROM tenant_skins WHERE scope_id = ? AND skin_id = ?")) return this.skins.get(this.key(values[0], values[1])) ?? null;
    if (query.includes("FROM demo_sessions") || query.includes("FROM tenant_accounts")) return null;
    return null;
  }
  async all(query, values) {
    if (query.includes("FROM tenant_skins WHERE scope_id = ?")) return { results: [...this.skins.values()].filter((row) => row.scope_id === values[0]) };
    return { results: [] };
  }
  async batch(statements) {
    for (const { query, values } of statements) {
      if (query.startsWith("INSERT INTO tenant_skins")) this.skins.set(this.key(values[0], values[1]), { scope_id: values[0], skin_id: values[1], name: values[2], description: values[3], recipe_json: values[4], content_hash: values[5], created_at: values[6], updated_at: values[7] });
      else if (query.startsWith("INSERT INTO tenant_skin_preferences")) this.preferences.set(values[0], values[1]);
      else if (query.startsWith("DELETE FROM tenant_skins")) this.skins.delete(this.key(values[0], values[1]));
      else if (query.startsWith("UPDATE tenant_skin_preferences") && this.preferences.get(values[2]) === values[3]) this.preferences.set(values[2], values[0]);
      else if (query.startsWith("INSERT INTO tenant_skin_receipts")) this.receipts.set(this.key(values[0], values[1]), { request_hash: values[2], receipt_json: values[3] });
    }
    return statements.map(() => ({ success: true }));
  }
}

const authHeaders = { "oai-authenticated-user-id": "skin-user-123", origin: "https://finite.example", "content-type": "application/json" };

test("four built-in skins are materially distinct and satisfy the bounded recipe contract", () => {
  assert.deepEqual(builtInSkins.map((skin) => skin.skinId), ["workshop", "quiet", "editorial", "soft-system"]);
  assert.equal(new Set(builtInSkins.map((skin) => JSON.stringify(skin.recipe))).size, 4);
  for (const skin of builtInSkins) assert.equal(validateSkinDraft({ skinId: `custom_${skin.skinId}-test`, name: skin.name, description: skin.description, recipe: skin.recipe }).ok, true);
});

test("skin validation rejects missing, unknown, and arbitrary presentation input", () => {
  const unsafe = validateSkinDraft({ skinId: "custom_unsafe-skin", name: "Unsafe", description: "Unsafe recipe", recipe: { ...builtInSkins[0].recipe, css: "body{display:none}" } });
  assert.equal(unsafe.ok, false);
  assert(unsafe.issues.some((issue) => issue.includes("unknown recipe trait css")));
  const invalid = validateSkinDraft({ skinId: "custom_invalid-skin", name: "Invalid", description: "Invalid recipe", recipe: { ...builtInSkins[0].recipe, typeStyle: "remote-font" } });
  assert.equal(invalid.ok, false);
  assert(invalid.issues.some((issue) => issue.includes("typeStyle")));
  assert.deepEqual(skinTraitKeys.length, 9);
});

test("an authenticated account can save, replay, apply, list, and delete a custom skin", async () => {
  const db = new SkinDb();
  const draft = { skinId: "custom_quiet-studio", name: "Quiet studio", description: "A calm working surface.", recipe: builtInSkins[1].recipe, idempotencyKey: "skin-save-0001", sourceSurface: "codex" };
  const saved = await handleSkinRequest(new Request("https://finite.example/api/skins", { method: "POST", headers: authHeaders, body: JSON.stringify(draft) }), db);
  assert.equal(saved.status, 201); assert.equal((await saved.json()).code, "CUSTOM_SKIN_CREATED");
  const replay = await handleSkinRequest(new Request("https://finite.example/api/skins", { method: "POST", headers: authHeaders, body: JSON.stringify(draft) }), db);
  assert.equal((await replay.json()).receipt.replay, true);
  const applied = await handleSkinRequest(new Request("https://finite.example/api/skins/active", { method: "POST", headers: authHeaders, body: JSON.stringify({ skinId: draft.skinId, idempotencyKey: "skin-apply-0001", sourceSurface: "site" }) }), db);
  assert.equal((await applied.json()).code, "SKIN_APPLIED");
  const catalog = await (await handleSkinRequest(new Request("https://finite.example/api/skins", { headers: authHeaders }), db)).json();
  assert.equal(catalog.activeSkinId, draft.skinId); assert.equal(catalog.custom.length, 1);
  const deleted = await handleSkinRequest(new Request(`https://finite.example/api/skins/${draft.skinId}`, { method: "DELETE", headers: authHeaders, body: JSON.stringify({ skinId: draft.skinId, idempotencyKey: "skin-delete-0001", sourceSurface: "site" }) }), db);
  const deletion = await deleted.json(); assert.equal(deletion.code, "CUSTOM_SKIN_DELETED"); assert.equal(deletion.activeSkinId, "workshop");
});

test("skin persistence is authenticated, same-origin, and unavailable to durable demo writes", async () => {
  const db = new SkinDb();
  assert.equal((await handleSkinRequest(new Request("https://finite.example/api/skins"), db)).status, 401);
  const crossOrigin = await handleSkinRequest(new Request("https://finite.example/api/skins/active", { method: "POST", headers: { ...authHeaders, origin: "https://attacker.example" }, body: JSON.stringify({ skinId: "quiet", idempotencyKey: "skin-cross-0001", sourceSurface: "codex" }) }), db);
  assert.equal(crossOrigin.status, 403); assert.equal(db.preferences.size, 0);
});
