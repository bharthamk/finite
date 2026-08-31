import test from "node:test";
import assert from "node:assert/strict";
import { assessExternalAction, currencyContract, currencyContractFor, externalActionStatuses, groupDecisionContract, humanRealityPolicy } from "../dist-test/src/operator-policy.js";

test("the human-reality contract covers every audited human failure mode exactly once", () => {
  assert.deepEqual(humanRealityPolicy.map((rule) => rule.auditId), Array.from({ length: 24 }, (_, index) => index + 31));
  assert.equal(new Set(humanRealityPolicy.map((rule) => rule.signal)).size, 24);
  assert(humanRealityPolicy.every((rule) => rule.action.length > 30));
});

test("the release has one explicit AUD minor-unit contract and never implies conversion", () => {
  assert.equal(currencyContract.code, "AUD");
  assert.equal(currencyContract.minorUnit, 100);
  assert.match(currencyContract.scope, /new immutable plan version/i);
  assert.match(currencyContract.scope, /never inferred/i);
});

test("each accepted plan exposes its own immutable base-currency contract", () => {
  const nzd = currencyContractFor("NZD");
  assert.equal(nzd.code, "NZD");
  assert.equal(nzd.minorUnit, 100);
  assert.match(nzd.scope, /one NZD ledger/i);
  assert.match(nzd.scope, /conversion is never inferred/i);
});

test("external action state cannot be promoted from fluent planning language", () => {
  assert.deepEqual(externalActionStatuses, ["researched", "quoted", "held", "booked", "paid", "verified", "cancelled"]);
  const researched = assessExternalAction({ actionId: "flight", label: "the flight", status: "researched" }, () => false);
  assert.equal(researched.code, "EXTERNAL_ACTION_STATE_SUPPORTED");
  const quoted = assessExternalAction({ actionId: "flight", label: "the flight", status: "quoted" }, () => false);
  assert.equal(quoted.code, "EXTERNAL_ACTION_STATE_UNPROVEN");
  assert.equal(quoted.missingInputs[0].argument, "evidenceRef");
  const inferredBooking = assessExternalAction({ actionId: "flight", label: "the flight", status: "booked", evidenceRef: "evidence_quote" }, () => true);
  assert.equal(inferredBooking.code, "EXTERNAL_ACTION_STATE_UNPROVEN");
  assert.equal(inferredBooking.missingInputs[0].argument, "humanAttested");
  const attestedBooking = assessExternalAction({ actionId: "flight", label: "the flight", status: "booked", evidenceRef: "evidence_quote", humanAttested: true }, () => true);
  assert.equal(attestedBooking.code, "EXTERNAL_ACTION_STATE_SUPPORTED");
  assert.equal(attestedBooking.acceptedStateChanged, false);
});

test("group plans preserve disagreement instead of averaging people into one preference", () => {
  assert.match(groupDecisionContract.law, /not one averaged consumer/i);
  assert.deepEqual(groupDecisionContract.requiredBeforeAuthority, ["participants", "named_positions", "unresolved_conflicts", "selected_protocol"]);
  assert(groupDecisionContract.allowedProtocols.includes("named_decider"));
});
