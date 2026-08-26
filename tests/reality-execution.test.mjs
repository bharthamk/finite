import test from "node:test";
import assert from "node:assert/strict";
import { MemoryAcceptedTruthRepository } from "../dist-test/src/accepted-truth.js";
import { MemoryArrivalRepository } from "../dist-test/src/arrival.js";
import { MemoryStorage, PlanSnapshotStore } from "../dist-test/src/persistence.js";
import { compileBuiltInProfiles } from "../dist-test/src/profiles.js";
import { FinitePlanRuntime } from "../dist-test/src/runtime.js";
import { FinitePlanWebMCPAdapter, humanOnlyActions } from "../dist-test/src/webmcp.js";

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

const setup = async (profileId = "travel", repository) => {
  const profiles = await compileBuiltInProfiles();
  const storage = new MemoryStorage();
  const runtime = new FinitePlanRuntime(profiles, new PlanSnapshotStore(storage), profileId, undefined, [], () => new Date("2026-08-27T00:00:00.000Z"), repository);
  return { profiles, storage, runtime };
};

const groupInput = (expectedRevision = 1) => ({
  question: "Which part of the trip should absorb the extra three nights?",
  positions: [
    { participantId: "alex", participantName: "Alex", position: "Keep Finland time untouched." },
    { participantId: "sam", participantName: "Sam", position: "Protect the Budapest week together." },
    { participantId: "benji", participantName: "Benji", position: "Use cheaper Paris accommodation before shortening visits." },
  ],
  unresolvedConflicts: ["Alex and Sam prefer different segments to absorb any remaining day pressure."],
  protocol: "named_decider",
  resolvedOutcome: "Benji decides to protect both friend commitments and test a lower Paris accommodation cap first.",
  expectedRevision,
});

test("group truth preserves named disagreement, refuses fabricated authority, reloads, and replays exactly", async () => {
  const { profiles, storage, runtime } = await setup();
  const staged = await runtime.kernel.stageGroupDecision(groupInput());
  assert.equal(staged.code, "GROUP_DECISION_STAGED");
  assert.equal(runtime.kernel.revision, 1);
  assert.equal((await runtime.kernel.applyConfirmedGroupDecision({ groupDecisionId: staged.groupDecision.groupDecisionId, confirmationId: "fabricated", expectedRevision: 1, idempotencyKey: "group-decision-0001" })).code, "CONFIRMATION_MISSING_OR_MISMATCHED");
  const confirmation = runtime.kernel.humanConfirmGroupDecision({ groupDecisionId: staged.groupDecision.groupDecisionId });
  const command = { groupDecisionId: staged.groupDecision.groupDecisionId, confirmationId: confirmation.confirmation.confirmationId, expectedRevision: 1, idempotencyKey: "group-decision-0001" };
  const applied = await runtime.kernel.applyConfirmedGroupDecision(command);
  assert.equal(applied.code, "GROUP_DECISION_APPLIED");
  assert.equal(runtime.kernel.groupDecisionEvents[0].positions.length, 3);
  assert.equal(runtime.kernel.groupDecisionEvents[0].unresolvedConflicts.length, 1);
  assert.equal((await runtime.kernel.applyConfirmedGroupDecision(command)).code, "IDEMPOTENT_REPLAY");
  const reloaded = new FinitePlanRuntime(profiles, new PlanSnapshotStore(storage), "travel");
  assert.equal(reloaded.kernel.revision, 2);
  assert.deepEqual(reloaded.kernel.groupDecisionEvents, runtime.kernel.groupDecisionEvents);
});

test("external action truth keeps quote, booking, payment, and verification separate", async () => {
  const { runtime } = await setup("renovation");
  const unsupported = await runtime.kernel.stageExternalAction({ actionId: "tile_order", label: "Local tile order", status: "quoted", reason: "Supplier sent a price.", expectedRevision: 1 });
  assert.equal(unsupported.code, "EXTERNAL_ACTION_EVIDENCE_REQUIRED");
  const quote = await runtime.kernel.stageExternalAction({ actionId: "tile_order", label: "Local tile order", status: "quoted", reason: "Supplier sent a price.", evidenceRef: "evidence_current", expectedRevision: 1 });
  const quoteConfirmation = runtime.kernel.humanConfirmExternalAction({ externalActionChangeId: quote.externalAction.externalActionChangeId });
  assert.equal((await runtime.kernel.applyConfirmedExternalAction({ externalActionChangeId: quote.externalAction.externalActionChangeId, confirmationId: quoteConfirmation.confirmation.confirmationId, expectedRevision: 1, idempotencyKey: "external-quoted-0001" })).code, "EXTERNAL_ACTION_APPLIED");
  assert.equal(runtime.kernel.externalActionEvents[0].after, "quoted");
  assert.equal(runtime.kernel.externalActionEvents[0].humanAttested, false);

  const booking = await runtime.kernel.stageExternalAction({ actionId: "tile_order", label: "Local tile order", status: "booked", reason: "Human says the order was placed.", evidenceRef: "evidence_current", expectedRevision: 2 });
  assert.equal((await runtime.kernel.applyConfirmedExternalAction({ externalActionChangeId: booking.externalAction.externalActionChangeId, confirmationId: "model_claim", expectedRevision: 2, idempotencyKey: "external-booked-0001" })).code, "CONFIRMATION_MISSING_OR_MISMATCHED");
  const bookingConfirmation = runtime.kernel.humanConfirmExternalAction({ externalActionChangeId: booking.externalAction.externalActionChangeId });
  const booked = await runtime.kernel.applyConfirmedExternalAction({ externalActionChangeId: booking.externalAction.externalActionChangeId, confirmationId: bookingConfirmation.confirmation.confirmationId, expectedRevision: 2, idempotencyKey: "external-booked-0001" });
  assert.equal(booked.code, "EXTERNAL_ACTION_APPLIED");
  assert.equal(booked.externalActionPerformedByFinite, false);
  assert.equal(runtime.kernel.externalActionEvents[1].humanAttested, true);
  assert.equal((await runtime.kernel.stageExternalAction({ actionId: "tile_order", label: "Local tile order", status: "researched", reason: "Try to rewrite history.", expectedRevision: 3 })).code, "EXTERNAL_ACTION_REGRESSION");
});

