import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { MemoryArrivalRepository } from "../dist-test/src/arrival.js";
import { MemoryStorage, PlanSnapshotStore } from "../dist-test/src/persistence.js";
import { compileBuiltInProfiles } from "../dist-test/src/profiles.js";
import { FinitePlanRuntime } from "../dist-test/src/runtime.js";
import { FinitePlanWebMCPAdapter, WEBMCP_OUTPUT_CHARACTER_BUDGET } from "../dist-test/src/webmcp.js";

class MemoryModelContext {
  tools = new Map();
  registerTool(tool, options = {}) {
    this.tools.set(tool.name, tool);
    options.signal?.addEventListener("abort", () => this.tools.delete(tool.name), { once: true });
  }
  async execute(name, input = {}, context = {}) {
    return this.tools.get(name)?.execute(input, context) ?? { ok: false, code: "TOOL_NOT_FOUND" };
  }
}

const groups = ["arrival", "construction", "planning", "decisions", "evidence", "continuity", "plan_management"];

const collectProperties = (schema, path = "") => {
  if (!schema || typeof schema !== "object") return [];
  const found = [];
  for (const [name, property] of Object.entries(schema.properties ?? {})) {
    found.push({ name, path: path ? `${path}.${name}` : name, property });
    found.push(...collectProperties(property, path ? `${path}.${name}` : name));
    if (property?.items) found.push(...collectProperties(property.items, `${path ? `${path}.` : ""}${name}[]`));
  }
  if (schema.items) found.push(...collectProperties(schema.items, `${path}[]`));
  return found;
};

test("advertised WebMCP metadata stays inside current discovery budgets", async () => {
  const profiles = await compileBuiltInProfiles();
  const runtime = new FinitePlanRuntime(profiles, new PlanSnapshotStore(new MemoryStorage()), "travel");
  const host = new MemoryModelContext();
  await new FinitePlanWebMCPAdapter(host, runtime, undefined, new MemoryArrivalRepository()).register();
  const definitions = new Map();
  for (const group of groups) {
    await host.execute("finite_open_toolset", { group });
    for (const [name, tool] of host.tools) definitions.set(name, tool);
    assert(host.tools.size <= 20, `${group} advertised ${host.tools.size} tools`);
  }
  assert(definitions.size >= 50);
  for (const [name, tool] of definitions) {
    assert(name.length <= 30, `${name} exceeds the 30-character discovery budget`);
    assert(tool.description.length > 0 && tool.description.length <= 500, `${name} has an invalid tool description length`);
    for (const { name: parameterName, path, property } of collectProperties(tool.inputSchema)) {
      assert(parameterName.length <= 30, `${name}.${path} exceeds the 30-character parameter-name budget`);
      assert(typeof property.description === "string" && property.description.length > 0, `${name}.${path} has no semantic description`);
      assert(property.description.length <= 150, `${name}.${path} exceeds the 150-character parameter-description budget`);
      assert.equal(property.description.startsWith("Value for "), false, `${name}.${path} still has fallback metadata`);
    }
  }
});

test("the page-start proxy carries semantic metadata and forwards host cancellation", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  for (const parameter of ["entryIntent", "orderId", "expectedOrderVersion", "expectedOrderChecksum", "expectedPlanId", "expectedPlanRevision", "expectedProfileHash", "expectedSnapshotHash"]) {
    assert.match(html, new RegExp(`${parameter}: \\{[^}]+description:`), `${parameter} has no bootstrap description`);
  }
  assert.match(html, /execute: async \(input = \{\}, context = \{\}\)/);
  assert.match(html, /context\.signal\?\.aborted/);
  assert.match(html, /window\.finiteEnterKitchen\(input, context\)/);
});

