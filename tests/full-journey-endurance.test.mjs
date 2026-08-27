import test from "node:test";
import assert from "node:assert/strict";
import { MemoryArrivalRepository } from "../dist-test/src/arrival.js";
import { MemoryStorage, PlanCatalogStore, PlanSnapshotStore } from "../dist-test/src/persistence.js";
import { compileBuiltInProfiles, getProfileDefinition } from "../dist-test/src/profiles.js";
import { compileCatalogEntries, FinitePlanRuntime } from "../dist-test/src/runtime.js";
import { FinitePlanWebMCPAdapter } from "../dist-test/src/webmcp.js";

class MemoryModelContext {
  tools = new Map();
  registerTool(tool, options = {}) {
    this.tools.set(tool.name, tool);
    options.signal?.addEventListener("abort", () => this.tools.delete(tool.name), { once: true });
  }
  async execute(name, input = {}) {
    const direct = this.tools.get(name);
    if (direct) return direct.execute(input);
    const dispatcher = this.tools.get("finite_invoke");
    return dispatcher?.execute({ action: name, arguments: input }) ?? { ok: false, code: "TOOL_NOT_FOUND", acceptedStateChanged: false };
  }
}

const journeys = [
  { id: "solo_europe", family: "travel", outcome: "Take a solo Europe trip around fixed flights without losing the freedom to change cities.", boundary: "How much uncertainty should remain unallocated?", answer: "Keep at least A$500 free.", preference: { experience: 96, buffer: 82 }, returnDraft: true, amend: false, finalStatus: "completed", shock: "Rail strike forces a same-day reroute", conclusion: "Returned home and reconciled the final travel costs." },
  { id: "family_reunion", family: "travel", outcome: "Get a family of four to a reunion while protecting one comfortable recovery day.", boundary: "Is the recovery day negotiable?", answer: "No, keep it even if the cheapest route loses.", preference: { comfort: 100, buffer: 55 }, returnDraft: false, amend: false, finalStatus: "completed", shock: "A child gets sick and departure moves by a day", conclusion: "The family arrived, attended, and came home safely." },
  { id: "conference_trip", family: "travel", outcome: "Attend a conference with fixed meetings, then add personal travel only if it remains responsible.", boundary: "Which obligation wins if the schedule changes?", answer: "The client meeting wins over personal travel.", preference: { schedule: 100, experience: 48 }, returnDraft: false, amend: true, finalStatus: "completed", shock: "The client moves the meeting to another city", conclusion: "The conference and client meeting are finished." },
  { id: "road_trip", family: "travel", outcome: "Run a flexible road trip that can survive weather closures and a vehicle problem.", boundary: "Would you abandon the trip rather than take an unsafe route?", answer: "Yes. Safety beats finishing.", preference: { comfort: 85, schedule: 20 }, returnDraft: false, amend: false, finalStatus: "abandoned", shock: "Flooding closes the only safe road", conclusion: "The human chose to stop rather than accept an unsafe detour." },
  { id: "kitchen_renovation", family: "renovation", outcome: "Finish a kitchen renovation before handover while preserving the one finish I care about.", boundary: "Which finish is emotionally non-negotiable?", answer: "Keep the handmade splashback tile.", preference: { experience: 100, schedule: 90 }, returnDraft: true, amend: false, finalStatus: "completed", shock: "The cabinet supplier loses the confirmed production slot", conclusion: "Handover is complete and the defect list is accepted." },
  { id: "bathroom_emergency", family: "renovation", outcome: "Repair a leaking bathroom quickly without confusing emergency work with optional upgrades.", boundary: "Is the bathroom currently safe to use?", answer: "No. Make it safe before discussing cosmetics.", preference: { schedule: 100, buffer: 92 }, returnDraft: false, amend: false, finalStatus: "completed", shock: "Opening the wall reveals additional water damage", conclusion: "The leak is repaired, the room is safe, and optional work was deferred." },
  { id: "whole_house", family: "renovation", outcome: "Phase a whole-house renovation around occupancy, permits, and two people with conflicting tastes.", boundary: "Can the household move out during structural work?", answer: "Only for one week, even if a longer move is cheaper.", preference: { comfort: 97, schedule: 88 }, returnDraft: false, amend: true, finalStatus: "paused", shock: "Permit approval slips beyond the available move-out week", conclusion: "The plan is deliberately paused until the permit and move-out window align." },
  { id: "deck_project", family: "renovation", outcome: "Build a deck mostly DIY without pretending weekends, weather, or energy are unlimited.", boundary: "What happens if DIY capacity disappears?", answer: "Stop the project; do not silently assume paid labour.", preference: { buffer: 100, schedule: 15 }, returnDraft: false, amend: false, finalStatus: "abandoned", shock: "The human injures a wrist and cannot safely continue DIY work", conclusion: "The project was abandoned without converting a personal limit into hidden spend." },
  { id: "wedding", family: "event", outcome: "Deliver a wedding that protects the ceremony and the people, not every decorative idea.", boundary: "Which sentimental choice may beat the financially rational option?", answer: "Keep my grandmother's venue even if another venue is cheaper.", preference: { experience: 100, buffer: 62 }, returnDraft: true, amend: true, finalStatus: "completed", shock: "Heavy rain removes the outdoor reception space", conclusion: "The wedding happened and all critical suppliers are reconciled." },
  { id: "customer_conference", family: "event", outcome: "Run a customer conference that can absorb sponsor and speaker changes without breaking the show.", boundary: "Can the event become hybrid if capacity tightens?", answer: "Yes, but the main customer sessions stay live.", preference: { experience: 92, schedule: 95 }, returnDraft: false, amend: false, finalStatus: "completed", shock: "The keynote speaker cancels on the morning of the event", conclusion: "The replacement programme ran and the event closed on time." },
  { id: "birthday_festival", family: "event", outcome: "Plan a large birthday with an enthusiastic host who will probably invite too many people.", boundary: "Is venue capacity a real limit or an aspiration?", answer: "It is a real safety limit, even if the host complains later.", preference: { experience: 99, comfort: 70 }, returnDraft: false, amend: false, finalStatus: "completed", shock: "The host adds thirty guests after catering is confirmed", conclusion: "The party happened within the venue's accepted safety limit." },
  { id: "product_launch", family: "event", outcome: "Deliver a fixed-date product launch despite inventory, VIP, and staffing uncertainty.", boundary: "Can the launch move if inventory is late?", answer: "No. Change the format, not the public date.", preference: { schedule: 100, experience: 94 }, returnDraft: false, amend: true, finalStatus: "paused", shock: "Inventory and two trained staff fail to arrive", conclusion: "The live event is paused pending a human go/no-go decision; no fake completion was recorded." },
];

