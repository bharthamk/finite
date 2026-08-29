import type { D1Database } from "./accepted-truth.js";
import { authSha256, principalStorageScope, resolveRequestPrincipal } from "./auth.js";
import type { FiniteFilesBucket } from "./files.js";
import { planInputSections, type PlanInputSection } from "../src/plan-input.js";
import { validateAttachmentProcessing, validateAttachmentRole, validateAttachmentText, validateChecklistLabel, type AttachmentKind, type AttachmentProcessingStatus, type AttachmentRole, type ChecklistItem, type ChecklistOrigin, type ChecklistStatus, type PlanAttachment } from "../src/plan-work.js";

type JsonRecord = Record<string, unknown>;
type ChecklistRow = { item_id: string; plan_id: string; plan_revision: number; section: PlanInputSection; context_id: string | null; context_label: string | null; label: string; origin: ChecklistOrigin; source_ref: string | null; status: ChecklistStatus; position: number; created_at: string; completed_at: string | null; updated_at: string };
type AttachmentRow = { attachment_id: string; plan_id: string; plan_revision: number; section: PlanInputSection; context_id: string | null; context_label: string | null; kind: AttachmentKind; label: string; note_text: string | null; link_url: string | null; object_key: string | null; file_name: string | null; content_type: string | null; size_bytes: number | null; source_surface: "site" | "codex"; attachment_role: AttachmentRole; processing_status: AttachmentProcessingStatus; processing_summary: string | null; derived_refs_json: string; processed_by: "site" | "codex" | null; processed_at: string | null; created_at: string; updated_at: string };
type FileOperationRow = { request_hash: string; operation_kind: "upload" | "delete"; attachment_id: string; plan_id: string; object_key: string | null; status: "pending" | "completed" };

