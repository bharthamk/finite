export type PlanInputKind = "decision" | "update" | "question";
export type PlanInputSection = "general" | "timeline" | "money" | "boundaries";
export type PlanInputStatus = "open" | "handled";
export type PlanInputSource = "site" | "codex";

export interface PlanInputRecord {
  inputId: string;
  planId: string;
  planRevision: number;
  kind: PlanInputKind;
  section: PlanInputSection;
  contextId: string | null;
  contextLabel: string | null;
  message: string;
  status: PlanInputStatus;
  sourceSurface: PlanInputSource;
  createdAt: string;
  handledAt: string | null;
  baseCurrent: boolean;
}

export interface PlanInputResult extends Record<string, unknown> {
  ok: boolean;
  code: string;
  inputs: PlanInputRecord[];
  input?: PlanInputRecord;
  acceptedStateChanged: false;
  message?: string;
  issues?: string[];
}

export interface PlanInputRepository {
  list(input: { planId: string }, context?: { signal?: AbortSignal }): Promise<PlanInputResult>;
  add(input: { planId: string; expectedRevision: number; kind: PlanInputKind; section: PlanInputSection; contextId?: string | null; contextLabel?: string | null; message: string; idempotencyKey: string; sourceSurface: PlanInputSource }, context?: { signal?: AbortSignal }): Promise<PlanInputResult>;
  resolve(input: { inputId: string; planId: string; expectedRevision: number; idempotencyKey: string; sourceSurface: PlanInputSource }, context?: { signal?: AbortSignal }): Promise<PlanInputResult>;
}

export const planInputKinds: PlanInputKind[] = ["decision", "update", "question"];
export const planInputSections: PlanInputSection[] = ["general", "timeline", "money", "boundaries"];

export const validatePlanInput = (input: { kind: unknown; section: unknown; contextId?: unknown; contextLabel?: unknown; message: unknown }): { ok: true; value: { kind: PlanInputKind; section: PlanInputSection; contextId: string | null; contextLabel: string | null; message: string } } | { ok: false; issues: string[] } => {
  const issues: string[] = [];
  const kind = typeof input.kind === "string" && planInputKinds.includes(input.kind as PlanInputKind) ? input.kind as PlanInputKind : null;
  const section = typeof input.section === "string" && planInputSections.includes(input.section as PlanInputSection) ? input.section as PlanInputSection : null;
  const message = typeof input.message === "string" ? input.message.trim() : "";
  const contextId = typeof input.contextId === "string" && input.contextId.trim() ? input.contextId.trim() : null;
  const contextLabel = typeof input.contextLabel === "string" && input.contextLabel.trim() ? input.contextLabel.trim() : null;
  if (!kind) issues.push("Choose whether this is a decision, update, or question.");
  if (!section) issues.push("Choose where this belongs in the plan.");
  if (!message) issues.push("Describe what should be added to the plan.");
  if (Array.from(message).length > 2000) issues.push("Use 2,000 characters or fewer.");
  if (/\r|[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(message)) issues.push("Use ordinary text without control characters.");
  if (contextId && !/^[a-zA-Z0-9._:-]{1,100}$/.test(contextId)) issues.push("The selected plan area is invalid.");
  if (contextLabel && Array.from(contextLabel).length > 120) issues.push("The selected plan-area label is too long.");
  return issues.length || !kind || !section ? { ok: false, issues } : { ok: true, value: { kind, section, contextId, contextLabel, message } };
};

const readJson = async (response: Response): Promise<PlanInputResult> => response.json() as Promise<PlanInputResult>;

export class HttpPlanInputRepository implements PlanInputRepository {
  constructor(private readonly baseUrl = "/api/plan-inputs") {}
  async list(input: { planId: string }, context: { signal?: AbortSignal } = {}): Promise<PlanInputResult> {
    const response = await fetch(`${this.baseUrl}?planId=${encodeURIComponent(input.planId)}`, { headers: { accept: "application/json" }, ...(context.signal ? { signal: context.signal } : {}) });
    return readJson(response);
  }
  async add(input: { planId: string; expectedRevision: number; kind: PlanInputKind; section: PlanInputSection; contextId?: string | null; contextLabel?: string | null; message: string; idempotencyKey: string; sourceSurface: PlanInputSource }, context: { signal?: AbortSignal } = {}): Promise<PlanInputResult> {
    const response = await fetch(this.baseUrl, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(input), ...(context.signal ? { signal: context.signal } : {}) });
    return readJson(response);
  }
  async resolve(input: { inputId: string; planId: string; expectedRevision: number; idempotencyKey: string; sourceSurface: PlanInputSource }, context: { signal?: AbortSignal } = {}): Promise<PlanInputResult> {
    const response = await fetch(`${this.baseUrl}/${encodeURIComponent(input.inputId)}/resolve`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(input), ...(context.signal ? { signal: context.signal } : {}) });
    return readJson(response);
  }
}
