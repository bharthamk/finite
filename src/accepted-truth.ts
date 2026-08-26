import { clone, sha256 } from "./crypto.js";
import type { CompiledProfile, EvidenceRecord, PlanActivationReceipt, PlanSnapshot, Receipt } from "./types.js";

export const acceptedTruthScope = "owner-private-v1";

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
  operationProof: Record<string, unknown> | null;
  requestHash: string;
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
    operationProof?: Record<string, unknown> | null;
  }): Promise<AcceptedTruthCommitResult>;
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

  async commit(input: { expectedRevision: number; previousSnapshotHash: string; snapshot: PlanSnapshot; receipt: Receipt; operationProof?: Record<string, unknown> | null }): Promise<AcceptedTruthCommitResult> {
    const request = await createAcceptedTruthCommit(input);
    const response = await fetch(`${this.baseUrl}/commit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
    return decodeJson<AcceptedTruthCommitResult>(response);
  }
}

export class MemoryAcceptedTruthRepository implements AcceptedTruthRepository {
  private readonly heads = new Map<string, AcceptedTruthEnvelope>();
  private readonly receipts = new Map<string, { requestHash: string; result: AcceptedTruthCommitResult }>();
  private readonly activations = new Map<string, { requestHash: string; result: AcceptedTruthCommitResult }>();

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

  async commit(input: { expectedRevision: number; previousSnapshotHash: string; snapshot: PlanSnapshot; receipt: Receipt; operationProof?: Record<string, unknown> | null }): Promise<AcceptedTruthCommitResult> {
    const request = await createAcceptedTruthCommit(input);
    const receiptKey = `${request.envelope.planId}:${request.receipt.idempotencyKey}`;
    const replay = this.receipts.get(receiptKey);
    if (replay) {
      if (replay.requestHash !== request.requestHash) throw new AcceptedTruthRepositoryError("IDEMPOTENCY_KEY_REUSED", "Accepted-truth idempotency key was reused with different content.");
      return { ...clone(replay.result), code: "ACCEPTED_TRUTH_REPLAY", replay: true };
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
    return result;
  }
}
