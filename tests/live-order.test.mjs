import test from "node:test";
import assert from "node:assert/strict";
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
  async execute(name, input) {
    return this.tools.get(name)?.execute(input) ?? { ok: false, code: "TOOL_NOT_FOUND" };
  }
}

const change = (title, costDeltaMinor = 20_000) => ({
  type: "intent_change",
  title,
  costDeltaMinor,
  daysDelta: 0,
  minimumBufferMinor: 0,
  evidenceRefs: ["evidence_current"],
  expectedRevision: 1,
});

test("one active change order prevents same-revision candidate and approval mixing", async () => {
  const profile = (await compileBuiltInProfiles()).get("travel");
  assert(profile);
  const kernel = new FinitePlanKernel(profile);

  const first = kernel.recordChangeEvent(change("First order"));
  const firstOptions = await kernel.compareOptions({ eventId: first.event.eventId, generate: true });
  const firstCandidate = firstOptions.options.find((option) => option.valid);
  assert(firstCandidate);
  const staged = await kernel.stageOption({ candidateId: firstCandidate.candidateId, expectedRevision: 1 });
  const approved = await kernel.humanApprove({ candidateId: staged.staged.candidateId });
  assert.equal(approved.code, "HUMAN_APPROVAL_RECORDED");

  const second = kernel.recordChangeEvent(change("Replacement order", 25_000));
  assert.equal(second.superseded.invalidatedEventId, first.event.eventId);
  assert(second.superseded.invalidatedCandidateIds.includes(firstCandidate.candidateId));
  assert.equal(second.superseded.invalidatedStagedCandidateId, firstCandidate.candidateId);
  assert.equal(second.superseded.invalidatedApprovalId, approved.approval.approvalId);
  assert.equal(kernel.activeEventId, second.event.eventId);
  assert.equal(kernel.candidates.size, 0);
  assert.equal(kernel.stagedCandidate, null);
  assert.equal(kernel.approval, null);

  const superseded = await kernel.compareOptions({ eventId: first.event.eventId, generate: true });
  assert.equal(superseded.code, "EVENT_SUPERSEDED");
  assert.equal(superseded.activeEventId, second.event.eventId);

  const pendingBeforeSearch = kernel.getState(["pending"]).state.pending;
  assert.equal(pendingBeforeSearch.decisionStatus, "change_recorded");
  assert.equal(pendingBeforeSearch.activeEventId, second.event.eventId);
  assert.deepEqual(pendingBeforeSearch.eventIds, [second.event.eventId]);
  assert.deepEqual(pendingBeforeSearch.supersededEventIds, [first.event.eventId]);
  assert.match(pendingBeforeSearch.next, /search or simulate/);

  const secondOptions = await kernel.compareOptions({ eventId: second.event.eventId, generate: true });
  assert.equal(secondOptions.code, "OPTIONS_AVAILABLE");
  assert.equal(kernel.candidates.size, profile.searchPolicy.optionCount);
  assert([...kernel.candidates.values()].every((candidate) => candidate.eventId === second.event.eventId));
  const pendingAfterSearch = kernel.getState(["pending"]).state.pending;
  assert.equal(pendingAfterSearch.decisionStatus, "options_available");
  assert.equal(pendingAfterSearch.candidateIds.length, profile.searchPolicy.optionCount);
});

test("unaccepted change orders remain volatile while applied event lineage persists", async () => {
  const profile = (await compileBuiltInProfiles()).get("travel");
  assert(profile);
  const storage = new MemoryStorage();
  const store = new PlanSnapshotStore(storage);
  const pendingKernel = new FinitePlanKernel(profile, store);
  pendingKernel.recordChangeEvent(change("Volatile order"));
  pendingKernel.persist();
  const restoredPending = new FinitePlanKernel(profile, store);
  assert.equal(restoredPending.activeEventId, null);
  assert.equal(restoredPending.events.length, 0);

  const appliedKernel = new FinitePlanKernel(profile, store);
  const recorded = appliedKernel.recordChangeEvent(change("Accepted order"));
  const compared = await appliedKernel.compareOptions({ eventId: recorded.event.eventId, generate: true });
  const candidate = compared.options.find((option) => option.valid);
  const staged = await appliedKernel.stageOption({ candidateId: candidate.candidateId, expectedRevision: 1 });
  const approved = await appliedKernel.humanApprove({ candidateId: staged.staged.candidateId });
  await appliedKernel.applyApprovedOption({ candidateId: candidate.candidateId, approvalId: approved.approval.approvalId, expectedRevision: 1, idempotencyKey: "persist-lineage-0001" });
  const restoredApplied = new FinitePlanKernel(profile, store);
  assert.equal(restoredApplied.revision, 2);
  assert.equal(restoredApplied.activeEventId, null);
  assert.equal(restoredApplied.events.length, 1);
  assert.equal(restoredApplied.events[0].eventId, recorded.event.eventId);
});