const requireCode = (result, code) => {
  assert.equal(result.code, code, JSON.stringify(result));
  return result;
};

const openGroup = async (host, group) => requireCode(await host.execute("finite_open_toolset", { group }), "TOOLSET_READY");

const makeProfile = (spec) => {
  const profile = getProfileDefinition(spec.family);
  profile.planId = `plan_${spec.family}_${spec.id}`;
  profile.name = spec.outcome.slice(0, 110);
  profile.surface.hero.eyebrow = `Endurance journey · ${spec.id.replaceAll("_", " ")}`;
  profile.surface.hero.title = spec.outcome.slice(0, 180);
  profile.surface.hero.brief = `Protect the stated outcome while adapting to late facts, preference changes, and an explicit ending.`;
  profile.surface.stages[0].detail = `Initial human order: ${spec.outcome.slice(0, 180)}`;
  return profile;
};

const intakeFromProfile = (profile) => ({
  constructionMode: "exact",
  profileId: profile.profileId,
  planId: profile.planId,
  name: profile.name,
  brief: profile.surface.hero.brief,
  allocation: profile.accepted,
  actuals: profile.actuals,
  locks: profile.locks,
  preferenceLabels: profile.preferenceLabels,
  moves: profile.moves,
  searchPolicy: profile.searchPolicy,
  entityValues: Object.fromEntries(Object.entries(profile.entities).map(([entityId, entity]) => [entityId, entity.values])),
  dependencies: profile.surface.dependencies ?? [],
  assumptions: profile.surface.assumptions ?? [],
  stages: profile.surface.stages,
});

