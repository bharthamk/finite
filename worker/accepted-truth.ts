import { principalStorageScope, resolveRequestPrincipal } from "./auth.js";

interface D1Result<T = Record<string, unknown>> {
  success: boolean;
  meta?: {
    changes?: number;
    duration?: number;
    timings?: { sql_duration_ms?: number };
    rows_read?: number;
    rows_written?: number;
    total_attempts?: number;
  };
  results?: T[];
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

type JsonRecord = Record<string, unknown>;

interface Snapshot extends JsonRecord {
  snapshotVersion: string;
  profileId: string;
  profileHash: string;
  planId: string;
  revision: number;
  lifecycle?: { status: string };
  accepted: {
    totalBudgetMinor: number;
    spentMinor: number;
    committedMinor: number;
    forecastMinor: number;
    bufferMinor: number;
  };
  events: JsonRecord[];
  correctionEvents: JsonRecord[];
  preferenceEvents: JsonRecord[];
  lifecycleEvents?: JsonRecord[];
  groupDecisionEvents?: JsonRecord[];
  externalActionEvents?: JsonRecord[];
  evidenceRecords?: JsonRecord[];
  receipts: JsonRecord[];
}

interface Envelope extends JsonRecord {
  envelopeVersion: string;
  scopeId: string;
  planId: string;
  profileId: string;
  profileHash: string;
  revision: number;
  snapshot: Snapshot;
  snapshotHash: string;
  previousSnapshotHash: string | null;
}

interface Receipt extends JsonRecord {
  receiptId: string;
  receiptType: string;
  idempotencyKey: string;
  planId: string;
  fromRevision: number;
  toRevision: number;
  replayChecksum: string;
  payload: JsonRecord;
}

interface ActivationReceipt extends JsonRecord {
  receiptId: string;
  idempotencyKey: string;
  fromPlanId: string;
  toPlanId: string;
  replayChecksum: string;
  draftId: string;
  confirmationId: string;
  contentHash?: string;
  baseRevision?: number;
  sourceArrival?: { orderId: string; orderVersion: number; orderChecksum: string } | null;
}

interface CatalogEntry extends JsonRecord {
  definition: JsonRecord;
  evidenceRecords: JsonRecord[];
  lineage?: JsonRecord;
}

interface CatalogRow {
  plan_id: string;
  profile_id: string;
  profile_hash: string;
  definition_json: string;
  evidence_json: string;
  lineage_json: string | null;
}

interface CommitRequest extends JsonRecord {
  commitVersion: string;
  scopeId: string;
  expectedRevision: number;
  previousSnapshotHash: string;
  envelope: Envelope;
  receipt: Receipt;
  authorityChallengeId: string | null;
  operationProof: JsonRecord | null;
  requestHash: string;
}

interface ChallengeRow {
  challenge_id: string;
  plan_id: string;
  profile_hash: string;
  revision: number;
  target_type: string;
  target_id: string;
  content_hash: string;
  authority_id: string;
  command_hash: string;
  created_at: string;
  expires_at: string;
}

interface SessionRow {
  session_id: string;
  idempotency_key: string;
  plan_id: string;
  profile_hash: string;
  base_revision: number;
  kind: string;
  status: string;
  payload_json: string;
  content_hash: string;
  created_at: string;
  expires_at: string;
  closed_at: string | null;
}

interface HeadRow {
  profile_id: string;
  profile_hash: string;
  revision: number;
  snapshot_hash: string;
  snapshot_json: string;
  previous_snapshot_hash: string | null;
}

const contractScopeId = "authenticated-user-v1";
const jsonHeaders = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

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

export const ensureAuthenticatedTenant = async (request: Request, db: D1Database): Promise<string> => {
  const principal = await resolveRequestPrincipal(request, db);
  if (!principal) throw new Error("AUTHENTICATED_USER_REQUIRED");
  const { scopeId, userIdHash } = await principalStorageScope(principal);
  const existing = await db.prepare("SELECT scope_id FROM tenant_accounts WHERE scope_id = ? AND user_id_hash = ?")
    .bind(scopeId, userIdHash).first<{ scope_id: string }>();
  if (existing) return scopeId;
  const now = new Date().toISOString();
  const statements = [
    db.prepare("INSERT INTO tenant_accounts (scope_id, user_id_hash, legacy_scope_adopted, created_at) VALUES (?, ?, 0, ?)").bind(scopeId, userIdHash, now),
  ];
  try { await db.batch(statements); }
  catch {
    const concurrent = await db.prepare("SELECT scope_id FROM tenant_accounts WHERE scope_id = ? AND user_id_hash = ?").bind(scopeId, userIdHash).first();
    if (!concurrent) throw new Error("TENANT_INITIALIZATION_FAILED");
  }
  return scopeId;
};

const response = (status: number, body: JsonRecord): Response => new Response(JSON.stringify(body), { status, headers: jsonHeaders });

const errorResponse = (status: number, code: string, message: string, details: JsonRecord = {}): Response =>
  response(status, { ok: false, code, message, ...details });

const asRecord = (value: unknown): JsonRecord => value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};

const parseJson = async (request: Request): Promise<JsonRecord> => {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) throw new Error("JSON_CONTENT_TYPE_REQUIRED");
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 1_000_000) throw new Error("JSON_BODY_TOO_LARGE");
  const text = await request.text();
  if (text.length > 1_000_000) throw new Error("JSON_BODY_TOO_LARGE");
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("JSON_OBJECT_REQUIRED");
  return value as JsonRecord;
};

const sameOriginWrite = (request: Request): boolean => {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
};

const isSafeInteger = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;

const receiptValid = async (receipt: Receipt): Promise<boolean> => {
  const { replayChecksum, ...base } = receipt;
  return typeof replayChecksum === "string" && await sha256(base) === replayChecksum;
};

const activationReceiptValid = async (receipt: ActivationReceipt): Promise<boolean> => {
  const { receiptId, replayChecksum, ...base } = receipt;
  return typeof receiptId === "string" && typeof replayChecksum === "string"
    && receiptId === `plan_activation_${replayChecksum.slice(0, 16)}`
    && await sha256(base) === replayChecksum;
};

const authorityTargetTypes = new Set(["plan_option", "plan_fact_change", "actual_correction", "preference_change", "plan_lifecycle", "group_decision", "external_action", "plan_activation"]);

const receiptAuthorityBinding = (receipt: Receipt): { targetType: string; targetId: string; contentHash: string; authorityId: string } | null => {
  const payload = receipt.payload;
  const eventKey = ({ plan_fact_change: "planFactChange", actual_correction: "correctionEvent", preference_change: "preferenceEvent", plan_lifecycle: "lifecycleEvent", group_decision: "groupDecisionEvent", external_action: "externalActionEvent" } as Record<string, string>)[receipt.receiptType];
  const event = eventKey && payload[eventKey] && typeof payload[eventKey] === "object" && !Array.isArray(payload[eventKey]) ? payload[eventKey] as JsonRecord : null;
  const targetId = receipt.receiptType === "plan_option" ? payload.candidateId
    : receipt.receiptType === "plan_fact_change" ? event?.planFactChangeId
    : receipt.receiptType === "actual_correction" ? event?.correctionId
      : receipt.receiptType === "preference_change" ? event?.preferenceChangeId
        : receipt.receiptType === "plan_lifecycle" ? event?.lifecycleChangeId
          : receipt.receiptType === "group_decision" ? event?.groupDecisionId
            : receipt.receiptType === "external_action" ? event?.externalActionChangeId : null;
  const contentHash = receipt.receiptType === "plan_option" ? payload.contentHash : event?.contentHash;
  const authorityId = receipt.receiptType === "plan_option" ? payload.approvalId : receipt.receiptType === "plan_fact_change" ? payload.confirmationId : event?.confirmationId;
  return typeof targetId === "string" && typeof contentHash === "string" && typeof authorityId === "string"
    ? { targetType: receipt.receiptType, targetId, contentHash, authorityId }
    : null;
};