test("dropped commit responses recover both new ledgers with the same deterministic receipt", async () => {
  for (const kind of ["group", "external"]) {
    const durable = new MemoryAcceptedTruthRepository();
    let loseNextResponse = true;
    const repository = {
      initialize: (...args) => durable.initialize(...args),
      load: (...args) => durable.load(...args),
      async commit(...args) {
        const result = await durable.commit(...args);
        if (loseNextResponse) { loseNextResponse = false; throw new Error("injected response loss after durable commit"); }
        return result;
      },
    };
    const { runtime } = await setup("event", repository);
    await runtime.hydrateAcceptedTruth();
    let command;
    if (kind === "group") {
      const staged = await runtime.kernel.stageGroupDecision(groupInput());
      const confirmation = runtime.kernel.humanConfirmGroupDecision({ groupDecisionId: staged.groupDecision.groupDecisionId });
      command = { groupDecisionId: staged.groupDecision.groupDecisionId, confirmationId: confirmation.confirmation.confirmationId, expectedRevision: 1, idempotencyKey: "lost-group-0001" };
      assert.equal((await runtime.kernel.applyConfirmedGroupDecision(command)).code, "ACCEPTED_STATE_STORAGE_FAILED");
      assert.equal((await runtime.kernel.applyConfirmedGroupDecision(command)).code, "GROUP_DECISION_APPLIED");
    } else {
      const staged = await runtime.kernel.stageExternalAction({ actionId: "venue_hold", label: "Venue hold", status: "held", reason: "Venue issued a hold.", evidenceRef: "evidence_current", expectedRevision: 1 });
      const confirmation = runtime.kernel.humanConfirmExternalAction({ externalActionChangeId: staged.externalAction.externalActionChangeId });
      command = { externalActionChangeId: staged.externalAction.externalActionChangeId, confirmationId: confirmation.confirmation.confirmationId, expectedRevision: 1, idempotencyKey: "lost-external-0001" };
      assert.equal((await runtime.kernel.applyConfirmedExternalAction(command)).code, "ACCEPTED_STATE_STORAGE_FAILED");
      assert.equal((await runtime.kernel.applyConfirmedExternalAction(command)).code, "EXTERNAL_ACTION_APPLIED");
    }
    const envelope = await durable.load(runtime.kernel.profile.planId, runtime.kernel.profile.profileHash);
    assert.equal(envelope.revision, 2);
    assert.equal(envelope.snapshot.receipts.length, 1);
    assert.equal(runtime.kernel.receipts[0].receiptId, envelope.snapshot.receipts[0].receiptId);
  }
});

test("chef-effort benchmark exposes comparable counters and one explicit human boundary per reality write", async () => {
  const observations = [];
  for (const kind of ["group", "external"]) {
    const { runtime } = await setup(kind === "group" ? "travel" : "event");
    const host = new MemoryModelContext();
    await new FinitePlanWebMCPAdapter(host, runtime, undefined, new MemoryArrivalRepository()).register();
    await host.execute("finite_open_toolset", { group: "decisions" });
    assert.equal([...host.tools.keys()].some((name) => humanOnlyActions.includes(name)), false);
    const staged = kind === "group"
      ? await host.execute("finite_stage_group_decision", groupInput())
      : await host.execute("finite_stage_external_action", { actionId: "venue_hold", label: "Venue hold", status: "held", reason: "Venue supplied a current hold.", evidenceRef: "evidence_current", expectedRevision: 1 });
    assert.equal(staged.ok, true);
    assert.equal(staged.operatorContinuation.nextAction.stage, "awaiting_human");
    assert.equal(staged.chefEffort.humanBoundaryTurns >= 1, true);
    const targetId = kind === "group" ? staged.groupDecision.groupDecisionId : staged.externalAction.externalActionChangeId;
    const confirmed = kind === "group" ? runtime.kernel.humanConfirmGroupDecision({ groupDecisionId: targetId }) : runtime.kernel.humanConfirmExternalAction({ externalActionChangeId: targetId });
    await host.execute("finite_open_toolset", { group: "decisions" });
    const applied = kind === "group"
      ? await host.execute("finite_apply_confirmed_group_decision", { groupDecisionId: targetId, confirmationId: confirmed.confirmation.confirmationId, expectedRevision: 1, idempotencyKey: `effort-${kind}-0001` })
      : await host.execute("finite_apply_confirmed_external_action", { externalActionChangeId: targetId, confirmationId: confirmed.confirmation.confirmationId, expectedRevision: 1, idempotencyKey: `effort-${kind}-0001` });
    assert.equal(applied.ok, true);
    assert.equal(applied.chefEffort.acceptedMutations, 1);
    assert.equal(applied.chefEffort.failedCalls, 0);
    observations.push(applied.chefEffort);
  }
  assert.equal(Math.abs(observations[0].toolCalls - observations[1].toolCalls) <= 1, true);
  assert.equal(observations.every((effort) => effort.tokenMeasure === "host_owned_unavailable"), true);
});
