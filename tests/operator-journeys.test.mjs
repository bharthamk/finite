import test from "node:test";
import assert from "node:assert/strict";
import { MemoryArrivalRepository } from "../dist-test/src/arrival.js";
import { sha256 } from "../dist-test/src/crypto.js";
import { FinitePlanKernel } from "../dist-test/src/kernel.js";
import { MemoryStorage, PlanSnapshotStore } from "../dist-test/src/persistence.js";
import { compileBuiltInProfiles } from "../dist-test/src/profiles.js";
import { FinitePlanRuntime } from "../dist-test/src/runtime.js";
import { FinitePlanWebMCPAdapter } from "../dist-test/src/webmcp.js";

class MemoryModelContext {
  tools = new Map();
  registerTool(tool, options = {}) {
    this.tools.set(tool.name, tool);
    options.signal?.addEventListener("abort", () => this.tools.delete(tool.name), { once: true });
  }
  async execute(name, input = {}) {
    return this.tools.get(name)?.execute(input) ?? { ok: false, code: "TOOL_NOT_FOUND" };
  }
}

class FailingSnapshotStorage extends MemoryStorage {
  failNextSnapshot = false;
  setItem(key, value) {
    if (this.failNextSnapshot && key.startsWith("finite-plan.v1:")) {
      this.failNextSnapshot = false;
      throw new Error("injected snapshot failure");
    }
    super.setItem(key, value);
  }
}

const scenarios = {
  travel: {
    contextualTool: "travel_extend_stay",
    input: { destination: "Paris", nights: 3, nightlyMinor: 22_000, minimumBufferMinor: 50_000 },
    timeModel: "calendar",
    assertOutcome(kernel) {
      assert.equal(kernel.entities.trip_days.values.days, 21);
      assert.equal(kernel.entities.booked_segment_days.values.days, 21);
    },
  },
  renovation: {
    contextualTool: "renovation_replace_material",
    input: { material: "imported tile", replacement: "local tile", costDeltaMinor: 80_000, daysDelta: 10, minimumBufferMinor: 60_000 },
    timeModel: "phases",
    assertOutcome(kernel) {
      assert(kernel.entities.completion_day.values.day <= kernel.entities.committed_completion_day.values.day);
      assert(kernel.accepted.bufferMinor >= 60_000);
    },
  },
  event: {
    contextualTool: "event_change_headcount",
    input: { delta: 15, perPersonMinor: 1_000, minimumBufferMinor: 20_000 },
    timeModel: "run_of_show",
    assertOutcome(kernel) {
      assert.equal(kernel.entities.guest_headcount.values.count, 115);
      assert(kernel.entities.guest_headcount.values.count <= kernel.entities.venue.values.capacity);
    },
  },
};

const allocationTotal = (allocation) => allocation.spentMinor + allocation.committedMinor + allocation.forecastMinor + allocation.bufferMinor;

const verifyOperationProof = async (result, toolName) => {
  const { operationProof, ...resultBody } = result;
  assert(operationProof);
  assert.equal(operationProof.toolName, toolName);
  assert.equal(operationProof.resultCode, result.code);
  assert.equal(operationProof.resultHash, await sha256(resultBody));
  const { operationHash, ...proofBase } = operationProof;
  assert.equal(operationHash, await sha256(proofBase));
};

