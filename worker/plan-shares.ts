import { authSha256, principalStorageScope, resolveRequestPrincipal } from "./auth.js";
import type { D1Database } from "./accepted-truth.js";
import { projectAcceptedPlanCopyFromReceipts } from "../src/surface.js";

type JsonRecord = Record<string, unknown>;
export type ShareSection = "overview" | "allocation" | "measures" | "stages" | "changes" | "outcome" | "progress" | "decisions" | "references";

interface ShareRow {
  share_id: string;
  plan_id: string;
  mode: string;
  sections_json: string;
  frozen_projection_json: string | null;
  label: string;
  created_at: string;
  revoked_at: string | null;
}

interface PlanProjectionRow extends ShareRow {
  scope_id: string;
  revision: number;
  updated_at: string;
  snapshot_json: string;
  definition_json: string;
}

const allowedSections = new Set<ShareSection>(["overview", "allocation", "measures", "stages", "changes", "outcome", "progress", "decisions", "references"]);
const jsonHeaders = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const response = (status: number, body: JsonRecord): Response => new Response(JSON.stringify(body), { status, headers: jsonHeaders });
const errorResponse = (status: number, code: string, message: string): Response => response(status, { ok: false, code, message });
const asRecord = (value: unknown): JsonRecord => value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};

const sameOriginWrite = (request: Request): boolean => {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
};

const randomToken = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
};

const parseJson = async (request: Request): Promise<JsonRecord> => {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new Error("JSON_REQUIRED");
  const text = await request.text();
  if (text.length > 4_000) throw new Error("BODY_TOO_LARGE");
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("OBJECT_REQUIRED");
  return value as JsonRecord;
};

const validPlanId = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9._:-]{1,200}$/.test(value);
const validShareId = (value: string): boolean => /^share_[a-f0-9]{16}$/.test(value);

export const selectedSections = (value: unknown): ShareSection[] | null => {
  if (!Array.isArray(value) || value.length < 1 || value.length > allowedSections.size) return null;
  const sections = [...new Set(value.filter((item): item is ShareSection => typeof item === "string" && allowedSections.has(item as ShareSection)))];
  return sections.length === value.length && sections.includes("overview") ? sections : null;
};

const accountScope = async (request: Request, db: D1Database): Promise<string | Response> => {
  const principal = await resolveRequestPrincipal(request, db);
  if (!principal) return errorResponse(401, "AUTHENTICATION_REQUIRED", "Sign in before publishing a plan view.");
  if (principal.kind !== "account") return errorResponse(403, "ACCOUNT_REQUIRED", "Temporary demo plans cannot be published.");
  return (await principalStorageScope(principal)).scopeId;
};

const readValue = (snapshot: JsonRecord, binding: JsonRecord): string | number | null => {
  const path = Array.isArray(binding.path) ? binding.path.filter((part): part is string => typeof part === "string") : [];
  let value: unknown = binding.selector === "allocations" ? snapshot.accepted : binding.selector === "entities" ? snapshot.entities : null;
  for (const part of path) value = asRecord(value)[part];
  return typeof value === "number" || typeof value === "string" ? value : null;
};

