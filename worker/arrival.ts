import type {
  ArrivalClarification,
  ArrivalDependency,
  ArrivalDependencyKind,
  ArrivalDependencyStatus,
  ArrivalEvent,
  ArrivalInput,
  ArrivalInputKind,
  ArrivalInterpretation,
  ArrivalOrder,
  ArrivalOrientation,
  ArrivalSourceSurface,
  ArrivalStatus,
} from "../src/arrival.js";
import { ensureAuthenticatedTenant, type D1Database } from "./accepted-truth.js";

type JsonRecord = Record<string, unknown>;

interface ArrivalRow {
  order_id: string;
  idempotency_key: string;
  request_hash: string;
  version: number;
  status: ArrivalStatus;
  raw_outcome: string;
  structured_json: string;
  attachments_json: string;
  inputs_json: string;
  pending_clarification_json: string | null;
  interpretation_json: string | null;
  last_operator_checkpoint: number;
  packet_checksum: string;
  created_at: string;
  updated_at: string;
}

interface ArrivalEventRow {
  order_id: string;
  version: number;
  event_id: string;
  event_type: ArrivalEvent["eventType"];
  actor: ArrivalEvent["actor"];
  source_surface: ArrivalSourceSurface;
  payload_json: string;
  event_hash: string;
  created_at: string;
}

const jsonHeaders = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const activeStatuses: ArrivalStatus[] = ["waiting_for_codex", "codex_reviewing", "clarification_required", "proposed_plan_ready", "interpretation_confirmed", "awaiting_human_authority"];
const isArrivalDraftReady = (status: ArrivalStatus | string): boolean => status === "proposed_plan_ready" || status === "interpretation_confirmed";
const sourceSurfaces = new Set<ArrivalSourceSurface>(["site", "codex", "inline"]);
const inputKinds = new Set<ArrivalInputKind>(["detail", "constraint", "preference", "commitment", "answer", "evidence_reference", "correction"]);
const workspaceOptionOperations = new Set(["add", "update", "delete"]);
const workspaceModuleOperations = new Set(["add", "update", "delete"]);
const workspaceModuleVariants = new Set(["cards", "checklist", "calendar"]);
const workspaceFieldTypes = new Set(["text", "url", "date", "time", "number", "textarea", "select"]);
const answerKinds = new Set<ArrivalClarification["answerKind"]>(["text", "number", "date", "choice", "multi_choice", "confirmation"]);
const dependencyKinds = new Set<ArrivalDependencyKind>(["operator_research", "human_coordination", "external_evidence", "human_decision"]);
const dependencyStatuses = new Set<ArrivalDependencyStatus>(["open", "resolved", "deferred"]);
const humanEventTypes = new Set<ArrivalEvent["eventType"]>(["human_order_created", "human_input_added"]);

const stableSerialize = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as JsonRecord;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

const sha256 = async (value: unknown): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(stableSerialize(value)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const response = (status: number, body: JsonRecord): Response => new Response(JSON.stringify(body), { status, headers: jsonHeaders });
const errorResponse = (status: number, code: string, message: string, details: JsonRecord = {}): Response => response(status, { ok: false, code, message, acceptedStateChanged: false, ...details });

const parseJson = async (request: Request): Promise<JsonRecord> => {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) throw new Error("JSON_CONTENT_TYPE_REQUIRED");
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 500_000) throw new Error("JSON_BODY_TOO_LARGE");
  const text = await request.text();
  if (text.length > 500_000) throw new Error("JSON_BODY_TOO_LARGE");
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("JSON_OBJECT_REQUIRED");
  return parsed as JsonRecord;
};

const sameOriginWrite = (request: Request): boolean => {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
};

const asRecord = (value: unknown): JsonRecord => value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
const asStringArray = (value: unknown, max = 50): string[] => Array.isArray(value) ? value.slice(0, max).filter((item): item is string => typeof item === "string").map((item) => item.slice(0, 500)) : [];
const asDependencies = (value: unknown): ArrivalDependency[] | null => {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 50) return null;
  const dependencies: ArrivalDependency[] = [];
  const ids = new Set<string>();
  for (const item of value) {
    const source = asRecord(item);
    const dependencyId = String(source.dependencyId ?? "");
    const kind = String(source.kind ?? "") as ArrivalDependencyKind;
    const title = String(source.title ?? "").trim();
    const status = String(source.status ?? "open") as ArrivalDependencyStatus;
    const detail = source.detail === undefined ? undefined : String(source.detail).slice(0, 1_000);
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(dependencyId) || ids.has(dependencyId) || !dependencyKinds.has(kind) || !dependencyStatuses.has(status) || !title || title.length > 500 || typeof source.blocking !== "boolean") return null;
    ids.add(dependencyId);
    dependencies.push({ dependencyId, kind, title, status, blocking: source.blocking, ...(detail ? { detail } : {}), sourcePaths: asStringArray(source.sourcePaths, 20) });
  }
  return dependencies;
};
const validOrderId = (value: string): boolean => /^[a-zA-Z0-9_-]{1,100}$/.test(value);

const orderFromRow = (row: ArrivalRow): ArrivalOrder => ({
  orderVersion: "finite-arrival-order.v1",
  orderId: row.order_id,
  version: row.version,
  status: row.status,
  rawOutcome: row.raw_outcome,
  structured: JSON.parse(row.structured_json) as JsonRecord,
  attachments: JSON.parse(row.attachments_json) as unknown[],
  inputs: JSON.parse(row.inputs_json) as ArrivalInput[],
  pendingClarification: row.pending_clarification_json ? JSON.parse(row.pending_clarification_json) as ArrivalClarification : null,
  interpretation: row.interpretation_json ? JSON.parse(row.interpretation_json) as ArrivalInterpretation : null,
  lastOperatorCheckpoint: row.last_operator_checkpoint,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  checksum: row.packet_checksum,
});

