import { clone, makeId, sha256 } from "./crypto.js";
import { FinitePlanKernel } from "./kernel.js";
import { PlanCatalogStore, PlanSnapshotStore } from "./persistence.js";
import { compileProfile, ProfileValidationError } from "./profiles.js";
import type {
  CompiledProfile,
  EvidenceRecord,
  PlanActivationConfirmation,
  PlanActivationReceipt,
  PlanCatalogEntry,
  PlanDraft,
  ProfileDefinition,
  ProfileId,
  ToolResult,
} from "./types.js";

export interface CompiledCatalogEntry {
  profile: CompiledProfile;
  evidenceRecords: EvidenceRecord[];
}

const profileDefinition = (profile: CompiledProfile): ProfileDefinition => {
  const { profileHash: _profileHash, ...definition } = profile;
  return clone(definition) as ProfileDefinition;
};

const evidenceIntegrity = async (evidence: EvidenceRecord): Promise<boolean> => {
  const { evidenceId: _evidenceId, recordHash, ...base } = evidence;
  return await sha256({ content: evidence.content }) === evidence.contentHash && await sha256(base) === recordHash;
};

export class FinitePlanRuntime {
  kernel: FinitePlanKernel;
  pendingPlanDraft: PlanDraft | null = null;
  planActivationConfirmation: PlanActivationConfirmation | null = null;
  private readonly plans = new Map<string, CompiledCatalogEntry>();
  private readonly activationReceipts = new Map<string, PlanActivationReceipt>();

  constructor(
    private readonly profiles: Map<ProfileId, CompiledProfile>,
    private readonly store: PlanSnapshotStore,
    initialPlanOrProfile: ProfileId | string = "travel",
    private readonly catalogStore?: PlanCatalogStore,
    catalogEntries: CompiledCatalogEntry[] = [],
  ) {
    for (const profile of profiles.values()) this.plans.set(profile.planId, { profile, evidenceRecords: [] });
    for (const entry of catalogEntries) this.plans.set(entry.profile.planId, { profile: entry.profile, evidenceRecords: clone(entry.evidenceRecords) });
    for (const receipt of catalogStore?.loadActivationReceipts() ?? []) this.activationReceipts.set(receipt.idempotencyKey, clone(receipt));
    const builtIn = profiles.get(initialPlanOrProfile as ProfileId);
    const entry = this.plans.get(initialPlanOrProfile) ?? (builtIn ? this.plans.get(builtIn.planId) : undefined);
    if (!entry) throw new Error(`Missing compiled plan or profile: ${initialPlanOrProfile}`);
    this.kernel = new FinitePlanKernel(entry.profile, store, entry.evidenceRecords);
  }

  listPlans(): ToolResult {
    return {
      ok: true,
      code: "PLAN_CATALOG",
      activePlanId: this.kernel.profile.planId,
      plans: [...this.plans.values()].map(({ profile }) => ({
        planId: profile.planId,
        profileId: profile.profileId,
        name: profile.name,
        profileHash: profile.profileHash,
        active: profile.planId === this.kernel.profile.planId,
      })),
      pendingDraft: this.pendingPlanDraft ? {
        draftId: this.pendingPlanDraft.draftId,
        planId: this.pendingPlanDraft.profile.planId,
        profileHash: this.pendingPlanDraft.profile.profileHash,
        contentHash: this.pendingPlanDraft.contentHash,
        humanConfirmed: this.planActivationConfirmation?.draftId === this.pendingPlanDraft.draftId,
        confirmationId: this.planActivationConfirmation?.draftId === this.pendingPlanDraft.draftId ? this.planActivationConfirmation.confirmationId : null,
      } : null,
      acceptedStateChanged: false,
    };
  }

  async stagePlanDraft(input: unknown): Promise<ToolResult> {
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
    };
    const contentHash = await sha256(bound);
    const draft: PlanDraft = {
      draftId: `plan_draft_${contentHash.slice(0, 16)}`,
      basePlanId: bound.basePlanId,
      baseRevision: bound.baseRevision,
      profile,
      evidenceRecords,
      contentHash,
    };
    this.pendingPlanDraft = draft;
    this.planActivationConfirmation = null;
    return {
      ok: true,
      code: "PLAN_DRAFT_STAGED",
      draft: {
        draftId: draft.draftId,
        basePlanId: draft.basePlanId,
        baseRevision: draft.baseRevision,
        profile: clone(draft.profile),
        evidenceBindings: draft.evidenceRecords.map(({ evidenceId, contentHash, recordHash }) => ({ evidenceId, contentHash, recordHash })),
        contentHash: draft.contentHash,
      },
      acceptedStateChanged: false,
      next: "Show the exact compiled profile hash and content hash to the human for confirmation. WebMCP cannot create that confirmation.",
    };
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

