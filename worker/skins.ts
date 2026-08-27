import type { D1Database } from "./accepted-truth.js";
import { authSha256, principalStorageScope, resolveRequestPrincipal } from "./auth.js";
import { builtInSkins, defaultSkin, skinSchema, validateSkinDraft, type SkinDefinition } from "../src/skin.js";

type JsonRecord = Record<string, unknown>;
interface SkinRow { skin_id: string; name: string; description: string; recipe_json: string; content_hash: string; created_at: string; updated_at: string; }

const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const response = (status: number, body: JsonRecord): Response => new Response(JSON.stringify(body), { status, headers });
const sameOriginWrite = (request: Request): boolean => { const origin = request.headers.get("origin"); return !origin || origin === new URL(request.url).origin; };
const parseBody = async (request: Request): Promise<JsonRecord> => {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new Error("SKIN_JSON_REQUIRED");
  const text = await request.text();
  if (text.length > 8_000) throw new Error("SKIN_BODY_TOO_LARGE");
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("SKIN_BODY_INVALID");
  return parsed as JsonRecord;
};
const customDefinition = (row: SkinRow): SkinDefinition => ({ skinId: row.skin_id, name: row.name, description: row.description, kind: "custom", recipe: JSON.parse(row.recipe_json) as SkinDefinition["recipe"], contentHash: row.content_hash, createdAt: row.created_at, updatedAt: row.updated_at });
const operationInput = (body: JsonRecord): { idempotencyKey: string; sourceSurface: "site" | "codex" } | null => {
  const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey : "";
  const sourceSurface = body.sourceSurface === "site" || body.sourceSurface === "codex" ? body.sourceSurface : null;
  return /^[a-zA-Z0-9._:-]{8,200}$/.test(idempotencyKey) && sourceSurface ? { idempotencyKey, sourceSurface } : null;
};
const listSkins = async (db: D1Database, scopeId: string): Promise<JsonRecord> => {
  const rows = await db.prepare("SELECT skin_id, name, description, recipe_json, content_hash, created_at, updated_at FROM tenant_skins WHERE scope_id = ? ORDER BY updated_at DESC").bind(scopeId).all<SkinRow>();
  const custom = rows.results.map(customDefinition);
  const preference = await db.prepare("SELECT active_skin_id FROM tenant_skin_preferences WHERE scope_id = ?").bind(scopeId).first<{ active_skin_id: string }>();
  const activeSkin = [...builtInSkins, ...custom].find((skin) => skin.skinId === preference?.active_skin_id) ?? defaultSkin;
  return { ok: true, code: "SKIN_CATALOG", builtIns: builtInSkins, custom, activeSkinId: activeSkin.skinId, activeSkin, acceptedStateChanged: false };
};
const replayOperation = async (db: D1Database, scopeId: string, idempotencyKey: string, requestHash: string): Promise<Response | null> => {
  const replay = await db.prepare("SELECT request_hash, receipt_json FROM tenant_skin_receipts WHERE scope_id = ? AND idempotency_key = ?").bind(scopeId, idempotencyKey).first<{ request_hash: string; receipt_json: string }>();
  if (!replay) return null;
  if (replay.request_hash !== requestHash) return response(409, { ok: false, code: "IDEMPOTENCY_KEY_REUSED", message: "The skin idempotency key was reused with different content.", acceptedStateChanged: false });
  const prior = JSON.parse(replay.receipt_json) as JsonRecord;
  return response(200, { ...prior, receipt: { ...(prior.receipt as JsonRecord), replay: true } });
};
const receiptStatement = (db: D1Database, scopeId: string, idempotencyKey: string, requestHash: string, payload: JsonRecord, createdAt: string) =>
  db.prepare("INSERT INTO tenant_skin_receipts (scope_id, idempotency_key, request_hash, receipt_json, created_at) VALUES (?, ?, ?, ?, ?)").bind(scopeId, idempotencyKey, requestHash, JSON.stringify(payload), createdAt);

