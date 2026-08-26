import { clone, sha256 } from "./crypto.js";
import type { ToolResult } from "./types.js";

export type ArrivalSourceSurface = "site" | "codex" | "inline";
export type ArrivalStatus = "waiting_for_codex" | "codex_reviewing" | "clarification_required" | "proposed_plan_ready" | "awaiting_human_authority" | "accepted" | "closed";
export type ArrivalInputKind = "detail" | "constraint" | "preference" | "commitment" | "answer" | "evidence_reference" | "correction";

export interface ArrivalInput {
  inputId: string;
  kind: ArrivalInputKind;
  payload: Record<string, unknown>;
  sourceSurface: ArrivalSourceSurface;
  createdAt: string;
}

export interface ArrivalClarification {
  questionId: string;
  prompt: string;
  answerKind: "text" | "number" | "date" | "choice" | "multi_choice" | "confirmation";
  fieldPaths: string[];
  choices: string[];
  stagedAt: string;
}

export interface ArrivalInterpretation {
  basedOnVersion?: number;
  inferredFamily: string | null;
  summary: string;
  known: Record<string, unknown>;
  inferred: Record<string, unknown>;
  missing: string[];
  contradictions: string[];
  savedOperatorWork: Record<string, unknown>;
  nextHumanBoundary?: {
    prompt: string;
    answerKind: ArrivalClarification["answerKind"];
    fieldPaths: string[];
    choices: string[];
  } | null;
  complete: boolean;
  stagedAt: string;
}

export interface ArrivalOrder {
  orderVersion: "finite-arrival-order.v1";
  orderId: string;
  version: number;
  status: ArrivalStatus;
  rawOutcome: string;
  structured: Record<string, unknown>;
  attachments: unknown[];
  inputs: ArrivalInput[];
  pendingClarification: ArrivalClarification | null;
  interpretation: ArrivalInterpretation | null;
  lastOperatorCheckpoint: number;
  createdAt: string;
  updatedAt: string;
  checksum: string;
}

export interface ArrivalEvent {
  eventVersion: "finite-arrival-event.v1";
  eventId: string;
  orderId: string;
  version: number;
  eventType: "human_order_created" | "human_input_added" | "operator_checkpointed" | "clarification_staged" | "interpretation_staged";
  actor: "human" | "codex";
  sourceSurface: ArrivalSourceSurface;
  payload: Record<string, unknown>;
  eventHash: string;
  createdAt: string;
}

export interface ArrivalOrientation {
  orientationVersion: "finite-arrival-orientation.v2";
  order: ArrivalOrder;
  deltaSinceVersion: number;
  delta: ArrivalEvent[];
  unprocessedHumanInputCount: number;
  evidenceReferences: unknown[];
  inferredFamily: string | null;
  missing: string[];
  contradictions: string[];
  savedOperatorWork: Record<string, unknown>;
  latestHumanInputVersion: number;
  latestOperatorEventVersion: number | null;
  operatorEventCount: number;
  interpretationBasedOnVersion: number | null;
  interpretationIsCurrent: boolean;
  exactOrderVersion: number;
  exactOrderChecksum: string;
  next: string;
}

export type ArrivalResult = ToolResult & {
  order?: ArrivalOrder;
  orders?: Array<Pick<ArrivalOrder, "orderId" | "version" | "status" | "rawOutcome" | "updatedAt" | "checksum">>;
  orientation?: ArrivalOrientation;
  replay?: boolean;
};