const eventFromRow = (row: ArrivalEventRow): ArrivalEvent => ({
  eventVersion: "finite-arrival-event.v1",
  eventId: row.event_id,
  orderId: row.order_id,
  version: row.version,
  eventType: row.event_type,
  actor: row.actor,
  sourceSurface: row.source_surface,
  payload: JSON.parse(row.payload_json) as JsonRecord,
  eventHash: row.event_hash,
  createdAt: row.created_at,
});

const checksumForOrder = async (order: Omit<ArrivalOrder, "checksum">): Promise<string> => sha256(order);

const loadOrder = async (db: D1Database, scopeId: string, orderId: string): Promise<ArrivalOrder | null> => {
  const row = await db.prepare("SELECT order_id, idempotency_key, request_hash, version, status, raw_outcome, structured_json, attachments_json, inputs_json, pending_clarification_json, interpretation_json, last_operator_checkpoint, packet_checksum, created_at, updated_at FROM arrival_orders WHERE scope_id = ? AND order_id = ?")
    .bind(scopeId, orderId).first<ArrivalRow>();
  if (!row) return null;
  const order = orderFromRow(row);
  const { checksum: _checksum, ...base } = order;
  if (await checksumForOrder(base) !== order.checksum) throw new Error("ARRIVAL_INTEGRITY_FAILED");
  return order;
};

const loadEvents = async (db: D1Database, scopeId: string, orderId: string): Promise<ArrivalEvent[]> => {
  const { results } = await db.prepare("SELECT order_id, version, event_id, event_type, actor, source_surface, payload_json, event_hash, created_at FROM arrival_events WHERE scope_id = ? AND order_id = ? ORDER BY version ASC")
    .bind(scopeId, orderId).all<ArrivalEventRow>();
  const events = results.map(eventFromRow);
  for (const event of events) {
    const { eventHash: _eventHash, ...base } = event;
    if (await sha256(base) !== event.eventHash) throw new Error("ARRIVAL_EVENT_INTEGRITY_FAILED");
  }
  return events;
};

const nextInstruction = (order: ArrivalOrder, unprocessed: number): string => {
  if (unprocessed > 0) return `Process ${unprocessed} human-supplied update${unprocessed === 1 ? "" : "s"}, then checkpoint exact order version ${order.version} before staging operator work.`;
  if (order.status === "clarification_required") return "Wait for the human answer; do not infer it or treat the staged question as accepted truth.";
  if (isArrivalDraftReady(order.status)) return "The editable rough plan is ready. Continue construction or research without treating it as plan activation or external-action authority.";
  return "Continue from this exact order version. Re-open before staging after any delay or parallel edit.";
};