const compileArrivalBoundDraft = async (host, profile) => {
  await openGroup(host, "construction");
  const assessed = await host.execute("finite_assess_plan_intake", intakeFromProfile(profile));
  assert(["INTAKE_FACTS_COMPLETE", "INTAKE_FACTS_COMPLETE_WITH_ASSUMPTIONS"].includes(assessed.code), JSON.stringify(assessed));
  await openGroup(host, "plan_management");
  return requireCode(await host.execute("finite_compile_intake_to_draft", {
    packetId: assessed.constructionPacket.packetId,
    expectedChecksum: assessed.constructionPacket.checksum,
  }), "PLAN_DRAFT_STAGED_FROM_INTAKE");
};

const applyPreference = async (host, runtime, changes, id) => {
  await openGroup(host, "planning");
  const feedback = requireCode(await host.execute("finite_record_feedback", { message: `Human preference reversal in ${id}: choose lived experience over the numerically cheapest route.`, kind: "taste", expectedRevision: runtime.kernel.revision }), "FEEDBACK_RECORDED");
  await openGroup(host, "decisions");
  const staged = requireCode(await host.execute("finite_stage_preference_change", { feedbackId: feedback.feedback.feedbackId, changes, expectedRevision: runtime.kernel.revision }), "PREFERENCE_CHANGE_STAGED");
  const confirmation = requireCode(runtime.kernel.humanConfirmPreferenceChange({ preferenceChangeId: staged.preferenceChange.preferenceChangeId }), "HUMAN_PREFERENCE_CONFIRMED");
  await openGroup(host, "decisions");
  requireCode(await host.execute("finite_apply_confirmed_preference_change", { preferenceChangeId: staged.preferenceChange.preferenceChangeId, confirmationId: confirmation.confirmation.confirmationId, expectedRevision: runtime.kernel.revision, idempotencyKey: `journey-pref-${id}` }), "PREFERENCE_CHANGE_APPLIED");
};

const prepareOptions = async (host, runtime, input) => {
  await openGroup(host, "planning");
  const recorded = requireCode(await host.execute("finite_record_change_event", { ...input, expectedRevision: runtime.kernel.revision }), "CHANGE_RECORDED");
  const compared = await host.execute("finite_compare_options", { eventId: recorded.event.eventId, generate: true });
  assert(["OPTIONS_AVAILABLE", "NO_VALID_OPTION"].includes(compared.code), JSON.stringify(compared));
  return { recorded, compared, valid: compared.options.find((option) => option.valid) ?? null };
};

const stageAndApply = async (host, runtime, candidate, id) => {
  await openGroup(host, "decisions");
  requireCode(await host.execute("finite_stage_option", { candidateId: candidate.candidateId, expectedRevision: runtime.kernel.revision }), "OPTION_STAGED");
  const approval = requireCode(await runtime.kernel.humanApprove({ candidateId: candidate.candidateId, warningsAcknowledged: candidate.warnings.map((warning) => String(warning.code)) }), "HUMAN_APPROVAL_RECORDED");
  await openGroup(host, "decisions");
  return requireCode(await host.execute("finite_apply_approved_option", { candidateId: candidate.candidateId, approvalId: approval.approval.approvalId, expectedRevision: runtime.kernel.revision, idempotencyKey: `journey-option-${id}` }), "OPTION_APPLIED");
};

const applyActualCorrection = async (host, runtime, spec) => {
  const actual = runtime.kernel.profile.actuals[0];
  if (!actual) return null;
  await openGroup(host, "decisions");
  const staged = requireCode(await host.execute("finite_stage_actual_correction", { actualId: actual.actualId, correctedAmountMinor: Math.max(0, actual.originalAmountMinor - 1_000), reason: "Late receipt reconciliation", evidenceRef: "evidence_actual", expectedRevision: runtime.kernel.revision }), "ACTUAL_CORRECTION_STAGED");
  const confirmation = requireCode(runtime.kernel.humanConfirmActualCorrection({ correctionId: staged.correction.correctionId }), "HUMAN_CORRECTION_CONFIRMED");
  await openGroup(host, "decisions");
  return requireCode(await host.execute("finite_apply_confirmed_actual_correction", { correctionId: staged.correction.correctionId, confirmationId: confirmation.confirmation.confirmationId, expectedRevision: runtime.kernel.revision, idempotencyKey: `journey-actual-${spec.id}` }), "ACTUAL_CORRECTION_APPLIED");
};