export interface ArrivalRepository {
  create(input: { idempotencyKey: string; rawOutcome: string; structured?: Record<string, unknown>; attachments?: unknown[]; sourceSurface: ArrivalSourceSurface }): Promise<ArrivalResult>;
  list(): Promise<ArrivalResult>;
  open(input?: { orderId?: string; sinceVersion?: number }): Promise<ArrivalResult>;
  appendInput(input: { orderId: string; expectedVersion: number; kind: ArrivalInputKind; payload: Record<string, unknown>; sourceSurface: ArrivalSourceSurface }): Promise<ArrivalResult>;
  checkpoint(input: { orderId: string; expectedVersion: number }): Promise<ArrivalResult>;
  stageClarification(input: { orderId: string; expectedVersion: number; prompt: string; answerKind: ArrivalClarification["answerKind"]; fieldPaths?: string[]; choices?: string[] }): Promise<ArrivalResult>;
  stageInterpretation(input: { orderId: string; expectedVersion: number; inferredFamily?: string | null; summary: string; known?: Record<string, unknown>; inferred?: Record<string, unknown>; missing?: string[]; contradictions?: string[]; savedOperatorWork?: Record<string, unknown>; nextHumanBoundary?: { prompt: string; answerKind: ArrivalClarification["answerKind"]; fieldPaths?: string[]; choices?: string[] } | null; complete?: boolean }): Promise<ArrivalResult>;
}

const requestJson = async (url: string, init?: RequestInit): Promise<ArrivalResult> => {
  try {
    const response = await fetch(url, { ...init, headers: { accept: "application/json", ...(init?.body ? { "content-type": "application/json" } : {}), ...init?.headers } });
    const body = await response.json() as ArrivalResult;
    return body;
  } catch (error) {
    return { ok: false, code: "ARRIVAL_SERVICE_UNAVAILABLE", message: error instanceof Error ? error.message : String(error), acceptedStateChanged: false, next: "The human order remains unchanged. Retry orientation before doing more work." };
  }
};

export class HttpArrivalRepository implements ArrivalRepository {
  constructor(private readonly baseUrl = "/api/arrivals") {}

  create(input: Parameters<ArrivalRepository["create"]>[0]): Promise<ArrivalResult> {
    return requestJson(this.baseUrl, { method: "POST", body: JSON.stringify(input) });
  }
  list(): Promise<ArrivalResult> { return requestJson(this.baseUrl); }
  open(input: Parameters<ArrivalRepository["open"]>[0] = {}): Promise<ArrivalResult> {
    const query = new URLSearchParams();
    if (input.sinceVersion !== undefined) query.set("sinceVersion", String(input.sinceVersion));
    const path = input.orderId ? `${this.baseUrl}/${encodeURIComponent(input.orderId)}` : `${this.baseUrl}/current`;
    return requestJson(`${path}${query.size ? `?${query}` : ""}`);
  }
  appendInput(input: Parameters<ArrivalRepository["appendInput"]>[0]): Promise<ArrivalResult> {
    return requestJson(`${this.baseUrl}/${encodeURIComponent(input.orderId)}/input`, { method: "POST", body: JSON.stringify(input) });
  }
  checkpoint(input: Parameters<ArrivalRepository["checkpoint"]>[0]): Promise<ArrivalResult> {
    return requestJson(`${this.baseUrl}/${encodeURIComponent(input.orderId)}/checkpoint`, { method: "POST", body: JSON.stringify(input) });
  }
  stageClarification(input: Parameters<ArrivalRepository["stageClarification"]>[0]): Promise<ArrivalResult> {
    return requestJson(`${this.baseUrl}/${encodeURIComponent(input.orderId)}/clarification`, { method: "POST", body: JSON.stringify(input) });
  }
  stageInterpretation(input: Parameters<ArrivalRepository["stageInterpretation"]>[0]): Promise<ArrivalResult> {
    return requestJson(`${this.baseUrl}/${encodeURIComponent(input.orderId)}/interpretation`, { method: "POST", body: JSON.stringify(input) });
  }
}

const humanEventTypes = new Set<ArrivalEvent["eventType"]>(["human_order_created", "human_input_added"]);

