import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { handleAcceptedTruthRequest } from "../dist-test/worker/accepted-truth.js";
import { handleAuthRequest } from "../dist-test/worker/auth.js";
import { tenantDataTables } from "../dist-test/worker/tenant-data.js";

class Statement {
  constructor(db, query, values = []) { this.db = db; this.query = query; this.values = values; }
  bind(...values) { return new Statement(this.db, this.query, values); }
  first() { return this.db.first(this.query, this.values); }
  all() { return this.db.all(this.query, this.values); }
}

class AuthDb {
  tenants = new Map();
  demos = new Map();
  resets = new Map();
  counts = new Map();
  statements = [];
  attachments = new Map();
  resetJobs = new Map();

  prepare(query) { return new Statement(this, query); }

  async first(query, values) {
    if (query.startsWith("SELECT COUNT(*) AS count FROM ")) {
      const table = query.match(/^SELECT COUNT\(\*\) AS count FROM ([a-z_]+)/)?.[1];
      return { count: this.counts.get(values[0])?.[table] ?? 0 };
    }
    if (query.includes("FROM tenant_reset_receipts WHERE scope_id")) return this.resets.get(`${values[0]}:${values[1]}`) ?? null;
    if (query.includes("FROM tenant_reset_jobs WHERE scope_id")) return this.resetJobs.get(`${values[0]}:${values[1]}`) ?? null;
    if (query.includes("FROM demo_sessions WHERE session_hash")) return this.demos.get(values[0]) ?? null;
    if (query.includes("FROM demo_sessions WHERE scope_id")) return [...this.demos.values()].find((row) => row.scope_id === values[0]) ?? null;
    if (query.includes("FROM tenant_accounts WHERE scope_id")) {
      const row = this.tenants.get(values[0]);
      return row && (!values[1] || row.user_id_hash === values[1]) ? { scope_id: row.scope_id, legacy_scope_adopted: row.legacy_scope_adopted ? 1 : 0 } : null;
    }
    if (query.includes("FROM plan_heads")) return null;
    return null;
  }

  async all(query, values) {
    if (query.includes("FROM demo_sessions WHERE expires_at <=")) return { results: [...this.demos.values()].filter((row) => row.expires_at <= values[0]).slice(0, 10).map(({ scope_id }) => ({ scope_id })) };
    if (query.includes("FROM plan_attachments") && query.includes("object_key IS NOT NULL")) return { results: [...this.attachments.values()].filter((row) => row.scope_id === values[0] && row.object_key).map(({ object_key }) => ({ object_key })) };
    return { results: [] };
  }

  async batch(statements) {
    for (const statement of statements) {
      const { query, values } = statement;
      this.statements.push({ query, values });
      if (query.startsWith("INSERT INTO tenant_accounts")) {
        this.tenants.set(values[0], { scope_id: values[0], user_id_hash: values[1], legacy_scope_adopted: false, created_at: values[2] });
      } else if (query.startsWith("INSERT INTO demo_sessions")) {
        this.demos.set(values[0], { session_hash: values[0], scope_id: values[1], created_at: values[2], expires_at: values[3] });
      } else if (query.startsWith("DELETE FROM demo_sessions WHERE scope_id")) {
        for (const [key, row] of this.demos) if (row.scope_id === values[0]) this.demos.delete(key);
      } else if (query.startsWith("DELETE FROM tenant_accounts WHERE scope_id")) {
        this.tenants.delete(values[0]);
      } else if (query.startsWith("DELETE FROM tenant_reset_receipts WHERE scope_id")) {
        for (const key of this.resets.keys()) if (key.startsWith(`${values[0]}:`)) this.resets.delete(key);
      } else if (query.startsWith("DELETE FROM tenant_reset_jobs WHERE scope_id") && query.includes("idempotency_key !=")) {
        for (const key of this.resetJobs.keys()) if (key.startsWith(`${values[0]}:`) && key !== `${values[0]}:${values[1]}`) this.resetJobs.delete(key);
      } else if (query.startsWith("DELETE FROM tenant_reset_jobs WHERE scope_id")) {
        for (const key of this.resetJobs.keys()) if (key.startsWith(`${values[0]}:`)) this.resetJobs.delete(key);
      } else if (query.startsWith("DELETE FROM ") && query.includes(" WHERE scope_id = ?")) {
        const table = query.match(/^DELETE FROM ([a-z_]+)/)?.[1];
        if (table && this.counts.has(values[0])) this.counts.get(values[0])[table] = 0;
      } else if (query.startsWith("INSERT OR IGNORE INTO tenant_accounts")) {
        if (!this.tenants.has(values[0])) this.tenants.set(values[0], { scope_id: values[0], user_id_hash: values[1], legacy_scope_adopted: false, created_at: values[2] });
      } else if (query.startsWith("UPDATE tenant_accounts SET legacy_scope_adopted = 0")) {
        const row = this.tenants.get(values[0]);
        if (row) row.legacy_scope_adopted = false;
      } else if (query.startsWith("INSERT INTO tenant_reset_receipts")) {
        this.resets.set(`${values[0]}:${values[1]}`, { request_hash: values[2], receipt_json: values[3] });
      } else if (query.startsWith("INSERT INTO tenant_reset_jobs")) {
        this.resetJobs.set(`${values[0]}:${values[1]}`, { request_hash: values[2], object_keys_json: values[3], status: "pending" });
      } else if (query.startsWith("UPDATE tenant_reset_jobs SET")) {
        const row = this.resetJobs.get(`${values[2]}:${values[3]}`);
        if (row) this.resetJobs.set(`${values[2]}:${values[3]}`, { ...row, object_keys_json: "[]", status: "completed" });
      }
    }
    return statements.map(() => ({ success: true }));
  }
}

