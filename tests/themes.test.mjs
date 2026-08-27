import test from "node:test";
import assert from "node:assert/strict";
import { builtInThemes, themeCoreTokenKeys, validateThemeDraft } from "../dist-test/src/theme.js";
import { handleThemeRequest } from "../dist-test/worker/themes.js";

class Statement {
  constructor(db, query, values = []) { this.db = db; this.query = query; this.values = values; }
  bind(...values) { return new Statement(this.db, this.query, values); }
  first() { return this.db.first(this.query, this.values); }
  all() { return this.db.all(this.query, this.values); }
}

class ThemeDb {
  themes = new Map();
  preferences = new Map();
  receipts = new Map();
  prepare(query) { return new Statement(this, query); }
  key(scopeId, themeId) { return `${scopeId}:${themeId}`; }

  async first(query, values) {
    if (query.includes("FROM tenant_theme_receipts")) return this.receipts.get(this.key(values[0], values[1])) ?? null;
    if (query.includes("SELECT active_theme_id FROM tenant_theme_preferences")) return this.preferences.has(values[0]) ? { active_theme_id: this.preferences.get(values[0]) } : null;
    if (query.includes("SELECT created_at FROM tenant_themes")) {
      const row = this.themes.get(this.key(values[0], values[1]));
      return row ? { created_at: row.created_at } : null;
    }
    if (query.includes("SELECT theme_id FROM tenant_themes")) {
      const row = this.themes.get(this.key(values[0], values[1]));
      return row ? { theme_id: row.theme_id } : null;
    }
    if (query.includes("FROM tenant_themes WHERE scope_id = ? AND theme_id = ?")) return this.themes.get(this.key(values[0], values[1])) ?? null;
    if (query.includes("FROM demo_sessions")) return null;
    if (query.includes("FROM tenant_accounts")) return null;
    return null;
  }

  async all(query, values) {
    if (query.includes("FROM tenant_themes WHERE scope_id = ?")) return { results: [...this.themes.values()].filter((row) => row.scope_id === values[0]).sort((a, b) => b.updated_at.localeCompare(a.updated_at)) };
    return { results: [] };
  }

  async batch(statements) {
    for (const { query, values } of statements) {
      if (query.startsWith("INSERT INTO tenant_themes")) {
        this.themes.set(this.key(values[0], values[1]), { scope_id: values[0], theme_id: values[1], name: values[2], mode: values[3], tokens_json: values[4], content_hash: values[5], created_at: values[6], updated_at: values[7] });
      } else if (query.startsWith("INSERT INTO tenant_theme_preferences")) {
        this.preferences.set(values[0], values[1]);
      } else if (query.startsWith("DELETE FROM tenant_themes")) {
        this.themes.delete(this.key(values[0], values[1]));
      } else if (query.startsWith("UPDATE tenant_theme_preferences")) {
        if (this.preferences.get(values[2]) === values[3]) this.preferences.set(values[2], values[0]);
      } else if (query.startsWith("INSERT INTO tenant_theme_receipts")) {
        this.receipts.set(this.key(values[0], values[1]), { request_hash: values[2], receipt_json: values[3] });
      }
    }
    return statements.map(() => ({ success: true }));
  }
}

const authHeaders = { "oai-authenticated-user-id": "theme-user-123", origin: "https://finite.example", "content-type": "application/json" };
const coreTokens = (theme = builtInThemes[0]) => Object.fromEntries(themeCoreTokenKeys.map((key) => [key, theme.tokens[key]]));

test("all four built-in themes satisfy the same bounded custom-theme contract", () => {
  assert.equal(builtInThemes.length, 4);
  for (const theme of builtInThemes) {
    const validation = validateThemeDraft({ themeId: "custom_validation-theme", name: theme.name, mode: theme.mode, tokens: coreTokens(theme) });
    assert.equal(validation.ok, true, validation.ok ? "" : validation.issues.join("; "));
  }
});

test("theme validation rejects low contrast and any raw-CSS-shaped extra token", () => {
  const injected = validateThemeDraft({ themeId: "custom_unsafe-theme", name: "Unsafe", mode: "light", tokens: { ...coreTokens(), css: "body { display:none }" } });
  assert.equal(injected.ok, false);
  assert(injected.issues.some((issue) => issue.includes("unknown token css")));
  const lowContrast = validateThemeDraft({ themeId: "custom_low-contrast", name: "Low contrast", mode: "light", tokens: { ...coreTokens(), ink: "#777777", paper: "#777777" } });
  assert.equal(lowContrast.ok, false);
  assert(lowContrast.issues.some((issue) => issue.includes("contrast")));
});

test("an authenticated tenant can save, replay, apply, list, and delete a custom theme", async () => {
  const db = new ThemeDb();
  const draft = { themeId: "custom_quiet-studio", name: "Quiet studio", mode: "dark", tokens: coreTokens(builtInThemes[1]), idempotencyKey: "theme-save-0001", sourceSurface: "codex" };
  const saved = await handleThemeRequest(new Request("https://finite.example/api/themes", { method: "POST", headers: authHeaders, body: JSON.stringify(draft) }), db);
  assert.equal(saved.status, 201);
  assert.equal((await saved.json()).code, "CUSTOM_THEME_CREATED");
  const replay = await handleThemeRequest(new Request("https://finite.example/api/themes", { method: "POST", headers: authHeaders, body: JSON.stringify(draft) }), db);
  assert.equal((await replay.json()).receipt.replay, true);

  const applied = await handleThemeRequest(new Request("https://finite.example/api/themes/active", { method: "POST", headers: authHeaders, body: JSON.stringify({ themeId: draft.themeId, idempotencyKey: "theme-apply-0001", sourceSurface: "site" }) }), db);
  assert.equal((await applied.json()).code, "THEME_APPLIED");
  const listed = await handleThemeRequest(new Request("https://finite.example/api/themes", { headers: authHeaders }), db);
  const catalog = await listed.json();
  assert.equal(catalog.activeThemeId, draft.themeId);
  assert.equal(catalog.custom.length, 1);

  const deleted = await handleThemeRequest(new Request(`https://finite.example/api/themes/${draft.themeId}`, { method: "DELETE", headers: authHeaders, body: JSON.stringify({ themeId: draft.themeId, idempotencyKey: "theme-delete-0001", sourceSurface: "site" }) }), db);
  const deletion = await deleted.json();
  assert.equal(deletion.code, "CUSTOM_THEME_DELETED");
  assert.equal(deletion.activeThemeId, "workshop");
  assert.equal(db.themes.size, 0);
});

test("theme settings are authenticated, tenant-scoped, and same-origin on writes", async () => {
  const db = new ThemeDb();
  const signedOut = await handleThemeRequest(new Request("https://finite.example/api/themes"), db);
  assert.equal(signedOut.status, 401);
  const crossOrigin = await handleThemeRequest(new Request("https://finite.example/api/themes/active", { method: "POST", headers: { ...authHeaders, origin: "https://attacker.example" }, body: JSON.stringify({ themeId: "workshop", idempotencyKey: "theme-cross-0001", sourceSurface: "codex" }) }), db);
  assert.equal(crossOrigin.status, 403);
  assert.equal(db.preferences.size, 0);
});