const nextInstruction = (order: ArrivalOrder, unprocessed: number): string => {
  if (unprocessed > 0) return `Process ${unprocessed} human-supplied update${unprocessed === 1 ? "" : "s"}, then checkpoint exact order version ${order.version} before staging operator work.`;
  if (order.status === "clarification_required") return "Wait for the human answer; do not infer it or treat the staged question as accepted truth.";
  if (order.status === "proposed_plan_ready") return "Present the proposed plan on the Site for human review. Codex cannot supply human authority.";
  return "Continue from the exact order version shown; re-open before staging if any delay or parallel edit is possible.";
};

const orientation = (order: ArrivalOrder, events: ArrivalEvent[], sinceVersion?: number): ArrivalOrientation => {
  const checkpoint = sinceVersion ?? order.lastOperatorCheckpoint;
  const delta = events.filter((event) => event.version > checkpoint);
  const unprocessedHumanInputCount = delta.filter((event) => humanEventTypes.has(event.eventType)).length;
  const humanEvents = events.filter((event) => humanEventTypes.has(event.eventType));
  const operatorEvents = events.filter((event) => event.actor === "codex");
  const interpretationEvent = [...events].reverse().find((event) => event.eventType === "interpretation_staged");
  const latestHumanInputVersion = humanEvents.at(-1)?.version ?? 0;
  const interpretationBasedOnVersion = order.interpretation
    ? order.interpretation.basedOnVersion ?? (interpretationEvent ? interpretationEvent.version - 1 : null)
    : null;
  return {
    orientationVersion: "finite-arrival-orientation.v2",
    order: clone(order),
    deltaSinceVersion: checkpoint,
    delta: clone(delta),
    unprocessedHumanInputCount,
    evidenceReferences: clone(order.attachments),
    inferredFamily: order.interpretation?.inferredFamily ?? null,
    missing: clone(order.interpretation?.missing ?? []),
    contradictions: clone(order.interpretation?.contradictions ?? []),
    savedOperatorWork: clone(order.interpretation?.savedOperatorWork ?? {}),
    latestHumanInputVersion,
    latestOperatorEventVersion: operatorEvents.at(-1)?.version ?? null,
    operatorEventCount: operatorEvents.length,
    interpretationBasedOnVersion,
    interpretationIsCurrent: interpretationBasedOnVersion !== null && latestHumanInputVersion <= interpretationBasedOnVersion,
    exactOrderVersion: order.version,
    exactOrderChecksum: order.checksum,
    next: nextInstruction(order, unprocessedHumanInputCount),
  };
};

const orderChecksum = async (order: Omit<ArrivalOrder, "checksum">): Promise<string> => sha256(order);

export class MemoryArrivalRepository implements ArrivalRepository {
  private readonly orders = new Map<string, ArrivalOrder>();
  private readonly events = new Map<string, ArrivalEvent[]>();
  private readonly idempotency = new Map<string, { requestHash: string; orderId: string }>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  private result(code: string, order: ArrivalOrder, sinceVersion?: number, extra: Record<string, unknown> = {}): ArrivalResult {
    return { ok: true, code, order: clone(order), orientation: orientation(order, this.events.get(order.orderId) ?? [], sinceVersion), acceptedStateChanged: false, ...extra };
  }

  private conflict(order: ArrivalOrder): ArrivalResult {
    return { ok: false, code: "ORDER_VERSION_CONFLICT", message: "The human order changed after this Codex work began.", currentVersion: order.version, currentChecksum: order.checksum, orientation: orientation(order, this.events.get(order.orderId) ?? []), acceptedStateChanged: false, next: "Discard stale staged work, re-open the arrival, and process the returned delta." };
  }

  private async appendEvent(order: ArrivalOrder, event: Omit<ArrivalEvent, "eventVersion" | "eventId" | "eventHash">): Promise<void> {
    const base = { eventVersion: "finite-arrival-event.v1" as const, eventId: `arrival_event_${order.orderId}_${event.version}`, ...event };
    const complete = { ...base, eventHash: await sha256(base) };
    this.events.set(order.orderId, [...(this.events.get(order.orderId) ?? []), complete]);
  }

