import test from "node:test";
import assert from "node:assert/strict";
import { MemoryStorage, PlanCatalogStore, PlanSnapshotStore } from "../dist-test/src/persistence.js";
import { compileBuiltInProfiles, getProfileDefinition } from "../dist-test/src/profiles.js";
import { FinitePlanRuntime } from "../dist-test/src/runtime.js";
import { FinitePlanWebMCPAdapter, humanOnlyActions } from "../dist-test/src/webmcp.js";
import { MemoryConstructionPacketRepository } from "../dist-test/src/construction-packet.js";
import { sha256 } from "../dist-test/src/crypto.js";
import { constructionPacketIntegrityIssues } from "../dist-test/worker/construction-packet.js";
import { AcceptedTruthRepositoryError, MemoryAcceptedTruthRepository } from "../dist-test/src/accepted-truth.js";

class MemoryModelContext {
  tools = new Map();
  registerTool(tool, options = {}) {
    this.tools.set(tool.name, tool);
    options.signal?.addEventListener("abort", () => this.tools.delete(tool.name), { once: true });
  }
  async execute(name, input) {
    return this.tools.get(name)?.execute(input) ?? { ok: false, code: "TOOL_NOT_FOUND" };
  }
}

class FailingStorage extends MemoryStorage {
  failConstruction = false;
  setItem(key, value) {
    if (this.failConstruction && key === "finite-plan.construction.v1") throw new Error("Injected construction storage failure");
    super.setItem(key, value);
  }
}

class CountingConstructionPacketRepository extends MemoryConstructionPacketRepository {
  loads = 0;
  async load() {
    this.loads += 1;
    return super.load();
  }
}

const newTravel = (planId = "plan_travel_resumable") => {
  const profile = getProfileDefinition("travel");
  profile.planId = planId;
  profile.name = "Resumable journey plan";
  return profile;
};

const setup = async (storage = new MemoryStorage(), clock = { value: "2026-08-26T01:00:00.000Z" }) => {
  const profiles = await compileBuiltInProfiles();
  const snapshotStore = new PlanSnapshotStore(storage);
  const catalogStore = new PlanCatalogStore(storage);
  const runtime = new FinitePlanRuntime(profiles, snapshotStore, "travel", catalogStore, [], () => new Date(clock.value));
  return { profiles, snapshotStore, catalogStore, runtime, storage, clock };
};

test("partial intake survives reload as checksum-bound work and discards by exact packet id", async () => {
  const { profiles, snapshotStore, catalogStore, runtime, clock } = await setup();
  const acceptedBefore = structuredClone(runtime.kernel.accepted);
  const assessed = await runtime.assessPlanIntake({ profileId: "event", name: "Summit" });
  assert.equal(assessed.code, "INTAKE_FACTS_MISSING");
  assert.equal(assessed.constructionPacket.kind, "intake");
  assert.equal(assessed.constructionPacket.status, "resumable");
  assert.equal(assessed.constructionPacket.humanAuthorityPersisted, false);
  assert.match(assessed.constructionPacket.checksum, /^[a-f0-9]{64}$/);
  assert.equal(runtime.kernel.revision, 1);
  assert.deepEqual(runtime.kernel.accepted, acceptedBefore);

  clock.value = "2026-08-26T02:00:00.000Z";
  const restored = new FinitePlanRuntime(profiles, snapshotStore, "travel", catalogStore, [], () => new Date(clock.value));
  assert.equal(restored.latestIntakeAssessment, null);
  const inspection = await restored.getConstructionPacket();
  assert.equal(inspection.code, "CONSTRUCTION_PACKET");
  assert.equal(inspection.packet.status, "resumable");
  const resumed = await restored.resumeConstructionPacket();
  assert.equal(resumed.code, "CONSTRUCTION_INTAKE_RESUMED");
  assert.equal(resumed.assessment.code, "INTAKE_FACTS_MISSING");
  assert.equal(restored.planActivationConfirmation, null);
  assert.deepEqual(restored.kernel.accepted, acceptedBefore);

  assert.equal((await restored.discardConstructionPacket({ packetId: inspection.packet.packetId })).code, "CONSTRUCTION_PACKET_DISCARDED");
  assert.equal(catalogStore.loadConstructionPacket(), null);
  assert.equal((await restored.resumeConstructionPacket()).code, "CONSTRUCTION_PACKET_NOT_FOUND");
});