class FilesBucket {
  objects = new Set();
  failDeletes = 0;
  async delete(key) {
    if (this.failDeletes > 0) { this.failDeletes -= 1; throw new Error("R2 unavailable"); }
    this.objects.delete(key);
  }
}

const cookieFrom = (response) => response.headers.get("set-cookie").split(";", 1)[0];

test("the reset inventory covers every tenant-data table in the current schema", async () => {
  const schema = await readFile(new URL("../db/schema.ts", import.meta.url), "utf8");
  const tables = [...schema.matchAll(/sqliteTable\("([a-z_]+)"/g)].map((match) => match[1]);
  const infrastructure = new Set(["tenant_accounts", "demo_sessions", "tenant_reset_receipts", "tenant_reset_jobs"]);
  assert.deepEqual(new Set(tenantDataTables), new Set(tables.filter((table) => !infrastructure.has(table))));
});

test("Sites identity supplies first-use account registration without a Finite credential", async () => {
  const response = await handleAuthRequest(new Request("https://finite.example/api/auth/session", { headers: {
    "oai-authenticated-user-id": "site-user-123",
    "oai-authenticated-user-email": "DINER@example.com",
    "oai-authenticated-user-full-name": "Dinner%20Guest",
    "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
  } }), new AuthDb());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    code: "AUTHENTICATED_SESSION",
    session: {
      kind: "account",
      provider: "chatgpt",
      displayName: "Dinner Guest",
      email: "diner@example.com",
      expiresAt: null,
      storageScope: "user_6ecc4cd33b3921198473dd4b6786dd68",
      legacyBrowserCacheEligible: false,
    },
  });
});

test("new accounts never inherit the legacy owner namespace implicitly", async () => {
  const db = new AuthDb();
  const headers = { "oai-authenticated-user-id": "new-user-with-no-legacy-authority" };
  const response = await handleAcceptedTruthRequest(new Request("https://finite.example/api/accepted-truth/plan_travel_europe?profileHash=hash", { headers }), db);
  assert.equal(response.status, 404);
  assert.equal(db.tenants.size, 1);
  assert.equal([...db.tenants.values()][0].legacy_scope_adopted, false);
  assert.equal(db.statements.some(({ query }) => query.includes("owner-private-v1") || query.includes("legacy_scope_adopted = 1")), false);
});

test("signed-out visitors receive an official ChatGPT route and can create an isolated expiring demo", async () => {
  const db = new AuthDb();
  const signedOut = await handleAuthRequest(new Request("https://finite.example/api/auth/session"), db);
  assert.deepEqual(await signedOut.json(), { ok: true, code: "SIGNED_OUT", session: null, signInPath: "/signin-with-chatgpt" });

  const created = await handleAuthRequest(new Request("https://finite.example/api/auth/demo", {
    method: "POST",
    headers: { origin: "https://finite.example", "content-type": "application/json" },
    body: "{}",
  }), db);
  assert.equal(created.status, 201);
  const createdPayload = await created.clone().json();
  assert.match(createdPayload.session.storageScope, /^demo_[a-f0-9]{32}$/);
  assert.equal(createdPayload.session.legacyBrowserCacheEligible, false);
  assert.match(created.headers.get("set-cookie"), /^finite_demo=.+HttpOnly; Secure; SameSite=Lax; Max-Age=86400$/);
  assert.equal(db.tenants.size, 1);
  assert.equal([...db.tenants.values()][0].legacy_scope_adopted, false);
  assert.equal(db.statements.some(({ query }) => query.includes("legacy_scope_adopted = 1")), false);

  const cookie = cookieFrom(created);
  const resumed = await handleAuthRequest(new Request("https://finite.example/api/auth/session", { headers: { cookie } }), db);
  const resumedPayload = await resumed.json();
  assert.equal(resumedPayload.code, "DEMO_SESSION");
  assert.equal(resumedPayload.session.kind, "demo");
  assert.equal(resumedPayload.session.displayName, "Finite demo");

  const protectedRead = await handleAcceptedTruthRequest(new Request("https://finite.example/api/accepted-truth/plan?profileHash=hash", { headers: { cookie } }), db);
  assert.equal(protectedRead.status, 404);
  assert.equal((await protectedRead.json()).code, "ACCEPTED_TRUTH_NOT_FOUND");
});

