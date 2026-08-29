import type { D1Database } from "./accepted-truth.js";
import { authSha256, principalStorageScope, resolveRequestPrincipal } from "./auth.js";
import { emptyRetrospective, validateProfileMemory, validateRetrospective, type PlanLearningResult, type PlanRetrospective, type ProfileMemory, type ProfileMemoryKind, type ProfileMemoryStatus } from "../src/plan-learning.js";

type JsonRecord = Record<string, unknown>;
type PlanHeadRow = { revision: number; profile_id: string };
type RetrospectiveRow = { plan_id: string; plan_revision: number; worked: string; changed: string; next_time: string; updated_at: string };
type MemoryRow = { memory_id: string; family: string; kind: ProfileMemoryKind; statement: string; evidence: string; source_plan_id: string; source_surface: "site" | "codex"; status: ProfileMemoryStatus; created_at: string; updated_at: string; decided_at: string | null };

const jsonHeaders = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const response = (status: number, body: JsonRecord): Response => new Response(JSON.stringify(body), { status, headers: jsonHeaders });
const sameOriginWrite = (request: Request): boolean => { const origin = request.headers.get("origin"); return !origin || origin === new URL(request.url).origin; };
const parseBody = async (request: Request): Promise<JsonRecord> => {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new Error("LEARNING_JSON_REQUIRED");
  const text = await request.text();
  if (text.length > 12_000) throw new Error("LEARNING_BODY_TOO_LARGE");
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("LEARNING_BODY_INVALID");
  return parsed as JsonRecord;
};
const toRetrospective = (row: RetrospectiveRow, revision: number): PlanRetrospective => ({ planId: row.plan_id, planRevision: row.plan_revision, worked: row.worked, changed: row.changed, nextTime: row.next_time, updatedAt: row.updated_at, baseCurrent: row.plan_revision === revision });
const toMemory = (row: MemoryRow): ProfileMemory => ({ memoryId: row.memory_id, family: row.family, kind: row.kind, statement: row.statement, evidence: row.evidence, sourcePlanId: row.source_plan_id, sourceSurface: row.source_surface, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at, decidedAt: row.decided_at });
const validGuard = (body: JsonRecord): { planId: string; expectedRevision: number; idempotencyKey: string; sourceSurface: "site" | "codex" } | null => {
  const planId = typeof body.planId === "string" ? body.planId : "";
  const expectedRevision = Number(body.expectedRevision);
  const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey : "";
  const sourceSurface = body.sourceSurface === "site" || body.sourceSurface === "codex" ? body.sourceSurface : null;
  return planId && Number.isInteger(expectedRevision) && expectedRevision > 0 && /^[a-zA-Z0-9._:-]{8,200}$/.test(idempotencyKey) && sourceSurface ? { planId, expectedRevision, idempotencyKey, sourceSurface } : null;
};
const listState = async (db: D1Database, scopeId: string, planId: string, revision: number): Promise<Pick<PlanLearningResult, "retrospective" | "memories">> => {
  const [retrospective, memories] = await Promise.all([
    db.prepare("SELECT plan_id, plan_revision, worked, changed, next_time, updated_at FROM plan_retrospectives WHERE scope_id = ? AND plan_id = ?").bind(scopeId, planId).first<RetrospectiveRow>(),
    db.prepare("SELECT memory_id, family, kind, statement, evidence, source_plan_id, source_surface, status, created_at, updated_at, decided_at FROM profile_memories WHERE scope_id = ? ORDER BY CASE status WHEN 'proposed' THEN 0 WHEN 'accepted' THEN 1 ELSE 2 END, updated_at DESC").bind(scopeId).all<MemoryRow>(),
  ]);
  return { retrospective: retrospective ? toRetrospective(retrospective, revision) : emptyRetrospective(planId, revision), memories: (memories.results ?? []).map(toMemory) };
};

