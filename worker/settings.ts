import type { D1Database } from "./accepted-truth.js";
import { authSha256, principalStorageScope, resolveRequestPrincipal } from "./auth.js";
import { defaultAgentSettings, validateAgenticName } from "../src/settings.js";

type JsonRecord = Record<string, unknown>;
const jsonHeaders = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const response = (status: number, body: JsonRecord): Response => new Response(JSON.stringify(body), { status, headers: jsonHeaders });
const sameOriginWrite = (request: Request): boolean => {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
};
const parseBody = async (request: Request): Promise<JsonRecord> => {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new Error("SETTINGS_JSON_REQUIRED");
  const text = await request.text();
  if (text.length > 2_000) throw new Error("SETTINGS_BODY_TOO_LARGE");
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("SETTINGS_BODY_INVALID");
  return parsed as JsonRecord;
};

export const handleSettingsRequest = async (request: Request, db: D1Database): Promise<Response | null> => {
  const url = new URL(request.url);
  if (url.pathname !== "/api/settings") return null;
  if (request.method !== "GET" && request.method !== "PUT") return response(405, { ok: false, code: "METHOD_NOT_ALLOWED", settings: defaultAgentSettings(), acceptedStateChanged: false });
  if (request.method === "PUT" && !sameOriginWrite(request)) return response(403, { ok: false, code: "CROSS_ORIGIN_WRITE_REFUSED", settings: defaultAgentSettings(), acceptedStateChanged: false });
  try {
    const principal = await resolveRequestPrincipal(request, db);
    if (!principal) return response(401, { ok: false, code: "AUTHENTICATION_REQUIRED", settings: defaultAgentSettings(), acceptedStateChanged: false });
    if (principal.kind === "demo") {
      return request.method === "GET"
        ? response(200, { ok: true, code: "SETTINGS_DEFAULT", settings: defaultAgentSettings(), acceptedStateChanged: false })
        : response(403, { ok: false, code: "ACCOUNT_SETTINGS_REQUIRED", settings: defaultAgentSettings(), message: "Persistent account settings require a signed-in account.", acceptedStateChanged: false });
    }
    const { scopeId } = await principalStorageScope(principal);
    if (request.method === "GET") {
      const row = await db.prepare("SELECT agentic_name, updated_at FROM tenant_settings WHERE scope_id = ?").bind(scopeId).first<{ agentic_name: string; updated_at: string }>();
      return response(200, { ok: true, code: row ? "SETTINGS_LOADED" : "SETTINGS_DEFAULT", settings: row ? { agenticName: row.agentic_name, updatedAt: row.updated_at } : defaultAgentSettings(), acceptedStateChanged: false });
    }
    const body = await parseBody(request);
    const validation = validateAgenticName(body.agenticName);
    const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey : "";
    const sourceSurface = body.sourceSurface === "site" || body.sourceSurface === "codex" ? body.sourceSurface : null;
    if (!validation.ok) return response(422, { ok: false, code: "AGENTIC_NAME_INVALID", settings: defaultAgentSettings(), issues: validation.issues, acceptedStateChanged: false });
    if (!/^[a-zA-Z0-9._:-]{8,200}$/.test(idempotencyKey) || !sourceSurface) return response(422, { ok: false, code: "SETTINGS_OPERATION_GUARD_REQUIRED", settings: defaultAgentSettings(), message: "A bounded idempotency key and source surface are required.", acceptedStateChanged: false });
    const requestHash = await authSha256({ scopeId, agenticName: validation.name, sourceSurface });
    const replay = await db.prepare("SELECT request_hash, receipt_json FROM tenant_settings_receipts WHERE scope_id = ? AND idempotency_key = ?").bind(scopeId, idempotencyKey).first<{ request_hash: string; receipt_json: string }>();
    if (replay) {
      if (replay.request_hash !== requestHash) return response(409, { ok: false, code: "IDEMPOTENCY_KEY_REUSED", settings: defaultAgentSettings(), acceptedStateChanged: false });
      return response(200, JSON.parse(replay.receipt_json) as JsonRecord);
    }
    const now = new Date().toISOString();
    const settings = { agenticName: validation.name, updatedAt: now };
    const receipt = { receiptVersion: "finite-account-settings.v1", operation: "set_agentic_name", agenticName: validation.name, sourceSurface, createdAt: now };
    const payload = { ok: true, code: "AGENTIC_NAME_SAVED", settings, receipt, acceptedStateChanged: true };
    await db.batch([
      db.prepare("INSERT INTO tenant_settings (scope_id, agentic_name, updated_at) VALUES (?, ?, ?) ON CONFLICT(scope_id) DO UPDATE SET agentic_name = excluded.agentic_name, updated_at = excluded.updated_at").bind(scopeId, validation.name, now),
      db.prepare("INSERT INTO tenant_settings_receipts (scope_id, idempotency_key, request_hash, receipt_json, created_at) VALUES (?, ?, ?, ?, ?)").bind(scopeId, idempotencyKey, requestHash, JSON.stringify(payload), now),
    ]);
    return response(200, payload);
  } catch (error) {
    if (error instanceof SyntaxError || (error instanceof Error && error.message.startsWith("SETTINGS_"))) return response(400, { ok: false, code: "SETTINGS_REQUEST_INVALID", settings: defaultAgentSettings(), acceptedStateChanged: false });
    return response(500, { ok: false, code: "SETTINGS_SERVICE_FAILED", settings: defaultAgentSettings(), message: "Account settings failed safely.", acceptedStateChanged: false });
  }
};
