import test from "node:test";
import assert from "node:assert/strict";
import { workspaceSectionTemplate, workspaceSectionTemplates } from "../dist-test/src/workspace-templates.js";

test("custom workspace offers bounded reusable sections from Finite's other plan shapes", () => {
  assert.ok(workspaceSectionTemplates.length >= 8);
  assert.equal(new Set(workspaceSectionTemplates.map((template) => template.templateId)).size, workspaceSectionTemplates.length);
  assert.equal(new Set(workspaceSectionTemplates.map((template) => template.moduleId)).size, workspaceSectionTemplates.length);
  assert.deepEqual(
    new Set(workspaceSectionTemplates.map((template) => template.sourceLabel)),
    new Set(["Travel", "Renovation", "Event", "Dinner", "Interview", "Learning"]),
  );
  for (const template of workspaceSectionTemplates) {
    assert.match(template.moduleId, /^custom_[a-z0-9_]+$/);
    assert.ok(template.fields.length >= 2 && template.fields.length <= 12);
    assert.equal(template.fields[0].fieldId, "title");
    assert.ok(template.description.length <= 300);
  }
});

test("known template identities resolve exactly and carry their source fields", () => {
  const interview = workspaceSectionTemplate("interview_evidence");
  assert.equal(interview?.moduleId, "custom_interview_evidence");
  assert.deepEqual(interview?.fields.map((field) => field.fieldId), ["title", "situation", "action", "result", "proof", "confidence"]);
  assert.equal(workspaceSectionTemplate("not_real"), undefined);
});
