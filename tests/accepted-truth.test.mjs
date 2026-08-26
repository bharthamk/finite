import test from "node:test";
import assert from "node:assert/strict";
import { MemoryAcceptedTruthRepository } from "../dist-test/src/accepted-truth.js";
import { MemoryStorage, PlanSnapshotStore } from "../dist-test/src/persistence.js";
import { compileBuiltInProfiles } from "../dist-test/src/profiles.js";
import { FinitePlanRuntime } from "../dist-test/src/runtime.js";

const makeRuntime = (profiles, profileId, repository, storage = new MemoryStorage()) =>
  new FinitePlanRuntime(profiles, new PlanSnapshotStore(storage), profileId, undefined, [], () => new Date("2026-08-26T00:00:00.000Z"), repository);

const prepareApprovedOption = async (runtime, title) => {
  const kernel = runtime.kernel;
  const recorded = kernel.recordChangeEvent({
    type: "live_change",
    title,
    costDeltaMinor: 10_000,
    minimumBufferMinor: 0,
    evidenceRefs: ["evidence_current"],
    expectedRevision: kernel.revision,
  });
  assert.equal(recorded.code, "CHANGE_RECORDED");
  const compared = await kernel.compareOptions({ eventId: recorded.event.eventId, generate: true });
  const chosen = compared.options.find((option) => option.valid);
  assert(chosen);
  const staged = await kernel.stageOption({ candidateId: chosen.candidateId, expectedRevision: kernel.revision });
  assert.equal(staged.code, "OPTION_STAGED");
  const approved = await kernel.humanApprove({ candidateId: chosen.candidateId, warningsAcknowledged: staged.staged.warnings.map((warning) => String(warning.code)) });
  assert.equal(approved.code, "HUMAN_APPROVAL_RECORDED");
  return {
    candidateId: chosen.candidateId,
    approvalId: approved.approval.approvalId,
    expectedRevision: kernel.revision,
  };
};

for (const profileId of ["travel", "renovation", "event"]) {
  test(`${profileId} human authority and Codex operation commit to remote truth and survive a browser-empty reload`, async () => {
    const profiles = await compileBuiltInProfiles();
    const repository = new MemoryAcceptedTruthRepository();
    const runtime = makeRuntime(profiles, profileId, repository);
    const hydrated = await runtime.hydrateAcceptedTruth();
    assert.equal(hydrated.code, "ACCEPTED_TRUTH_INITIALIZED");
    assert.deepEqual(runtime.kernel.acceptedTruth.status, "ready");

    const command = await prepareApprovedOption(runtime, `${profileId} remote journey`);
    const applied = await runtime.kernel.applyApprovedOption({ ...command, idempotencyKey: `remote-${profileId}-0001` });
    assert.equal(applied.code, "OPTION_APPLIED");
    assert.equal(runtime.kernel.revision, 2);
    assert.equal(runtime.kernel.acceptedTruth.status, "ready");

    const browserEmptyReload = makeRuntime(profiles, profileId, repository, new MemoryStorage());
    assert.equal(browserEmptyReload.kernel.revision, 1);
    const rehydrated = await browserEmptyReload.hydrateAcceptedTruth();
    assert.equal(rehydrated.code, "ACCEPTED_TRUTH_CURRENT");
    assert.equal(browserEmptyReload.kernel.revision, 2);
    assert.deepEqual(browserEmptyReload.kernel.accepted, runtime.kernel.accepted);
    assert.deepEqual(browserEmptyReload.kernel.entities, runtime.kernel.entities);
    assert.equal(browserEmptyReload.kernel.receipts[0].receiptId, runtime.kernel.receipts[0].receiptId);
  });
}