const buildOrientation = (order: ArrivalOrder, events: ArrivalEvent[], sinceVersion?: number): ArrivalOrientation => {
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
    order,
    deltaSinceVersion: checkpoint,
    delta,
    unprocessedHumanInputCount,
    evidenceReferences: order.attachments,
    inferredFamily: order.interpretation?.inferredFamily ?? null,
    missing: order.interpretation?.missing ?? [],
    contradictions: order.interpretation?.contradictions ?? [],
    dependencies: order.interpretation?.dependencies ?? [],
    savedOperatorWork: order.interpretation?.savedOperatorWork ?? {},
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

const openedResponse = async (db: D1Database, scopeId: string, order: ArrivalOrder, code: string, sinceVersion?: number, extra: JsonRecord = {}, status = 200): Promise<Response> => {
  const events = await loadEvents(db, scopeId, order.orderId);
  return response(status, { ok: true, code, order, orientation: buildOrientation(order, events, sinceVersion), acceptedStateChanged: false, ...extra });
};

const currentOrder = async (db: D1Database, scopeId: string): Promise<ArrivalOrder | null> => {
  const placeholders = activeStatuses.map(() => "?").join(", ");
  const row = await db.prepare(`SELECT order_id FROM arrival_orders WHERE scope_id = ? AND status IN (${placeholders}) ORDER BY updated_at DESC LIMIT 1`)
    .bind(scopeId, ...activeStatuses).first<{ order_id: string }>();
  return row ? loadOrder(db, scopeId, row.order_id) : null;
};

const createOrder = async (db: D1Database, scopeId: string, body: JsonRecord): Promise<Response> => {
  const idempotencyKey = String(body.idempotencyKey ?? "");
  const rawOutcome = String(body.rawOutcome ?? "").trim();
  const sourceSurface = String(body.sourceSurface ?? "site") as ArrivalSourceSurface;
  const structured = asRecord(body.structured);
  const attachments = Array.isArray(body.attachments) ? body.attachments.slice(0, 20) : [];
  if (idempotencyKey.length < 8 || idempotencyKey.length > 100) return errorResponse(422, "ARRIVAL_IDEMPOTENCY_KEY_INVALID", "An idempotency key between 8 and 100 characters is required.");
  if (!rawOutcome || rawOutcome.length > 4_000) return errorResponse(422, "ARRIVAL_OUTCOME_INVALID", "The requested outcome must contain 1 to 4,000 characters.");
  if (!sourceSurfaces.has(sourceSurface)) return errorResponse(422, "ARRIVAL_SOURCE_SURFACE_INVALID", "The source surface is invalid.");
  if (stableSerialize(structured).length > 100_000 || stableSerialize(attachments).length > 200_000) return errorResponse(413, "ARRIVAL_PACKET_TOO_LARGE", "The arrival packet exceeds its bounded storage contract.");

  const requestHash = await sha256({ idempotencyKey, rawOutcome, structured, attachments, sourceSurface });
  const existing = await db.prepare("SELECT order_id, request_hash FROM arrival_orders WHERE scope_id = ? AND idempotency_key = ?").bind(scopeId, idempotencyKey).first<{ order_id: string; request_hash: string }>();
  if (existing) {
    if (existing.request_hash !== requestHash) return errorResponse(409, "ARRIVAL_IDEMPOTENCY_CONFLICT", "This idempotency key already names a different human order.");
    const order = await loadOrder(db, scopeId, existing.order_id);
    if (!order) throw new Error("ARRIVAL_REPLAY_HEAD_MISSING");
    return openedResponse(db, scopeId, order, "ARRIVAL_ORDER_REPLAY", undefined, { replay: true });
  }

  const orderId = `arrival_${(await sha256({ scopeId, idempotencyKey })).slice(0, 16)}`;
  const createdAt = new Date().toISOString();
  const base: Omit<ArrivalOrder, "checksum"> = { orderVersion: "finite-arrival-order.v1", orderId, version: 1, status: "waiting_for_codex", rawOutcome, structured, attachments, inputs: [], pendingClarification: null, interpretation: null, lastOperatorCheckpoint: 0, createdAt, updatedAt: createdAt };
  const order: ArrivalOrder = { ...base, checksum: await checksumForOrder(base) };
  const eventBase: Omit<ArrivalEvent, "eventHash"> = { eventVersion: "finite-arrival-event.v1", eventId: `arrival_event_${orderId}_1`, orderId, version: 1, eventType: "human_order_created", actor: "human", sourceSurface, payload: { rawOutcome, structured, attachments }, createdAt };
  const event = { ...eventBase, eventHash: await sha256(eventBase) };
  const results = await db.batch([
    db.prepare("INSERT OR IGNORE INTO arrival_orders (scope_id, order_id, idempotency_key, request_hash, version, status, raw_outcome, structured_json, attachments_json, inputs_json, pending_clarification_json, interpretation_json, last_operator_checkpoint, packet_checksum, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(scopeId, orderId, idempotencyKey, requestHash, order.version, order.status, order.rawOutcome, JSON.stringify(order.structured), JSON.stringify(order.attachments), JSON.stringify(order.inputs), null, null, order.lastOperatorCheckpoint, order.checksum, createdAt, createdAt),
    db.prepare("INSERT OR IGNORE INTO arrival_events (scope_id, order_id, version, event_id, event_type, actor, source_surface, payload_json, event_hash, created_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM arrival_orders WHERE scope_id = ? AND order_id = ? AND request_hash = ?)")
      .bind(scopeId, orderId, 1, event.eventId, event.eventType, event.actor, event.sourceSurface, JSON.stringify(event.payload), event.eventHash, createdAt, scopeId, orderId, requestHash),
  ]);
  const durable = await loadOrder(db, scopeId, orderId);
  if (!durable) throw new Error("ARRIVAL_CREATE_FAILED");
  const durableIdentity = await db.prepare("SELECT request_hash FROM arrival_orders WHERE scope_id = ? AND order_id = ?").bind(scopeId, orderId).first<{ request_hash: string }>();
  if (!durableIdentity || durableIdentity.request_hash !== requestHash) return errorResponse(409, "ARRIVAL_IDEMPOTENCY_CONFLICT", "This idempotency key already names a different human order.");
  const replay = (results[0]?.meta?.changes ?? 0) !== 1;
  return openedResponse(db, scopeId, durable, replay ? "ARRIVAL_ORDER_REPLAY" : "ARRIVAL_ORDER_CREATED", undefined, { replay });
};

type OrderPatch = Pick<ArrivalOrder, "status" | "inputs" | "pendingClarification" | "interpretation" | "lastOperatorCheckpoint">;

const mutateOrder = async (db: D1Database, scopeId: string, order: ArrivalOrder, expectedVersion: number, patch: Partial<OrderPatch>, event: Omit<ArrivalEvent, "eventVersion" | "eventId" | "eventHash" | "orderId" | "version" | "createdAt">, code: string): Promise<Response> => {
  if (order.version !== expectedVersion) return openedResponse(db, scopeId, order, "ORDER_VERSION_CONFLICT", undefined, { ok: false, message: "The human order changed after this Codex work began.", currentVersion: order.version, currentChecksum: order.checksum, next: "Discard stale staged work, re-open the arrival, and process the returned delta." }, 409);
  const updatedAt = new Date().toISOString();
  const { checksum: _oldChecksum, ...currentBase } = order;
  const cleanBase: Omit<ArrivalOrder, "checksum"> = { ...currentBase, ...patch, version: expectedVersion + 1, updatedAt };
  const next: ArrivalOrder = { ...cleanBase, checksum: await checksumForOrder(cleanBase) };
  const eventBase: Omit<ArrivalEvent, "eventHash"> = { eventVersion: "finite-arrival-event.v1", eventId: `arrival_event_${order.orderId}_${next.version}`, orderId: order.orderId, version: next.version, ...event, createdAt: updatedAt };
  const completeEvent = { ...eventBase, eventHash: await sha256(eventBase) };
  const results = await db.batch([
    db.prepare("UPDATE arrival_orders SET version = ?, status = ?, inputs_json = ?, pending_clarification_json = ?, interpretation_json = ?, last_operator_checkpoint = ?, packet_checksum = ?, updated_at = ? WHERE scope_id = ? AND order_id = ? AND version = ?")
      .bind(next.version, next.status, JSON.stringify(next.inputs), next.pendingClarification ? JSON.stringify(next.pendingClarification) : null, next.interpretation ? JSON.stringify(next.interpretation) : null, next.lastOperatorCheckpoint, next.checksum, next.updatedAt, scopeId, order.orderId, expectedVersion),
    db.prepare("INSERT INTO arrival_events (scope_id, order_id, version, event_id, event_type, actor, source_surface, payload_json, event_hash, created_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM arrival_orders WHERE scope_id = ? AND order_id = ? AND version = ? AND packet_checksum = ?)")
      .bind(scopeId, order.orderId, next.version, completeEvent.eventId, completeEvent.eventType, completeEvent.actor, completeEvent.sourceSurface, JSON.stringify(completeEvent.payload), completeEvent.eventHash, updatedAt, scopeId, order.orderId, next.version, next.checksum),
  ]);
  if ((results[0]?.meta?.changes ?? 0) !== 1) {
    const current = await loadOrder(db, scopeId, order.orderId);
    if (!current) return errorResponse(404, "ARRIVAL_NOT_FOUND", "The human order no longer exists.");
    return openedResponse(db, scopeId, current, "ORDER_VERSION_CONFLICT", undefined, { ok: false, message: "The human order changed after this Codex work began.", currentVersion: current.version, currentChecksum: current.checksum, next: "Discard stale staged work, re-open the arrival, and process the returned delta." }, 409);
  }
  const durable = await loadOrder(db, scopeId, order.orderId);
  if (!durable) throw new Error("ARRIVAL_MUTATION_FAILED");
  return openedResponse(db, scopeId, durable, code);
};

const appendInput = async (db: D1Database, scopeId: string, order: ArrivalOrder, body: JsonRecord): Promise<Response> => {
  const expectedVersion = Number(body.expectedVersion);
  const kind = String(body.kind ?? "") as ArrivalInputKind;
  const sourceSurface = String(body.sourceSurface ?? "site") as ArrivalSourceSurface;
  const payload = asRecord(body.payload);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) return errorResponse(422, "ORDER_VERSION_INVALID", "An exact positive order version is required.");
  if (!inputKinds.has(kind)) return errorResponse(422, "ARRIVAL_INPUT_KIND_INVALID", "The human input kind is invalid.");
  if (!sourceSurfaces.has(sourceSurface)) return errorResponse(422, "ARRIVAL_SOURCE_SURFACE_INVALID", "The source surface is invalid.");
  if (stableSerialize(payload).length > 100_000) return errorResponse(413, "ARRIVAL_INPUT_TOO_LARGE", "The human input exceeds its bounded storage contract.");
  const createdAt = new Date().toISOString();
  const input: ArrivalInput = { inputId: `arrival_input_${order.orderId}_${expectedVersion + 1}`, kind, payload, sourceSurface, createdAt };
  return mutateOrder(db, scopeId, order, expectedVersion, { inputs: [...order.inputs, input], status: "waiting_for_codex", pendingClarification: kind === "answer" ? null : order.pendingClarification }, { eventType: "human_input_added", actor: "human", sourceSurface, payload: { input } }, "ARRIVAL_INPUT_APPENDED");
};

const saveWorkspaceOption = async (db: D1Database, scopeId: string, order: ArrivalOrder, body: JsonRecord): Promise<Response> => {
  const expectedVersion = Number(body.expectedVersion);
  const operation = String(body.operation ?? "");
  const moduleId = String(body.moduleId ?? "");
  const optionId = String(body.optionId ?? "");
  const parentRecordId = String(body.parentRecordId ?? "");
  const label = String(body.label ?? "").trim();
  const rawFields = asRecord(body.fields);
  const fields = Object.fromEntries(Object.entries(rawFields).filter((entry): entry is [string, string | boolean] => typeof entry[1] === "string" || typeof entry[1] === "boolean"));
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) return errorResponse(422, "ORDER_VERSION_INVALID", "An exact positive order version is required.");
  if (!workspaceOptionOperations.has(operation)) return errorResponse(422, "WORKSPACE_OPTION_OPERATION_INVALID", "The option operation must be add, update, or delete.");
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(moduleId) || !/^[a-zA-Z0-9_-]{1,120}$/.test(optionId)) return errorResponse(422, "WORKSPACE_OPTION_ID_INVALID", "The module and option identities must be bounded stable identifiers.");
  if (parentRecordId && !/^[a-zA-Z0-9_-]{1,160}$/.test(parentRecordId)) return errorResponse(422, "WORKSPACE_OPTION_PARENT_INVALID", "The parent record identity must be a bounded stable identifier.");
  if (operation === "add" && (!label || label.length > 200 || !String(fields.title ?? "").trim())) return errorResponse(422, "WORKSPACE_OPTION_INVALID", "A new option requires a bounded label and title.");
  if (operation !== "delete" && (!Object.keys(fields).length || Object.keys(fields).length > 40 || stableSerialize(fields).length > 30_000)) return errorResponse(422, "WORKSPACE_OPTION_FIELDS_INVALID", "Option fields must be a bounded set of planning values.");
  const createdAt = new Date().toISOString();
  const payload: JsonRecord = {
    workspaceOperation: `option_${operation}`,
    moduleId,
    recordId: optionId,
    optionSource: "codex",
    ...(parentRecordId ? { parentRecordId } : {}),
    ...(label ? { label } : {}),
    ...(operation !== "delete" ? { fields } : {}),
  };
  const input: ArrivalInput = { inputId: `arrival_option_${order.orderId}_${expectedVersion + 1}`, kind: "detail", payload, sourceSurface: "codex", createdAt };
  return mutateOrder(db, scopeId, order, expectedVersion, { inputs: [...order.inputs, input] }, { eventType: "operator_option_saved", actor: "codex", sourceSurface: "codex", payload: { input } }, "ARRIVAL_WORKSPACE_OPTION_SAVED");
};