const applyAmendment = async (host, runtime, spec) => {
  await openGroup(host, "plan_management");
  const blueprint = requireCode(await host.execute("finite_get_amendment_blueprint"), "PLAN_AMENDMENT_BLUEPRINT");
  blueprint.profile.planId = `${runtime.kernel.profile.planId}_v2`;
  blueprint.profile.name = `${runtime.kernel.profile.name.slice(0, 103)} · revised`;
  blueprint.profile.surface.hero.title = `Scope revised after: ${spec.shock}`.slice(0, 180);
  const fromPlanId = runtime.kernel.profile.planId;
  const fromRevision = runtime.kernel.revision;
  const staged = requireCode(await host.execute("finite_stage_plan_amendment", { profile: blueprint.profile, supersedesPlanId: fromPlanId, expectedRevision: fromRevision }), "PLAN_AMENDMENT_STAGED");
  const confirmation = requireCode(runtime.humanConfirmPlanDraft({ draftId: staged.draft.draftId }), "HUMAN_PLAN_ACTIVATION_CONFIRMED");
  await openGroup(host, "plan_management");
  return requireCode(await host.execute("finite_activate_confirmed_plan", { draftId: staged.draft.draftId, confirmationId: confirmation.confirmation.confirmationId, expectedPlanId: fromPlanId, expectedRevision: fromRevision, idempotencyKey: `journey-amend-${spec.id}` }), "PLAN_AMENDMENT_ACTIVATED");
};

