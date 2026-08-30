import test from "node:test";
import assert from "node:assert/strict";
import { handlePlanCollaborationRequest } from "../dist-test/worker/plan-collaboration.js";

class Statement {
  constructor(db, query, values = []) { this.db = db; this.query = query; this.values = values; }
  bind(...values) { return new Statement(this.db, this.query, values); }
  first() { return this.db.first(this.query, this.values); }
  all() { return this.db.all(this.query, this.values); }
}

const definition = { profileId: "travel", name: "Hobart, three nights", surface: { hero: { eyebrow: "Hobart", title: "An easy Hobart plan.", brief: "MONA, local food and a flexible nature day." }, primaryMeasures: [], stages: [] } };
const snapshot = { lifecycle: { status: "active" }, accepted: { totalBudgetMinor: 240_000, spentMinor: 0, committedMinor: 80_000, forecastMinor: 130_000, bufferMinor: 30_000 }, entities: {}, events: [], receipts: [] };

class CollaborationDb {
  invitations = [];
  updates = [];
  prepare(query) { return new Statement(this, query); }
  async first(query, values) {
    if (query.includes("FROM demo_sessions")) return null;
    if (query.includes("FROM plan_heads h")) return { scope_id: values[0], share_id: "", plan_id: values[1], mode: "", sections_json: "[]", frozen_projection_json: null, label: "", created_at: "", revoked_at: null, revision: 2, updated_at: "2026-08-31T02:00:00.000Z", snapshot_json: JSON.stringify(snapshot), definition_json: JSON.stringify(definition) };
    if (query.includes("COUNT(*)") && query.includes("plan_invitations")) return { count: this.invitations.filter((row) => row.scope_id === values[0] && row.plan_id === values[1] && !row.revoked_at).length };
    if (query.includes("COUNT(*)") && query.includes("plan_collaboration_updates")) return { count: this.updates.filter((row) => row.scope_id === values[0] && row.plan_id === values[1] && row.actor_scope_id === values[2] && row.status === "open").length };
    if (query.includes("FROM plan_invitations WHERE token_hash = ?")) return this.invitations.find((row) => row.token_hash === values[0]) ?? null;
    if (query.includes("FROM plan_invitations WHERE scope_id = ? AND invite_id = ?")) return this.invitations.find((row) => row.scope_id === values[0] && row.invite_id === values[1]) ?? null;
    if (query.includes("FROM plan_collaboration_updates WHERE scope_id = ? AND update_id = ?")) return this.updates.find((row) => row.scope_id === values[0] && row.update_id === values[1]) ?? null;
    return null;
  }
  async all(query, values) {
    if (query.includes("FROM plan_invitations WHERE scope_id = ? AND plan_id = ?")) return { results: this.invitations.filter((row) => row.scope_id === values[0] && row.plan_id === values[1]).reverse() };
    if (query.includes("FROM plan_collaboration_updates WHERE scope_id = ? AND plan_id = ? AND actor_scope_id = ?")) return { results: this.updates.filter((row) => row.scope_id === values[0] && row.plan_id === values[1] && row.actor_scope_id === values[2]).reverse() };
    if (query.includes("FROM plan_collaboration_updates WHERE scope_id = ? AND plan_id = ?")) return { results: this.updates.filter((row) => row.scope_id === values[0] && row.plan_id === values[1]).reverse() };
    if (query.includes("FROM plan_checklist_items") || query.includes("FROM plan_inputs") || query.includes("FROM plan_attachments")) return { results: [] };
    return { results: [] };
  }
  async batch(statements) {
    for (const { query, values } of statements) {
      if (query.startsWith("INSERT INTO plan_invitations")) this.invitations.push({ scope_id: values[0], invite_id: values[1], token_hash: values[2], plan_id: values[3], role: values[4], sections_json: values[5], label: values[6], created_at: values[7], expires_at: values[8], revoked_at: null, accepted_scope_id: null, accepted_at: null });
      if (query.startsWith("UPDATE plan_invitations SET accepted_scope_id")) {
        const row = this.invitations.find((item) => item.invite_id === values[2] && item.token_hash === values[3]);
        if (row && !row.accepted_scope_id) { row.accepted_scope_id = values[0]; row.accepted_at = values[1]; }
      }
      if (query.startsWith("UPDATE plan_invitations SET revoked_at")) {
        const row = this.invitations.find((item) => item.scope_id === values[1] && item.invite_id === values[2]);
        if (row) row.revoked_at = values[0];
      }
      if (query.startsWith("INSERT INTO plan_collaboration_updates")) this.updates.push({ scope_id: values[0], update_id: values[1], invite_id: values[2], plan_id: values[3], actor_scope_id: values[4], kind: values[5], section: values[6], message: values[7], status: "open", created_at: values[8], resolved_at: null });
      if (query.startsWith("UPDATE plan_collaboration_updates SET status")) {
        const row = this.updates.find((item) => item.scope_id === values[2] && item.update_id === values[3]);
        if (row && row.status === "open") { row.status = values[0]; row.resolved_at = values[1]; }
      }
    }
    return statements.map(() => ({ success: true }));
  }
}

