import test from "node:test";
import assert from "node:assert/strict";
import { MemoryStorage, PlanSnapshotStore } from "../dist-test/src/persistence.js";
import { compileBuiltInProfiles } from "../dist-test/src/profiles.js";
import { FinitePlanRuntime } from "../dist-test/src/runtime.js";
import { FinitePlanWebMCPAdapter, humanOnlyActions } from "../dist-test/src/webmcp.js";

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

test("production adapter normalizes host input, excludes authority, and replaces contextual tools", async () => {
  const profiles = await compileBuiltInProfiles();
  const runtime = new FinitePlanRuntime(profiles, new PlanSnapshotStore(new MemoryStorage()), "travel");
  const host = new MemoryModelContext();
  const adapter = new FinitePlanWebMCPAdapter(host, runtime);
  const inventory = await adapter.register();
  assert.equal(inventory.length, 39);
  assert.equal(inventory.filter((name) => name.startsWith("finite_")).length, 36);
  assert(inventory.includes("travel_extend_stay"));
  assert.equal(inventory.some((name) => humanOnlyActions.includes(name)), false);
  assert.equal((await host.execute("finite_get_capabilities", {})).ok, true);
  assert.equal((await host.execute("finite_get_capabilities", "{}")).ok, true);
  assert.equal((await host.execute("finite_get_plan_state", "{bad-json")).code, "INVALID_TOOL_INPUT");
  const extension = await host.execute("travel_extend_stay", JSON.stringify({ destination: "Paris", nights: 2, nightlyMinor: 18_000, minimumBufferMinor: 50_000 }));
  assert.equal(extension.code, "CHANGE_RECORDED");
  assert.equal(extension.event.entityChanges.length, 2);
  const switched = await host.execute("finite_switch_profile", JSON.stringify({ profileId: "renovation" }));
  assert.equal(switched.code, "PROFILE_SWITCHED");
  assert.equal([...host.tools].some(([name]) => name.startsWith("travel_")), false);
  assert(host.tools.has("renovation_replace_material"));
  assert.equal(host.tools.size, 39);
});
