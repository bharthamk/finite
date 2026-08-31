import test from "node:test";
import assert from "node:assert/strict";
import { planFactChangeSummary, planInputChangeSummary, workspaceChangeSummary } from "../dist-test/src/change-summary.js";

test("budget summaries expose the resulting total, allocation and non-conversion boundary", () => {
  const summary = workspaceChangeSummary({ workspaceOperation: "overview", fields: { totalBudget: "2600", currency: "NZD" } }, { message: "Saved.", currency: "NZD", previousCurrency: "AUD", moneyState: "positive", totalBudget: 2600, allocated: 2400 });
  assert.match(summary.title, /Budget updated across this plan/);
  assert.match(summary.detail, /NZD\s*2,600/);
  assert.match(summary.impacts.join(" "), /NZD\s*2,400/);
  assert.match(summary.impacts.join(" "), /NZD\s*200/);
  assert.match(summary.impacts.join(" "), /did not perform an exchange conversion/i);
});

test("plan input summaries name the exact surface and protect unrelated truth", () => {
  const summary = planInputChangeSummary({ editing: false, sectionLabel: "Timeline", contextLabel: "Saturday", kind: "Update" });
  assert.equal(summary.title, "Update added to the plan.");
  assert.match(summary.detail, /Timeline · Saturday/);
  assert.match(summary.impacts.join(" "), /Budget, dates, people, and real-world status were not changed/);
});

test("accepted plan fact summaries show before, after and resulting availability", () => {
  const summary = planFactChangeSummary({ changes: [{ label: "Total budget", before: 240000, after: 260000, format: "money" }], currency: "AUD", availableMinor: 20000 });
  assert.match(summary.detail, /AUD\s*2,400 → AUD\s*2,600/);
  assert.match(summary.impacts[0], /AUD\s*200/);
});

test("an undecided budget remains unknown instead of becoming a zero-dollar claim", () => {
  const summary = workspaceChangeSummary({ workspaceOperation: "overview", fields: { totalBudget: "", moneyState: "unknown" } }, { message: "Saved.", currency: "AUD", moneyState: "unknown", totalBudget: 0, allocated: 0 });
  assert.equal(summary.title, "Budget left open.");
  assert.match(summary.detail, /No total has been decided/);
  assert.doesNotMatch(summary.detail, /0/);
});

test("invalid calendar dates degrade to a readable label", () => {
  const summary = workspaceChangeSummary({ workspaceOperation: "overview", fields: { start: "2026-02-31" } }, { message: "Saved.", start: "2026-02-31", end: "2026-02-31" });
  assert.match(summary.detail, /Not set/);
});