test("accepted activation retires the remote build packet so the next project can start", async () => {
  const profiles = await compileBuiltInProfiles();
  const storage = new MemoryStorage();
  const snapshotStore = new PlanSnapshotStore(storage);
  const catalogStore = new PlanCatalogStore(storage);
  const clock = { value: "2026-08-26T01:00:00.000Z" };
  const construction = new MemoryConstructionPacketRepository(() => new Date(clock.value));
  const runtime = new FinitePlanRuntime(profiles, snapshotStore, "travel", catalogStore, [], () => new Date(clock.value), undefined, construction);
  const staged = await runtime.stagePlanDraft(newTravel("plan_travel_remote_cleanup"));
  const confirmed = runtime.humanConfirmPlanDraft({ draftId: staged.draft.draftId });
  const activated = await runtime.activateConfirmedPlanDraft({
    draftId: staged.draft.draftId,
    confirmationId: confirmed.confirmation.confirmationId,
    expectedPlanId: "plan_travel_europe",
    expectedRevision: 1,
    idempotencyKey: "remote-cleanup-activation-0001",
  });
  assert.equal(activated.code, "PLAN_ACTIVATED");
  assert.equal(activated.constructionPacketCleared, true);

  clock.value = "2026-08-26T01:00:01.000Z";
  const next = await runtime.assessPlanIntake({ profileId: "event", name: "Next project" });
  assert.equal(next.code, "INTAKE_FACTS_MISSING");
  assert(next.constructionPacket.packetId);
  assert.equal(next.durability, undefined);
});

test("accepted activation retires its identity-bound remote draft without re-reading it", async () => {
  const profiles = await compileBuiltInProfiles();
  const storage = new MemoryStorage();
  const construction = new CountingConstructionPacketRepository(() => new Date("2026-08-26T01:00:00.000Z"));
  const runtime = new FinitePlanRuntime(
    profiles,
    new PlanSnapshotStore(storage),
    "travel",
    new PlanCatalogStore(storage),
    [],
    () => new Date("2026-08-26T01:00:00.000Z"),
    undefined,
    construction,
  );
  const staged = await runtime.stagePlanDraft(newTravel("plan_travel_direct_cleanup"));
  const confirmed = runtime.humanConfirmPlanDraft({ draftId: staged.draft.draftId });
  const loadsBeforeActivation = construction.loads;

  const activated = await runtime.activateConfirmedPlanDraft({
    draftId: staged.draft.draftId,
    confirmationId: confirmed.confirmation.confirmationId,
    expectedPlanId: "plan_travel_europe",
    expectedRevision: 1,
    idempotencyKey: "direct-cleanup-activation-0001",
  });

  assert.equal(activated.code, "PLAN_ACTIVATED");
  assert.equal(activated.constructionPacketCleared, true);
  assert.equal(construction.loads, loadsBeforeActivation);
});

