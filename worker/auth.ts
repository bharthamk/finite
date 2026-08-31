import type { D1Database } from "./accepted-truth.js";
import type { FiniteFilesBucket } from "./files.js";
import { tenantDataTables, tenantDeleteStatements } from "./tenant-data.js";

type JsonRecord = Record<string, unknown>;

export interface FinitePrincipal {
  kind: "account" | "demo";
  provider: "chatgpt" | "demo";
  tenantIdentity: JsonRecord;
  displayName: string;
  email: string | null;
  expiresAt: string | null;
}

interface DemoSessionRow {
  session_hash: string;
  scope_id: string;
  created_at: string;
  expires_at: string;
}

interface ResetJobRow {
  request_hash: string;
  object_keys_json: string;
  status: "pending" | "completed";
}

const demoCookieName = "finite_demo";
const demoTtlSeconds = 24 * 60 * 60;
const resetConfirmation = "START OVER";
const jsonHeaders = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

const stableSerialize = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as JsonRecord;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

export const authSha256 = async (value: unknown): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(stableSerialize(value)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const response = (status: number, body: JsonRecord, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { ...jsonHeaders, ...headers } });

const sameOriginWrite = (request: Request): boolean => {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
};

const cookieValue = (request: Request, name: string): string | null => {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === name) return decodeURIComponent(rawValue.join("="));
  }
  return null;
};

const randomToken = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
};

