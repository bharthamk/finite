import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateAttachmentProcessing, validateAttachmentRole, validateAttachmentText, validateChecklistLabel } from "../dist-test/src/plan-work.js";
import { handlePlanWorkRequest } from "../dist-test/worker/plan-work.js";
import { authSha256 } from "../dist-test/worker/auth.js";

class PlanWorkStatement {
  constructor(db, query) { this.db = db; this.query = query; this.values = []; }
  bind(...values) { this.values = values; return this; }
  async first() {
    if (this.query.includes("FROM plan_heads")) return this.db.heads.get(`${this.values[0]}:${this.values[1]}`) ?? null;
    if (this.query.includes("FROM plan_work_receipts")) return this.db.receipts.get(`${this.values[0]}:${this.values[1]}`) ?? null;
    if (this.query.includes("FROM plan_attachments") && this.query.includes("attachment_id = ?")) return this.db.attachments.get(`${this.values[0]}:${this.values[1]}`) ?? null;
    return null;
  }
  async all() {
    if (this.query.includes("FROM plan_checklist_items")) return { results: [] };
    if (this.query.includes("FROM plan_attachments")) {
      const [scopeId, planId] = this.values;
      return { results: [...this.db.attachments.values()].filter((item) => item.scope_id === scopeId && item.plan_id === planId && item.status === "active") };
    }
    return { results: [] };
  }
}

class PlanWorkDb {
  heads = new Map();
  attachments = new Map();
  receipts = new Map();
  prepare(query) { return new PlanWorkStatement(this, query); }
  async batch(statements) {
    for (const statement of statements) {
      if (statement.query.startsWith("UPDATE plan_attachments SET processing_status")) {
        const [processingStatus, processingSummary, derivedRefsJson, processedBy, processedAt, updatedAt, scopeId, attachmentId] = statement.values;
        const existing = this.attachments.get(`${scopeId}:${attachmentId}`);
        this.attachments.set(`${scopeId}:${attachmentId}`, { ...existing, processing_status: processingStatus, processing_summary: processingSummary, derived_refs_json: derivedRefsJson, processed_by: processedBy, processed_at: processedAt, updated_at: updatedAt });
      } else if (statement.query.startsWith("INSERT INTO plan_work_receipts")) {
        const [scopeId, idempotencyKey, requestHash, receiptJson] = statement.values;
        this.receipts.set(`${scopeId}:${idempotencyKey}`, { request_hash: requestHash, receipt_json: receiptJson });
      }
    }
    return statements.map(() => ({ success: true }));
  }
}

class RecoveryStatement {
  constructor(db, query) { this.db = db; this.query = query; this.values = []; }
  bind(...values) { this.values = values; return this; }
  async first() {
    if (this.query.includes("FROM plan_heads")) return this.db.heads.get(`${this.values[0]}:${this.values[1]}`) ?? null;
    if (this.query.includes("FROM plan_work_receipts")) return this.db.receipts.get(`${this.values[0]}:${this.values[1]}`) ?? null;
    if (this.query.includes("FROM plan_file_operations")) return this.db.operations.get(`${this.values[0]}:${this.values[1]}`) ?? null;
    if (this.query.includes("FROM plan_attachments") && this.query.includes("attachment_id = ?")) return this.db.attachments.get(`${this.values[0]}:${this.values[1]}`) ?? null;
    return null;
  }
  async all() {
    if (this.query.includes("FROM plan_checklist_items")) return { results: [] };
    if (this.query.includes("FROM plan_attachments")) {
      const [scopeId, planId] = this.values;
      return { results: [...this.db.attachments.values()].filter((item) => item.scope_id === scopeId && item.plan_id === planId && item.status === "active") };
    }
    return { results: [] };
  }
}

