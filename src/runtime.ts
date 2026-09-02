import { clone, makeId, sha256 } from "./crypto.js";
import { AcceptedTruthRepositoryError, type AcceptedTruthRepository, type ActivationTiming, type OperatorSession } from "./accepted-truth.js";
import { ConstructionPacketRepositoryError, type ConstructionPacketRepository } from "./construction-packet.js";
import { buildChefMenu, type KitchenRoute } from "./chef-menu.js";
import { FinitePlanKernel } from "./kernel.js";
import { PlanCatalogStore, PlanSnapshotStore } from "./persistence.js";
import { compileProfile, getProfileDefinition, ProfileValidationError } from "./profiles.js";
import { resolvePlanTitle } from "./plan-title.js";
import type {
  CompiledProfile,
  ArrivalSourceBinding,
  EvidenceRecord,
  PlanActivationConfirmation,
  PlanActivationReceipt,
  PlanAmendmentBinding,
  PlanAmendmentDiff,
  PlanCatalogEntry,
  PlanConstructionPacket,
  PlanDraft,
  PlanIntakeInput,
  IntakeFactIssue,
  ProfileDefinition,
  ProfileId,
  ConstructionReturnReason,
  ReturnedConstructionReview,
  ToolResult,
} from "./types.js";

export interface CompiledCatalogEntry {
  profile: CompiledProfile;
  evidenceRecords: EvidenceRecord[];
  lineage?: PlanCatalogEntry["lineage"];
}

const profileDefinition = (profile: CompiledProfile): ProfileDefinition => {
  const { profileHash: _profileHash, ...definition } = profile;
  return clone(definition) as ProfileDefinition;
};

const evidenceIntegrity = async (evidence: EvidenceRecord): Promise<boolean> => {
  const { evidenceId: _evidenceId, recordHash, ...base } = evidence;
  return await sha256({ content: evidence.content }) === evidence.contentHash && await sha256(base) === recordHash;
};

const constructionTtlMs = 7 * 24 * 60 * 60 * 1000;
type RuntimeRequestContext = { signal?: AbortSignal };

const constructionPacketContent = (packet: PlanConstructionPacket): Omit<PlanConstructionPacket, "packetId" | "checksum"> => {
  const { packetId: _packetId, checksum: _checksum, ...content } = packet;
  return content;
};

export class FinitePlanRuntime {
  kernel: FinitePlanKernel;
  pendingPlanDraft: PlanDraft | null = null;
  planActivationConfirmation: PlanActivationConfirmation | null = null;
  returnedConstructionReview: ReturnedConstructionReview | null = null;
  lastConstructionReturnReview: ReturnedConstructionReview | null = null;
  private readonly plans = new Map<string, CompiledCatalogEntry>();
  private readonly activationReceipts = new Map<string, PlanActivationReceipt>();
  private pendingConstructionDraftBinding: { packetId: string; draftId: string } | null = null;
  latestIntakeAssessment: ToolResult | null = null;

  constructor(
    private readonly profiles: Map<ProfileId, CompiledProfile>,
    private readonly store: PlanSnapshotStore,
    initialPlanOrProfile: ProfileId | string = "travel",
    private readonly catalogStore?: PlanCatalogStore,
    catalogEntries: CompiledCatalogEntry[] = [],
    private readonly now: () => Date = () => new Date(),
    private readonly acceptedRepository?: AcceptedTruthRepository,
    private readonly constructionRepository?: ConstructionPacketRepository,
  ) {
    for (const profile of profiles.values()) this.plans.set(profile.planId, { profile, evidenceRecords: [] });
    for (const entry of catalogEntries) this.plans.set(entry.profile.planId, { profile: entry.profile, evidenceRecords: clone(entry.evidenceRecords), ...(entry.lineage ? { lineage: clone(entry.lineage) } : {}) });
    for (const receipt of catalogStore?.loadActivationReceipts() ?? []) this.activationReceipts.set(receipt.idempotencyKey, clone(receipt));
    const builtIn = profiles.get(initialPlanOrProfile as ProfileId);
    const entry = this.plans.get(initialPlanOrProfile) ?? (builtIn ? this.plans.get(builtIn.planId) : undefined);
    if (!entry) throw new Error(`Missing compiled plan or profile: ${initialPlanOrProfile}`);
    this.kernel = new FinitePlanKernel(entry.profile, store, entry.evidenceRecords, acceptedRepository);
  }

  hasActivationReceipt(): boolean {
    return this.activationReceipts.size > 0;
  }

  supportsAtomicArrivalPlanActivation(): boolean {
    return Boolean(this.acceptedRepository?.initializePlanActivation && this.acceptedRepository.createPlanActivationChallenge && this.constructionRepository);
  }

  private durableCatalogEntry(planId = this.kernel.profile.planId): PlanCatalogEntry | undefined {
    const entry = this.plans.get(planId);
    if (!entry) return undefined;
    return {
      definition: profileDefinition(entry.profile),
      evidenceRecords: clone(entry.evidenceRecords),
      ...(entry.lineage ? { lineage: clone(entry.lineage) } : {}),
    };
  }

  async hydrateAcceptedTruth(context: RuntimeRequestContext = {}): Promise<ToolResult> {
    return this.kernel.hydrateAcceptedTruth(undefined, this.durableCatalogEntry(), null, context);
  }

  async hydrateConstructionPacket(context: RuntimeRequestContext = {}): Promise<ToolResult> {
    if (!this.constructionRepository) return { ok: true, code: "CONSTRUCTION_PACKET_LOCAL_ONLY", acceptedStateChanged: false };
    try {
      const remote = await this.constructionRepository.load(context);
      if (remote) {
        this.returnedConstructionReview = null;
        try { this.catalogStore?.saveConstructionPacket(remote); } catch { /* remote packet remains authoritative */ }
        await this.hydrateReturnedConstructionReview(false, context);
        return { ok: true, code: "CONSTRUCTION_PACKET_REMOTE_HYDRATED", packet: this.constructionPacketSummary(remote), acceptedStateChanged: false };
      }
      const local = this.catalogStore?.loadConstructionPacket() ?? null;
      if (!local) return this.hydrateReturnedConstructionReview(true, context);
      const adopted = await this.constructionRepository.save(local, context);
      this.returnedConstructionReview = null;
      try { this.catalogStore?.saveConstructionPacket(adopted); } catch { /* remote packet remains authoritative */ }
      await this.hydrateReturnedConstructionReview(false, context);
      return { ok: true, code: "CONSTRUCTION_PACKET_REMOTE_ADOPTED", packet: this.constructionPacketSummary(adopted), acceptedStateChanged: false };
    } catch (error) {
      const code = error instanceof ConstructionPacketRepositoryError ? error.code : "CONSTRUCTION_PACKET_REMOTE_HYDRATION_FAILED";
      if (["CONSTRUCTION_ARRIVAL_BINDING_REQUIRED", "CONSTRUCTION_ARRIVAL_STALE", "CONSTRUCTION_PACKET_BASE_STALE", "CONSTRUCTION_PACKET_INTEGRITY_FAILED", "CONSTRUCTION_PACKET_CLEARED", "CONSTRUCTION_PACKET_TOMBSTONED"].includes(code)) {
        try { this.catalogStore?.clearConstructionPacket(); } catch { /* local stale cache remains non-authoritative */ }
      }
      if (context.signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) throw error;
      if (code === "CONSTRUCTION_PACKET_CLEARED" || code === "CONSTRUCTION_PACKET_TOMBSTONED") return this.hydrateReturnedConstructionReview(true, context);
      return { ok: false, code, message: error instanceof Error ? error.message : String(error), acceptedStateChanged: false, next: "Do not expose local construction as current until the authenticated server packet is reconciled." };
    }
  }

  private async hydrateReturnedConstructionReview(activate = true, context: RuntimeRequestContext = {}): Promise<ToolResult> {
    if (!this.constructionRepository) return { ok: true, code: "CONSTRUCTION_RETURN_NOT_FOUND", acceptedStateChanged: false };
    try {
      const review = await this.constructionRepository.loadReturned(context);
      this.lastConstructionReturnReview = review ? clone(review) : null;
      this.returnedConstructionReview = review && activate && review.status !== "resolved" ? clone(review) : null;
      if (!review) return { ok: true, code: "CONSTRUCTION_RETURN_NOT_FOUND", acceptedStateChanged: false };
      return {
        ok: true,
        code: review.status === "resolved" ? "CONSTRUCTION_RETURN_RESOLVED" : review.feedbackRequired ? "CONSTRUCTION_RETURN_FEEDBACK_REQUIRED" : "CONSTRUCTION_DRAFT_RETURNED",
        review: this.returnedConstructionSummary(review),
        acceptedStateChanged: false,
      };
    } catch (error) {
      if (context.signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) throw error;
      this.returnedConstructionReview = null;
      this.lastConstructionReturnReview = null;
      return { ok: false, code: error instanceof ConstructionPacketRepositoryError ? error.code : "CONSTRUCTION_RETURN_READ_FAILED", message: error instanceof Error ? error.message : String(error), acceptedStateChanged: false };
    }
  }

  async saveOperatorSession({ idempotencyKey, kind, payload, ttlSeconds }: { idempotencyKey: string; kind: OperatorSession["kind"]; payload: Record<string, unknown>; ttlSeconds?: number }, context: RuntimeRequestContext = {}): Promise<ToolResult> {
    if (!this.acceptedRepository?.saveOperatorSession) return { ok: false, code: "OPERATOR_SESSION_STORAGE_UNAVAILABLE", acceptedStateChanged: false };
    if (!idempotencyKey || !payload || typeof payload !== "object" || JSON.stringify(payload).length > 30_000) return { ok: false, code: "OPERATOR_SESSION_INPUT_INVALID", acceptedStateChanged: false };
    try {
      const session = await this.acceptedRepository.saveOperatorSession({ idempotencyKey, planId: this.kernel.profile.planId, profileHash: this.kernel.profile.profileHash, baseRevision: this.kernel.revision, kind, payload: clone(payload), ...(ttlSeconds === undefined ? {} : { ttlSeconds }) }, context);
      return { ok: true, code: "OPERATOR_SESSION_SAVED", session, acceptedStateChanged: false, next: "Another authenticated device may resume this non-authoritative packet; accepted truth and human authority are unchanged." };
    } catch (error) { if (context.signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) throw error; return { ok: false, code: error instanceof AcceptedTruthRepositoryError ? error.code : "OPERATOR_SESSION_SAVE_FAILED", message: error instanceof Error ? error.message : String(error), acceptedStateChanged: false }; }
  }

  async listOperatorSessions(context: RuntimeRequestContext = {}): Promise<ToolResult> {
    if (!this.acceptedRepository?.listOperatorSessions) return { ok: false, code: "OPERATOR_SESSION_STORAGE_UNAVAILABLE", acceptedStateChanged: false };
    try {
      const sessions = await this.acceptedRepository.listOperatorSessions(context);
      return { ok: true, code: "OPERATOR_SESSIONS", sessions: sessions.map((session) => ({ ...session, baseCurrent: session.planId === this.kernel.profile.planId && session.profileHash === this.kernel.profile.profileHash && session.baseRevision === this.kernel.revision })), acceptedStateChanged: false };
    } catch (error) { if (context.signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) throw error; return { ok: false, code: "OPERATOR_SESSION_LIST_FAILED", message: error instanceof Error ? error.message : String(error), acceptedStateChanged: false }; }
  }

  async resumeOperatorSession({ sessionId }: { sessionId: string }, context: RuntimeRequestContext = {}): Promise<ToolResult> {
    if (!this.acceptedRepository?.loadOperatorSession) return { ok: false, code: "OPERATOR_SESSION_STORAGE_UNAVAILABLE", acceptedStateChanged: false };
    try {
      const session = await this.acceptedRepository.loadOperatorSession(sessionId, context);
      if (session.planId !== this.kernel.profile.planId || session.profileHash !== this.kernel.profile.profileHash || session.baseRevision !== this.kernel.revision) return { ok: false, code: "OPERATOR_SESSION_BASE_STALE", session, activePlanId: this.kernel.profile.planId, activeProfileHash: this.kernel.profile.profileHash, activeRevision: this.kernel.revision, acceptedStateChanged: false, next: "Do not replay this packet. Reconcile it against current accepted truth and save a replacement session." };
      const restoredWork = session.kind === "decision_work" ? await this.kernel.restoreDecisionWork(session.payload) : null;
      if (restoredWork && !restoredWork.ok) return { ...restoredWork, session, acceptedStateChanged: false };
      return { ok: true, code: restoredWork ? "OPERATOR_DECISION_SESSION_RESUMED" : "OPERATOR_SESSION_RESUMED", session, restoredWork, authorityRestored: false, acceptedStateChanged: false, next: restoredWork ? "Resume the exact unexpired human handoff challenge; it will be consumed with the accepted commit." : "Use the packet as non-authoritative context, rebuild deterministic work, and obtain fresh human authority for any consequential command." };
    } catch (error) { if (context.signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) throw error; return { ok: false, code: error instanceof AcceptedTruthRepositoryError ? error.code : "OPERATOR_SESSION_RESUME_FAILED", message: error instanceof Error ? error.message : String(error), acceptedStateChanged: false }; }
  }