for (const [profileId, scenario] of Object.entries(scenarios)) {
  test(`${profileId} paired human/Codex journey opens the kitchen, earns authority, applies once, and reloads`, async () => {
    const profiles = await compileBuiltInProfiles();
    const storage = new MemoryStorage();
    const store = new PlanSnapshotStore(storage);
    const runtime = new FinitePlanRuntime(profiles, store, profileId);
    const host = new MemoryModelContext();
    const adapter = new FinitePlanWebMCPAdapter(host, runtime, undefined, new MemoryArrivalRepository());
    await adapter.register();
    assert.equal((await host.execute("finite_open_toolset", { group: "planning" })).code, "TOOLSET_READY");

    const opened = await host.execute("finite_open_kitchen");
    assert.equal(opened.code, "KITCHEN_OPEN");
    assert.equal(opened.brief.active.profileId, profileId);
    assert.equal(opened.brief.consumerOutcome.projection.timeModel, scenario.timeModel);
    assert.equal(opened.brief.work.route.stage, "ready");
    assert.equal(opened.brief.work.route.nextTool, scenario.contextualTool);
    assert.equal(opened.brief.authority.humanAuthorityActionsExposedThroughWebMCP, false);
    const { briefHash, ...briefBase } = opened.brief;
    assert.equal(briefHash, await sha256(briefBase));
    await verifyOperationProof(opened, "finite_open_kitchen");

    const recorded = await host.execute(scenario.contextualTool, scenario.input);
    assert.equal(recorded.code, "CHANGE_RECORDED");
    assert.equal(recorded.operationProof.before.revision, 1);
    assert.equal(recorded.operationProof.after.revision, 1);
    await verifyOperationProof(recorded, scenario.contextualTool);

    const compared = await host.execute("finite_compare_options", { eventId: recorded.event.eventId, generate: true });
    assert.equal(compared.code, "OPTIONS_AVAILABLE");
    const chosen = compared.options.find((option) => option.valid);
    assert(chosen);
    await adapter.waitForRouteSettlement();
    const staged = await host.execute("finite_stage_option", { candidateId: chosen.candidateId, expectedRevision: 1 });
    assert.equal(staged.code, "OPTION_STAGED");

    const awaitingHuman = await host.execute("finite_enter_kitchen", { entryIntent: "continue_current" });
    assert.equal(awaitingHuman.operatorPacket.nextAction.stage, "awaiting_human");
    assert.equal(awaitingHuman.operatorPacket.nextAction.nextTool, null);
    const humanApproval = await runtime.kernel.humanApprove({ candidateId: chosen.candidateId });
    assert.equal(humanApproval.code, "HUMAN_APPROVAL_RECORDED");

    const authorized = await host.execute("finite_enter_kitchen", { entryIntent: "continue_current" });
    assert.equal(authorized.operatorPacket.nextAction.stage, "human_approved");
    assert.equal(authorized.operatorPacket.nextAction.nextTool, "finite_apply_approved_option");
    await adapter.waitForRouteSettlement();
    const applied = await host.execute("finite_apply_approved_option", {
      candidateId: chosen.candidateId,
      approvalId: humanApproval.approval.approvalId,
      expectedRevision: 1,
      idempotencyKey: `journey-${profileId}-0001`,
    });
    assert.equal(applied.code, "OPTION_APPLIED");
    assert.equal(applied.operationProof.acceptedStateChangedClaim, true);
    assert.equal(applied.operationProof.before.revision, 1);
    assert.equal(applied.operationProof.after.revision, 2);
    await verifyOperationProof(applied, "finite_apply_approved_option");

    scenario.assertOutcome(runtime.kernel);
    assert.equal(allocationTotal(runtime.kernel.accepted), runtime.kernel.accepted.totalBudgetMinor);
    assert.equal(runtime.kernel.stagedCandidate, null);
    assert.equal(runtime.kernel.approval, null);
    assert.equal(runtime.kernel.receipts.length, 1);

    const replay = await host.execute("finite_apply_approved_option", {
      candidateId: chosen.candidateId,
      approvalId: humanApproval.approval.approvalId,
      expectedRevision: 1,
      idempotencyKey: `journey-${profileId}-0001`,
    });
    assert.equal(replay.code, "IDEMPOTENT_REPLAY");
    assert.equal(replay.operationProof.after.revision, 2);

    const reloaded = new FinitePlanRuntime(profiles, store, profileId);
    assert.equal(reloaded.kernel.revision, 2);
    assert.deepEqual(reloaded.kernel.accepted, runtime.kernel.accepted);
    assert.deepEqual(reloaded.kernel.entities, runtime.kernel.entities);
    assert.equal(reloaded.kernel.receipts.length, 1);
    scenario.assertOutcome(reloaded.kernel);
  });
}

