import type { PlanInputSection } from "./plan-input.js";
import type { StoragePort } from "./persistence.js";

export type ChecklistOrigin = "adaptive" | "human" | "codex";
export type ChecklistStatus = "open" | "done";
export type AttachmentKind = "file" | "image" | "link" | "note";
export type AttachmentRole = "source" | "output";
export type AttachmentProcessingStatus = "unread" | "in_progress" | "processed" | "needs_review" | "not_applicable";

export interface ChecklistItem {
  itemId: string;
  planId: string;
  planRevision: number;
  section: PlanInputSection;
  contextId: string | null;
  contextLabel: string | null;
  label: string;
  origin: ChecklistOrigin;
  sourceRef: string | null;
  status: ChecklistStatus;
  position: number;
  createdAt: string;
  completedAt: string | null;
  updatedAt: string;
  baseCurrent: boolean;
}

export interface PlanAttachment {
  attachmentId: string;
  planId: string;
  planRevision: number;
  section: PlanInputSection;
  contextId: string | null;
  contextLabel: string | null;
  kind: AttachmentKind;
  label: string;
  noteText: string | null;
  linkUrl: string | null;
  fileName: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  contentUrl: string | null;
  sourceSurface: "site" | "codex";
  attachmentRole: AttachmentRole;
  processingStatus: AttachmentProcessingStatus;
  processingSummary: string | null;
  derivedRefs: string[];
  processedBy: "site" | "codex" | null;
  processedAt: string | null;
  createdAt: string;
  updatedAt: string;
  baseCurrent: boolean;
}

export interface PlanWorkResult extends Record<string, unknown> {
  ok: boolean;
  code: string;
  checklist: ChecklistItem[];
  attachments: PlanAttachment[];
  item?: ChecklistItem;
  attachment?: PlanAttachment;
  issues?: string[];
  message?: string;
  acceptedStateChanged: false;
}

export interface PlanAttachmentReadResult extends Record<string, unknown> {
  ok: boolean;
  code: string;
  attachment?: PlanAttachment;
  content?: string | null;
  contentMode?: "text" | "link" | "binary";
  offset?: number;
  nextOffset?: number | null;
  truncated?: boolean;
  issues?: string[];
  message?: string;
  acceptedStateChanged: false;
}

export interface PlanWorkRepository {
  list(planId: string, context?: { signal?: AbortSignal }): Promise<PlanWorkResult>;
  readAttachment(input: { attachmentId: string; planId: string; offset?: number; maxChars?: number }, context?: { signal?: AbortSignal }): Promise<PlanAttachmentReadResult>;
  setAttachmentProcessing(input: Record<string, unknown>, context?: { signal?: AbortSignal }): Promise<PlanWorkResult>;
  addChecklist(input: Record<string, unknown>, context?: { signal?: AbortSignal }): Promise<PlanWorkResult>;
  setChecklist(input: Record<string, unknown>, context?: { signal?: AbortSignal }): Promise<PlanWorkResult>;
  addTextAttachment(input: Record<string, unknown>, context?: { signal?: AbortSignal }): Promise<PlanWorkResult>;
  uploadAttachment(input: { planId: string; expectedRevision: number; section: PlanInputSection; contextId: string | null; contextLabel: string | null; attachmentRole: AttachmentRole; file: File; idempotencyKey: string }, context?: { signal?: AbortSignal }): Promise<PlanWorkResult>;
  removeAttachment(input: Record<string, unknown>, context?: { signal?: AbortSignal }): Promise<PlanWorkResult>;
}