  async closeOperatorSession({ sessionId }: { sessionId: string }, context: RuntimeRequestContext = {}): Promise<ToolResult> {
    if (!this.acceptedRepository?.closeOperatorSession) return { ok: false, code: "OPERATOR_SESSION_STORAGE_UNAVAILABLE", acceptedStateChanged: false };
    try { return { ok: true, code: "OPERATOR_SESSION_CLOSED", session: await this.acceptedRepository.closeOperatorSession(sessionId, context), acceptedStateChanged: false }; }
    catch (error) { if (context.signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) throw error; return { ok: false, code: error instanceof AcceptedTruthRepositoryError ? error.code : "OPERATOR_SESSION_CLOSE_FAILED", message: error instanceof Error ? error.message : String(error), acceptedStateChanged: false }; }
  }

  private async persistConstructionPacket(kind: PlanConstructionPacket["kind"], payload: PlanConstructionPacket["payload"], context: RuntimeRequestContext = {}): Promise<PlanConstructionPacket | null> {
    if (!this.catalogStore) return null;
    const createdAt = this.now();
    const content = {
      packetVersion: "finite-plan-construction.v1" as const,
      kind,
      basePlanId: this.kernel.profile.planId,
      baseProfileHash: this.kernel.profile.profileHash,
      baseRevision: this.kernel.revision,
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(createdAt.getTime() + constructionTtlMs).toISOString(),
      payload: clone(payload),
    };
    const checksum = await sha256(content);
    const packet = { ...content, packetId: `construction_${checksum.slice(0, 16)}`, checksum } as PlanConstructionPacket;
    const durable = this.constructionRepository ? await this.constructionRepository.save(packet, context) : packet;
    this.returnedConstructionReview = null;
    if (this.constructionRepository) await this.hydrateReturnedConstructionReview(false, context);
    if (this.constructionRepository) {
      try { this.catalogStore.saveConstructionPacket(durable); } catch { /* authenticated server state remains authoritative */ }
    } else this.catalogStore.saveConstructionPacket(durable);
    return clone(durable);
  }

  private constructionPacketSummary(packet: PlanConstructionPacket): Record<string, unknown> {
    const expiresAt = Date.parse(packet.expiresAt);
    const expired = !Number.isFinite(expiresAt) || expiresAt <= this.now().getTime();
    const baseCurrent = packet.basePlanId === this.kernel.profile.planId
      && packet.baseProfileHash === this.kernel.profile.profileHash
      && packet.baseRevision === this.kernel.revision;
    const draftPlanId = packet.kind === "intake" ? packet.payload.facts.planId ?? null : packet.payload.profile.planId;
    const sourceArrival = packet.kind === "intake" ? packet.payload.facts.sourceArrival ?? null : packet.payload.sourceArrival;
    return {
      packetId: packet.packetId,
      kind: packet.kind,
      draftNamespace: sourceArrival ? `arrival:${sourceArrival.orderId}:${sourceArrival.orderVersion}` : `draft:${draftPlanId ?? packet.packetId}`,
      draftPlanId,
      basePlanId: packet.basePlanId,
      baseProfileHash: packet.baseProfileHash,
      baseRevision: packet.baseRevision,
      acceptedBaseRole: "concurrency_guard_only",
      createdAt: packet.createdAt,
      expiresAt: packet.expiresAt,
      status: expired ? "expired" : baseCurrent ? "resumable" : "stale",
      checksum: packet.checksum,
      humanAuthorityPersisted: false,
      sourceArrival: packet.kind === "intake" ? clone(packet.payload.facts.sourceArrival ?? null) : clone(packet.payload.sourceArrival),
      ...(packet.kind === "intake"
        ? { assessmentCode: packet.payload.assessmentCode }
        : { draftId: packet.payload.draftId, planId: packet.payload.profile.planId, amendment: packet.payload.amendment ? { supersedesPlanId: packet.payload.amendment.supersedesPlanId, diffHash: packet.payload.amendment.diffHash } : null }),
    };
  }

  private returnedConstructionSummary(review: ReturnedConstructionReview): Record<string, unknown> {
    return {
      ...this.constructionPacketSummary(review.packet),
      status: review.status === "resolved" ? "revision_resolved" : review.feedbackRequired ? "return_feedback_required" : "returned_for_revision",
      returnReview: {
        reasonCode: review.reasonCode,
        message: review.message,
        returnedAt: review.returnedAt,
        feedbackRequired: review.feedbackRequired,
        source: review.source,
      },
    };
  }

  private async clearMatchingConstructionDraft(draftId: string, context: RuntimeRequestContext = {}): Promise<boolean> {
    if (this.constructionRepository) {
      const known = this.pendingConstructionDraftBinding;
      if (known?.draftId === draftId) {
        try {
          await this.constructionRepository.clear(known.packetId, context);
          this.catalogStore?.clearConstructionPacket();
          this.pendingConstructionDraftBinding = null;
          return true;
        } catch (error) {
          if (error instanceof ConstructionPacketRepositoryError && ["CONSTRUCTION_PACKET_CLEARED", "CONSTRUCTION_PACKET_TOMBSTONED"].includes(error.code)) {
            this.catalogStore?.clearConstructionPacket();
            this.pendingConstructionDraftBinding = null;
            return true;
          }
          throw error;
        }
      }
      try {
        const packet = await this.constructionRepository.load(context);
        if (!packet) { this.catalogStore?.clearConstructionPacket(); this.pendingConstructionDraftBinding = null; return true; }
        if (packet.kind !== "draft" || packet.payload.draftId !== draftId) return false;
        await this.constructionRepository.clear(packet.packetId, context);
        this.catalogStore?.clearConstructionPacket();
        this.pendingConstructionDraftBinding = null;
        return true;
      } catch (error) {
        if (error instanceof ConstructionPacketRepositoryError && ["CONSTRUCTION_PACKET_CLEARED", "CONSTRUCTION_PACKET_TOMBSTONED"].includes(error.code)) {
          this.catalogStore?.clearConstructionPacket();
          this.pendingConstructionDraftBinding = null;
          return true;
        }
        throw error;
      }
    }
    const verified = await this.readVerifiedConstructionPacket(context);
    if ("ok" in verified) return verified.code === "CONSTRUCTION_PACKET_NOT_FOUND";
    if (verified.kind !== "draft" || verified.payload.draftId !== draftId) return false;
    this.catalogStore?.clearConstructionPacket();
    this.pendingConstructionDraftBinding = null;
    return true;
  }

  private async readVerifiedConstructionPacket(context: RuntimeRequestContext = {}): Promise<PlanConstructionPacket | ToolResult> {
    let packet: PlanConstructionPacket | null = null;
    if (this.constructionRepository) {
      try {
        packet = await this.constructionRepository.load(context);
        if (packet) {
          try { this.catalogStore?.saveConstructionPacket(packet); } catch { /* remote packet remains authoritative */ }
        } else {
          try { this.catalogStore?.clearConstructionPacket(); } catch { /* stale cache is ignored below */ }
        }
      } catch (error) {
        if (context.signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) throw error;
        const code = error instanceof ConstructionPacketRepositoryError ? error.code : "CONSTRUCTION_PACKET_REMOTE_READ_FAILED";
        if (code === "CONSTRUCTION_PACKET_CLEARED" || code === "CONSTRUCTION_PACKET_TOMBSTONED") {
          try { this.catalogStore?.clearConstructionPacket(); } catch { /* remote tombstone remains authoritative */ }
          return { ok: false, code: "CONSTRUCTION_PACKET_NOT_FOUND", acceptedStateChanged: false };
        }
        return { ok: false, code, message: error instanceof Error ? error.message : String(error), acceptedStateChanged: false };
      }
    } else packet = this.catalogStore?.loadConstructionPacket() ?? null;
    if (!packet) return { ok: false, code: "CONSTRUCTION_PACKET_NOT_FOUND", acceptedStateChanged: false };
    const checksum = await sha256(constructionPacketContent(packet));
    if (checksum !== packet.checksum || packet.packetId !== `construction_${checksum.slice(0, 16)}`) return { ok: false, code: "CONSTRUCTION_PACKET_INTEGRITY_FAILED", packetId: packet.packetId, acceptedStateChanged: false, next: "Discard the damaged packet; do not infer or restore construction work." };
    const createdAt = Date.parse(packet.createdAt);
    const expiresAt = Date.parse(packet.expiresAt);
    if (!Number.isFinite(createdAt) || !Number.isFinite(expiresAt) || expiresAt - createdAt !== constructionTtlMs) return { ok: false, code: "CONSTRUCTION_PACKET_TIME_INVALID", packetId: packet.packetId, acceptedStateChanged: false };
    return packet;
  }

  async getConstructionPacket(context: RuntimeRequestContext = {}): Promise<ToolResult> {
    const verified = await this.readVerifiedConstructionPacket(context);
    if ("ok" in verified) {
      if (verified.code === "CONSTRUCTION_PACKET_NOT_FOUND") {
        if (!this.returnedConstructionReview) await this.hydrateReturnedConstructionReview(true, context);
        if (this.returnedConstructionReview) return { ok: true, code: this.returnedConstructionReview.feedbackRequired ? "CONSTRUCTION_RETURN_FEEDBACK_REQUIRED" : "CONSTRUCTION_DRAFT_RETURNED", packet: this.returnedConstructionSummary(this.returnedConstructionReview), acceptedStateChanged: false };
      }
      return verified;
    }
    return { ok: true, code: "CONSTRUCTION_PACKET", packet: this.constructionPacketSummary(verified), acceptedStateChanged: false };
  }

  async getReturnedPlanDraft(context: RuntimeRequestContext = {}): Promise<ToolResult> {
    if (!this.returnedConstructionReview) await this.hydrateReturnedConstructionReview(true, context);
    const review = this.returnedConstructionReview;
    if (!review) return { ok: false, code: "CONSTRUCTION_RETURN_NOT_FOUND", acceptedStateChanged: false };
    if (review.feedbackRequired) return { ok: false, code: "CONSTRUCTION_RETURN_FEEDBACK_REQUIRED", review: this.returnedConstructionSummary(review), acceptedStateChanged: false, next: "Wait for the human to explain what should change on the Site." };
    const packet = review.packet;
    if (packet.kind !== "draft") return { ok: false, code: "CONSTRUCTION_RETURN_INVALID", acceptedStateChanged: false };
    return {
      ok: true,
      code: "RETURNED_PLAN_DRAFT_CONTEXT",
      returned: this.returnedConstructionSummary(review),
      draft: {
        draftId: packet.payload.draftId,
        contentHash: packet.payload.contentHash,
        profile: clone(packet.payload.profile),
        evidenceRecords: clone(packet.payload.evidenceRecords),
        amendment: clone(packet.payload.amendment),
        sourceArrival: clone(packet.payload.sourceArrival),
      },
      acceptedStateChanged: false,
      next: "Revise from this exact rejected draft and human feedback. Save a replacement intake or draft; do not silently rebuild the same packet.",
    };
  }

