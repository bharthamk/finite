import test from "node:test";
import assert from "node:assert/strict";
import { MemoryArrivalRepository } from "../dist-test/src/arrival.js";
import { MemoryStorage, PlanSnapshotStore } from "../dist-test/src/persistence.js";
import { compileBuiltInProfiles } from "../dist-test/src/profiles.js";
import { FinitePlanRuntime } from "../dist-test/src/runtime.js";
import { FinitePlanWebMCPAdapter } from "../dist-test/src/webmcp.js";
import { handleArrivalRequest } from "../dist-test/worker/arrival.js";

class MemoryModelContext {
  tools = new Map();
  registerTool(tool, options = {}) {
    this.tools.set(tool.name, tool);
    options.signal?.addEventListener("abort", () => this.tools.delete(tool.name), { once: true });
  }
  async execute(name, input) { return this.tools.get(name)?.execute(input) ?? { ok: false, code: "TOOL_NOT_FOUND" }; }
}

test("site-first, Codex-later orientation returns the whole order and every unprocessed human update", async () => {
  let tick = 0;
  const arrivals = new MemoryArrivalRepository(() => new Date(Date.parse("2026-08-26T00:00:00.000Z") + tick++ * 1000));
  const created = await arrivals.create({
    idempotencyKey: "site-first-0001",
    rawOutcome: "Plan a three-week Europe trip that stays comfortable.",
    structured: { dates: { start: "2026-10-03", end: "2026-10-24" } },
    attachments: [{ kind: "flight_receipt", ref: "receipt-1" }],
    sourceSurface: "site",
  });
  const first = await arrivals.appendInput({ orderId: created.order.orderId, expectedVersion: 1, kind: "constraint", payload: { flight: "non-refundable", route: "SYD-LHR" }, sourceSurface: "site" });
  await arrivals.appendInput({ orderId: created.order.orderId, expectedVersion: 2, kind: "preference", payload: { pace: "slow", priority: "Paris" }, sourceSurface: "site" });

  const opened = await arrivals.open({ orderId: created.order.orderId });
  assert.equal(opened.orientation.exactOrderVersion, 3);
  assert.equal(opened.orientation.unprocessedHumanInputCount, 3);
  assert.equal(opened.orientation.order.rawOutcome, created.order.rawOutcome);
  assert.deepEqual(opened.orientation.evidenceReferences, [{ kind: "flight_receipt", ref: "receipt-1" }]);
  assert.equal(opened.orientation.delta[0].eventType, "human_order_created");
  assert.equal(opened.orientation.delta[2].eventType, "human_input_added");
  assert.equal(first.order.status, "waiting_for_codex");

  const checkpoint = await arrivals.checkpoint({ orderId: created.order.orderId, expectedVersion: opened.orientation.exactOrderVersion });
  assert.equal(checkpoint.code, "ARRIVAL_CHECKPOINTED");
  assert.equal(checkpoint.orientation.unprocessedHumanInputCount, 0);
  const staged = await arrivals.stageInterpretation({
    orderId: created.order.orderId,
    expectedVersion: checkpoint.order.version,
    inferredFamily: "travel",
    summary: "A 21-day Europe plan with fixed international flights and a preference for slower travel.",
    known: { fixedFlight: true, durationDays: 21 },
    inferred: { likelyRegions: ["London", "Paris"] },
    missing: [],
    contradictions: [],
    savedOperatorWork: { candidateRouteCount: 3 },
    complete: true,
  });
  assert.equal(staged.order.status, "proposed_plan_ready");
  assert.equal(staged.acceptedStateChanged, false);
});

