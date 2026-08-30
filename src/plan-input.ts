export type PlanInputKind = "decision" | "update" | "question";
export type PlanInputSection = "general" | "timeline" | "money" | "boundaries";
export type PlanInputMode = "direct" | "codex";
export type PlanInputStatus = "open" | "handled";
export type PlanInputSource = "site" | "codex";

export interface PlanInputRecord {
  inputId: string;
  planId: string;
  planRevision: number;
  kind: PlanInputKind;
  mode: PlanInputMode;
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
  add(input: { planId: string; expectedRevision: number; kind: PlanInputKind; mode: PlanInputMode; section: PlanInputSection; contextId?: string | null; contextLabel?: string | null; message: string; idempotencyKey: string; sourceSurface: PlanInputSource }, context?: { signal?: AbortSignal }): Promise<PlanInputResult>;
  update(input: { inputId: string; planId: string; expectedRevision: number; kind: PlanInputKind; mode: PlanInputMode; section: PlanInputSection; contextId?: string | null; contextLabel?: string | null; message: string; idempotencyKey: string; sourceSurface: PlanInputSource }, context?: { signal?: AbortSignal }): Promise<PlanInputResult>;
  resolve(input: { inputId: string; planId: string; expectedRevision: number; idempotencyKey: string; sourceSurface: PlanInputSource }, context?: { signal?: AbortSignal }): Promise<PlanInputResult>;
}

export const planInputKinds: PlanInputKind[] = ["decision", "update", "question"];
export const planInputModes: PlanInputMode[] = ["direct", "codex"];
export const planInputSections: PlanInputSection[] = ["general", "timeline", "money", "boundaries"];

export const validatePlanInput = (input: { kind: unknown; mode: unknown; section: unknown; contextId?: unknown; contextLabel?: unknown; message: unknown }): { ok: true; value: { kind: PlanInputKind; mode: PlanInputMode; section: PlanInputSection; contextId: string | null; contextLabel: string | null; message: string } } | { ok: false; issues: string[] } => {
  const issues: string[] = [];
  const kind = typeof input.kind === "string" && planInputKinds.includes(input.kind as PlanInputKind) ? input.kind as PlanInputKind : null;
  const mode = typeof input.mode === "string" && planInputModes.includes(input.mode as PlanInputMode) ? input.mode as PlanInputMode : null;
  const section = typeof input.section === "string" && planInputSections.includes(input.section as PlanInputSection) ? input.section as PlanInputSection : null;
  const message = typeof input.message === "string" ? input.message.trim() : "";
  const contextId = typeof input.contextId === "string" && input.contextId.trim() ? input.contextId.trim() : null;
  const contextLabel = typeof input.contextLabel === "string" && input.contextLabel.trim() ? input.contextLabel.trim() : null;
  if (!kind) issues.push("Choose whether this is a decision, update, or question.");
  if (!mode) issues.push("Choose whether to save this yourself or ask Codex.");
  if (!section) issues.push("Choose where this belongs in the plan.");
  if (!message) issues.push("Describe what should be added to the plan.");
  if (Array.from(message).length > 2000) issues.push("Use 2,000 characters or fewer.");
  if (/\r|[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(message)) issues.push("Use ordinary text without control characters.");
  if (contextId && !/^[a-zA-Z0-9._:-]{1,100}$/.test(contextId)) issues.push("The selected plan area is invalid.");
  if (contextLabel && Array.from(contextLabel).length > 120) issues.push("The selected plan-area label is too long.");
  return issues.length || !kind || !mode || !section ? { ok: false, issues } : { ok: true, value: { kind, mode, section, contextId, contextLabel, message } };
};

const readJson = async (response: Response): Promise<PlanInputResult> => response.json() as Promise<PlanInputResult>;

export class HttpPlanInputRepository implements PlanInputRepository {
  constructor(private readonly baseUrl = "/api/plan-inputs") {}
  async list(input: { planId: string }, context: { signal?: AbortSignal } = {}): Promise<PlanInputResult> {
    const response = await fetch(`${this.baseUrl}?planId=${encodeURIComponent(input.planId)}`, { headers: { accept: "application/json" }, ...(context.signal ? { signal: context.signal } : {}) });
    return readJson(response);
  }
  async add(input: { planId: string; expectedRevision: number; kind: PlanInputKind; mode: PlanInputMode; section: PlanInputSection; contextId?: string | null; contextLabel?: string | null; message: string; idempotencyKey: string; sourceSurface: PlanInputSource }, context: { signal?: AbortSignal } = {}): Promise<PlanInputResult> {
    const response = await fetch(this.baseUrl, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(input), ...(context.signal ? { signal: context.signal } : {}) });
    return readJson(response);
  }
  async update(input: { inputId: string; planId: string; expectedRevision: number; kind: PlanInputKind; mode: PlanInputMode; section: PlanInputSection; contextId?: string | null; contextLabel?: string | null; message: string; idempotencyKey: string; sourceSurface: PlanInputSource }, context: { signal?: AbortSignal } = {}): Promise<PlanInputResult> {
    const response = await fetch(`${this.baseUrl}/${encodeURIComponent(input.inputId)}`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(input), ...(context.signal ? { signal: context.signal } : {}) });
    return readJson(response);
  }
  async resolve(input: { inputId: string; planId: string; expectedRevision: number; idempotencyKey: string; sourceSurface: PlanInputSource }, context: { signal?: AbortSignal } = {}): Promise<PlanInputResult> {
    const response = await fetch(`${this.baseUrl}/${encodeURIComponent(input.inputId)}/resolve`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(input), ...(context.signal ? { signal: context.signal } : {}) });
    return readJson(response);
  }
}