  async resumeConstructionPacket(context: RuntimeRequestContext = {}): Promise<ToolResult> {
    const verified = await this.readVerifiedConstructionPacket(context);
    if ("ok" in verified) return verified;
    const packet = verified;
    if (Date.parse(packet.expiresAt) <= this.now().getTime()) return { ok: false, code: "CONSTRUCTION_PACKET_EXPIRED", packet: this.constructionPacketSummary(packet), acceptedStateChanged: false, next: "Explicitly discard the expired packet and reassess the current human order." };
    if (packet.basePlanId !== this.kernel.profile.planId || packet.baseProfileHash !== this.kernel.profile.profileHash || packet.baseRevision !== this.kernel.revision) return { ok: false, code: "CONSTRUCTION_PACKET_BASE_STALE", packet: this.constructionPacketSummary(packet), activePlanId: this.kernel.profile.planId, activeProfileHash: this.kernel.profile.profileHash, activeRevision: this.kernel.revision, acceptedStateChanged: false, next: "Switch back to the exact source plan/revision or explicitly discard and rebuild the packet." };

    for (const evidence of packet.payload.evidenceRecords) if (!await evidenceIntegrity(evidence)) return { ok: false, code: "CONSTRUCTION_PACKET_EVIDENCE_INTEGRITY_FAILED", evidenceId: evidence.evidenceId, acceptedStateChanged: false };

    if (packet.kind === "intake") {
      const priorEvidence = new Map(packet.payload.evidenceRecords.map((evidence) => [evidence.evidenceId, this.kernel.evidence.get(evidence.evidenceId)]));
      for (const evidence of packet.payload.evidenceRecords) this.kernel.evidence.set(evidence.evidenceId, clone(evidence));
      const assessment = this.assessPlanIntakeFacts(packet.payload.facts);
      if (assessment.code !== packet.payload.assessmentCode) {
        for (const [evidenceId, prior] of priorEvidence) prior ? this.kernel.evidence.set(evidenceId, prior) : this.kernel.evidence.delete(evidenceId);
        return { ok: false, code: "CONSTRUCTION_PACKET_REASSESSMENT_CHANGED", priorAssessmentCode: packet.payload.assessmentCode, assessment, acceptedStateChanged: false, next: "Use the current assessment and save a replacement packet before continuing." };
      }
      this.pendingPlanDraft = null;
      this.planActivationConfirmation = null;
      this.pendingConstructionDraftBinding = null;
      return { ok: true, code: "CONSTRUCTION_INTAKE_RESUMED", packet: this.constructionPacketSummary(packet), assessment: clone(assessment), acceptedStateChanged: false, ...(assessment.next ? { next: assessment.next } : {}) };
    }

    let profile: CompiledProfile;
    try { profile = await compileProfile(packet.payload.profile); }
    catch (error) { return { ok: false, code: "CONSTRUCTION_DRAFT_INVALID", issues: error instanceof ProfileValidationError ? error.issues : [error instanceof Error ? error.message : String(error)], acceptedStateChanged: false }; }
    if (this.plans.has(profile.planId)) return { ok: false, code: "CONSTRUCTION_DRAFT_PLAN_CONFLICT", planId: profile.planId, acceptedStateChanged: false };
    const evidenceIds = new Set(packet.payload.evidenceRecords.map((evidence) => evidence.evidenceId));
    if (profile.actuals.some((actual) => !evidenceIds.has(actual.evidenceRef))) return { ok: false, code: "CONSTRUCTION_DRAFT_EVIDENCE_MISSING", acceptedStateChanged: false };
    let amendment: PlanAmendmentBinding | null = null;
    if (packet.payload.amendment) {
      const successor = [...this.plans.values()].find((entry) => entry.lineage?.supersedesPlanId === packet.basePlanId);
      if (successor) return { ok: false, code: "PLAN_VERSION_SUPERSEDED", planId: packet.basePlanId, supersededBy: successor.profile.planId, acceptedStateChanged: false };
      const rebound = await this.amendmentBinding(profile);
      if ("ok" in rebound) return rebound;
      if (JSON.stringify(rebound) !== JSON.stringify(packet.payload.amendment)) return { ok: false, code: "CONSTRUCTION_AMENDMENT_DIFF_MISMATCH", acceptedStateChanged: false };
      amendment = rebound;
    }
    const bound = {
      basePlanId: packet.basePlanId,
      baseRevision: packet.baseRevision,
      profileHash: profile.profileHash,
      evidenceBindings: packet.payload.evidenceRecords.map(({ evidenceId, contentHash, recordHash }) => ({ evidenceId, contentHash, recordHash })),
      amendment: amendment ? { supersedesPlanId: amendment.supersedesPlanId, supersedesProfileHash: amendment.supersedesProfileHash, supersedesRevision: amendment.supersedesRevision, diffHash: amendment.diffHash } : null,
      ...(Object.prototype.hasOwnProperty.call(packet.payload, "sourceArrival") ? { sourceArrival: clone(packet.payload.sourceArrival ?? null) } : {}),
    };
    const contentHash = await sha256(bound);
    if (contentHash !== packet.payload.contentHash || packet.payload.draftId !== `plan_draft_${contentHash.slice(0, 16)}`) return { ok: false, code: "CONSTRUCTION_DRAFT_BINDING_MISMATCH", acceptedStateChanged: false };
    for (const evidence of packet.payload.evidenceRecords) this.kernel.evidence.set(evidence.evidenceId, clone(evidence));
    this.pendingPlanDraft = { draftId: packet.payload.draftId, basePlanId: packet.basePlanId, baseRevision: packet.baseRevision, profile, evidenceRecords: clone(packet.payload.evidenceRecords), contentHash, amendment, sourceArrival: clone(packet.payload.sourceArrival ?? null) };
    this.pendingConstructionDraftBinding = { packetId: packet.packetId, draftId: packet.payload.draftId };
    this.planActivationConfirmation = null;
    return { ok: true, code: "CONSTRUCTION_DRAFT_RESUMED", packet: this.constructionPacketSummary(packet), draft: { draftId: packet.payload.draftId, profileHash: profile.profileHash, contentHash, amendment: clone(amendment) }, humanConfirmationRestored: false, acceptedStateChanged: false, next: "Show the exact restored hashes and diff to the human again; prior confirmation was never persisted." };
  }

  async discardConstructionPacket({ packetId }: { packetId: string }, context: RuntimeRequestContext = {}): Promise<ToolResult> {
    const verified = await this.readVerifiedConstructionPacket(context);
    if ("ok" in verified) {
      if (this.constructionRepository) {
        try {
          const raw = await this.constructionRepository.load(context);
          if (raw?.packetId === packetId) {
            await this.constructionRepository.clear(packetId, context);
            this.catalogStore?.clearConstructionPacket();
            this.pendingPlanDraft = null;
            this.planActivationConfirmation = null;
            this.latestIntakeAssessment = null;
            this.pendingConstructionDraftBinding = null;
            return { ok: true, code: "CONSTRUCTION_PACKET_DISCARDED", packetId, acceptedStateChanged: false, next: "Begin again from the current reviewed human order." };
          }
        } catch (error) {
          if (!(error instanceof ConstructionPacketRepositoryError && ["CONSTRUCTION_PACKET_CLEARED", "CONSTRUCTION_PACKET_TOMBSTONED"].includes(error.code))) {
            return { ok: false, code: "CONSTRUCTION_PACKET_DISCARD_FAILED", message: error instanceof Error ? error.message : String(error), acceptedStateChanged: false };
          }
        }
      }
      if (this.returnedConstructionReview?.packetId !== packetId) return { ok: false, code: "CONSTRUCTION_PACKET_NOT_FOUND", acceptedStateChanged: false };
      try {
        if (this.constructionRepository) await this.constructionRepository.clear(packetId, context);
        this.catalogStore?.clearConstructionPacket();
        this.returnedConstructionReview = null;
        return { ok: true, code: "CONSTRUCTION_PACKET_DISCARDED", packetId, acceptedStateChanged: false, next: "Begin again from the current reviewed human order." };
      } catch (error) { return { ok: false, code: "CONSTRUCTION_PACKET_DISCARD_FAILED", message: error instanceof Error ? error.message : String(error), acceptedStateChanged: false }; }
    }
    if (verified.packetId !== packetId) return { ok: false, code: "CONSTRUCTION_PACKET_NOT_FOUND", acceptedStateChanged: false };
    const packet = verified;
    try {
      if (this.constructionRepository) await this.constructionRepository.clear(packetId, context);
      this.catalogStore?.clearConstructionPacket();
      this.returnedConstructionReview = null;
    }
    catch (error) { return { ok: false, code: "CONSTRUCTION_PACKET_DISCARD_FAILED", message: error instanceof Error ? error.message : String(error), acceptedStateChanged: false }; }
    if (packet.kind === "draft" && this.pendingPlanDraft?.draftId === packet.payload.draftId) {
      this.pendingPlanDraft = null;
      this.planActivationConfirmation = null;
      this.pendingConstructionDraftBinding = null;
    }
    if (packet.kind === "intake") this.latestIntakeAssessment = null;
    return { ok: true, code: "CONSTRUCTION_PACKET_DISCARDED", packetId, acceptedStateChanged: false, next: "Read the current plan before beginning replacement construction work." };
  }

  async openKitchen(context: RuntimeRequestContext = {}): Promise<ToolResult> {
    const selectors = ["identity", "lifecycle", "allocations", "actuals", "constraints", "entities", "preferences", "pending"] as const;
    const stateResult = this.kernel.getState([...selectors]);
    const state = stateResult.state as Record<string, unknown>;
    const pending = state.pending as Record<string, unknown>;
    const catalog = this.listPlans();
    const movable = this.kernel.getMovableSet();
    const construction = await this.getConstructionPacket(context);
    const activeEvent = this.kernel.events.find((event) => event.eventId === this.kernel.activeEventId) ?? null;

    let route: KitchenRoute;
    if (this.pendingPlanDraft) {
      route = this.planActivationConfirmation
        ? {
          stage: "human_confirmed",
          nextTool: "finite_activate_confirmed_plan",
          targetId: this.pendingPlanDraft.draftId,
          authorityPresent: true,
          knownArgs: {
            draftId: this.pendingPlanDraft.draftId,
            confirmationId: this.planActivationConfirmation.confirmationId,
            expectedPlanId: this.pendingPlanDraft.basePlanId,
            expectedRevision: this.pendingPlanDraft.baseRevision,
          },
        }
        : { stage: "awaiting_human", nextTool: null, humanAction: "confirm_or_reject_plan_draft", targetId: this.pendingPlanDraft.draftId, authorityPresent: false };
    } else if (this.returnedConstructionReview) {
      route = this.returnedConstructionReview.feedbackRequired
        ? { stage: "awaiting_human", nextTool: null, humanAction: "describe_returned_plan_draft", targetId: this.returnedConstructionReview.draftId, authorityPresent: false }
        : { stage: "draft_returned", nextTool: "finite_get_returned_plan_draft", targetId: this.returnedConstructionReview.draftId, authorityPresent: false };
    } else if (this.kernel.pendingCorrection) {
      route = this.kernel.correctionConfirmation
        ? { stage: "human_confirmed", nextTool: "finite_apply_confirmed_actual_correction", targetId: this.kernel.pendingCorrection.correctionId, authorityPresent: true }
        : { stage: "awaiting_human", nextTool: null, humanAction: "confirm_actual_correction", targetId: this.kernel.pendingCorrection.correctionId, authorityPresent: false };
    } else if (this.kernel.pendingPreferenceChange) {
      route = this.kernel.preferenceConfirmation
        ? { stage: "human_confirmed", nextTool: "finite_apply_confirmed_preference_change", targetId: this.kernel.pendingPreferenceChange.preferenceChangeId, authorityPresent: true }
        : { stage: "awaiting_human", nextTool: null, humanAction: "confirm_preference_change", targetId: this.kernel.pendingPreferenceChange.preferenceChangeId, authorityPresent: false };
    } else if (this.kernel.pendingLifecycleChange) {
      route = this.kernel.lifecycleConfirmation
        ? { stage: "human_confirmed", nextTool: "finite_apply_confirmed_plan_lifecycle", targetId: this.kernel.pendingLifecycleChange.lifecycleChangeId, authorityPresent: true }
        : { stage: "awaiting_human", nextTool: null, humanAction: "confirm_plan_lifecycle", targetId: this.kernel.pendingLifecycleChange.lifecycleChangeId, authorityPresent: false };
    } else if (this.kernel.pendingGroupDecision) {
      route = this.kernel.groupDecisionConfirmation
        ? { stage: "human_confirmed", nextTool: "finite_apply_confirmed_group_decision", targetId: this.kernel.pendingGroupDecision.groupDecisionId, authorityPresent: true }
        : { stage: "awaiting_human", nextTool: null, humanAction: "confirm_group_decision", targetId: this.kernel.pendingGroupDecision.groupDecisionId, authorityPresent: false };
    } else if (this.kernel.pendingExternalAction) {
      route = this.kernel.externalActionConfirmation
        ? { stage: "human_confirmed", nextTool: "finite_apply_confirmed_external_action", targetId: this.kernel.pendingExternalAction.externalActionChangeId, authorityPresent: true }
        : { stage: "awaiting_human", nextTool: null, humanAction: "confirm_external_action", targetId: this.kernel.pendingExternalAction.externalActionChangeId, authorityPresent: false };
    } else if (this.kernel.approval && this.kernel.stagedCandidate) {
      route = { stage: "human_approved", nextTool: "finite_apply_approved_option", targetId: this.kernel.stagedCandidate.candidateId, authorityPresent: true };
    } else if (this.kernel.stagedCandidate) {
      route = { stage: "awaiting_human", nextTool: null, humanAction: "approve_reject_or_give_feedback", targetId: this.kernel.stagedCandidate.candidateId, authorityPresent: false };
    } else if (this.kernel.activeEventId && this.kernel.candidates.size) {
      route = { stage: "options_available", nextTool: "finite_stage_option", targetId: this.kernel.activeEventId, authorityPresent: false };
    } else if (this.kernel.activeEventId && Number(this.kernel.lastOptionSearch?.validOptionCount) === 0) {
      route = { stage: "options_available", nextTool: null, targetId: this.kernel.activeEventId, authorityPresent: false };
    } else if (this.kernel.activeEventId) {
      route = { stage: "change_recorded", nextTool: "finite_compare_options", targetId: this.kernel.activeEventId, authorityPresent: false };
    } else if (this.kernel.lifecycleStatus !== "active") {
      route = { stage: "plan_inactive", nextTool: null, humanAction: "reopen_or_leave_plan_closed", targetId: null, authorityPresent: false };
    } else {
      route = { stage: "ready", nextTool: this.kernel.profile.contextualCapabilities[0] ?? "finite_record_change_event", targetId: null, authorityPresent: false };
    }

    const legal = (movable.legal as Array<Record<string, unknown>> | undefined) ?? [];
    const blocked = (movable.blocked as Array<Record<string, unknown>> | undefined) ?? [];
    const briefBase = {
      briefVersion: "finite-plan-kitchen.v1" as const,
      operator: "Codex",
      consumer: "human",
      active: {
        planId: this.kernel.profile.planId,
        profileId: this.kernel.profile.profileId,
        profileHash: this.kernel.profile.profileHash,
        revision: this.kernel.revision,
      },
      consumerOutcome: {
        name: resolvePlanTitle({ proposed: this.kernel.profile.name, brief: this.kernel.profile.surface.hero.brief }),
        orderedOutcome: activeEvent?.title ?? this.kernel.profile.surface.hero.brief,
        projection: {
          timeModel: this.kernel.profile.surface.timeModel,
          nouns: clone(this.kernel.profile.surface.nouns),
          headline: resolvePlanTitle({ proposed: this.kernel.profile.surface.hero.title, brief: this.kernel.profile.surface.hero.brief }),
          primaryMeasures: clone(this.kernel.profile.surface.primaryMeasures),
        },
      },
      truth: state,
      moveSpace: {
        legal: legal.map(({ moveId, dimension, tradeoff, savingsMinor, daysDelta }) => ({ moveId, dimension, tradeoff, savingsMinor, daysDelta })),
        blocked: blocked.map(({ moveId, dimension, tradeoff }) => ({ moveId, dimension, tradeoff })),
        policy: clone(this.kernel.profile.searchPolicy),
      },
      work: {
        route,
        activeEvent: activeEvent ? clone(activeEvent) : null,
        construction: construction.ok ? clone(construction.packet) : { status: "none", code: construction.code },
      },
      chefMenu: buildChefMenu(this.kernel, route),
      catalog: {
        activePlanId: catalog.activePlanId,
        plans: clone(catalog.plans),
      },
      authority: {
        humanAuthorityActionsExposedThroughWebMCP: false,
        authorityPersistedAcrossReload: false,
        law: "Codex may prepare and apply exact human-authorized work; only the human surface may create approval or confirmation.",
      },
      persistence: clone(this.kernel.acceptedTruth),
    };
    const briefHash = await sha256(briefBase);
    return {
      ok: true,
      code: "KITCHEN_OPEN",
      brief: { ...briefBase, briefHash },
      acceptedStateChanged: false,
      next: route.nextTool ? `Use ${String(route.nextTool)} with the exact active plan context.` : `Wait for human action: ${String(route.humanAction)}.`,
    };
  }