test("hosted arrival activation uses one guarded challenge and one accepted-truth initialization", async () => {
  const profiles = await compileBuiltInProfiles();
  const storage = new MemoryStorage();
  const construction = new CountingConstructionPacketRepository(() => new Date("2026-08-26T01:00:00.000Z"));
  const durable = new MemoryAcceptedTruthRepository(() => new Date("2026-08-26T01:00:00.000Z"));
  const calls = { guardedChallenge: 0, atomicInitialize: 0, genericChallenge: 0 };
  const accepted = {
    initialize: (...args) => durable.initialize(...args),
    load: (...args) => durable.load(...args),
    commit: (...args) => durable.commit(...args),
    createAuthorityChallenge: (...args) => { calls.genericChallenge += 1; return durable.createAuthorityChallenge(...args); },
    async createPlanActivationChallenge(input) {
      calls.guardedChallenge += 1;
      const challenge = await durable.createAuthorityChallenge({ targetType: "plan_activation", planId: input.planId, profileHash: input.profileHash, revision: input.revision, targetId: input.targetId, contentHash: input.contentHash, authorityId: input.authorityId });
      return { ...challenge, activationTiming: { measurementVersion: "finite-plan-activation-timing.v1", operation: "challenge", workerMs: 8.1, d1AwaitMs: 6.4, runtimeMs: 1.7, d1Calls: 3, clientRoundTripMs: 22.5, transportEstimateMs: 14.4 } };
    },
    async initializePlanActivation(snapshot, receipt, catalogEntry, challengeId, gate) {
      calls.atomicInitialize += 1;
      const result = await durable.initialize(snapshot, receipt, catalogEntry, challengeId);
      await construction.clear(gate.constructionPacketId);
      return { ...result, activationTiming: { measurementVersion: "finite-plan-activation-timing.v1", operation: "initialize", workerMs: 15.2, d1AwaitMs: 12.8, runtimeMs: 2.4, d1Calls: 4, clientRoundTripMs: 31.9, transportEstimateMs: 16.7 } };
    },
  };
  const runtime = new FinitePlanRuntime(profiles, new PlanSnapshotStore(storage), "travel", new PlanCatalogStore(storage), [], () => new Date("2026-08-26T01:00:00.000Z"), accepted, construction);
  assert.equal((await runtime.hydrateAcceptedTruth()).code, "ACCEPTED_TRUTH_INITIALIZED");
  const sourceArrival = { orderId: "arrival_atomic_activation", orderVersion: 4, orderChecksum: "a".repeat(64) };
  const assessed = await runtime.assessPlanIntake({
    sourceArrival,
    constructionMode: "adaptive_shell",
    profileId: "travel",
    planId: "plan_atomic_activation",
    name: "Atomic activation trip",
    brief: "A current arrival-bound plan.",
    allocation: { totalBudgetMinor: 1_000_000 },
    actuals: [],
    locks: ["total_budget"],
    preferenceLabels: ["preserve_flexibility"],
    entityEstimates: {
      trip_days: { days: { value: 30, basis: "One-month working estimate.", sourcePaths: ["reviewed_interpretation"] } },
      booked_segment_days: { days: { value: 0, basis: "No confirmed bookings.", sourcePaths: ["reviewed_interpretation"] } },
    },
    stages: [{ stageId: "journey", label: "Journey", status: "planned" }],
  });
  const staged = await runtime.compileIntakeToDraft({ packetId: assessed.constructionPacket.packetId, expectedChecksum: assessed.constructionPacket.checksum });
  const confirmed = runtime.humanConfirmPlanDraft({ draftId: staged.draft.draftId });
  const loadsBeforeActivation = construction.loads;
  const activated = await runtime.activateConfirmedPlanDraft({ draftId: staged.draft.draftId, confirmationId: confirmed.confirmation.confirmationId, expectedPlanId: "plan_travel_europe", expectedRevision: 1, idempotencyKey: "atomic-activation-0001" });

  assert.equal(activated.code, "PLAN_ACTIVATED");
  assert.equal(activated.constructionPacketCleared, true);
  assert.deepEqual(calls, { guardedChallenge: 1, atomicInitialize: 1, genericChallenge: 0 });
  assert.deepEqual(activated.activationTiming, {
    measurementVersion: "finite-plan-activation-sequence-timing.v1",
    challenge: { measurementVersion: "finite-plan-activation-timing.v1", operation: "challenge", workerMs: 8.1, d1AwaitMs: 6.4, runtimeMs: 1.7, d1Calls: 3, clientRoundTripMs: 22.5, transportEstimateMs: 14.4 },
    initialize: { measurementVersion: "finite-plan-activation-timing.v1", operation: "initialize", workerMs: 15.2, d1AwaitMs: 12.8, runtimeMs: 2.4, d1Calls: 4, clientRoundTripMs: 31.9, transportEstimateMs: 16.7 },
  });
  assert.equal(construction.loads, loadsBeforeActivation);
  assert.equal(runtime.kernel.profile.planId, "plan_atomic_activation");
  await assert.rejects(construction.load(), (error) => error.code === "CONSTRUCTION_PACKET_CLEARED");
});

