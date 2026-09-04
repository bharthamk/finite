import test from "node:test";
import assert from "node:assert/strict";
import { isWaitingArrivalStatus, selectExperienceSurface, shouldBootstrapLocalDemo, shouldLoadDurablePlanData, shouldOpenEntryGateway } from "../dist-test/src/experience-route.js";

test("explicit guided-demo routes always enter the browser-local product", () => {
  for (const startMode of ["live-demo", "demo-active", "spotlight-active", "explore-demo"]) {
    assert.equal(shouldBootstrapLocalDemo({ pathname: "/", startMode, collaborationToken: null, localDemoResume: false }), true);
  }
});

test("a remembered local demo resumes only on the unqualified root", () => {
  assert.equal(shouldBootstrapLocalDemo({ pathname: "/", startMode: null, collaborationToken: null, localDemoResume: true }), true);
  assert.equal(shouldBootstrapLocalDemo({ pathname: "/", startMode: "fresh", collaborationToken: null, localDemoResume: true }), false);
  assert.equal(shouldBootstrapLocalDemo({ pathname: "/collaborate/invite-1", startMode: null, collaborationToken: "invite-1", localDemoResume: true }), false);
  assert.equal(shouldBootstrapLocalDemo({ pathname: "/anything", startMode: null, collaborationToken: null, localDemoResume: true }), false);
});

test("server-backed secondary data loads only for known durable plans", () => {
  const durable = new Set(["saved-plan"]);
  assert.equal(shouldLoadDurablePlanData({ localDemoMode: false, planId: "new-plan", persistedPlanIds: durable }), false);
  assert.equal(shouldLoadDurablePlanData({ localDemoMode: false, planId: "saved-plan", persistedPlanIds: durable }), true);
  assert.equal(shouldLoadDurablePlanData({ localDemoMode: true, planId: "new-plan", persistedPlanIds: durable }), true);
});

test("the bare root is always the durable front door", () => {
  assert.equal(shouldOpenEntryGateway({ entryGatewayOpen: false, hasExplicitWorkingSurface: false }), true);
  assert.equal(shouldOpenEntryGateway({ entryGatewayOpen: true, hasExplicitWorkingSurface: true }), true);
});

test("an explicit resume or plan route bypasses the front door", () => {
  assert.equal(shouldOpenEntryGateway({ entryGatewayOpen: false, hasExplicitWorkingSurface: true }), false);
});

test("a first-time tenant with no arrival stays on the order surface", () => {
  assert.equal(selectExperienceSurface({ labMode: false, kitchenMode: false, hasArrival: false, hasActivatedPlan: false }), "arrival");
});

test("a waiting arrival outranks an existing accepted plan", () => {
  assert.equal(selectExperienceSurface({ labMode: false, kitchenMode: false, hasArrival: true, hasActivatedPlan: true }), "arrival");
});

test("after arrival activation closes the order, the human lands on the accepted plan", () => {
  assert.equal(selectExperienceSurface({ labMode: false, kitchenMode: false, hasArrival: false, hasActivatedPlan: true }), "plan");
  assert.equal(isWaitingArrivalStatus("accepted"), false);
  assert.equal(isWaitingArrivalStatus("closed"), false);
  assert.equal(isWaitingArrivalStatus("interpretation_confirmed"), true);
});

test("explicit kitchen and lab routes always open the plan surface", () => {
  assert.equal(selectExperienceSurface({ labMode: false, kitchenMode: true, hasArrival: true, hasActivatedPlan: false }), "plan");
  assert.equal(selectExperienceSurface({ labMode: true, kitchenMode: false, hasArrival: true, hasActivatedPlan: false }), "plan");
});