export const validateChecklistLabel = (value: unknown): { ok: true; label: string } | { ok: false; issues: string[] } => {
  const label = typeof value === "string" ? value.trim() : "";
  const issues: string[] = [];
  if (!label) issues.push("Add something to do.");
  if (Array.from(label).length > 240) issues.push("Use 240 characters or fewer.");
  if (/\r|[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(label)) issues.push("Use ordinary text without control characters.");
  return issues.length ? { ok: false, issues } : { ok: true, label };
};

export const validateAttachmentText = (input: { kind: unknown; label: unknown; value: unknown }): { ok: true; kind: "link" | "note"; label: string; value: string } | { ok: false; issues: string[] } => {
  const kind = input.kind === "link" || input.kind === "note" ? input.kind : null;
  const label = typeof input.label === "string" ? input.label.trim() : "";
  const value = typeof input.value === "string" ? input.value.trim() : "";
  const issues: string[] = [];
  if (!kind) issues.push("Choose a link or note.");
  if (!value) issues.push(kind === "link" ? "Add a web address." : "Add a note.");
  if (Array.from(label).length > 160) issues.push("Use a shorter name.");
  if (Array.from(value).length > (kind === "note" ? 5000 : 2000)) issues.push(kind === "note" ? "Use 5,000 characters or fewer." : "Use a shorter web address.");
  if (kind === "link" && value) {
    try { const url = new URL(value); if (!['http:', 'https:'].includes(url.protocol)) issues.push("Use an http or https link."); }
    catch { issues.push("Enter a complete web address."); }
  }
  return issues.length || !kind ? { ok: false, issues } : { ok: true, kind, label: label || (kind === "link" ? new URL(value).hostname : "Note"), value };
};

export const validateAttachmentRole = (value: unknown): { ok: true; role: AttachmentRole } | { ok: false; issues: string[] } => value === "source" || value === "output"
  ? { ok: true, role: value }
  : { ok: false, issues: ["Choose source material or agent output."] };

export const validateAttachmentProcessing = (input: { status: unknown; summary: unknown; derivedRefs: unknown }): { ok: true; status: Exclude<AttachmentProcessingStatus, "unread" | "not_applicable">; summary: string; derivedRefs: string[] } | { ok: false; issues: string[] } => {
  const status = input.status === "in_progress" || input.status === "processed" || input.status === "needs_review" ? input.status : null;
  const summary = typeof input.summary === "string" ? input.summary.trim() : "";
  const refs = Array.isArray(input.derivedRefs) ? input.derivedRefs.map((value) => typeof value === "string" ? value.trim() : "").filter(Boolean) : [];
  const issues: string[] = [];
  if (!status) issues.push("Choose processing, processed, or needs review.");
  if ((status === "processed" || status === "needs_review") && !summary) issues.push("Add a concise processing summary.");
  if (Array.from(summary).length > 2000) issues.push("Use 2,000 characters or fewer.");
  if (refs.length > 24 || refs.some((value) => !/^[a-zA-Z0-9._:-]{3,200}$/u.test(value))) issues.push("Use up to 24 valid derived record references.");
  return issues.length || !status ? { ok: false, issues } : { ok: true, status, summary, derivedRefs: [...new Set(refs)] };
};

const readResult = async (response: Response): Promise<PlanWorkResult> => response.json() as Promise<PlanWorkResult>;

export class HttpPlanWorkRepository implements PlanWorkRepository {
  constructor(private readonly baseUrl = "/api/plan-work") {}
  list(planId: string, context: { signal?: AbortSignal } = {}): Promise<PlanWorkResult> {
    return fetch(`${this.baseUrl}?planId=${encodeURIComponent(planId)}`, { headers: { accept: "application/json" }, ...(context.signal ? { signal: context.signal } : {}) }).then(readResult);
  }
  readAttachment(input: { attachmentId: string; planId: string; offset?: number; maxChars?: number }, context: { signal?: AbortSignal } = {}): Promise<PlanAttachmentReadResult> {
    const query = new URLSearchParams({ planId: input.planId, offset: String(input.offset ?? 0), maxChars: String(input.maxChars ?? 12000) });
    return fetch(`${this.baseUrl}/attachments/${encodeURIComponent(input.attachmentId)}/read?${query}`, { headers: { accept: "application/json" }, ...(context.signal ? { signal: context.signal } : {}) }).then((response) => response.json() as Promise<PlanAttachmentReadResult>);
  }
  setAttachmentProcessing(input: Record<string, unknown>, context: { signal?: AbortSignal } = {}): Promise<PlanWorkResult> {
    return fetch(`${this.baseUrl}/attachments/${encodeURIComponent(String(input.attachmentId ?? ""))}/processing`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(input), ...(context.signal ? { signal: context.signal } : {}) }).then(readResult);
  }
  addChecklist(input: Record<string, unknown>, context: { signal?: AbortSignal } = {}): Promise<PlanWorkResult> {
    return fetch(`${this.baseUrl}/checklist`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(input), ...(context.signal ? { signal: context.signal } : {}) }).then(readResult);
  }
  setChecklist(input: Record<string, unknown>, context: { signal?: AbortSignal } = {}): Promise<PlanWorkResult> {
    return fetch(`${this.baseUrl}/checklist/${encodeURIComponent(String(input.itemId ?? ""))}`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(input), ...(context.signal ? { signal: context.signal } : {}) }).then(readResult);
  }
  addTextAttachment(input: Record<string, unknown>, context: { signal?: AbortSignal } = {}): Promise<PlanWorkResult> {
    return fetch(`${this.baseUrl}/attachments`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(input), ...(context.signal ? { signal: context.signal } : {}) }).then(readResult);
  }
  uploadAttachment(input: { planId: string; expectedRevision: number; section: PlanInputSection; contextId: string | null; contextLabel: string | null; attachmentRole: AttachmentRole; file: File; idempotencyKey: string }, context: { signal?: AbortSignal } = {}): Promise<PlanWorkResult> {
    const body = new FormData();
    body.set("planId", input.planId); body.set("expectedRevision", String(input.expectedRevision)); body.set("section", input.section);
    if (input.contextId) body.set("contextId", input.contextId); if (input.contextLabel) body.set("contextLabel", input.contextLabel);
    body.set("idempotencyKey", input.idempotencyKey); body.set("sourceSurface", "site"); body.set("attachmentRole", input.attachmentRole); body.set("file", input.file);
    return fetch(`${this.baseUrl}/attachments/upload`, { method: "POST", headers: { accept: "application/json" }, body, ...(context.signal ? { signal: context.signal } : {}) }).then(readResult);
  }
  removeAttachment(input: Record<string, unknown>, context: { signal?: AbortSignal } = {}): Promise<PlanWorkResult> {
    return fetch(`${this.baseUrl}/attachments/${encodeURIComponent(String(input.attachmentId ?? ""))}/remove`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(input), ...(context.signal ? { signal: context.signal } : {}) }).then(readResult);
  }
}