const jsonHeaders = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const respond = (status: number, body: JsonRecord): Response => new Response(JSON.stringify(body), { status, headers: jsonHeaders });
const sameOriginWrite = (request: Request): boolean => { const origin = request.headers.get("origin"); return !origin || origin === new URL(request.url).origin; };
const safeId = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9._:-]{3,200}$/.test(value);
const safeSection = (value: unknown): value is PlanInputSection => typeof value === "string" && planInputSections.includes(value as PlanInputSection);
const optionalText = (value: unknown, limit: number): string | null => typeof value === "string" && value.trim() ? Array.from(value.trim()).slice(0, limit).join("") : null;
const parseJson = async (request: Request): Promise<JsonRecord> => {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new Error("PLAN_WORK_JSON_REQUIRED");
  const text = await request.text();
  if (text.length > 16_000) throw new Error("PLAN_WORK_BODY_TOO_LARGE");
  const value = JSON.parse(text) as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("PLAN_WORK_BODY_INVALID");
  return value as JsonRecord;
};
const toChecklist = (row: ChecklistRow, revision: number): ChecklistItem => ({ itemId: row.item_id, planId: row.plan_id, planRevision: row.plan_revision, section: row.section, contextId: row.context_id, contextLabel: row.context_label, label: row.label, origin: row.origin, sourceRef: row.source_ref, status: row.status, position: row.position, createdAt: row.created_at, completedAt: row.completed_at, updatedAt: row.updated_at, baseCurrent: row.plan_revision === revision });
const parseDerivedRefs = (value: string): string[] => {
  try { const parsed = JSON.parse(value) as unknown; return Array.isArray(parsed) ? parsed.map(String).slice(0, 24) : []; }
  catch { return []; }
};
const toAttachment = (row: AttachmentRow, revision: number): PlanAttachment => ({ attachmentId: row.attachment_id, planId: row.plan_id, planRevision: row.plan_revision, section: row.section, contextId: row.context_id, contextLabel: row.context_label, kind: row.kind, label: row.label, noteText: row.note_text, linkUrl: row.link_url, fileName: row.file_name, contentType: row.content_type, sizeBytes: row.size_bytes, contentUrl: row.object_key ? `/api/plan-work/attachments/${encodeURIComponent(row.attachment_id)}/content` : null, sourceSurface: row.source_surface, attachmentRole: row.attachment_role, processingStatus: row.processing_status, processingSummary: row.processing_summary, derivedRefs: parseDerivedRefs(row.derived_refs_json), processedBy: row.processed_by, processedAt: row.processed_at, createdAt: row.created_at, updatedAt: row.updated_at, baseCurrent: row.plan_revision === revision });
const attachmentColumns = "attachment_id, plan_id, plan_revision, section, context_id, context_label, kind, label, note_text, link_url, object_key, file_name, content_type, size_bytes, source_surface, attachment_role, processing_status, processing_summary, derived_refs_json, processed_by, processed_at, created_at, updated_at";
const listWork = async (db: D1Database, scopeId: string, planId: string, revision: number): Promise<{ checklist: ChecklistItem[]; attachments: PlanAttachment[] }> => {
  const [checklistRows, attachmentRows] = await Promise.all([
    db.prepare("SELECT item_id, plan_id, plan_revision, section, context_id, context_label, label, origin, source_ref, status, position, created_at, completed_at, updated_at FROM plan_checklist_items WHERE scope_id = ? AND plan_id = ? ORDER BY status ASC, position ASC, created_at ASC").bind(scopeId, planId).all<ChecklistRow>(),
    db.prepare(`SELECT ${attachmentColumns} FROM plan_attachments WHERE scope_id = ? AND plan_id = ? AND status = 'active' ORDER BY created_at DESC`).bind(scopeId, planId).all<AttachmentRow>(),
  ]);
  return { checklist: (checklistRows.results ?? []).map((row) => toChecklist(row, revision)), attachments: (attachmentRows.results ?? []).map((row) => toAttachment(row, revision)) };
};
const guardedPlan = async (db: D1Database, scopeId: string, planId: string, expectedRevision?: number): Promise<{ revision: number } | Response> => {
  if (!safeId(planId)) return respond(422, { ok: false, code: "PLAN_ID_INVALID", checklist: [], attachments: [], acceptedStateChanged: false });
  const head = await db.prepare("SELECT revision FROM plan_heads WHERE scope_id = ? AND plan_id = ?").bind(scopeId, planId).first<{ revision: number }>();
  if (!head) return respond(404, { ok: false, code: "PLAN_NOT_FOUND", checklist: [], attachments: [], acceptedStateChanged: false });
  if (expectedRevision !== undefined && head.revision !== expectedRevision) return respond(409, { ok: false, code: "PLAN_REVISION_CONFLICT", currentRevision: head.revision, ...(await listWork(db, scopeId, planId, head.revision)), acceptedStateChanged: false });
  return head;
};
const workReceipt = async (db: D1Database, scopeId: string, key: string, hash: string): Promise<Response | null> => {
  const replay = await db.prepare("SELECT request_hash, receipt_json FROM plan_work_receipts WHERE scope_id = ? AND idempotency_key = ?").bind(scopeId, key).first<{ request_hash: string; receipt_json: string }>();
  if (!replay) return null;
  return replay.request_hash === hash ? respond(200, JSON.parse(replay.receipt_json) as JsonRecord) : respond(409, { ok: false, code: "IDEMPOTENCY_KEY_REUSED", checklist: [], attachments: [], acceptedStateChanged: false });
};
const validGuard = (body: JsonRecord): { planId: string; revision: number; key: string; section: PlanInputSection; contextId: string | null; contextLabel: string | null; source: "site" | "codex" } | null => {
  const planId = typeof body.planId === "string" ? body.planId : "";
  const revision = Number(body.expectedRevision);
  const key = typeof body.idempotencyKey === "string" ? body.idempotencyKey : "";
  const section = body.section;
  const source = body.sourceSurface === "site" || body.sourceSurface === "codex" ? body.sourceSurface : null;
  if (!safeId(planId) || !Number.isInteger(revision) || revision < 1 || !/^[a-zA-Z0-9._:-]{8,200}$/.test(key) || !safeSection(section) || !source) return null;
  return { planId, revision, key, section, contextId: optionalText(body.contextId, 100), contextLabel: optionalText(body.contextLabel, 120), source };
};
const safeFileName = (name: string): string => name.replace(/[\r\n"\\/]/g, "_").trim().slice(0, 180) || "attachment";
const inlineType = (type: string): boolean => type === "application/pdf" || /^image\/(?:avif|gif|jpeg|png|webp)$/u.test(type);
const readableText = (type: string, fileName: string | null): boolean => /^text\//u.test(type) || ["application/json", "application/ld+json", "application/xml", "application/csv", "application/x-ndjson"].includes(type) || /\.(?:txt|md|markdown|csv|tsv|json|jsonl|xml|yaml|yml|log)$/iu.test(fileName ?? "");
const digestBytes = async (bytes: ArrayBuffer): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};
const deterministicId = async (prefix: string, scopeId: string, key: string, hash: string): Promise<string> =>
  `${prefix}_${(await authSha256({ scopeId, key, hash })).slice(0, 24)}`;
const receiptStatement = (db: D1Database, scopeId: string, key: string, hash: string, payload: JsonRecord, now: string) =>
  db.prepare("INSERT INTO plan_work_receipts (scope_id, idempotency_key, request_hash, receipt_json, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(scopeId, key, hash, JSON.stringify(payload), now);

export const handlePlanWorkRequest = async (request: Request, db: D1Database, files?: FiniteFilesBucket): Promise<Response | null> => {
  const url = new URL(request.url);
  const checklistMatch = url.pathname.match(/^\/api\/plan-work\/checklist\/([^/]+)$/);
  const attachmentRemove = url.pathname.match(/^\/api\/plan-work\/attachments\/([^/]+)\/remove$/);
  const attachmentContent = url.pathname.match(/^\/api\/plan-work\/attachments\/([^/]+)\/content$/);
  const attachmentRead = url.pathname.match(/^\/api\/plan-work\/attachments\/([^/]+)\/read$/);
  const attachmentProcessing = url.pathname.match(/^\/api\/plan-work\/attachments\/([^/]+)\/processing$/);
  const known = url.pathname === "/api/plan-work" || url.pathname === "/api/plan-work/checklist" || url.pathname === "/api/plan-work/attachments" || url.pathname === "/api/plan-work/attachments/upload" || checklistMatch || attachmentRemove || attachmentContent || attachmentRead || attachmentProcessing;
  if (!known) return null;
  if (!sameOriginWrite(request) && request.method !== "GET") return respond(403, { ok: false, code: "CROSS_ORIGIN_WRITE_REFUSED", checklist: [], attachments: [], acceptedStateChanged: false });
  try {
    const principal = await resolveRequestPrincipal(request, db);
    if (!principal) return respond(401, { ok: false, code: "AUTHENTICATION_REQUIRED", checklist: [], attachments: [], acceptedStateChanged: false });
    const { scopeId } = await principalStorageScope(principal);
    if (request.method === "GET" && url.pathname === "/api/plan-work") {
      const planId = url.searchParams.get("planId") ?? "";
      const head = await guardedPlan(db, scopeId, planId);
      if (head instanceof Response) return head;
      return respond(200, { ok: true, code: "PLAN_WORK_LISTED", ...(await listWork(db, scopeId, planId, head.revision)), acceptedStateChanged: false });
    }
    if (request.method === "GET" && attachmentContent) {
      if (!files) return respond(503, { ok: false, code: "FILE_STORAGE_UNAVAILABLE", checklist: [], attachments: [], acceptedStateChanged: false });
      const attachmentId = decodeURIComponent(attachmentContent[1]!);
      if (!safeId(attachmentId)) return respond(422, { ok: false, code: "ATTACHMENT_ID_INVALID", checklist: [], attachments: [], acceptedStateChanged: false });
      const row = await db.prepare("SELECT object_key, file_name, content_type FROM plan_attachments WHERE scope_id = ? AND attachment_id = ? AND status = 'active'").bind(scopeId, attachmentId).first<{ object_key: string | null; file_name: string | null; content_type: string | null }>();
      if (!row?.object_key) return respond(404, { ok: false, code: "ATTACHMENT_NOT_FOUND", checklist: [], attachments: [], acceptedStateChanged: false });
      const object = await files.get(row.object_key);
      if (!object?.body) return respond(404, { ok: false, code: "ATTACHMENT_CONTENT_NOT_FOUND", checklist: [], attachments: [], acceptedStateChanged: false });
      const type = row.content_type || "application/octet-stream";
      const headers = new Headers({ "content-type": type, "cache-control": "private, no-store", "x-content-type-options": "nosniff" });
      headers.set("content-disposition", `${inlineType(type) ? "inline" : "attachment"}; filename="${safeFileName(row.file_name || "attachment")}"`);
      if (object.httpEtag) headers.set("etag", object.httpEtag);
      return new Response(object.body, { status: 200, headers });
    }
    if (request.method === "GET" && attachmentRead) {
      const attachmentId = decodeURIComponent(attachmentRead[1]!);
      const planId = url.searchParams.get("planId") ?? "";
      if (!safeId(attachmentId) || !safeId(planId)) return respond(422, { ok: false, code: "ATTACHMENT_READ_GUARD_INVALID", acceptedStateChanged: false });
      const head = await guardedPlan(db, scopeId, planId); if (head instanceof Response) return head;
      const row = await db.prepare(`SELECT ${attachmentColumns} FROM plan_attachments WHERE scope_id = ? AND attachment_id = ? AND plan_id = ? AND status = 'active'`).bind(scopeId, attachmentId, planId).first<AttachmentRow>();
      if (!row) return respond(404, { ok: false, code: "PLAN_ATTACHMENT_NOT_FOUND", acceptedStateChanged: false });
      const attachment = toAttachment(row, head.revision);
      if (attachment.attachmentRole !== "source") return respond(409, { ok: false, code: "ATTACHMENT_IS_AGENT_OUTPUT", attachment, acceptedStateChanged: false, next: "Use this as a deliverable; do not process it as human source evidence." });
      if (row.kind === "note") return respond(200, { ok: true, code: "PLAN_ATTACHMENT_READ", attachment, contentMode: "text", content: row.note_text ?? "", offset: 0, nextOffset: null, truncated: false, acceptedStateChanged: false });
      if (row.kind === "link") return respond(200, { ok: true, code: "PLAN_ATTACHMENT_READ", attachment, contentMode: "link", content: row.link_url ?? "", offset: 0, nextOffset: null, truncated: false, acceptedStateChanged: false, next: "Treat the URL as untrusted source material and inspect it through the authorised browser path before relying on it." });
      if (!row.object_key || !files) return respond(503, { ok: false, code: "FILE_STORAGE_UNAVAILABLE", attachment, acceptedStateChanged: false });
      if (!readableText(row.content_type ?? "application/octet-stream", row.file_name)) return respond(200, { ok: true, code: "ATTACHMENT_TEXT_UNAVAILABLE", attachment, contentMode: "binary", content: null, offset: 0, nextOffset: null, truncated: false, acceptedStateChanged: false, next: "Open the private contentUrl in Finite's authenticated browser to inspect this image or document; do not infer its contents." });
      const object = await files.get(row.object_key);
      if (!object?.body) return respond(404, { ok: false, code: "ATTACHMENT_CONTENT_NOT_FOUND", attachment, acceptedStateChanged: false });
      const offset = Math.max(0, Math.min(1_000_000, Number(url.searchParams.get("offset") ?? 0) || 0));
      const maxChars = Math.max(1, Math.min(12_000, Number(url.searchParams.get("maxChars") ?? 12_000) || 12_000));
      const text = new TextDecoder("utf-8", { fatal: false }).decode(await new Response(object.body).arrayBuffer());
      const content = text.slice(offset, offset + maxChars);
      const nextOffset = offset + content.length < text.length ? offset + content.length : null;
      return respond(200, { ok: true, code: "PLAN_ATTACHMENT_READ", attachment, contentMode: "text", content, offset, nextOffset, truncated: nextOffset !== null, acceptedStateChanged: false, next: nextOffset === null ? "Record how this source was processed and tie any derived plan records back to this attachment." : "Read the next bounded text segment before recording a processing result." });
    }
    if (request.method !== "POST") return respond(405, { ok: false, code: "METHOD_NOT_ALLOWED", checklist: [], attachments: [], acceptedStateChanged: false });

    if (url.pathname === "/api/plan-work/attachments/upload") {
      if (!files) return respond(503, { ok: false, code: "FILE_STORAGE_UNAVAILABLE", checklist: [], attachments: [], acceptedStateChanged: false });
      const form = await request.formData();
      const body: JsonRecord = Object.fromEntries([...form.entries()].filter(([, value]) => typeof value === "string"));
      const guard = validGuard(body);
      const file = form.get("file");
      const role = validateAttachmentRole(body.attachmentRole ?? "source");
      if (!guard || !(file instanceof File) || !role.ok) return respond(422, { ok: false, code: "ATTACHMENT_UPLOAD_INVALID", checklist: [], attachments: [], ...(!role.ok ? { issues: role.issues } : {}), acceptedStateChanged: false });
      const head = await guardedPlan(db, scopeId, guard.planId, guard.revision); if (head instanceof Response) return head;
      if (!file.size || file.size > 10 * 1024 * 1024) return respond(413, { ok: false, code: "ATTACHMENT_FILE_SIZE_INVALID", checklist: [], attachments: [], issues: ["Choose a file smaller than 10 MB."], acceptedStateChanged: false });
      const bytes = await file.arrayBuffer();
      const contentDigest = await digestBytes(bytes);
      const hash = await authSha256({ scopeId, operation: "upload", planId: guard.planId, revision: guard.revision, section: guard.section, contextId: guard.contextId, attachmentRole: role.role, fileName: file.name, size: file.size, type: file.type, contentDigest });
      const replay = await workReceipt(db, scopeId, guard.key, hash); if (replay) return replay;
      const attachmentId = await deterministicId("attachment", scopeId, guard.key, hash);
      const objectKey = `${scopeId}/${guard.planId}/${attachmentId}`;
      const now = new Date().toISOString();
      const fileName = safeFileName(file.name);
      const contentType = file.type || "application/octet-stream";
      const kind: AttachmentKind = inlineType(contentType) && contentType.startsWith("image/") ? "image" : "file";
      const processingStatus: AttachmentProcessingStatus = role.role === "source" ? "unread" : "not_applicable";
      const existingOperation = await db.prepare("SELECT request_hash, operation_kind, attachment_id, plan_id, object_key, status FROM plan_file_operations WHERE scope_id = ? AND idempotency_key = ?")
        .bind(scopeId, guard.key).first<FileOperationRow>();
      if (existingOperation && (existingOperation.request_hash !== hash || existingOperation.operation_kind !== "upload")) return respond(409, { ok: false, code: "IDEMPOTENCY_KEY_REUSED", checklist: [], attachments: [], acceptedStateChanged: false });
      if (!existingOperation) {
        await db.batch([db.prepare("INSERT INTO plan_file_operations (scope_id, idempotency_key, request_hash, operation_kind, attachment_id, plan_id, object_key, status, created_at, updated_at, completed_at) VALUES (?, ?, ?, 'upload', ?, ?, ?, 'pending', ?, ?, NULL)")
          .bind(scopeId, guard.key, hash, attachmentId, guard.planId, objectKey, now, now)]);
      }
      await files.put(objectKey, bytes, { httpMetadata: { contentType } });
      const attachment: PlanAttachment = { attachmentId, planId: guard.planId, planRevision: guard.revision, section: guard.section, contextId: guard.contextId, contextLabel: guard.contextLabel, kind, label: fileName, noteText: null, linkUrl: null, fileName, contentType, sizeBytes: file.size, contentUrl: `/api/plan-work/attachments/${encodeURIComponent(attachmentId)}/content`, sourceSurface: guard.source, attachmentRole: role.role, processingStatus, processingSummary: null, derivedRefs: [], processedBy: null, processedAt: null, createdAt: now, updatedAt: now, baseCurrent: true };
      const current = await listWork(db, scopeId, guard.planId, head.revision);
      const payload = { ok: true, code: "PLAN_ATTACHMENT_UPLOADED", attachment, checklist: current.checklist, attachments: [attachment, ...current.attachments.filter(({ attachmentId: currentId }) => currentId !== attachmentId)], acceptedStateChanged: false as const };
      await db.batch([
        db.prepare("INSERT INTO plan_attachments (scope_id, attachment_id, plan_id, plan_revision, section, context_id, context_label, kind, label, note_text, link_url, object_key, file_name, content_type, size_bytes, source_surface, attachment_role, processing_status, processing_summary, derived_refs_json, processed_by, processed_at, status, created_at, updated_at, removed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, NULL, '[]', NULL, NULL, 'active', ?, ?, NULL) ON CONFLICT(scope_id, attachment_id) DO UPDATE SET plan_revision = excluded.plan_revision, section = excluded.section, context_id = excluded.context_id, context_label = excluded.context_label, label = excluded.label, object_key = excluded.object_key, file_name = excluded.file_name, content_type = excluded.content_type, size_bytes = excluded.size_bytes, source_surface = excluded.source_surface, attachment_role = excluded.attachment_role, processing_status = excluded.processing_status, status = 'active', updated_at = excluded.updated_at, removed_at = NULL").bind(scopeId, attachmentId, guard.planId, guard.revision, guard.section, guard.contextId, guard.contextLabel, kind, fileName, objectKey, fileName, contentType, file.size, guard.source, role.role, processingStatus, now, now),
        receiptStatement(db, scopeId, guard.key, hash, payload, now),
        db.prepare("UPDATE plan_file_operations SET status = 'completed', updated_at = ?, completed_at = ? WHERE scope_id = ? AND idempotency_key = ?").bind(now, now, scopeId, guard.key),
      ]);
      return respond(201, payload);
    }

    const body = await parseJson(request);
    const guard = validGuard(body);
    if (!guard) return respond(422, { ok: false, code: "PLAN_WORK_GUARD_REQUIRED", checklist: [], attachments: [], acceptedStateChanged: false });
    const head = await guardedPlan(db, scopeId, guard.planId, guard.revision); if (head instanceof Response) return head;
    const operation = checklistMatch ? "set_checklist" : attachmentRemove ? "remove_attachment" : attachmentProcessing ? "set_attachment_processing" : url.pathname.endsWith("/checklist") ? "add_checklist" : "add_attachment";
    const targetId = checklistMatch ? decodeURIComponent(checklistMatch[1]!) : attachmentRemove ? decodeURIComponent(attachmentRemove[1]!) : attachmentProcessing ? decodeURIComponent(attachmentProcessing[1]!) : null;
    if (targetId && !safeId(targetId)) return respond(422, { ok: false, code: "PLAN_WORK_ID_INVALID", checklist: [], attachments: [], acceptedStateChanged: false });
    const hash = await authSha256({ scopeId, operation, targetId, ...body });
    const replay = await workReceipt(db, scopeId, guard.key, hash); if (replay) return replay;
    const now = new Date().toISOString();

    if (url.pathname === "/api/plan-work/checklist") {
      const validation = validateChecklistLabel(body.label);
      if (!validation.ok) return respond(422, { ok: false, code: "CHECKLIST_ITEM_INVALID", ...(await listWork(db, scopeId, guard.planId, head.revision)), issues: validation.issues, acceptedStateChanged: false });
      const origin: ChecklistOrigin = body.origin === "adaptive" || body.origin === "codex" ? body.origin : "human";
      const sourceRef = optionalText(body.sourceRef, 200);
      const itemId = sourceRef ? `check_${(await authSha256({ scopeId, planId: guard.planId, sourceRef })).slice(0, 24)}` : await deterministicId("check", scopeId, guard.key, hash);
      const position = Number.isInteger(Number(body.position)) ? Math.max(0, Math.min(10000, Number(body.position))) : 0;
      const item: ChecklistItem = { itemId, planId: guard.planId, planRevision: guard.revision, section: guard.section, contextId: guard.contextId, contextLabel: guard.contextLabel, label: validation.label, origin, sourceRef, status: "open", position, createdAt: now, completedAt: null, updatedAt: now, baseCurrent: true };
      const current = await listWork(db, scopeId, guard.planId, head.revision);
      const payload = { ok: true, code: sourceRef ? "ADAPTIVE_CHECKLIST_SYNCED" : "CHECKLIST_ITEM_ADDED", item, checklist: [...current.checklist.filter(({ itemId: currentId }) => currentId !== itemId), item], attachments: current.attachments, acceptedStateChanged: false as const };
      await db.batch([
        db.prepare("INSERT INTO plan_checklist_items (scope_id, item_id, plan_id, plan_revision, section, context_id, context_label, label, origin, source_ref, status, position, created_at, completed_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, NULL, ?) ON CONFLICT(scope_id, item_id) DO UPDATE SET plan_revision = excluded.plan_revision, label = excluded.label, section = excluded.section, context_id = excluded.context_id, context_label = excluded.context_label, position = excluded.position, updated_at = excluded.updated_at").bind(scopeId, itemId, guard.planId, guard.revision, guard.section, guard.contextId, guard.contextLabel, item.label, origin, sourceRef, position, now, now),
        receiptStatement(db, scopeId, guard.key, hash, payload, now),
      ]);
      return respond(201, payload);
    }
    if (checklistMatch) {
      const status: ChecklistStatus | null = body.status === "open" || body.status === "done" ? body.status : null;
      if (!status) return respond(422, { ok: false, code: "CHECKLIST_STATUS_INVALID", ...(await listWork(db, scopeId, guard.planId, head.revision)), acceptedStateChanged: false });
      const existing = await db.prepare("SELECT item_id, plan_id, plan_revision, section, context_id, context_label, label, origin, source_ref, status, position, created_at, completed_at, updated_at FROM plan_checklist_items WHERE scope_id = ? AND item_id = ? AND plan_id = ?").bind(scopeId, targetId, guard.planId).first<ChecklistRow>();
      if (!existing) return respond(404, { ok: false, code: "CHECKLIST_ITEM_NOT_FOUND", ...(await listWork(db, scopeId, guard.planId, head.revision)), acceptedStateChanged: false });
      const completedAt = status === "done" ? existing.completed_at ?? now : null;
      const item = toChecklist({ ...existing, status, completed_at: completedAt, updated_at: now }, head.revision);
      const current = await listWork(db, scopeId, guard.planId, head.revision);
      const payload = { ok: true, code: status === "done" ? "CHECKLIST_ITEM_DONE" : "CHECKLIST_ITEM_REOPENED", item, checklist: current.checklist.map((entry) => entry.itemId === targetId ? item : entry), attachments: current.attachments, acceptedStateChanged: false as const };
      await db.batch([
        db.prepare("UPDATE plan_checklist_items SET status = ?, completed_at = ?, updated_at = ? WHERE scope_id = ? AND item_id = ? AND plan_id = ?").bind(status, completedAt, now, scopeId, targetId, guard.planId),
        receiptStatement(db, scopeId, guard.key, hash, payload, now),
      ]);
      return respond(200, payload);
    }
    if (attachmentProcessing) {
      const validation = validateAttachmentProcessing({ status: body.status, summary: body.summary, derivedRefs: body.derivedRefs });
      if (!validation.ok) return respond(422, { ok: false, code: "ATTACHMENT_PROCESSING_INVALID", ...(await listWork(db, scopeId, guard.planId, head.revision)), issues: validation.issues, acceptedStateChanged: false });
      const existing = await db.prepare(`SELECT ${attachmentColumns} FROM plan_attachments WHERE scope_id = ? AND attachment_id = ? AND plan_id = ? AND status = 'active'`).bind(scopeId, targetId, guard.planId).first<AttachmentRow>();
      if (!existing) return respond(404, { ok: false, code: "PLAN_ATTACHMENT_NOT_FOUND", ...(await listWork(db, scopeId, guard.planId, head.revision)), acceptedStateChanged: false });
      if (existing.attachment_role !== "source") return respond(409, { ok: false, code: "ATTACHMENT_IS_AGENT_OUTPUT", attachment: toAttachment(existing, head.revision), ...(await listWork(db, scopeId, guard.planId, head.revision)), acceptedStateChanged: false });
      const processedAt = validation.status === "processed" || validation.status === "needs_review" ? now : null;
      const updated: AttachmentRow = { ...existing, processing_status: validation.status, processing_summary: validation.summary || null, derived_refs_json: JSON.stringify(validation.derivedRefs), processed_by: guard.source, processed_at: processedAt, updated_at: now };
      const attachment = toAttachment(updated, head.revision);
      const current = await listWork(db, scopeId, guard.planId, head.revision);
      const payload = { ok: true, code: "PLAN_ATTACHMENT_PROCESSING_UPDATED", attachment, checklist: current.checklist, attachments: current.attachments.map((entry) => entry.attachmentId === targetId ? attachment : entry), acceptedStateChanged: false as const };
      await db.batch([
        db.prepare("UPDATE plan_attachments SET processing_status = ?, processing_summary = ?, derived_refs_json = ?, processed_by = ?, processed_at = ?, updated_at = ? WHERE scope_id = ? AND attachment_id = ? AND plan_id = ?").bind(validation.status, validation.summary || null, JSON.stringify(validation.derivedRefs), guard.source, processedAt, now, scopeId, targetId, guard.planId),
        receiptStatement(db, scopeId, guard.key, hash, payload, now),
      ]);
      return respond(200, payload);
    }
    if (url.pathname === "/api/plan-work/attachments") {
      const validation = validateAttachmentText({ kind: body.kind, label: body.label, value: body.value });
      const role = validateAttachmentRole(body.attachmentRole ?? "source");
      if (!validation.ok || !role.ok) return respond(422, { ok: false, code: "PLAN_ATTACHMENT_INVALID", ...(await listWork(db, scopeId, guard.planId, head.revision)), issues: [...(!validation.ok ? validation.issues : []), ...(!role.ok ? role.issues : [])], acceptedStateChanged: false });
      const attachmentId = await deterministicId("attachment", scopeId, guard.key, hash);
      const processingStatus: AttachmentProcessingStatus = role.role === "source" ? "unread" : "not_applicable";
      const attachment: PlanAttachment = { attachmentId, planId: guard.planId, planRevision: guard.revision, section: guard.section, contextId: guard.contextId, contextLabel: guard.contextLabel, kind: validation.kind, label: validation.label, noteText: validation.kind === "note" ? validation.value : null, linkUrl: validation.kind === "link" ? validation.value : null, fileName: null, contentType: null, sizeBytes: null, contentUrl: null, sourceSurface: guard.source, attachmentRole: role.role, processingStatus, processingSummary: null, derivedRefs: [], processedBy: null, processedAt: null, createdAt: now, updatedAt: now, baseCurrent: true };
      const current = await listWork(db, scopeId, guard.planId, head.revision);
      const payload = { ok: true, code: "PLAN_ATTACHMENT_ADDED", attachment, checklist: current.checklist, attachments: [attachment, ...current.attachments.filter(({ attachmentId: currentId }) => currentId !== attachmentId)], acceptedStateChanged: false as const };
      await db.batch([
        db.prepare("INSERT INTO plan_attachments (scope_id, attachment_id, plan_id, plan_revision, section, context_id, context_label, kind, label, note_text, link_url, object_key, file_name, content_type, size_bytes, source_surface, attachment_role, processing_status, processing_summary, derived_refs_json, processed_by, processed_at, status, created_at, updated_at, removed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?, ?, NULL, '[]', NULL, NULL, 'active', ?, ?, NULL) ON CONFLICT(scope_id, attachment_id) DO UPDATE SET plan_revision = excluded.plan_revision, section = excluded.section, context_id = excluded.context_id, context_label = excluded.context_label, kind = excluded.kind, label = excluded.label, note_text = excluded.note_text, link_url = excluded.link_url, source_surface = excluded.source_surface, attachment_role = excluded.attachment_role, processing_status = excluded.processing_status, status = 'active', updated_at = excluded.updated_at, removed_at = NULL").bind(scopeId, attachmentId, guard.planId, guard.revision, guard.section, guard.contextId, guard.contextLabel, attachment.kind, attachment.label, attachment.noteText, attachment.linkUrl, guard.source, role.role, processingStatus, now, now),
        receiptStatement(db, scopeId, guard.key, hash, payload, now),
      ]);
      return respond(201, payload);
    }
    if (attachmentRemove) {
      const existing = await db.prepare("SELECT object_key FROM plan_attachments WHERE scope_id = ? AND attachment_id = ? AND plan_id = ? AND status = 'active'").bind(scopeId, targetId, guard.planId).first<{ object_key: string | null }>();
      if (!existing) return respond(404, { ok: false, code: "PLAN_ATTACHMENT_NOT_FOUND", ...(await listWork(db, scopeId, guard.planId, head.revision)), acceptedStateChanged: false });
      if (existing.object_key && !files) return respond(503, { ok: false, code: "FILE_STORAGE_UNAVAILABLE", ...(await listWork(db, scopeId, guard.planId, head.revision)), acceptedStateChanged: false });
      const existingOperation = await db.prepare("SELECT request_hash, operation_kind, attachment_id, plan_id, object_key, status FROM plan_file_operations WHERE scope_id = ? AND idempotency_key = ?")
        .bind(scopeId, guard.key).first<FileOperationRow>();
      if (existingOperation && (existingOperation.request_hash !== hash || existingOperation.operation_kind !== "delete")) return respond(409, { ok: false, code: "IDEMPOTENCY_KEY_REUSED", checklist: [], attachments: [], acceptedStateChanged: false });
      if (!existingOperation) {
        await db.batch([db.prepare("INSERT INTO plan_file_operations (scope_id, idempotency_key, request_hash, operation_kind, attachment_id, plan_id, object_key, status, created_at, updated_at, completed_at) VALUES (?, ?, ?, 'delete', ?, ?, ?, 'pending', ?, ?, NULL)")
          .bind(scopeId, guard.key, hash, targetId, guard.planId, existing.object_key, now, now)]);
      }
      if (existing.object_key && files) await files.delete(existing.object_key);
      const current = await listWork(db, scopeId, guard.planId, head.revision);
      const payload = { ok: true, code: "PLAN_ATTACHMENT_REMOVED", checklist: current.checklist, attachments: current.attachments.filter(({ attachmentId }) => attachmentId !== targetId), acceptedStateChanged: false as const };
      await db.batch([
        db.prepare("UPDATE plan_attachments SET status = 'removed', removed_at = ?, updated_at = ? WHERE scope_id = ? AND attachment_id = ? AND plan_id = ?").bind(now, now, scopeId, targetId, guard.planId),
        receiptStatement(db, scopeId, guard.key, hash, payload, now),
        db.prepare("UPDATE plan_file_operations SET status = 'completed', updated_at = ?, completed_at = ? WHERE scope_id = ? AND idempotency_key = ?").bind(now, now, scopeId, guard.key),
      ]);
      return respond(200, payload);
    }
    return respond(404, { ok: false, code: "PLAN_WORK_ROUTE_NOT_FOUND", checklist: [], attachments: [], acceptedStateChanged: false });
  } catch (error) {
    if (error instanceof SyntaxError || (error instanceof Error && error.message.startsWith("PLAN_WORK_"))) return respond(400, { ok: false, code: "PLAN_WORK_REQUEST_INVALID", checklist: [], attachments: [], acceptedStateChanged: false });
    return respond(500, { ok: false, code: "PLAN_WORK_SERVICE_FAILED", checklist: [], attachments: [], message: "Finite could not confirm the outcome. Retry the same action so its idempotency key can safely recover it.", retryWithSameIdempotencyKey: true, acceptedStateChanged: false });
  }
};