export const sanitizeProjection = async (db: D1Database, scopeId: string, row: PlanProjectionRow, sections: ShareSection[], mode: "live" | "frozen"): Promise<JsonRecord> => {
  const snapshot = asRecord(JSON.parse(row.snapshot_json));
  const definition = asRecord(JSON.parse(row.definition_json));
  const surface = asRecord(definition.surface);
  const hero = asRecord(surface.hero);
  const lifecycle = asRecord(snapshot.lifecycle);
  const receipts = Array.isArray(snapshot.receipts) ? snapshot.receipts.map(asRecord).filter((receipt) => typeof receipt.receiptType === "string" && receipt.payload && typeof receipt.payload === "object") as Array<{ receiptType: string; payload: Record<string, unknown> }> : [];
  const projectCopy = (value: unknown, fallback = ""): string => projectAcceptedPlanCopyFromReceipts(typeof value === "string" ? value : fallback, receipts);
  const plan: JsonRecord = {
    name: projectCopy(definition.name, "Shared Finite plan"),
    family: typeof definition.profileId === "string" ? definition.profileId : "plan",
    revision: row.revision,
    status: typeof lifecycle.status === "string" ? lifecycle.status : "active",
    updatedAt: row.updated_at,
  };
  if (sections.includes("overview")) Object.assign(plan, {
    headline: projectCopy(hero.title, "A shared Finite plan"),
    brief: projectCopy(hero.brief),
    eyebrow: typeof hero.eyebrow === "string" ? hero.eyebrow : "",
  });
  if (sections.includes("allocation")) plan.allocation = asRecord(snapshot.accepted);
  if (sections.includes("measures")) {
    const measures = Array.isArray(surface.primaryMeasures) ? surface.primaryMeasures : [];
    plan.measures = measures.slice(0, 8).map((item) => {
      const binding = asRecord(item);
      return { label: String(binding.label ?? "Measure"), format: String(binding.format ?? "number"), value: readValue(snapshot, binding) };
    }).filter((item) => item.value !== null);
  }
  if (sections.includes("stages")) {
    const stages = Array.isArray(surface.stages) ? surface.stages : [];
    const checklist = await db.prepare("SELECT source_ref, status FROM plan_checklist_items WHERE scope_id = ? AND plan_id = ?").bind(scopeId, row.plan_id).all<{ source_ref: string | null; status: string }>();
    const statusBySource = new Map(checklist.results.map((item) => [item.source_ref, item.status]));
    plan.stages = stages.slice(0, 12).map((item) => {
      const stage = asRecord(item);
      const stageId = String(stage.stageId ?? "");
      const acceptedStatus = statusBySource.get(`stage:${stageId}`);
      return { label: projectCopy(stage.label, "Stage"), detail: projectCopy(stage.detail), marker: projectCopy(stage.marker), status: lifecycle.status === "completed" || acceptedStatus === "done" ? "done" : String(stage.status ?? "planned") };
    });
  }
  if (sections.includes("changes")) {
    const events = Array.isArray(snapshot.events) ? snapshot.events : [];
    plan.changes = events.slice(-5).reverse().map((item) => {
      const event = asRecord(item);
      return { title: String(event.title ?? "Accepted plan change"), revision: Number(event.baseRevision ?? 0) + 1 };
    });
  }
  if (sections.includes("outcome")) {
    const lifecycleEvents = Array.isArray(snapshot.lifecycleEvents) ? snapshot.lifecycleEvents.map(asRecord) : [];
    const completion = [...lifecycleEvents].reverse().find((event) => event.after === "completed" && event.before !== "completed");
    const recordedActual = [...lifecycleEvents].reverse().find((event) => typeof event.actualSpendMinor === "number");
    plan.outcome = completion ? {
      note: String(completion.reason ?? "The planned outcome happened."),
      completedAt: typeof completion.occurredAt === "string" ? completion.occurredAt : row.updated_at,
      actualSpendMinor: typeof recordedActual?.actualSpendMinor === "number" ? recordedActual.actualSpendMinor : null,
    } : null;
  }
  if (sections.includes("progress")) {
    const result = await db.prepare("SELECT label, context_label, status FROM plan_checklist_items WHERE scope_id = ? AND plan_id = ? ORDER BY position, created_at").bind(scopeId, row.plan_id).all<{ label: string; context_label: string | null; status: string }>();
    const items = result.results.slice(0, 30).map((item) => ({ label: item.label, contextLabel: item.context_label, status: item.status }));
    plan.progress = { done: items.filter((item) => item.status === "done").length, total: items.length, items };
  }
  if (sections.includes("decisions")) {
    const result = await db.prepare("SELECT kind, context_label, message FROM plan_inputs WHERE scope_id = ? AND plan_id = ? AND handling_mode = 'direct' ORDER BY created_at").bind(scopeId, row.plan_id).all<{ kind: string; context_label: string | null; message: string }>();
    plan.decisions = result.results.slice(0, 30).map((item) => ({ kind: item.kind, contextLabel: item.context_label, message: item.message }));
  }
  if (sections.includes("references")) {
    const result = await db.prepare("SELECT kind, label, context_label, note_text, link_url, file_name FROM plan_attachments WHERE scope_id = ? AND plan_id = ? AND status = 'active' ORDER BY created_at").bind(scopeId, row.plan_id).all<{ kind: string; label: string; context_label: string | null; note_text: string | null; link_url: string | null; file_name: string | null }>();
    plan.references = result.results.slice(0, 30).map((item) => ({ kind: item.kind, label: item.label, contextLabel: item.context_label, value: item.kind === "note" ? item.note_text : item.kind === "link" ? item.link_url : item.file_name }));
  }
  return { publicationVersion: "finite-plan-publication.v1", mode, sections, plan };
};