  listPlans(): ToolResult {
    return {
      ok: true,
      code: "PLAN_CATALOG",
      activePlanId: this.kernel.profile.planId,
      plans: [...this.plans.values()].map(({ profile, lineage }) => ({
        planId: profile.planId,
        profileId: profile.profileId,
        name: resolvePlanTitle({ proposed: profile.name, brief: profile.surface.hero.brief }),
        title: resolvePlanTitle({ proposed: profile.surface.hero.title, brief: profile.surface.hero.brief }),
        profileHash: profile.profileHash,
        active: profile.planId === this.kernel.profile.planId,
        lineage: lineage ? clone(lineage) : { activationKind: "built_in", supersedesPlanId: null, supersedesProfileHash: null, diffHash: null, activationReceiptId: null },
        supersededBy: [...this.plans.values()].find((entry) => entry.lineage?.supersedesPlanId === profile.planId)?.profile.planId ?? null,
      })),
      pendingDraft: this.pendingPlanDraft ? {
        draftId: this.pendingPlanDraft.draftId,
        planId: this.pendingPlanDraft.profile.planId,
        profileHash: this.pendingPlanDraft.profile.profileHash,
        contentHash: this.pendingPlanDraft.contentHash,
        humanConfirmed: this.planActivationConfirmation?.draftId === this.pendingPlanDraft.draftId,
        confirmationId: this.planActivationConfirmation?.draftId === this.pendingPlanDraft.draftId ? this.planActivationConfirmation.confirmationId : null,
        sourceArrival: clone(this.pendingPlanDraft.sourceArrival),
        amendment: this.pendingPlanDraft.amendment ? { supersedesPlanId: this.pendingPlanDraft.amendment.supersedesPlanId, supersedesRevision: this.pendingPlanDraft.amendment.supersedesRevision, diffHash: this.pendingPlanDraft.amendment.diffHash, diff: clone(this.pendingPlanDraft.amendment.diff) } : null,
      } : null,
      acceptedStateChanged: false,
    };
  }

  getPlanBlueprint(profileId: ProfileId): ToolResult {
    if (!this.profiles.has(profileId)) return { ok: false, code: "PROFILE_NOT_FOUND", acceptedStateChanged: false };
    const definition = getProfileDefinition(profileId);
    definition.planId = `plan_${profileId}_new`;
    definition.name = `New ${profileId} finite plan`;
    definition.accepted.forecastMinor += definition.accepted.spentMinor;
    definition.accepted.spentMinor = 0;
    definition.actuals = [];
    return {
      ok: true,
      code: "PLAN_BLUEPRINT",
      profileId,
      profile: definition,
      contract: {
        templateRole: "Compiler grammar only. Every allocation, move, stage, title, and route value in profile is an example and must not be attributed to the current human order.",
        constructionModes: {
          exact: "Require exact allocation components and exact family entities.",
          adaptive_shell: "Keep the finite total exact, admit source-labelled working entity estimates, initialize unsupplied ledger buckets at zero recorded value, and hold the residual as unallocated buffer rather than a fabricated forecast.",
        },
        fixed: ["schemaVersion", "profileId", "contextualCapabilities", "surface.version", "surface.timeModel"],
        mustConserve: "spentMinor + committedMinor + forecastMinor + bufferMinor = totalBudgetMinor",
        actualLaw: "sum(actuals.originalAmountMinor) = accepted.spentMinor; every actual evidenceRef must already exist in the active evidence catalog",
        familySemantics: {
          travel: ["trip_days.days", "booked_segment_days.days", "timeline_lane"],
          renovation: ["completion_day.day", "committed_completion_day.day", "phase_lane"],
          event: ["guest_headcount.count", "venue.capacity", "run_of_show"],
          general: ["timeline", "tasks", "records", "people", "decisions", "dependencies", "evidence", "constraints"],
        }[profileId],
        optionalDimensions: {
          money: ["not_applicable", "unknown", "zero", "positive"],
          location: ["not_applicable", "unknown", "zero", "positive"],
          capacity: ["not_applicable", "unknown", "zero", "positive"],
          law: "A dimension may be absent or unresolved without inventing a positive value. Zero and not applicable remain distinct states.",
        },
        bounds: { serializedCharacters: 100_000, actuals: 100, entities: 50, relationships: 100, moves: 12, stages: 12, primaryMeasures: 8 },
        authority: "Codex may edit and stage the profile. Only the human surface can confirm its exact compiled hashes; only then may Codex activate it.",
      },
      acceptedStateChanged: false,
      next: "Assess the reviewed human facts first. Use adaptive_shell when the outcome is intentionally open; then compile the exact intake packet so example-specific moves and stages cannot leak into the new draft.",
    };
  }

  private assessPlanIntakeFacts(input: unknown): ToolResult {
    const missing: IntakeFactIssue[] = [];
    const conflicts: IntakeFactIssue[] = [];
    const derivedFacts: Record<string, number> = {};
    const constructionAssumptions: Array<{ path: string; value: number; basis: string; sourcePaths: string[]; status: "working" | "human_confirmed" }> = [];
    if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, code: "INVALID_PLAN_INTAKE", conflicts: [{ path: "$", code: "OBJECT_REQUIRED", prompt: "Provide a typed intake object." }], acceptedStateChanged: false };
    if (JSON.stringify(input).length > 30_000) return { ok: false, code: "INVALID_PLAN_INTAKE", conflicts: [{ path: "$", code: "INTAKE_TOO_LARGE", prompt: "Keep the human-fact packet under 30,000 serialized characters." }], acceptedStateChanged: false };
    const facts = clone(input as PlanIntakeInput);
    constructionAssumptions.push(...clone(facts.assumptions ?? []));
    const ask = (path: string, code: string, prompt: string): void => { missing.push({ path, code, prompt }); };
    const conflict = (path: string, code: string, prompt: string): void => { conflicts.push({ path, code, prompt }); };
    const boundedText = (value: unknown, max: number): boolean => typeof value === "string" && Boolean(value.trim()) && value.length <= max;
    const adaptiveShell = facts.constructionMode === "adaptive_shell";
    if (facts.sourceArrival) {
      if (!boundedText(facts.sourceArrival.orderId, 200)
        || !Number.isSafeInteger(facts.sourceArrival.orderVersion)
        || facts.sourceArrival.orderVersion < 1
        || !/^[a-f0-9]{64}$/.test(facts.sourceArrival.orderChecksum)) {
        conflict("sourceArrival", "ARRIVAL_BINDING_INVALID", "Bind arrival-built construction to one exact order id, positive version, and SHA-256 checksum.");
      }
    }
    if (facts.constructionMode !== undefined && facts.constructionMode !== "exact" && !adaptiveShell) conflict("constructionMode", "CONSTRUCTION_MODE_INVALID", "Use exact or adaptive_shell construction mode.");
    const dependencyIds = new Set<string>();
    for (let index = 0; index < (facts.dependencies ?? []).length; index += 1) {
      const dependency = facts.dependencies![index]!;
      const path = `dependencies.${index}`;
      if (!boundedText(dependency.dependencyId, 200) || dependencyIds.has(dependency.dependencyId)) conflict(`${path}.dependencyId`, "DEPENDENCY_ID_INVALID", "Use one unique bounded dependency id.");
      dependencyIds.add(dependency.dependencyId);
      if (!(dependency.kind === "operator_research" || dependency.kind === "human_coordination" || dependency.kind === "external_evidence" || dependency.kind === "human_decision")) conflict(`${path}.kind`, "DEPENDENCY_KIND_INVALID", "Classify the dependency as operator research, human coordination, external evidence, or human decision.");
      if (!(dependency.status === "open" || dependency.status === "resolved" || dependency.status === "deferred")) conflict(`${path}.status`, "DEPENDENCY_STATUS_INVALID", "Use open, resolved, or deferred dependency status.");
      if (!boundedText(dependency.title, 500) || typeof dependency.blocking !== "boolean" || dependency.sourcePaths.length > 20 || dependency.sourcePaths.some((sourcePath) => !boundedText(sourcePath, 200))) conflict(path, "DEPENDENCY_INVALID", "Keep dependency title, blocking state, and source paths bounded and explicit.");
    }
    const profileId = facts.profileId;
    if (!(profileId === "travel" || profileId === "renovation" || profileId === "event" || profileId === "general")) ask("profileId", "FAMILY_REQUIRED", "Use travel, renovation, event, or the composable general planning contract.");
    if (!boundedText(facts.planId, 64) || !/^[a-z0-9][a-z0-9_-]{2,63}$/.test(facts.planId ?? "")) ask("planId", "PLAN_ID_REQUIRED", "Provide a new lowercase plan identifier.");
    else if (this.plans.has(facts.planId!)) conflict("planId", "PLAN_ID_ALREADY_EXISTS", "Use a new plan id, or derive an immutable amendment blueprint from the active version.");
    if (!boundedText(facts.name, 120)) ask("name", "PLAN_NAME_REQUIRED", "What should the human call this plan?");
    if (!boundedText(facts.brief, 500)) ask("brief", "OUTCOME_BRIEF_REQUIRED", "What useful outcome is the human ordering, in one bounded sentence?");
    if (facts.currencyCode !== undefined && !/^[A-Z]{3}$/.test(facts.currencyCode)) conflict("currencyCode", "CURRENCY_CODE_INVALID", "Use one uppercase three-letter base-currency code.");

