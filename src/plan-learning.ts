export type PlanLessonKind = "worked" | "changed" | "next_time";
export type ProfileMemoryKind = "preference" | "interest" | "constraint" | "working_pattern" | "avoid";
export type ProfileMemoryStatus = "proposed" | "accepted" | "rejected" | "retired";
export type ProfileMemoryAction = "accept" | "reject" | "retire" | "restore" | "update" | "delete";
export type LearningSource = "site" | "codex";

export interface PlanRetrospective {
  planId: string;
  planRevision: number;
  worked: string;
  changed: string;
  nextTime: string;
  updatedAt: string | null;
  baseCurrent: boolean;
}

export interface ProfileMemory {
  memoryId: string;
  family: string;
  kind: ProfileMemoryKind;
  statement: string;
  evidence: string;
  sourcePlanId: string;
  sourceSurface: LearningSource;
  status: ProfileMemoryStatus;
  createdAt: string;
  updatedAt: string;
  decidedAt: string | null;
}

export interface PlanLearningResult extends Record<string, unknown> {
  ok: boolean;
  code: string;
  retrospective: PlanRetrospective | null;
  memories: ProfileMemory[];
  memory?: ProfileMemory;
  acceptedStateChanged: false;
  message?: string;
  issues?: string[];
}

export const emptyRetrospective = (planId: string, planRevision: number): PlanRetrospective => ({
  planId,
  planRevision,
  worked: "",
  changed: "",
  nextTime: "",
  updatedAt: null,
  baseCurrent: true,
});

const cleanText = (value: unknown, max: number): string | null => {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (Array.from(text).length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text)) return null;
  return text;
};

export const validateRetrospective = (input: Record<string, unknown>): { ok: true; value: Pick<PlanRetrospective, "worked" | "changed" | "nextTime"> } | { ok: false; issues: string[] } => {
  const worked = cleanText(input.worked, 2000);
  const changed = cleanText(input.changed, 2000);
  const nextTime = cleanText(input.nextTime, 2000);
  const issues: string[] = [];
  if (worked === null || changed === null || nextTime === null) issues.push("Use ordinary text of 2,000 characters or fewer in each lesson.");
  if (worked === "" && changed === "" && nextTime === "") issues.push("Add at least one lesson from this plan.");
  return issues.length || worked === null || changed === null || nextTime === null ? { ok: false, issues } : { ok: true, value: { worked, changed, nextTime } };
};

export const validateProfileMemory = (input: Record<string, unknown>): { ok: true; value: { kind: ProfileMemoryKind; statement: string; evidence: string } } | { ok: false; issues: string[] } => {
  const kind = ["preference", "interest", "constraint", "working_pattern", "avoid"].includes(String(input.kind)) ? input.kind as ProfileMemoryKind : null;
  const statement = cleanText(input.statement, 500);
  const evidence = cleanText(input.evidence, 1000);
  const issues: string[] = [];
  if (!kind) issues.push("Choose what kind of thing this is.");
  if (!statement) issues.push("Add the concise thing Finite may remember.");
  if (statement === null || evidence === null) issues.push("Use ordinary bounded text.");
  if (!evidence) issues.push("Say what in this plan supports the memory.");
  return issues.length || !kind || !statement || evidence === null ? { ok: false, issues } : { ok: true, value: { kind, statement, evidence } };
};

const readResult = async (response: Response): Promise<PlanLearningResult> => response.json() as Promise<PlanLearningResult>;

export interface PlanLearningRepository {
  list(planId: string, context?: { signal?: AbortSignal }): Promise<PlanLearningResult>;
  listProfile(context?: { signal?: AbortSignal }): Promise<PlanLearningResult>;
  saveRetrospective(input: Record<string, unknown>, context?: { signal?: AbortSignal }): Promise<PlanLearningResult>;
  addMemory(input: Record<string, unknown>, context?: { signal?: AbortSignal }): Promise<PlanLearningResult>;
  addProfileMemory(input: Record<string, unknown>, context?: { signal?: AbortSignal }): Promise<PlanLearningResult>;
  decideMemory(input: Record<string, unknown>, context?: { signal?: AbortSignal }): Promise<PlanLearningResult>;
  changeProfileMemory(input: Record<string, unknown>, context?: { signal?: AbortSignal }): Promise<PlanLearningResult>;
}

export class HttpPlanLearningRepository implements PlanLearningRepository {
  constructor(private readonly baseUrl = "/api/plan-learning") {}
  list(planId: string, context: { signal?: AbortSignal } = {}): Promise<PlanLearningResult> {
    return fetch(`${this.baseUrl}?planId=${encodeURIComponent(planId)}`, { headers: { accept: "application/json" }, ...(context.signal ? { signal: context.signal } : {}) }).then(readResult);
  }
  listProfile(context: { signal?: AbortSignal } = {}): Promise<PlanLearningResult> {
    return fetch(`${this.baseUrl}/profile`, { headers: { accept: "application/json" }, ...(context.signal ? { signal: context.signal } : {}) }).then(readResult);
  }
  saveRetrospective(input: Record<string, unknown>, context: { signal?: AbortSignal } = {}): Promise<PlanLearningResult> {
    return fetch(`${this.baseUrl}/retrospective`, { method: "PUT", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(input), ...(context.signal ? { signal: context.signal } : {}) }).then(readResult);
  }
  addMemory(input: Record<string, unknown>, context: { signal?: AbortSignal } = {}): Promise<PlanLearningResult> {
    return fetch(`${this.baseUrl}/memories`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(input), ...(context.signal ? { signal: context.signal } : {}) }).then(readResult);
  }
  addProfileMemory(input: Record<string, unknown>, context: { signal?: AbortSignal } = {}): Promise<PlanLearningResult> {
    return fetch(`${this.baseUrl}/profile/memories`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(input), ...(context.signal ? { signal: context.signal } : {}) }).then(readResult);
  }
  decideMemory(input: Record<string, unknown>, context: { signal?: AbortSignal } = {}): Promise<PlanLearningResult> {
    return fetch(`${this.baseUrl}/memories/${encodeURIComponent(String(input.memoryId ?? ""))}/decision`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(input), ...(context.signal ? { signal: context.signal } : {}) }).then(readResult);
  }
  changeProfileMemory(input: Record<string, unknown>, context: { signal?: AbortSignal } = {}): Promise<PlanLearningResult> {
    return fetch(`${this.baseUrl}/profile/memories/${encodeURIComponent(String(input.memoryId ?? ""))}`, { method: "PATCH", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(input), ...(context.signal ? { signal: context.signal } : {}) }).then(readResult);
  }
}