  private async replace(order: ArrivalOrder, expectedVersion: number, patch: Partial<Omit<ArrivalOrder, "orderVersion" | "orderId" | "version" | "createdAt" | "checksum">>, event: Omit<ArrivalEvent, "eventVersion" | "eventId" | "eventHash" | "orderId" | "version" | "createdAt">): Promise<ArrivalResult> {
    const current = this.orders.get(order.orderId);
    if (!current) return { ok: false, code: "ARRIVAL_NOT_FOUND", acceptedStateChanged: false };
    if (current.version !== expectedVersion) return this.conflict(current);
    const createdAt = this.now().toISOString();
    const base: Omit<ArrivalOrder, "checksum"> = { ...clone(current), ...clone(patch), version: expectedVersion + 1, updatedAt: createdAt };
    const next: ArrivalOrder = { ...base, checksum: await orderChecksum(base) };
    this.orders.set(next.orderId, next);
    await this.appendEvent(next, { ...event, orderId: next.orderId, version: next.version, createdAt });
    return this.result(event.eventType === "operator_checkpointed" ? "ARRIVAL_CHECKPOINTED" : event.eventType === "clarification_staged" ? "ARRIVAL_CLARIFICATION_STAGED" : event.eventType === "interpretation_staged" ? "ARRIVAL_INTERPRETATION_STAGED" : "ARRIVAL_INPUT_APPENDED", next);
  }

  async create(input: Parameters<ArrivalRepository["create"]>[0]): Promise<ArrivalResult> {
    const requestHash = await sha256(input);
    const replay = this.idempotency.get(input.idempotencyKey);
    if (replay) {
      const order = this.orders.get(replay.orderId)!;
      if (replay.requestHash !== requestHash) return { ok: false, code: "ARRIVAL_IDEMPOTENCY_CONFLICT", acceptedStateChanged: false };
      return this.result("ARRIVAL_ORDER_REPLAY", order, undefined, { replay: true });
    }
    const orderId = `arrival_${(await sha256({ idempotencyKey: input.idempotencyKey })).slice(0, 16)}`;
    const createdAt = this.now().toISOString();
    const base: Omit<ArrivalOrder, "checksum"> = { orderVersion: "finite-arrival-order.v1", orderId, version: 1, status: "waiting_for_codex", rawOutcome: input.rawOutcome, structured: clone(input.structured ?? {}), attachments: clone(input.attachments ?? []), inputs: [], pendingClarification: null, interpretation: null, lastOperatorCheckpoint: 0, createdAt, updatedAt: createdAt };
    const order = { ...base, checksum: await orderChecksum(base) };
    this.orders.set(orderId, order);
    this.idempotency.set(input.idempotencyKey, { requestHash, orderId });
    await this.appendEvent(order, { orderId, version: 1, eventType: "human_order_created", actor: "human", sourceSurface: input.sourceSurface, payload: { rawOutcome: input.rawOutcome, structured: clone(input.structured ?? {}), attachments: clone(input.attachments ?? []) }, createdAt });
    return this.result("ARRIVAL_ORDER_CREATED", order, undefined, { replay: false });
  }