    const dimensionStates = new Set(["not_applicable", "unknown", "zero", "positive"]);
    const suppliedDimensions = facts.planningDimensions ?? {};
    for (const [dimension, state] of Object.entries(suppliedDimensions)) if (!["money", "location", "capacity"].includes(dimension) || !dimensionStates.has(String(state))) conflict(`planningDimensions.${dimension}`, "PLANNING_DIMENSION_INVALID", "Use not_applicable, unknown, zero, or positive for each optional planning dimension.");
    const suppliedTotal = facts.allocation?.totalBudgetMinor;
    const moneyState = suppliedDimensions.money
      ?? (Number.isSafeInteger(suppliedTotal) ? Number(suppliedTotal) > 0 ? "positive" : "zero" : profileId === "general" ? "unknown" : "positive");
    facts.planningDimensions = {
      money: moneyState,
      location: suppliedDimensions.location ?? (profileId === "travel" || profileId === "event" ? "unknown" : "not_applicable"),
      capacity: suppliedDimensions.capacity ?? (profileId === "event" ? "unknown" : "not_applicable"),
    };
    const allocationFields = ["totalBudgetMinor", "spentMinor", "committedMinor", "forecastMinor", "bufferMinor"] as const;
    const allocation = { ...(facts.allocation ?? {}) };
    for (const field of allocationFields) {
      const value = allocation[field];
      if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) conflict(`allocation.${field}`, "INVALID_MONEY", `${field} must be a non-negative safe integer in minor units.`);
    }
    if (allocation.totalBudgetMinor === undefined && moneyState === "positive") ask("allocation.totalBudgetMinor", "TOTAL_REQUIRED", "What is the fixed finite money total?");
    if (allocation.totalBudgetMinor === undefined && moneyState !== "positive") allocation.totalBudgetMinor = 0;
    if (moneyState === "positive" && allocation.totalBudgetMinor !== undefined && allocation.totalBudgetMinor <= 0) conflict("allocation.totalBudgetMinor", "POSITIVE_TOTAL_REQUIRED", "A positive money dimension needs a positive total.");
    if (moneyState !== "positive" && allocation.totalBudgetMinor !== undefined && allocation.totalBudgetMinor !== 0) conflict("allocation.totalBudgetMinor", "MONEY_STATE_TOTAL_CONFLICT", `The money dimension is ${moneyState}, so its total must be zero.`);
    const componentFields = ["spentMinor", "committedMinor", "forecastMinor", "bufferMinor"] as const;
    let absentComponents = componentFields.filter((field) => allocation[field] === undefined);
    if (adaptiveShell && allocation.totalBudgetMinor !== undefined && conflicts.length === 0) {
      for (const field of ["spentMinor", "committedMinor", "forecastMinor"] as const) if (allocation[field] === undefined) {
        allocation[field] = 0;
        derivedFacts[`allocation.${field}`] = 0;
        constructionAssumptions.push({ path: `allocation.${field}`, value: 0, basis: `No ${field.replace("Minor", "")} amount was supplied; initialize the recorded ledger at zero and keep the value provisional until evidence or human input arrives.`, sourcePaths: ["reviewed_interpretation"], status: "working" });
      }
      if (allocation.bufferMinor === undefined) {
        const residual = allocation.totalBudgetMinor - (allocation.spentMinor ?? 0) - (allocation.committedMinor ?? 0) - (allocation.forecastMinor ?? 0);
        if (residual < 0) conflict("allocation.bufferMinor", "NEGATIVE_RESIDUAL", "Known allocations already exceed the finite total.");
        else {
          allocation.bufferMinor = residual;
          derivedFacts["allocation.bufferMinor"] = residual;
          constructionAssumptions.push({ path: "allocation.bufferMinor", value: residual, basis: "Hold every dollar not yet evidenced or forecast as unallocated freedom; this is not a cost estimate.", sourcePaths: ["allocation.totalBudgetMinor"], status: "working" });
        }
      }
      absentComponents = componentFields.filter((field) => allocation[field] === undefined);
    }
    if (allocation.totalBudgetMinor !== undefined && absentComponents.length === 1 && conflicts.length === 0) {
      const missingField = absentComponents[0]!;
      const known = componentFields.reduce((total, field) => total + (allocation[field] ?? 0), 0);
      const residual = allocation.totalBudgetMinor - known;
      if (residual < 0) conflict(`allocation.${missingField}`, "NEGATIVE_RESIDUAL", "Known allocations already exceed the finite total.");
      else { allocation[missingField] = residual; derivedFacts[`allocation.${missingField}`] = residual; }
    } else for (const field of absentComponents) ask(`allocation.${field}`, "ALLOCATION_REQUIRED", `How much is ${field.replace("Minor", "")}?`);
    if (componentFields.every((field) => allocation[field] !== undefined) && allocation.totalBudgetMinor !== undefined) {
      const sum = componentFields.reduce((total, field) => total + (allocation[field] ?? 0), 0);
      if (sum !== allocation.totalBudgetMinor) conflict("allocation", "FINITE_TOTAL_CONFLICT", `Allocation components total ${sum}, not ${allocation.totalBudgetMinor}.`);
    }

    const spentMinor = allocation.spentMinor;
    if (spentMinor !== undefined && spentMinor > 0 && !facts.actuals?.length) ask("actuals", "ACTUALS_REQUIRED", "List the already-paid items and their evidence references.");
    if (facts.actuals) {
      const actualSum = facts.actuals.reduce((total, actual) => total + (Number.isSafeInteger(actual.originalAmountMinor) ? actual.originalAmountMinor : 0), 0);
      if (spentMinor !== undefined && actualSum !== spentMinor) conflict("actuals", "ACTUAL_LEDGER_CONFLICT", `Actual items total ${actualSum}, not spentMinor ${spentMinor}.`);
      for (let index = 0; index < facts.actuals.length; index += 1) {
        const actual = facts.actuals[index]!;
        if (!this.kernel.evidence.has(actual.evidenceRef)) ask(`actuals.${index}.evidenceRef`, "EVIDENCE_REQUIRED", `Register evidence for ${actual.label || actual.actualId || `actual ${index + 1}`}.`);
      }
    }
    const normalizeIdentifier = (value: string, fallback: string): string => {
      const normalized = value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64);
      return /^[a-z0-9][a-z0-9_-]{2,63}$/.test(normalized) ? normalized : fallback;
    };
    if (!facts.locks?.length) ask("locks", "LOCKS_REQUIRED", "What must Codex protect even when the plan is under pressure?");
    else facts.locks = [...new Set(facts.locks.slice(0, 30).map((value, index) => normalizeIdentifier(String(value), `protected_item_${index + 1}`)))];
    if (!facts.preferenceLabels?.length) ask("preferenceLabels", "PREFERENCES_REQUIRED", "What should Codex preserve when trade-offs are necessary?");
    else facts.preferenceLabels = [...new Set(facts.preferenceLabels.slice(0, 20).map((value, index) => normalizeIdentifier(String(value), `preference_${index + 1}`)))];
    if (facts.moves && Object.keys(facts.moves).length > 12) conflict("moves", "TOO_MANY_MOVES", "Keep the bounded recovery menu to twelve moves or fewer.");
    if (facts.searchPolicy && (!Number.isSafeInteger(facts.searchPolicy.maxMovesPerOption) || !Number.isSafeInteger(facts.searchPolicy.maxCombinations))) conflict("searchPolicy", "SEARCH_POLICY_INVALID", "Use bounded integer move and combination limits.");
    if (!facts.stages?.length && profileId === "general" && adaptiveShell) {
      facts.stages = [{ stageId: "begin", label: "Begin the plan", detail: "Choose the first practical action.", marker: "Up next", status: "current" }];
      constructionAssumptions.push({ path: "stages.begin", value: 1, basis: "No sequence was supplied, so the general plan begins with one editable starter action.", sourcePaths: ["reviewed_interpretation"], status: "working" });
    } else if (!facts.stages?.length) ask("stages", "TIME_SHAPE_REQUIRED", "What are the plan's meaningful calendar stops, phases, or run-of-show stages?");
    if (profileId === "travel" || profileId === "renovation" || profileId === "event") {
      const required = {
        travel: [["trip_days", "days"], ["booked_segment_days", "days"]],
        renovation: [["completion_day", "day"], ["committed_completion_day", "day"]],
        event: [["guest_headcount", "count"], ["venue", "capacity"]],
      }[profileId];
      const entityValues = clone(facts.entityValues ?? {});
      for (const [entityId, field] of required) if (!Number.isSafeInteger(entityValues[entityId!]?.[field!])) {
        const estimate = facts.entityEstimates?.[entityId!]?.[field!];
        if (adaptiveShell && estimate && Number.isSafeInteger(estimate.value) && boundedText(estimate.basis, 500) && estimate.sourcePaths.length <= 20 && estimate.sourcePaths.every((sourcePath) => boundedText(sourcePath, 200))) {
          entityValues[entityId!] = { ...(entityValues[entityId!] ?? {}), [field!]: estimate.value };
          derivedFacts[`entityValues.${entityId}.${field}`] = estimate.value;
          constructionAssumptions.push({ path: `entityValues.${entityId}.${field}`, value: estimate.value, basis: estimate.basis, sourcePaths: clone(estimate.sourcePaths), status: "working" });
        } else ask(`entityValues.${entityId}.${field}`, "ENTITY_FACT_REQUIRED", adaptiveShell ? `Provide a sourced working estimate for ${entityId}.${field}; Finite will keep it visibly provisional.` : `Provide ${entityId}.${field} for the ${profileId} operating contract.`);
      }
      facts.entityValues = entityValues;
    }
    const normalizedFacts = { ...facts, allocation, assumptions: constructionAssumptions };
    const result: ToolResult = conflicts.length
      ? { ok: false, code: "INTAKE_FACTS_CONFLICT", conflicts, missing, derivedFacts, normalizedFacts, acceptedStateChanged: false, next: "Ask the human only for the conflicting and missing paths; do not stage a profile." }
      : missing.length
        ? { ok: true, code: "INTAKE_FACTS_MISSING", missing, derivedFacts, normalizedFacts, acceptedStateChanged: false, next: "Ask the human only for these missing facts, update the typed packet, and reassess." }
        : { ok: true, code: adaptiveShell && constructionAssumptions.length ? "INTAKE_FACTS_COMPLETE_WITH_ASSUMPTIONS" : "INTAKE_FACTS_COMPLETE", missing: [], conflicts: [], derivedFacts, constructionAssumptions, normalizedFacts, acceptedStateChanged: false, next: "Compile the verified construction packet into a clean family profile; do not copy example-specific moves or stages from the blueprint." };
    this.latestIntakeAssessment = clone(result);
    return result;
  }

  async assessPlanIntake(input: unknown, context: RuntimeRequestContext = {}): Promise<ToolResult> {
    const result = this.assessPlanIntakeFacts(input);
    const normalizedFacts = result.normalizedFacts;
    if (!normalizedFacts || typeof normalizedFacts !== "object") return result;
    try {
      const facts = normalizedFacts as PlanIntakeInput;
      const evidenceRefs = [...new Set((facts.actuals ?? []).map((actual) => actual.evidenceRef))];
      const evidenceRecords = evidenceRefs.map((evidenceId) => this.kernel.evidence.get(evidenceId)).filter((evidence): evidence is EvidenceRecord => Boolean(evidence)).map(clone);
      const packet = await this.persistConstructionPacket("intake", { facts, assessmentCode: result.code, evidenceRecords }, context);
      this.pendingPlanDraft = null;
      this.planActivationConfirmation = null;
      this.pendingConstructionDraftBinding = null;
      return packet ? {
        ...result,
        constructionPacket: this.constructionPacketSummary(packet),
        ...(String(result.code).startsWith("INTAKE_FACTS_COMPLETE") ? {
          nextAction: {
            stage: "construction_intake_ready",
            nextTool: "finite_compile_intake_to_draft",
            knownArgs: { packetId: packet.packetId, expectedChecksum: packet.checksum },
            requiresHuman: false,
            authorityPresent: false,
          },
        } : {}),
      } : result;
    } catch (error) {
      if (context.signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) throw error;
      return { ...result, durability: { ok: false, code: "CONSTRUCTION_PACKET_STORAGE_FAILED", message: error instanceof Error ? error.message : String(error) }, next: "The assessment is usable in this session but was not saved. Repair storage before relying on reload continuity." };
    }
  }

  async compileIntakeToDraft(input: { packetId: string; expectedChecksum: string } | { preparedIntake: unknown }, context: RuntimeRequestContext = {}): Promise<ToolResult> {
    let assessment: ToolResult;
    let compiledFrom: Record<string, unknown>;
    if ("preparedIntake" in input) {
      assessment = this.assessPlanIntakeFacts(input.preparedIntake);
      this.latestIntakeAssessment = clone(assessment);
      compiledFrom = {
        sameTurnPreparation: true,
        assessmentCode: assessment.code,
        constructionMode: (assessment.normalizedFacts as PlanIntakeInput | undefined)?.constructionMode ?? "exact",
      };
    } else {
      const { packetId, expectedChecksum } = input;
      const verified = await this.readVerifiedConstructionPacket(context);
      if ("ok" in verified) return verified;
      if (verified.packetId !== packetId || verified.checksum !== expectedChecksum) return { ok: false, code: "CONSTRUCTION_PACKET_GUARD_MISMATCH", packet: this.constructionPacketSummary(verified), acceptedStateChanged: false, next: "Re-open the exact construction packet; do not compile stale or guessed intake." };
      if (verified.kind !== "intake") return { ok: false, code: "CONSTRUCTION_INTAKE_REQUIRED", packet: this.constructionPacketSummary(verified), acceptedStateChanged: false };
      if (Date.parse(verified.expiresAt) <= this.now().getTime()) return { ok: false, code: "CONSTRUCTION_PACKET_EXPIRED", packet: this.constructionPacketSummary(verified), acceptedStateChanged: false };
      if (verified.basePlanId !== this.kernel.profile.planId || verified.baseProfileHash !== this.kernel.profile.profileHash || verified.baseRevision !== this.kernel.revision) return { ok: false, code: "CONSTRUCTION_PACKET_BASE_STALE", packet: this.constructionPacketSummary(verified), acceptedStateChanged: false };
      assessment = this.assessPlanIntakeFacts(verified.payload.facts);
      compiledFrom = { packetId, checksum: expectedChecksum, assessmentCode: assessment.code, constructionMode: (assessment.normalizedFacts as PlanIntakeInput | undefined)?.constructionMode ?? "exact" };
    }
    if (!String(assessment.code).startsWith("INTAKE_FACTS_COMPLETE")) return { ok: false, code: "CONSTRUCTION_INTAKE_INCOMPLETE", assessment, acceptedStateChanged: false, next: "Resolve only the typed missing paths or conflicts, then save a replacement intake packet." };
    const facts = assessment.normalizedFacts as PlanIntakeInput;
    const profileId = facts.profileId as ProfileId;
    const template = getProfileDefinition(profileId);
    const entityValues = facts.entityValues ?? {};
    const boundedStageId = (value: string, index: number): string => {
      const normalized = value.toLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);
      return /^[a-z0-9][a-z0-9_-]{2,63}$/.test(normalized) ? normalized : `stage_${index + 1}`;
    };
    const stages = (facts.stages ?? []).map((stage, index) => ({
      stageId: boundedStageId(stage.stageId || stage.label, index),
      label: stage.label,
      detail: stage.detail || "Timing and cost remain adaptive until the named dependency is resolved.",
      marker: stage.marker || "Open",
      status: stage.status === "complete" || stage.status === "current" || stage.status === "movable" || stage.status === "locked" ? stage.status : "planned" as const,
    }));
    const entities = clone(template.entities);
    for (const [entityId, values] of Object.entries(entityValues)) if (entities[entityId]) entities[entityId] = { ...entities[entityId]!, values: { ...entities[entityId]!.values, ...clone(values) } };
    if (profileId === "general") {
      entities.plan_items = { ...entities.plan_items!, values: { count: stages.length } };
      entities.open_dependencies = { ...entities.open_dependencies!, values: { count: (facts.dependencies ?? []).filter((dependency) => dependency.status === "open").length } };
    }
    const adaptiveShell = facts.constructionMode === "adaptive_shell";
    const relationships = adaptiveShell && profileId === "travel" ? [{
      relationshipId: "booked_days_within_trip",
      type: "lte" as const,
      left: { entityId: "booked_segment_days", field: "days" },
      right: { entityId: "trip_days", field: "days" },
      code: "BOOKED_DAYS_EXCEED_TRIP",
    }] : clone(template.relationships);
    const profile: ProfileDefinition = {
      ...clone(template),
      planId: facts.planId!,
      name: facts.name!,
      currencyCode: facts.currencyCode ?? template.currencyCode ?? "AUD",
      accepted: clone(facts.allocation as ProfileDefinition["accepted"]),
      actuals: clone(facts.actuals ?? []),
      locks: clone(facts.locks ?? []),
      preferenceLabels: clone(facts.preferenceLabels ?? []),
      entities,
      relationships,
      moves: clone(facts.moves ?? {}),
      searchPolicy: facts.moves && Object.keys(facts.moves).length
        ? clone(facts.searchPolicy ?? template.searchPolicy)
        : { ...clone(template.searchPolicy), maxMovesPerOption: 0 },
      evidencePolicy: { ...clone(template.evidencePolicy), asOf: this.now().toISOString().slice(0, 10) },
      ...((facts.planningDimensions ?? template.planningDimensions) ? { planningDimensions: clone((facts.planningDimensions ?? template.planningDimensions) as NonNullable<ProfileDefinition["planningDimensions"]>) } : {}),
      surface: {
        ...clone(template.surface),
        hero: { eyebrow: adaptiveShell ? "Adaptive planning shell" : "Finite plan", title: facts.name!, brief: facts.brief! },
        stages,
        preferredComponents: template.surface.preferredComponents.filter((component) => component !== "option_compare"),
        dependencies: clone(facts.dependencies ?? []),
        assumptions: clone((assessment.constructionAssumptions ?? []) as NonNullable<ProfileDefinition["surface"]["assumptions"]>),
      },
    };
    const staged = await this.compileDraft(profile, null, facts.sourceArrival ?? null, context);
    return staged.ok ? {
      ...staged,
      code: "PLAN_DRAFT_STAGED_FROM_INTAKE",
      compiledFrom,
      next: "The clean profile contains only intake-supplied plan-specific moves, never example moves. Show its working assumptions, recovery menu, open dependencies, profile hash, and draft hash to the human on the Site; WebMCP cannot confirm or activate it.",
    } : staged;
  }

  private currentActualDefinitions(): ProfileDefinition["actuals"] {
    const current = this.kernel.profile;
    const actualState = this.kernel.getState(["actuals"]).state as { actuals?: Array<{ actualId: string; label: string; currentAmountMinor: number }> };
    return (actualState.actuals ?? []).map((actual) => {
      const correction = [...this.kernel.correctionEvents].reverse().find((event) => event.actualId === actual.actualId);
      const original = current.actuals.find((item) => item.actualId === actual.actualId);
      return { actualId: actual.actualId, label: actual.label, originalAmountMinor: actual.currentAmountMinor, evidenceRef: correction?.evidenceRef ?? original?.evidenceRef ?? "" };
    });
  }

  getAmendmentBlueprint(): ToolResult {
    const current = this.kernel.profile;
    const successor = [...this.plans.values()].find((entry) => entry.lineage?.supersedesPlanId === current.planId);
    if (successor) return { ok: false, code: "PLAN_VERSION_SUPERSEDED", planId: current.planId, supersededBy: successor.profile.planId, acceptedStateChanged: false, next: "Switch to the current successor before deriving another immutable version." };
    const definition = profileDefinition(current);
    const versionBase = current.planId.replace(/_v\d+$/, "");
    let version = 2;
    while (this.plans.has(`${versionBase}_v${version}`)) version += 1;
    definition.planId = `${versionBase}_v${version}`;
    definition.name = `${current.name.replace(/ · v\d+$/, "")} · v${version}`;
    definition.accepted = clone(this.kernel.accepted);
    definition.preferenceWeights = clone(this.kernel.preferenceWeights);
    definition.entities = clone(this.kernel.entities);
    definition.actuals = this.currentActualDefinitions();
    return {
      ok: true,
      code: "PLAN_AMENDMENT_BLUEPRINT",
      supersedesPlanId: current.planId,
      supersedesProfileHash: current.profileHash,
      supersedesRevision: this.kernel.revision,
      profile: definition,
      contract: {
        immutablePriorVersion: true,
        sameProfileFamilyRequired: true,
        newPlanIdRequired: true,
        materialDiffRequired: true,
        authority: "The human confirms the exact compiled profile and semantic diff; Codex activates the bound supersession through the guarded activation tool.",
      },
      acceptedStateChanged: false,
      next: "Change only the structure that must evolve, then stage this definition as an amendment of the exact active plan and revision.",
    };
  }

  private async amendmentBinding(profile: CompiledProfile): Promise<PlanAmendmentBinding | ToolResult> {
    const before = this.kernel.profile;
    if (profile.profileId !== before.profileId) return { ok: false, code: "AMENDMENT_FAMILY_MISMATCH", acceptedStateChanged: false };
    const allocationFields = ["totalBudgetMinor", "spentMinor", "committedMinor", "forecastMinor", "bufferMinor"] as const;
    const allocations = allocationFields.filter((field) => this.kernel.accepted[field] !== profile.accepted[field]).map((field) => ({ field, before: this.kernel.accepted[field], after: profile.accepted[field], delta: profile.accepted[field] - this.kernel.accepted[field] }));
    const locks = { added: profile.locks.filter((lock) => !before.locks.includes(lock)), removed: before.locks.filter((lock) => !profile.locks.includes(lock)) };
    const preferenceWeights = (Object.keys(profile.preferenceWeights) as Array<keyof typeof profile.preferenceWeights>)
      .filter((preference) => this.kernel.preferenceWeights[preference] !== profile.preferenceWeights[preference])
      .map((preference) => ({ preference, before: this.kernel.preferenceWeights[preference], after: profile.preferenceWeights[preference], delta: profile.preferenceWeights[preference] - this.kernel.preferenceWeights[preference] }));
    const entities: PlanAmendmentDiff["entities"] = [];
    const entityIds = new Set([...Object.keys(this.kernel.entities), ...Object.keys(profile.entities)]);
    for (const entityId of entityIds) {
      const fields = new Set([...Object.keys(this.kernel.entities[entityId]?.values ?? {}), ...Object.keys(profile.entities[entityId]?.values ?? {})]);
      for (const field of fields) {
        const prior = this.kernel.entities[entityId]?.values[field] ?? null;
        const next = profile.entities[entityId]?.values[field] ?? null;
        if (prior !== next) entities.push({ entityId, field, before: prior, after: next });
      }
    }
    const changedSections: string[] = [];
    if (allocations.length) changedSections.push("allocations");
    if (locks.added.length || locks.removed.length) changedSections.push("locks");
    if (preferenceWeights.length) changedSections.push("preferenceWeights");
    if (entities.length || JSON.stringify(this.kernel.entities) !== JSON.stringify(profile.entities)) changedSections.push("entities");
    for (const section of ["actuals", "preferenceLabels", "relationships", "moves", "searchPolicy", "evidencePolicy", "surface"] as const) {
      const priorValue = section === "actuals" ? this.currentActualDefinitions() : before[section];
      if (JSON.stringify(priorValue) !== JSON.stringify(profile[section])) changedSections.push(section);
    }
    if (!changedSections.length) return { ok: false, code: "AMENDMENT_NO_MATERIAL_CHANGE", acceptedStateChanged: false, next: "Change at least one accepted, constraint, entity, move, policy, or surface field beyond plan identity." };
    const diff: PlanAmendmentDiff = { allocations, locks, preferenceWeights, entities, changedSections };
    return {
      supersedesPlanId: before.planId,
      supersedesProfileHash: before.profileHash,
      supersedesRevision: this.kernel.revision,
      diff,
      diffHash: await sha256(diff),
    };
  }

  private async compileDraft(input: unknown, amendment: PlanAmendmentBinding | null, sourceArrival: ArrivalSourceBinding | null = null, context: RuntimeRequestContext = {}): Promise<ToolResult> {
    let profile: CompiledProfile;
    try {
      profile = await compileProfile(input);
    } catch (error) {
      return {
        ok: false,
        code: "PLAN_DRAFT_INVALID",
        issues: error instanceof ProfileValidationError ? error.issues : [error instanceof Error ? error.message : String(error)],
        acceptedStateChanged: false,
        next: "Repair the complete profile definition and stage it again.",
      };
    }
    if (this.plans.has(profile.planId)) return { ok: false, code: "PLAN_ID_ALREADY_EXISTS", planId: profile.planId, acceptedStateChanged: false };
    const evidenceRefs = [...new Set(profile.actuals.map((actual) => actual.evidenceRef))];
    const evidenceRecords: EvidenceRecord[] = [];
    for (const evidenceId of evidenceRefs) {
      const evidence = this.kernel.evidence.get(evidenceId);
      if (!evidence) return { ok: false, code: "PLAN_EVIDENCE_NOT_FOUND", evidenceId, acceptedStateChanged: false, next: "Register the evidence in the active kitchen before staging this plan." };
      if (!await evidenceIntegrity(evidence)) return { ok: false, code: "PLAN_EVIDENCE_INTEGRITY_FAILED", evidenceId, acceptedStateChanged: false };
      evidenceRecords.push(clone(evidence));
    }
    const bound = {
      basePlanId: this.kernel.profile.planId,
      baseRevision: this.kernel.revision,
      profileHash: profile.profileHash,
      evidenceBindings: evidenceRecords.map(({ evidenceId, contentHash, recordHash }) => ({ evidenceId, contentHash, recordHash })),
      amendment: amendment ? { supersedesPlanId: amendment.supersedesPlanId, supersedesProfileHash: amendment.supersedesProfileHash, supersedesRevision: amendment.supersedesRevision, diffHash: amendment.diffHash } : null,
      sourceArrival: clone(sourceArrival),
    };
    const contentHash = await sha256(bound);
    const draft: PlanDraft = {
      draftId: `plan_draft_${contentHash.slice(0, 16)}`,
      basePlanId: bound.basePlanId,
      baseRevision: bound.baseRevision,
      profile,
      evidenceRecords,
      contentHash,
      amendment,
      sourceArrival: clone(sourceArrival),
    };
    this.pendingPlanDraft = draft;
    this.planActivationConfirmation = null;
    let constructionPacket: PlanConstructionPacket | null = null;
    try {
      constructionPacket = await this.persistConstructionPacket("draft", {
        draftId: draft.draftId,
        contentHash: draft.contentHash,
        profile: profileDefinition(draft.profile),
        evidenceRecords: clone(draft.evidenceRecords),
        amendment: clone(draft.amendment),
        sourceArrival: clone(draft.sourceArrival),
      }, context);
      this.pendingConstructionDraftBinding = constructionPacket
        ? { packetId: constructionPacket.packetId, draftId: draft.draftId }
        : null;
    } catch (error) {
      if (context.signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) throw error;
      this.pendingPlanDraft = null;
      this.pendingConstructionDraftBinding = null;
      return { ok: false, code: "CONSTRUCTION_PACKET_STORAGE_FAILED", message: error instanceof Error ? error.message : String(error), acceptedStateChanged: false, next: "The plan was not staged because its non-authoritative work packet could not be made reload-safe." };
    }
    return {
      ok: true,
      code: amendment ? "PLAN_AMENDMENT_STAGED" : "PLAN_DRAFT_STAGED",
      draft: {
        draftId: draft.draftId,
        basePlanId: draft.basePlanId,
        baseRevision: draft.baseRevision,
        profile: clone(draft.profile),
        evidenceBindings: draft.evidenceRecords.map(({ evidenceId, contentHash, recordHash }) => ({ evidenceId, contentHash, recordHash })),
        contentHash: draft.contentHash,
        amendment: amendment ? clone(amendment) : null,
      },
      constructionPacket: constructionPacket ? this.constructionPacketSummary(constructionPacket) : null,
      acceptedStateChanged: false,
      next: "Show the exact compiled profile hash, draft hash, and any amendment diff to the human for confirmation. WebMCP cannot create that confirmation.",
    };
  }

  async stagePlanDraft(input: unknown, context: RuntimeRequestContext = {}): Promise<ToolResult> {
    return this.compileDraft(input, null, null, context);
  }

  async stagePlanAmendment({ profile: input, supersedesPlanId, expectedRevision }: { profile: unknown; supersedesPlanId: string; expectedRevision: number }, context: RuntimeRequestContext = {}): Promise<ToolResult> {
    if (supersedesPlanId !== this.kernel.profile.planId || expectedRevision !== this.kernel.revision) return { ok: false, code: "AMENDMENT_BASE_STALE", activePlanId: this.kernel.profile.planId, activeRevision: this.kernel.revision, acceptedStateChanged: false };
    const successor = [...this.plans.values()].find((entry) => entry.lineage?.supersedesPlanId === supersedesPlanId);
    if (successor) return { ok: false, code: "PLAN_VERSION_SUPERSEDED", planId: supersedesPlanId, supersededBy: successor.profile.planId, acceptedStateChanged: false };
    let profile: CompiledProfile;
    try { profile = await compileProfile(input); }
    catch (error) { return { ok: false, code: "PLAN_DRAFT_INVALID", issues: error instanceof ProfileValidationError ? error.issues : [error instanceof Error ? error.message : String(error)], acceptedStateChanged: false }; }
    if (this.plans.has(profile.planId)) return { ok: false, code: "PLAN_ID_ALREADY_EXISTS", planId: profile.planId, acceptedStateChanged: false };
    const amendment = await this.amendmentBinding(profile);
    if ("ok" in amendment) return amendment;
    return this.compileDraft(profileDefinition(profile), amendment, null, context);
  }

  humanConfirmPlanDraft({ draftId }: { draftId: string }): ToolResult {
    const draft = this.pendingPlanDraft;
    if (!draft || draft.draftId !== draftId) return { ok: false, code: "PLAN_DRAFT_NOT_FOUND", acceptedStateChanged: false };
    if (draft.basePlanId !== this.kernel.profile.planId || draft.baseRevision !== this.kernel.revision) return { ok: false, code: "PLAN_DRAFT_STALE", acceptedStateChanged: false };
    const confirmation: PlanActivationConfirmation = {
      confirmationId: makeId("plan_confirmation"),
      draftId,
      basePlanId: draft.basePlanId,
      baseRevision: draft.baseRevision,
      contentHash: draft.contentHash,
      source: "human_action",
    };
    this.planActivationConfirmation = confirmation;
    return { ok: true, code: "HUMAN_PLAN_ACTIVATION_CONFIRMED", confirmation: clone(confirmation), acceptedStateChanged: false, next: "Codex may now activate only this exact compiled draft." };
  }

  async humanRejectPlanDraft({ draftId, reasonCode = "other", reason }: { draftId: string; reasonCode?: ConstructionReturnReason; reason: string }): Promise<ToolResult> {
    const draft = this.pendingPlanDraft;
    if (!draft || draft.draftId !== draftId) return { ok: false, code: "PLAN_DRAFT_NOT_FOUND", acceptedStateChanged: false };
    const message = String(reason).trim().slice(0, 1_000);
    if (!message) return { ok: false, code: "CONSTRUCTION_RETURN_FEEDBACK_REQUIRED", draftId, acceptedStateChanged: false };
    const verified = await this.readVerifiedConstructionPacket();
    if ("ok" in verified && !this.constructionRepository && !this.catalogStore) {
      this.pendingPlanDraft = null;
      this.planActivationConfirmation = null;
      this.pendingConstructionDraftBinding = null;
      return { ok: true, code: "HUMAN_PLAN_DRAFT_RETURNED", draftId, reasonCode, reason: message, reviewPersisted: false, acceptedStateChanged: false, next: "Stage a revised complete draft from the current in-memory context." };
    }
    if ("ok" in verified || verified.kind !== "draft" || verified.payload.draftId !== draftId) return { ok: false, code: "CONSTRUCTION_DRAFT_NOT_RETURNABLE", draftId, acceptedStateChanged: false };
    try {
      const returnedAt = this.now().toISOString();
      const review = this.constructionRepository
        ? await this.constructionRepository.returnForRevision(verified.packetId, { reasonCode, message })
        : { status: "returned" as const, packet: clone(verified), packetId: verified.packetId, draftId, reasonCode, message, returnedAt, feedbackRequired: false, source: "human_action" as const };
      this.pendingPlanDraft = null;
      this.planActivationConfirmation = null;
      this.pendingConstructionDraftBinding = null;
      this.returnedConstructionReview = clone(review);
      this.lastConstructionReturnReview = clone(review);
      this.catalogStore?.clearConstructionPacket();
      return { ok: true, code: "HUMAN_PLAN_DRAFT_RETURNED", draftId, review: this.returnedConstructionSummary(review), acceptedStateChanged: false, next: "Codex can now read the exact returned draft and human feedback, then stage a visibly revised replacement." };
    } catch (error) { return { ok: false, code: error instanceof ConstructionPacketRepositoryError ? error.code : "CONSTRUCTION_RETURN_FAILED", draftId, message: error instanceof Error ? error.message : String(error), acceptedStateChanged: false }; }
  }

  async humanDescribeReturnedDraft({ packetId, reasonCode, message }: { packetId: string; reasonCode: ConstructionReturnReason; message: string }): Promise<ToolResult> {
    if (!this.returnedConstructionReview) await this.hydrateReturnedConstructionReview();
    const review = this.returnedConstructionReview;
    if (!review || review.packetId !== packetId) return { ok: false, code: "CONSTRUCTION_RETURN_NOT_FOUND", acceptedStateChanged: false };
    const detail = String(message).trim().slice(0, 1_000);
    if (!detail) return { ok: false, code: "CONSTRUCTION_RETURN_FEEDBACK_REQUIRED", acceptedStateChanged: false };
    if (!this.constructionRepository) return { ok: false, code: "CONSTRUCTION_RETURN_STORAGE_UNAVAILABLE", acceptedStateChanged: false };
    try {
      const returned = await this.constructionRepository.returnForRevision(packetId, { reasonCode, message: detail });
      this.returnedConstructionReview = clone(returned);
      this.lastConstructionReturnReview = clone(returned);
      return { ok: true, code: "HUMAN_PLAN_DRAFT_RETURNED", draftId: returned.draftId, review: this.returnedConstructionSummary(returned), acceptedStateChanged: false, next: "Codex can now read the exact returned draft and human feedback, then stage a visibly revised replacement." };
    } catch (error) { return { ok: false, code: error instanceof ConstructionPacketRepositoryError ? error.code : "CONSTRUCTION_RETURN_FAILED", message: error instanceof Error ? error.message : String(error), acceptedStateChanged: false }; }
  }

  async activateConfirmedPlanDraft({ draftId, confirmationId, expectedPlanId, expectedRevision, idempotencyKey }: {
    draftId: string;
    confirmationId: string;
    expectedPlanId: string;
    expectedRevision: number;
    idempotencyKey: string;
  }, context: RuntimeRequestContext = {}): Promise<ToolResult> {
    const replay = this.activationReceipts.get(idempotencyKey);
    if (replay) {
      const { receiptId: _receiptId, replayChecksum, ...receiptBase } = replay;
      if (await sha256(receiptBase) !== replayChecksum) return { ok: false, code: "ACTIVATION_RECEIPT_INTEGRITY_FAILED", acceptedStateChanged: false };
      return replay.draftId === draftId && replay.confirmationId === confirmationId
        ? { ok: true, code: "IDEMPOTENT_PLAN_ACTIVATION_REPLAY", receipt: clone(replay), acceptedStateChanged: false }
        : { ok: false, code: "IDEMPOTENCY_KEY_REUSED", acceptedStateChanged: false };
    }
    const draft = this.pendingPlanDraft;
    if (!draft || draft.draftId !== draftId) return { ok: false, code: "PLAN_DRAFT_NOT_FOUND", acceptedStateChanged: false };
    if (expectedPlanId !== this.kernel.profile.planId || expectedRevision !== this.kernel.revision || draft.basePlanId !== expectedPlanId || draft.baseRevision !== expectedRevision) return { ok: false, code: "PLAN_DRAFT_STALE", acceptedStateChanged: false };
    const confirmation = this.planActivationConfirmation;
    if (!confirmation || confirmation.confirmationId !== confirmationId || confirmation.draftId !== draftId || confirmation.contentHash !== draft.contentHash || confirmation.source !== "human_action") return { ok: false, code: "PLAN_ACTIVATION_CONFIRMATION_MISSING_OR_MISMATCHED", acceptedStateChanged: false };
    if (this.plans.has(draft.profile.planId)) return { ok: false, code: "PLAN_ID_ALREADY_EXISTS", acceptedStateChanged: false };
    if (!this.catalogStore) return { ok: false, code: "PLAN_ACTIVATION_STORAGE_UNAVAILABLE", acceptedStateChanged: false, next: "Activation requires durable catalog and receipt storage; accepted truth remains on the prior plan." };
    for (const evidence of draft.evidenceRecords) if (!await evidenceIntegrity(evidence)) return { ok: false, code: "PLAN_EVIDENCE_INTEGRITY_FAILED", evidenceId: evidence.evidenceId, acceptedStateChanged: false };

    const fromPlanId = this.kernel.profile.planId;
    const priorKernel = this.kernel;
    const newKernel = new FinitePlanKernel(draft.profile, this.store, draft.evidenceRecords, this.acceptedRepository);
    const receiptBase = {
      idempotencyKey,
      fromPlanId,
      toPlanId: draft.profile.planId,
      profileId: draft.profile.profileId,
      profileHash: draft.profile.profileHash,
      draftId,
      confirmationId,
      contentHash: draft.contentHash,
      baseRevision: expectedRevision,
      activationKind: draft.amendment ? "amendment" as const : "new_plan" as const,
      sourceArrival: clone(draft.sourceArrival),
      ...(draft.amendment ? { supersedesPlanId: draft.amendment.supersedesPlanId, supersedesProfileHash: draft.amendment.supersedesProfileHash, diffHash: draft.amendment.diffHash } : {}),
    };
    const replayChecksum = await sha256(receiptBase);
    const receipt: PlanActivationReceipt = { receiptId: `plan_activation_${replayChecksum.slice(0, 16)}`, ...receiptBase, replayChecksum };
    const lineage: NonNullable<PlanCatalogEntry["lineage"]> = {
      activationKind: receipt.activationKind!,
      supersedesPlanId: draft.amendment?.supersedesPlanId ?? null,
      supersedesProfileHash: draft.amendment?.supersedesProfileHash ?? null,
      diffHash: draft.amendment?.diffHash ?? null,
      activationReceiptId: receipt.receiptId,
    };
    const constructionBinding = this.pendingConstructionDraftBinding;
    const activationGate = draft.sourceArrival
      && constructionBinding?.draftId === draftId
      && this.acceptedRepository?.initializePlanActivation
      && this.acceptedRepository.createPlanActivationChallenge
      && this.constructionRepository
      ? {
        gateVersion: "finite-plan-activation-gate.v1" as const,
        source: "human_action" as const,
        constructionPacketId: constructionBinding.packetId,
        baseProfileHash: priorKernel.profile.profileHash,
        sourceArrival: clone(draft.sourceArrival),
      }
      : null;
    let authorityChallengeId: string | null = null;
    let activationChallengeTiming: ActivationTiming | undefined;
    if (activationGate && this.acceptedRepository?.createPlanActivationChallenge) {
      try {
        const challenge = await this.acceptedRepository.createPlanActivationChallenge({ planId: fromPlanId, profileHash: priorKernel.profile.profileHash, revision: expectedRevision, targetId: draftId, contentHash: draft.contentHash, authorityId: confirmationId, gate: activationGate }, context);
        authorityChallengeId = challenge.challengeId;
        activationChallengeTiming = challenge.activationTiming;
      } catch (error) {
        return { ok: false, code: error instanceof AcceptedTruthRepositoryError ? error.code : "PLAN_ACTIVATION_AUTHORITY_FAILED", message: error instanceof Error ? error.message : String(error), acceptedStateChanged: false };
      }
    } else if (this.acceptedRepository?.createAuthorityChallenge) {
      try {
        const challenge = await this.acceptedRepository.createAuthorityChallenge({ targetType: "plan_activation", planId: fromPlanId, profileHash: priorKernel.profile.profileHash, revision: expectedRevision, targetId: draftId, contentHash: draft.contentHash, authorityId: confirmationId }, context);
        authorityChallengeId = challenge.challengeId;
      } catch (error) {
        return { ok: false, code: error instanceof AcceptedTruthRepositoryError ? error.code : "PLAN_ACTIVATION_AUTHORITY_FAILED", message: error instanceof Error ? error.message : String(error), acceptedStateChanged: false };
      }
    }
    const catalogEntry: PlanCatalogEntry = { definition: profileDefinition(draft.profile), evidenceRecords: clone(draft.evidenceRecords), lineage };
    const remoteInitialization = await newKernel.hydrateAcceptedTruth(receipt, catalogEntry, authorityChallengeId, context, activationGate ?? undefined);
    if (!remoteInitialization.ok) return {
      ok: false,
      code: "PLAN_ACTIVATION_DURABLE_TRUTH_FAILED",
      repositoryCode: remoteInitialization.code,
      message: remoteInitialization.message,
      acceptedStateChanged: false,
      activePlanId: priorKernel.profile.planId,
      next: "The prior plan remains active. Restore accepted-truth storage and retry the exact human-confirmed activation with the same idempotency key.",
    };
    let browserPersistence: { ok: true } | { ok: false; code: "PLAN_ACTIVATION_BROWSER_CACHE_FAILED"; message: string } = { ok: true };
    try {
      try { priorKernel.persist(); } catch { /* accepted repository remains authoritative */ }
      newKernel.persist();
      this.catalogStore.save(profileDefinition(draft.profile), draft.evidenceRecords, lineage);
      this.catalogStore.saveActivationReceipt(receipt);
    } catch (error) {
      try { this.store.clear(draft.profile.planId); } catch { /* best-effort rollback */ }
      try { this.catalogStore.remove(draft.profile.planId); } catch { /* best-effort rollback */ }
      try { this.catalogStore.removeActivationReceipt(idempotencyKey); } catch { /* best-effort rollback */ }
      if (!this.acceptedRepository) return { ok: false, code: "PLAN_ACTIVATION_STORAGE_FAILED", message: error instanceof Error ? error.message : String(error), acceptedStateChanged: false, activePlanId: priorKernel.profile.planId, next: "Local accepted truth remains on the prior plan. Repair storage and retry the exact activation." };
      browserPersistence = { ok: false, code: "PLAN_ACTIVATION_BROWSER_CACHE_FAILED", message: error instanceof Error ? error.message : String(error) };
    }
    const entry: CompiledCatalogEntry = { profile: draft.profile, evidenceRecords: clone(draft.evidenceRecords), lineage };
    this.plans.set(draft.profile.planId, entry);
    this.kernel = newKernel;
    this.activationReceipts.set(idempotencyKey, receipt);
    this.pendingPlanDraft = null;
    this.planActivationConfirmation = null;
    let constructionPacketCleared = true;
    if (activationGate) {
      try { this.catalogStore.clearConstructionPacket(); } catch { /* atomic remote activation remains authoritative */ }
      this.pendingConstructionDraftBinding = null;
    } else {
      try { constructionPacketCleared = await this.clearMatchingConstructionDraft(draftId, context); } catch { constructionPacketCleared = false; }
    }
    const activationInitializeTiming = remoteInitialization.activationTiming as ActivationTiming | undefined;
    return {
      ok: true,
      code: draft.amendment ? "PLAN_AMENDMENT_ACTIVATED" : "PLAN_ACTIVATED",
      receipt: clone(receipt),
      plan: this.listPlans(),
      constructionPacketCleared,
      acceptedStateChanged: true,
      browserPersistence,
      ...((activationChallengeTiming || activationInitializeTiming) ? {
        activationTiming: {
          measurementVersion: "finite-plan-activation-sequence-timing.v1",
          challenge: activationChallengeTiming ?? null,
          initialize: activationInitializeTiming ?? null,
        },
      } : {}),
      next: browserPersistence.ok
        ? constructionPacketCleared ? "Rediscover contextual tools and operate the newly active immutable plan version." : "The plan is active. Explicitly discard the now-stale construction packet before starting another."
        : "The plan is accepted remotely and active in this session. Browser cache persistence is degraded; rehydrate from accepted truth on reload.",
    };
  }

  switchPlan(planId: string): ToolResult {
    const entry = this.plans.get(planId);
    if (!entry) return { ok: false, code: "PLAN_NOT_FOUND", planId, acceptedStateChanged: false };
    if (planId === this.kernel.profile.planId) return { ok: true, code: "PLAN_ALREADY_ACTIVE", planId, acceptedStateChanged: false };
    const invalidatedCandidateId = this.kernel.stagedCandidate?.candidateId ?? null;
    this.kernel.persist();
    this.kernel = new FinitePlanKernel(entry.profile, this.store, entry.evidenceRecords, this.acceptedRepository);
    return {
      ok: true,
      code: "PLAN_SWITCHED",
      profileId: entry.profile.profileId,
      planId,
      profileHash: entry.profile.profileHash,
      revision: this.kernel.revision,
      contextualCapabilities: [...entry.profile.contextualCapabilities],
      invalidatedCandidateId,
      acceptedStateChanged: false,
      next: "Rediscover tools and read identity, constraints, and pending selectors.",
    };
  }

  async switchPlanPersisted(planId: string, guard?: { expectedCurrentPlanId: string; expectedCurrentRevision: number }): Promise<ToolResult> {
    if (guard && (guard.expectedCurrentPlanId !== this.kernel.profile.planId || guard.expectedCurrentRevision !== this.kernel.revision)) return { ok: false, code: "PLAN_SWITCH_GUARD_MISMATCH", expected: guard, current: { planId: this.kernel.profile.planId, revision: this.kernel.revision }, acceptedStateChanged: false, next: "Re-enter the kitchen and choose the target plan from the current catalog." };
    const entry = this.plans.get(planId);
    if (!entry) return { ok: false, code: "PLAN_NOT_FOUND", planId, acceptedStateChanged: false };
    if (planId === this.kernel.profile.planId) return { ok: true, code: "PLAN_ALREADY_ACTIVE", planId, acceptedStateChanged: false };
    const invalidatedCandidateId = this.kernel.stagedCandidate?.candidateId ?? null;
    const from = { planId: this.kernel.profile.planId, profileHash: this.kernel.profile.profileHash, revision: this.kernel.revision };
    const nextKernel = new FinitePlanKernel(entry.profile, this.store, entry.evidenceRecords, this.acceptedRepository);
    const hydrated = await nextKernel.hydrateAcceptedTruth();
    if (!hydrated.ok) return { ok: false, code: "PLAN_SWITCH_DURABLE_TRUTH_UNAVAILABLE", repositoryCode: hydrated.code, planId, acceptedStateChanged: false, next: "Keep the current plan active until the target plan's accepted truth can be verified." };
    try { this.kernel.persist(); } catch { /* accepted repository remains authoritative */ }
    this.kernel = nextKernel;
    const to = { planId, profileHash: entry.profile.profileHash, revision: this.kernel.revision };
    const contextReceiptBase = { receiptVersion: "finite-context-switch.v1", from, to, invalidatedCandidateId };
    return {
      ok: true,
      code: "PLAN_SWITCHED",
      profileId: entry.profile.profileId,
      planId,
      profileHash: entry.profile.profileHash,
      revision: this.kernel.revision,
      contextualCapabilities: [...entry.profile.contextualCapabilities],
      invalidatedCandidateId,
      contextReceipt: { ...contextReceiptBase, receiptHash: await sha256(contextReceiptBase) },
      acceptedStateChanged: false,
      next: "Rediscover tools and read identity, constraints, and pending selectors.",
    };
  }

  async switchProfilePersisted(profileId: ProfileId, guard?: { expectedCurrentPlanId: string; expectedCurrentRevision: number }): Promise<ToolResult> {
    const profile = this.profiles.get(profileId);
    if (!profile) return { ok: false, code: "PROFILE_NOT_FOUND", acceptedStateChanged: false };
    const result = await this.switchPlanPersisted(profile.planId, guard);
    if (result.code === "PLAN_SWITCHED") return { ...result, code: "PROFILE_SWITCHED" };
    if (result.code === "PLAN_ALREADY_ACTIVE") return { ...result, code: "PROFILE_ALREADY_ACTIVE", profileId };
    return result;
  }

  switchProfile(profileId: ProfileId): ToolResult {
    const profile = this.profiles.get(profileId);
    if (!profile) return { ok: false, code: "PROFILE_NOT_FOUND", acceptedStateChanged: false };
    const result = this.switchPlan(profile.planId);
    if (result.code === "PLAN_SWITCHED") return { ...result, code: "PROFILE_SWITCHED" };
    if (result.code === "PLAN_ALREADY_ACTIVE") return { ...result, code: "PROFILE_ALREADY_ACTIVE", profileId };
    return result;
  }

  clearCurrentProfile(): void {
    this.catalogStore?.clearConstructionPacket();
    this.pendingPlanDraft = null;
    this.planActivationConfirmation = null;
    this.pendingConstructionDraftBinding = null;
    this.store.clear(this.kernel.profile.planId);
    const entry = this.plans.get(this.kernel.profile.planId)!;
    this.kernel = new FinitePlanKernel(entry.profile, this.store, entry.evidenceRecords, this.acceptedRepository);
  }
}

