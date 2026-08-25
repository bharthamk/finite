import { FinitePlanKernel } from "./kernel.js";
import { PlanSnapshotStore } from "./persistence.js";
import type { CompiledProfile, ProfileId, ToolResult } from "./types.js";

export class FinitePlanRuntime {
  kernel: FinitePlanKernel;

  constructor(
    private readonly profiles: Map<ProfileId, CompiledProfile>,
    private readonly store: PlanSnapshotStore,
    initialProfile: ProfileId = "travel",
  ) {
    const profile = profiles.get(initialProfile);
    if (!profile) throw new Error(`Missing compiled profile: ${initialProfile}`);
    this.kernel = new FinitePlanKernel(profile, store);
  }

  switchProfile(profileId: ProfileId): ToolResult {
    const profile = this.profiles.get(profileId);
    if (!profile) return { ok: false, code: "PROFILE_NOT_FOUND", acceptedStateChanged: false };
    const invalidatedCandidateId = this.kernel.stagedCandidate?.candidateId ?? null;
    this.kernel.persist();
    this.kernel = new FinitePlanKernel(profile, this.store);
    return {
      ok: true,
      code: "PROFILE_SWITCHED",
      profileId,
      planId: profile.planId,
      profileHash: profile.profileHash,
      revision: this.kernel.revision,
      contextualCapabilities: [...profile.contextualCapabilities],
      invalidatedCandidateId,
      acceptedStateChanged: false,
      next: "Rediscover tools and read identity, constraints, and pending selectors.",
    };
  }

  clearCurrentProfile(): void {
    this.store.clear(this.kernel.profile.profileId);
    const profile = this.kernel.profile;
    this.kernel = new FinitePlanKernel(profile, this.store);
  }
}
