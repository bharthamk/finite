import test from "node:test";
import assert from "node:assert/strict";
import { MemoryStorage, PlanCatalogStore, PlanSnapshotStore } from "../dist-test/src/persistence.js";
import { compileBuiltInProfiles, getProfileDefinition } from "../dist-test/src/profiles.js";
import { FinitePlanRuntime } from "../dist-test/src/runtime.js";
import { FinitePlanWebMCPAdapter, humanOnlyActions } from "../dist-test/src/webmcp.js";

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
  assert.equal(inventory.length, 39);
  assert(host.tools.has("finite_get_construction_packet"));
  assert(host.tools.has("finite_resume_construction_packet"));
  assert(host.tools.has("finite_discard_construction_packet"));
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
  assert.equal((await host.execute("finite_resume_construction_packet", {})).code, "CONSTRUCTION_INTAKE_RESUMED");
  assert.equal((await host.execute("finite_discard_construction_packet", { packetId: inspected.packet.packetId })).code, "CONSTRUCTION_PACKET_DISCARDED");
});