export const loadPlanRow = async (db: D1Database, scopeId: string, planId: string): Promise<PlanProjectionRow | null> => db.prepare(`
  SELECT h.scope_id, '' AS share_id, h.plan_id, '' AS mode, '[]' AS sections_json, NULL AS frozen_projection_json,
         '' AS label, '' AS created_at, NULL AS revoked_at, h.revision, h.updated_at,
         r.snapshot_json, c.definition_json
    FROM plan_heads h
    JOIN plan_revisions r ON r.scope_id = h.scope_id AND r.plan_id = h.plan_id AND r.revision = h.revision
    JOIN plan_catalog c ON c.scope_id = h.scope_id AND c.plan_id = h.plan_id
   WHERE h.scope_id = ? AND h.plan_id = ?
`).bind(scopeId, planId).first<PlanProjectionRow>();

const listShares = async (request: Request, db: D1Database, scopeId: string): Promise<Response> => {
  const planId = new URL(request.url).searchParams.get("planId");
  if (!validPlanId(planId)) return errorResponse(400, "PLAN_ID_INVALID", "A single accepted plan is required.");
  if (!await loadPlanRow(db, scopeId, planId)) return errorResponse(404, "PLAN_NOT_FOUND", "The selected accepted plan was not found.");
  const rows = await db.prepare("SELECT share_id, plan_id, mode, sections_json, frozen_projection_json, label, created_at, revoked_at FROM plan_shares WHERE scope_id = ? AND plan_id = ? ORDER BY created_at DESC LIMIT 30")
    .bind(scopeId, planId).all<ShareRow>();
  return response(200, {
    ok: true,
    code: "PLAN_PUBLICATIONS",
    publications: rows.results.map((row) => ({ shareId: row.share_id, planId: row.plan_id, mode: row.mode, sections: JSON.parse(row.sections_json), label: row.label, createdAt: row.created_at, revokedAt: row.revoked_at })),
  });
};

const previewShare = async (request: Request, db: D1Database, scopeId: string): Promise<Response> => {
  const body = await parseJson(request);
  const sections = selectedSections(body.sections);
  if (!validPlanId(body.planId) || !sections || (body.mode !== "live" && body.mode !== "frozen")) return errorResponse(422, "PUBLICATION_SELECTION_INVALID", "Choose one accepted plan, a publication mode, and at least the overview section.");
  const row = await loadPlanRow(db, scopeId, body.planId);
  if (!row) return errorResponse(404, "PLAN_NOT_FOUND", "Only a durable accepted plan can be published.");
  return response(200, { ok: true, code: "PLAN_PUBLICATION_PREVIEW", publication: await sanitizeProjection(db, scopeId, row, sections, body.mode) });
};

const createShare = async (request: Request, db: D1Database, scopeId: string): Promise<Response> => {
  const body = await parseJson(request);
  const sections = selectedSections(body.sections);
  const mode = body.mode;
  const label = typeof body.label === "string" ? body.label.trim() : "";
  if (!validPlanId(body.planId) || !sections || (mode !== "live" && mode !== "frozen") || label.length < 1 || label.length > 80) return errorResponse(422, "PUBLICATION_SELECTION_INVALID", "Choose one accepted plan, a publication mode, included sections and a short label.");
  const row = await loadPlanRow(db, scopeId, body.planId);
  if (!row) return errorResponse(404, "PLAN_NOT_FOUND", "Only a durable accepted plan can be published.");
  const token = randomToken();
  const tokenHash = await authSha256({ shareToken: token });
  const shareId = `share_${tokenHash.slice(0, 16)}`;
  const createdAt = new Date().toISOString();
  const frozenProjection = mode === "frozen" ? JSON.stringify(await sanitizeProjection(db, scopeId, row, sections, mode)) : null;
  await db.batch([db.prepare("INSERT INTO plan_shares (scope_id, share_id, token_hash, plan_id, mode, sections_json, frozen_projection_json, label, created_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)")
    .bind(scopeId, shareId, tokenHash, body.planId, mode, JSON.stringify(sections), frozenProjection, label, createdAt)]);
  return response(201, {
    ok: true,
    code: "PLAN_PUBLICATION_CREATED",
    publication: { shareId, planId: body.planId, mode, sections, label, createdAt, revokedAt: null, path: `/share/${token}` },
  });
};

const revokeShare = async (db: D1Database, scopeId: string, shareId: string): Promise<Response> => {
  if (!validShareId(shareId)) return errorResponse(400, "SHARE_ID_INVALID", "A single published page is required.");
  const row = await db.prepare("SELECT share_id, plan_id, mode, sections_json, frozen_projection_json, label, created_at, revoked_at FROM plan_shares WHERE scope_id = ? AND share_id = ?")
    .bind(scopeId, shareId).first<ShareRow>();
  if (!row) return errorResponse(404, "PLAN_PUBLICATION_NOT_FOUND", "The published page was not found.");
  const revokedAt = row.revoked_at ?? new Date().toISOString();
  if (!row.revoked_at) await db.batch([db.prepare("UPDATE plan_shares SET revoked_at = ? WHERE scope_id = ? AND share_id = ? AND revoked_at IS NULL").bind(revokedAt, scopeId, shareId)]);
  return response(200, { ok: true, code: "PLAN_PUBLICATION_REVOKED", publication: { shareId, planId: row.plan_id, revokedAt } });
};