class RecoveryPlanWorkDb {
  heads = new Map();
  attachments = new Map();
  receipts = new Map();
  operations = new Map();
  failFinalBatches = 0;
  prepare(query) { return new RecoveryStatement(this, query); }
  async batch(statements) {
    const isFinal = statements.some(({ query }) => query.startsWith("INSERT INTO plan_attachments") || query.startsWith("UPDATE plan_attachments SET status = 'removed'"));
    if (isFinal && this.failFinalBatches > 0) { this.failFinalBatches -= 1; throw new Error("D1 final batch unavailable"); }
    for (const statement of statements) {
      const { query, values } = statement;
      if (query.startsWith("INSERT INTO plan_file_operations")) {
        const [scopeId, key, requestHash, attachmentId, planId, objectKey] = values;
        this.operations.set(`${scopeId}:${key}`, { request_hash: requestHash, operation_kind: query.includes("'upload'") ? "upload" : "delete", attachment_id: attachmentId, plan_id: planId, object_key: objectKey, status: "pending" });
      } else if (query.startsWith("UPDATE plan_file_operations SET status = 'completed'")) {
        const [, , scopeId, key] = values;
        const operation = this.operations.get(`${scopeId}:${key}`);
        this.operations.set(`${scopeId}:${key}`, { ...operation, status: "completed" });
      } else if (query.startsWith("INSERT INTO plan_attachments")) {
        const [scopeId, attachmentId, planId, planRevision, section, contextId, contextLabel, kind, label, objectKey, fileName, contentType, sizeBytes, sourceSurface, attachmentRole, processingStatus, createdAt, updatedAt] = values;
        this.attachments.set(`${scopeId}:${attachmentId}`, { scope_id: scopeId, attachment_id: attachmentId, plan_id: planId, plan_revision: planRevision, section, context_id: contextId, context_label: contextLabel, kind, label, note_text: null, link_url: null, object_key: objectKey, file_name: fileName, content_type: contentType, size_bytes: sizeBytes, source_surface: sourceSurface, attachment_role: attachmentRole, processing_status: processingStatus, processing_summary: null, derived_refs_json: "[]", processed_by: null, processed_at: null, status: "active", created_at: createdAt, updated_at: updatedAt });
      } else if (query.startsWith("UPDATE plan_attachments SET status = 'removed'")) {
        const [removedAt, updatedAt, scopeId, attachmentId] = values;
        const attachment = this.attachments.get(`${scopeId}:${attachmentId}`);
        this.attachments.set(`${scopeId}:${attachmentId}`, { ...attachment, status: "removed", removed_at: removedAt, updated_at: updatedAt });
      } else if (query.startsWith("INSERT INTO plan_work_receipts")) {
        const [scopeId, key, requestHash, receiptJson] = values;
        this.receipts.set(`${scopeId}:${key}`, { request_hash: requestHash, receipt_json: receiptJson });
      }
    }
    return statements.map(() => ({ success: true }));
  }
}

class RecoveryFiles {
  objects = new Map();
  puts = 0;
  deletes = 0;
  async put(key, value) { this.puts += 1; this.objects.set(key, new Uint8Array(value)); }
  async delete(key) { this.deletes += 1; this.objects.delete(key); }
  async get() { return null; }
}