export const compileCatalogEntries = async (entries: PlanCatalogEntry[], activationReceipts: PlanActivationReceipt[] = []): Promise<CompiledCatalogEntry[]> => {
  const compiled: CompiledCatalogEntry[] = [];
  for (const entry of entries) {
    try {
      const profile = await compileProfile(entry.definition);
      const evidenceIds = new Set(entry.evidenceRecords.map((evidence) => evidence.evidenceId));
      if (profile.actuals.some((actual) => !evidenceIds.has(actual.evidenceRef))) continue;
      if (!(await Promise.all(entry.evidenceRecords.map(evidenceIntegrity))).every(Boolean)) continue;
      const lineage = entry.lineage;
      if (lineage && (!(lineage.activationKind === "new_plan" || lineage.activationKind === "amendment") || typeof lineage.activationReceiptId !== "string")) continue;
      if (lineage?.activationKind === "amendment" && (!lineage.supersedesPlanId || !lineage.supersedesProfileHash || !lineage.diffHash)) continue;
      if (lineage) {
        const receipt = activationReceipts.find((candidate) => candidate.receiptId === lineage.activationReceiptId);
        if (!receipt) continue;
        const { receiptId, replayChecksum, ...receiptBase } = receipt;
        if (await sha256(receiptBase) !== replayChecksum || receiptId !== `plan_activation_${replayChecksum.slice(0, 16)}`) continue;
        if (receipt.toPlanId !== profile.planId || receipt.profileHash !== profile.profileHash || receipt.activationKind !== lineage.activationKind) continue;
        if ((receipt.supersedesPlanId ?? null) !== lineage.supersedesPlanId || (receipt.supersedesProfileHash ?? null) !== lineage.supersedesProfileHash || (receipt.diffHash ?? null) !== lineage.diffHash) continue;
      }
      compiled.push({ profile, evidenceRecords: clone(entry.evidenceRecords), ...(lineage ? { lineage: clone(lineage) } : {}) });
    } catch {
      // Corrupt or obsolete local catalog entries are quarantined by omission.
    }
  }
  return compiled;
};