const loadPublicShare = async (token: string, db: D1Database): Promise<Response> => {
  if (!/^[a-zA-Z0-9_-]{43}$/.test(token)) return errorResponse(404, "PUBLICATION_NOT_FOUND", "This shared page is not available.");
  const tokenHash = await authSha256({ shareToken: token });
  const row = await db.prepare(`
    SELECT s.scope_id, s.share_id, s.plan_id, s.mode, s.sections_json, s.frozen_projection_json, s.label,
           s.created_at, s.revoked_at, h.revision, h.updated_at, r.snapshot_json, c.definition_json
      FROM plan_shares s
      JOIN plan_heads h ON h.scope_id = s.scope_id AND h.plan_id = s.plan_id
      JOIN plan_revisions r ON r.scope_id = h.scope_id AND r.plan_id = h.plan_id AND r.revision = h.revision
      JOIN plan_catalog c ON c.scope_id = h.scope_id AND c.plan_id = h.plan_id
     WHERE s.token_hash = ?
  `).bind(tokenHash).first<PlanProjectionRow>();
  if (!row) return errorResponse(404, "PUBLICATION_NOT_FOUND", "This shared page is not available.");
  if (row.revoked_at) return errorResponse(410, "PUBLICATION_REVOKED", "The owner has stopped sharing this page.");
  const sections = selectedSections(JSON.parse(row.sections_json));
  if (!sections || (row.mode !== "live" && row.mode !== "frozen")) return errorResponse(500, "PUBLICATION_INVALID", "This shared page cannot be read safely.");
  const publication = row.mode === "frozen" && row.frozen_projection_json ? JSON.parse(row.frozen_projection_json) as JsonRecord : await sanitizeProjection(db, row.scope_id, row, sections, "live");
  return response(200, { ok: true, code: "PLAN_PUBLICATION", label: row.label, publishedAt: row.created_at, publication });
};

export const handlePlanShareRequest = async (request: Request, db: D1Database): Promise<Response | null> => {
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/publications/")) {
    if (request.method !== "GET") return errorResponse(405, "METHOD_NOT_ALLOWED", "Shared pages are read only.");
    const token = decodeURIComponent(url.pathname.slice("/api/publications/".length));
    if (token.includes("/")) return errorResponse(404, "PUBLICATION_NOT_FOUND", "This shared page is not available.");
    try { return await loadPublicShare(token, db); }
    catch { return errorResponse(500, "PUBLICATION_SERVICE_FAILED", "This shared page could not be read safely."); }
  }
  if (url.pathname !== "/api/plan-shares" && url.pathname !== "/api/plan-shares/preview" && !url.pathname.startsWith("/api/plan-shares/")) return null;
  if (request.method !== "GET" && !sameOriginWrite(request)) return errorResponse(403, "CROSS_ORIGIN_WRITE_REFUSED", "Finite writes must be same-origin.");
  try {
    const scope = await accountScope(request, db);
    if (scope instanceof Response) return scope;
    if (request.method === "GET" && url.pathname === "/api/plan-shares") return listShares(request, db, scope);
    if (request.method === "POST" && url.pathname === "/api/plan-shares/preview") return previewShare(request, db, scope);
    if (request.method === "POST" && url.pathname === "/api/plan-shares") return createShare(request, db, scope);
    if (request.method === "DELETE" && url.pathname.startsWith("/api/plan-shares/")) {
      const shareId = decodeURIComponent(url.pathname.slice("/api/plan-shares/".length));
      return shareId.includes("/") ? errorResponse(400, "SHARE_ID_INVALID", "A single published page is required.") : revokeShare(db, scope, shareId);
    }
    return errorResponse(405, "METHOD_NOT_ALLOWED", "Unsupported publishing operation.");
  } catch (error) {
    if (error instanceof SyntaxError || (error instanceof Error && ["JSON_REQUIRED", "BODY_TOO_LARGE", "OBJECT_REQUIRED"].includes(error.message))) return errorResponse(400, "PUBLICATION_REQUEST_INVALID", "The publishing request is invalid.");
    return errorResponse(500, "PUBLICATION_SERVICE_FAILED", "Publishing failed safely.");
  }
};