const saveWorkspaceModule = async (db: D1Database, scopeId: string, order: ArrivalOrder, body: JsonRecord): Promise<Response> => {
  const expectedVersion = Number(body.expectedVersion);
  const operation = String(body.operation ?? "");
  const moduleId = String(body.moduleId ?? "");
  const label = String(body.label ?? "").trim();
  const description = String(body.description ?? "").trim();
  const variant = String(body.variant ?? "cards");
  const rawFields = Array.isArray(body.fields) ? body.fields : [];
  const fields = rawFields.map((entry) => {
    const record = asRecord(entry);
    const rawOptions = Array.isArray(record.options) ? record.options : [];
    return {
      fieldId: String(record.fieldId ?? "").trim(),
      label: String(record.label ?? "").trim(),
      inputType: String(record.inputType ?? "text").trim(),
      ...(String(record.placeholder ?? "").trim() ? { placeholder: String(record.placeholder).trim() } : {}),
      ...(rawOptions.length ? { options: rawOptions.map((option) => ({ value: String(asRecord(option).value ?? "").trim(), label: String(asRecord(option).label ?? "").trim() })) } : {}),
    };
  });
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) return errorResponse(422, "ORDER_VERSION_INVALID", "An exact positive order version is required.");
  if (!workspaceModuleOperations.has(operation)) return errorResponse(422, "WORKSPACE_MODULE_OPERATION_INVALID", "The module operation must be add, update, or delete.");
  if (!/^custom_[a-z0-9_]{3,80}$/.test(moduleId)) return errorResponse(422, "WORKSPACE_MODULE_ID_INVALID", "A custom module requires a bounded custom_ identity.");
  if (operation !== "delete") {
    if (!label || label.length > 100 || !description || description.length > 300 || !workspaceModuleVariants.has(variant)) return errorResponse(422, "WORKSPACE_MODULE_INVALID", "A custom module requires a bounded name, purpose, and supported layout.");
    if (!fields.length || fields.length > 12 || fields[0]?.fieldId !== "title") return errorResponse(422, "WORKSPACE_MODULE_FIELDS_INVALID", "Custom modules require title first and at most twelve fields.");
    const ids = new Set<string>();
    for (const moduleField of fields) {
      if (!/^[a-z][a-zA-Z0-9_]{0,49}$/.test(moduleField.fieldId) || ids.has(moduleField.fieldId) || !moduleField.label || moduleField.label.length > 80 || !workspaceFieldTypes.has(moduleField.inputType)) return errorResponse(422, "WORKSPACE_MODULE_FIELDS_INVALID", "Custom module fields require unique bounded identities, labels, and supported types.");
      ids.add(moduleField.fieldId);
      if (moduleField.placeholder && moduleField.placeholder.length > 160) return errorResponse(422, "WORKSPACE_MODULE_FIELDS_INVALID", "Custom module placeholders must be bounded.");
      if (moduleField.inputType === "select" && (!moduleField.options?.length || moduleField.options.length > 12 || moduleField.options.some((option) => !option.value || !option.label || option.value.length > 60 || option.label.length > 80))) return errorResponse(422, "WORKSPACE_MODULE_FIELDS_INVALID", "Select fields require bounded labelled choices.");
    }
  }
  const createdAt = new Date().toISOString();
  const payload: JsonRecord = {
    workspaceOperation: `module_${operation}`,
    moduleId,
    moduleSource: "codex",
    ...(operation !== "delete" ? { label, description, variant, fields } : {}),
  };
  const input: ArrivalInput = { inputId: `arrival_module_${order.orderId}_${expectedVersion + 1}`, kind: "detail", payload, sourceSurface: "codex", createdAt };
  return mutateOrder(db, scopeId, order, expectedVersion, { inputs: [...order.inputs, input] }, { eventType: "operator_module_saved", actor: "codex", sourceSurface: "codex", payload: { input } }, "ARRIVAL_WORKSPACE_MODULE_SAVED");
};