  async activateConfirmedPlanDraft({ draftId, confirmationId, expectedPlanId, expectedRevision, idempotencyKey }: {
    draftId: string;
    confirmationId: string;
    expectedPlanId: string;
    expectedRevision: number;
    idempotencyKey: string;
  }): Promise<ToolResult> {
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
    for (const evidence of draft.evidenceRecords) if (!await evidenceIntegrity(evidence)) return { ok: false, code: "PLAN_EVIDENCE_INTEGRITY_FAILED", evidenceId: evidence.evidenceId, acceptedStateChanged: false };

    const fromPlanId = this.kernel.profile.planId;
    this.kernel.persist();
    const entry = { profile: draft.profile, evidenceRecords: clone(draft.evidenceRecords) };
    this.plans.set(draft.profile.planId, entry);
    this.catalogStore?.save(profileDefinition(draft.profile), draft.evidenceRecords);
    this.kernel = new FinitePlanKernel(draft.profile, this.store, draft.evidenceRecords);
    this.kernel.persist();
    const receiptBase = {
      idempotencyKey,
      fromPlanId,
      toPlanId: draft.profile.planId,
      profileId: draft.profile.profileId,
      profileHash: draft.profile.profileHash,
      draftId,
      confirmationId,
    };
    const replayChecksum = await sha256(receiptBase);
    const receipt: PlanActivationReceipt = { receiptId: `plan_activation_${replayChecksum.slice(0, 16)}`, ...receiptBase, replayChecksum };
    this.activationReceipts.set(idempotencyKey, receipt);
    this.catalogStore?.saveActivationReceipt(receipt);
    this.pendingPlanDraft = null;
    this.planActivationConfirmation = null;
    return { ok: true, code: "PLAN_ACTIVATED", receipt: clone(receipt), plan: this.listPlans(), acceptedStateChanged: true, next: "Rediscover contextual tools and operate the newly active plan." };
  }

  switchPlan(planId: string): ToolResult {
    const entry = this.plans.get(planId);
    if (!entry) return { ok: false, code: "PLAN_NOT_FOUND", planId, acceptedStateChanged: false };
    if (planId === this.kernel.profile.planId) return { ok: true, code: "PLAN_ALREADY_ACTIVE", planId, acceptedStateChanged: false };
    const invalidatedCandidateId = this.kernel.stagedCandidate?.candidateId ?? null;
    this.kernel.persist();
    this.kernel = new FinitePlanKernel(entry.profile, this.store, entry.evidenceRecords);
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

  switchProfile(profileId: ProfileId): ToolResult {
    const profile = this.profiles.get(profileId);
    if (!profile) return { ok: false, code: "PROFILE_NOT_FOUND", acceptedStateChanged: false };
    const result = this.switchPlan(profile.planId);
    if (result.code === "PLAN_SWITCHED") return { ...result, code: "PROFILE_SWITCHED" };
    if (result.code === "PLAN_ALREADY_ACTIVE") return { ...result, code: "PROFILE_ALREADY_ACTIVE", profileId };
    return result;
  }

  clearCurrentProfile(): void {
    this.store.clear(this.kernel.profile.planId);
    const entry = this.plans.get(this.kernel.profile.planId)!;
    this.kernel = new FinitePlanKernel(entry.profile, this.store, entry.evidenceRecords);
  }
}

export const compileCatalogEntries = async (entries: PlanCatalogEntry[]): Promise<CompiledCatalogEntry[]> => {
  const compiled: CompiledCatalogEntry[] = [];
  for (const entry of entries) {
    try {
      const profile = await compileProfile(entry.definition);
      const evidenceIds = new Set(entry.evidenceRecords.map((evidence) => evidence.evidenceId));
      if (profile.actuals.some((actual) => !evidenceIds.has(actual.evidenceRef))) continue;
      if (!(await Promise.all(entry.evidenceRecords.map(evidenceIntegrity))).every(Boolean)) continue;
      compiled.push({ profile, evidenceRecords: clone(entry.evidenceRecords) });
    } catch {
      // Corrupt or obsolete local catalog entries are quarantined by omission.
    }
  }
  return compiled;
};
