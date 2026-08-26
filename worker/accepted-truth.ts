interface D1Result<T = Record<string, unknown>> {
  success: boolean;
  meta?: { changes?: number };
  results?: T[];
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
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
}

interface CommitRequest extends JsonRecord {
  commitVersion: string;
  scopeId: string;
  expectedRevision: number;
  previousSnapshotHash: string;
  envelope: Envelope;
  receipt: Receipt;
  operationProof: JsonRecord | null;
  requestHash: string;
}

interface HeadRow {
  profile_id: string;
  profile_hash: string;
  revision: number;
  snapshot_hash: string;
  snapshot_json: string;
  previous_snapshot_hash: string | null;
}

const scopeId = "owner-private-v1";
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

const response = (status: number, body: JsonRecord): Response => new Response(JSON.stringify(body), { status, headers: jsonHeaders });

const errorResponse = (status: number, code: string, message: string, details: JsonRecord = {}): Response =>
  response(status, { ok: false, code, message, ...details });

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

const envelopeIssues = async (envelope: Envelope): Promise<string[]> => {
  const issues: string[] = [];
  const snapshot = envelope.snapshot;
  if (envelope.envelopeVersion !== "finite-plan-accepted-truth.v1" || envelope.scopeId !== scopeId) issues.push("invalid envelope contract");
  if (!snapshot || snapshot.snapshotVersion !== "finite-plan-snapshot.v1") return [...issues, "invalid snapshot contract"];
  if (envelope.planId !== snapshot.planId || envelope.profileId !== snapshot.profileId || envelope.profileHash !== snapshot.profileHash || envelope.revision !== snapshot.revision) issues.push("envelope identity does not match snapshot");
  if (!Number.isInteger(snapshot.revision) || snapshot.revision < 1) issues.push("invalid snapshot revision");
  const allocation = snapshot.accepted;
  const parts = allocation && [allocation.totalBudgetMinor, allocation.spentMinor, allocation.committedMinor, allocation.forecastMinor, allocation.bufferMinor];
  if (!parts || parts.some((value) => !isSafeInteger(value))) issues.push("invalid finite allocation");
  else if (allocation.spentMinor + allocation.committedMinor + allocation.forecastMinor + allocation.bufferMinor !== allocation.totalBudgetMinor) issues.push("finite allocation does not conserve total");
  if (await sha256(snapshot) !== envelope.snapshotHash) issues.push("snapshot hash mismatch");
  if (!Array.isArray(snapshot.receipts) || !Array.isArray(snapshot.events) || !Array.isArray(snapshot.correctionEvents) || !Array.isArray(snapshot.preferenceEvents)) issues.push("invalid append-only collections");
  const receipts = Array.isArray(snapshot.receipts) ? snapshot.receipts as Receipt[] : [];
  if (!(await Promise.all(receipts.map(receiptValid))).every(Boolean)) issues.push("invalid historical receipt checksum");
  if (new Set(receipts.map((item) => item.receiptId)).size !== receipts.length || new Set(receipts.map((item) => item.idempotencyKey)).size !== receipts.length) issues.push("duplicate historical receipt identity");
  for (const item of receipts) if (item.planId !== snapshot.planId || item.fromRevision + 1 !== item.toRevision || item.toRevision > snapshot.revision) issues.push("invalid historical receipt lineage");
  const evidence = Array.isArray(snapshot.evidenceRecords) ? snapshot.evidenceRecords : [];
  for (const item of evidence) {
    if (typeof item.content !== "string" || await sha256({ content: item.content }) !== item.contentHash) issues.push("invalid evidence content hash");
    const { evidenceId: _evidenceId, recordHash, ...base } = item;
    if (typeof recordHash !== "string" || await sha256(base) !== recordHash) issues.push("invalid evidence provenance hash");
  }
  return [...new Set(issues)];
};

const readHead = async (db: D1Database, planId: string): Promise<Envelope | null> => {
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
    scopeId,
    planId,
    profileId: row.profile_id,
    profileHash: row.profile_hash,
    revision: row.revision,
    snapshot,
    snapshotHash: row.snapshot_hash,
    previousSnapshotHash: row.previous_snapshot_hash,
  };
};

const loadReceiptReplay = async (db: D1Database, planId: string, idempotencyKey: string): Promise<{ requestHash: string; response: JsonRecord } | null> => {
  const row = await db.prepare("SELECT request_hash, response_json FROM receipts WHERE scope_id = ? AND plan_id = ? AND idempotency_key = ?")
    .bind(scopeId, planId, idempotencyKey).first<{ request_hash: string; response_json: string }>();
  return row ? { requestHash: row.request_hash, response: JSON.parse(row.response_json) as JsonRecord } : null;
};