const checkpoint = async (db: D1Database, scopeId: string, order: ArrivalOrder, body: JsonRecord): Promise<Response> => {
  const expectedVersion = Number(body.expectedVersion);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) return errorResponse(422, "ORDER_VERSION_INVALID", "An exact positive order version is required.");
  return mutateOrder(db, scopeId, order, expectedVersion, { lastOperatorCheckpoint: expectedVersion + 1, status: "codex_reviewing" }, { eventType: "operator_checkpointed", actor: "codex", sourceSurface: "codex", payload: { processedThroughVersion: expectedVersion } }, "ARRIVAL_CHECKPOINTED");
};

const stageClarification = async (db: D1Database, scopeId: string, order: ArrivalOrder, body: JsonRecord): Promise<Response> => {
  const expectedVersion = Number(body.expectedVersion);
  const prompt = String(body.prompt ?? "").trim();
  const answerKind = String(body.answerKind ?? "text") as ArrivalClarification["answerKind"];
  const fieldPaths = asStringArray(body.fieldPaths, 20);
  const choices = asStringArray(body.choices, 20);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) return errorResponse(422, "ORDER_VERSION_INVALID", "An exact positive order version is required.");
  if (!prompt || prompt.length > 1_000) return errorResponse(422, "ARRIVAL_QUESTION_INVALID", "A bounded clarification question is required.");
  if (!answerKinds.has(answerKind)) return errorResponse(422, "ARRIVAL_ANSWER_KIND_INVALID", "The clarification answer kind is invalid.");
  if (["choice", "multi_choice"].includes(answerKind) && choices.length < 2) return errorResponse(422, "ARRIVAL_CHOICES_REQUIRED", "Choice questions require at least two choices.");
  const stagedAt = new Date().toISOString();
  const question: ArrivalClarification = { questionId: `arrival_question_${order.orderId}_${expectedVersion + 1}`, prompt, answerKind, fieldPaths, choices, stagedAt };
  return mutateOrder(db, scopeId, order, expectedVersion, { pendingClarification: question, status: "clarification_required", lastOperatorCheckpoint: expectedVersion }, { eventType: "clarification_staged", actor: "codex", sourceSurface: "codex", payload: { question } }, "ARRIVAL_CLARIFICATION_STAGED");
};

