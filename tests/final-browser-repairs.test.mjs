import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { starterPlanForArrival } from "../dist-test/src/arrival-presentation.js";
import { statedInterviewPartner } from "../dist-test/src/plan-title.js";
import { shouldBootstrapLocalDemo } from "../dist-test/src/experience-route.js";
import { compileSurfaceManifest } from "../dist-test/src/surface.js";
import { compileBuiltInProfiles } from "../dist-test/src/profiles.js";
import { FinitePlanKernel } from "../dist-test/src/kernel.js";
import { MemoryStorage, PlanSnapshotStore } from "../dist-test/src/persistence.js";

const order = (rawOutcome) => ({
  orderVersion: "finite-arrival-order.v1", orderId: "arrival_final_qc", version: 1,
  status: "waiting_for_codex", rawOutcome, structured: { planningMode: "codex" },
  attachments: [], pendingClarification: null, inputs: [], interpretation: null,
  lastOperatorCheckpoint: 0, createdAt: "2026-09-04T00:00:00.000Z", updatedAt: "2026-09-04T00:00:00.000Z", checksum: "a".repeat(64),
});
const items = (plan, section) => plan.sections.find((item) => item.sectionId === section).items;

for (const [party, count] of [["two adults", 2], ["2 adults", 2], ["two adults and two children", 4], ["three travellers", 3]]) {
  test(`travel starter preserves stated party: ${party}`, () => {
    const plan = starterPlanForArrival(order(`Plan a weekend trip to Hobart for ${party} from 20 to 22 November 2026 with an AUD 2,800 budget.`));
    const flight = items(plan, "transport").find((item) => item.fields.to === "Hobart");
    assert.equal(Number(flight.fields.cost), 250 * count);
    assert.match(flight.fields.notes, new RegExp(`for ${count} travellers`));
    assert(items(plan, "people").some((item) => item.fields.role === `${count} travellers`));
  });
}

test("interview duration text is not a company and all seven prep days remain visible", () => {
  const brief = "Prepare for an operations lead interview on 25 November 2026, with seven days of preparation, 30 minutes per day, and no spending. Include STAR examples and mock questions.";
  const plan = starterPlanForArrival(order(brief));
  assert.equal(statedInterviewPartner(brief), null);
  assert.equal(statedInterviewPartner("Interview with the COO on 25 November 2026."), "COO");
  assert.doesNotMatch(plan.title, /seven days of preparation interview/);
  const sessions = items(plan, "schedule").filter((item) => /^Preparation day/.test(item.label));
  assert.equal(sessions.length, 7);
  assert.equal(sessions[0].fields.start, "2026-11-18");
  assert(sessions.every((item) => item.fields.notes.includes("30 minutes per day as requested")));
  assert.equal(plan.overview.start, "2026-11-18");
  assert.equal(plan.overview.end, "2026-11-25");
  assert(!items(plan, "schedule").some((item) => item.label === "Interview with seven days of preparation"));
  assert.doesNotMatch(JSON.stringify(plan.sections), /the COO|video interview/i);
  assert(items(plan, "scope").some((item) => item.fields.notes.includes("format to confirm") && item.source === "open"));
});

test("daily practice preserves seven sessions rather than a three-session template", () => {
  const plan = starterPlanForArrival(order("Practise Spanish for 15 minutes every day for four weeks, using resources I already have and no spending. Track vocabulary and listening."));
  const weeks = items(plan, "schedule").filter((item) => /^Week/.test(item.label));
  assert.equal(weeks.length, 4);
  assert(weeks.every((item) => item.fields.notes.includes("7 × 15-minute sessions")));
  assert.doesNotMatch(JSON.stringify(plan.sections), /three weekly|three repeatable/i);
});

test("kitchen renovation does not inherit office work and preserves exact contingency", () => {
  const plan = starterPlanForArrival(order("Kitchen renovation from 2 to 20 November 2026 with an AUD 9,500 budget. Keep existing plumbing and protect AUD 1,000 contingency. Plan supplier quotes, dependencies and installation."));
  assert.equal(plan.family, "renovation");
  assert.equal(plan.overview.start, "2026-11-02");
  assert.equal(plan.overview.end, "2026-11-20");
  assert.doesNotMatch(JSON.stringify(plan.sections), /desk|home office|weekend DIY/i);
  assert(items(plan, "requirements").some((item) => item.label === "Keep existing plumbing" && item.source === "request"));
  const costs = items(plan, "money").filter((item) => item.fields.moneyRole === "cost");
  assert.equal(Number(costs.find((item) => item.label === "Contingency").fields.amount), 1000);
  assert.equal(costs.reduce((sum, item) => sum + Number(item.fields.amount), 0), 9500);
});