  async list(): Promise<ArrivalResult> {
    const orders = [...this.orders.values()].filter((order) => !["accepted", "closed"].includes(order.status)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(({ orderId, version, status, rawOutcome, updatedAt, checksum }) => ({ orderId, version, status, rawOutcome, updatedAt, checksum }));
    return { ok: true, code: "ARRIVAL_ORDERS_LISTED", orders, acceptedStateChanged: false };
  }

  async open(input: Parameters<ArrivalRepository["open"]>[0] = {}): Promise<ArrivalResult> {
    const order = input.orderId ? this.orders.get(input.orderId) : [...this.orders.values()].filter((item) => !["accepted", "closed"].includes(item.status)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    if (!order) return { ok: false, code: "ARRIVAL_NOT_FOUND", message: "No active human order is waiting.", acceptedStateChanged: false };
    return this.result("ARRIVAL_OPENED", order, input.sinceVersion);
  }

  async appendInput(input: Parameters<ArrivalRepository["appendInput"]>[0]): Promise<ArrivalResult> {
    const order = this.orders.get(input.orderId);
    if (!order) return { ok: false, code: "ARRIVAL_NOT_FOUND", acceptedStateChanged: false };
    const createdAt = this.now().toISOString();
    const record: ArrivalInput = { inputId: `arrival_input_${order.orderId}_${input.expectedVersion + 1}`, kind: input.kind, payload: clone(input.payload), sourceSurface: input.sourceSurface, createdAt };
    return this.replace(order, input.expectedVersion, { inputs: [...order.inputs, record], status: "waiting_for_codex", pendingClarification: input.kind === "answer" ? null : order.pendingClarification }, { eventType: "human_input_added", actor: "human", sourceSurface: input.sourceSurface, payload: { input: record } });
  }

  async checkpoint(input: Parameters<ArrivalRepository["checkpoint"]>[0]): Promise<ArrivalResult> {
    const order = this.orders.get(input.orderId);
    if (!order) return { ok: false, code: "ARRIVAL_NOT_FOUND", acceptedStateChanged: false };
    return this.replace(order, input.expectedVersion, { lastOperatorCheckpoint: input.expectedVersion + 1, status: "codex_reviewing" }, { eventType: "operator_checkpointed", actor: "codex", sourceSurface: "codex", payload: { processedThroughVersion: input.expectedVersion } });
  }

  async stageClarification(input: Parameters<ArrivalRepository["stageClarification"]>[0]): Promise<ArrivalResult> {
    const order = this.orders.get(input.orderId);
    if (!order) return { ok: false, code: "ARRIVAL_NOT_FOUND", acceptedStateChanged: false };
    const stagedAt = this.now().toISOString();
    const question: ArrivalClarification = { questionId: `arrival_question_${order.orderId}_${input.expectedVersion + 1}`, prompt: input.prompt, answerKind: input.answerKind, fieldPaths: clone(input.fieldPaths ?? []), choices: clone(input.choices ?? []), stagedAt };
    return this.replace(order, input.expectedVersion, { pendingClarification: question, status: "clarification_required", lastOperatorCheckpoint: input.expectedVersion }, { eventType: "clarification_staged", actor: "codex", sourceSurface: "codex", payload: { question } });
  }

  async stageInterpretation(input: Parameters<ArrivalRepository["stageInterpretation"]>[0]): Promise<ArrivalResult> {
    const order = this.orders.get(input.orderId);
    if (!order) return { ok: false, code: "ARRIVAL_NOT_FOUND", acceptedStateChanged: false };
    const stagedAt = this.now().toISOString();
    const interpretation: ArrivalInterpretation = {
      basedOnVersion: input.expectedVersion,
      inferredFamily: input.inferredFamily ?? null,
      summary: input.summary,
      known: clone(input.known ?? {}),
      inferred: clone(input.inferred ?? {}),
      missing: clone(input.missing ?? []),
      contradictions: clone(input.contradictions ?? []),
      savedOperatorWork: clone(input.savedOperatorWork ?? {}),
      nextHumanBoundary: input.nextHumanBoundary ? {
        prompt: input.nextHumanBoundary.prompt,
        answerKind: input.nextHumanBoundary.answerKind,
        fieldPaths: clone(input.nextHumanBoundary.fieldPaths ?? []),
        choices: clone(input.nextHumanBoundary.choices ?? []),
      } : null,
      complete: input.complete === true,
      stagedAt,
    };
    return this.replace(order, input.expectedVersion, { interpretation, pendingClarification: null, status: interpretation.complete ? "proposed_plan_ready" : "codex_reviewing", lastOperatorCheckpoint: input.expectedVersion }, { eventType: "interpretation_staged", actor: "codex", sourceSurface: "codex", payload: { interpretation } });
  }
}
