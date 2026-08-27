import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateAttachmentText, validateChecklistLabel } from "../dist-test/src/plan-work.js";

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

test("Managing exposes checkboxes and section-bound attachments without engineering copy", async () => {
  const source = await readFile(new URL("../src/main.ts", import.meta.url), "utf8");
  assert.match(source, /<h2>To do<\/h2>/);
  assert.match(source, /data-action="toggle-checklist"/);
  assert.match(source, /Files &amp; links/);
  assert.match(source, /data-attachment-context/);
  assert.match(source, /Files, pictures, links or notes/);
  assert.match(source, /checklistForStage/);
  assert.match(source, /Everything is ticked off\./);
  assert.match(source, /data-action="reopen-stage"/);
  assert.match(source, /Did this plan reach its outcome\?/);
  assert.match(source, /Finish this plan/);
  assert.match(source, /Pause or stop this plan/);
  assert.match(source, /applyConfirmedPlanLifecycle/);
  assert.match(source, /This plan is finished\./);
  assert.match(source, /form\.hasAttribute\("data-plan-complete"\)/);
  assert.match(source, /Finishing this plan…/);
  assert.doesNotMatch(source, /const returnPlanDraft[\s\S]{0,500}status === "completed"/);
});

test("Codex receives a bounded execution toolset matching the human progress surface", async () => {
  const source = await readFile(new URL("../src/webmcp.ts", import.meta.url), "utf8");
  assert.match(source, /execution: \["finite_list_plan_work", "finite_add_checklist_item", "finite_set_checklist_item", "finite_add_plan_reference", "finite_remove_plan_attachment"\]/);
  assert.match(source, /People can upload local files and pictures from the Site/);
  assert.doesNotMatch(source, /finite_upload_plan_file/);
});