test("ending or expiring a demo destroys its tenant namespace and bearer cookie", async () => {
  const db = new AuthDb();
  const created = await handleAuthRequest(new Request("https://finite.example/api/auth/demo", { method: "POST", headers: { origin: "https://finite.example" } }), db);
  const cookie = cookieFrom(created);
  const ended = await handleAuthRequest(new Request("https://finite.example/api/auth/demo/end", { method: "POST", headers: { origin: "https://finite.example", cookie } }), db);
  assert.equal((await ended.json()).code, "DEMO_SESSION_ENDED");
  assert.match(ended.headers.get("set-cookie"), /Max-Age=0/);
  assert.equal(db.demos.size, 0);
  assert.equal(db.tenants.size, 0);
  assert.equal(db.statements.some(({ query }) => query === "DELETE FROM arrival_events WHERE scope_id = ?"), true);
  assert.equal(db.statements.some(({ query }) => query === "DELETE FROM arrival_orders WHERE scope_id = ?"), true);
  assert.equal(db.statements.some(({ query }) => query === "DELETE FROM construction_return_reviews WHERE scope_id = ?"), true);
  assert.equal(db.statements.some(({ query }) => query === "DELETE FROM construction_packets WHERE scope_id = ?"), true);
  assert.equal(db.statements.some(({ query }) => query === "DELETE FROM plan_catalog WHERE scope_id = ?"), true);

  const after = await handleAuthRequest(new Request("https://finite.example/api/auth/session", { headers: { cookie } }), db);
  assert.equal((await after.json()).code, "SIGNED_OUT");
});

test("creating a demo opportunistically purges abandoned expired demo namespaces", async () => {
  const db = new AuthDb();
  db.tenants.set("demo_expired_scope", { scope_id: "demo_expired_scope", user_id_hash: "expired", legacy_scope_adopted: false, created_at: "2026-08-01T00:00:00.000Z" });
  db.demos.set("expired_session_hash", { session_hash: "expired_session_hash", scope_id: "demo_expired_scope", created_at: "2026-08-01T00:00:00.000Z", expires_at: "2026-08-02T00:00:00.000Z" });

  const response = await handleAuthRequest(new Request("https://finite.example/api/auth/demo", { method: "POST", headers: { origin: "https://finite.example" } }), db);
  assert.equal(response.status, 201);
  assert.equal(db.tenants.has("demo_expired_scope"), false);
  assert.equal([...db.demos.values()].some(({ scope_id }) => scope_id === "demo_expired_scope"), false);
});

test("auth writes reject cross-origin requests before creating a demo", async () => {
  const db = new AuthDb();
  const response = await handleAuthRequest(new Request("https://finite.example/api/auth/demo", { method: "POST", headers: { origin: "https://attacker.example" } }), db);
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "CROSS_ORIGIN_WRITE_REFUSED");
  assert.equal(db.demos.size, 0);
});