test("Codex-first, Site-later preserves a staged question and treats the later Site answer as new human input", async () => {
  const arrivals = new MemoryArrivalRepository();
  const created = await arrivals.create({ idempotencyKey: "codex-first-0001", rawOutcome: "Help me renovate the kitchen before Christmas.", sourceSurface: "codex" });
  const checkpoint = await arrivals.checkpoint({ orderId: created.order.orderId, expectedVersion: 1 });
  const question = await arrivals.stageClarification({ orderId: created.order.orderId, expectedVersion: checkpoint.order.version, prompt: "What is the latest acceptable handover date?", answerKind: "date", fieldPaths: ["deadline"] });
  assert.equal(question.order.status, "clarification_required");
  const answer = await arrivals.appendInput({ orderId: created.order.orderId, expectedVersion: question.order.version, kind: "answer", payload: { questionId: question.order.pendingClarification.questionId, value: "2026-12-18" }, sourceSurface: "site" });
  assert.equal(answer.order.pendingClarification, null);
  assert.equal(answer.order.status, "waiting_for_codex");

  const resumed = await arrivals.open({ orderId: created.order.orderId });
  assert.equal(resumed.orientation.unprocessedHumanInputCount, 1);
  assert.equal(resumed.orientation.delta.at(-1).payload.input.sourceSurface, "site");
  assert.match(resumed.orientation.next, /Process 1 human-supplied update/);
});

test("a concurrent Site edit refuses stale Codex staging and returns the reorientation delta", async () => {
  const arrivals = new MemoryArrivalRepository();
  const created = await arrivals.create({ idempotencyKey: "concurrent-arrival-0001", rawOutcome: "Plan a 120-person launch event.", sourceSurface: "site" });
  const codexOpened = await arrivals.open({ orderId: created.order.orderId });
  assert.equal(codexOpened.orientation.exactOrderVersion, 1);
  const humanChanged = await arrivals.appendInput({ orderId: created.order.orderId, expectedVersion: 1, kind: "constraint", payload: { venueCapacity: 110 }, sourceSurface: "site" });
  assert.equal(humanChanged.order.version, 2);

  const stale = await arrivals.stageInterpretation({ orderId: created.order.orderId, expectedVersion: 1, inferredFamily: "event", summary: "A 120-person launch event.", complete: true });
  assert.equal(stale.ok, false);
  assert.equal(stale.code, "ORDER_VERSION_CONFLICT");
  assert.equal(stale.currentVersion, 2);
  assert.equal(stale.orientation.unprocessedHumanInputCount, 2);
  assert.equal(stale.orientation.delta.at(-1).payload.input.payload.venueCapacity, 110);
  assert.equal(stale.acceptedStateChanged, false);
});

test("WebMCP exposes the arrival kitchen but no human authority creator", async () => {
  const profiles = await compileBuiltInProfiles();
  const runtime = new FinitePlanRuntime(profiles, new PlanSnapshotStore(new MemoryStorage()), "travel");
  const arrivals = new MemoryArrivalRepository();
  const host = new MemoryModelContext();
  const adapter = new FinitePlanWebMCPAdapter(host, runtime, undefined, arrivals);
  const inventory = await adapter.register();
  assert.equal(inventory.length, 45);
  for (const name of ["finite_create_arrival_order", "finite_append_arrival_input", "finite_open_arrival", "finite_checkpoint_arrival", "finite_stage_clarification", "finite_stage_plan_interpretation"]) assert(host.tools.has(name));
  const created = await host.execute("finite_create_arrival_order", { idempotencyKey: "webmcp-arrival-0001", rawOutcome: "Help me make a finite plan." });
  assert.equal(created.code, "ARRIVAL_ORDER_CREATED");
  assert.equal(created.order.status, "waiting_for_codex");
  assert.equal(created.acceptedStateChanged, false);
  assert.equal(created.operationProof.toolName, "finite_create_arrival_order");
  assert.equal((await host.execute("finite_open_arrival", {})).orientation.exactOrderChecksum, created.order.checksum);
});

test("arrival API refuses missing identity and cross-origin writes before touching D1", async () => {
  const unavailableDb = {};
  const missingIdentity = await handleArrivalRequest(new Request("https://finite.example/api/arrivals/current"), unavailableDb);
  assert.equal(missingIdentity.status, 401);
  assert.equal((await missingIdentity.json()).code, "AUTHENTICATED_USER_REQUIRED");
  const crossOrigin = await handleArrivalRequest(new Request("https://finite.example/api/arrivals", { method: "POST", headers: { origin: "https://attacker.example", "content-type": "application/json", "oai-authenticated-user-id": "user-a" }, body: "{}" }), unavailableDb);
  assert.equal(crossOrigin.status, 403);
  assert.equal((await crossOrigin.json()).code, "CROSS_ORIGIN_WRITE_REFUSED");
});