export class BrowserPlanWorkRepository implements PlanWorkRepository {
  constructor(private readonly storage: StoragePort, private readonly key = "finite-plan.local-work.v1", private readonly now: () => Date = () => new Date()) {}
  private read(): { checklist: ChecklistItem[]; attachments: PlanAttachment[] } { try { const value = JSON.parse(this.storage.getItem(this.key) ?? "null"); return { checklist: Array.isArray(value?.checklist) ? value.checklist : [], attachments: Array.isArray(value?.attachments) ? value.attachments : [] }; } catch { return { checklist: [], attachments: [] }; } }
  private write(value: { checklist: ChecklistItem[]; attachments: PlanAttachment[] }): void { this.storage.setItem(this.key, JSON.stringify(value)); }
  private result(code: string, planId: string, value = this.read(), extra: Partial<PlanWorkResult> = {}): PlanWorkResult { return { ok: true, code, checklist: value.checklist.filter((item) => item.planId === planId), attachments: value.attachments.filter((item) => item.planId === planId), acceptedStateChanged: false, ...extra }; }
  async list(planId: string): Promise<PlanWorkResult> { return this.result("PLAN_WORK_LISTED_LOCAL", planId); }
  async readAttachment(input: { attachmentId: string; planId: string; offset?: number; maxChars?: number }): Promise<PlanAttachmentReadResult> {
    const item = this.read().attachments.find((attachment) => attachment.attachmentId === input.attachmentId && attachment.planId === input.planId);
    if (!item) return { ok: false, code: "PLAN_ATTACHMENT_NOT_FOUND", acceptedStateChanged: false };
    const content = item.kind === "note" ? item.noteText : item.kind === "link" ? item.linkUrl : null; const offset = input.offset ?? 0; const max = input.maxChars ?? 12000; const slice = content?.slice(offset, offset + max) ?? null;
    return { ok: true, code: "PLAN_ATTACHMENT_READ_LOCAL", attachment: item, content: slice, contentMode: item.kind === "note" ? "text" : item.kind === "link" ? "link" : "binary", offset, nextOffset: content && offset + max < content.length ? offset + max : null, truncated: Boolean(content && offset + max < content.length), acceptedStateChanged: false };
  }
  async addChecklist(input: Record<string, unknown>): Promise<PlanWorkResult> {
    const planId = String(input.planId ?? ""); const validation = validateChecklistLabel(input.label); const value = this.read();
    if (!validation.ok) return { ...this.result("CHECKLIST_ITEM_INVALID", planId, value), ok: false, issues: validation.issues };
    const now = this.now().toISOString(); const sourceRef = typeof input.sourceRef === "string" ? input.sourceRef : null; const existing = sourceRef ? value.checklist.find((item) => item.planId === planId && item.sourceRef === sourceRef) : null;
    const item: ChecklistItem = existing ? { ...existing, label: validation.label, planRevision: Number(input.expectedRevision ?? existing.planRevision), position: Number(input.position ?? existing.position), updatedAt: now, baseCurrent: true } : { itemId: `check_${crypto.randomUUID().replaceAll("-", "")}`, planId, planRevision: Number(input.expectedRevision ?? 1), section: String(input.section ?? "general") as PlanInputSection, contextId: typeof input.contextId === "string" ? input.contextId : null, contextLabel: typeof input.contextLabel === "string" ? input.contextLabel : null, label: validation.label, origin: ["adaptive", "human", "codex"].includes(String(input.origin)) ? input.origin as ChecklistOrigin : "human", sourceRef, status: "open", position: Number(input.position ?? value.checklist.filter((entry) => entry.planId === planId).length), createdAt: now, completedAt: null, updatedAt: now, baseCurrent: true };
    if (existing) value.checklist[value.checklist.indexOf(existing)] = item; else value.checklist.push(item); this.write(value); return this.result(existing ? "CHECKLIST_ITEM_UPDATED_LOCAL" : "CHECKLIST_ITEM_ADDED_LOCAL", planId, value, { item });
  }
  async setChecklist(input: Record<string, unknown>): Promise<PlanWorkResult> {
    const planId = String(input.planId ?? ""); const value = this.read(); const index = value.checklist.findIndex((item) => item.itemId === input.itemId && item.planId === planId); if (index < 0) return { ...this.result("CHECKLIST_ITEM_NOT_FOUND", planId, value), ok: false };
    const current = value.checklist[index]!; const now = this.now().toISOString(); const status = input.status === "done" ? "done" : "open"; const item: ChecklistItem = { ...current, status, completedAt: status === "done" ? now : null, updatedAt: now, planRevision: Number(input.expectedRevision ?? current.planRevision), baseCurrent: true }; value.checklist[index] = item; this.write(value); return this.result("CHECKLIST_ITEM_SAVED_LOCAL", planId, value, { item });
  }
  async addTextAttachment(input: Record<string, unknown>): Promise<PlanWorkResult> {
    const planId = String(input.planId ?? ""); const validation = validateAttachmentText({ kind: input.kind, label: input.label, value: input.value }); const role = validateAttachmentRole(input.attachmentRole ?? "source"); const state = this.read();
    if (!validation.ok || !role.ok) return { ...this.result("PLAN_ATTACHMENT_INVALID", planId, state), ok: false, issues: [...(!validation.ok ? validation.issues : []), ...(!role.ok ? role.issues : [])] };
    const now = this.now().toISOString(); const attachment: PlanAttachment = { attachmentId: `attachment_${crypto.randomUUID().replaceAll("-", "")}`, planId, planRevision: Number(input.expectedRevision ?? 1), section: String(input.section ?? "general") as PlanInputSection, contextId: typeof input.contextId === "string" ? input.contextId : null, contextLabel: typeof input.contextLabel === "string" ? input.contextLabel : null, kind: validation.kind, label: validation.label, noteText: validation.kind === "note" ? validation.value : null, linkUrl: validation.kind === "link" ? validation.value : null, fileName: null, contentType: null, sizeBytes: null, contentUrl: null, sourceSurface: input.sourceSurface === "codex" ? "codex" : "site", attachmentRole: role.role, processingStatus: "unread", processingSummary: null, derivedRefs: [], processedBy: null, processedAt: null, createdAt: now, updatedAt: now, baseCurrent: true };
    state.attachments.push(attachment); this.write(state); return this.result("PLAN_ATTACHMENT_ADDED_LOCAL", planId, state, { attachment });
  }
  async uploadAttachment(input: { planId: string }): Promise<PlanWorkResult> { return { ...this.result("LOCAL_DEMO_FILE_UPLOAD_DISABLED", input.planId), ok: false, message: "Local Demo mode keeps text and links in this browser but does not retain uploaded files." }; }
  async setAttachmentProcessing(input: Record<string, unknown>): Promise<PlanWorkResult> {
    const planId = String(input.planId ?? ""); const state = this.read(); const index = state.attachments.findIndex((item) => item.attachmentId === input.attachmentId && item.planId === planId); if (index < 0) return { ...this.result("PLAN_ATTACHMENT_NOT_FOUND", planId, state), ok: false };
    const validation = validateAttachmentProcessing({ status: input.processingStatus ?? input.status, summary: input.processingSummary ?? input.summary, derivedRefs: input.derivedRefs }); if (!validation.ok) return { ...this.result("PLAN_ATTACHMENT_PROCESSING_INVALID", planId, state), ok: false, issues: validation.issues };
    const current = state.attachments[index]!; const now = this.now().toISOString(); const attachment: PlanAttachment = { ...current, processingStatus: validation.status, processingSummary: validation.summary, derivedRefs: validation.derivedRefs, processedBy: input.sourceSurface === "site" ? "site" : "codex", processedAt: now, updatedAt: now }; state.attachments[index] = attachment; this.write(state); return this.result("PLAN_ATTACHMENT_PROCESSING_SAVED_LOCAL", planId, state, { attachment });
  }
  async removeAttachment(input: Record<string, unknown>): Promise<PlanWorkResult> { const planId = String(input.planId ?? ""); const state = this.read(); const found = state.attachments.find((item) => item.attachmentId === input.attachmentId && item.planId === planId); state.attachments = state.attachments.filter((item) => item !== found); this.write(state); return this.result(found ? "PLAN_ATTACHMENT_REMOVED_LOCAL" : "PLAN_ATTACHMENT_NOT_FOUND", planId, state, found ? { attachment: found } : { ok: false }); }
}
