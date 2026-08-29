import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { MemoryAcceptedTruthRepository } from "../dist-test/src/accepted-truth.js";
import { MemoryArrivalRepository } from "../dist-test/src/arrival.js";
import { MemoryConstructionPacketRepository } from "../dist-test/src/construction-packet.js";
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

class RegistrationLifecycleModelContext extends MemoryModelContext {
  activeRegistrations = 0;
  peakRegistrations = 0;
  registrationCalls = 0;
  registerTool(tool, options = {}) {
    this.registrationCalls += 1;
    this.activeRegistrations += 1;
    this.peakRegistrations = Math.max(this.peakRegistrations, this.activeRegistrations);
    let active = true;
    options.signal?.addEventListener("abort", () => {
      if (!active) return;
      active = false;
      this.activeRegistrations -= 1;
      this.tools.delete(tool.name);
    }, { once: true });
    this.tools.set(tool.name, tool);
  }
}

class DeferredUnregistrationModelContext extends MemoryModelContext {
  activeRegistrations = 0;
  peakRegistrations = 0;
  registerTool(tool, options = {}) {
    this.activeRegistrations += 1;
    this.peakRegistrations = Math.max(this.peakRegistrations, this.activeRegistrations);
    let active = true;
    options.signal?.addEventListener("abort", () => {
      setTimeout(() => {
        if (!active) return;
        active = false;
        this.activeRegistrations -= 1;
        this.tools.delete(tool.name);
      }, 0);
    }, { once: true });
    this.tools.set(tool.name, tool);
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

test("disposing and hot-replacing an adapter removes every adapter-owned registration", async () => {
  const profiles = await compileBuiltInProfiles();
  const runtime = new FinitePlanRuntime(profiles, new PlanSnapshotStore(new MemoryStorage()), "travel");
  const host = new RegistrationLifecycleModelContext();
  const first = new FinitePlanWebMCPAdapter(host, runtime, undefined, new MemoryArrivalRepository());
  await first.register();
  assert(host.activeRegistrations > 0);
  first.dispose();
  assert.equal(host.activeRegistrations, 0);
  assert.equal(host.tools.size, 0);

  const second = new FinitePlanWebMCPAdapter(host, runtime, undefined, new MemoryArrivalRepository());
  await second.register();
  assert.equal(host.activeRegistrations, second.inventory().length);
  second.dispose();
  assert.equal(host.activeRegistrations, 0);
});

test("route swaps drain deferred browser unregistrations before advertising the replacement", async () => {
  const profiles = await compileBuiltInProfiles();
  const runtime = new FinitePlanRuntime(profiles, new PlanSnapshotStore(new MemoryStorage()), "travel");
  const host = new DeferredUnregistrationModelContext();
  const adapter = new FinitePlanWebMCPAdapter(host, runtime, undefined, new MemoryArrivalRepository());
  await adapter.register();
  for (const group of ["planning", "planning", "planning", "evidence", "evidence", "planning", "decisions", "decisions", "continuity", "planning"]) {
    await host.execute("finite_open_toolset", { group });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(host.activeRegistrations, adapter.inventory().length);
    assert(host.activeRegistrations <= 20, `${group} left ${host.activeRegistrations} active registrations`);
  }
  assert(host.peakRegistrations <= 20, `route transitions peaked at ${host.peakRegistrations} registrations`);
  adapter.dispose();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(host.activeRegistrations, 0);
});

test("the production dispatcher keeps one fixed browser registry across long multi-family routes", async () => {
  const profiles = await compileBuiltInProfiles();
  const runtime = new FinitePlanRuntime(profiles, new PlanSnapshotStore(new MemoryStorage()), "travel");
  const host = new RegistrationLifecycleModelContext();
  const adapter = new FinitePlanWebMCPAdapter(host, runtime, undefined, new MemoryArrivalRepository()).useStableDispatcher();
  await adapter.register();
  const fixedInventory = adapter.inventory();
  const initialRegistrationCalls = host.registrationCalls;
  assert(host.tools.has("finite_invoke"));
  assert.equal(host.tools.has("finite_record_change_event"), false);
  assert(fixedInventory.length <= 6);
  for (let pass = 0; pass < 12; pass += 1) {
    for (const group of groups) {
      const opened = await host.execute("finite_open_toolset", { group });
      assert.equal(opened.code, "TOOLSET_READY");
      assert.equal(opened.group, group);
      assert(opened.actionNames.length > 0);
      assert.deepEqual(adapter.inventory(), fixedInventory);
      assert.equal(host.registrationCalls, initialRegistrationCalls);
      assert.equal(host.activeRegistrations, fixedInventory.length);
    }
  }
  await host.execute("finite_open_toolset", { group: "planning" });
  const state = await host.execute("finite_invoke", { action: "finite_get_plan_state", arguments: { selectors: ["identity"] } });
  assert.equal(state.code, "PLAN_STATE");
  assert.equal(state.dispatchedAction, "finite_get_plan_state");
  const missing = await host.execute("finite_invoke", { action: "finite_record_change_event", arguments: { title: "No typed event may run" } });
  assert.equal(missing.code, "INVALID_ACTION_ARGUMENTS");
  assert(missing.issues.some((issue) => issue.path === "$/expectedRevision" && issue.code === "REQUIRED"));
  const coerced = await host.execute("finite_invoke", { action: "finite_record_change_event", arguments: { type: "intent_change", title: "No coercion", costDeltaMinor: "1000", minimumBufferMinor: 0, expectedRevision: 1 } });
  assert.equal(coerced.code, "INVALID_ACTION_ARGUMENTS");
  assert(coerced.issues.some((issue) => issue.path === "$/costDeltaMinor" && issue.code === "TYPE_MISMATCH"));
  const extra = await host.execute("finite_invoke", { action: "finite_get_plan_state", arguments: { selectors: ["identity"], approvalId: "fabricated" } });
  assert.equal(extra.code, "INVALID_ACTION_ARGUMENTS");
  assert(extra.issues.some((issue) => issue.path === "$/approvalId" && issue.code === "UNKNOWN_PROPERTY"));
  const blocked = await host.execute("finite_invoke", { action: "finite_create_arrival_order", arguments: { idempotencyKey: "wrong-group-0001", rawOutcome: "Should not run" } });
  assert.equal(blocked.code, "ACTION_NOT_AVAILABLE");
  assert.equal(runtime.kernel.revision, 1);
});

test("an impossible option search keeps Codex in planning for a bounded fallback", async () => {
  const profiles = await compileBuiltInProfiles();
  const runtime = new FinitePlanRuntime(profiles, new PlanSnapshotStore(new MemoryStorage()), "travel");
  const host = new MemoryModelContext();
  const adapter = new FinitePlanWebMCPAdapter(host, runtime, undefined, new MemoryArrivalRepository());
  await adapter.register();
  await host.execute("finite_open_toolset", { group: "planning" });
  const recorded = await host.execute("finite_record_change_event", {
    type: "unexpected_situation",
    title: "Impossible late shock",
    costDeltaMinor: 9_000_000,
    daysDelta: 0,
    minimumBufferMinor: 50_000,
    evidenceRefs: [],
    assumptions: [],
    entityChanges: [],
    expectedRevision: 1,
  });
  const compared = await host.execute("finite_compare_options", { eventId: recorded.event.eventId, generate: true });
  assert.equal(compared.code, "NO_VALID_OPTION");
  await adapter.waitForRouteSettlement();
  const recovery = await host.execute("finite_enter_kitchen", { entryIntent: "continue_current", expectedPlanId: runtime.kernel.profile.planId, expectedPlanRevision: 1 });
  const recoveryAction = recovery.nextAction ?? recovery.operatorPacket.nextAction;
  assert.equal(recoveryAction.stage, "no_valid_option");
  assert.equal(recoveryAction.requiresHuman, true);
  assert.match(recoveryAction.exactQuestion, /What may move/);
  assert(host.tools.has("finite_record_change_event"));
  assert.equal(host.tools.has("finite_create_arrival_order"), false);
});

test("the page-start proxy carries semantic metadata and forwards host cancellation", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  for (const parameter of ["entryIntent", "orderId", "sinceVersion", "expectedOrderVersion", "expectedOrderChecksum", "expectedPlanId", "expectedPlanRevision", "expectedProfileHash", "expectedSnapshotHash"]) {
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
  assert.equal(typeof entered.identity.profileHash, "string");
  assert.equal(Object.hasOwn(entered.detail, "availablePaths"), false);
  assert.equal(Object.hasOwn(entered.detail, "pathCount"), false);
  assert.match(entered.detail.resultRef, /^[a-f0-9]{64}$/);
  assert(entered.detail.totalCharacters > WEBMCP_OUTPUT_CHARACTER_BUDGET);
  assert.equal(entered.detail.format, "semantic_paths");
  const manifest = await host.execute("finite_read_result", { resultRef: entered.detail.resultRef });
  assert.equal(manifest.code, "RESULT_DETAIL_MANIFEST");
  assert.equal(manifest.fullHash, entered.detail.fullHash);
  assert(JSON.stringify(manifest).length <= WEBMCP_OUTPUT_CHARACTER_BUDGET);
  assert(manifest.availablePaths.includes("/operatorPacket/nextAction"));
  const selected = await host.execute("finite_read_result", { resultRef: entered.detail.resultRef, paths: ["/operatorPacket/nextAction"] });
  assert.equal(selected.code, "RESULT_DETAIL_SELECTED");
  assert.equal(selected.fullHash, entered.detail.fullHash);
  assert.equal(selected.values[0].path, "/operatorPacket/nextAction");
  assert.match(selected.selectionHash, /^[a-f0-9]{64}$/);
  assert(JSON.stringify(selected).length <= WEBMCP_OUTPUT_CHARACTER_BUDGET);
  const tooLarge = await host.execute("finite_read_result", { resultRef: entered.detail.resultRef, paths: ["/operatorPacket"] });
  assert.equal(tooLarge.code, "RESULT_DETAIL_SELECTION_TOO_LARGE");
  assert(tooLarge.narrowerPaths.length > 0);
  const missing = await host.execute("finite_read_result", { resultRef: "0".repeat(64) });
  assert.equal(missing.code, "RESULT_DETAIL_NOT_FOUND");
});

test("bounded kitchen entry preserves a resumable human-change cursor", async () => {
  const profiles = await compileBuiltInProfiles();
  const runtime = new FinitePlanRuntime(profiles, new PlanSnapshotStore(new MemoryStorage()), "travel");
  const arrivals = new MemoryArrivalRepository();
  let current = await arrivals.create({ idempotencyKey: "bounded-human-delta-0001", rawOutcome: "Plan a detailed dinner.", structured: { planningMode: "codex" }, sourceSurface: "site" });
  for (let index = 0; index < 5; index += 1) current = await arrivals.appendInput({ orderId: current.order.orderId, expectedVersion: current.order.version, kind: "answer", payload: { workspaceOperation: "question_answer", moduleId: "schedule", questionId: `schedule_question_${index + 1}`, question: `Question ${index + 1}`, answer: `${"Detailed answer ".repeat(30)}${index + 1}` }, sourceSurface: "site" });
  const host = new MemoryModelContext();
  await new FinitePlanWebMCPAdapter(host, runtime, undefined, arrivals).useBoundedOutputs().register();
  const entered = await host.execute("finite_enter_kitchen", { orderId: current.order.orderId, sinceVersion: 0 });
  assert(JSON.stringify(entered).length <= WEBMCP_OUTPUT_CHARACTER_BUDGET);
  assert.equal(entered.humanChanges.returnedCount, 3);
  assert.equal(entered.humanChanges.hasMore, true);
  assert.equal(entered.humanChanges.nextSinceVersion, 3);
  assert.match(entered.humanChanges.changes.at(-1).answer, /…$/);
  assert.equal(entered.humanChanges.exactBasePath, "/operatorPacket/humanChanges/changes");
  const exactPath = `${entered.humanChanges.exactBasePath}/${entered.humanChanges.changes.at(-1).exactIndex}`;
  const exact = await host.execute("finite_read_result", { resultRef: entered.detail.resultRef, paths: [exactPath] });
  assert.equal(exact.code, "RESULT_DETAIL_SELECTED");
  assert.match(exact.values[0].value.answer, /Detailed answer Detailed answer/);
});

test("every response in a production change-to-commit route stays inside the output budget", async () => {
  const profiles = await compileBuiltInProfiles();
  const runtime = new FinitePlanRuntime(profiles, new PlanSnapshotStore(new MemoryStorage()), "travel");
  const host = new MemoryModelContext();
  const adapter = new FinitePlanWebMCPAdapter(host, runtime, undefined, new MemoryArrivalRepository()).useBoundedOutputs();
  await adapter.register();
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
  await adapter.waitForRouteSettlement();
  const staged = await host.execute("finite_stage_option", { candidateId: chosen.candidateId, expectedRevision: 1 });
  responses.push(staged);
  assert.equal(staged.code, "OPTION_STAGED");
  const approval = await runtime.kernel.humanApprove({ candidateId: chosen.candidateId });
  const authorized = await host.execute("finite_enter_kitchen", { entryIntent: "continue_current" });
  responses.push(authorized);
  assert.equal(authorized.nextAction.nextTool, "finite_apply_approved_option");
  await adapter.waitForRouteSettlement();
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

test("an in-flight host cancellation reaches arrival I/O and forces canonical re-read", async () => {
  class AbortAwareArrival extends MemoryArrivalRepository {
    openCalls = 0;
    signalSeen = false;
    started;
    resolveStarted;
    constructor() {
      super();
      this.started = new Promise((resolve) => { this.resolveStarted = resolve; });
    }
    async open(input = {}, context = {}) {
      this.openCalls += 1;
      if (!context.signal) return { ok: false, code: "ARRIVAL_NOT_FOUND", acceptedStateChanged: false };
      this.signalSeen = true;
      this.resolveStarted();
      return new Promise((resolve, reject) => {
        if (context.signal.aborted) return reject(new DOMException("Interrupted", "AbortError"));
        context.signal.addEventListener("abort", () => reject(new DOMException("Interrupted", "AbortError")), { once: true });
      });
    }
  }
  const profiles = await compileBuiltInProfiles();
  const runtime = new FinitePlanRuntime(profiles, new PlanSnapshotStore(new MemoryStorage()), "travel");
  const host = new MemoryModelContext();
  const arrival = new AbortAwareArrival();
  await new FinitePlanWebMCPAdapter(host, runtime, undefined, arrival).useBoundedOutputs().register();
  const controller = new AbortController();
  const pending = host.execute("finite_enter_kitchen", { entryIntent: "continue_current" }, { signal: controller.signal });
  await arrival.started;
  controller.abort("operator stopped");
  const result = await pending;
  assert.equal(result.code, "TOOL_CANCELLED_OUTCOME_UNKNOWN");
  assert.equal(result.acceptedStateChanged, false);
  assert.equal(arrival.signalSeen, true);
  assert.equal(arrival.openCalls, 2);
  assert.equal(runtime.kernel.revision, 1);
});

test("an interrupted accepted-truth commit rolls back locally and reports unknown outcome", async () => {
  class AbortCommitRepository extends MemoryAcceptedTruthRepository {
    signalSeen = false;
    async commit(input, context = {}) {
      if (!context.signal) return super.commit(input);
      this.signalSeen = true;
      return new Promise((resolve, reject) => {
        if (context.signal.aborted) return reject(new DOMException("Interrupted", "AbortError"));
        context.signal.addEventListener("abort", () => reject(new DOMException("Interrupted", "AbortError")), { once: true });
      });
    }
  }
  const profiles = await compileBuiltInProfiles();
  const repository = new AbortCommitRepository();
  const runtime = new FinitePlanRuntime(profiles, new PlanSnapshotStore(new MemoryStorage()), "travel", undefined, [], () => new Date("2026-08-27T00:00:00.000Z"), repository);
  assert.equal((await runtime.hydrateAcceptedTruth()).code, "ACCEPTED_TRUTH_INITIALIZED");
  const host = new MemoryModelContext();
  const adapter = new FinitePlanWebMCPAdapter(host, runtime, undefined, new MemoryArrivalRepository()).useBoundedOutputs();
  await adapter.register();
  await host.execute("finite_open_toolset", { group: "planning" });
  const recorded = await host.execute("travel_extend_stay", { destination: "Paris", nights: 2, nightlyMinor: 20_000, minimumBufferMinor: 50_000 });
  const compared = await host.execute("finite_compare_options", { eventId: recorded.event.eventId, generate: true });
  const chosen = compared.options.find((option) => option.valid);
  await adapter.waitForRouteSettlement();
  await host.execute("finite_stage_option", { candidateId: chosen.candidateId, expectedRevision: 1 });
  const approved = await runtime.kernel.humanApprove({ candidateId: chosen.candidateId });
  await host.execute("finite_enter_kitchen", { entryIntent: "continue_current" });
  await adapter.waitForRouteSettlement();
  const controller = new AbortController();
  const pending = host.execute("finite_apply_approved_option", { candidateId: chosen.candidateId, approvalId: approved.approval.approvalId, expectedRevision: 1, idempotencyKey: "cancelled-accepted-commit-0001" }, { signal: controller.signal });
  await new Promise((resolve) => setTimeout(resolve, 0));
  controller.abort("operator stopped");
  const result = await pending;
  assert.equal(result.code, "TOOL_CANCELLED_OUTCOME_UNKNOWN");
  assert.equal(result.acceptedStateChanged, false);
  assert.equal(repository.signalSeen, true);
  assert.equal(runtime.kernel.revision, 1);
  assert(runtime.kernel.stagedCandidate);
  assert(runtime.kernel.approval);
});

test("an in-flight cancellation reaches construction persistence without resurrecting work", async () => {
  class AbortConstructionRepository extends MemoryConstructionPacketRepository {
    signalSeen = false;
    async load(context = {}) {
      if (!context.signal) return super.load();
      this.signalSeen = true;
      return new Promise((resolve, reject) => {
        if (context.signal.aborted) return reject(new DOMException("Interrupted", "AbortError"));
        context.signal.addEventListener("abort", () => reject(new DOMException("Interrupted", "AbortError")), { once: true });
      });
    }
  }
  const profiles = await compileBuiltInProfiles();
  const construction = new AbortConstructionRepository();
  const runtime = new FinitePlanRuntime(profiles, new PlanSnapshotStore(new MemoryStorage()), "travel", undefined, [], () => new Date("2026-08-27T00:00:00.000Z"), undefined, construction);
  const host = new MemoryModelContext();
  await new FinitePlanWebMCPAdapter(host, runtime, undefined, new MemoryArrivalRepository()).useBoundedOutputs().register();
  await host.execute("finite_open_toolset", { group: "construction" });
  const controller = new AbortController();
  const pending = host.execute("finite_get_construction_packet", {}, { signal: controller.signal });
  await new Promise((resolve) => setTimeout(resolve, 0));
  controller.abort("operator stopped");
  const result = await pending;
  assert.equal(result.code, "TOOL_CANCELLED_OUTCOME_UNKNOWN");
  assert.equal(result.acceptedStateChanged, false);
  assert.equal(construction.signalSeen, true);
  assert.equal(runtime.pendingPlanDraft, null);
  assert.equal(runtime.kernel.revision, 1);
});
