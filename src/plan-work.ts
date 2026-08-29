import type { PlanInputSection } from "./plan-input.js";

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

export class HttpPlanWorkRepository {
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
