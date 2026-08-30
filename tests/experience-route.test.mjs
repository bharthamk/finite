import test from "node:test";
import assert from "node:assert/strict";
import { isWaitingArrivalStatus, selectExperienceSurface, shouldOpenEntryGateway } from "../dist-test/src/experience-route.js";

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
