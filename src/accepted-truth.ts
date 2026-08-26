import { clone, sha256 } from "./crypto.js";
import { externalActionStatuses } from "./operator-policy.js";
import type { CompiledProfile, EvidenceRecord, PlanActivationReceipt, PlanSnapshot, Receipt } from "./types.js";

export const acceptedTruthScope = "authenticated-user-v1";

export interface AcceptedTruthEnvelope {
  envelopeVersion: "finite-plan-accepted-truth.v1";
  scopeId: typeof acceptedTruthScope;
  planId: string;
  profileId: string;
  profileHash: string;
  revision: number;
  snapshot: PlanSnapshot;
  snapshotHash: string;
  previousSnapshotHash: string | null;
}

export interface AcceptedTruthCommitRequest {
  commitVersion: "finite-plan-accepted-commit.v1";
  scopeId: typeof acceptedTruthScope;
  expectedRevision: number;
  previousSnapshotHash: string;
  envelope: AcceptedTruthEnvelope;
  receipt: Receipt;
  authorityChallengeId: string | null;
  operationProof: Record<string, unknown> | null;
  requestHash: string;
}

export interface AuthorityChallenge {
  challengeVersion: "finite-plan-authority-challenge.v1";
  challengeId: string;
  planId: string;
  profileHash: string;
  revision: number;
  targetType: "plan_option";
  targetId: string;
  contentHash: string;
  authorityId: string;
  commandHash: string;
  createdAt: string;
  expiresAt: string;
}

export interface OperatorSession {
  sessionVersion: "finite-plan-operator-session.v1";
  sessionId: string;
  idempotencyKey: string;
  planId: string;
  profileHash: string;
  baseRevision: number;
  kind: "outcome_intake" | "decision_work" | "research_handoff";
  status: "active" | "closed" | "expired";
  payload: Record<string, unknown>;
  contentHash: string;
  createdAt: string;
  expiresAt: string;
  closedAt: string | null;
}

export interface AcceptedTruthCommitResult {
  ok: true;
  code: "ACCEPTED_TRUTH_COMMITTED" | "ACCEPTED_TRUTH_REPLAY" | "ACCEPTED_TRUTH_INITIALIZED" | "ACCEPTED_TRUTH_CURRENT";
  envelope: AcceptedTruthEnvelope;
  receipt: Receipt | PlanActivationReceipt | null;
  requestHash: string | null;
  replay: boolean;
}

export class AcceptedTruthRepositoryError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "AcceptedTruthRepositoryError";
  }
}

export interface AcceptedTruthRepository {
  initialize(snapshot: PlanSnapshot, activationReceipt?: PlanActivationReceipt): Promise<AcceptedTruthCommitResult>;
  load(planId: string, profileHash: string): Promise<AcceptedTruthEnvelope | null>;
  commit(input: {
    expectedRevision: number;
    previousSnapshotHash: string;
    snapshot: PlanSnapshot;
    receipt: Receipt;
    authorityChallengeId?: string | null;
    operationProof?: Record<string, unknown> | null;
  }): Promise<AcceptedTruthCommitResult>;
  createAuthorityChallenge?(input: {
    planId: string;
    profileHash: string;
    revision: number;
    targetId: string;
    contentHash: string;
    authorityId: string;
  }): Promise<AuthorityChallenge>;
  loadAuthorityChallenge?(challengeId: string): Promise<AuthorityChallenge>;
  saveOperatorSession?(input: {
    idempotencyKey: string;
    planId: string;
    profileHash: string;
    baseRevision: number;
    kind: OperatorSession["kind"];
    payload: Record<string, unknown>;
    ttlSeconds?: number;
  }): Promise<OperatorSession>;
  listOperatorSessions?(): Promise<OperatorSession[]>;
  loadOperatorSession?(sessionId: string): Promise<OperatorSession>;
  closeOperatorSession?(sessionId: string): Promise<OperatorSession>;
}