test("production WebMCP responses are bounded, content-addressed, and recoverable", async () => {
  const profiles = await compileBuiltInProfiles();
  const runtime = new FinitePlanRuntime(profiles, new PlanSnapshotStore(new MemoryStorage()), "travel");
  const host = new MemoryModelContext();
  const adapter = new FinitePlanWebMCPAdapter(host, runtime, undefined, new MemoryArrivalRepository()).useBoundedOutputs();
  await adapter.register();
  const entered = await host.execute("finite_enter_kitchen", { entryIntent: "continue_current", expectedPlanId: runtime.kernel.profile.planId, expectedPlanRevision: runtime.kernel.revision });
  assert.equal(entered.code, "KITCHEN_ENTERED");
  assert(JSON.stringify(entered).length <= WEBMCP_OUTPUT_CHARACTER_BUDGET);
  assert.equal(entered.identity.planId, runtime.kernel.profile.planId);
  assert.equal(entered.nextAction.stage, "menu_ready");
  assert.match(entered.detail.resultRef, /^[a-f0-9]{64}$/);
  assert(entered.detail.totalCharacters > WEBMCP_OUTPUT_CHARACTER_BUDGET);
  const firstPage = await host.execute("finite_read_result", { resultRef: entered.detail.resultRef });
  assert.equal(firstPage.code, "RESULT_DETAIL_PAGE");
  assert(JSON.stringify(firstPage).length <= WEBMCP_OUTPUT_CHARACTER_BUDGET);
  assert.equal(firstPage.cursor, 0);
  assert.equal(typeof firstPage.nextCursor, "number");
  assert.match(firstPage.chunkHash, /^[a-f0-9]{64}$/);
  const missing = await host.execute("finite_read_result", { resultRef: "0".repeat(64) });
  assert.equal(missing.code, "RESULT_DETAIL_NOT_FOUND");
});

test("every response in a production change-to-commit route stays inside the output budget", async () => {
  const profiles = await compileBuiltInProfiles();
  const runtime = new FinitePlanRuntime(profiles, new PlanSnapshotStore(new MemoryStorage()), "travel");
  const host = new MemoryModelContext();
  await new FinitePlanWebMCPAdapter(host, runtime, undefined, new MemoryArrivalRepository()).useBoundedOutputs().register();
  const responses = [];
  responses.push(await host.execute("finite_enter_kitchen", { entryIntent: "continue_current" }));
  responses.push(await host.execute("finite_open_toolset", { group: "planning" }));
  const recorded = await host.execute("travel_extend_stay", { destination: "Paris", nights: 3, nightlyMinor: 22_000, minimumBufferMinor: 50_000 });
  responses.push(recorded);
  assert.match(recorded.event.eventId, /^event_/);
  const compared = await host.execute("finite_compare_options", { eventId: recorded.event.eventId, generate: true });
  responses.push(compared);
  const chosen = compared.options.find((option) => option.valid);
  assert(chosen);
  const staged = await host.execute("finite_stage_option", { candidateId: chosen.candidateId, expectedRevision: 1 });
  responses.push(staged);
  assert.equal(staged.code, "OPTION_STAGED");
  const approval = await runtime.kernel.humanApprove({ candidateId: chosen.candidateId });
  const authorized = await host.execute("finite_enter_kitchen", { entryIntent: "continue_current" });
  responses.push(authorized);
  assert.equal(authorized.nextAction.nextTool, "finite_apply_approved_option");
  const applied = await host.execute("finite_apply_approved_option", {
    candidateId: chosen.candidateId,
    approvalId: approval.approval.approvalId,
    expectedRevision: 1,
    idempotencyKey: "bounded-production-route-0001",
  });
  responses.push(applied);
  assert.equal(applied.code, "OPTION_APPLIED");
  assert.equal(runtime.kernel.revision, 2);
  for (const response of responses) assert(JSON.stringify(response).length <= WEBMCP_OUTPUT_CHARACTER_BUDGET, `${response.code} exceeded the output budget`);
});

test("a pre-cancelled WebMCP execution performs no operation", async () => {
  const profiles = await compileBuiltInProfiles();
  const runtime = new FinitePlanRuntime(profiles, new PlanSnapshotStore(new MemoryStorage()), "travel");
  const host = new MemoryModelContext();
  await new FinitePlanWebMCPAdapter(host, runtime, undefined, new MemoryArrivalRepository()).register();
  const controller = new AbortController();
  controller.abort();
  const result = await host.execute("finite_enter_kitchen", { entryIntent: "continue_current" }, { signal: controller.signal });
  assert.equal(result.code, "TOOL_CANCELLED");
  assert.equal(result.acceptedStateChanged, false);
});
