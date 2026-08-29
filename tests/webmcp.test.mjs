import test from "node:test";
import assert from "node:assert/strict";
import { MemoryArrivalRepository } from "../dist-test/src/arrival.js";
import { sha256 } from "../dist-test/src/crypto.js";
import { MemoryStorage, PlanSnapshotStore } from "../dist-test/src/persistence.js";
import { compileBuiltInProfiles } from "../dist-test/src/profiles.js";
import { FinitePlanRuntime } from "../dist-test/src/runtime.js";
import { FinitePlanWebMCPAdapter, humanOnlyActions, registerFiniteWebMCPStatus } from "../dist-test/src/webmcp.js";
import { builtInThemes, themeCoreTokenKeys } from "../dist-test/src/theme.js";
import { builtInSkins } from "../dist-test/src/skin.js";

class MemoryModelContext {
  tools = new Map();
  registerTool(tool, options = {}) {
    this.tools.set(tool.name, tool);
    options.signal?.addEventListener("abort", () => this.tools.delete(tool.name), { once: true });
  }
  async execute(name, input, context = {}) {
    return this.tools.get(name)?.execute(input, context) ?? { ok: false, code: "TOOL_NOT_FOUND" };
  }
}

class LegacyCancellationHost {
  tools = new Map();
  registerTool(tool, options = {}) {
    const registration = { tool, signal: options.signal };
    this.tools.set(tool.name, registration);
    options.signal?.addEventListener("abort", () => {
      if (this.tools.get(tool.name) === registration) this.tools.delete(tool.name);
    }, { once: true });
  }
  async execute(name, input, context = {}) {
    const registration = this.tools.get(name);
    if (!registration) return { ok: false, code: "TOOL_NOT_FOUND" };
    const execution = Promise.resolve(registration.tool.execute(input, context));
    if (!registration.signal) return execution;
    const unregistered = new Promise((resolve) => registration.signal.addEventListener("abort", () => resolve({ ok: false, code: "LEGACY_REGISTRATION_ABORTED", acceptedStateChanged: false }), { once: true }));
    return Promise.race([execution, unregistered]);
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

test("kitchen entry prioritises new human source material without asking for another permission", async () => {
  const profiles = await compileBuiltInProfiles();
  const runtime = new FinitePlanRuntime(profiles, new PlanSnapshotStore(new MemoryStorage()), "travel");
  const host = new MemoryModelContext();
  const attachment = {
    attachmentId: "attachment_human_notes",
    planId: runtime.kernel.profile.planId,
    planRevision: runtime.kernel.revision,
    section: "general",
    contextId: "stage_first",
    contextLabel: "First priority",
    kind: "file",
    label: "notes.txt",
    noteText: null,
    linkUrl: null,
    fileName: "notes.txt",
    contentType: "text/plain",
    sizeBytes: 120,
    contentUrl: "/api/plan-work/attachments/attachment_human_notes/content",
    sourceSurface: "site",
    attachmentRole: "source",
    processingStatus: "unread",
    processingSummary: null,
    derivedRefs: [],
    processedBy: null,
    processedAt: null,
    createdAt: "2026-08-30T00:00:00.000Z",
    updatedAt: "2026-08-30T00:00:00.000Z",
    baseCurrent: true,
  };
  const planWork = {
    list: async () => ({ ok: true, code: "PLAN_WORK_LISTED", checklist: [], attachments: [attachment], acceptedStateChanged: false }),
    readAttachment: async () => ({ ok: true, code: "PLAN_ATTACHMENT_READ", attachment, contentMode: "text", content: "x".repeat(600), offset: 0, nextOffset: null, truncated: false, acceptedStateChanged: false }),
  };
  const adapter = new FinitePlanWebMCPAdapter(host, runtime, undefined, new MemoryArrivalRepository(), false, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, planWork);
  await adapter.register();
  const entered = await adapter.enterKitchen({ entryIntent: "continue_current" });
  assert.equal(entered.operatorPacket.nextAction.stage, "plan_attachment_unread");
  assert.equal(entered.operatorPacket.nextAction.nextTool, "finite_read_plan_attachment");
  assert.deepEqual(entered.operatorPacket.nextAction.missingInputs, []);
  assert.equal(entered.operatorPacket.planWork.unreadSourceCount, 1);
  assert.equal(entered.operatorPacket.chefMenu.items[0].title, "Process notes.txt");
  assert.equal(entered.operatorPacket.preMutationGate.sameSiteAttachmentProcessingRequiresConfirmation, false);
  assert.equal((await host.execute("finite_open_toolset", { group: "execution" })).code, "TOOLSET_READY");
  adapter.useBoundedOutputs();
  const read = await host.execute("finite_read_plan_attachment", { attachmentId: attachment.attachmentId, planId: attachment.planId });
  assert.equal(read.nextAction.nextTool, "finite_set_plan_attachment_processing");
  assert.equal(read.nextAction.requiresHuman, false);
  assert.equal(read.nextAction.knownArgsComplete, false);
  assert.equal(read.content, null);
  const exactContent = await host.execute("finite_read_result", { resultRef: read.contentInResultDetail.resultRef, paths: ["/content"] });
  assert.equal(exactContent.values[0].value.length, 600);
  assert.equal(JSON.stringify(read).length <= 1500, true);
});

test("production adapter normalizes host input, excludes authority, and replaces contextual tools", async () => {
  const profiles = await compileBuiltInProfiles();
  const runtime = new FinitePlanRuntime(profiles, new PlanSnapshotStore(new MemoryStorage()), "travel");
  const host = new MemoryModelContext();
  const adapter = new FinitePlanWebMCPAdapter(host, runtime);
  const inventory = await adapter.register();
  assert.equal(inventory.length, 11);
  assert.equal(inventory.every((name) => name.startsWith("finite_")), true);
  assert.equal(inventory.includes("travel_extend_stay"), false);
  assert.equal(inventory.some((name) => humanOnlyActions.includes(name)), false);
  assert.equal((await host.execute("finite_get_capabilities", {})).ok, true);
  assert.equal((await host.execute("finite_get_capabilities", "{}")).ok, true);
  const planning = await host.execute("finite_open_toolset", { group: "planning" });
  assert.equal(planning.code, "TOOLSET_READY");
  assert.equal(planning.group, "planning");
  assert(planning.advertisedTools.includes("finite_save_workspace_option"));
  assert(planning.advertisedTools.includes("travel_extend_stay"));
  assert(planning.advertisedTools.length <= 20);
  assert.equal((await host.execute("finite_get_plan_state", "{bad-json")).code, "INVALID_TOOL_INPUT");
  const extension = await host.execute("travel_extend_stay", JSON.stringify({ destination: "Paris", nights: 2, nightlyMinor: 18_000, minimumBufferMinor: 50_000 }));
  assert.equal(extension.code, "CHANGE_RECORDED");
  assert.equal(extension.event.entityChanges.length, 2);
  const switched = await host.execute("finite_switch_profile", JSON.stringify({ profileId: "renovation", expectedCurrentPlanId: runtime.kernel.profile.planId, expectedCurrentRevision: runtime.kernel.revision }));
  assert.equal(switched.code, "PROFILE_SWITCHED");
  await adapter.waitForRouteSettlement();
  assert.equal([...host.tools].some(([name]) => name.startsWith("travel_")), false);
  assert(host.tools.has("renovation_replace_material"));
  assert(host.tools.size <= 20);
});

test("route replacement waits until the triggering response survives legacy unregister cancellation", async () => {
  const profiles = await compileBuiltInProfiles();
  const runtime = new FinitePlanRuntime(profiles, new PlanSnapshotStore(new MemoryStorage()), "travel");
  const host = new LegacyCancellationHost();
  const adapter = new FinitePlanWebMCPAdapter(host, runtime, undefined, new MemoryArrivalRepository());
  await adapter.register();
  assert.equal((await host.execute("finite_open_toolset", { group: "planning" })).code, "TOOLSET_READY");
  const switched = await host.execute("finite_switch_profile", { profileId: "renovation", expectedCurrentPlanId: runtime.kernel.profile.planId, expectedCurrentRevision: runtime.kernel.revision });
  assert.equal(switched.code, "PROFILE_SWITCHED");
  assert.notEqual(switched.code, "LEGACY_REGISTRATION_ABORTED");
  await adapter.waitForRouteSettlement();
  assert.equal([...host.tools.keys()].some((name) => name.startsWith("travel_")), false);
  assert.equal(host.tools.has("renovation_replace_material"), true);
});

test("chef-effort receipt measures discovery, first action, semantic recovery, cancellation, and route changes", async () => {
  const profiles = await compileBuiltInProfiles();
  const runtime = new FinitePlanRuntime(profiles, new PlanSnapshotStore(new MemoryStorage()), "travel");
  const host = new MemoryModelContext();
  const adapter = new FinitePlanWebMCPAdapter(host, runtime, undefined, new MemoryArrivalRepository()).useBoundedOutputs();
  await adapter.register();
  const entered = await host.execute("finite_enter_kitchen", { entryIntent: "continue_current" });
  await adapter.waitForRouteSettlement();
  assert.equal((await host.execute("finite_open_toolset", { group: "planning" })).code, "TOOLSET_READY");
  assert.equal((await host.execute("travel_extend_stay", { destination: "Paris", nights: 1, nightlyMinor: 10_000, minimumBufferMinor: 0 })).code, "CHANGE_RECORDED");
  await adapter.waitForRouteSettlement();
  assert.equal((await host.execute("finite_read_result", { resultRef: entered.detail.resultRef })).code, "RESULT_DETAIL_MANIFEST");
  assert.equal((await host.execute("finite_read_result", { resultRef: entered.detail.resultRef, paths: ["/operatorPacket/nextAction"] })).code, "RESULT_DETAIL_SELECTED");
  const controller = new AbortController();
  controller.abort();
  assert.equal((await host.execute("finite_enter_kitchen", { entryIntent: "continue_current" }, { signal: controller.signal })).code, "TOOL_CANCELLED");
  assert.equal((await host.execute("finite_open_toolset", { group: "continuity" })).code, "TOOLSET_READY");
  assert.equal(host.tools.has("finite_get_effort_receipt"), true);
  const receipt = await host.execute("finite_get_effort_receipt", {});
  assert.equal(receipt.code, "CHEF_EFFORT_RECEIPT");
  assert.equal(receipt.metrics.callsToFirstUsefulAction, 3);
  assert.equal(receipt.metrics.semanticManifestReads, 1);
  assert.equal(receipt.metrics.semanticDetailSelections, 1);
  assert.equal(receipt.metrics.cancellationOutcomes, 1);
  assert.equal(receipt.metrics.routeChanges >= 1, true);
  assert.equal(receipt.metrics.registryRefreshes >= 4, true);
  assert.equal(receipt.metrics.maxAdvertisedTools <= 20, true);
  assert.equal(receipt.metrics.currentAdvertisedTools <= 20, true);
  assert.equal(receipt.metrics.tokenMeasure, "host_owned_unavailable");
  assert.equal(receipt.receiptHash, await sha256({ receiptVersion: receipt.receiptVersion, scope: receipt.scope, metrics: receipt.metrics }));
});

test("authority-only tools appear after human authority and remain for exact receipt replay", async () => {
  const profiles = await compileBuiltInProfiles();
  const runtime = new FinitePlanRuntime(profiles, new PlanSnapshotStore(new MemoryStorage()), "travel");
  const host = new MemoryModelContext();
  const adapter = new FinitePlanWebMCPAdapter(host, runtime, undefined, new MemoryArrivalRepository());
  await adapter.register();
  await host.execute("finite_open_toolset", { group: "planning" });
  assert.equal(host.tools.has("finite_apply_approved_option"), false);
  const recorded = await host.execute("travel_extend_stay", { destination: "Paris", nights: 1, nightlyMinor: 10_000, minimumBufferMinor: 0 });
  assert.equal(recorded.code, "CHANGE_RECORDED");
  assert.equal(recorded.operatorContinuation.nextAction.stage, "change_recorded");
  assert.equal(recorded.chefEffort.toolCalls >= 2, true);
  assert.equal(recorded.chefEffort.tokenMeasure, "host_owned_unavailable");
  const compared = await host.execute("finite_compare_options", { eventId: recorded.event.eventId, generate: true });
  const candidate = compared.options.find((option) => option.valid);
  await host.execute("finite_open_toolset", { group: "decisions" });
  const staged = await host.execute("finite_stage_option", { candidateId: candidate.candidateId, expectedRevision: 1 });
  assert.equal(staged.code, "OPTION_STAGED");
  assert.equal(host.tools.has("finite_apply_approved_option"), false);
  const approved = await runtime.kernel.humanApprove({ candidateId: candidate.candidateId, warningsAcknowledged: candidate.warnings.map((warning) => warning.code) });
  await host.execute("finite_open_toolset", { group: "decisions" });
  assert.equal(host.tools.has("finite_apply_approved_option"), true);
  const input = { candidateId: candidate.candidateId, approvalId: approved.approval.approvalId, expectedRevision: 1, idempotencyKey: "authority-discovery-0001" };
  const applied = await host.execute("finite_apply_approved_option", input);
  assert.equal(applied.code, "OPTION_APPLIED");
  await adapter.waitForRouteSettlement();
  assert.equal(host.tools.has("finite_apply_approved_option"), true);
  assert.equal((await host.execute("finite_apply_approved_option", input)).code, "IDEMPOTENT_REPLAY");
});

test("context switches require the exact current plan guard and return a checksum receipt", async () => {
  const profiles = await compileBuiltInProfiles();
  const runtime = new FinitePlanRuntime(profiles, new PlanSnapshotStore(new MemoryStorage()), "travel");
  const host = new MemoryModelContext();
  await new FinitePlanWebMCPAdapter(host, runtime, undefined, new MemoryArrivalRepository()).register();
  await host.execute("finite_open_toolset", { group: "planning" });
  const stale = await host.execute("finite_switch_profile", { profileId: "event", expectedCurrentPlanId: "wrong", expectedCurrentRevision: 1 });
  assert.equal(stale.code, "PLAN_SWITCH_GUARD_MISMATCH");
  assert.equal(runtime.kernel.profile.profileId, "travel");
  const switched = await host.execute("finite_switch_profile", { profileId: "event", expectedCurrentPlanId: runtime.kernel.profile.planId, expectedCurrentRevision: runtime.kernel.revision });
  assert.equal(switched.code, "PROFILE_SWITCHED");
  assert.match(switched.contextReceipt.receiptHash, /^[a-f0-9]{64}$/);
  assert.equal(switched.contextReceipt.from.planId, "plan_travel_europe");
  assert.equal(switched.contextReceipt.to.planId, "plan_event_launch");
});

test("Codex can preview and execute the same guarded kitchen reset only after exact human confirmation", async () => {
  const profiles = await compileBuiltInProfiles();
  const runtime = new FinitePlanRuntime(profiles, new PlanSnapshotStore(new MemoryStorage()), "travel");
  const host = new MemoryModelContext();
  const calls = [];
  const reset = {
    preview: async () => ({ ok: true, code: "KITCHEN_RESET_PREVIEW", confirmation: "START OVER", counts: { plan_heads: 3 }, totalRecords: 3, acceptedStateChanged: false }),
    reset: async (input) => {
      calls.push(input);
      return { ok: true, code: "KITCHEN_RESET", receipt: { receiptVersion: "finite-kitchen-reset.v1", resetId: "reset_test", clearedAt: "2026-08-27T00:00:00.000Z", sourceSurface: "codex", cleared: { plan_heads: 3 }, totalRecords: 3 }, acceptedStateChanged: true };
    },
  };
  let resetCallback = 0;
  const adapter = new FinitePlanWebMCPAdapter(host, runtime, undefined, new MemoryArrivalRepository(), false, reset, async () => { resetCallback += 1; }).useStableDispatcher();
  await adapter.register();
  const opened = await host.execute("finite_open_toolset", { group: "plan_management" });
  assert(opened.actionNames.includes("finite_get_reset_preview"));
  assert(opened.actionNames.includes("finite_reset_kitchen"));
  const preview = await host.execute("finite_invoke", { action: "finite_get_reset_preview", arguments: {} });
  assert.equal(preview.code, "KITCHEN_RESET_PREVIEW");
  assert.equal(calls.length, 0);
  const refused = await host.execute("finite_invoke", { action: "finite_reset_kitchen", arguments: { confirmation: "start over", idempotencyKey: "codex-reset-0001", sourceSurface: "codex" } });
  assert.equal(refused.code, "INVALID_ACTION_ARGUMENTS");
  assert.equal(calls.length, 0);
  const result = await host.execute("finite_invoke", { action: "finite_reset_kitchen", arguments: { confirmation: "START OVER", idempotencyKey: "codex-reset-0001", sourceSurface: "codex" } });
  assert.equal(result.code, "KITCHEN_RESET");
  assert.equal(result.dispatchedAction, "finite_reset_kitchen");
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { confirmation: "START OVER", idempotencyKey: "codex-reset-0001", sourceSurface: "codex" });
  assert.equal(resetCallback, 1);
});

test("Codex can inspect, validate, save, apply, and delete a bounded custom theme", async () => {
  const profiles = await compileBuiltInProfiles();
  const runtime = new FinitePlanRuntime(profiles, new PlanSnapshotStore(new MemoryStorage()), "travel");
  const host = new MemoryModelContext();
  const reset = { preview: async () => ({ ok: true, code: "KITCHEN_RESET_PREVIEW", acceptedStateChanged: false }), reset: async () => ({ ok: false, code: "NOT_USED", acceptedStateChanged: false }) };
  const workshop = builtInThemes[0];
  const tokens = Object.fromEntries(themeCoreTokenKeys.map((key) => [key, workshop.tokens[key]]));
  const custom = { themeId: "custom_codex-studio", name: "Codex studio", mode: "light", kind: "custom", tokens: workshop.tokens };
  const calls = [];
  const themes = {
    list: async () => ({ ok: true, code: "THEME_CATALOG", builtIns: builtInThemes, custom: [], activeThemeId: "workshop", activeTheme: workshop, acceptedStateChanged: false }),
    preview: async (input) => { calls.push(["preview", input]); return { ok: true, code: "THEME_PREVIEW", theme: custom, acceptedStateChanged: false }; },
    save: async (input) => { calls.push(["save", input]); return { ok: true, code: "CUSTOM_THEME_CREATED", theme: custom, acceptedStateChanged: true }; },
    setActive: async (input) => { calls.push(["set", input]); return { ok: true, code: "THEME_APPLIED", theme: custom, activeThemeId: custom.themeId, acceptedStateChanged: true }; },
    delete: async (input) => { calls.push(["delete", input]); return { ok: true, code: "CUSTOM_THEME_DELETED", theme: workshop, activeThemeId: "workshop", acceptedStateChanged: true }; },
  };
  const workshopSkin = builtInSkins[0];
  const customSkin = { skinId: "custom_codex-calm", name: "Codex calm", description: "A calm custom working surface.", kind: "custom", recipe: builtInSkins[1].recipe };
  const skinCalls = [];
  const skins = {
    list: async () => ({ ok: true, code: "SKIN_CATALOG", builtIns: builtInSkins, custom: [], activeSkinId: "workshop", activeSkin: workshopSkin, acceptedStateChanged: false }),
    preview: async (input) => { skinCalls.push(["preview", input]); return { ok: true, code: "SKIN_PREVIEW", skin: customSkin, acceptedStateChanged: false }; },
    save: async (input) => { skinCalls.push(["save", input]); return { ok: true, code: "CUSTOM_SKIN_CREATED", skin: customSkin, acceptedStateChanged: true }; },
    setActive: async (input) => { skinCalls.push(["set", input]); return { ok: true, code: "SKIN_APPLIED", skin: customSkin, activeSkinId: customSkin.skinId, acceptedStateChanged: true }; },
    delete: async (input) => { skinCalls.push(["delete", input]); return { ok: true, code: "CUSTOM_SKIN_DELETED", skin: workshopSkin, activeSkinId: "workshop", acceptedStateChanged: true }; },
  };
  let themeCallbacks = 0;
  let skinCallbacks = 0;
  const adapter = new FinitePlanWebMCPAdapter(host, runtime, undefined, new MemoryArrivalRepository(), false, reset, async () => {}, themes, async () => { themeCallbacks += 1; }, skins, async () => { skinCallbacks += 1; }).useStableDispatcher();
  await adapter.register();
  const opened = await host.execute("finite_open_toolset", { group: "settings" });
  assert.deepEqual(opened.actionNames, ["finite_guide_view", "finite_list_skins", "finite_get_skin_schema", "finite_preview_skin", "finite_save_custom_skin", "finite_set_skin", "finite_delete_custom_skin", "finite_list_themes", "finite_get_theme_schema", "finite_preview_theme", "finite_save_custom_theme", "finite_set_theme", "finite_delete_custom_theme"]);
  assert.equal((await host.execute("finite_invoke", { action: "finite_get_skin_schema", arguments: {} })).code, "SKIN_SCHEMA");
  const skinDraft = { skinId: customSkin.skinId, name: customSkin.name, description: customSkin.description, recipe: customSkin.recipe };
  assert.equal((await host.execute("finite_invoke", { action: "finite_preview_skin", arguments: skinDraft })).code, "SKIN_PREVIEW");
  assert.equal((await host.execute("finite_invoke", { action: "finite_save_custom_skin", arguments: { ...skinDraft, idempotencyKey: "codex-skin-save-0001", sourceSurface: "codex" } })).code, "CUSTOM_SKIN_CREATED");
  assert.equal((await host.execute("finite_invoke", { action: "finite_set_skin", arguments: { skinId: customSkin.skinId, idempotencyKey: "codex-skin-set-0001", sourceSurface: "codex" } })).code, "SKIN_APPLIED");
  assert.equal((await host.execute("finite_invoke", { action: "finite_delete_custom_skin", arguments: { skinId: customSkin.skinId, idempotencyKey: "codex-skin-delete-0001", sourceSurface: "codex" } })).code, "CUSTOM_SKIN_DELETED");
  assert.equal((await host.execute("finite_invoke", { action: "finite_get_theme_schema", arguments: {} })).code, "THEME_SCHEMA");
  const draft = { themeId: custom.themeId, name: custom.name, mode: custom.mode, tokens };
  assert.equal((await host.execute("finite_invoke", { action: "finite_preview_theme", arguments: draft })).code, "THEME_PREVIEW");
  assert.equal((await host.execute("finite_invoke", { action: "finite_save_custom_theme", arguments: { ...draft, idempotencyKey: "codex-theme-save-0001", sourceSurface: "codex" } })).code, "CUSTOM_THEME_CREATED");
  assert.equal((await host.execute("finite_invoke", { action: "finite_set_theme", arguments: { themeId: custom.themeId, idempotencyKey: "codex-theme-set-0001", sourceSurface: "codex" } })).code, "THEME_APPLIED");
  assert.equal((await host.execute("finite_invoke", { action: "finite_delete_custom_theme", arguments: { themeId: custom.themeId, idempotencyKey: "codex-theme-delete-0001", sourceSurface: "codex" } })).code, "CUSTOM_THEME_DELETED");
  assert.equal(themeCallbacks, 2);
  assert.equal(skinCallbacks, 2);
  assert.deepEqual(skinCalls.map(([name]) => name), ["preview", "save", "set", "delete"]);
  assert.deepEqual(calls.map(([name]) => name), ["preview", "save", "set", "delete"]);
});

test("guided view is a bounded read-only action and delegates consent to the human surface", async () => {
  const profiles = await compileBuiltInProfiles();
  const runtime = new FinitePlanRuntime(profiles, new PlanSnapshotStore(new MemoryStorage()), "travel");
  const host = new MemoryModelContext();
  const requests = [];
  const adapter = new FinitePlanWebMCPAdapter(host, runtime, undefined, new MemoryArrivalRepository())
    .withGuideView(async (request) => { requests.push(request); return { ok: true, code: "VIEW_GUIDED", guide: request, acceptedStateChanged: false }; })
    .useStableDispatcher();
  await adapter.register();
  const opened = await host.execute("finite_open_toolset", { group: "planning" });
  const guide = opened.actions.find((action) => action.name === "finite_guide_view");
  assert.equal(guide.readOnly, true);
  assert.deepEqual(guide.inputSchema.properties.surface.enum, ["current", "arrival", "plan"]);
  assert.deepEqual(guide.inputSchema.properties.target.enum, ["top", "starting_point", "status", "question", "priority", "review", "interpretation", "updates", "plan_summary", "stages", "options", "approval", "receipt"]);
  const invalid = await host.execute("finite_invoke", { action: "finite_guide_view", arguments: { surface: "https://example.com", target: "#password" } });
  assert.equal(invalid.code, "INVALID_ACTION_ARGUMENTS");
  assert.equal(requests.length, 0);
  const result = await host.execute("finite_invoke", { action: "finite_guide_view", arguments: { surface: "plan", target: "approval", refresh: true } });
  assert.equal(result.code, "VIEW_GUIDED");
  assert.equal(result.acceptedStateChanged, false);
  assert.deepEqual(requests, [{ surface: "plan", target: "approval", refresh: true }]);
  const priority = await host.execute("finite_invoke", { action: "finite_guide_view", arguments: { surface: "arrival", target: "priority", sectionId: "requirements", refresh: true } });
  assert.equal(priority.code, "VIEW_GUIDED");
  assert.deepEqual(requests.at(-1), { surface: "arrival", target: "priority", refresh: true, sectionId: "requirements" });
});