const evidenceIntegrity = async (evidence: EvidenceRecord): Promise<boolean> => {
  const { evidenceId: _evidenceId, recordHash, ...base } = evidence;
  return await sha256({ content: evidence.content }) === evidence.contentHash && await sha256(base) === recordHash;
};

export const receiptIntegrity = async (receipt: Receipt): Promise<boolean> => {
  const { replayChecksum, ...base } = receipt;
  return await sha256(base) === replayChecksum;
};

export const activationReceiptIntegrity = async (receipt: PlanActivationReceipt): Promise<boolean> => {
  const { receiptId, replayChecksum, ...base } = receipt;
  return receiptId === `plan_activation_${replayChecksum.slice(0, 16)}` && await sha256(base) === replayChecksum;
};

export const snapshotIntegrityIssues = async (profile: CompiledProfile, snapshot: PlanSnapshot): Promise<string[]> => {
  const issues: string[] = [];
  if (snapshot.snapshotVersion !== "finite-plan-snapshot.v1") issues.push("unsupported snapshot version");
  if (snapshot.planId !== profile.planId) issues.push("snapshot plan id does not match profile");
  if (snapshot.profileId !== profile.profileId) issues.push("snapshot family does not match profile");
  if (snapshot.profileHash !== profile.profileHash) issues.push("snapshot profile hash does not match profile");
  if (!Number.isInteger(snapshot.revision) || snapshot.revision < 1) issues.push("snapshot revision must be a positive integer");
  if (snapshot.lifecycle && !["active", "paused", "completed", "abandoned"].includes(snapshot.lifecycle.status)) issues.push("snapshot lifecycle status is invalid");
  const allocation = snapshot.accepted;
  const allocationValues = [allocation.totalBudgetMinor, allocation.spentMinor, allocation.committedMinor, allocation.forecastMinor, allocation.bufferMinor];
  if (allocationValues.some((value) => !Number.isSafeInteger(value) || value < 0)) issues.push("snapshot allocation contains invalid minor units");
  if (allocation.spentMinor + allocation.committedMinor + allocation.forecastMinor + allocation.bufferMinor !== allocation.totalBudgetMinor) issues.push("snapshot allocation does not conserve the finite total");

  for (const relationship of profile.relationships) {
    const left = snapshot.entities[relationship.left.entityId]?.values[relationship.left.field];
    const right = snapshot.entities[relationship.right.entityId]?.values[relationship.right.field];
    if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right)) issues.push(`relationship ${relationship.relationshipId} has missing snapshot values`);
    else if (relationship.type === "equal" ? left !== right : left! > right!) issues.push(`relationship ${relationship.relationshipId} is violated`);
  }

  const receiptIntegrityResults = await Promise.all(snapshot.receipts.map(receiptIntegrity));
  if (receiptIntegrityResults.some((valid) => !valid)) issues.push("snapshot contains a receipt with invalid checksum");
  if (new Set(snapshot.receipts.map((receipt) => receipt.receiptId)).size !== snapshot.receipts.length) issues.push("snapshot receipt ids are not unique");
  if (new Set(snapshot.receipts.map((receipt) => receipt.idempotencyKey)).size !== snapshot.receipts.length) issues.push("snapshot idempotency keys are not unique");
  const revisionReceipts = new Map(snapshot.receipts.map((receipt) => [receipt.toRevision, receipt]));
  for (let revision = 2; revision <= snapshot.revision; revision += 1) if (!revisionReceipts.has(revision)) issues.push(`snapshot is missing the receipt for revision ${revision}`);
  for (const receipt of snapshot.receipts) {
    if (receipt.planId !== snapshot.planId) issues.push(`receipt ${receipt.receiptId} belongs to another plan`);
    if (receipt.fromRevision + 1 !== receipt.toRevision || receipt.toRevision > snapshot.revision) issues.push(`receipt ${receipt.receiptId} has invalid revision lineage`);
  }

  const evidence = snapshot.evidenceRecords ?? [];
  const evidenceResults = await Promise.all(evidence.map(evidenceIntegrity));
  if (evidenceResults.some((valid) => !valid)) issues.push("snapshot contains evidence with invalid content or provenance hash");
  if (new Set(evidence.map((record) => record.evidenceId)).size !== evidence.length) issues.push("snapshot evidence ids are not unique");
  const evidenceIds = new Set(evidence.map((record) => record.evidenceId));
  for (const event of snapshot.events) for (const evidenceId of event.evidenceRefs) if (!evidenceIds.has(evidenceId)) issues.push(`accepted event references missing evidence ${evidenceId}`);
  for (const event of snapshot.correctionEvents) if (!evidenceIds.has(event.evidenceRef)) issues.push(`accepted correction references missing evidence ${event.evidenceRef}`);
  for (const event of snapshot.externalActionEvents ?? []) if (event.evidenceRef && !evidenceIds.has(event.evidenceRef)) issues.push(`accepted external action references missing evidence ${event.evidenceRef}`);
  const appendOnlyEvents = [...snapshot.correctionEvents, ...snapshot.preferenceEvents, ...(snapshot.lifecycleEvents ?? []), ...(snapshot.groupDecisionEvents ?? []), ...(snapshot.externalActionEvents ?? [])];
  for (const event of appendOnlyEvents) if (event.fromRevision + 1 !== event.toRevision || event.toRevision > snapshot.revision) issues.push(`accepted ${event.eventType} event has invalid revision lineage`);
  for (const event of snapshot.groupDecisionEvents ?? []) {
    if (event.positions.length < 2 || new Set(event.positions.map((position) => position.participantId)).size !== event.positions.length) issues.push(`group decision ${event.groupDecisionId} does not preserve unique named positions`);
  }
  for (const event of snapshot.externalActionEvents ?? []) if (!externalActionStatuses.includes(event.after)) issues.push(`external action ${event.externalActionChangeId} has invalid status`);

  const correctedSpent = profile.actuals.reduce((total, actual) => {
    const latest = [...snapshot.correctionEvents].reverse().find((event) => event.actualId === actual.actualId);
    return total + (latest?.correctedAmountMinor ?? actual.originalAmountMinor);
  }, 0);
  if (correctedSpent !== snapshot.accepted.spentMinor) issues.push("snapshot accepted spent amount does not match its append-only actual ledger");
  return [...new Set(issues)];
};