test("accepted option, correction, and preference writes are failure-atomic and exactly retryable", async () => {
  const profiles = await compileBuiltInProfiles();
  const profile = profiles.get("travel");
  assert(profile);

  const optionStorage = new FailingSnapshotStorage();
  const optionKernel = new FinitePlanKernel(profile, new PlanSnapshotStore(optionStorage));
  const event = optionKernel.recordChangeEvent({ type: "intent_change", title: "Paris extension", costDeltaMinor: 66_000, daysDelta: 3, minimumBufferMinor: 50_000, evidenceRefs: ["evidence_current"], entityChanges: [{ entityId: "trip_days", field: "days", delta: 3 }, { entityId: "booked_segment_days", field: "days", delta: 3 }], expectedRevision: 1 });
  const options = await optionKernel.compareOptions({ eventId: event.event.eventId, generate: true });
  const staged = await optionKernel.stageOption({ candidateId: options.options[0].candidateId, expectedRevision: 1 });
  const approval = await optionKernel.humanApprove({ candidateId: staged.staged.candidateId });
  const optionCommand = { candidateId: staged.staged.candidateId, approvalId: approval.approval.approvalId, expectedRevision: 1, idempotencyKey: "atomic-option-0001" };
  const optionBefore = optionKernel.getState(["allocations", "entities", "pending"]);
  optionStorage.failNextSnapshot = true;
  const optionFailed = await optionKernel.applyApprovedOption(optionCommand);
  assert.equal(optionFailed.code, "ACCEPTED_STATE_STORAGE_FAILED");
  assert.equal(optionFailed.mutation, "plan_option");
  assert.equal(optionKernel.revision, 1);
  assert.deepEqual(optionKernel.getState(["allocations", "entities", "pending"]), optionBefore);
  assert.equal(optionKernel.receipts.length, 0);
  assert.equal((await optionKernel.applyApprovedOption(optionCommand)).code, "OPTION_APPLIED");

  const correctionStorage = new FailingSnapshotStorage();
  const correctionKernel = new FinitePlanKernel(profile, new PlanSnapshotStore(correctionStorage));
  const correction = await correctionKernel.stageActualCorrection({ actualId: "actual_travel_food", correctedAmountMinor: 45_000, reason: "Duplicate line", evidenceRef: "evidence_actual", expectedRevision: 1 });
  const correctionConfirmation = correctionKernel.humanConfirmActualCorrection({ correctionId: correction.correction.correctionId });
  const correctionCommand = { correctionId: correction.correction.correctionId, confirmationId: correctionConfirmation.confirmation.confirmationId, expectedRevision: 1, idempotencyKey: "atomic-correction-0001" };
  correctionStorage.failNextSnapshot = true;
  const correctionFailed = await correctionKernel.applyConfirmedActualCorrection(correctionCommand);
  assert.equal(correctionFailed.code, "ACCEPTED_STATE_STORAGE_FAILED");
  assert.equal(correctionFailed.mutation, "actual_correction");
  assert.equal(correctionKernel.revision, 1);
  assert.equal(correctionKernel.pendingCorrection.correctionId, correction.correction.correctionId);
  assert.equal(correctionKernel.correctionConfirmation.confirmationId, correctionConfirmation.confirmation.confirmationId);
  assert.equal(correctionKernel.receipts.length, 0);
  assert.equal((await correctionKernel.applyConfirmedActualCorrection(correctionCommand)).code, "ACTUAL_CORRECTION_APPLIED");

  const preferenceStorage = new FailingSnapshotStorage();
  const preferenceKernel = new FinitePlanKernel(profile, new PlanSnapshotStore(preferenceStorage));
  const feedback = preferenceKernel.recordConsumerFeedback({ message: "Protect comfort", kind: "taste" });
  const preference = await preferenceKernel.stagePreferenceChange({ feedbackId: feedback.feedback.feedbackId, changes: { comfort: 98 }, expectedRevision: 1 });
  const preferenceConfirmation = preferenceKernel.humanConfirmPreferenceChange({ preferenceChangeId: preference.preferenceChange.preferenceChangeId });
  const preferenceCommand = { preferenceChangeId: preference.preferenceChange.preferenceChangeId, confirmationId: preferenceConfirmation.confirmation.confirmationId, expectedRevision: 1, idempotencyKey: "atomic-preference-0001" };
  preferenceStorage.failNextSnapshot = true;
  const preferenceFailed = await preferenceKernel.applyConfirmedPreferenceChange(preferenceCommand);
  assert.equal(preferenceFailed.code, "ACCEPTED_STATE_STORAGE_FAILED");
  assert.equal(preferenceFailed.mutation, "preference_change");
  assert.equal(preferenceKernel.revision, 1);
  assert.equal(preferenceKernel.pendingPreferenceChange.preferenceChangeId, preference.preferenceChange.preferenceChangeId);
  assert.equal(preferenceKernel.preferenceConfirmation.confirmationId, preferenceConfirmation.confirmation.confirmationId);
  assert.equal(preferenceKernel.preferenceWeights.comfort, profile.preferenceWeights.comfort);
  assert.equal(preferenceKernel.receipts.length, 0);
  assert.equal((await preferenceKernel.applyConfirmedPreferenceChange(preferenceCommand)).code, "PREFERENCE_CHANGE_APPLIED");
});