const catalogIssues = async (entry: CatalogEntry | null, envelope: Envelope, activationReceipt: ActivationReceipt | null): Promise<string[]> => {
  if (!entry || !entry.definition || typeof entry.definition !== "object" || Array.isArray(entry.definition) || !Array.isArray(entry.evidenceRecords)) return ["durable plan catalog entry required"];
  const issues: string[] = [];
  if (entry.definition.planId !== envelope.planId || entry.definition.profileId !== envelope.profileId || await sha256(entry.definition) !== envelope.profileHash) issues.push("catalog definition does not match compiled profile identity");
  for (const evidence of entry.evidenceRecords) {
    if (typeof evidence.content !== "string" || await sha256({ content: evidence.content }) !== evidence.contentHash) issues.push("catalog evidence content hash mismatch");
    const { evidenceId: _evidenceId, recordHash, ...base } = evidence;
    if (typeof recordHash !== "string" || await sha256(base) !== recordHash) issues.push("catalog evidence provenance hash mismatch");
  }
  if (activationReceipt) {
    const lineage = entry.lineage;
    if (!lineage || lineage.activationReceiptId !== activationReceipt.receiptId || lineage.activationKind !== activationReceipt.activationKind) issues.push("catalog lineage does not match activation receipt");
  }
  return [...new Set(issues)];
};

const catalogUpsert = (db: D1Database, scopeId: string, entry: CatalogEntry, envelope: Envelope, now: string): D1PreparedStatement => db.prepare(`
  INSERT INTO plan_catalog (scope_id, plan_id, profile_id, profile_hash, definition_json, evidence_json, lineage_json, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(scope_id, plan_id) DO UPDATE SET
    profile_id = excluded.profile_id,
    profile_hash = excluded.profile_hash,
    definition_json = excluded.definition_json,
    evidence_json = excluded.evidence_json,
    lineage_json = excluded.lineage_json,
    updated_at = excluded.updated_at
`).bind(scopeId, envelope.planId, envelope.profileId, envelope.profileHash, JSON.stringify(entry.definition), JSON.stringify(entry.evidenceRecords), entry.lineage ? JSON.stringify(entry.lineage) : null, now, now);

const envelopeIssues = async (envelope: Envelope): Promise<string[]> => {
  const issues: string[] = [];
  const snapshot = envelope.snapshot;
  if (envelope.envelopeVersion !== "finite-plan-accepted-truth.v1" || envelope.scopeId !== contractScopeId) issues.push("invalid envelope contract");
  if (!snapshot || snapshot.snapshotVersion !== "finite-plan-snapshot.v1") return [...issues, "invalid snapshot contract"];
  if (envelope.planId !== snapshot.planId || envelope.profileId !== snapshot.profileId || envelope.profileHash !== snapshot.profileHash || envelope.revision !== snapshot.revision) issues.push("envelope identity does not match snapshot");
  if (!Number.isInteger(snapshot.revision) || snapshot.revision < 1) issues.push("invalid snapshot revision");
  if (snapshot.lifecycle && !["active", "paused", "completed", "abandoned"].includes(snapshot.lifecycle.status)) issues.push("invalid snapshot lifecycle");
  const allocation = snapshot.accepted;
  const parts = allocation && [allocation.totalBudgetMinor, allocation.spentMinor, allocation.committedMinor, allocation.forecastMinor, allocation.bufferMinor];
  if (!parts || parts.some((value) => !isSafeInteger(value))) issues.push("invalid finite allocation");
  else if (allocation.spentMinor + allocation.committedMinor + allocation.forecastMinor + allocation.bufferMinor !== allocation.totalBudgetMinor) issues.push("finite allocation does not conserve total");
  if (await sha256(snapshot) !== envelope.snapshotHash) issues.push("snapshot hash mismatch");
  if (!Array.isArray(snapshot.receipts) || !Array.isArray(snapshot.events) || !Array.isArray(snapshot.correctionEvents) || !Array.isArray(snapshot.preferenceEvents) || (snapshot.lifecycleEvents !== undefined && !Array.isArray(snapshot.lifecycleEvents)) || (snapshot.groupDecisionEvents !== undefined && !Array.isArray(snapshot.groupDecisionEvents)) || (snapshot.externalActionEvents !== undefined && !Array.isArray(snapshot.externalActionEvents))) issues.push("invalid append-only collections");
  const receipts = Array.isArray(snapshot.receipts) ? snapshot.receipts as Receipt[] : [];
  if (!(await Promise.all(receipts.map(receiptValid))).every(Boolean)) issues.push("invalid historical receipt checksum");
  if (new Set(receipts.map((item) => item.receiptId)).size !== receipts.length || new Set(receipts.map((item) => item.idempotencyKey)).size !== receipts.length) issues.push("duplicate historical receipt identity");
  for (const item of receipts) if (item.planId !== snapshot.planId || item.fromRevision + 1 !== item.toRevision || item.toRevision > snapshot.revision) issues.push("invalid historical receipt lineage");
  const evidence = Array.isArray(snapshot.evidenceRecords) ? snapshot.evidenceRecords : [];
  const evidenceIds = new Set(evidence.map((item) => String(item.evidenceId ?? "")));
  for (const item of evidence) {
    if (typeof item.content !== "string" || await sha256({ content: item.content }) !== item.contentHash) issues.push("invalid evidence content hash");
    const { evidenceId: _evidenceId, recordHash, ...base } = item;
    if (typeof recordHash !== "string" || await sha256(base) !== recordHash) issues.push("invalid evidence provenance hash");
  }
  const appendOnlyEvents = [snapshot.correctionEvents, snapshot.preferenceEvents, snapshot.lifecycleEvents ?? [], snapshot.groupDecisionEvents ?? [], snapshot.externalActionEvents ?? []].flat();
  for (const item of appendOnlyEvents) if (!Number.isInteger(item.fromRevision) || !Number.isInteger(item.toRevision) || Number(item.fromRevision) + 1 !== Number(item.toRevision) || Number(item.toRevision) > snapshot.revision) issues.push("invalid append-only event lineage");
  for (const item of snapshot.groupDecisionEvents ?? []) {
    const positions = Array.isArray(item.positions) ? item.positions as JsonRecord[] : [];
    if (positions.length < 2 || positions.some((position) => typeof position.participantId !== "string" || !position.participantId || typeof position.participantName !== "string" || !position.participantName || typeof position.position !== "string" || !position.position) || new Set(positions.map((position) => position.participantId)).size !== positions.length || !["named_decider", "consensus", "unanimous_for_locks", "explicit_compromise"].includes(String(item.protocol))) issues.push("invalid group decision event");
  }
  for (const item of snapshot.externalActionEvents ?? []) {
    if (!["researched", "quoted", "held", "booked", "paid", "verified", "cancelled"].includes(String(item.after))) issues.push("invalid external action status");
    if (item.evidenceRef && !evidenceIds.has(String(item.evidenceRef))) issues.push("external action references missing evidence");
  }
  return [...new Set(issues)];
};