export const handlePlanLearningRequest = async (request: Request, db: D1Database): Promise<Response | null> => {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/plan-learning")) return null;
  if (!sameOriginWrite(request)) return response(403, { ok: false, code: "CROSS_ORIGIN_WRITE_REFUSED", retrospective: null, memories: [], acceptedStateChanged: false });
  try {
    const principal = await resolveRequestPrincipal(request, db);
    if (!principal) return response(401, { ok: false, code: "AUTHENTICATION_REQUIRED", retrospective: null, memories: [], acceptedStateChanged: false });
    if (principal.kind === "demo" && request.method !== "GET") return response(403, { ok: false, code: "ACCOUNT_LEARNING_REQUIRED", retrospective: null, memories: [], acceptedStateChanged: false });
    const { scopeId } = await principalStorageScope(principal);
    const body = request.method === "GET" ? {} : await parseBody(request);
    const planId = request.method === "GET" ? url.searchParams.get("planId") ?? "" : typeof body.planId === "string" ? body.planId : "";
    const head = planId ? await db.prepare("SELECT revision, profile_id FROM plan_heads WHERE scope_id = ? AND plan_id = ?").bind(scopeId, planId).first<PlanHeadRow>() : null;
    if (!head) return response(404, { ok: false, code: "PLAN_NOT_FOUND", retrospective: null, memories: [], acceptedStateChanged: false });
    if (request.method === "GET" && url.pathname === "/api/plan-learning") return response(200, { ok: true, code: "PLAN_LEARNING_LOADED", ...(await listState(db, scopeId, planId, head.revision)), acceptedStateChanged: false });

    const guard = validGuard(body);
    if (!guard) return response(422, { ok: false, code: "PLAN_LEARNING_GUARD_REQUIRED", retrospective: null, memories: [], acceptedStateChanged: false });
    if (guard.planId !== planId || guard.expectedRevision !== head.revision) return response(409, { ok: false, code: "PLAN_REVISION_CONFLICT", retrospective: null, memories: [], currentRevision: head.revision, acceptedStateChanged: false });
    const requestHash = await authSha256({ scopeId, path: url.pathname, body: { ...body, idempotencyKey: undefined } });
    const replay = await db.prepare("SELECT request_hash, receipt_json FROM plan_learning_receipts WHERE scope_id = ? AND idempotency_key = ?").bind(scopeId, guard.idempotencyKey).first<{ request_hash: string; receipt_json: string }>();
    if (replay) return replay.request_hash === requestHash ? response(200, JSON.parse(replay.receipt_json) as JsonRecord) : response(409, { ok: false, code: "IDEMPOTENCY_KEY_REUSED", retrospective: null, memories: [], acceptedStateChanged: false });
    const now = new Date().toISOString();

    if (request.method === "PUT" && url.pathname === "/api/plan-learning/retrospective") {
      if (guard.sourceSurface !== "site") return response(403, { ok: false, code: "HUMAN_RETROSPECTIVE_REQUIRED", retrospective: null, memories: [], acceptedStateChanged: false });
      const validation = validateRetrospective(body);
      if (!validation.ok) return response(422, { ok: false, code: "RETROSPECTIVE_INVALID", retrospective: null, memories: [], issues: validation.issues, acceptedStateChanged: false });
      const retrospective = { planId, planRevision: head.revision, ...validation.value, updatedAt: now, baseCurrent: true };
      const payload = { ok: true, code: "RETROSPECTIVE_SAVED", retrospective, memories: (await listState(db, scopeId, planId, head.revision)).memories, acceptedStateChanged: false };
      await db.batch([
        db.prepare("INSERT INTO plan_retrospectives (scope_id, plan_id, plan_revision, worked, changed, next_time, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(scope_id, plan_id) DO UPDATE SET plan_revision = excluded.plan_revision, worked = excluded.worked, changed = excluded.changed, next_time = excluded.next_time, updated_at = excluded.updated_at").bind(scopeId, planId, head.revision, validation.value.worked, validation.value.changed, validation.value.nextTime, now, now),
        db.prepare("INSERT INTO plan_learning_receipts (scope_id, idempotency_key, request_hash, receipt_json, created_at) VALUES (?, ?, ?, ?, ?)").bind(scopeId, guard.idempotencyKey, requestHash, JSON.stringify(payload), now),
      ]);
      return response(200, payload);
    }

    if (request.method === "POST" && url.pathname === "/api/plan-learning/memories") {
      const validation = validateProfileMemory(body);
      if (!validation.ok) return response(422, { ok: false, code: "PROFILE_MEMORY_INVALID", retrospective: null, memories: [], issues: validation.issues, acceptedStateChanged: false });
      if (guard.sourceSurface === "codex") {
        const rejected = await db.prepare("SELECT memory_id FROM profile_memories WHERE scope_id = ? AND kind = ? AND evidence = ? AND status = 'rejected' LIMIT 1").bind(scopeId, validation.value.kind, validation.value.evidence).first<{ memory_id: string }>();
        if (rejected) return response(409, { ok: false, code: "PROFILE_MEMORY_EVIDENCE_REJECTED", retrospective: (await listState(db, scopeId, planId, head.revision)).retrospective, memories: [], acceptedStateChanged: false, message: "The person already rejected a profile read based on this evidence. Materially new evidence is required." });
      }
      const status: ProfileMemoryStatus = guard.sourceSurface === "site" ? "accepted" : "proposed";
      const memoryId = `memory_${crypto.randomUUID().replaceAll("-", "")}`;
      const memory: ProfileMemory = { memoryId, family: head.profile_id, ...validation.value, sourcePlanId: planId, sourceSurface: guard.sourceSurface, status, createdAt: now, updatedAt: now, decidedAt: status === "accepted" ? now : null };
      const before = await listState(db, scopeId, planId, head.revision);
      const payload = { ok: true, code: status === "accepted" ? "PROFILE_MEMORY_ACCEPTED" : "PROFILE_MEMORY_PROPOSED", retrospective: before.retrospective, memories: [memory, ...before.memories], memory, acceptedStateChanged: false };
      await db.batch([
        db.prepare("INSERT INTO profile_memories (scope_id, memory_id, family, kind, statement, evidence, source_plan_id, source_surface, status, created_at, updated_at, decided_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(scopeId, memoryId, head.profile_id, memory.kind, memory.statement, memory.evidence, planId, guard.sourceSurface, status, now, now, memory.decidedAt),
        db.prepare("INSERT INTO plan_learning_receipts (scope_id, idempotency_key, request_hash, receipt_json, created_at) VALUES (?, ?, ?, ?, ?)").bind(scopeId, guard.idempotencyKey, requestHash, JSON.stringify(payload), now),
      ]);
      return response(status === "accepted" ? 200 : 201, payload);
    }

    const match = url.pathname.match(/^\/api\/plan-learning\/memories\/([^/]+)\/decision$/);
    if (request.method === "POST" && match) {
      if (guard.sourceSurface !== "site") return response(403, { ok: false, code: "HUMAN_MEMORY_DECISION_REQUIRED", retrospective: null, memories: [], acceptedStateChanged: false });
      const memoryId = decodeURIComponent(match[1]!);
      const existing = await db.prepare("SELECT memory_id, family, kind, statement, evidence, source_plan_id, source_surface, status, created_at, updated_at, decided_at FROM profile_memories WHERE scope_id = ? AND memory_id = ?").bind(scopeId, memoryId).first<MemoryRow>();
      if (!existing) return response(404, { ok: false, code: "PROFILE_MEMORY_NOT_FOUND", retrospective: null, memories: [], acceptedStateChanged: false });
      if (existing.source_plan_id !== planId) return response(409, { ok: false, code: "PROFILE_MEMORY_PLAN_MISMATCH", retrospective: null, memories: [], acceptedStateChanged: false });
      const status = body.status === "accepted" || body.status === "rejected" ? body.status : null;
      const statement = typeof body.statement === "string" ? body.statement.trim() : existing.statement;
      const validation = validateProfileMemory({ kind: existing.kind, statement, evidence: existing.evidence });
      if (!status || !validation.ok) return response(422, { ok: false, code: "PROFILE_MEMORY_DECISION_INVALID", retrospective: null, memories: [], acceptedStateChanged: false });
      const memory = toMemory({ ...existing, statement: validation.value.statement, status, updated_at: now, decided_at: now });
      const current = await listState(db, scopeId, planId, head.revision);
      const memories = current.memories.map((item) => item.memoryId === memoryId ? memory : item);
      const payload = { ok: true, code: status === "accepted" ? "PROFILE_MEMORY_ACCEPTED" : "PROFILE_MEMORY_REJECTED", retrospective: current.retrospective, memories, memory, acceptedStateChanged: false };
      await db.batch([
        db.prepare("UPDATE profile_memories SET statement = ?, status = ?, updated_at = ?, decided_at = ? WHERE scope_id = ? AND memory_id = ?").bind(memory.statement, status, now, now, scopeId, memoryId),
        db.prepare("INSERT INTO plan_learning_receipts (scope_id, idempotency_key, request_hash, receipt_json, created_at) VALUES (?, ?, ?, ?, ?)").bind(scopeId, guard.idempotencyKey, requestHash, JSON.stringify(payload), now),
      ]);
      return response(200, payload);
    }
    return response(405, { ok: false, code: "METHOD_NOT_ALLOWED", retrospective: null, memories: [], acceptedStateChanged: false });
  } catch (error) {
    if (error instanceof SyntaxError || (error instanceof Error && error.message.startsWith("LEARNING_"))) return response(400, { ok: false, code: "PLAN_LEARNING_REQUEST_INVALID", retrospective: null, memories: [], acceptedStateChanged: false });
    return response(500, { ok: false, code: "PLAN_LEARNING_SERVICE_FAILED", retrospective: null, memories: [], message: "Plan learning failed safely.", acceptedStateChanged: false });
  }
};
