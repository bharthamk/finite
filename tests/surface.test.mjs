import test from "node:test";
import assert from "node:assert/strict";
import { FinitePlanKernel } from "../dist-test/src/kernel.js";
import { compileBuiltInProfiles } from "../dist-test/src/profiles.js";
import { compileSurfaceManifest, resolveSurfaceBinding, SurfaceValidationError } from "../dist-test/src/surface.js";

const manifests = async () => {
  const profiles = await compileBuiltInProfiles();
  return Promise.all([...profiles.values()].map(async (profile) => {
    const kernel = new FinitePlanKernel(profile);
    return [profile.profileId, profile, kernel, await compileSurfaceManifest(profile, kernel)];
  }));
};

test("surface compiler produces genuinely different profile projections on one grammar", async () => {
  const entries = await manifests();
  const byId = Object.fromEntries(entries.map(([profileId, profile, kernel, manifest]) => [profileId, { profile, kernel, manifest }]));
  assert.equal(byId.travel.manifest.timeModel, "calendar");
  assert.equal(byId.renovation.manifest.timeModel, "phases");
  assert.equal(byId.event.manifest.timeModel, "run_of_show");
  assert(byId.travel.manifest.zones.some((zone) => zone.component === "timeline_lane"));
  assert(byId.renovation.manifest.zones.some((zone) => zone.component === "phase_lane"));
  assert(byId.event.manifest.zones.some((zone) => zone.component === "run_of_show"));
  assert.notDeepEqual(byId.travel.manifest.stages.map((stage) => stage.label), byId.renovation.manifest.stages.map((stage) => stage.label));
  assert.notDeepEqual(byId.renovation.manifest.summaryFields.map((field) => field.label), byId.event.manifest.summaryFields.map((field) => field.label));
  assert(byId.travel.manifest.availableActions.includes("travel_extend_stay"));
  assert(!byId.travel.manifest.availableActions.includes("event_change_headcount"));
  for (const { kernel, manifest } of Object.values(byId)) {
    assert.match(manifest.manifestHash, /^[a-f0-9]{64}$/);
    for (const binding of manifest.summaryFields) assert.notEqual(resolveSurfaceBinding(kernel, binding), undefined);
  }
});

test("surface intent is revision-bound and cannot hide mandatory controls or inject grammar", async () => {
  const profiles = await compileBuiltInProfiles();
  const profile = profiles.get("travel");
  assert(profile);
  const kernel = new FinitePlanKernel(profile);
  const baseIntent = { planRevision: 1, decisionFocus: "Paris extension", emphasizedMeasures: [], requestedZones: [], collapsedZones: [], rationale: "Put the decision first." };
  await assert.rejects(() => compileSurfaceManifest(profile, kernel, { ...baseIntent, planRevision: 99 }), SurfaceValidationError);
  await assert.rejects(() => compileSurfaceManifest(profile, kernel, { ...baseIntent, requestedZones: ["invented_widget"] }), SurfaceValidationError);
  await assert.rejects(() => compileSurfaceManifest(profile, kernel, { ...baseIntent, decisionFocus: "<script>take over</script>" }), SurfaceValidationError);
  await assert.rejects(() => compileSurfaceManifest(profile, kernel, { ...baseIntent, collapsedZones: ["finite_summary"] }), SurfaceValidationError);
});

test("staging forces comparison and approval zones into every surface", async () => {
  const profiles = await compileBuiltInProfiles();
  for (const profile of profiles.values()) {
    const kernel = new FinitePlanKernel(profile);
    const event = kernel.recordChangeEvent({ type: "fixture_change", title: "Surface decision", costDeltaMinor: profile.profileId === "general" ? 0 : 10_000, daysDelta: 0, minimumBufferMinor: 0, evidenceRefs: ["evidence_current"], expectedRevision: 1 });
    const simulation = await kernel.simulateReallocation({ eventId: event.event.eventId, moveIds: [], objective: "custom" });
    assert.equal(simulation.candidate.valid, true);
    await kernel.stageOption({ candidateId: simulation.candidate.candidateId, expectedRevision: 1 });
    const manifest = await compileSurfaceManifest(profile, kernel);
    assert(manifest.zones.some((zone) => zone.component === "option_compare"));
    assert(manifest.zones.some((zone) => zone.component === "approval_panel" && zone.required));
    await assert.rejects(() => compileSurfaceManifest(profile, kernel, { planRevision: 1, decisionFocus: "Decision", emphasizedMeasures: [], requestedZones: [], collapsedZones: ["approval_panel"], rationale: "Hide it" }), SurfaceValidationError);
  }
});