const readHead = async (db: D1Database, scopeId: string, planId: string): Promise<Envelope | null> => {
  const row = await db.prepare(`
    SELECT h.profile_id, h.profile_hash, h.revision, h.snapshot_hash,
           r.snapshot_json, r.previous_snapshot_hash
      FROM plan_heads h
      JOIN plan_revisions r
        ON r.scope_id = h.scope_id AND r.plan_id = h.plan_id AND r.revision = h.revision
     WHERE h.scope_id = ? AND h.plan_id = ?
  `).bind(scopeId, planId).first<HeadRow>();
  if (!row) return null;
  const snapshot = JSON.parse(row.snapshot_json) as Snapshot;
  return {
    envelopeVersion: "finite-plan-accepted-truth.v1",
    scopeId: contractScopeId,
    planId,
    profileId: row.profile_id,
    profileHash: row.profile_hash,
    revision: row.revision,
    snapshot,
    snapshotHash: row.snapshot_hash,
    previousSnapshotHash: row.previous_snapshot_hash,
  };
};

const envelopeFromHeadRow = (planId: string, row: HeadRow | null): Envelope | null => {
  if (!row) return null;
  return {
    envelopeVersion: "finite-plan-accepted-truth.v1",
    scopeId: contractScopeId,
    planId,
    profileId: row.profile_id,
    profileHash: row.profile_hash,
    revision: row.revision,
    snapshot: JSON.parse(row.snapshot_json) as Snapshot,
    snapshotHash: row.snapshot_hash,
    previousSnapshotHash: row.previous_snapshot_hash,
  };
};

const loadReceiptReplay = async (db: D1Database, scopeId: string, planId: string, idempotencyKey: string): Promise<{ requestHash: string; response: JsonRecord } | null> => {
  const row = await db.prepare("SELECT request_hash, response_json FROM receipts WHERE scope_id = ? AND plan_id = ? AND idempotency_key = ?")
    .bind(scopeId, planId, idempotencyKey).first<{ request_hash: string; response_json: string }>();
  return row ? { requestHash: row.request_hash, response: JSON.parse(row.response_json) as JsonRecord } : null;
};

const loadActivationReplay = async (db: D1Database, scopeId: string, idempotencyKey: string): Promise<{ requestHash: string; receipt: ActivationReceipt } | null> => {
  const row = await db.prepare("SELECT request_hash, receipt_json FROM activation_receipts WHERE scope_id = ? AND idempotency_key = ?")
    .bind(scopeId, idempotencyKey).first<{ request_hash: string; receipt_json: string }>();
  return row ? { requestHash: row.request_hash, receipt: JSON.parse(row.receipt_json) as ActivationReceipt } : null;
};

const listCatalog = async (db: D1Database, scopeId: string): Promise<Response> => {
  const entries = await db.prepare("SELECT plan_id, profile_id, profile_hash, definition_json, evidence_json, lineage_json FROM plan_catalog WHERE scope_id = ? ORDER BY updated_at DESC")
    .bind(scopeId).all<CatalogRow>();
  const activations = await db.prepare("SELECT receipt_json FROM activation_receipts WHERE scope_id = ? ORDER BY created_at ASC")
    .bind(scopeId).all<{ receipt_json: string }>();
  return response(200, {
    ok: true,
    code: "PLAN_CATALOG",
    entries: entries.results.map((row) => ({ definition: JSON.parse(row.definition_json), evidenceRecords: JSON.parse(row.evidence_json), ...(row.lineage_json ? { lineage: JSON.parse(row.lineage_json) } : {}) })),
    activationReceipts: activations.results.map((row) => JSON.parse(row.receipt_json)),
  });
};

const validatePlanActivationGate = async (db: D1Database, scopeId: string, gate: JsonRecord, expected: { planId: string; profileHash: string; revision: number; targetId: string; contentHash: string; sourceArrival?: unknown }): Promise<{ packetId: string } | Response> => {
  const source = asRecord(gate.sourceArrival);
  if (gate.gateVersion !== "finite-plan-activation-gate.v1" || gate.source !== "human_action"
    || typeof gate.constructionPacketId !== "string" || !/^construction_[a-f0-9]{16}$/.test(gate.constructionPacketId)
    || gate.baseProfileHash !== expected.profileHash
    || typeof source.orderId !== "string" || !source.orderId
    || !Number.isInteger(source.orderVersion) || Number(source.orderVersion) < 1
    || typeof source.orderChecksum !== "string" || !/^[a-f0-9]{64}$/.test(source.orderChecksum)
    || (expected.sourceArrival !== undefined && JSON.stringify(expected.sourceArrival) !== JSON.stringify(source))) {
    return errorResponse(422, "PLAN_ACTIVATION_GATE_INVALID", "Plan activation requires the exact reviewed arrival and draft binding.");
  }
  type GateHeadRow = Pick<HeadRow, "profile_hash" | "revision">;
  type GateArrivalRow = { order_id: string; version: number; status: string; packet_checksum: string };
  type GateConstructionRow = { packet_id: string; packet_json: string; base_plan_id: string; base_profile_hash: string; base_revision: number; kind: string; source_order_id: string | null; source_order_version: number | null; source_order_checksum: string | null; expires_at: string; cleared_at: string | null; disposition: string };
  const [headResult, arrivalResult, constructionResult] = await db.batch<GateHeadRow | GateArrivalRow | GateConstructionRow>([
    db.prepare("SELECT profile_hash, revision FROM plan_heads WHERE scope_id = ? AND plan_id = ?").bind(scopeId, expected.planId),
    db.prepare("SELECT order_id, version, status, packet_checksum FROM arrival_orders WHERE scope_id = ? AND order_id = ?").bind(scopeId, source.orderId),
    db.prepare("SELECT packet_id, packet_json, base_plan_id, base_profile_hash, base_revision, kind, source_order_id, source_order_version, source_order_checksum, expires_at, cleared_at, disposition FROM construction_packets WHERE scope_id = ? AND packet_id = ?").bind(scopeId, gate.constructionPacketId),
  ]);
  const head = headResult?.results?.[0] as GateHeadRow | undefined;
  if (!head || head.profile_hash !== expected.profileHash || head.revision !== expected.revision) return errorResponse(409, "PLAN_ACTIVATION_BASE_STALE", "The accepted source plan changed before activation.", { currentRevision: head?.revision ?? null, currentProfileHash: head?.profile_hash ?? null });
  const arrival = arrivalResult?.results?.[0] as GateArrivalRow | undefined;
  if (!arrival || arrival.version !== source.orderVersion || arrival.packet_checksum !== source.orderChecksum || !(arrival.status === "interpretation_confirmed" || arrival.status === "proposed_plan_ready")) return errorResponse(409, "PLAN_ACTIVATION_ARRIVAL_STALE", "The starting request changed before activation.", { currentOrderVersion: arrival?.version ?? null, currentOrderChecksum: arrival?.packet_checksum ?? null, currentOrderStatus: arrival?.status ?? null });
  const construction = constructionResult?.results?.[0] as GateConstructionRow | undefined;
  let payload: JsonRecord = {};
  try { payload = asRecord(asRecord(construction ? JSON.parse(construction.packet_json) : null).payload); } catch { /* invalid stored packet fails closed below */ }
  const current = construction
    && construction.kind === "draft"
    && !construction.cleared_at
    && construction.disposition === "current"
    && Date.parse(construction.expires_at) > Date.now()
    && construction.base_plan_id === expected.planId
    && construction.base_profile_hash === expected.profileHash
    && construction.base_revision === expected.revision
    && construction.source_order_id === source.orderId
    && construction.source_order_version === source.orderVersion
    && construction.source_order_checksum === source.orderChecksum
    && payload.draftId === expected.targetId
    && payload.contentHash === expected.contentHash;
  return current ? { packetId: construction.packet_id } : errorResponse(409, "PLAN_ACTIVATION_DRAFT_STALE", "The exact reviewed draft is no longer current.");
};