const saveSkin = async (request: Request, db: D1Database, scopeId: string): Promise<Response> => {
  const body = await parseBody(request); const operation = operationInput(body);
  if (!operation) return response(422, { ok: false, code: "SKIN_OPERATION_GUARD_REQUIRED", message: "A bounded idempotency key and source surface are required.", acceptedStateChanged: false });
  const validation = validateSkinDraft(body);
  if (!validation.ok) return response(422, { ok: false, code: "SKIN_INVALID", issues: validation.issues, acceptedStateChanged: false });
  const requestHash = await authSha256({ scopeId, operation: "save", ...validation.draft, sourceSurface: operation.sourceSurface });
  const replay = await replayOperation(db, scopeId, operation.idempotencyKey, requestHash); if (replay) return replay;
  const now = new Date().toISOString(); const contentHash = await authSha256(validation.definition);
  const existing = await db.prepare("SELECT created_at FROM tenant_skins WHERE scope_id = ? AND skin_id = ?").bind(scopeId, validation.draft.skinId).first<{ created_at: string }>();
  const skin: SkinDefinition = { ...validation.definition, contentHash, createdAt: existing?.created_at ?? now, updatedAt: now };
  const receipt = { receiptVersion: "finite-skin-operation.v1", operation: "save", skinId: skin.skinId, contentHash, sourceSurface: operation.sourceSurface, createdAt: now };
  const payload = { ok: true, code: existing ? "CUSTOM_SKIN_UPDATED" : "CUSTOM_SKIN_CREATED", skin, receipt, acceptedStateChanged: true };
  await db.batch([
    db.prepare("INSERT INTO tenant_skins (scope_id, skin_id, name, description, recipe_json, content_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(scope_id, skin_id) DO UPDATE SET name = excluded.name, description = excluded.description, recipe_json = excluded.recipe_json, content_hash = excluded.content_hash, updated_at = excluded.updated_at").bind(scopeId, skin.skinId, skin.name, skin.description, JSON.stringify(skin.recipe), contentHash, skin.createdAt, now),
    receiptStatement(db, scopeId, operation.idempotencyKey, requestHash, payload, now),
  ]);
  return response(existing ? 200 : 201, payload);
};

const setActiveSkin = async (request: Request, db: D1Database, scopeId: string): Promise<Response> => {
  const body = await parseBody(request); const operation = operationInput(body); const skinId = typeof body.skinId === "string" ? body.skinId : "";
  if (!operation || !/^(?:workshop|quiet|editorial|soft-system|custom_[a-z0-9-]{3,60})$/.test(skinId)) return response(422, { ok: false, code: "SKIN_OPERATION_GUARD_REQUIRED", message: "A valid skin, bounded idempotency key and source surface are required.", acceptedStateChanged: false });
  const preset = builtInSkins.find((skin) => skin.skinId === skinId);
  const custom = preset ? null : await db.prepare("SELECT skin_id, name, description, recipe_json, content_hash, created_at, updated_at FROM tenant_skins WHERE scope_id = ? AND skin_id = ?").bind(scopeId, skinId).first<SkinRow>();
  const skin = preset ?? (custom ? customDefinition(custom) : null);
  if (!skin) return response(404, { ok: false, code: "SKIN_NOT_FOUND", message: "That skin is not available in this kitchen.", acceptedStateChanged: false });
  const requestHash = await authSha256({ scopeId, operation: "set_active", skinId, sourceSurface: operation.sourceSurface });
  const replay = await replayOperation(db, scopeId, operation.idempotencyKey, requestHash); if (replay) return replay;
  const now = new Date().toISOString();
  const receipt = { receiptVersion: "finite-skin-operation.v1", operation: "set_active", skinId, sourceSurface: operation.sourceSurface, createdAt: now };
  const payload = { ok: true, code: "SKIN_APPLIED", skin, activeSkinId: skinId, receipt, acceptedStateChanged: true };
  await db.batch([
    db.prepare("INSERT INTO tenant_skin_preferences (scope_id, active_skin_id, updated_at) VALUES (?, ?, ?) ON CONFLICT(scope_id) DO UPDATE SET active_skin_id = excluded.active_skin_id, updated_at = excluded.updated_at").bind(scopeId, skinId, now),
    receiptStatement(db, scopeId, operation.idempotencyKey, requestHash, payload, now),
  ]);
  return response(200, payload);
};