const ownerHeaders = { "oai-authenticated-user-id": "owner-123", origin: "https://finite.example", "content-type": "application/json" };
const collaboratorHeaders = { "oai-authenticated-user-id": "collaborator-456", origin: "https://finite.example", "content-type": "application/json" };
const call = (db, path, method = "GET", headers = ownerHeaders, body) => handlePlanCollaborationRequest(new Request(`https://finite.example${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), db);

test("an authenticated invitation is single-account, revocable, role-enforced and never mutates accepted truth", async () => {
  const db = new CollaborationDb();
  const created = await call(db, "/api/plan-invites", "POST", ownerHeaders, { planId: "plan_hobart", role: "edit", sections: ["overview", "allocation"], label: "Sam · Hobart", expiresInDays: 30 });
  const createdBody = await created.json();
  assert.equal(created.status, 201);
  assert.match(createdBody.invitation.path, /^\/collaborate\/[A-Za-z0-9_-]{43}$/);
  const token = createdBody.invitation.path.split("/").at(-1);
  assert.equal(db.invitations[0].token_hash.includes(token), false);

  const beforeClaim = await call(db, `/api/collaborations/${token}`, "GET", collaboratorHeaders);
  const beforeBody = await beforeClaim.json();
  assert.equal(beforeBody.code, "PLAN_INVITATION_READY");
  assert.equal(beforeBody.claimRequired, true);
  assert.equal("projection" in beforeBody, false);

  const claim = await call(db, `/api/collaborations/${token}/claim`, "POST", collaboratorHeaders, {});
  assert.equal((await claim.json()).code, "PLAN_INVITATION_CLAIMED");
  const otherAccount = await call(db, `/api/collaborations/${token}`, "GET", { ...collaboratorHeaders, "oai-authenticated-user-id": "someone-else" });
  assert.equal(otherAccount.status, 403);

  const opened = await call(db, `/api/collaborations/${token}`, "GET", collaboratorHeaders);
  const openedBody = await opened.json();
  assert.equal(openedBody.code, "PLAN_COLLABORATION");
  assert.equal(openedBody.invitation.role, "edit");
  assert.deepEqual(openedBody.projection.sections, ["overview", "allocation"]);
  assert.equal(openedBody.projection.plan.allocation.totalBudgetMinor, 240_000);
  assert.equal(JSON.stringify(openedBody).includes("scope_id"), false);

  const contribution = await call(db, `/api/collaborations/${token}/updates`, "POST", collaboratorHeaders, { kind: "draft_edit", section: "stages", message: "Keep the nature day movable until the rain forecast settles." });
  const contributionBody = await contribution.json();
  assert.equal(contribution.status, 201);
  assert.equal(contributionBody.code, "PLAN_DRAFT_EDIT_ADDED");
  assert.equal(db.updates.length, 1);

  const ownerList = await call(db, "/api/plan-invites?planId=plan_hobart");
  const ownerBody = await ownerList.json();
  assert.equal(ownerBody.contributions[0].message, "Keep the nature day movable until the rain forecast settles.");
  const resolved = await call(db, `/api/plan-collaboration-updates/${db.updates[0].update_id}`, "PATCH", ownerHeaders, { status: "incorporated" });
  assert.equal((await resolved.json()).contribution.status, "incorporated");

  const revoked = await call(db, `/api/plan-invites/${db.invitations[0].invite_id}`, "DELETE", ownerHeaders);
  assert.equal((await revoked.json()).code, "PLAN_INVITATION_REVOKED");
  const closed = await call(db, `/api/collaborations/${token}`, "GET", collaboratorHeaders);
  assert.equal(closed.status, 410);
  assert.equal((await closed.json()).code, "PLAN_INVITATION_REVOKED");
});

test("view and suggest roles are enforced by the service rather than interface copy", async () => {
  const db = new CollaborationDb();
  const suggestCreated = await call(db, "/api/plan-invites", "POST", ownerHeaders, { planId: "plan_hobart", role: "suggest", sections: ["overview"], label: "Suggest only", expiresInDays: 7 });
  const token = (await suggestCreated.json()).invitation.path.split("/").at(-1);
  await call(db, `/api/collaborations/${token}/claim`, "POST", collaboratorHeaders, {});
  const refusedEdit = await call(db, `/api/collaborations/${token}/updates`, "POST", collaboratorHeaders, { kind: "draft_edit", section: "general", message: "Rewrite the plan." });
  assert.equal(refusedEdit.status, 403);
  assert.equal((await refusedEdit.json()).code, "PLAN_COLLABORATION_ROLE_REFUSED");
  const suggestion = await call(db, `/api/collaborations/${token}/updates`, "POST", collaboratorHeaders, { kind: "suggestion", section: "general", message: "Consider an indoor backup." });
  assert.equal(suggestion.status, 201);

  const viewCreated = await call(db, "/api/plan-invites", "POST", ownerHeaders, { planId: "plan_hobart", role: "view", sections: ["overview"], label: "View only", expiresInDays: 7 });
  const viewToken = (await viewCreated.json()).invitation.path.split("/").at(-1);
  const viewerHeaders = { ...collaboratorHeaders, "oai-authenticated-user-id": "viewer-789" };
  await call(db, `/api/collaborations/${viewToken}/claim`, "POST", viewerHeaders, {});
  const refusedSuggestion = await call(db, `/api/collaborations/${viewToken}/updates`, "POST", viewerHeaders, { kind: "suggestion", section: "general", message: "Try something else." });
  assert.equal(refusedSuggestion.status, 403);
  assert.equal((await refusedSuggestion.json()).code, "PLAN_COLLABORATION_VIEW_ONLY");

  const anonymous = await call(db, "/api/plan-invites?planId=plan_hobart", "GET", {});
  assert.equal(anonymous.status, 401);
  const crossOrigin = await call(db, "/api/plan-invites", "POST", { ...ownerHeaders, origin: "https://attacker.example" }, { planId: "plan_hobart" });
  assert.equal(crossOrigin.status, 403);
});