const initialize = async (db: D1Database, scopeId: string, body: JsonRecord): Promise<Response> => {
  const envelope = body.envelope as Envelope;
  const activationReceipt = body.activationReceipt as ActivationReceipt | null;
  const catalogEntry = body.catalogEntry as CatalogEntry | null;
  const authorityChallengeId = typeof body.authorityChallengeId === "string" ? body.authorityChallengeId : null;
  const activationGate = asRecord(body.activationGate);
  const hasActivationGate = Object.keys(activationGate).length > 0;
  const activationRequestHash = body.activationRequestHash as string | null;
  const issues = await envelopeIssues(envelope);
  issues.push(...await catalogIssues(catalogEntry, envelope, activationReceipt));
  if (envelope.previousSnapshotHash !== null || envelope.revision !== 1) issues.push("initial accepted truth must begin at revision one without a predecessor");
  let challenge: ChallengeRow | null = null;
  let guardedExistingTarget: Envelope | null | undefined;
  if (activationReceipt) {
    if (!await activationReceiptValid(activationReceipt)) issues.push("invalid activation receipt checksum");
    if (activationReceipt.toPlanId !== envelope.planId) issues.push("activation target does not match envelope plan");
    const expectedActivationHash = hasActivationGate
      ? await sha256({ envelope, activationReceipt, catalogEntry, authorityChallengeId, activationGate })
      : await sha256({ envelope, activationReceipt, catalogEntry, authorityChallengeId });
    if (activationRequestHash !== expectedActivationHash) issues.push("activation request hash mismatch");
    let replay: { requestHash: string; receipt: ActivationReceipt } | null = null;
    let guardedConsumed = false;
    if (hasActivationGate) {
      const guardedReads = await db.batch([
        db.prepare("SELECT request_hash, receipt_json FROM activation_receipts WHERE scope_id = ? AND idempotency_key = ?").bind(scopeId, activationReceipt.idempotencyKey),
        db.prepare("SELECT challenge_id, plan_id, profile_hash, revision, target_type, target_id, content_hash, authority_id, command_hash, created_at, expires_at FROM authority_challenges WHERE scope_id = ? AND challenge_id = ?").bind(scopeId, authorityChallengeId ?? ""),
        db.prepare("SELECT challenge_id FROM challenge_consumptions WHERE scope_id = ? AND challenge_id = ?").bind(scopeId, authorityChallengeId ?? ""),
        db.prepare(`
          SELECT h.profile_id, h.profile_hash, h.revision, h.snapshot_hash,
                 r.snapshot_json, r.previous_snapshot_hash
            FROM plan_heads h
            JOIN plan_revisions r
              ON r.scope_id = h.scope_id AND r.plan_id = h.plan_id AND r.revision = h.revision
           WHERE h.scope_id = ? AND h.plan_id = ?
        `).bind(scopeId, activationReceipt.toPlanId),
      ]);
      const replayRow = guardedReads[0]?.results?.[0] as { request_hash: string; receipt_json: string } | undefined;
      replay = replayRow ? { requestHash: replayRow.request_hash, receipt: JSON.parse(replayRow.receipt_json) as ActivationReceipt } : null;
      challenge = (guardedReads[1]?.results?.[0] as ChallengeRow | undefined) ?? null;
      guardedConsumed = Boolean(guardedReads[2]?.results?.[0]);
      guardedExistingTarget = envelopeFromHeadRow(activationReceipt.toPlanId, (guardedReads[3]?.results?.[0] as HeadRow | undefined) ?? null);
    } else {
      replay = await loadActivationReplay(db, scopeId, activationReceipt.idempotencyKey);
    }
    if (replay) {
      if (replay.requestHash !== activationRequestHash) return errorResponse(409, "IDEMPOTENCY_KEY_REUSED", "Activation idempotency key was reused with different content.");
      const current = hasActivationGate ? guardedExistingTarget : await readHead(db, scopeId, replay.receipt.toPlanId);
      if (!current) return errorResponse(500, "ACTIVATION_REPLAY_HEAD_MISSING", "Activation receipt exists without its accepted head.");
      return response(200, { ok: true, code: "ACCEPTED_TRUTH_CURRENT", envelope: current, receipt: replay.receipt, requestHash: activationRequestHash, replay: true, ...(hasActivationGate ? { constructionPacketCleared: true } : {}) });
    }
    if (!authorityChallengeId) issues.push("live human authority challenge required for plan activation");
    else {
      if (!hasActivationGate) challenge = await db.prepare("SELECT challenge_id, plan_id, profile_hash, revision, target_type, target_id, content_hash, authority_id, command_hash, created_at, expires_at FROM authority_challenges WHERE scope_id = ? AND challenge_id = ?")
        .bind(scopeId, authorityChallengeId).first<ChallengeRow>();
      if (!challenge) issues.push("plan activation authority challenge not found");
      else {
        const consumed = hasActivationGate ? guardedConsumed : Boolean(await db.prepare("SELECT challenge_id FROM challenge_consumptions WHERE scope_id = ? AND challenge_id = ?").bind(scopeId, challenge.challenge_id).first());
        if (consumed) issues.push("plan activation authority challenge already consumed");
        if (Date.parse(challenge.expires_at) <= Date.now()) issues.push("plan activation authority challenge expired");
        const expectedCommandHash = await sha256({ targetType: "plan_activation", targetId: activationReceipt.draftId, planId: activationReceipt.fromPlanId, profileHash: challenge.profile_hash, revision: activationReceipt.baseRevision, contentHash: activationReceipt.contentHash, authorityId: activationReceipt.confirmationId });
        if (challenge.plan_id !== activationReceipt.fromPlanId || challenge.revision !== activationReceipt.baseRevision || challenge.target_type !== "plan_activation" || challenge.target_id !== activationReceipt.draftId || challenge.content_hash !== activationReceipt.contentHash || challenge.authority_id !== activationReceipt.confirmationId || challenge.command_hash !== expectedCommandHash) issues.push("plan activation authority challenge does not bind this exact command");
      }
    }
    if (hasActivationGate) {
      const gateResult = await validatePlanActivationGate(db, scopeId, activationGate, { planId: activationReceipt.fromPlanId, profileHash: String(activationGate.baseProfileHash ?? ""), revision: Number(activationReceipt.baseRevision), targetId: activationReceipt.draftId, contentHash: String(activationReceipt.contentHash ?? ""), sourceArrival: activationReceipt.sourceArrival ?? null });
      if (gateResult instanceof Response) return gateResult;
    }
  } else if (activationRequestHash !== null) issues.push("activation request hash present without receipt");
  if (issues.length) return errorResponse(422, "ACCEPTED_TRUTH_INTEGRITY_FAILED", "Initial accepted truth failed validation.", { issues });

  const existing = hasActivationGate ? guardedExistingTarget : await readHead(db, scopeId, envelope.planId);
  if (existing) {
    if (hasActivationGate) return errorResponse(409, "PLAN_ACTIVATION_TARGET_CONFLICT", "The target plan already exists without this activation receipt.", { currentRevision: existing.revision, currentProfileHash: existing.profileHash });
    if (existing.profileHash !== envelope.profileHash) return errorResponse(409, "ACCEPTED_PROFILE_CONFLICT", "Plan id is already bound to another profile hash.", { currentRevision: existing.revision, currentProfileHash: existing.profileHash });
    if (catalogEntry) await db.batch([catalogUpsert(db, scopeId, catalogEntry, envelope, new Date().toISOString())]);
    return response(200, { ok: true, code: "ACCEPTED_TRUTH_CURRENT", envelope: existing, receipt: activationReceipt, requestHash: activationRequestHash, replay: true });
  }

  const now = new Date().toISOString();
  const result = { ok: true, code: "ACCEPTED_TRUTH_INITIALIZED", envelope, receipt: activationReceipt, requestHash: activationRequestHash, replay: false, ...(hasActivationGate ? { constructionPacketCleared: true } : {}) };
  const statements = [
    db.prepare("INSERT INTO plan_heads (scope_id, plan_id, profile_id, profile_hash, revision, snapshot_hash, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(scopeId, envelope.planId, envelope.profileId, envelope.profileHash, envelope.revision, envelope.snapshotHash, now),
    db.prepare("INSERT INTO plan_revisions (scope_id, plan_id, revision, profile_id, profile_hash, snapshot_json, snapshot_hash, previous_snapshot_hash, receipt_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(scopeId, envelope.planId, envelope.revision, envelope.profileId, envelope.profileHash, JSON.stringify(envelope.snapshot), envelope.snapshotHash, null, activationReceipt?.receiptId ?? null, now),
    ...((envelope.snapshot.evidenceRecords ?? []).map((evidence) => db.prepare("INSERT OR IGNORE INTO evidence_records (scope_id, plan_id, evidence_id, record_hash, content_hash, accepted_revision, record_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(scopeId, envelope.planId, evidence.evidenceId, evidence.recordHash, evidence.contentHash, envelope.revision, JSON.stringify(evidence), now))),
    catalogUpsert(db, scopeId, catalogEntry!, envelope, now),
  ];
  if (activationReceipt && activationRequestHash) statements.push(db.prepare("INSERT INTO activation_receipts (scope_id, idempotency_key, receipt_id, from_plan_id, to_plan_id, request_hash, receipt_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(scopeId, activationReceipt.idempotencyKey, activationReceipt.receiptId, activationReceipt.fromPlanId, activationReceipt.toPlanId, activationRequestHash, JSON.stringify(activationReceipt), now));
  if (challenge && activationReceipt) statements.push(db.prepare("INSERT INTO challenge_consumptions (scope_id, challenge_id, plan_id, receipt_id, request_hash, consumed_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(scopeId, challenge.challenge_id, activationReceipt.toPlanId, activationReceipt.receiptId, activationRequestHash, now));
  if (hasActivationGate) statements.push(db.prepare("UPDATE construction_packets SET cleared_at = ?, disposition = 'discarded', return_reason_code = NULL, return_message = NULL, returned_at = NULL, updated_at = ? WHERE scope_id = ? AND packet_id = ? AND cleared_at IS NULL AND disposition = 'current'")
    .bind(now, now, scopeId, activationGate.constructionPacketId));
  try {
    await db.batch(statements);
    return response(201, result);
  } catch {
    if (hasActivationGate && activationReceipt && activationRequestHash) {
      const replay = await loadActivationReplay(db, scopeId, activationReceipt.idempotencyKey);
      if (replay?.requestHash === activationRequestHash) {
        const current = await readHead(db, scopeId, activationReceipt.toPlanId);
        if (current) return response(200, { ...result, code: "ACCEPTED_TRUTH_CURRENT", envelope: current, receipt: replay.receipt, replay: true });
      }
      return errorResponse(409, "ACCEPTED_TRUTH_INITIALIZATION_CONFLICT", "Another operator initialized this plan concurrently.");
    }
    const concurrent = await readHead(db, scopeId, envelope.planId);
    if (concurrent?.profileHash === envelope.profileHash) return response(200, { ...result, code: "ACCEPTED_TRUTH_CURRENT", envelope: concurrent, replay: true });
    return errorResponse(409, "ACCEPTED_TRUTH_INITIALIZATION_CONFLICT", "Another operator initialized this plan concurrently.");
  }
};

const commit = async (db: D1Database, scopeId: string, request: CommitRequest): Promise<Response> => {
  const { requestHash, ...requestBase } = request;
  if (request.commitVersion !== "finite-plan-accepted-commit.v1" || request.scopeId !== contractScopeId || requestHash !== await sha256(requestBase)) return errorResponse(422, "ACCEPTED_COMMIT_HASH_INVALID", "Accepted commit request hash is invalid.");
  const replay = await loadReceiptReplay(db, scopeId, request.envelope.planId, request.receipt.idempotencyKey);
  if (replay) {
    if (replay.requestHash !== requestHash) return errorResponse(409, "IDEMPOTENCY_KEY_REUSED", "Accepted idempotency key was reused with different content.");
    return response(200, { ...replay.response, code: "ACCEPTED_TRUTH_REPLAY", replay: true });
  }

  const issues = await envelopeIssues(request.envelope);
  let challenge: ChallengeRow | null = null;
  const authorityBinding = receiptAuthorityBinding(request.receipt);
  if (!authorityBinding) issues.push("accepted receipt has no exact human-authority binding");
  else {
    if (!request.authorityChallengeId) issues.push("live human authority challenge required");
    else {
      challenge = await db.prepare("SELECT challenge_id, plan_id, profile_hash, revision, target_type, target_id, content_hash, authority_id, command_hash, created_at, expires_at FROM authority_challenges WHERE scope_id = ? AND challenge_id = ?")
        .bind(scopeId, request.authorityChallengeId).first<ChallengeRow>();
      if (!challenge) issues.push("human authority challenge not found");
      else {
        const consumed = await db.prepare("SELECT challenge_id FROM challenge_consumptions WHERE scope_id = ? AND challenge_id = ?").bind(scopeId, challenge.challenge_id).first();
        if (consumed) issues.push("human authority challenge already consumed");
        if (Date.parse(challenge.expires_at) <= Date.now()) issues.push("human authority challenge expired");
        const expectedCommandHash = await sha256({ ...authorityBinding, planId: request.envelope.planId, profileHash: request.envelope.profileHash, revision: request.expectedRevision });
        if (challenge.plan_id !== request.envelope.planId || challenge.profile_hash !== request.envelope.profileHash || challenge.revision !== request.expectedRevision || challenge.target_type !== authorityBinding.targetType || challenge.target_id !== authorityBinding.targetId || challenge.content_hash !== authorityBinding.contentHash || challenge.authority_id !== authorityBinding.authorityId || challenge.command_hash !== expectedCommandHash) issues.push("human authority challenge does not bind this exact command");
      }
    }
  }
  if (!await receiptValid(request.receipt)) issues.push("new receipt checksum invalid");
  if (request.envelope.previousSnapshotHash !== request.previousSnapshotHash) issues.push("predecessor hash mismatch");
  if (request.envelope.revision !== request.expectedRevision + 1 || request.receipt.fromRevision !== request.expectedRevision || request.receipt.toRevision !== request.envelope.revision) issues.push("commit revision lineage invalid");
  if (request.receipt.planId !== request.envelope.planId) issues.push("receipt plan does not match envelope");
  const lastReceipt = request.envelope.snapshot.receipts.at(-1) as Receipt | undefined;
  if (!lastReceipt || lastReceipt.receiptId !== request.receipt.receiptId || stableSerialize(lastReceipt) !== stableSerialize(request.receipt)) issues.push("new receipt is not the snapshot lineage tail");
  if (issues.length) return errorResponse(422, "ACCEPTED_TRUTH_INTEGRITY_FAILED", "Accepted commit failed validation.", { issues });

  const current = await readHead(db, scopeId, request.envelope.planId);
  if (!current) return errorResponse(409, "ACCEPTED_TRUTH_NOT_INITIALIZED", "Plan must be initialized before committing accepted truth.");
  if (current.profileHash !== request.envelope.profileHash) return errorResponse(409, "ACCEPTED_PROFILE_CONFLICT", "Durable profile hash changed.", { currentRevision: current.revision, currentProfileHash: current.profileHash });
  if (current.revision !== request.expectedRevision || current.snapshotHash !== request.previousSnapshotHash) return errorResponse(409, "ACCEPTED_REVISION_CONFLICT", "Accepted truth advanced in another operator session.", { currentRevision: current.revision, currentSnapshotHash: current.snapshotHash });

  const now = new Date().toISOString();
  const result = { ok: true, code: "ACCEPTED_TRUTH_COMMITTED", envelope: request.envelope, receipt: request.receipt, requestHash, replay: false };
  const event = { receiptType: request.receipt.receiptType, payload: request.receipt.payload };
  const statements = [
    db.prepare("UPDATE plan_heads SET revision = ?, snapshot_hash = ?, updated_at = ? WHERE scope_id = ? AND plan_id = ? AND profile_hash = ? AND revision = ? AND snapshot_hash = ?")
      .bind(request.envelope.revision, request.envelope.snapshotHash, now, scopeId, request.envelope.planId, request.envelope.profileHash, request.expectedRevision, request.previousSnapshotHash),
    db.prepare("INSERT INTO plan_revisions (scope_id, plan_id, revision, profile_id, profile_hash, snapshot_json, snapshot_hash, previous_snapshot_hash, receipt_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(scopeId, request.envelope.planId, request.envelope.revision, request.envelope.profileId, request.envelope.profileHash, JSON.stringify(request.envelope.snapshot), request.envelope.snapshotHash, request.previousSnapshotHash, request.receipt.receiptId, now),
    db.prepare("INSERT INTO receipts (scope_id, plan_id, idempotency_key, receipt_id, receipt_type, from_revision, to_revision, replay_checksum, request_hash, response_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(scopeId, request.envelope.planId, request.receipt.idempotencyKey, request.receipt.receiptId, request.receipt.receiptType, request.receipt.fromRevision, request.receipt.toRevision, request.receipt.replayChecksum, requestHash, JSON.stringify(result), now),
    db.prepare("INSERT INTO domain_events (scope_id, event_id, plan_id, receipt_id, event_type, from_revision, to_revision, event_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(scopeId, request.receipt.receiptId, request.envelope.planId, request.receipt.receiptId, request.receipt.receiptType, request.receipt.fromRevision, request.receipt.toRevision, JSON.stringify(event), now),
    ...((request.envelope.snapshot.evidenceRecords ?? []).map((evidence) => db.prepare("INSERT OR IGNORE INTO evidence_records (scope_id, plan_id, evidence_id, record_hash, content_hash, accepted_revision, record_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(scopeId, request.envelope.planId, evidence.evidenceId, evidence.recordHash, evidence.contentHash, request.envelope.revision, JSON.stringify(evidence), now))),
  ];
  if (request.operationProof) {
    const operationHash = await sha256(request.operationProof);
    statements.push(db.prepare("INSERT OR IGNORE INTO operation_log (scope_id, operation_hash, plan_id, tool_name, result_code, before_revision, after_revision, proof_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(scopeId, operationHash, request.envelope.planId, request.operationProof.toolName, request.operationProof.resultCode, request.expectedRevision, request.envelope.revision, JSON.stringify(request.operationProof), now));
  }
  if (challenge) statements.push(db.prepare("INSERT INTO challenge_consumptions (scope_id, challenge_id, plan_id, receipt_id, request_hash, consumed_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(scopeId, challenge.challenge_id, request.envelope.planId, request.receipt.receiptId, requestHash, now));
  try {
    await db.batch(statements);
    const persisted = await readHead(db, scopeId, request.envelope.planId);
    if (!persisted || persisted.snapshotHash !== request.envelope.snapshotHash) throw new Error("COMMIT_NOT_CURRENT");
    return response(201, result);
  } catch {
    const concurrentReplay = await loadReceiptReplay(db, scopeId, request.envelope.planId, request.receipt.idempotencyKey);
    if (concurrentReplay?.requestHash === requestHash) return response(200, { ...concurrentReplay.response, code: "ACCEPTED_TRUTH_REPLAY", replay: true });
    const latest = await readHead(db, scopeId, request.envelope.planId);
    return errorResponse(409, "ACCEPTED_REVISION_CONFLICT", "Accepted truth advanced in another operator session.", { currentRevision: latest?.revision ?? null, currentSnapshotHash: latest?.snapshotHash ?? null });
  }
};

const sessionRecord = (row: SessionRow): JsonRecord => ({
  sessionVersion: "finite-plan-operator-session.v1",
  sessionId: row.session_id,
  idempotencyKey: row.idempotency_key,
  planId: row.plan_id,
  profileHash: row.profile_hash,
  baseRevision: row.base_revision,
  kind: row.kind,
  status: Date.parse(row.expires_at) <= Date.now() && row.status === "active" ? "expired" : row.status,
  payload: JSON.parse(row.payload_json) as JsonRecord,
  contentHash: row.content_hash,
  createdAt: row.created_at,
  expiresAt: row.expires_at,
  closedAt: row.closed_at,
});

const createOperatorSession = async (db: D1Database, scopeId: string, body: JsonRecord): Promise<Response> => {
  const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey : "";
  const planId = typeof body.planId === "string" ? body.planId : "";
  const profileHash = typeof body.profileHash === "string" ? body.profileHash : "";
  const baseRevision = Number(body.baseRevision);
  const kind = body.kind;
  const payload = body.payload;
  if (idempotencyKey.length < 8 || idempotencyKey.length > 100 || !planId || !profileHash || !Number.isInteger(baseRevision) || baseRevision < 1 || !["outcome_intake", "decision_work", "research_handoff"].includes(String(kind)) || !payload || typeof payload !== "object" || Array.isArray(payload) || JSON.stringify(payload).length > 30_000) return errorResponse(422, "OPERATOR_SESSION_INPUT_INVALID", "Operator session input is invalid.");
  const head = await readHead(db, scopeId, planId);
  if (!head || head.profileHash !== profileHash || head.revision !== baseRevision) return errorResponse(409, "OPERATOR_SESSION_BASE_STALE", "Operator work must bind current accepted truth.", { currentRevision: head?.revision ?? null, currentProfileHash: head?.profileHash ?? null });
  const contentBase = { idempotencyKey, planId, profileHash, baseRevision, kind, payload };
  const contentHash = await sha256(contentBase);
  const replay = await db.prepare("SELECT session_id, idempotency_key, plan_id, profile_hash, base_revision, kind, status, payload_json, content_hash, created_at, expires_at, closed_at FROM operator_sessions WHERE scope_id = ? AND idempotency_key = ?")
    .bind(scopeId, idempotencyKey).first<SessionRow>();
  if (replay) {
    if (replay.content_hash !== contentHash) return errorResponse(409, "IDEMPOTENCY_KEY_REUSED", "Operator-session idempotency key was reused with different content.");
    return response(200, { ok: true, code: "OPERATOR_SESSION_REPLAY", session: sessionRecord(replay), replay: true });
  }
  const ttlSeconds = Math.min(604_800, Math.max(60, Number(body.ttlSeconds ?? 86_400)));
  if (!Number.isFinite(ttlSeconds)) return errorResponse(422, "OPERATOR_SESSION_TTL_INVALID", "Operator session TTL is invalid.");
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  const sessionId = `operator_session_${(await sha256({ scopeId, idempotencyKey, contentHash })).slice(0, 16)}`;
  await db.batch([db.prepare("INSERT INTO operator_sessions (scope_id, session_id, idempotency_key, plan_id, profile_hash, base_revision, kind, status, payload_json, content_hash, created_at, expires_at, closed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(scopeId, sessionId, idempotencyKey, planId, profileHash, baseRevision, kind, "active", JSON.stringify(payload), contentHash, createdAt, expiresAt, null)]);
  const row: SessionRow = { session_id: sessionId, idempotency_key: idempotencyKey, plan_id: planId, profile_hash: profileHash, base_revision: baseRevision, kind: String(kind), status: "active", payload_json: JSON.stringify(payload), content_hash: contentHash, created_at: createdAt, expires_at: expiresAt, closed_at: null };
  return response(201, { ok: true, code: "OPERATOR_SESSION_SAVED", session: sessionRecord(row), replay: false });
};

const listOperatorSessions = async (db: D1Database, scopeId: string): Promise<Response> => {
  const rows = await db.prepare("SELECT session_id, idempotency_key, plan_id, profile_hash, base_revision, kind, status, payload_json, content_hash, created_at, expires_at, closed_at FROM operator_sessions WHERE scope_id = ? AND status = ? AND expires_at > ? ORDER BY created_at DESC LIMIT 50")
    .bind(scopeId, "active", new Date().toISOString()).all<SessionRow>();
  return response(200, { ok: true, code: "OPERATOR_SESSIONS", sessions: rows.results.map(sessionRecord) });
};

const loadOperatorSession = async (db: D1Database, scopeId: string, sessionId: string): Promise<Response> => {
  const row = await db.prepare("SELECT session_id, idempotency_key, plan_id, profile_hash, base_revision, kind, status, payload_json, content_hash, created_at, expires_at, closed_at FROM operator_sessions WHERE scope_id = ? AND session_id = ?")
    .bind(scopeId, sessionId).first<SessionRow>();
  if (!row) return errorResponse(404, "OPERATOR_SESSION_NOT_FOUND", "Operator session was not found.");
  if (Date.parse(row.expires_at) <= Date.now()) return errorResponse(410, "OPERATOR_SESSION_EXPIRED", "Operator session expired.");
  if (row.status !== "active") return errorResponse(409, "OPERATOR_SESSION_CLOSED", "Operator session is closed.");
  return response(200, { ok: true, code: "OPERATOR_SESSION", session: sessionRecord(row) });
};

const closeOperatorSession = async (db: D1Database, scopeId: string, sessionId: string): Promise<Response> => {
  const loaded = await db.prepare("SELECT session_id, idempotency_key, plan_id, profile_hash, base_revision, kind, status, payload_json, content_hash, created_at, expires_at, closed_at FROM operator_sessions WHERE scope_id = ? AND session_id = ?")
    .bind(scopeId, sessionId).first<SessionRow>();
  if (!loaded) return errorResponse(404, "OPERATOR_SESSION_NOT_FOUND", "Operator session was not found.");
  const closedAt = loaded.closed_at ?? new Date().toISOString();
  if (loaded.status === "active") await db.batch([db.prepare("UPDATE operator_sessions SET status = ?, closed_at = ? WHERE scope_id = ? AND session_id = ? AND status = ?").bind("closed", closedAt, scopeId, sessionId, "active")]);
  return response(200, { ok: true, code: "OPERATOR_SESSION_CLOSED", session: sessionRecord({ ...loaded, status: "closed", closed_at: closedAt }) });
};

const createAuthorityChallenge = async (db: D1Database, scopeId: string, body: JsonRecord): Promise<Response> => {
  const planId = String(body.planId ?? "");
  const profileHash = String(body.profileHash ?? "");
  const revision = Number(body.revision);
  const targetType = String(body.targetType ?? "");
  const targetId = String(body.targetId ?? "");
  const contentHash = String(body.contentHash ?? "");
  const authorityId = String(body.authorityId ?? "");
  if (!planId || !profileHash || !Number.isInteger(revision) || revision < 1 || !authorityTargetTypes.has(targetType) || !targetId || !contentHash || !authorityId) return errorResponse(422, "AUTHORITY_CHALLENGE_INPUT_INVALID", "Human authority challenge input is invalid.");
  const head = await readHead(db, scopeId, planId);
  if (!head || head.profileHash !== profileHash || head.revision !== revision) return errorResponse(409, "AUTHORITY_CHALLENGE_BASE_STALE", "Human authority must bind current accepted truth.");
  const commandHash = await sha256({ targetType, targetId, planId, profileHash, revision, contentHash, authorityId });
  const challengeId = `authority_${commandHash.slice(0, 16)}`;
  const existing = await db.prepare("SELECT challenge_id, plan_id, profile_hash, revision, target_type, target_id, content_hash, authority_id, command_hash, created_at, expires_at FROM authority_challenges WHERE scope_id = ? AND challenge_id = ?")
    .bind(scopeId, challengeId).first<ChallengeRow>();
  if (existing) {
    if (Date.parse(existing.expires_at) <= Date.now()) return errorResponse(410, "AUTHORITY_CHALLENGE_EXPIRED", "The prior exact human challenge expired; create fresh human authority.");
    return response(200, { ok: true, code: "AUTHORITY_CHALLENGE_CURRENT", challenge: { challengeVersion: "finite-plan-authority-challenge.v1", challengeId, planId, profileHash, revision, targetType, targetId, contentHash, authorityId, commandHash, createdAt: existing.created_at, expiresAt: existing.expires_at } });
  }
  const requestedTtlSeconds = Number(body.ttlSeconds ?? 300);
  if (!Number.isFinite(requestedTtlSeconds)) return errorResponse(422, "AUTHORITY_CHALLENGE_TTL_INVALID", "Human authority challenge TTL is invalid.");
  const ttlSeconds = Math.min(600, Math.max(30, requestedTtlSeconds));
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  await db.batch([db.prepare("INSERT INTO authority_challenges (scope_id, challenge_id, plan_id, profile_hash, revision, target_type, target_id, content_hash, authority_id, command_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(scopeId, challengeId, planId, profileHash, revision, targetType, targetId, contentHash, authorityId, commandHash, createdAt, expiresAt)]);
  return response(201, { ok: true, code: "AUTHORITY_CHALLENGE_CREATED", challenge: { challengeVersion: "finite-plan-authority-challenge.v1", challengeId, planId, profileHash, revision, targetType, targetId, contentHash, authorityId, commandHash, createdAt, expiresAt } });
};

const createPlanActivationChallenge = async (db: D1Database, scopeId: string, body: JsonRecord): Promise<Response> => {
  const planId = String(body.planId ?? "");
  const profileHash = String(body.profileHash ?? "");
  const revision = Number(body.revision);
  const targetId = String(body.targetId ?? "");
  const contentHash = String(body.contentHash ?? "");
  const authorityId = String(body.authorityId ?? "");
  if (body.targetType !== "plan_activation") return errorResponse(422, "PLAN_ACTIVATION_GATE_INVALID", "Only an exact plan-activation challenge can use this route.");
  if (!planId || !profileHash || !Number.isInteger(revision) || revision < 1 || !targetId || !contentHash || !authorityId) return errorResponse(422, "AUTHORITY_CHALLENGE_INPUT_INVALID", "Human authority challenge input is invalid.");
  const gate = asRecord(body.gate);
  const gateResult = await validatePlanActivationGate(db, scopeId, gate, {
    planId,
    profileHash,
    revision,
    targetId,
    contentHash,
  });
  if (gateResult instanceof Response) return gateResult;
  const commandHash = await sha256({ targetType: "plan_activation", targetId, planId, profileHash, revision, contentHash, authorityId });
  const challengeId = `authority_${commandHash.slice(0, 16)}`;
  const requestedTtlSeconds = Number(body.ttlSeconds ?? 300);
  if (!Number.isFinite(requestedTtlSeconds)) return errorResponse(422, "AUTHORITY_CHALLENGE_TTL_INVALID", "Human authority challenge TTL is invalid.");
  const ttlSeconds = Math.min(600, Math.max(30, requestedTtlSeconds));
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  const [inserted] = await db.batch([db.prepare("INSERT OR IGNORE INTO authority_challenges (scope_id, challenge_id, plan_id, profile_hash, revision, target_type, target_id, content_hash, authority_id, command_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(scopeId, challengeId, planId, profileHash, revision, "plan_activation", targetId, contentHash, authorityId, commandHash, createdAt, expiresAt)]);
  if ((inserted?.meta?.changes ?? 0) === 1) return response(201, { ok: true, code: "AUTHORITY_CHALLENGE_CREATED", challenge: { challengeVersion: "finite-plan-authority-challenge.v1", challengeId, planId, profileHash, revision, targetType: "plan_activation", targetId, contentHash, authorityId, commandHash, createdAt, expiresAt } });
  const existing = await db.prepare("SELECT challenge_id, plan_id, profile_hash, revision, target_type, target_id, content_hash, authority_id, command_hash, created_at, expires_at FROM authority_challenges WHERE scope_id = ? AND challenge_id = ?")
    .bind(scopeId, challengeId).first<ChallengeRow>();
  if (!existing) return errorResponse(409, "AUTHORITY_CHALLENGE_CONFLICT", "The exact human challenge could not be persisted.");
  if (Date.parse(existing.expires_at) <= Date.now()) return errorResponse(410, "AUTHORITY_CHALLENGE_EXPIRED", "The prior exact human challenge expired; create fresh human authority.");
  return response(200, { ok: true, code: "AUTHORITY_CHALLENGE_CURRENT", challenge: { challengeVersion: "finite-plan-authority-challenge.v1", challengeId, planId, profileHash, revision, targetType: "plan_activation", targetId, contentHash, authorityId, commandHash, createdAt: existing.created_at, expiresAt: existing.expires_at } });
};

const loadAuthorityChallenge = async (db: D1Database, scopeId: string, challengeId: string): Promise<Response> => {
  const row = await db.prepare("SELECT challenge_id, plan_id, profile_hash, revision, target_type, target_id, content_hash, authority_id, command_hash, created_at, expires_at FROM authority_challenges WHERE scope_id = ? AND challenge_id = ?")
    .bind(scopeId, challengeId).first<ChallengeRow>();
  if (!row) return errorResponse(404, "AUTHORITY_CHALLENGE_NOT_FOUND", "Human authority challenge was not found.");
  const consumed = await db.prepare("SELECT challenge_id FROM challenge_consumptions WHERE scope_id = ? AND challenge_id = ?").bind(scopeId, challengeId).first();
  if (consumed) return errorResponse(409, "AUTHORITY_CHALLENGE_CONSUMED", "Human authority challenge was already consumed.");
  if (Date.parse(row.expires_at) <= Date.now()) return errorResponse(410, "AUTHORITY_CHALLENGE_EXPIRED", "Human authority challenge expired.");
  return response(200, { ok: true, code: "AUTHORITY_CHALLENGE", challenge: { challengeVersion: "finite-plan-authority-challenge.v1", challengeId: row.challenge_id, planId: row.plan_id, profileHash: row.profile_hash, revision: row.revision, targetType: row.target_type, targetId: row.target_id, contentHash: row.content_hash, authorityId: row.authority_id, commandHash: row.command_hash, createdAt: row.created_at, expiresAt: row.expires_at } });
};

export const handleAcceptedTruthRequest = async (request: Request, db: D1Database): Promise<Response | null> => {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/accepted-truth") && !url.pathname.startsWith("/api/operator-sessions") && !url.pathname.startsWith("/api/authority-challenges") && url.pathname !== "/api/plan-catalog") return null;
  if (request.method !== "GET" && !sameOriginWrite(request)) return errorResponse(403, "CROSS_ORIGIN_WRITE_REFUSED", "Finite writes must be same-origin.");
  try {
    const scopeId = await ensureAuthenticatedTenant(request, db);
    if (request.method === "GET" && url.pathname === "/api/plan-catalog") return listCatalog(db, scopeId);
    if (request.method === "POST" && url.pathname === "/api/operator-sessions") return createOperatorSession(db, scopeId, await parseJson(request));
    if (request.method === "GET" && url.pathname === "/api/operator-sessions") return listOperatorSessions(db, scopeId);
    if (request.method === "POST" && url.pathname === "/api/authority-challenges/plan-activation") return createPlanActivationChallenge(db, scopeId, await parseJson(request));
    if (request.method === "POST" && url.pathname === "/api/authority-challenges") return createAuthorityChallenge(db, scopeId, await parseJson(request));
    if (request.method === "GET" && url.pathname.startsWith("/api/authority-challenges/")) {
      const challengeId = decodeURIComponent(url.pathname.slice("/api/authority-challenges/".length));
      if (challengeId && !challengeId.includes("/")) return loadAuthorityChallenge(db, scopeId, challengeId);
    }
    if (url.pathname.startsWith("/api/operator-sessions/")) {
      const suffix = decodeURIComponent(url.pathname.slice("/api/operator-sessions/".length));
      if (request.method === "POST" && suffix.endsWith("/close")) return closeOperatorSession(db, scopeId, suffix.slice(0, -"/close".length));
      if (request.method === "GET" && suffix && !suffix.includes("/")) return loadOperatorSession(db, scopeId, suffix);
    }
    if (request.method === "POST" && url.pathname === "/api/accepted-truth/initialize") return initialize(db, scopeId, await parseJson(request));
    if (request.method === "POST" && url.pathname === "/api/accepted-truth/commit") return commit(db, scopeId, await parseJson(request) as CommitRequest);
    if (request.method === "GET" && url.pathname.startsWith("/api/accepted-truth/")) {
      const planId = decodeURIComponent(url.pathname.slice("/api/accepted-truth/".length));
      if (!planId || planId.includes("/")) return errorResponse(400, "PLAN_ID_INVALID", "A single plan id is required.");
      const envelope = await readHead(db, scopeId, planId);
      if (!envelope) return errorResponse(404, "ACCEPTED_TRUTH_NOT_FOUND", "No accepted truth exists for this plan.");
      const expectedHash = url.searchParams.get("profileHash");
      if (!expectedHash || expectedHash !== envelope.profileHash) return errorResponse(409, "ACCEPTED_PROFILE_CONFLICT", "Durable plan profile hash does not match the requested profile.", { currentRevision: envelope.revision, currentProfileHash: envelope.profileHash });
      return response(200, { ok: true, envelope });
    }
    return errorResponse(405, "METHOD_NOT_ALLOWED", "Unsupported accepted-truth operation.");
  } catch (error) {
    const code = error instanceof Error ? error.message : "ACCEPTED_TRUTH_SERVICE_FAILED";
    if (code === "AUTHENTICATED_USER_REQUIRED") return errorResponse(401, code, "Sign in with ChatGPT or start an isolated demo session.");
    if (["JSON_CONTENT_TYPE_REQUIRED", "JSON_BODY_TOO_LARGE", "JSON_OBJECT_REQUIRED"].includes(code)) return errorResponse(400, code, "Accepted-truth request body is invalid.");
    return errorResponse(500, "ACCEPTED_TRUTH_SERVICE_FAILED", "Accepted-truth service failed safely.");
  }
};
