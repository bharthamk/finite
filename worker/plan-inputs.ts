import type { D1Database } from "./accepted-truth.js";
import { authSha256, principalStorageScope, resolveRequestPrincipal } from "./auth.js";
import { validatePlanInput, type PlanInputKind, type PlanInputMode, type PlanInputRecord, type PlanInputSection, type PlanInputSource } from "../src/plan-input.js";

type JsonRecord = Record<string, unknown>;
type PlanInputRow = { input_id: string; plan_id: string; plan_revision: number; kind: PlanInputKind; handling_mode: PlanInputMode; section: PlanInputSection; context_id: string | null; context_label: string | null; message: string; status: "open" | "handled"; source_surface: PlanInputSource; created_at: string; handled_at: string | null };
const jsonHeaders = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const response = (status: number, body: JsonRecord): Response => new Response(JSON.stringify(body), { status, headers: jsonHeaders });
const sameOriginWrite = (request: Request): boolean => { const origin = request.headers.get("origin"); return !origin || origin === new URL(request.url).origin; };
const parseBody = async (request: Request): Promise<JsonRecord> => {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new Error("PLAN_INPUT_JSON_REQUIRED");
  const text = await request.text();
  if (text.length > 8_000) throw new Error("PLAN_INPUT_BODY_TOO_LARGE");
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("PLAN_INPUT_BODY_INVALID");
  return parsed as JsonRecord;
};
const safeId = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9._:-]{3,200}$/.test(value);
const rowToRecord = (row: PlanInputRow, currentRevision: number): PlanInputRecord => ({ inputId: row.input_id, planId: row.plan_id, planRevision: row.plan_revision, kind: row.kind, mode: row.handling_mode, section: row.section, contextId: row.context_id, contextLabel: row.context_label, message: row.message, status: row.status, sourceSurface: row.source_surface, createdAt: row.created_at, handledAt: row.handled_at, baseCurrent: row.plan_revision === currentRevision });
const listInputs = async (db: D1Database, scopeId: string, planId: string, currentRevision: number): Promise<PlanInputRecord[]> => {
  const rows = await db.prepare("SELECT input_id, plan_id, plan_revision, kind, handling_mode, section, context_id, context_label, message, status, source_surface, created_at, handled_at FROM plan_inputs WHERE scope_id = ? AND plan_id = ? AND status = 'open' ORDER BY created_at DESC").bind(scopeId, planId).all<PlanInputRow>();
  return (rows.results ?? []).map((row) => rowToRecord(row, currentRevision));
};