test("guarded arrival activation surfaces a stale-arrival refusal before accepted initialization", async () => {
  const profiles = await compileBuiltInProfiles();
  const storage = new MemoryStorage();
  const construction = new MemoryConstructionPacketRepository(() => new Date("2026-08-26T01:00:00.000Z"));
  const durable = new MemoryAcceptedTruthRepository(() => new Date("2026-08-26T01:00:00.000Z"));
  let atomicInitializations = 0;
  const accepted = {
    initialize: (...args) => durable.initialize(...args),
    load: (...args) => durable.load(...args),
    commit: (...args) => durable.commit(...args),
    createPlanActivationChallenge: async () => { throw new AcceptedTruthRepositoryError("PLAN_ACTIVATION_ARRIVAL_STALE", "The arrival changed."); },
    initializePlanActivation: async () => { atomicInitializations += 1; throw new Error("must not initialize"); },
  };
  const runtime = new FinitePlanRuntime(profiles, new PlanSnapshotStore(storage), "travel", new PlanCatalogStore(storage), [], () => new Date("2026-08-26T01:00:00.000Z"), accepted, construction);
  await runtime.hydrateAcceptedTruth();
  const sourceArrival = { orderId: "arrival_stale_activation", orderVersion: 2, orderChecksum: "b".repeat(64) };
  const assessed = await runtime.assessPlanIntake({ sourceArrival, constructionMode: "adaptive_shell", profileId: "travel", planId: "plan_stale_activation", name: "Stale activation trip", brief: "A stale-bound plan.", allocation: { totalBudgetMinor: 1_000_000 }, actuals: [], locks: ["total_budget"], preferenceLabels: ["preserve_flexibility"], entityEstimates: { trip_days: { days: { value: 30, basis: "One month.", sourcePaths: ["reviewed_interpretation"] } }, booked_segment_days: { days: { value: 0, basis: "Nothing booked.", sourcePaths: ["reviewed_interpretation"] } } }, stages: [{ stageId: "journey", label: "Journey", status: "planned" }] });
  const staged = await runtime.compileIntakeToDraft({ packetId: assessed.constructionPacket.packetId, expectedChecksum: assessed.constructionPacket.checksum });
  const confirmed = runtime.humanConfirmPlanDraft({ draftId: staged.draft.draftId });
  const refused = await runtime.activateConfirmedPlanDraft({ draftId: staged.draft.draftId, confirmationId: confirmed.confirmation.confirmationId, expectedPlanId: "plan_travel_europe", expectedRevision: 1, idempotencyKey: "stale-atomic-activation-0001" });

  assert.equal(refused.code, "PLAN_ACTIVATION_ARRIVAL_STALE");
  assert.equal(atomicInitializations, 0);
  assert.equal(runtime.kernel.profile.planId, "plan_travel_europe");
  assert(runtime.pendingPlanDraft);
});