const interpretationFromBody = (body: JsonRecord): { expectedVersion: number; interpretation: ArrivalInterpretation } | Response => {
  const expectedVersion = Number(body.expectedVersion);
  const summary = String(body.summary ?? "").trim();
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) return errorResponse(422, "ORDER_VERSION_INVALID", "An exact positive order version is required.");
  if (!summary || summary.length > 4_000) return errorResponse(422, "ARRIVAL_INTERPRETATION_INVALID", "A bounded Codex interpretation summary is required.");
  const inferredFamilyRaw = body.inferredFamily;
  const inferredFamily = inferredFamilyRaw === null || inferredFamilyRaw === undefined ? null : String(inferredFamilyRaw).slice(0, 100);
  const boundaryRecord = asRecord(body.nextHumanBoundary);
  const boundaryPrompt = String(boundaryRecord.prompt ?? "").trim();
  const boundaryAnswerKind = String(boundaryRecord.answerKind ?? "text") as ArrivalClarification["answerKind"];
  const dependencies = asDependencies(body.dependencies);
  if (!dependencies) return errorResponse(422, "ARRIVAL_DEPENDENCY_INVALID", "Dependencies must be bounded, uniquely identified, typed operator or human work.");
  if (body.nextHumanBoundary !== null && body.nextHumanBoundary !== undefined) {
    if (!boundaryPrompt || boundaryPrompt.length > 1_000) return errorResponse(422, "ARRIVAL_BOUNDARY_INVALID", "A bounded next-human-boundary prompt is required.");
    if (!answerKinds.has(boundaryAnswerKind)) return errorResponse(422, "ARRIVAL_BOUNDARY_INVALID", "The next-human-boundary answer kind is invalid.");
    if (["choice", "multi_choice"].includes(boundaryAnswerKind) && asStringArray(boundaryRecord.choices, 20).length < 2) return errorResponse(422, "ARRIVAL_BOUNDARY_INVALID", "Choice boundaries require at least two choices.");
  }
  const stagedAt = new Date().toISOString();
  const interpretation: ArrivalInterpretation = {
    basedOnVersion: expectedVersion,
    inferredFamily,
    summary,
    known: asRecord(body.known),
    inferred: asRecord(body.inferred),
    missing: asStringArray(body.missing),
    contradictions: asStringArray(body.contradictions),
    dependencies,
    savedOperatorWork: asRecord(body.savedOperatorWork),
    nextHumanBoundary: boundaryPrompt ? {
      prompt: boundaryPrompt,
      answerKind: boundaryAnswerKind,
      fieldPaths: asStringArray(boundaryRecord.fieldPaths, 20),
      choices: asStringArray(boundaryRecord.choices, 20),
    } : null,
    complete: body.complete === true,
    stagedAt,
  };
  if (stableSerialize(interpretation).length > 200_000) return errorResponse(413, "ARRIVAL_INTERPRETATION_TOO_LARGE", "The Codex interpretation exceeds its bounded storage contract.");
  if (interpretation.complete && interpretation.dependencies.some((dependency) => dependency.blocking && dependency.status === "open")) return errorResponse(422, "ARRIVAL_BLOCKING_DEPENDENCY_OPEN", "A complete interpretation cannot retain an open blocking dependency.");
  if (interpretation.complete && interpretation.nextHumanBoundary) return errorResponse(422, "ARRIVAL_COMPLETE_WITH_HUMAN_BOUNDARY", "A complete interpretation cannot retain a human decision boundary.");
  return { expectedVersion, interpretation };
};

const stageInterpretation = async (db: D1Database, scopeId: string, order: ArrivalOrder, body: JsonRecord): Promise<Response> => {
  const parsed = interpretationFromBody(body);
  if (parsed instanceof Response) return parsed;
  const { expectedVersion, interpretation } = parsed;
  return mutateOrder(db, scopeId, order, expectedVersion, { interpretation, pendingClarification: null, status: interpretation.complete ? "proposed_plan_ready" : "codex_reviewing", lastOperatorCheckpoint: expectedVersion }, { eventType: "interpretation_staged", actor: "codex", sourceSurface: "codex", payload: { interpretation } }, "ARRIVAL_INTERPRETATION_STAGED");
};