test("remembered unsigned demo Settings and draft resume do not fall into sign-in", () => {
  assert.equal(shouldBootstrapLocalDemo({ pathname: "/", startMode: "resume", collaborationToken: null, localDemoResume: true }), true);
  assert.equal(shouldBootstrapLocalDemo({ pathname: "/", startMode: "arrival-active", collaborationToken: null, localDemoResume: true }), true);
  assert.equal(shouldBootstrapLocalDemo({ pathname: "/", startMode: "arrival-active", collaborationToken: null, localDemoResume: false }), false);
  assert.equal(shouldBootstrapLocalDemo({ pathname: "/", startMode: "resume", collaborationToken: null, localDemoResume: false }), false);
  assert.equal(shouldBootstrapLocalDemo({ pathname: "/", startMode: "fresh", collaborationToken: null, localDemoResume: true }), false);
  assert.equal(shouldBootstrapLocalDemo({ pathname: "/collaborate/test", startMode: "resume", collaborationToken: "test", localDemoResume: true }), false);
});

test("the header exposes the waiting draft even from an accepted plan and binds resume", () => {
  const main = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
  assert.match(main, /const draft = arrivalResult.ok && isWaitingArrivalStatus/);
  assert.match(main, /option value="\$\{draftPlanChoice\}"/);
  assert.match(main, /planId === draftPlanChoice\) \{ void resumeCurrentWork\(\)/);
  assert.match(main, /File uploads are unavailable in local Demo mode/);
});

test("all Spotlight choices project accepted stays and retire unverified ranges after reload", async () => {
  const profile = (await compileBuiltInProfiles()).get("travel");
  for (const objective of ["balanced", "preserve_comfort", "preserve_experience", "preserve_schedule", "preserve_buffer"]) {
    const store = new PlanSnapshotStore(new MemoryStorage());
    const kernel = new FinitePlanKernel(profile, store);
    const event = kernel.recordChangeEvent({ type: "intent_change", title: "Add three nights in Paris", costDeltaMinor: 66000, daysDelta: 3, minimumBufferMinor: 50000, evidenceRefs: ["evidence_current"], entityChanges: [{ entityId: "trip_days", field: "days", delta: 3 }, { entityId: "booked_segment_days", field: "days", delta: 3 }], expectedRevision: 1 });
    const options = await kernel.compareOptions({ eventId: event.event.eventId, generate: true });
    const chosen = options.options.find((item) => item.objective === objective);
    const staged = await kernel.stageOption({ candidateId: chosen.candidateId, expectedRevision: 1 });
    const approval = await kernel.humanApprove({ candidateId: chosen.candidateId, warningsAcknowledged: staged.staged.warnings.map((warning) => String(warning.code)) });
    const command = { candidateId: chosen.candidateId, approvalId: approval.approval.approvalId, expectedRevision: 1, idempotencyKey: `qc-stages-${objective}` };
    assert.equal((await kernel.applyApprovedOption(command)).code, "OPTION_APPLIED");
    assert.equal((await kernel.applyApprovedOption(command)).code, "IDEMPOTENT_REPLAY");
    const reloaded = new FinitePlanKernel(profile, store);
    for (const current of [kernel, reloaded]) {
      const manifest = await compileSurfaceManifest(profile, current);
      assert.match(manifest.stages.find((stage) => stage.stageId === "paris").detail, /^7 nights/);
      assert.match(manifest.stages.find((stage) => stage.stageId === "netherlands").detail, chosen.moveIds.includes("shorten_netherlands") ? /^2 nights/ : /^4 nights/);
      assert(manifest.stages.every((stage) => stage.marker === "Timing to reconcile"));
      assert.equal(current.entities.trip_days.values.days, 21);
      assert.equal(current.revision, 2);
      assert.equal(current.receipts.length, 1);
    }
  }
});