for (const [index, spec] of journeys.entries()) {
  test(`full journey ${index + 1}/12: ${spec.id}`, async () => {
    const profiles = await compileBuiltInProfiles();
    const storage = new MemoryStorage();
    const snapshotStore = new PlanSnapshotStore(storage);
    const catalogStore = new PlanCatalogStore(storage);
    const arrivals = new MemoryArrivalRepository(() => new Date(`2026-08-${String(1 + index).padStart(2, "0")}T10:00:00.000Z`));
    const runtime = new FinitePlanRuntime(profiles, snapshotStore, "travel", catalogStore);
    const host = new MemoryModelContext();
    await new FinitePlanWebMCPAdapter(host, runtime, undefined, arrivals).useStableDispatcher().register();

    // Human order → Codex interpretation → one material question → human review.
    await openGroup(host, "arrival");
    const created = requireCode(await host.execute("finite_create_arrival_order", { idempotencyKey: `journey-arrival-${spec.id}`, rawOutcome: spec.outcome, structured: { family: spec.family, finiteLimit: "fixed", finalStatus: spec.finalStatus } }), "ARRIVAL_ORDER_CREATED");
    const orderId = created.order.orderId;
    const detail = requireCode(await host.execute("finite_append_arrival_input", { orderId, expectedVersion: created.order.version, kind: "constraint", payload: { statement: "Do not invent external commitments or approval." } }), "ARRIVAL_INPUT_APPENDED");
    const incomplete = requireCode(await host.execute("finite_reconcile_arrival", { orderId, expectedVersion: detail.order.version, inferredFamily: spec.family, summary: spec.outcome, known: { outcome: spec.outcome }, inferred: { family: spec.family }, missing: [spec.boundary], contradictions: [], dependencies: [], savedOperatorWork: { stressCase: spec.shock }, nextHumanBoundary: { prompt: spec.boundary, answerKind: "text", fieldPaths: ["human_boundary"], choices: [] }, complete: false }), "ARRIVAL_RECONCILED");
    assert.equal(incomplete.order.status, "clarification_required");
    const answered = requireCode(await arrivals.appendInput({ orderId, expectedVersion: incomplete.order.version, kind: "answer", payload: { value: spec.answer }, sourceSurface: "site" }), "ARRIVAL_INPUT_APPENDED");
    const complete = requireCode(await host.execute("finite_reconcile_arrival", { orderId, expectedVersion: answered.order.version, inferredFamily: spec.family, summary: `${spec.outcome} Human boundary: ${spec.answer}`, known: { outcome: spec.outcome, humanBoundary: spec.answer }, inferred: { family: spec.family }, missing: [], contradictions: [], dependencies: [], savedOperatorWork: { stressCase: spec.shock }, nextHumanBoundary: null, complete: true }), "ARRIVAL_RECONCILED");
    const reviewed = requireCode(await arrivals.reviewInterpretation({ orderId, expectedVersion: complete.order.version, expectedChecksum: complete.order.checksum, sourceSurface: "site" }), "ARRIVAL_INTERPRETATION_REVIEWED");

    // Codex construction → optional human return → exact activation.
    let profile = makeProfile(spec);
    let staged = await compileArrivalBoundDraft(host, profile);
    assert.deepEqual(staged.draft.sourceArrival, undefined);
    assert.equal(runtime.pendingPlanDraft.sourceArrival.orderId, orderId);
    if (spec.returnDraft) {
      requireCode(await runtime.humanRejectPlanDraft({ draftId: staged.draft.draftId, reasonCode: "structure", reason: "This is too financially framed; show the living sequence and dependencies first." }), "HUMAN_PLAN_DRAFT_RETURNED");
      profile = structuredClone(profile);
      profile.surface.hero.title = `A living ${spec.family} plan, not a budget screen`;
      profile.surface.hero.brief = `Sequence, dependencies, decisions, and finite resources adapt together.`;
      profile.name = `Living ${spec.family} plan · ${spec.id.replaceAll("_", " ")}`;
      staged = await compileArrivalBoundDraft(host, profile);
    }
    const planConfirmation = requireCode(runtime.humanConfirmPlanDraft({ draftId: staged.draft.draftId }), "HUMAN_PLAN_ACTIVATION_CONFIRMED");
    await openGroup(host, "plan_management");
    const activated = requireCode(await host.execute("finite_activate_confirmed_plan", { draftId: staged.draft.draftId, confirmationId: planConfirmation.confirmation.confirmationId, expectedPlanId: "plan_travel_europe", expectedRevision: 1, idempotencyKey: `journey-activate-${spec.id}` }), "PLAN_ACTIVATED");
    assert.equal(activated.arrivalCompletion.code, "ARRIVAL_PLAN_ACCEPTED");
    assert.equal((await arrivals.open()).code, "ARRIVAL_NOT_FOUND");

    // Human preference reversal, one normal change, then stale work superseded by the last-minute shock.
    await applyPreference(host, runtime, spec.preference, spec.id);
    const first = await prepareOptions(host, runtime, { type: "scope_change", title: "A useful improvement is requested", costDeltaMinor: spec.family === "event" ? 8_000 : 18_000, daysDelta: 0, minimumBufferMinor: 10_000, evidenceRefs: [] });
    assert(first.valid);
    await stageAndApply(host, runtime, first.valid, `${spec.id}-normal`);

    const provisional = await prepareOptions(host, runtime, { type: "late_change", title: "A provisional late adjustment", costDeltaMinor: 10_000, daysDelta: 0, minimumBufferMinor: 5_000, evidenceRefs: [] });
    assert(provisional.valid);
    await openGroup(host, "decisions");
    requireCode(await host.execute("finite_stage_option", { candidateId: provisional.valid.candidateId, expectedRevision: runtime.kernel.revision }), "OPTION_STAGED");
    const stagedCandidateId = provisional.valid.candidateId;

    const impossible = await prepareOptions(host, runtime, { type: "unexpected_situation", title: spec.shock, costDeltaMinor: 900_000, daysDelta: spec.family === "renovation" ? 10 : 0, minimumBufferMinor: 20_000, evidenceRefs: ["evidence_current"] });
    assert.equal(impossible.valid, null, "The impossible shock must fail closed rather than manufacture viability.");
    await openGroup(host, "decisions");
    assert.equal((await host.execute("finite_stage_option", { candidateId: stagedCandidateId, expectedRevision: runtime.kernel.revision })).code, "CANDIDATE_NOT_FOUND");

    // The human changes scope instead of accepting the impossible plan; Codex records the bounded fallback.
    const fallback = await prepareOptions(host, runtime, { type: "scope_reduction", title: `${spec.shock} — bounded fallback chosen by the human`, costDeltaMinor: 12_000, daysDelta: 0, minimumBufferMinor: 5_000, evidenceRefs: [] });
    assert(fallback.valid);
    await stageAndApply(host, runtime, fallback.valid, `${spec.id}-fallback`);
    if (index % 2 === 0) await applyActualCorrection(host, runtime, spec);
    if (spec.amend) {
      await applyAmendment(host, runtime, spec);
      const postAmendment = await prepareOptions(host, runtime, { type: "post_amendment_check", title: "Re-test the revised scope against live truth", costDeltaMinor: 5_000, daysDelta: 0, minimumBufferMinor: 0, evidenceRefs: [] });
      assert(postAmendment.valid);
      await stageAndApply(host, runtime, postAmendment.valid, `${spec.id}-post-amendment`);
    }

    // Explicit conclusion → receipt → inactive guard → reload proof.
    await openGroup(host, "decisions");
    const lifecycle = requireCode(await host.execute("finite_stage_plan_lifecycle", { status: spec.finalStatus, reason: spec.conclusion, expectedRevision: runtime.kernel.revision }), "PLAN_LIFECYCLE_STAGED");
    const lifecycleConfirmation = requireCode(runtime.kernel.humanConfirmPlanLifecycle({ lifecycleChangeId: lifecycle.lifecycleChange.lifecycleChangeId }), "HUMAN_PLAN_LIFECYCLE_CONFIRMED");
    await openGroup(host, "decisions");
    const concluded = requireCode(await host.execute("finite_apply_confirmed_plan_lifecycle", { lifecycleChangeId: lifecycle.lifecycleChange.lifecycleChangeId, confirmationId: lifecycleConfirmation.confirmation.confirmationId, expectedRevision: runtime.kernel.revision, idempotencyKey: `journey-conclude-${spec.id}` }), "PLAN_LIFECYCLE_APPLIED");
    assert.equal(runtime.kernel.lifecycleStatus, spec.finalStatus);
    assert.equal(runtime.kernel.recordChangeEvent({ type: "human_one_more_thing", title: "Actually, one more thing", costDeltaMinor: 0, minimumBufferMinor: 0, expectedRevision: runtime.kernel.revision }).code, "PLAN_NOT_ACTIVE");
    const entered = requireCode(await host.execute("finite_enter_kitchen", { entryIntent: "continue_current", expectedPlanId: runtime.kernel.profile.planId, expectedPlanRevision: runtime.kernel.revision }), "KITCHEN_ENTERED");
    assert.equal(entered.operatorPacket.nextAction.stage, "plan_inactive");
    assert.equal(entered.operatorPacket.nextAction.requiresHuman, true);

    await openGroup(host, "evidence");
    const exported = requireCode(await host.execute("finite_export_plan_receipt", { receiptId: concluded.receipt.receiptId }), "PORTABLE_EXPORT");
    assert.equal(await runtime.kernel.verifyExport(exported.portable), true);

    const activePlanId = runtime.kernel.profile.planId;
    const catalogEntries = await compileCatalogEntries(catalogStore.load(), catalogStore.loadActivationReceipts());
    const reloaded = new FinitePlanRuntime(profiles, snapshotStore, activePlanId, catalogStore, catalogEntries);
    assert.equal(reloaded.kernel.lifecycleStatus, spec.finalStatus);
    assert.equal(reloaded.kernel.revision, runtime.kernel.revision);
    assert.equal(reloaded.kernel.receipts.at(-1).receiptType, "plan_lifecycle");
    assert.equal(reloaded.kernel.accepted.spentMinor + reloaded.kernel.accepted.committedMinor + reloaded.kernel.accepted.forecastMinor + reloaded.kernel.accepted.bufferMinor, reloaded.kernel.accepted.totalBudgetMinor);
    assert.equal(reviewed.order.status, "interpretation_confirmed");
  });
}