test("a human-confirmed amendment draft resumes without authority and activates only after fresh confirmation", async () => {
  const { profiles, snapshotStore, catalogStore, runtime, clock } = await setup();
  const blueprint = runtime.getAmendmentBlueprint();
  blueprint.profile.accepted.forecastMinor -= 10_000;
  blueprint.profile.accepted.bufferMinor += 10_000;
  const staged = await runtime.stagePlanAmendment({ profile: blueprint.profile, supersedesPlanId: blueprint.supersedesPlanId, expectedRevision: blueprint.supersedesRevision });
  assert.equal(staged.code, "PLAN_AMENDMENT_STAGED");
  assert.equal(staged.constructionPacket.kind, "draft");
  const originalConfirmation = runtime.humanConfirmPlanDraft({ draftId: staged.draft.draftId });
  assert.equal(originalConfirmation.code, "HUMAN_PLAN_ACTIVATION_CONFIRMED");
  assert.equal(JSON.stringify(catalogStore.loadConstructionPacket()).includes("confirmationId"), false);

  clock.value = "2026-08-26T03:00:00.000Z";
  const restored = new FinitePlanRuntime(profiles, snapshotStore, "travel", catalogStore, [], () => new Date(clock.value));
  assert.equal(restored.pendingPlanDraft, null);
  assert.equal(restored.planActivationConfirmation, null);
  const resumed = await restored.resumeConstructionPacket();
  assert.equal(resumed.code, "CONSTRUCTION_DRAFT_RESUMED");
  assert.equal(resumed.draft.draftId, staged.draft.draftId);
  assert.equal(resumed.draft.amendment.diffHash, staged.draft.amendment.diffHash);
  assert.equal(resumed.humanConfirmationRestored, false);
  assert.equal(restored.planActivationConfirmation, null);

  const refused = await restored.activateConfirmedPlanDraft({ draftId: staged.draft.draftId, confirmationId: originalConfirmation.confirmation.confirmationId, expectedPlanId: "plan_travel_europe", expectedRevision: 1, idempotencyKey: "resume-amendment-activation-0001" });
  assert.equal(refused.code, "PLAN_ACTIVATION_CONFIRMATION_MISSING_OR_MISMATCHED");
  const freshConfirmation = restored.humanConfirmPlanDraft({ draftId: staged.draft.draftId });
  const activated = await restored.activateConfirmedPlanDraft({ draftId: staged.draft.draftId, confirmationId: freshConfirmation.confirmation.confirmationId, expectedPlanId: "plan_travel_europe", expectedRevision: 1, idempotencyKey: "resume-amendment-activation-0001" });
  assert.equal(activated.code, "PLAN_AMENDMENT_ACTIVATED");
  assert.equal(activated.constructionPacketCleared, true);
  assert.equal(catalogStore.loadConstructionPacket(), null);
});

test("expired, stale, and tampered construction packets fail closed without accepted mutation", async () => {
  const { profiles, snapshotStore, catalogStore, runtime, storage, clock } = await setup();
  const acceptedBefore = structuredClone(runtime.kernel.accepted);
  const staged = await runtime.stagePlanDraft(newTravel("plan_travel_guarded_work"));
  const packetId = staged.constructionPacket.packetId;

  clock.value = "2026-09-03T01:00:00.001Z";
  assert.equal((await runtime.getConstructionPacket()).packet.status, "expired");
  assert.equal((await runtime.resumeConstructionPacket()).code, "CONSTRUCTION_PACKET_EXPIRED");
  assert.deepEqual(runtime.kernel.accepted, acceptedBefore);
  assert.equal((await runtime.discardConstructionPacket({ packetId })).code, "CONSTRUCTION_PACKET_DISCARDED");

  clock.value = "2026-08-26T01:00:00.000Z";
  const replacement = await runtime.stagePlanDraft(newTravel("plan_travel_stale_work"));
  assert.equal(runtime.switchProfile("renovation").code, "PROFILE_SWITCHED");
  assert.equal((await runtime.resumeConstructionPacket()).code, "CONSTRUCTION_PACKET_BASE_STALE");
  assert.equal(runtime.switchProfile("travel").code, "PROFILE_SWITCHED");
  assert.equal((await runtime.resumeConstructionPacket()).code, "CONSTRUCTION_DRAFT_RESUMED");

  const stored = JSON.parse(storage.getItem("finite-plan.construction.v1"));
  stored.payload.profile.name = "Tampered after checksum";
  storage.setItem("finite-plan.construction.v1", JSON.stringify(stored));
  const tampered = new FinitePlanRuntime(profiles, snapshotStore, "travel", catalogStore, [], () => new Date(clock.value));
  assert.equal((await tampered.resumeConstructionPacket()).code, "CONSTRUCTION_PACKET_INTEGRITY_FAILED");
  assert.equal(tampered.pendingPlanDraft, null);
  assert.equal(tampered.planActivationConfirmation, null);
  assert.deepEqual(tampered.kernel.accepted, acceptedBefore);
  assert.equal(replacement.constructionPacket.packetId, stored.packetId);
});