const demoCookie = (token: string, maxAge: number): string =>
  `${demoCookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

const attachmentObjectKeys = async (db: D1Database, scopeId: string): Promise<string[]> => {
  const rows = await db.prepare("SELECT object_key FROM plan_attachments WHERE scope_id = ? AND object_key IS NOT NULL")
    .bind(scopeId).all<{ object_key: string }>();
  return [...new Set((rows.results ?? []).map(({ object_key }) => object_key).filter(Boolean))];
};

const deleteObjects = async (files: FiniteFilesBucket | undefined, objectKeys: string[]): Promise<void> => {
  if (!objectKeys.length) return;
  if (!files) throw new Error("FILE_STORAGE_UNAVAILABLE");
  for (const objectKey of objectKeys) await files.delete(objectKey);
};

const purgeDemoScope = async (db: D1Database, scopeId: string, files?: FiniteFilesBucket): Promise<void> => {
  const confirmedDemo = await db.prepare("SELECT scope_id FROM demo_sessions WHERE scope_id = ?").bind(scopeId).first();
  if (!confirmedDemo) return;
  await deleteObjects(files, await attachmentObjectKeys(db, scopeId));
  await db.batch([
    ...tenantDeleteStatements(db, scopeId),
    db.prepare("DELETE FROM tenant_reset_receipts WHERE scope_id = ?").bind(scopeId),
    db.prepare("DELETE FROM tenant_reset_jobs WHERE scope_id = ?").bind(scopeId),
    db.prepare("DELETE FROM demo_sessions WHERE scope_id = ?").bind(scopeId),
    db.prepare("DELETE FROM tenant_accounts WHERE scope_id = ?").bind(scopeId),
  ]);
};

const purgeExpiredDemoScopes = async (db: D1Database, files?: FiniteFilesBucket): Promise<void> => {
  const expired = await db.prepare("SELECT scope_id FROM demo_sessions WHERE expires_at <= ? ORDER BY expires_at ASC LIMIT 10")
    .bind(new Date().toISOString()).all<{ scope_id: string }>();
  for (const row of expired.results) await purgeDemoScope(db, row.scope_id, files);
};

const accountPrincipal = (request: Request): FinitePrincipal | null => {
  const siteUserId = request.headers.get("oai-authenticated-user-id")?.trim();
  const email = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase() || null;
  if (!siteUserId && !email) return null;
  const encodedName = request.headers.get("oai-authenticated-user-full-name")?.trim();
  const fullName = encodedName && request.headers.get("oai-authenticated-user-full-name-encoding") === "percent-encoded-utf-8"
    ? (() => { try { return decodeURIComponent(encodedName); } catch { return ""; } })()
    : "";
  return {
    kind: "account",
    provider: "chatgpt",
    tenantIdentity: siteUserId ? { siteUserId } : { siteUserEmail: email },
    displayName: fullName || email || "ChatGPT user",
    email,
    expiresAt: null,
  };
};

export const resolveRequestPrincipal = async (request: Request, db: D1Database, files?: FiniteFilesBucket): Promise<FinitePrincipal | null> => {
  const account = accountPrincipal(request);
  if (account) return account;
  const token = cookieValue(request, demoCookieName);
  if (!token) return null;
  const sessionHash = await authSha256({ demoToken: token });
  const session = await db.prepare("SELECT session_hash, scope_id, created_at, expires_at FROM demo_sessions WHERE session_hash = ?")
    .bind(sessionHash).first<DemoSessionRow>();
  if (!session) return null;
  if (Date.parse(session.expires_at) <= Date.now()) {
    await purgeDemoScope(db, session.scope_id, files);
    return null;
  }
  return {
    kind: "demo",
    provider: "demo",
    tenantIdentity: { demoSessionHash: session.session_hash },
    displayName: "Finite demo",
    email: null,
    expiresAt: session.expires_at,
  };
};

export const principalStorageScope = async (principal: FinitePrincipal): Promise<{ scopeId: string; userIdHash: string }> => {
  const userIdHash = await authSha256(principal.tenantIdentity);
  return { scopeId: `${principal.kind === "demo" ? "demo" : "user"}_${userIdHash.slice(0, 32)}`, userIdHash };
};

const publicSession = async (principal: FinitePrincipal | null, db: D1Database): Promise<JsonRecord> => {
  if (!principal) return { ok: true, code: "SIGNED_OUT", session: null, signInPath: "/signin-with-chatgpt" };
  const { scopeId } = await principalStorageScope(principal);
  const adopted = principal.kind === "account"
    ? await db.prepare("SELECT scope_id FROM tenant_accounts WHERE scope_id = ? AND legacy_scope_adopted = 1").bind(scopeId).first()
    : null;
  return {
    ok: true,
    code: principal.kind === "demo" ? "DEMO_SESSION" : "AUTHENTICATED_SESSION",
    session: {
      kind: principal.kind,
      provider: principal.provider,
      displayName: principal.displayName,
      email: principal.email,
      expiresAt: principal.expiresAt,
      storageScope: scopeId,
      legacyBrowserCacheEligible: Boolean(adopted),
    },
  };
};

const createDemoSession = async (request: Request, db: D1Database, files?: FiniteFilesBucket): Promise<Response> => {
  await purgeExpiredDemoScopes(db, files);
  const existing = await resolveRequestPrincipal(request, db, files);
  if (existing) return response(200, await publicSession(existing, db));
  const token = randomToken();
  const sessionHash = await authSha256({ demoToken: token });
  const identityHash = await authSha256({ demoSessionHash: sessionHash });
  const scopeId = `demo_${identityHash.slice(0, 32)}`;
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + demoTtlSeconds * 1000).toISOString();
  await db.batch([
    db.prepare("INSERT INTO tenant_accounts (scope_id, user_id_hash, legacy_scope_adopted, created_at) VALUES (?, ?, 0, ?)")
      .bind(scopeId, identityHash, createdAt),
    db.prepare("INSERT INTO demo_sessions (session_hash, scope_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
      .bind(sessionHash, scopeId, createdAt, expiresAt),
  ]);
  return response(201, {
    ok: true,
    code: "DEMO_SESSION_CREATED",
    session: { kind: "demo", provider: "demo", displayName: "Finite demo", email: null, expiresAt, storageScope: scopeId, legacyBrowserCacheEligible: false },
  }, { "set-cookie": demoCookie(token, demoTtlSeconds) });
};

const endDemoSession = async (request: Request, db: D1Database, files?: FiniteFilesBucket): Promise<Response> => {
  const token = cookieValue(request, demoCookieName);
  if (token) {
    const sessionHash = await authSha256({ demoToken: token });
    const session = await db.prepare("SELECT session_hash, scope_id, created_at, expires_at FROM demo_sessions WHERE session_hash = ?")
      .bind(sessionHash).first<DemoSessionRow>();
    if (session) await purgeDemoScope(db, session.scope_id, files);
  }
  return response(200, { ok: true, code: "DEMO_SESSION_ENDED", session: null }, { "set-cookie": demoCookie("", 0) });
};

const resetPreview = async (db: D1Database, scopeId: string): Promise<{ counts: Record<string, number>; totalRecords: number }> => {
  const entries = await Promise.all(tenantDataTables.map(async (table) => {
    const row = await db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE scope_id = ?`).bind(scopeId).first<{ count: number }>();
    return [table, Number(row?.count ?? 0)] as const;
  }));
  const counts = Object.fromEntries(entries);
  return { counts, totalRecords: Object.values(counts).reduce((sum, count) => sum + count, 0) };
};