export const createAcceptedTruthEnvelope = async (snapshot: PlanSnapshot, previousSnapshotHash: string | null): Promise<AcceptedTruthEnvelope> => ({
  envelopeVersion: "finite-plan-accepted-truth.v1",
  scopeId: acceptedTruthScope,
  planId: snapshot.planId,
  profileId: snapshot.profileId,
  profileHash: snapshot.profileHash,
  revision: snapshot.revision,
  snapshot: clone(snapshot),
  snapshotHash: await sha256(snapshot),
  previousSnapshotHash,
});

export const createAcceptedTruthCommit = async (input: {
  expectedRevision: number;
  previousSnapshotHash: string;
  snapshot: PlanSnapshot;
  receipt: Receipt;
  authorityChallengeId?: string | null;
  operationProof?: Record<string, unknown> | null;
}): Promise<AcceptedTruthCommitRequest> => {
  const envelope = await createAcceptedTruthEnvelope(input.snapshot, input.previousSnapshotHash);
  const base: Omit<AcceptedTruthCommitRequest, "requestHash"> = {
    commitVersion: "finite-plan-accepted-commit.v1",
    scopeId: acceptedTruthScope,
    expectedRevision: input.expectedRevision,
    previousSnapshotHash: input.previousSnapshotHash,
    envelope,
    receipt: clone(input.receipt),
    authorityChallengeId: input.authorityChallengeId ?? null,
    operationProof: clone(input.operationProof ?? null),
  };
  return { ...base, requestHash: await sha256(base) };
};