const loadActivationReplay = async (db: D1Database, idempotencyKey: string): Promise<{ requestHash: string; receipt: ActivationReceipt } | null> => {
  const row = await db.prepare("SELECT request_hash, receipt_json FROM activation_receipts WHERE scope_id = ? AND idempotency_key = ?")
    .bind(scopeId, idempotencyKey).first<{ request_hash: string; receipt_json: string }>();
  return row ? { requestHash: row.request_hash, receipt: JSON.parse(row.receipt_json) as ActivationReceipt } : null;
};

const initialize = async (db: D1Database, body: JsonRecord): Promise<Response> => {
  const envelope = body.envelope as Envelope;
  const activationReceipt = body.activationReceipt as ActivationReceipt | null;
  const activationRequestHash = body.activationRequestHash as string | null;
  const issues = await envelopeIssues(envelope);
  if (envelope.previousSnapshotHash !== null || envelope.revision !== 1) issues.push("initial accepted truth must begin at revision one without a predecessor");
  if (activationReceipt) {
    if (!await activationReceiptValid(activationReceipt)) issues.push("invalid activation receipt checksum");
    if (activationReceipt.toPlanId !== envelope.planId) issues.push("activation target does not match envelope plan");
    if (activationRequestHash !== await sha256({ envelope, activationReceipt })) issues.push("activation request hash mismatch");
    const replay = await loadActivationReplay(db, activationReceipt.idempotencyKey);
    if (replay) {
      if (replay.requestHash !== activationRequestHash) return errorResponse(409, "IDEMPOTENCY_KEY_REUSED", "Activation idempotency key was reused with different content.");
      const current = await readHead(db, replay.receipt.toPlanId);
      if (!current) return errorResponse(500, "ACTIVATION_REPLAY_HEAD_MISSING", "Activation receipt exists without its accepted head.");
      return response(200, { ok: true, code: "ACCEPTED_TRUTH_CURRENT", envelope: current, receipt: replay.receipt, requestHash: activationRequestHash, replay: true });
    }
  } else if (activationRequestHash !== null) issues.push("activation request hash present without receipt");
  if (issues.length) return errorResponse(422, "ACCEPTED_TRUTH_INTEGRITY_FAILED", "Initial accepted truth failed validation.", { issues });

  const existing = await readHead(db, envelope.planId);
  if (existing) {
    if (existing.profileHash !== envelope.profileHash) return errorResponse(409, "ACCEPTED_PROFILE_CONFLICT", "Plan id is already bound to another profile hash.", { currentRevision: existing.revision, currentProfileHash: existing.profileHash });
    return response(200, { ok: true, code: "ACCEPTED_TRUTH_CURRENT", envelope: existing, receipt: activationReceipt, requestHash: activationRequestHash, replay: true });
  }

  const now = new Date().toISOString();
  const result = { ok: true, code: "ACCEPTED_TRUTH_INITIALIZED", envelope, receipt: activationReceipt, requestHash: activationRequestHash, replay: false };
  const statements = [
    db.prepare("INSERT INTO plan_heads (scope_id, plan_id, profile_id, profile_hash, revision, snapshot_hash, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(scopeId, envelope.planId, envelope.profileId, envelope.profileHash, envelope.revision, envelope.snapshotHash, now),
    db.prepare("INSERT INTO plan_revisions (scope_id, plan_id, revision, profile_id, profile_hash, snapshot_json, snapshot_hash, previous_snapshot_hash, receipt_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(scopeId, envelope.planId, envelope.revision, envelope.profileId, envelope.profileHash, JSON.stringify(envelope.snapshot), envelope.snapshotHash, null, activationReceipt?.receiptId ?? null, now),
    ...((envelope.snapshot.evidenceRecords ?? []).map((evidence) => db.prepare("INSERT OR IGNORE INTO evidence_records (scope_id, plan_id, evidence_id, record_hash, content_hash, accepted_revision, record_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(scopeId, envelope.planId, evidence.evidenceId, evidence.recordHash, evidence.contentHash, envelope.revision, JSON.stringify(evidence), now))),
  ];
  if (activationReceipt && activationRequestHash) statements.push(db.prepare("INSERT INTO activation_receipts (scope_id, idempotency_key, receipt_id, from_plan_id, to_plan_id, request_hash, receipt_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(scopeId, activationReceipt.idempotencyKey, activationReceipt.receiptId, activationReceipt.fromPlanId, activationReceipt.toPlanId, activationRequestHash, JSON.stringify(activationReceipt), now));
  try {
    await db.batch(statements);
    return response(201, result);
  } catch {
    const concurrent = await readHead(db, envelope.planId);
    if (concurrent?.profileHash === envelope.profileHash) return response(200, { ...result, code: "ACCEPTED_TRUTH_CURRENT", envelope: concurrent, replay: true });
    return errorResponse(409, "ACCEPTED_TRUTH_INITIALIZATION_CONFLICT", "Another operator initialized this plan concurrently.");
  }
};

const commit = async (db: D1Database, request: CommitRequest): Promise<Response> => {
  const { requestHash, ...requestBase } = request;
  if (request.commitVersion !== "finite-plan-accepted-commit.v1" || request.scopeId !== scopeId || requestHash !== await sha256(requestBase)) return errorResponse(422, "ACCEPTED_COMMIT_HASH_INVALID", "Accepted commit request hash is invalid.");
  const replay = await loadReceiptReplay(db, request.envelope.planId, request.receipt.idempotencyKey);
  if (replay) {
    if (replay.requestHash !== requestHash) return errorResponse(409, "IDEMPOTENCY_KEY_REUSED", "Accepted idempotency key was reused with different content.");
    return response(200, { ...replay.response, code: "ACCEPTED_TRUTH_REPLAY", replay: true });
  }

  const issues = await envelopeIssues(request.envelope);
  if (!await receiptValid(request.receipt)) issues.push("new receipt checksum invalid");
  if (request.envelope.previousSnapshotHash !== request.previousSnapshotHash) issues.push("predecessor hash mismatch");
  if (request.envelope.revision !== request.expectedRevision + 1 || request.receipt.fromRevision !== request.expectedRevision || request.receipt.toRevision !== request.envelope.revision) issues.push("commit revision lineage invalid");
  if (request.receipt.planId !== request.envelope.planId) issues.push("receipt plan does not match envelope");
  const lastReceipt = request.envelope.snapshot.receipts.at(-1) as Receipt | undefined;
  if (!lastReceipt || lastReceipt.receiptId !== request.receipt.receiptId || stableSerialize(lastReceipt) !== stableSerialize(request.receipt)) issues.push("new receipt is not the snapshot lineage tail");
  if (issues.length) return errorResponse(422, "ACCEPTED_TRUTH_INTEGRITY_FAILED", "Accepted commit failed validation.", { issues });

  const current = await readHead(db, request.envelope.planId);
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
  try {
    await db.batch(statements);
    const persisted = await readHead(db, request.envelope.planId);
    if (!persisted || persisted.snapshotHash !== request.envelope.snapshotHash) throw new Error("COMMIT_NOT_CURRENT");
    return response(201, result);
  } catch {
    const concurrentReplay = await loadReceiptReplay(db, request.envelope.planId, request.receipt.idempotencyKey);
    if (concurrentReplay?.requestHash === requestHash) return response(200, { ...concurrentReplay.response, code: "ACCEPTED_TRUTH_REPLAY", replay: true });
    const latest = await readHead(db, request.envelope.planId);
    return errorResponse(409, "ACCEPTED_REVISION_CONFLICT", "Accepted truth advanced in another operator session.", { currentRevision: latest?.revision ?? null, currentSnapshotHash: latest?.snapshotHash ?? null });
  }
};

export const handleAcceptedTruthRequest = async (request: Request, db: D1Database): Promise<Response | null> => {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/accepted-truth")) return null;
  if (request.method === "POST" && !sameOriginWrite(request)) return errorResponse(403, "CROSS_ORIGIN_WRITE_REFUSED", "Accepted-truth writes must be same-origin.");
  try {
    if (request.method === "POST" && url.pathname === "/api/accepted-truth/initialize") return initialize(db, await parseJson(request));
    if (request.method === "POST" && url.pathname === "/api/accepted-truth/commit") return commit(db, await parseJson(request) as CommitRequest);
    if (request.method === "GET" && url.pathname.startsWith("/api/accepted-truth/")) {
      const planId = decodeURIComponent(url.pathname.slice("/api/accepted-truth/".length));
      if (!planId || planId.includes("/")) return errorResponse(400, "PLAN_ID_INVALID", "A single plan id is required.");
      const envelope = await readHead(db, planId);
      if (!envelope) return errorResponse(404, "ACCEPTED_TRUTH_NOT_FOUND", "No accepted truth exists for this plan.");
      const expectedHash = url.searchParams.get("profileHash");
      if (!expectedHash || expectedHash !== envelope.profileHash) return errorResponse(409, "ACCEPTED_PROFILE_CONFLICT", "Durable plan profile hash does not match the requested profile.", { currentRevision: envelope.revision, currentProfileHash: envelope.profileHash });
      return response(200, { ok: true, envelope });
    }
    return errorResponse(405, "METHOD_NOT_ALLOWED", "Unsupported accepted-truth operation.");
  } catch (error) {
    const code = error instanceof Error ? error.message : "ACCEPTED_TRUTH_SERVICE_FAILED";
    if (["JSON_CONTENT_TYPE_REQUIRED", "JSON_BODY_TOO_LARGE", "JSON_OBJECT_REQUIRED"].includes(code)) return errorResponse(400, code, "Accepted-truth request body is invalid.");
    return errorResponse(500, "ACCEPTED_TRUTH_SERVICE_FAILED", "Accepted-truth service failed safely.");
  }
};
