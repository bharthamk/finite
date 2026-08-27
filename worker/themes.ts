import type { D1Database } from "./accepted-truth.js";
import { authSha256, principalStorageScope, resolveRequestPrincipal } from "./auth.js";
import { builtInThemes, defaultTheme, themeSchema, validateThemeDraft, type ThemeDefinition } from "../src/theme.js";

type JsonRecord = Record<string, unknown>;

interface ThemeRow {
  theme_id: string;
  name: string;
  mode: "light" | "dark";
  tokens_json: string;
  content_hash: string;
  created_at: string;
  updated_at: string;
}

const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const response = (status: number, body: JsonRecord): Response => new Response(JSON.stringify(body), { status, headers });
const sameOriginWrite = (request: Request): boolean => {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
};

const parseBody = async (request: Request): Promise<JsonRecord> => {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new Error("THEME_JSON_REQUIRED");
  const text = await request.text();
  if (text.length > 8_000) throw new Error("THEME_BODY_TOO_LARGE");
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("THEME_BODY_INVALID");
  return parsed as JsonRecord;
};

const customDefinition = (row: ThemeRow): ThemeDefinition => ({
  themeId: row.theme_id,
  name: row.name,
  kind: "custom",
  mode: row.mode,
  tokens: JSON.parse(row.tokens_json) as ThemeDefinition["tokens"],
  contentHash: row.content_hash,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const listThemes = async (db: D1Database, scopeId: string): Promise<JsonRecord> => {
  const rows = await db.prepare("SELECT theme_id, name, mode, tokens_json, content_hash, created_at, updated_at FROM tenant_themes WHERE scope_id = ? ORDER BY updated_at DESC")
    .bind(scopeId).all<ThemeRow>();
  const custom = rows.results.map(customDefinition);
  const preference = await db.prepare("SELECT active_theme_id FROM tenant_theme_preferences WHERE scope_id = ?").bind(scopeId).first<{ active_theme_id: string }>();
  const available = [...builtInThemes, ...custom];
  const activeTheme = available.find((theme) => theme.themeId === preference?.active_theme_id) ?? defaultTheme;
  return { ok: true, code: "THEME_CATALOG", builtIns: builtInThemes, custom, activeThemeId: activeTheme.themeId, activeTheme, acceptedStateChanged: false };
};

const operationInput = (body: JsonRecord): { idempotencyKey: string; sourceSurface: "site" | "codex" } | null => {
  const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey : "";
  const sourceSurface = body.sourceSurface === "site" || body.sourceSurface === "codex" ? body.sourceSurface : null;
  return /^[a-zA-Z0-9._:-]{8,200}$/.test(idempotencyKey) && sourceSurface ? { idempotencyKey, sourceSurface } : null;
};

const replayOperation = async (db: D1Database, scopeId: string, idempotencyKey: string, requestHash: string): Promise<Response | null> => {
  const replay = await db.prepare("SELECT request_hash, receipt_json FROM tenant_theme_receipts WHERE scope_id = ? AND idempotency_key = ?")
    .bind(scopeId, idempotencyKey).first<{ request_hash: string; receipt_json: string }>();
  if (!replay) return null;
  if (replay.request_hash !== requestHash) return response(409, { ok: false, code: "IDEMPOTENCY_KEY_REUSED", message: "The theme idempotency key was reused with different content.", acceptedStateChanged: false });
  const prior = JSON.parse(replay.receipt_json) as JsonRecord;
  return response(200, { ...prior, receipt: { ...(prior.receipt as JsonRecord), replay: true } });
};

const receiptStatement = (db: D1Database, scopeId: string, idempotencyKey: string, requestHash: string, payload: JsonRecord, createdAt: string) =>
  db.prepare("INSERT INTO tenant_theme_receipts (scope_id, idempotency_key, request_hash, receipt_json, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(scopeId, idempotencyKey, requestHash, JSON.stringify(payload), createdAt);

const saveTheme = async (request: Request, db: D1Database, scopeId: string): Promise<Response> => {
  const body = await parseBody(request);
  const operation = operationInput(body);
  if (!operation) return response(422, { ok: false, code: "THEME_OPERATION_GUARD_REQUIRED", message: "A bounded idempotency key and source surface are required.", acceptedStateChanged: false });
  const validation = validateThemeDraft(body);
  if (!validation.ok) return response(422, { ok: false, code: "THEME_INVALID", issues: validation.issues, acceptedStateChanged: false });
  const requestHash = await authSha256({ scopeId, operation: "save", ...validation.draft, sourceSurface: operation.sourceSurface });
  const replay = await replayOperation(db, scopeId, operation.idempotencyKey, requestHash);
  if (replay) return replay;
  const now = new Date().toISOString();
  const contentHash = await authSha256(validation.definition);
  const existing = await db.prepare("SELECT created_at FROM tenant_themes WHERE scope_id = ? AND theme_id = ?").bind(scopeId, validation.draft.themeId).first<{ created_at: string }>();
  const theme: ThemeDefinition = { ...validation.definition, contentHash, createdAt: existing?.created_at ?? now, updatedAt: now };
  const receipt = { receiptVersion: "finite-theme-operation.v1", operation: "save", themeId: theme.themeId, contentHash, sourceSurface: operation.sourceSurface, createdAt: now };
  const payload = { ok: true, code: existing ? "CUSTOM_THEME_UPDATED" : "CUSTOM_THEME_CREATED", theme, receipt, acceptedStateChanged: true };
  await db.batch([
    db.prepare("INSERT INTO tenant_themes (scope_id, theme_id, name, mode, tokens_json, content_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(scope_id, theme_id) DO UPDATE SET name = excluded.name, mode = excluded.mode, tokens_json = excluded.tokens_json, content_hash = excluded.content_hash, updated_at = excluded.updated_at")
      .bind(scopeId, theme.themeId, theme.name, theme.mode, JSON.stringify(theme.tokens), contentHash, theme.createdAt, now),
    receiptStatement(db, scopeId, operation.idempotencyKey, requestHash, payload, now),
  ]);
  return response(existing ? 200 : 201, payload);
};

const setActiveTheme = async (request: Request, db: D1Database, scopeId: string): Promise<Response> => {
  const body = await parseBody(request);
  const operation = operationInput(body);
  const themeId = typeof body.themeId === "string" ? body.themeId : "";
  if (!operation || !/^(?:workshop|night-shift|field-notes|high-contrast|custom_[a-z0-9-]{3,60})$/.test(themeId)) return response(422, { ok: false, code: "THEME_OPERATION_GUARD_REQUIRED", message: "A valid theme, bounded idempotency key and source surface are required.", acceptedStateChanged: false });
  const builtIn = builtInThemes.find((theme) => theme.themeId === themeId);
  const custom = builtIn ? null : await db.prepare("SELECT theme_id, name, mode, tokens_json, content_hash, created_at, updated_at FROM tenant_themes WHERE scope_id = ? AND theme_id = ?").bind(scopeId, themeId).first<ThemeRow>();
  const theme = builtIn ?? (custom ? customDefinition(custom) : null);
  if (!theme) return response(404, { ok: false, code: "THEME_NOT_FOUND", message: "That palette is not available for this account.", acceptedStateChanged: false });
  const requestHash = await authSha256({ scopeId, operation: "set_active", themeId, sourceSurface: operation.sourceSurface });
  const replay = await replayOperation(db, scopeId, operation.idempotencyKey, requestHash);
  if (replay) return replay;
  const now = new Date().toISOString();
  const receipt = { receiptVersion: "finite-theme-operation.v1", operation: "set_active", themeId, sourceSurface: operation.sourceSurface, createdAt: now };
  const payload = { ok: true, code: "THEME_APPLIED", theme, activeThemeId: themeId, receipt, acceptedStateChanged: true };
  await db.batch([
    db.prepare("INSERT INTO tenant_theme_preferences (scope_id, active_theme_id, updated_at) VALUES (?, ?, ?) ON CONFLICT(scope_id) DO UPDATE SET active_theme_id = excluded.active_theme_id, updated_at = excluded.updated_at").bind(scopeId, themeId, now),
    receiptStatement(db, scopeId, operation.idempotencyKey, requestHash, payload, now),
  ]);
  return response(200, payload);
};

const deleteTheme = async (request: Request, db: D1Database, scopeId: string, themeId: string): Promise<Response> => {
  const body = await parseBody(request);
  const operation = operationInput(body);
  if (!operation || !/^custom_[a-z0-9-]{3,60}$/.test(themeId) || body.themeId !== themeId) return response(422, { ok: false, code: "THEME_DELETE_GUARD_REQUIRED", message: "Only an exact tenant custom theme can be deleted.", acceptedStateChanged: false });
  const existing = await db.prepare("SELECT theme_id FROM tenant_themes WHERE scope_id = ? AND theme_id = ?").bind(scopeId, themeId).first<{ theme_id: string }>();
  if (!existing) return response(404, { ok: false, code: "THEME_NOT_FOUND", message: "That custom palette is not available for this account.", acceptedStateChanged: false });
  const preference = await db.prepare("SELECT active_theme_id FROM tenant_theme_preferences WHERE scope_id = ?").bind(scopeId).first<{ active_theme_id: string }>();
  const wasActive = preference?.active_theme_id === themeId;
  const requestHash = await authSha256({ scopeId, operation: "delete", themeId, sourceSurface: operation.sourceSurface });
  const replay = await replayOperation(db, scopeId, operation.idempotencyKey, requestHash);
  if (replay) return replay;
  const now = new Date().toISOString();
  const activeThemeId = wasActive ? defaultTheme.themeId : preference?.active_theme_id ?? defaultTheme.themeId;
  const receipt = { receiptVersion: "finite-theme-operation.v1", operation: "delete", themeId, ...(wasActive ? { fallbackThemeId: defaultTheme.themeId } : {}), sourceSurface: operation.sourceSurface, createdAt: now };
  const payload = { ok: true, code: "CUSTOM_THEME_DELETED", activeThemeId, ...(wasActive ? { theme: defaultTheme } : {}), receipt, acceptedStateChanged: true };
  await db.batch([
    db.prepare("DELETE FROM tenant_themes WHERE scope_id = ? AND theme_id = ?").bind(scopeId, themeId),
    db.prepare("UPDATE tenant_theme_preferences SET active_theme_id = ?, updated_at = ? WHERE scope_id = ? AND active_theme_id = ?").bind(defaultTheme.themeId, now, scopeId, themeId),
    receiptStatement(db, scopeId, operation.idempotencyKey, requestHash, payload, now),
  ]);
  return response(200, payload);
};

export const handleThemeRequest = async (request: Request, db: D1Database): Promise<Response | null> => {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/themes")) return null;
  if (request.method !== "GET" && !sameOriginWrite(request)) return response(403, { ok: false, code: "CROSS_ORIGIN_WRITE_REFUSED", message: "Finite writes must be same-origin.", acceptedStateChanged: false });
  try {
    const principal = await resolveRequestPrincipal(request, db);
    if (!principal) return response(401, { ok: false, code: "AUTHENTICATION_REQUIRED", message: "Sign in or open a demo before changing themes.", acceptedStateChanged: false });
    if (principal.kind === "demo" && request.method !== "GET" && url.pathname !== "/api/themes/preview") return response(403, { ok: false, code: "ACCOUNT_THEME_REQUIRED", message: "Persistent appearance settings require a signed-in account. Demo data remains temporary and isolated.", acceptedStateChanged: false });
    const { scopeId } = await principalStorageScope(principal);
    if (principal.kind === "demo" && request.method === "GET" && url.pathname === "/api/themes") return response(200, { ok: true, code: "THEME_CATALOG", builtIns: builtInThemes, custom: [], activeThemeId: defaultTheme.themeId, activeTheme: defaultTheme, acceptedStateChanged: false });
    if (request.method === "GET" && url.pathname === "/api/themes") return response(200, await listThemes(db, scopeId));
    if (request.method === "GET" && url.pathname === "/api/themes/schema") return response(200, { ok: true, code: "THEME_SCHEMA", schema: themeSchema(), acceptedStateChanged: false });
    if (request.method === "POST" && url.pathname === "/api/themes/preview") {
      const validation = validateThemeDraft(await parseBody(request));
      return validation.ok
        ? response(200, { ok: true, code: "THEME_PREVIEW", theme: validation.definition, acceptedStateChanged: false })
        : response(422, { ok: false, code: "THEME_INVALID", issues: validation.issues, acceptedStateChanged: false });
    }
    if (request.method === "POST" && url.pathname === "/api/themes") return saveTheme(request, db, scopeId);
    if (request.method === "POST" && url.pathname === "/api/themes/active") return setActiveTheme(request, db, scopeId);
    const match = url.pathname.match(/^\/api\/themes\/(custom_[a-z0-9-]{3,60})$/);
    if (request.method === "DELETE" && match) return deleteTheme(request, db, scopeId, match[1]!);
    return response(405, { ok: false, code: "METHOD_NOT_ALLOWED", message: "Unsupported theme operation.", acceptedStateChanged: false });
  } catch (error) {
    if (error instanceof SyntaxError || (error instanceof Error && error.message.startsWith("THEME_"))) return response(400, { ok: false, code: "THEME_REQUEST_INVALID", message: "The theme request body is invalid.", acceptedStateChanged: false });
    return response(500, { ok: false, code: "THEME_SERVICE_FAILED", message: "Theme settings failed safely.", acceptedStateChanged: false });
  }
};