export class BrowserPlanInputRepository implements PlanInputRepository {
  constructor(private readonly storage: StoragePort, private readonly key = "finite-plan.local-inputs.v1", private readonly now: () => Date = () => new Date()) {}
  private read(): PlanInputRecord[] { try { const value = JSON.parse(this.storage.getItem(this.key) ?? "[]"); return Array.isArray(value) ? value : []; } catch { return []; } }
  private write(inputs: PlanInputRecord[]): void { this.storage.setItem(this.key, JSON.stringify(inputs)); }
  private result(code: string, inputs: PlanInputRecord[], input?: PlanInputRecord, issues?: string[]): PlanInputResult { return { ok: !issues?.length, code, inputs, ...(input ? { input } : {}), ...(issues?.length ? { issues } : {}), acceptedStateChanged: false }; }
  async list({ planId }: { planId: string }): Promise<PlanInputResult> { return this.result("PLAN_INPUTS_LISTED_LOCAL", this.read().filter((item) => item.planId === planId)); }
  async add(input: Parameters<PlanInputRepository["add"]>[0]): Promise<PlanInputResult> {
    const validation = validatePlanInput(input);
    if (!validation.ok) return this.result("PLAN_INPUT_INVALID", this.read().filter((item) => item.planId === input.planId), undefined, validation.issues);
    const inputs = this.read(); const createdAt = this.now().toISOString();
    const record: PlanInputRecord = { inputId: `plan_input_${crypto.randomUUID().replaceAll("-", "")}`, planId: input.planId, planRevision: input.expectedRevision, ...validation.value, status: "open", sourceSurface: input.sourceSurface, createdAt, handledAt: null, baseCurrent: true };
    inputs.push(record); this.write(inputs); return this.result("PLAN_INPUT_ADDED_LOCAL", inputs.filter((item) => item.planId === input.planId), record);
  }
  async update(input: Parameters<PlanInputRepository["update"]>[0]): Promise<PlanInputResult> {
    const validation = validatePlanInput(input); const inputs = this.read(); const index = inputs.findIndex((item) => item.inputId === input.inputId && item.planId === input.planId && item.status === "open");
    if (!validation.ok || index < 0) return this.result(index < 0 ? "PLAN_INPUT_NOT_FOUND" : "PLAN_INPUT_INVALID", inputs.filter((item) => item.planId === input.planId), undefined, validation.ok ? undefined : validation.issues);
    const record: PlanInputRecord = { ...inputs[index]!, ...validation.value, planRevision: input.expectedRevision, sourceSurface: input.sourceSurface, baseCurrent: true }; inputs[index] = record;
    this.write(inputs); return this.result("PLAN_INPUT_UPDATED_LOCAL", inputs.filter((item) => item.planId === input.planId), record);
  }
  async resolve(input: Parameters<PlanInputRepository["resolve"]>[0]): Promise<PlanInputResult> {
    const inputs = this.read(); const index = inputs.findIndex((item) => item.inputId === input.inputId && item.planId === input.planId);
    if (index < 0) return this.result("PLAN_INPUT_NOT_FOUND", inputs.filter((item) => item.planId === input.planId));
    const current = inputs[index]!; const record: PlanInputRecord = { ...current, status: "handled", handledAt: current.handledAt ?? this.now().toISOString(), planRevision: input.expectedRevision, baseCurrent: true }; inputs[index] = record;
    this.write(inputs); return this.result("PLAN_INPUT_HANDLED_LOCAL", inputs.filter((item) => item.planId === input.planId), record);
  }
}
import type { StoragePort } from "./persistence.js";