test("storage failure refuses staged durability and WebMCP exposes continuity without authority", async () => {
  const storage = new FailingStorage();
  const { runtime } = await setup(storage);
  storage.failConstruction = true;
  const refused = await runtime.stagePlanDraft(newTravel("plan_travel_storage_failure"));
  assert.equal(refused.code, "CONSTRUCTION_PACKET_STORAGE_FAILED");
  assert.equal(runtime.pendingPlanDraft, null);
  assert.equal(runtime.kernel.profile.planId, "plan_travel_europe");
  storage.failConstruction = false;

  const host = new MemoryModelContext();
  const adapter = new FinitePlanWebMCPAdapter(host, runtime);
  const inventory = await adapter.register();
  assert.equal(inventory.length, 11);
  assert.equal((await host.execute("finite_open_toolset", { group: "construction" })).code, "TOOLSET_READY");
  assert(host.tools.has("finite_get_construction_packet"));
  assert(host.tools.has("finite_resume_build_packet"));
  assert(host.tools.has("finite_discard_build_packet"));
  assert.equal(inventory.some((name) => humanOnlyActions.includes(name)), false);
  assert.equal(host.tools.get("finite_assess_plan_intake").annotations.readOnlyHint, false);

  const staged = await runtime.stagePlanDraft(newTravel("plan_travel_replaced_work"));
  runtime.humanConfirmPlanDraft({ draftId: staged.draft.draftId });
  const assessed = await host.execute("finite_assess_plan_intake", { profileId: "event", name: "WebMCP summit" });
  assert.equal(assessed.code, "INTAKE_FACTS_MISSING");
  assert.notEqual(assessed.constructionPacket.packetId, staged.constructionPacket.packetId);
  assert.equal(runtime.pendingPlanDraft, null);
  assert.equal(runtime.planActivationConfirmation, null);
  const inspected = await host.execute("finite_get_construction_packet", {});
  assert.equal(inspected.packet.packetId, assessed.constructionPacket.packetId);
  assert.equal((await host.execute("finite_resume_build_packet", {})).code, "CONSTRUCTION_INTAKE_RESUMED");
  assert.equal((await host.execute("finite_discard_build_packet", { packetId: inspected.packet.packetId })).code, "CONSTRUCTION_PACKET_DISCARDED");
});