test("optimistic concurrency permits one operator commit and rolls the losing kitchen back to its exact approved checkpoint", async () => {
  const profiles = await compileBuiltInProfiles();
  const repository = new MemoryAcceptedTruthRepository();
  const first = makeRuntime(profiles, "travel", repository);
  const second = makeRuntime(profiles, "travel", repository);
  await first.hydrateAcceptedTruth();
  await second.hydrateAcceptedTruth();
  const firstCommand = await prepareApprovedOption(first, "First operator route");
  const secondCommand = await prepareApprovedOption(second, "Second operator route");

  const [firstResult, secondResult] = await Promise.all([
    first.kernel.applyApprovedOption({ ...firstCommand, idempotencyKey: "concurrent-first" }),
    second.kernel.applyApprovedOption({ ...secondCommand, idempotencyKey: "concurrent-second" }),
  ]);
  const outcomes = [firstResult.code, secondResult.code].sort();
  assert.deepEqual(outcomes, ["ACCEPTED_STATE_CONFLICT", "OPTION_APPLIED"]);
  const winner = firstResult.code === "OPTION_APPLIED" ? first : second;
  const loser = firstResult.code === "ACCEPTED_STATE_CONFLICT" ? first : second;
  assert.equal(winner.kernel.revision, 2);
  assert.equal(loser.kernel.revision, 1);
  assert(loser.kernel.stagedCandidate);
  assert(loser.kernel.approval);
  assert.equal(loser.kernel.receipts.length, 0);

  const refreshed = await loser.hydrateAcceptedTruth();
  assert.equal(refreshed.code, "ACCEPTED_TRUTH_CURRENT");
  assert.equal(loser.kernel.revision, 2);
  assert.equal(loser.kernel.stagedCandidate, null);
  assert.equal(loser.kernel.approval, null);
});

test("a lost commit response retries with the same deterministic receipt and resolves as an exact repository replay", async () => {
  const profiles = await compileBuiltInProfiles();
  const durable = new MemoryAcceptedTruthRepository();
  let loseNextResponse = true;
  const repository = {
    initialize: (...args) => durable.initialize(...args),
    load: (...args) => durable.load(...args),
    async commit(...args) {
      const result = await durable.commit(...args);
      if (loseNextResponse) {
        loseNextResponse = false;
        throw new Error("injected lost response after durable commit");
      }
      return result;
    },
  };
  const runtime = makeRuntime(profiles, "event", repository);
  await runtime.hydrateAcceptedTruth();
  const command = { ...(await prepareApprovedOption(runtime, "Lost response route")), idempotencyKey: "lost-response-0001" };
  const failed = await runtime.kernel.applyApprovedOption(command);
  assert.equal(failed.code, "ACCEPTED_STATE_STORAGE_FAILED");
  assert.equal(runtime.kernel.revision, 1);
  assert.equal(runtime.kernel.receipts.length, 0);
  const retried = await runtime.kernel.applyApprovedOption(command);
  assert.equal(retried.code, "OPTION_APPLIED");
  assert.equal(runtime.kernel.revision, 2);
  const durableEnvelope = await durable.load(runtime.kernel.profile.planId, runtime.kernel.profile.profileHash);
  assert.equal(durableEnvelope.revision, 2);
  assert.equal(durableEnvelope.snapshot.receipts.length, 1);
  assert.equal(durableEnvelope.snapshot.receipts[0].receiptId, runtime.kernel.receipts[0].receiptId);
});

test("client hydration refuses a tampered durable envelope before consequential work", async () => {
  const profiles = await compileBuiltInProfiles();
  const durable = new MemoryAcceptedTruthRepository();
  const repository = {
    load: (...args) => durable.load(...args),
    commit: (...args) => durable.commit(...args),
    async initialize(...args) {
      const result = await durable.initialize(...args);
      result.envelope.snapshot.accepted.bufferMinor += 1;
      return result;
    },
  };
  const runtime = makeRuntime(profiles, "renovation", repository);
  const result = await runtime.hydrateAcceptedTruth();
  assert.equal(result.ok, false);
  assert.equal(result.code, "REMOTE_ACCEPTED_TRUTH_INTEGRITY_FAILED");
  assert.equal(runtime.kernel.acceptedTruth.status, "unavailable");
});