const planWorkUserId = "plan_work_user";
const planWorkScopeId = `user_${(await authSha256({ siteUserId: planWorkUserId })).slice(0, 32)}`;
const planWorkPlanId = "plan_source_test";
const planWorkRequest = (path, method = "GET", body) => new Request(`https://finite.example${path}`, {
  method,
  headers: { "oai-authenticated-user-id": planWorkUserId, ...(body ? { "content-type": "application/json", origin: "https://finite.example" } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
const uploadRequest = (key, content = "guest list") => {
  const form = new FormData();
  for (const [name, value] of Object.entries({ planId: planWorkPlanId, expectedRevision: "1", section: "general", idempotencyKey: key, sourceSurface: "site", attachmentRole: "source" })) form.set(name, value);
  form.set("file", new File([content], "guests.txt", { type: "text/plain" }));
  return new Request("https://finite.example/api/plan-work/attachments/upload", { method: "POST", headers: { "oai-authenticated-user-id": planWorkUserId, origin: "https://finite.example" }, body: form });
};

test("adaptive checklist copy is bounded human text", () => {
  assert.deepEqual(validateChecklistLabel("  Buy the pantry items  "), { ok: true, label: "Buy the pantry items" });
  assert.equal(validateChecklistLabel("").ok, false);
  assert.equal(validateChecklistLabel("x".repeat(241)).ok, false);
});

test("plan notes and links accept useful references but refuse unsafe URLs", () => {
  assert.deepEqual(validateAttachmentText({ kind: "note", label: "Door code", value: "  Ask Sam before sharing it.  " }), { ok: true, kind: "note", label: "Door code", value: "Ask Sam before sharing it." });
  assert.equal(validateAttachmentText({ kind: "link", label: "Menu", value: "https://example.com/menu" }).ok, true);
  assert.equal(validateAttachmentText({ kind: "link", label: "Bad", value: "javascript:alert(1)" }).ok, false);
});

test("attachment provenance and processing state are bounded", () => {
  assert.deepEqual(validateAttachmentRole("source"), { ok: true, role: "source" });
  assert.deepEqual(validateAttachmentRole("output"), { ok: true, role: "output" });
  assert.equal(validateAttachmentRole("mystery").ok, false);
  assert.deepEqual(validateAttachmentProcessing({ status: "processed", summary: "  Three confirmations extracted.  ", derivedRefs: ["input_guest_update", "check_rsvp"] }), { ok: true, status: "processed", summary: "Three confirmations extracted.", derivedRefs: ["input_guest_update", "check_rsvp"] });
  assert.equal(validateAttachmentProcessing({ status: "processed", summary: "", derivedRefs: [] }).ok, false);
  assert.equal(validateAttachmentProcessing({ status: "unread", summary: "not allowed", derivedRefs: [] }).ok, false);
  assert.equal(validateAttachmentProcessing({ status: "needs_review", summary: "x".repeat(2001), derivedRefs: [] }).ok, false);
});

test("Managing exposes checkboxes and section-bound attachments without engineering copy", async () => {
  const source = await readFile(new URL("../src/main.ts", import.meta.url), "utf8");
  assert.match(source, /Plan-stage tasks are ticked off in the timeline below\./);
  assert.match(source, /data-action="toggle-checklist"/);
  assert.match(source, /Files &amp; links/);
  assert.match(source, /data-attachment-context/);
  assert.match(source, /Files, pictures, links or notes/);
  assert.match(source, /Source material/);
  assert.match(source, /Agent output/);
  assert.match(source, /Needs review/);
  assert.match(source, /Processed/);
  assert.match(source, /checklistForStage/);
  assert.match(source, /Everything is ticked off\./);
  assert.match(source, /class="stage__check"/);
  assert.match(source, /Did this plan reach its outcome\?/);
  assert.match(source, /Finish this plan/);
  assert.match(source, /Pause or stop this plan/);
  assert.match(source, /applyConfirmedPlanLifecycle/);
  assert.match(source, /This plan is finished\./);
  assert.match(source, /form\.hasAttribute\("data-plan-complete"\) \|\| recordActual/);
  assert.match(source, /Finishing this plan…/);
  assert.doesNotMatch(source, /const returnPlanDraft[\s\S]{0,500}status === "completed"/);
  assert.match(source, /renderWrapUpSurface/);
  assert.match(source, /The plan at finish/);
  assert.match(source, /How it came together/);
  assert.match(source, /Decisions and updates/);
  assert.match(source, /Share this summary/);
  assert.match(source, /Start another plan/);
});

test("Codex receives a bounded execution toolset matching the human progress surface", async () => {
  const source = await readFile(new URL("../src/webmcp.ts", import.meta.url), "utf8");
  assert.match(source, /execution: \["finite_list_plan_work", "finite_read_plan_attachment", "finite_set_plan_attachment_processing", "finite_add_checklist_item", "finite_set_checklist_item", "finite_add_plan_reference", "finite_remove_plan_attachment"\]/);
  assert.match(source, /People can upload local files and pictures from the Site/);
  assert.match(source, /Read one exact source attachment/);
  assert.match(source, /Record how one exact attachment was processed/);
  assert.doesNotMatch(source, /finite_upload_plan_file/);
});

test("an exact source note can be read and receives an idempotent processing receipt", async () => {
  const db = new PlanWorkDb();
  db.heads.set(`${planWorkScopeId}:${planWorkPlanId}`, { revision: 1 });
  const attachmentId = "attachment_human_note";
  db.attachments.set(`${planWorkScopeId}:${attachmentId}`, {
    scope_id: planWorkScopeId, attachment_id: attachmentId, plan_id: planWorkPlanId, plan_revision: 1,
    section: "general", context_id: "stage_guests", context_label: "Confirm guests", kind: "note", label: "Phone notes",
    note_text: "Maya hates celery.", link_url: null, object_key: null, file_name: null, content_type: null, size_bytes: null,
    source_surface: "site", attachment_role: "source", processing_status: "unread", processing_summary: null,
    derived_refs_json: "[]", processed_by: null, processed_at: null, status: "active",
    created_at: "2026-08-30T00:00:00.000Z", updated_at: "2026-08-30T00:00:00.000Z",
  });
  const read = await (await handlePlanWorkRequest(planWorkRequest(`/api/plan-work/attachments/${attachmentId}/read?planId=${planWorkPlanId}`), db)).json();
  assert.equal(read.code, "PLAN_ATTACHMENT_READ");
  assert.equal(read.content, "Maya hates celery.");
  const input = { planId: planWorkPlanId, expectedRevision: 1, section: "general", contextId: "stage_guests", contextLabel: "Confirm guests", status: "processed", summary: "Recorded Maya's celery avoidance.", derivedRefs: ["input_maya_celery"], idempotencyKey: "process-note-0001", sourceSurface: "codex" };
  const processed = await (await handlePlanWorkRequest(planWorkRequest(`/api/plan-work/attachments/${attachmentId}/processing`, "POST", input), db)).json();
  assert.equal(processed.code, "PLAN_ATTACHMENT_PROCESSING_UPDATED");
  assert.equal(processed.attachment.processingStatus, "processed");
  assert.deepEqual(processed.attachment.derivedRefs, ["input_maya_celery"]);
  const replay = await (await handlePlanWorkRequest(planWorkRequest(`/api/plan-work/attachments/${attachmentId}/processing`, "POST", input), db)).json();
  assert.deepEqual(replay, processed);
});

test("the authenticated plan-work service exposes bounded source reads and processing receipts", async () => {
  const worker = await readFile(new URL("../worker/plan-work.ts", import.meta.url), "utf8");
  assert.match(worker, /const attachmentRead = url\.pathname\.match/);
  assert.match(worker, /const attachmentProcessing = url\.pathname\.match/);
  assert.match(worker, /ATTACHMENT_TEXT_UNAVAILABLE/);
  assert.match(worker, /PLAN_ATTACHMENT_PROCESSING_UPDATED/);
  assert.match(worker, /derived_refs_json/);
});

test("an upload recovers from a lost D1 final batch without orphaning or duplicating its R2 object", async () => {
  const db = new RecoveryPlanWorkDb();
  const files = new RecoveryFiles();
  db.heads.set(`${planWorkScopeId}:${planWorkPlanId}`, { revision: 1 });
  db.failFinalBatches = 1;
  const uncertain = await handlePlanWorkRequest(uploadRequest("upload-recovery-0001"), db, files);
  assert.equal(uncertain.status, 500);
  assert.equal((await uncertain.json()).retryWithSameIdempotencyKey, true);
  assert.equal(files.objects.size, 1);
  assert.equal(db.attachments.size, 0);
  assert.equal([...db.operations.values()][0].status, "pending");
  const recovered = await handlePlanWorkRequest(uploadRequest("upload-recovery-0001"), db, files);
  const result = await recovered.json();
  assert.equal(recovered.status, 201);
  assert.equal(result.code, "PLAN_ATTACHMENT_UPLOADED");
  assert.equal(files.objects.size, 1);
  assert.equal(db.attachments.size, 1);
  assert.equal(db.receipts.size, 1);
  assert.equal([...db.operations.values()][0].status, "completed");
});

test("a file removal recovers after R2 deletion and an unavailable D1 final batch", async () => {
  const db = new RecoveryPlanWorkDb();
  const files = new RecoveryFiles();
  db.heads.set(`${planWorkScopeId}:${planWorkPlanId}`, { revision: 1 });
  const attachmentId = "attachment_remove_recovery";
  const objectKey = `${planWorkScopeId}/${planWorkPlanId}/${attachmentId}`;
  db.attachments.set(`${planWorkScopeId}:${attachmentId}`, { scope_id: planWorkScopeId, attachment_id: attachmentId, plan_id: planWorkPlanId, plan_revision: 1, section: "general", context_id: null, context_label: null, kind: "file", label: "guests.txt", note_text: null, link_url: null, object_key: objectKey, file_name: "guests.txt", content_type: "text/plain", size_bytes: 10, source_surface: "site", attachment_role: "source", processing_status: "unread", processing_summary: null, derived_refs_json: "[]", processed_by: null, processed_at: null, status: "active", created_at: "2026-08-30T00:00:00.000Z", updated_at: "2026-08-30T00:00:00.000Z" });
  files.objects.set(objectKey, new Uint8Array([1]));
  db.failFinalBatches = 1;
  const body = { planId: planWorkPlanId, expectedRevision: 1, section: "general", idempotencyKey: "remove-recovery-0001", sourceSurface: "site" };
  const uncertain = await handlePlanWorkRequest(planWorkRequest(`/api/plan-work/attachments/${attachmentId}/remove`, "POST", body), db, files);
  assert.equal(uncertain.status, 500);
  assert.equal(files.objects.size, 0);
  assert.equal(db.attachments.get(`${planWorkScopeId}:${attachmentId}`).status, "active");
  const recovered = await handlePlanWorkRequest(planWorkRequest(`/api/plan-work/attachments/${attachmentId}/remove`, "POST", body), db, files);
  assert.equal((await recovered.json()).code, "PLAN_ATTACHMENT_REMOVED");
  assert.equal(db.attachments.get(`${planWorkScopeId}:${attachmentId}`).status, "removed");
  assert.equal([...db.operations.values()][0].status, "completed");
});