const decodeJson = async <T>(response: Response): Promise<T> => {
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new AcceptedTruthRepositoryError(String(payload.code ?? "ACCEPTED_REPOSITORY_FAILURE"), String(payload.message ?? `Accepted repository returned HTTP ${response.status}.`), payload);
  return payload as T;
};

export class HttpAcceptedTruthRepository implements AcceptedTruthRepository {
  constructor(private readonly baseUrl = "/api/accepted-truth") {}

  async initialize(snapshot: PlanSnapshot, activationReceipt?: PlanActivationReceipt): Promise<AcceptedTruthCommitResult> {
    const envelope = await createAcceptedTruthEnvelope(snapshot, null);
    const activationRequestHash = activationReceipt ? await sha256({ envelope, activationReceipt }) : null;
    const response = await fetch(`${this.baseUrl}/initialize`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ envelope, activationReceipt: activationReceipt ? clone(activationReceipt) : null, activationRequestHash }),
    });
    return decodeJson<AcceptedTruthCommitResult>(response);
  }

  async load(planId: string, profileHash: string): Promise<AcceptedTruthEnvelope | null> {
    const response = await fetch(`${this.baseUrl}/${encodeURIComponent(planId)}?profileHash=${encodeURIComponent(profileHash)}`, { headers: { accept: "application/json" } });
    if (response.status === 404) return null;
    const payload = await decodeJson<{ ok: true; envelope: AcceptedTruthEnvelope }>(response);
    return clone(payload.envelope);
  }

  async commit(input: { expectedRevision: number; previousSnapshotHash: string; snapshot: PlanSnapshot; receipt: Receipt; authorityChallengeId?: string | null; operationProof?: Record<string, unknown> | null }): Promise<AcceptedTruthCommitResult> {
    const request = await createAcceptedTruthCommit(input);
    const response = await fetch(`${this.baseUrl}/commit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
    return decodeJson<AcceptedTruthCommitResult>(response);
  }

  async createAuthorityChallenge(input: { planId: string; profileHash: string; revision: number; targetId: string; contentHash: string; authorityId: string }): Promise<AuthorityChallenge> {
    const response = await fetch(`${this.baseUrl.replace(/\/accepted-truth$/, "")}/authority-challenges`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...input, targetType: "plan_option", ttlSeconds: 300 }),
    });
    return (await decodeJson<{ ok: true; challenge: AuthorityChallenge }>(response)).challenge;
  }

  async loadAuthorityChallenge(challengeId: string): Promise<AuthorityChallenge> {
    const response = await fetch(`${this.baseUrl.replace(/\/accepted-truth$/, "")}/authority-challenges/${encodeURIComponent(challengeId)}`, { headers: { accept: "application/json" } });
    return (await decodeJson<{ ok: true; challenge: AuthorityChallenge }>(response)).challenge;
  }

  async saveOperatorSession(input: { idempotencyKey: string; planId: string; profileHash: string; baseRevision: number; kind: OperatorSession["kind"]; payload: Record<string, unknown>; ttlSeconds?: number }): Promise<OperatorSession> {
    const response = await fetch(`${this.baseUrl.replace(/\/accepted-truth$/, "")}/operator-sessions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
    return (await decodeJson<{ ok: true; session: OperatorSession }>(response)).session;
  }

  async listOperatorSessions(): Promise<OperatorSession[]> {
    const response = await fetch(`${this.baseUrl.replace(/\/accepted-truth$/, "")}/operator-sessions`, { headers: { accept: "application/json" } });
    return (await decodeJson<{ ok: true; sessions: OperatorSession[] }>(response)).sessions;
  }

  async loadOperatorSession(sessionId: string): Promise<OperatorSession> {
    const response = await fetch(`${this.baseUrl.replace(/\/accepted-truth$/, "")}/operator-sessions/${encodeURIComponent(sessionId)}`, { headers: { accept: "application/json" } });
    return (await decodeJson<{ ok: true; session: OperatorSession }>(response)).session;
  }

  async closeOperatorSession(sessionId: string): Promise<OperatorSession> {
    const response = await fetch(`${this.baseUrl.replace(/\/accepted-truth$/, "")}/operator-sessions/${encodeURIComponent(sessionId)}/close`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    return (await decodeJson<{ ok: true; session: OperatorSession }>(response)).session;
  }
}

export class MemoryAcceptedTruthRepository implements AcceptedTruthRepository {
  private readonly heads = new Map<string, AcceptedTruthEnvelope>();
  private readonly receipts = new Map<string, { requestHash: string; result: AcceptedTruthCommitResult }>();
  private readonly activations = new Map<string, { requestHash: string; result: AcceptedTruthCommitResult }>();
  private readonly challenges = new Map<string, AuthorityChallenge>();
  private readonly consumedChallenges = new Map<string, string>();
  private readonly sessions = new Map<string, OperatorSession>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  async initialize(snapshot: PlanSnapshot, activationReceipt?: PlanActivationReceipt): Promise<AcceptedTruthCommitResult> {
    const proposed = await createAcceptedTruthEnvelope(snapshot, null);
    const activationRequestHash = activationReceipt ? await sha256({ envelope: proposed, activationReceipt }) : null;
    if (activationReceipt) {
      const replay = this.activations.get(activationReceipt.idempotencyKey);
      if (replay) {
        if (replay.requestHash !== activationRequestHash) throw new AcceptedTruthRepositoryError("IDEMPOTENCY_KEY_REUSED", "Activation idempotency key was reused with different content.");
        return { ...clone(replay.result), code: "ACCEPTED_TRUTH_CURRENT", replay: true };
      }
      if (!await activationReceiptIntegrity(activationReceipt)) throw new AcceptedTruthRepositoryError("ACTIVATION_RECEIPT_INTEGRITY_FAILED", "Activation receipt failed checksum validation.");
    }
    const existing = this.heads.get(snapshot.planId);
    if (existing) {
      if (existing.profileHash !== snapshot.profileHash) throw new AcceptedTruthRepositoryError("ACCEPTED_PROFILE_CONFLICT", "The durable plan id is bound to a different profile hash.", { revision: existing.revision, profileHash: existing.profileHash });
      return { ok: true, code: "ACCEPTED_TRUTH_CURRENT", envelope: clone(existing), receipt: activationReceipt ? clone(activationReceipt) : null, requestHash: activationRequestHash, replay: true };
    }
    this.heads.set(snapshot.planId, clone(proposed));
    const result: AcceptedTruthCommitResult = { ok: true, code: "ACCEPTED_TRUTH_INITIALIZED", envelope: clone(proposed), receipt: activationReceipt ? clone(activationReceipt) : null, requestHash: activationRequestHash, replay: false };
    if (activationReceipt && activationRequestHash) this.activations.set(activationReceipt.idempotencyKey, { requestHash: activationRequestHash, result: clone(result) });
    return result;
  }

  async load(planId: string, profileHash: string): Promise<AcceptedTruthEnvelope | null> {
    const existing = this.heads.get(planId);
    if (!existing) return null;
    if (existing.profileHash !== profileHash) throw new AcceptedTruthRepositoryError("ACCEPTED_PROFILE_CONFLICT", "The durable plan id is bound to a different profile hash.", { revision: existing.revision, profileHash: existing.profileHash });
    return clone(existing);
  }

  async commit(input: { expectedRevision: number; previousSnapshotHash: string; snapshot: PlanSnapshot; receipt: Receipt; authorityChallengeId?: string | null; operationProof?: Record<string, unknown> | null }): Promise<AcceptedTruthCommitResult> {
    const request = await createAcceptedTruthCommit(input);
    const receiptKey = `${request.envelope.planId}:${request.receipt.idempotencyKey}`;
    const replay = this.receipts.get(receiptKey);
    if (replay) {
      if (replay.requestHash !== request.requestHash) throw new AcceptedTruthRepositoryError("IDEMPOTENCY_KEY_REUSED", "Accepted-truth idempotency key was reused with different content.");
      return { ...clone(replay.result), code: "ACCEPTED_TRUTH_REPLAY", replay: true };
    }
    if (request.receipt.receiptType === "plan_option") {
      const challengeId = request.authorityChallengeId;
      const challenge = challengeId ? this.challenges.get(challengeId) : null;
      if (!challenge) throw new AcceptedTruthRepositoryError("AUTHORITY_CHALLENGE_REQUIRED", "A live human authority challenge is required.");
      if (Date.parse(challenge.expiresAt) <= this.now().getTime()) throw new AcceptedTruthRepositoryError("AUTHORITY_CHALLENGE_EXPIRED", "The human authority challenge expired.");
      if (this.consumedChallenges.has(challenge.challengeId)) throw new AcceptedTruthRepositoryError("AUTHORITY_CHALLENGE_CONSUMED", "The human authority challenge was already consumed.");
      const expectedCommandHash = await sha256({ targetType: "plan_option", targetId: request.receipt.payload.candidateId, planId: request.envelope.planId, profileHash: request.envelope.profileHash, revision: request.expectedRevision, contentHash: request.receipt.payload.contentHash, authorityId: request.receipt.payload.approvalId });
      if (challenge.commandHash !== expectedCommandHash) throw new AcceptedTruthRepositoryError("AUTHORITY_CHALLENGE_MISMATCH", "The human authority challenge does not bind this exact command.");
    }
    const current = this.heads.get(request.envelope.planId);
    if (!current) throw new AcceptedTruthRepositoryError("ACCEPTED_TRUTH_NOT_INITIALIZED", "The plan must be initialized before committing a revision.");
    if (current.profileHash !== request.envelope.profileHash) throw new AcceptedTruthRepositoryError("ACCEPTED_PROFILE_CONFLICT", "The durable profile hash changed.", { revision: current.revision, profileHash: current.profileHash });
    if (current.revision !== request.expectedRevision || current.snapshotHash !== request.previousSnapshotHash) throw new AcceptedTruthRepositoryError("ACCEPTED_REVISION_CONFLICT", "Accepted truth advanced in another operator session.", { currentRevision: current.revision, currentSnapshotHash: current.snapshotHash });
    if (request.envelope.revision !== request.expectedRevision + 1 || request.receipt.fromRevision !== request.expectedRevision || request.receipt.toRevision !== request.envelope.revision) throw new AcceptedTruthRepositoryError("ACCEPTED_COMMIT_LINEAGE_INVALID", "Commit revision lineage is invalid.");
    if (!await receiptIntegrity(request.receipt)) throw new AcceptedTruthRepositoryError("RECEIPT_INTEGRITY_FAILED", "Accepted receipt failed checksum validation.");
    const latest = this.heads.get(request.envelope.planId);
    if (!latest || latest.revision !== request.expectedRevision || latest.snapshotHash !== request.previousSnapshotHash) throw new AcceptedTruthRepositoryError("ACCEPTED_REVISION_CONFLICT", "Accepted truth advanced in another operator session.", { currentRevision: latest?.revision, currentSnapshotHash: latest?.snapshotHash });
    this.heads.set(request.envelope.planId, clone(request.envelope));
    const result: AcceptedTruthCommitResult = { ok: true, code: "ACCEPTED_TRUTH_COMMITTED", envelope: clone(request.envelope), receipt: clone(request.receipt), requestHash: request.requestHash, replay: false };
    this.receipts.set(receiptKey, { requestHash: request.requestHash, result: clone(result) });
    if (request.authorityChallengeId) this.consumedChallenges.set(request.authorityChallengeId, request.receipt.receiptId);
    return result;
  }

  async createAuthorityChallenge(input: { planId: string; profileHash: string; revision: number; targetId: string; contentHash: string; authorityId: string }): Promise<AuthorityChallenge> {
    const commandHash = await sha256({ targetType: "plan_option", ...input });
    const challengeId = `authority_${commandHash.slice(0, 16)}`;
    const existing = this.challenges.get(challengeId);
    if (existing) return clone(existing);
    const now = this.now();
    const createdAt = now.toISOString();
    const challenge: AuthorityChallenge = { challengeVersion: "finite-plan-authority-challenge.v1", challengeId, targetType: "plan_option", ...clone(input), commandHash, createdAt, expiresAt: new Date(now.getTime() + 300_000).toISOString() };
    this.challenges.set(challengeId, clone(challenge));
    return challenge;
  }

  async loadAuthorityChallenge(challengeId: string): Promise<AuthorityChallenge> {
    const challenge = this.challenges.get(challengeId);
    if (!challenge) throw new AcceptedTruthRepositoryError("AUTHORITY_CHALLENGE_NOT_FOUND", "Human authority challenge was not found.");
    if (this.consumedChallenges.has(challengeId)) throw new AcceptedTruthRepositoryError("AUTHORITY_CHALLENGE_CONSUMED", "Human authority challenge was already consumed.");
    if (Date.parse(challenge.expiresAt) <= this.now().getTime()) throw new AcceptedTruthRepositoryError("AUTHORITY_CHALLENGE_EXPIRED", "Human authority challenge expired.");
    return clone(challenge);
  }

  async saveOperatorSession(input: { idempotencyKey: string; planId: string; profileHash: string; baseRevision: number; kind: OperatorSession["kind"]; payload: Record<string, unknown>; ttlSeconds?: number }): Promise<OperatorSession> {
    const contentHash = await sha256({ idempotencyKey: input.idempotencyKey, planId: input.planId, profileHash: input.profileHash, baseRevision: input.baseRevision, kind: input.kind, payload: input.payload });
    const sessionId = `operator_session_${(await sha256({ idempotencyKey: input.idempotencyKey, contentHash })).slice(0, 16)}`;
    const replay = [...this.sessions.values()].find((item) => item.idempotencyKey === input.idempotencyKey);
    if (replay) {
      if (replay.contentHash !== contentHash) throw new AcceptedTruthRepositoryError("IDEMPOTENCY_KEY_REUSED", "Operator-session idempotency key was reused.");
      return clone(replay);
    }
    const now = this.now();
    const createdAt = now.toISOString();
    const session: OperatorSession = { sessionVersion: "finite-plan-operator-session.v1", sessionId, idempotencyKey: input.idempotencyKey, planId: input.planId, profileHash: input.profileHash, baseRevision: input.baseRevision, kind: input.kind, status: "active", payload: clone(input.payload), contentHash, createdAt, expiresAt: new Date(now.getTime() + Math.min(604_800, Math.max(60, input.ttlSeconds ?? 86_400)) * 1000).toISOString(), closedAt: null };
    this.sessions.set(sessionId, clone(session));
    return session;
  }

  async listOperatorSessions(): Promise<OperatorSession[]> { return [...this.sessions.values()].filter((item) => item.status === "active" && Date.parse(item.expiresAt) > this.now().getTime()).map(clone); }
  async loadOperatorSession(sessionId: string): Promise<OperatorSession> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new AcceptedTruthRepositoryError("OPERATOR_SESSION_NOT_FOUND", "Operator session was not found.");
    if (Date.parse(session.expiresAt) <= this.now().getTime()) throw new AcceptedTruthRepositoryError("OPERATOR_SESSION_EXPIRED", "Operator session expired.");
    return clone(session);
  }
  async closeOperatorSession(sessionId: string): Promise<OperatorSession> {
    const session = await this.loadOperatorSession(sessionId);
    session.status = "closed";
    session.closedAt = this.now().toISOString();
    this.sessions.set(sessionId, clone(session));
    return session;
  }
}