const parseResetBody = async (request: Request): Promise<JsonRecord> => {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new Error("RESET_JSON_REQUIRED");
  const text = await request.text();
  if (text.length > 2_000) throw new Error("RESET_BODY_TOO_LARGE");
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("RESET_BODY_INVALID");
  return parsed as JsonRecord;
};

const resetKitchen = async (request: Request, db: D1Database, principal: FinitePrincipal, files?: FiniteFilesBucket): Promise<Response> => {
  const body = await parseResetBody(request);
  const confirmation = typeof body.confirmation === "string" ? body.confirmation : "";
  const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey : "";
  const sourceSurface = body.sourceSurface === "site" || body.sourceSurface === "codex" ? body.sourceSurface : null;
  if (confirmation !== resetConfirmation) return response(422, { ok: false, code: "KITCHEN_RESET_CONFIRMATION_REQUIRED", message: `Type ${resetConfirmation} exactly before permanent deletion.`, confirmation: resetConfirmation, acceptedStateChanged: false });
  if (!/^[a-zA-Z0-9._:-]{8,200}$/.test(idempotencyKey)) return response(422, { ok: false, code: "KITCHEN_RESET_IDEMPOTENCY_REQUIRED", message: "A bounded idempotency key is required.", acceptedStateChanged: false });
  if (!sourceSurface) return response(422, { ok: false, code: "KITCHEN_RESET_SOURCE_REQUIRED", message: "The human or Codex source surface must be named.", acceptedStateChanged: false });
  const { scopeId, userIdHash } = await principalStorageScope(principal);
  const requestHash = await authSha256({ scopeId, idempotencyKey, confirmation, sourceSurface });
  const replay = await db.prepare("SELECT request_hash, receipt_json FROM tenant_reset_receipts WHERE scope_id = ? AND idempotency_key = ?")
    .bind(scopeId, idempotencyKey).first<{ request_hash: string; receipt_json: string }>();
  if (replay) {
    if (replay.request_hash !== requestHash) return response(409, { ok: false, code: "IDEMPOTENCY_KEY_REUSED", message: "The reset idempotency key was reused with different content.", acceptedStateChanged: false });
    return response(200, { ok: true, code: "KITCHEN_RESET", receipt: { ...JSON.parse(replay.receipt_json), replay: true }, acceptedStateChanged: true, next: "Clear only this tenant's browser cache and reload Finite at the first-arrival surface." });
  }
  const preview = await resetPreview(db, scopeId);
  const clearedAt = new Date().toISOString();
  const resetId = `kitchen_reset_${(await authSha256({ scopeId, idempotencyKey })).slice(0, 16)}`;
  const existingJob = await db.prepare("SELECT request_hash, object_keys_json, status FROM tenant_reset_jobs WHERE scope_id = ? AND idempotency_key = ?")
    .bind(scopeId, idempotencyKey).first<ResetJobRow>();
  if (existingJob && existingJob.request_hash !== requestHash) return response(409, { ok: false, code: "IDEMPOTENCY_KEY_REUSED", message: "The reset idempotency key was reused with different content.", acceptedStateChanged: false });
  const objectKeys = existingJob
    ? (() => { try { const parsed = JSON.parse(existingJob.object_keys_json) as unknown; return Array.isArray(parsed) ? parsed.map(String) : []; } catch { return []; } })()
    : await attachmentObjectKeys(db, scopeId);
  if (!existingJob) {
    await db.batch([db.prepare("INSERT INTO tenant_reset_jobs (scope_id, idempotency_key, request_hash, object_keys_json, status, created_at, updated_at, completed_at) VALUES (?, ?, ?, ?, 'pending', ?, ?, NULL)")
      .bind(scopeId, idempotencyKey, requestHash, JSON.stringify(objectKeys), clearedAt, clearedAt)]);
  }
  try {
    await deleteObjects(files, objectKeys);
  } catch {
    return response(503, { ok: false, code: "KITCHEN_RESET_STORAGE_PENDING", message: "Finite could not finish deleting private files. Retry the same reset; its recovery record is safe.", acceptedStateChanged: false, retryWithSameIdempotencyKey: true });
  }
  const receipt = {
    receiptVersion: "finite-kitchen-reset.v1",
    resetId,
    clearedAt,
    sourceSurface,
    cleared: preview.counts,
    totalRecords: preview.totalRecords,
    deletedFiles: objectKeys.length,
  };
  await db.batch([
    ...tenantDeleteStatements(db, scopeId),
    db.prepare("DELETE FROM tenant_reset_receipts WHERE scope_id = ?").bind(scopeId),
    db.prepare("DELETE FROM tenant_reset_jobs WHERE scope_id = ? AND idempotency_key != ?").bind(scopeId, idempotencyKey),
    db.prepare("INSERT OR IGNORE INTO tenant_accounts (scope_id, user_id_hash, legacy_scope_adopted, created_at) VALUES (?, ?, 0, ?)").bind(scopeId, userIdHash, clearedAt),
    db.prepare("UPDATE tenant_accounts SET legacy_scope_adopted = 0 WHERE scope_id = ?").bind(scopeId),
    db.prepare("INSERT INTO tenant_reset_receipts (scope_id, idempotency_key, request_hash, receipt_json, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(scopeId, idempotencyKey, requestHash, JSON.stringify(receipt), clearedAt),
    db.prepare("UPDATE tenant_reset_jobs SET object_keys_json = '[]', status = 'completed', updated_at = ?, completed_at = ? WHERE scope_id = ? AND idempotency_key = ?")
      .bind(clearedAt, clearedAt, scopeId, idempotencyKey),
  ]);
  return response(200, { ok: true, code: "KITCHEN_RESET", receipt, acceptedStateChanged: true, next: "Clear only this tenant's browser cache and reload Finite at the first-arrival surface." });
};

export const handleAuthRequest = async (request: Request, db: D1Database, files?: FiniteFilesBucket): Promise<Response | null> => {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/auth/")) return null;
  if (request.method !== "GET" && !sameOriginWrite(request)) return response(403, { ok: false, code: "CROSS_ORIGIN_WRITE_REFUSED", message: "Finite writes must be same-origin." });
  try {
    if (request.method === "GET" && url.pathname === "/api/auth/session") return response(200, await publicSession(await resolveRequestPrincipal(request, db, files), db));
    if (request.method === "POST" && url.pathname === "/api/auth/demo") return createDemoSession(request, db, files);
    if (request.method === "POST" && url.pathname === "/api/auth/demo/end") return endDemoSession(request, db, files);
    if (url.pathname === "/api/auth/reset") {
      const principal = await resolveRequestPrincipal(request, db, files);
      if (!principal) return response(401, { ok: false, code: "AUTHENTICATION_REQUIRED", message: "Sign in or open a demo before resetting Finite.", acceptedStateChanged: false });
      if (request.method === "GET") {
        const { scopeId } = await principalStorageScope(principal);
        const preview = await resetPreview(db, scopeId);
        return response(200, { ok: true, code: "KITCHEN_RESET_PREVIEW", ...preview, confirmation: resetConfirmation, permanent: true, preserves: ["ChatGPT sign-in", "current demo session", "external bookings and supplier systems"], acceptedStateChanged: false, next: `Type ${resetConfirmation} exactly to permanently clear this Finite account.` });
      }
      if (request.method === "POST") return resetKitchen(request, db, principal, files);
    }
    return response(405, { ok: false, code: "METHOD_NOT_ALLOWED", message: "Unsupported authentication operation." });
  } catch (error) {
    if (error instanceof SyntaxError || (error instanceof Error && error.message.startsWith("RESET_"))) return response(400, { ok: false, code: "KITCHEN_RESET_REQUEST_INVALID", message: "The reset request body is invalid.", acceptedStateChanged: false });
    if (error instanceof Error && error.message === "FILE_STORAGE_UNAVAILABLE") return response(503, { ok: false, code: "FILE_STORAGE_UNAVAILABLE", message: "Private file storage is required to finish this cleanup safely." });
    return response(500, { ok: false, code: "AUTH_SERVICE_FAILED", message: "Authentication service failed safely." });
  }
};