const reconcileArrival = async (db: D1Database, scopeId: string, order: ArrivalOrder, body: JsonRecord): Promise<Response> => {
  const parsed = interpretationFromBody(body);
  if (parsed instanceof Response) return parsed;
  const { expectedVersion, interpretation } = parsed;
  const question: ArrivalClarification | null = !interpretation.complete && interpretation.nextHumanBoundary ? {
    questionId: `arrival_question_${order.orderId}_${expectedVersion + 1}`,
    prompt: interpretation.nextHumanBoundary.prompt,
    answerKind: interpretation.nextHumanBoundary.answerKind,
    fieldPaths: interpretation.nextHumanBoundary.fieldPaths,
    choices: interpretation.nextHumanBoundary.choices,
    stagedAt: interpretation.stagedAt,
  } : null;
  return mutateOrder(db, scopeId, order, expectedVersion, {
    interpretation,
    pendingClarification: question,
    status: interpretation.complete ? "proposed_plan_ready" : question ? "clarification_required" : "codex_reviewing",
    lastOperatorCheckpoint: expectedVersion + 1,
  }, {
    eventType: "arrival_reconciled",
    actor: "codex",
    sourceSurface: "codex",
    payload: { processedHumanThroughVersion: expectedVersion, interpretation, question },
  }, "ARRIVAL_RECONCILED");
};

const reviewInterpretation = async (db: D1Database, scopeId: string, order: ArrivalOrder, body: JsonRecord): Promise<Response> => {
  const expectedVersion = Number(body.expectedVersion);
  const expectedChecksum = String(body.expectedChecksum ?? "");
  const sourceSurface = String(body.sourceSurface ?? "site") as ArrivalSourceSurface;
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) return errorResponse(422, "ORDER_VERSION_INVALID", "An exact positive order version is required.");
  if (!/^[a-f0-9]{64}$/.test(expectedChecksum)) return errorResponse(422, "ARRIVAL_CHECKSUM_INVALID", "An exact arrival checksum is required.");
  if (!(["site", "inline"] as ArrivalSourceSurface[]).includes(sourceSurface)) return errorResponse(403, "HUMAN_REVIEW_SURFACE_REQUIRED", "Interpretation review must come from the human Site surface.");
  if (order.version !== expectedVersion || order.checksum !== expectedChecksum) return openedResponse(db, scopeId, order, "ORDER_VERSION_CONFLICT", undefined, { ok: false, message: "The interpretation changed before it was reviewed.", currentVersion: order.version, currentChecksum: order.checksum, next: "Reload the current interpretation before reviewing it." }, 409);
  if (!order.interpretation?.complete || order.status !== "proposed_plan_ready") return openedResponse(db, scopeId, order, "ARRIVAL_INTERPRETATION_NOT_REVIEWABLE", undefined, { ok: false, message: "Only a complete current interpretation can be confirmed for construction." }, 409);
  const interpretationHash = await sha256(order.interpretation);
  return mutateOrder(db, scopeId, order, expectedVersion, { status: "interpretation_confirmed" }, {
    eventType: "interpretation_reviewed",
    actor: "human",
    sourceSurface,
    payload: { decision: "confirm_for_construction", reviewedOrderVersion: order.version, reviewedOrderChecksum: order.checksum, interpretationHash },
  }, "ARRIVAL_INTERPRETATION_REVIEWED");
};

export const acceptedPlanHeadIsCurrent = async (db: D1Database, scopeId: string, planId: string, profileHash: string, revision: number): Promise<{ matches: boolean; currentProfileHash: string | null; currentRevision: number | null }> => {
  const head = await db.prepare("SELECT profile_hash, revision FROM plan_heads WHERE scope_id = ? AND plan_id = ?")
    .bind(scopeId, planId).first<{ profile_hash: string; revision: number }>();
  return {
    matches: Boolean(head && head.profile_hash === profileHash && head.revision === revision),
    currentProfileHash: head?.profile_hash ?? null,
    currentRevision: head?.revision ?? null,
  };
};

const acceptPlan = async (db: D1Database, scopeId: string, order: ArrivalOrder, body: JsonRecord): Promise<Response> => {
  const expectedVersion = Number(body.expectedVersion);
  const expectedChecksum = String(body.expectedChecksum ?? "");
  const planId = String(body.planId ?? "");
  const profileHash = String(body.profileHash ?? "");
  const planRevision = Number(body.planRevision);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1 || !/^[a-f0-9]{64}$/.test(expectedChecksum)) return errorResponse(422, "ARRIVAL_PLAN_BINDING_INVALID", "An exact arrival version and checksum are required.");
  if (!/^[a-z0-9][a-z0-9_-]{2,100}$/.test(planId) || !/^[a-f0-9]{64}$/.test(profileHash) || !Number.isInteger(planRevision) || planRevision < 1) return errorResponse(422, "ARRIVAL_PLAN_BINDING_INVALID", "The accepted plan binding is invalid.");
  if (order.version !== expectedVersion || order.checksum !== expectedChecksum) return openedResponse(db, scopeId, order, "ORDER_VERSION_CONFLICT", undefined, { ok: false, message: "The arrival changed before its plan binding was recorded.", currentVersion: order.version, currentChecksum: order.checksum }, 409);
  if (order.status !== "interpretation_confirmed" || !order.interpretation?.complete) return openedResponse(db, scopeId, order, "ARRIVAL_NOT_ACCEPTABLE", undefined, { ok: false, message: "Only a reviewed complete interpretation can be bound to an activated plan." }, 409);
  const acceptedHead = await acceptedPlanHeadIsCurrent(db, scopeId, planId, profileHash, planRevision);
  if (!acceptedHead.matches) return openedResponse(db, scopeId, order, "ARRIVAL_ACCEPTED_PLAN_NOT_CURRENT", undefined, { ok: false, message: "The arrival can close only against the exact durable accepted plan head.", currentPlanRevision: acceptedHead.currentRevision, currentProfileHash: acceptedHead.currentProfileHash }, 409);
  return mutateOrder(db, scopeId, order, expectedVersion, { status: "accepted", lastOperatorCheckpoint: expectedVersion + 1 }, {
    eventType: "plan_activated", actor: "codex", sourceSurface: "codex", payload: { planId, profileHash, planRevision },
  }, "ARRIVAL_PLAN_ACCEPTED");
};