test("WebMCP completion refreshes the consumer surface and returns synchronization proof", async () => {
  const profiles = await compileBuiltInProfiles();
  const runtime = new FinitePlanRuntime(profiles, new PlanSnapshotStore(new MemoryStorage()), "travel");
  const host = new MemoryModelContext();
  const observed = [];
  const adapter = new FinitePlanWebMCPAdapter(host, runtime, async ({ toolName, result }) => {
    const pending = runtime.kernel.getState(["pending"]).state.pending;
    observed.push({ toolName, code: result.code, status: pending.decisionStatus });
    return { renderSequence: observed.length, planRevision: runtime.kernel.revision, decisionStatus: pending.decisionStatus, activeEventId: pending.activeEventId };
  });
  await adapter.register();
  assert.equal((await host.execute("finite_open_toolset", { group: "planning" })).code, "TOOLSET_READY");

  const recorded = await host.execute("travel_extend_stay", JSON.stringify({ destination: "Paris", nights: 2, nightlyMinor: 15_000, minimumBufferMinor: 40_000 }));
  assert.equal(recorded.code, "CHANGE_RECORDED");
  assert.deepEqual(recorded.surfaceSync, { ok: true, renderSequence: 1, planRevision: 1, decisionStatus: "change_recorded", activeEventId: recorded.event.eventId });

  const compared = await host.execute("finite_compare_options", JSON.stringify({ eventId: recorded.event.eventId, generate: true }));
  assert.equal(compared.code, "OPTIONS_AVAILABLE");
  assert.equal(compared.surfaceSync.ok, true);
  assert.equal(compared.surfaceSync.decisionStatus, "options_available");

  const candidate = compared.options.find((option) => option.valid);
  const staged = await host.execute("finite_stage_option", JSON.stringify({ candidateId: candidate.candidateId, expectedRevision: 1 }));
  assert.equal(staged.code, "OPTION_STAGED");
  assert.equal(staged.surfaceSync.decisionStatus, "option_staged");

  const rejected = await host.execute("finite_reject_staged_option", JSON.stringify({ reason: "Human wants another route" }));
  assert.equal(rejected.code, "OPTION_REJECTED");
  assert.equal(rejected.surfaceSync.decisionStatus, "options_available");

  const restaged = await host.execute("finite_stage_option", JSON.stringify({ candidateId: candidate.candidateId, expectedRevision: 1 }));
  const approved = await runtime.kernel.humanApprove({ candidateId: restaged.staged.candidateId });
  const applied = await host.execute("finite_apply_approved_option", JSON.stringify({
    candidateId: candidate.candidateId,
    approvalId: approved.approval.approvalId,
    expectedRevision: 1,
    idempotencyKey: "live-sync-apply-0001",
  }));
  assert.equal(applied.code, "OPTION_APPLIED");
  assert.equal(applied.surfaceSync.planRevision, 2);
  assert.equal(applied.surfaceSync.decisionStatus, "idle");
  assert.equal(applied.surfaceSync.activeEventId, null);
  assert.deepEqual(observed.map((entry) => entry.code), ["CHANGE_RECORDED", "OPTIONS_AVAILABLE", "OPTION_STAGED", "OPTION_REJECTED", "OPTION_STAGED", "OPTION_APPLIED"]);
});

test("surface refresh failure never rewrites the deterministic tool outcome", async () => {
  const profiles = await compileBuiltInProfiles();
  const runtime = new FinitePlanRuntime(profiles, new PlanSnapshotStore(new MemoryStorage()), "travel");
  const host = new MemoryModelContext();
  const adapter = new FinitePlanWebMCPAdapter(host, runtime, async () => {
    throw new Error("synthetic renderer failure");
  });
  await adapter.register();
  const result = await host.execute("finite_get_capabilities", {});
  assert.equal(result.ok, true);
  assert.equal(result.code, "CAPABILITIES");
  assert.deepEqual(result.surfaceSync, { ok: false, code: "SURFACE_SYNC_FAILED", message: "synthetic renderer failure" });
});