test("an authenticated human can preview and permanently reset only the current kitchen", async () => {
  const db = new AuthDb();
  const headers = {
    "oai-authenticated-user-id": "reset-user-123",
    origin: "https://finite.example",
    "content-type": "application/json",
  };
  const session = await handleAuthRequest(new Request("https://finite.example/api/auth/session", { headers }), db);
  const scopeId = (await session.json()).session.storageScope;
  db.tenants.set(scopeId, { scope_id: scopeId, user_id_hash: "reset-user-hash", legacy_scope_adopted: true, created_at: "2026-08-01T00:00:00.000Z" });
  db.counts.set(scopeId, { arrival_orders: 1, arrival_events: 9, plan_heads: 3, plan_revisions: 5, receipts: 2 });

  const preview = await handleAuthRequest(new Request("https://finite.example/api/auth/reset", { headers }), db);
  const previewBody = await preview.json();
  assert.equal(previewBody.code, "KITCHEN_RESET_PREVIEW");
  assert.equal(previewBody.confirmation, "START OVER");
  assert.equal(previewBody.totalRecords, 20);

  const refused = await handleAuthRequest(new Request("https://finite.example/api/auth/reset", { method: "POST", headers, body: JSON.stringify({ confirmation: "start over", idempotencyKey: "reset-one-0001", sourceSurface: "site" }) }), db);
  assert.equal(refused.status, 422);
  assert.equal((await refused.json()).code, "KITCHEN_RESET_CONFIRMATION_REQUIRED");
  assert.equal(db.counts.get(scopeId).arrival_orders, 1);

  const reset = await handleAuthRequest(new Request("https://finite.example/api/auth/reset", { method: "POST", headers, body: JSON.stringify({ confirmation: "START OVER", idempotencyKey: "reset-one-0001", sourceSurface: "site" }) }), db);
  const resetBody = await reset.json();
  assert.equal(resetBody.code, "KITCHEN_RESET");
  assert.equal(resetBody.receipt.totalRecords, 20);
  assert.equal(resetBody.receipt.sourceSurface, "site");
  assert.equal(db.counts.get(scopeId).arrival_orders, 0);
  assert.equal(db.counts.get(scopeId).plan_heads, 0);
  assert.equal(db.tenants.has(scopeId), true);
  assert.equal(db.tenants.get(scopeId).legacy_scope_adopted, false);

  const replay = await handleAuthRequest(new Request("https://finite.example/api/auth/reset", { method: "POST", headers, body: JSON.stringify({ confirmation: "START OVER", idempotencyKey: "reset-one-0001", sourceSurface: "site" }) }), db);
  assert.equal((await replay.json()).receipt.replay, true);
});

test("kitchen reset rejects signed-out and cross-origin callers", async () => {
  const db = new AuthDb();
  const signedOut = await handleAuthRequest(new Request("https://finite.example/api/auth/reset"), db);
  assert.equal(signedOut.status, 401);
  const crossOrigin = await handleAuthRequest(new Request("https://finite.example/api/auth/reset", {
    method: "POST",
    headers: { "oai-authenticated-user-id": "reset-user", origin: "https://attacker.example", "content-type": "application/json" },
    body: JSON.stringify({ confirmation: "START OVER", idempotencyKey: "reset-two-0001", sourceSurface: "codex" }),
  }), db);
  assert.equal(crossOrigin.status, 403);
});

test("reset deletes private files before D1 and safely resumes after an R2 failure", async () => {
  const db = new AuthDb();
  const files = new FilesBucket();
  const headers = { "oai-authenticated-user-id": "reset-files-user", origin: "https://finite.example", "content-type": "application/json" };
  const session = await handleAuthRequest(new Request("https://finite.example/api/auth/session", { headers }), db, files);
  const scopeId = (await session.json()).session.storageScope;
  db.tenants.set(scopeId, { scope_id: scopeId, user_id_hash: "hash", legacy_scope_adopted: false, created_at: "2026-08-01T00:00:00.000Z" });
  db.counts.set(scopeId, { plan_attachments: 1, plan_work_receipts: 1, tenant_themes: 1, tenant_skins: 1 });
  db.attachments.set(`${scopeId}:attachment_one`, { scope_id: scopeId, object_key: `${scopeId}/plan/attachment_one` });
  files.objects.add(`${scopeId}/plan/attachment_one`);
  files.failDeletes = 1;
  const body = JSON.stringify({ confirmation: "START OVER", idempotencyKey: "reset-files-0001", sourceSurface: "site" });
  const pending = await handleAuthRequest(new Request("https://finite.example/api/auth/reset", { method: "POST", headers, body }), db, files);
  assert.equal(pending.status, 503);
  assert.equal((await pending.json()).code, "KITCHEN_RESET_STORAGE_PENDING");
  assert.equal(db.counts.get(scopeId).plan_attachments, 1);
  assert.equal(db.resetJobs.get(`${scopeId}:reset-files-0001`).status, "pending");
  const recovered = await handleAuthRequest(new Request("https://finite.example/api/auth/reset", { method: "POST", headers, body }), db, files);
  const result = await recovered.json();
  assert.equal(result.code, "KITCHEN_RESET");
  assert.equal(result.receipt.deletedFiles, 1);
  assert.equal(files.objects.size, 0);
  assert.equal(db.counts.get(scopeId).plan_attachments, 0);
  assert.equal(db.counts.get(scopeId).tenant_themes, 0);
  assert.equal(db.counts.get(scopeId).tenant_skins, 0);
  assert.equal(db.resetJobs.get(`${scopeId}:reset-files-0001`).status, "completed");
});