test("an authenticated construction packet follows the consumer across browser surfaces without carrying authority", async () => {
  const profiles = await compileBuiltInProfiles();
  const remote = new MemoryConstructionPacketRepository(() => new Date("2026-08-26T18:00:30.000Z"));
  const firstStorage = new MemoryStorage();
  const first = new FinitePlanRuntime(
    profiles,
    new PlanSnapshotStore(firstStorage),
    "travel",
    new PlanCatalogStore(firstStorage),
    [],
    () => new Date("2026-08-26T18:00:00.000Z"),
  );
  const assessed = await first.assessPlanIntake({
    constructionMode: "adaptive_shell",
    profileId: "travel",
    planId: "plan_cross_surface_trip",
    name: "Cross-surface Europe trip",
    brief: "Build a one-month Europe planning shell.",
    allocation: { totalBudgetMinor: 1_000_000 },
    actuals: [],
    locks: ["total_budget"],
    preferenceLabels: ["preserve_route_flexibility"],
    entityEstimates: {
      trip_days: { days: { value: 30, basis: "One-month working estimate.", sourcePaths: ["reviewed_interpretation"] } },
      booked_segment_days: { days: { value: 0, basis: "No confirmed bookings are recorded.", sourcePaths: ["reviewed_interpretation"] } },
    },
    stages: [{ stageId: "europe", label: "Europe", marker: "Open", status: "planned" }],
  });
  const staged = await first.compileIntakeToDraft({ packetId: assessed.constructionPacket.packetId, expectedChecksum: assessed.constructionPacket.checksum });

  const migratingFirstSurface = new FinitePlanRuntime(
    profiles,
    new PlanSnapshotStore(firstStorage),
    "travel",
    new PlanCatalogStore(firstStorage),
    [],
    () => new Date("2026-08-26T23:00:00.000Z"),
    undefined,
    remote,
  );
  assert.equal((await migratingFirstSurface.hydrateConstructionPacket()).code, "CONSTRUCTION_PACKET_REMOTE_ADOPTED");

  const secondStorage = new MemoryStorage();
  const second = new FinitePlanRuntime(
    profiles,
    new PlanSnapshotStore(secondStorage),
    "travel",
    new PlanCatalogStore(secondStorage),
    [],
    () => new Date("2026-08-26T18:01:00.000Z"),
    undefined,
    remote,
  );
  assert.equal((await second.hydrateConstructionPacket()).code, "CONSTRUCTION_PACKET_REMOTE_HYDRATED");
  const resumed = await second.resumeConstructionPacket();
  assert.equal(resumed.code, "CONSTRUCTION_DRAFT_RESUMED");
  assert.equal(resumed.draft.draftId, staged.draft.draftId);
  assert.equal(second.planActivationConfirmation, null);
  assert.equal(JSON.stringify(secondStorage.getItem("finite-plan.construction.v1")).includes("confirmationId"), false);

  assert.equal((await second.humanRejectPlanDraft({ draftId: staged.draft.draftId, reasonCode: "structure", reason: "Keep the route primary and the budget subordinate." })).code, "HUMAN_PLAN_DRAFT_RETURNED");
  assert.equal((await migratingFirstSurface.hydrateConstructionPacket()).code, "CONSTRUCTION_DRAFT_RETURNED");
  const returned = await migratingFirstSurface.getReturnedPlanDraft();
  assert.equal(returned.code, "RETURNED_PLAN_DRAFT_CONTEXT");
  assert.equal(returned.draft.draftId, staged.draft.draftId);
  assert.equal(returned.returned.returnReview.message, "Keep the route primary and the budget subordinate.");
  const revised = await migratingFirstSurface.assessPlanIntake({
    constructionMode: "adaptive_shell",
    profileId: "travel",
    planId: "plan_cross_surface_trip_revision",
    name: "Cross-surface Europe trip — route first",
    brief: "Keep the living route and open decisions primary while the finite budget remains a constraint.",
    allocation: { totalBudgetMinor: 1_000_000 },
    actuals: [], locks: ["total_budget"], preferenceLabels: ["preserve_route_flexibility"],
    entityEstimates: {
      trip_days: { days: { value: 30, basis: "One-month working estimate.", sourcePaths: ["reviewed_interpretation"] } },
      booked_segment_days: { days: { value: 0, basis: "No confirmed bookings are recorded.", sourcePaths: ["reviewed_interpretation"] } },
    },
    stages: [{ stageId: "europe", label: "Europe", marker: "Open", status: "planned" }],
  });
  assert.match(revised.code, /^INTAKE_FACTS_COMPLETE/);
  assert.equal((await migratingFirstSurface.getConstructionPacket()).packet.kind, "intake");
  assert.equal((await remote.loadReturned()).status, "returned");
  const revisedDraft = await migratingFirstSurface.compileIntakeToDraft({
    packetId: revised.constructionPacket.packetId,
    expectedChecksum: revised.constructionPacket.checksum,
  });
  assert.equal(revisedDraft.code, "PLAN_DRAFT_STAGED_FROM_INTAKE");
  const resolvedReturn = await remote.loadReturned();
  assert.equal(resolvedReturn.status, "resolved");
  assert.equal(resolvedReturn.resolvedByPacketId, revisedDraft.constructionPacket.packetId);
  assert.equal(migratingFirstSurface.lastConstructionReturnReview.status, "resolved");
});

test("server construction validation accepts exact work and refuses embedded human authority", async () => {
  const { runtime, catalogStore } = await setup();
  const staged = await runtime.stagePlanDraft(newTravel("plan_server_validated_work"));
  const packet = catalogStore.loadConstructionPacket();
  assert.deepEqual(await constructionPacketIntegrityIssues(packet), []);

  const authorityBearing = structuredClone(packet);
  authorityBearing.payload.confirmationId = "must_not_cross_surfaces";
  const { packetId: _packetId, checksum: _checksum, ...content } = authorityBearing;
  authorityBearing.checksum = await sha256(content);
  authorityBearing.packetId = `construction_${authorityBearing.checksum.slice(0, 16)}`;
  assert((await constructionPacketIntegrityIssues(authorityBearing)).some((issue) => issue.includes("human authority field is forbidden")));
  assert.equal(staged.acceptedStateChanged, false);
});