export const handlePlanInputRequest = async (request: Request, db: D1Database): Promise<Response | null> => {
  const url = new URL(request.url);
  const resolveMatch = url.pathname.match(/^\/api\/plan-inputs\/([^/]+)\/resolve$/);
  const updateMatch = url.pathname.match(/^\/api\/plan-inputs\/([^/]+)$/);
  if (url.pathname !== "/api/plan-inputs" && !resolveMatch && !updateMatch) return null;
  if (!["GET", "POST"].includes(request.method) || ((resolveMatch || updateMatch) && request.method !== "POST")) return response(405, { ok: false, code: "METHOD_NOT_ALLOWED", inputs: [], acceptedStateChanged: false });
  if (request.method === "POST" && !sameOriginWrite(request)) return response(403, { ok: false, code: "CROSS_ORIGIN_WRITE_REFUSED", inputs: [], acceptedStateChanged: false });
  try {
    const principal = await resolveRequestPrincipal(request, db);
    if (!principal) return response(401, { ok: false, code: "AUTHENTICATION_REQUIRED", inputs: [], acceptedStateChanged: false });
    const { scopeId } = await principalStorageScope(principal);
    if (request.method === "GET") {
      const planId = url.searchParams.get("planId") ?? "";
      if (!safeId(planId)) return response(422, { ok: false, code: "PLAN_ID_INVALID", inputs: [], acceptedStateChanged: false });
      const head = await db.prepare("SELECT revision FROM plan_heads WHERE scope_id = ? AND plan_id = ?").bind(scopeId, planId).first<{ revision: number }>();
      if (!head) return response(404, { ok: false, code: "PLAN_NOT_FOUND", inputs: [], acceptedStateChanged: false });
      return response(200, { ok: true, code: "PLAN_INPUTS_LISTED", inputs: await listInputs(db, scopeId, planId, head.revision), acceptedStateChanged: false });
    }
    const body = await parseBody(request);
    const planId = typeof body.planId === "string" ? body.planId : "";
    const expectedRevision = Number(body.expectedRevision);
    const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey : "";
    const sourceSurface = body.sourceSurface === "site" || body.sourceSurface === "codex" ? body.sourceSurface : null;
    if (!safeId(planId) || !Number.isInteger(expectedRevision) || expectedRevision < 1 || !/^[a-zA-Z0-9._:-]{8,200}$/.test(idempotencyKey) || !sourceSurface) return response(422, { ok: false, code: "PLAN_INPUT_GUARD_REQUIRED", inputs: [], acceptedStateChanged: false });
    const head = await db.prepare("SELECT revision FROM plan_heads WHERE scope_id = ? AND plan_id = ?").bind(scopeId, planId).first<{ revision: number }>();
    if (!head) return response(404, { ok: false, code: "PLAN_NOT_FOUND", inputs: [], acceptedStateChanged: false });
    if (head.revision !== expectedRevision) return response(409, { ok: false, code: "PLAN_REVISION_CONFLICT", inputs: await listInputs(db, scopeId, planId, head.revision), currentRevision: head.revision, acceptedStateChanged: false });
    const operation = resolveMatch ? "resolve" : updateMatch ? "update" : "add";
    const inputId = resolveMatch ? decodeURIComponent(resolveMatch[1]!) : updateMatch ? decodeURIComponent(updateMatch[1]!) : "";
    if ((resolveMatch || updateMatch) && !safeId(inputId)) return response(422, { ok: false, code: "PLAN_INPUT_ID_INVALID", inputs: [], acceptedStateChanged: false });
    const requestHash = await authSha256({ scopeId, operation, planId, expectedRevision, sourceSurface, ...(resolveMatch ? { inputId } : { ...(updateMatch ? { inputId } : {}), kind: body.kind, mode: body.mode, section: body.section, contextId: body.contextId ?? null, contextLabel: body.contextLabel ?? null, message: body.message }) });
    const replay = await db.prepare("SELECT request_hash, receipt_json FROM plan_input_receipts WHERE scope_id = ? AND idempotency_key = ?").bind(scopeId, idempotencyKey).first<{ request_hash: string; receipt_json: string }>();
    if (replay) {
      if (replay.request_hash !== requestHash) return response(409, { ok: false, code: "IDEMPOTENCY_KEY_REUSED", inputs: await listInputs(db, scopeId, planId, head.revision), acceptedStateChanged: false });
      return response(200, JSON.parse(replay.receipt_json) as JsonRecord);
    }
    const now = new Date().toISOString();
    if (resolveMatch) {
      const existing = await db.prepare("SELECT input_id, plan_id, plan_revision, kind, handling_mode, section, context_id, context_label, message, status, source_surface, created_at, handled_at FROM plan_inputs WHERE scope_id = ? AND input_id = ? AND plan_id = ?").bind(scopeId, inputId, planId).first<PlanInputRow>();
      if (!existing) return response(404, { ok: false, code: "PLAN_INPUT_NOT_FOUND", inputs: await listInputs(db, scopeId, planId, head.revision), acceptedStateChanged: false });
      const handled = { ...existing, status: "handled" as const, handled_at: existing.handled_at ?? now };
      const payload = { ok: true, code: existing.status === "handled" ? "PLAN_INPUT_ALREADY_HANDLED" : "PLAN_INPUT_HANDLED", input: rowToRecord(handled, head.revision), inputs: [] as PlanInputRecord[], acceptedStateChanged: false };
      payload.inputs = (await listInputs(db, scopeId, planId, head.revision)).filter((item) => item.inputId !== inputId);
      await db.batch([
        db.prepare("UPDATE plan_inputs SET status = 'handled', handled_at = COALESCE(handled_at, ?) WHERE scope_id = ? AND input_id = ? AND plan_id = ?").bind(now, scopeId, inputId, planId),
        db.prepare("INSERT INTO plan_input_receipts (scope_id, idempotency_key, request_hash, receipt_json, created_at) VALUES (?, ?, ?, ?, ?)").bind(scopeId, idempotencyKey, requestHash, JSON.stringify(payload), now),
      ]);
      return response(200, payload);
    }
    const validation = validatePlanInput({ kind: body.kind, mode: body.mode, section: body.section, contextId: body.contextId, contextLabel: body.contextLabel, message: body.message });
    if (!validation.ok) return response(422, { ok: false, code: "PLAN_INPUT_INVALID", inputs: await listInputs(db, scopeId, planId, head.revision), issues: validation.issues, acceptedStateChanged: false });
    if (updateMatch) {
      const existing = await db.prepare("SELECT input_id, plan_id, plan_revision, kind, handling_mode, section, context_id, context_label, message, status, source_surface, created_at, handled_at FROM plan_inputs WHERE scope_id = ? AND input_id = ? AND plan_id = ?").bind(scopeId, inputId, planId).first<PlanInputRow>();
      if (!existing || existing.status !== "open") return response(404, { ok: false, code: "PLAN_INPUT_NOT_FOUND", inputs: await listInputs(db, scopeId, planId, head.revision), acceptedStateChanged: false });
      const updatedRow: PlanInputRow = { ...existing, plan_revision: expectedRevision, kind: validation.value.kind, handling_mode: validation.value.mode, section: validation.value.section, context_id: validation.value.contextId, context_label: validation.value.contextLabel, message: validation.value.message, source_surface: sourceSurface };
      const updated = rowToRecord(updatedRow, head.revision);
      const payload = { ok: true, code: "PLAN_INPUT_UPDATED", input: updated, inputs: [] as PlanInputRecord[], acceptedStateChanged: false };
      payload.inputs = [updated, ...(await listInputs(db, scopeId, planId, head.revision)).filter((item) => item.inputId !== inputId)];
      await db.batch([
        db.prepare("UPDATE plan_inputs SET plan_revision = ?, kind = ?, handling_mode = ?, section = ?, context_id = ?, context_label = ?, message = ?, source_surface = ? WHERE scope_id = ? AND input_id = ? AND plan_id = ? AND status = 'open'").bind(expectedRevision, updated.kind, updated.mode, updated.section, updated.contextId, updated.contextLabel, updated.message, sourceSurface, scopeId, inputId, planId),
        db.prepare("INSERT INTO plan_input_receipts (scope_id, idempotency_key, request_hash, receipt_json, created_at) VALUES (?, ?, ?, ?, ?)").bind(scopeId, idempotencyKey, requestHash, JSON.stringify(payload), now),
      ]);
      return response(200, payload);
    }
    const newInputId = `plan_input_${crypto.randomUUID()}`;
    const item: PlanInputRecord = { inputId: newInputId, planId, planRevision: expectedRevision, ...validation.value, status: "open", sourceSurface, createdAt: now, handledAt: null, baseCurrent: true };
    const current = await listInputs(db, scopeId, planId, head.revision);
    const payload = { ok: true, code: "PLAN_INPUT_ADDED", input: item, inputs: [item, ...current], acceptedStateChanged: false };
    await db.batch([
      db.prepare("INSERT INTO plan_inputs (scope_id, input_id, plan_id, plan_revision, kind, handling_mode, section, context_id, context_label, message, status, source_surface, created_at, handled_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, NULL)").bind(scopeId, newInputId, planId, expectedRevision, item.kind, item.mode, item.section, item.contextId, item.contextLabel, item.message, sourceSurface, now),
      db.prepare("INSERT INTO plan_input_receipts (scope_id, idempotency_key, request_hash, receipt_json, created_at) VALUES (?, ?, ?, ?, ?)").bind(scopeId, idempotencyKey, requestHash, JSON.stringify(payload), now),
    ]);
    return response(201, payload);
  } catch (error) {
    if (error instanceof SyntaxError || (error instanceof Error && error.message.startsWith("PLAN_INPUT_"))) return response(400, { ok: false, code: "PLAN_INPUT_REQUEST_INVALID", inputs: [], acceptedStateChanged: false });
    return response(500, { ok: false, code: "PLAN_INPUT_SERVICE_FAILED", inputs: [], message: "The plan item was not saved. Nothing else changed.", acceptedStateChanged: false });
  }
};
