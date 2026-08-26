import test from "node:test";
import assert from "node:assert/strict";
import { MemoryArrivalRepository } from "../dist-test/src/arrival.js";
import { MemoryStorage, PlanSnapshotStore } from "../dist-test/src/persistence.js";
import { compileBuiltInProfiles } from "../dist-test/src/profiles.js";
import { FinitePlanRuntime } from "../dist-test/src/runtime.js";
import { FinitePlanWebMCPAdapter, humanOnlyActions, registerFiniteWebMCPStatus } from "../dist-test/src/webmcp.js";

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

test("page-start status prevents an empty registry without exposing kitchen state", async () => {
  const host = new MemoryModelContext();
  const readiness = { state: "initializing" };
  await registerFiniteWebMCPStatus(host, () => readiness);
  assert.deepEqual([...host.tools.keys()], ["finite_webmcp_status"]);
  const initializing = await host.execute("finite_webmcp_status", {});
  assert.equal(initializing.code, "WEBMCP_INITIALIZING");
  assert.equal("plan" in initializing, false);
  readiness.state = "ready";
  readiness.inventory = ["finite_enter_kitchen", "finite_get_chef_menu"];
  const ready = await host.execute("finite_webmcp_status", {});
  assert.equal(ready.code, "WEBMCP_READY");
  assert.deepEqual(ready.inventory, readiness.inventory);
});

test("the page-start entry proxy stays registered while the adapter supplies its canonical operation", async () => {
  const profiles = await compileBuiltInProfiles();
  const runtime = new FinitePlanRuntime(profiles, new PlanSnapshotStore(new MemoryStorage()), "travel");
  const host = new MemoryModelContext();
  const bootstrapProxy = { name: "finite_enter_kitchen", execute: async () => ({ ok: false, code: "BOOTSTRAP_PROXY" }) };
  await host.registerTool(bootstrapProxy);
  const adapter = new FinitePlanWebMCPAdapter(host, runtime, undefined, new MemoryArrivalRepository(), true);
  const inventory = await adapter.register();
  assert.equal(host.tools.get("finite_enter_kitchen"), bootstrapProxy);
  assert.equal(inventory.includes("finite_enter_kitchen"), true);
  const entered = await adapter.enterKitchen({ entryIntent: "start_new" });
  assert.equal(entered.code, "KITCHEN_ENTERED");
  assert.equal(entered.operatorPacket.nextAction.stage, "outcome_required");
  assert.equal(entered.operationProof.toolName, "finite_enter_kitchen");
});

test("production adapter normalizes host input, excludes authority, and replaces contextual tools", async () => {
  const profiles = await compileBuiltInProfiles();
  const runtime = new FinitePlanRuntime(profiles, new PlanSnapshotStore(new MemoryStorage()), "travel");
  const host = new MemoryModelContext();
  const adapter = new FinitePlanWebMCPAdapter(host, runtime);
  const inventory = await adapter.register();
  assert.equal(inventory.length, 12);
  assert.equal(inventory.every((name) => name.startsWith("finite_")), true);
  assert.equal(inventory.includes("travel_extend_stay"), false);
  assert.equal(inventory.some((name) => humanOnlyActions.includes(name)), false);
  assert.equal((await host.execute("finite_get_capabilities", {})).ok, true);
  assert.equal((await host.execute("finite_get_capabilities", "{}")).ok, true);
  const planning = await host.execute("finite_open_toolset", { group: "planning" });
  assert.equal(planning.code, "TOOLSET_READY");
  assert.equal(planning.group, "planning");
  assert(planning.advertisedTools.includes("travel_extend_stay"));
  assert(planning.advertisedTools.length <= 20);
  assert.equal((await host.execute("finite_get_plan_state", "{bad-json")).code, "INVALID_TOOL_INPUT");
  const extension = await host.execute("travel_extend_stay", JSON.stringify({ destination: "Paris", nights: 2, nightlyMinor: 18_000, minimumBufferMinor: 50_000 }));
  assert.equal(extension.code, "CHANGE_RECORDED");
  assert.equal(extension.event.entityChanges.length, 2);
  const switched = await host.execute("finite_switch_profile", JSON.stringify({ profileId: "renovation" }));
  assert.equal(switched.code, "PROFILE_SWITCHED");
  assert.equal([...host.tools].some(([name]) => name.startsWith("travel_")), false);
  assert(host.tools.has("renovation_replace_material"));
  assert(host.tools.size <= 20);
});