const listOrders = async (db: D1Database, scopeId: string): Promise<Response> => {
  const placeholders = activeStatuses.map(() => "?").join(", ");
  const { results } = await db.prepare(`SELECT order_id, version, status, raw_outcome, updated_at, packet_checksum FROM arrival_orders WHERE scope_id = ? AND status IN (${placeholders}) ORDER BY updated_at DESC LIMIT 50`)
    .bind(scopeId, ...activeStatuses).all<{ order_id: string; version: number; status: ArrivalStatus; raw_outcome: string; updated_at: string; packet_checksum: string }>();
  return response(200, { ok: true, code: "ARRIVAL_ORDERS_LISTED", orders: results.map((row) => ({ orderId: row.order_id, version: row.version, status: row.status, rawOutcome: row.raw_outcome, updatedAt: row.updated_at, checksum: row.packet_checksum })), acceptedStateChanged: false });
};

export const handleArrivalRequest = async (request: Request, db: D1Database): Promise<Response | null> => {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/arrivals")) return null;
  if (request.method !== "GET" && !sameOriginWrite(request)) return errorResponse(403, "CROSS_ORIGIN_WRITE_REFUSED", "Finite writes must be same-origin.");
  try {
    const scopeId = await ensureAuthenticatedTenant(request, db);
    if (url.pathname === "/api/arrivals" && request.method === "POST") return createOrder(db, scopeId, await parseJson(request));
    if (url.pathname === "/api/arrivals" && request.method === "GET") return listOrders(db, scopeId);
    if (url.pathname === "/api/arrivals/current" && request.method === "GET") {
      const order = await currentOrder(db, scopeId);
      if (!order) return errorResponse(404, "ARRIVAL_NOT_FOUND", "No active human order is waiting.");
      const sinceVersion = url.searchParams.has("sinceVersion") ? Number(url.searchParams.get("sinceVersion")) : undefined;
      return openedResponse(db, scopeId, order, "ARRIVAL_OPENED", Number.isInteger(sinceVersion) && Number(sinceVersion) >= 0 ? sinceVersion : undefined);
    }
    const suffix = url.pathname.slice("/api/arrivals/".length);
    const [encodedOrderId, operation, extra] = suffix.split("/");
    if (!encodedOrderId || extra) return errorResponse(400, "ARRIVAL_PATH_INVALID", "A single arrival order id is required.");
    const orderId = decodeURIComponent(encodedOrderId);
    if (!validOrderId(orderId)) return errorResponse(400, "ARRIVAL_ID_INVALID", "The arrival order id is invalid.");
    const order = await loadOrder(db, scopeId, orderId);
    if (!order) return errorResponse(404, "ARRIVAL_NOT_FOUND", "The human order was not found.");
    if (!operation && request.method === "GET") {
      const sinceVersion = url.searchParams.has("sinceVersion") ? Number(url.searchParams.get("sinceVersion")) : undefined;
      return openedResponse(db, scopeId, order, "ARRIVAL_OPENED", Number.isInteger(sinceVersion) && Number(sinceVersion) >= 0 ? sinceVersion : undefined);
    }
    if (request.method !== "POST") return errorResponse(405, "METHOD_NOT_ALLOWED", "Unsupported arrival operation.");
    const body = await parseJson(request);
    if (operation === "input") return appendInput(db, scopeId, order, body);
    if (operation === "option") return saveWorkspaceOption(db, scopeId, order, body);
    if (operation === "module") return saveWorkspaceModule(db, scopeId, order, body);
    if (operation === "checkpoint") return checkpoint(db, scopeId, order, body);
    if (operation === "clarification") return stageClarification(db, scopeId, order, body);
    if (operation === "interpretation") return stageInterpretation(db, scopeId, order, body);
    if (operation === "reconcile") return reconcileArrival(db, scopeId, order, body);
    if (operation === "review") return reviewInterpretation(db, scopeId, order, body);
    if (operation === "accept") return acceptPlan(db, scopeId, order, body);
    return errorResponse(405, "METHOD_NOT_ALLOWED", "Unsupported arrival operation.");
  } catch (error) {
    const code = error instanceof Error ? error.message : "ARRIVAL_SERVICE_FAILED";
    if (code === "AUTHENTICATED_USER_REQUIRED") return errorResponse(401, code, "Sign in with ChatGPT or start an isolated demo session.");
    if (["JSON_CONTENT_TYPE_REQUIRED", "JSON_BODY_TOO_LARGE", "JSON_OBJECT_REQUIRED"].includes(code)) return errorResponse(400, code, "The arrival request body is invalid.");
    if (["ARRIVAL_INTEGRITY_FAILED", "ARRIVAL_EVENT_INTEGRITY_FAILED"].includes(code)) return errorResponse(500, code, "Durable arrival truth failed integrity verification; no work was accepted.");
    return errorResponse(500, "ARRIVAL_SERVICE_FAILED", "The arrival service failed safely.");
  }
};