const deleteSkin = async (request: Request, db: D1Database, scopeId: string, skinId: string): Promise<Response> => {
  const body = await parseBody(request); const operation = operationInput(body);
  if (!operation || !/^custom_[a-z0-9-]{3,60}$/.test(skinId) || body.skinId !== skinId) return response(422, { ok: false, code: "SKIN_DELETE_GUARD_REQUIRED", message: "Only an exact account custom skin can be deleted.", acceptedStateChanged: false });
  const existing = await db.prepare("SELECT skin_id FROM tenant_skins WHERE scope_id = ? AND skin_id = ?").bind(scopeId, skinId).first<{ skin_id: string }>();
  if (!existing) return response(404, { ok: false, code: "SKIN_NOT_FOUND", message: "That custom skin is not available in this kitchen.", acceptedStateChanged: false });
  const preference = await db.prepare("SELECT active_skin_id FROM tenant_skin_preferences WHERE scope_id = ?").bind(scopeId).first<{ active_skin_id: string }>();
  const wasActive = preference?.active_skin_id === skinId;
  const requestHash = await authSha256({ scopeId, operation: "delete", skinId, sourceSurface: operation.sourceSurface });
  const replay = await replayOperation(db, scopeId, operation.idempotencyKey, requestHash); if (replay) return replay;
  const now = new Date().toISOString(); const activeSkinId = wasActive ? defaultSkin.skinId : preference?.active_skin_id ?? defaultSkin.skinId;
  const receipt = { receiptVersion: "finite-skin-operation.v1", operation: "delete", skinId, ...(wasActive ? { fallbackSkinId: defaultSkin.skinId } : {}), sourceSurface: operation.sourceSurface, createdAt: now };
  const payload = { ok: true, code: "CUSTOM_SKIN_DELETED", activeSkinId, ...(wasActive ? { skin: defaultSkin } : {}), receipt, acceptedStateChanged: true };
  await db.batch([
    db.prepare("DELETE FROM tenant_skins WHERE scope_id = ? AND skin_id = ?").bind(scopeId, skinId),
    db.prepare("UPDATE tenant_skin_preferences SET active_skin_id = ?, updated_at = ? WHERE scope_id = ? AND active_skin_id = ?").bind(defaultSkin.skinId, now, scopeId, skinId),
    receiptStatement(db, scopeId, operation.idempotencyKey, requestHash, payload, now),
  ]);
  return response(200, payload);
};

export const handleSkinRequest = async (request: Request, db: D1Database): Promise<Response | null> => {
  const url = new URL(request.url); if (!url.pathname.startsWith("/api/skins")) return null;
  if (request.method !== "GET" && !sameOriginWrite(request)) return response(403, { ok: false, code: "CROSS_ORIGIN_WRITE_REFUSED", message: "Finite writes must be same-origin.", acceptedStateChanged: false });
  try {
    const principal = await resolveRequestPrincipal(request, db);
    if (!principal) return response(401, { ok: false, code: "AUTHENTICATION_REQUIRED", message: "Sign in or open a demo before changing skins.", acceptedStateChanged: false });
    if (principal.kind === "demo" && request.method !== "GET" && url.pathname !== "/api/skins/preview") return response(403, { ok: false, code: "ACCOUNT_SKIN_REQUIRED", message: "Persistent appearance settings are available in a signed-in kitchen.", acceptedStateChanged: false });
    const { scopeId } = await principalStorageScope(principal);
    if (principal.kind === "demo" && request.method === "GET" && url.pathname === "/api/skins") return response(200, { ok: true, code: "SKIN_CATALOG", builtIns: builtInSkins, custom: [], activeSkinId: defaultSkin.skinId, activeSkin: defaultSkin, acceptedStateChanged: false });
    if (request.method === "GET" && url.pathname === "/api/skins") return response(200, await listSkins(db, scopeId));
    if (request.method === "GET" && url.pathname === "/api/skins/schema") return response(200, { ok: true, code: "SKIN_SCHEMA", schema: skinSchema(), acceptedStateChanged: false });
    if (request.method === "POST" && url.pathname === "/api/skins/preview") {
      const validation = validateSkinDraft(await parseBody(request));
      return validation.ok ? response(200, { ok: true, code: "SKIN_PREVIEW", skin: validation.definition, acceptedStateChanged: false }) : response(422, { ok: false, code: "SKIN_INVALID", issues: validation.issues, acceptedStateChanged: false });
    }
    if (request.method === "POST" && url.pathname === "/api/skins") return saveSkin(request, db, scopeId);
    if (request.method === "POST" && url.pathname === "/api/skins/active") return setActiveSkin(request, db, scopeId);
    const match = url.pathname.match(/^\/api\/skins\/(custom_[a-z0-9-]{3,60})$/);
    if (request.method === "DELETE" && match) return deleteSkin(request, db, scopeId, match[1]!);
    return response(405, { ok: false, code: "METHOD_NOT_ALLOWED", message: "Unsupported skin operation.", acceptedStateChanged: false });
  } catch (error) {
    if (error instanceof SyntaxError || (error instanceof Error && error.message.startsWith("SKIN_"))) return response(400, { ok: false, code: "SKIN_REQUEST_INVALID", message: "The skin request body is invalid.", acceptedStateChanged: false });
    return response(500, { ok: false, code: "SKIN_SERVICE_FAILED", message: "Skin settings failed safely.", acceptedStateChanged: false });
  }
};
