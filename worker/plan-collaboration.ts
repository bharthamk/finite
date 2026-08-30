import { authSha256, principalStorageScope, resolveRequestPrincipal } from "./auth.js";
import type { D1Database } from "./accepted-truth.js";
import { loadPlanRow, sanitizeProjection, selectedSections, type ShareSection } from "./plan-shares.js";

type JsonRecord = Record<string, unknown>;
type CollaborationRole = "view" | "suggest" | "edit";
type ContributionKind = "suggestion" | "draft_edit";

interface InviteRow {
  scope_id: string;
  invite_id: string;
  token_hash: string;
  plan_id: string;
  role: string;
  sections_json: string;
  label: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  accepted_scope_id: string | null;
  accepted_at: string | null;
}

interface ContributionRow {
  update_id: string;
  invite_id: string;
  plan_id: string;
  actor_scope_id: string;
  kind: string;
  section: string;
  message: string;
  status: string;
  created_at: string;
  resolved_at: string | null;
}

const roles = new Set<CollaborationRole>(["view", "suggest", "edit"]);
const validExpiryDays = new Set([7, 30, 90]);
const jsonHeaders = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const response = (status: number, body: JsonRecord): Response => new Response(JSON.stringify(body), { status, headers: jsonHeaders });
const errorResponse = (status: number, code: string, message: string): Response => response(status, { ok: false, code, message });
const sameOriginWrite = (request: Request): boolean => {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
};
const validPlanId = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9._:-]{1,200}$/.test(value);
const validInviteId = (value: string): boolean => /^invite_[a-f0-9]{16}$/.test(value);
const validUpdateId = (value: string): boolean => /^collab_[a-f0-9]{16}$/.test(value);
const validToken = (value: string): boolean => /^[a-zA-Z0-9_-]{43}$/.test(value);
const cleanText = (value: unknown, max: number): string | null => {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length >= 1 && text.length <= max && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text) ? text : null;
};
const randomToken = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
};
const parseJson = async (request: Request): Promise<JsonRecord> => {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new Error("JSON_REQUIRED");
  const text = await request.text();
  if (text.length > 5_000) throw new Error("BODY_TOO_LARGE");
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("OBJECT_REQUIRED");
  return value as JsonRecord;
};

const accountScope = async (request: Request, db: D1Database): Promise<string | Response> => {
  const principal = await resolveRequestPrincipal(request, db);
  if (!principal) return errorResponse(401, "AUTHENTICATION_REQUIRED", "Sign in before joining or inviting someone to a plan.");
  if (principal.kind !== "account") return errorResponse(403, "ACCOUNT_REQUIRED", "Plan invitations require a signed-in account.");
  return (await principalStorageScope(principal)).scopeId;
};

const serializeInvite = (row: InviteRow) => ({
  inviteId: row.invite_id,
  planId: row.plan_id,
  role: row.role,
  sections: JSON.parse(row.sections_json),
  label: row.label,
  createdAt: row.created_at,
  expiresAt: row.expires_at,
  revokedAt: row.revoked_at,
  acceptedAt: row.accepted_at,
  claimed: Boolean(row.accepted_scope_id),
});
const serializeContribution = (row: ContributionRow) => ({
  updateId: row.update_id,
  inviteId: row.invite_id,
  planId: row.plan_id,
  kind: row.kind,
  section: row.section,
  message: row.message,
  status: row.status,
  createdAt: row.created_at,
  resolvedAt: row.resolved_at,
});

const loadInviteByToken = async (db: D1Database, token: string): Promise<InviteRow | null> => {
  if (!validToken(token)) return null;
  const tokenHash = await authSha256({ collaborationToken: token });
  return db.prepare("SELECT scope_id, invite_id, token_hash, plan_id, role, sections_json, label, created_at, expires_at, revoked_at, accepted_scope_id, accepted_at FROM plan_invitations WHERE token_hash = ?")
    .bind(tokenHash).first<InviteRow>();
};
const inviteUnavailable = (row: InviteRow): Response | null => {
  if (row.revoked_at) return errorResponse(410, "PLAN_INVITATION_REVOKED", "The owner has withdrawn this invitation.");
  if (Date.parse(row.expires_at) <= Date.now()) return errorResponse(410, "PLAN_INVITATION_EXPIRED", "This invitation has expired.");
  if (!roles.has(row.role as CollaborationRole) || !selectedSections(JSON.parse(row.sections_json))) return errorResponse(500, "PLAN_INVITATION_INVALID", "This invitation cannot be read safely.");
  return null;
};

const listOwnerInvites = async (request: Request, db: D1Database, ownerScope: string): Promise<Response> => {
  const planId = new URL(request.url).searchParams.get("planId");
  if (!validPlanId(planId)) return errorResponse(400, "PLAN_ID_INVALID", "Choose one saved plan.");
  if (!await loadPlanRow(db, ownerScope, planId)) return errorResponse(404, "PLAN_NOT_FOUND", "The selected accepted plan was not found.");
  const [invites, updates] = await Promise.all([
    db.prepare("SELECT scope_id, invite_id, token_hash, plan_id, role, sections_json, label, created_at, expires_at, revoked_at, accepted_scope_id, accepted_at FROM plan_invitations WHERE scope_id = ? AND plan_id = ? ORDER BY created_at DESC LIMIT 50").bind(ownerScope, planId).all<InviteRow>(),
    db.prepare("SELECT update_id, invite_id, plan_id, actor_scope_id, kind, section, message, status, created_at, resolved_at FROM plan_collaboration_updates WHERE scope_id = ? AND plan_id = ? ORDER BY created_at DESC LIMIT 100").bind(ownerScope, planId).all<ContributionRow>(),
  ]);
  return response(200, { ok: true, code: "PLAN_INVITATIONS", invitations: invites.results.map(serializeInvite), contributions: updates.results.map(serializeContribution) });
};

const createInvite = async (request: Request, db: D1Database, ownerScope: string): Promise<Response> => {
  const body = await parseJson(request);
  const sections = selectedSections(body.sections);
  const role = body.role;
  const label = cleanText(body.label, 80);
  const expiresInDays = typeof body.expiresInDays === "number" ? body.expiresInDays : 30;
  if (!validPlanId(body.planId) || !sections || !roles.has(role as CollaborationRole) || !label || !validExpiryDays.has(expiresInDays)) return errorResponse(422, "PLAN_INVITATION_SELECTION_INVALID", "Choose a plan, access level, expiry, included sections and a short name.");
  if (!await loadPlanRow(db, ownerScope, body.planId)) return errorResponse(404, "PLAN_NOT_FOUND", "Only a durable accepted plan can be invited into.");
  const count = await db.prepare("SELECT COUNT(*) AS count FROM plan_invitations WHERE scope_id = ? AND plan_id = ? AND revoked_at IS NULL AND expires_at > ?")
    .bind(ownerScope, body.planId, new Date().toISOString()).first<{ count: number }>();
  if (Number(count?.count ?? 0) >= 30) return errorResponse(409, "PLAN_INVITATION_LIMIT", "Revoke an older invitation before creating another.");
  const token = randomToken();
  const tokenHash = await authSha256({ collaborationToken: token });
  const inviteId = `invite_${tokenHash.slice(0, 16)}`;
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + expiresInDays * 86_400_000).toISOString();
  await db.batch([db.prepare("INSERT INTO plan_invitations (scope_id, invite_id, token_hash, plan_id, role, sections_json, label, created_at, expires_at, revoked_at, accepted_scope_id, accepted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL)")
    .bind(ownerScope, inviteId, tokenHash, body.planId, role, JSON.stringify(sections), label, createdAt, expiresAt)]);
  return response(201, { ok: true, code: "PLAN_INVITATION_CREATED", invitation: { inviteId, planId: body.planId, role, sections, label, createdAt, expiresAt, revokedAt: null, acceptedAt: null, claimed: false, path: `/collaborate/${token}` } });
};

const revokeInvite = async (db: D1Database, ownerScope: string, inviteId: string): Promise<Response> => {
  if (!validInviteId(inviteId)) return errorResponse(400, "PLAN_INVITATION_ID_INVALID", "Choose one plan invitation.");
  const row = await db.prepare("SELECT scope_id, invite_id, token_hash, plan_id, role, sections_json, label, created_at, expires_at, revoked_at, accepted_scope_id, accepted_at FROM plan_invitations WHERE scope_id = ? AND invite_id = ?")
    .bind(ownerScope, inviteId).first<InviteRow>();
  if (!row) return errorResponse(404, "PLAN_INVITATION_NOT_FOUND", "That invitation was not found.");
  const revokedAt = row.revoked_at ?? new Date().toISOString();
  if (!row.revoked_at) await db.batch([db.prepare("UPDATE plan_invitations SET revoked_at = ? WHERE scope_id = ? AND invite_id = ? AND revoked_at IS NULL").bind(revokedAt, ownerScope, inviteId)]);
  return response(200, { ok: true, code: "PLAN_INVITATION_REVOKED", invitation: { inviteId, planId: row.plan_id, revokedAt } });
};

const loadCollaboration = async (request: Request, db: D1Database, accountScopeId: string, token: string): Promise<Response> => {
  const row = await loadInviteByToken(db, token);
  if (!row) return errorResponse(404, "PLAN_INVITATION_NOT_FOUND", "This plan invitation is not available.");
  const unavailable = inviteUnavailable(row);
  if (unavailable) return unavailable;
  if (!row.accepted_scope_id) return response(200, { ok: true, code: "PLAN_INVITATION_READY", invitation: serializeInvite(row), claimRequired: true });
  if (row.accepted_scope_id !== accountScopeId) return errorResponse(403, "PLAN_INVITATION_CLAIMED", "This invitation belongs to another signed-in account.");
  const sections = selectedSections(JSON.parse(row.sections_json)) as ShareSection[];
  const plan = await loadPlanRow(db, row.scope_id, row.plan_id);
  if (!plan) return errorResponse(410, "PLAN_UNAVAILABLE", "The owner’s plan is no longer available.");
  const ownUpdates = await db.prepare("SELECT update_id, invite_id, plan_id, actor_scope_id, kind, section, message, status, created_at, resolved_at FROM plan_collaboration_updates WHERE scope_id = ? AND plan_id = ? AND actor_scope_id = ? ORDER BY created_at DESC LIMIT 50")
    .bind(row.scope_id, row.plan_id, accountScopeId).all<ContributionRow>();
  return response(200, { ok: true, code: "PLAN_COLLABORATION", invitation: serializeInvite(row), projection: await sanitizeProjection(db, row.scope_id, plan, sections, "live"), contributions: ownUpdates.results.map(serializeContribution), claimRequired: false });
};

const claimInvite = async (db: D1Database, accountScopeId: string, token: string): Promise<Response> => {
  const row = await loadInviteByToken(db, token);
  if (!row) return errorResponse(404, "PLAN_INVITATION_NOT_FOUND", "This plan invitation is not available.");
  const unavailable = inviteUnavailable(row);
  if (unavailable) return unavailable;
  if (row.accepted_scope_id && row.accepted_scope_id !== accountScopeId) return errorResponse(409, "PLAN_INVITATION_CLAIMED", "This invitation has already been claimed.");
  const alreadyClaimed = Boolean(row.accepted_scope_id);
  const acceptedAt = row.accepted_at ?? new Date().toISOString();
  if (!row.accepted_scope_id) await db.batch([db.prepare("UPDATE plan_invitations SET accepted_scope_id = ?, accepted_at = ? WHERE invite_id = ? AND token_hash = ? AND accepted_scope_id IS NULL AND revoked_at IS NULL")
    .bind(accountScopeId, acceptedAt, row.invite_id, row.token_hash)]);
  const claimed = await loadInviteByToken(db, token);
  if (!claimed || claimed.accepted_scope_id !== accountScopeId) return errorResponse(409, "PLAN_INVITATION_CLAIMED", "This invitation was claimed by another signed-in account.");
  return response(200, { ok: true, code: alreadyClaimed ? "PLAN_INVITATION_ALREADY_CLAIMED" : "PLAN_INVITATION_CLAIMED", invitation: { ...serializeInvite(claimed), claimed: true, acceptedAt: claimed.accepted_at ?? acceptedAt } });
};

const addContribution = async (request: Request, db: D1Database, accountScopeId: string, token: string): Promise<Response> => {
  const row = await loadInviteByToken(db, token);
  if (!row) return errorResponse(404, "PLAN_INVITATION_NOT_FOUND", "This plan invitation is not available.");
  const unavailable = inviteUnavailable(row);
  if (unavailable) return unavailable;
  if (row.accepted_scope_id !== accountScopeId) return errorResponse(403, "PLAN_COLLABORATION_ACCESS_REFUSED", "Claim this invitation with the same signed-in account before contributing.");
  const role = row.role as CollaborationRole;
  if (role === "view") return errorResponse(403, "PLAN_COLLABORATION_VIEW_ONLY", "This invitation is view only.");
  const body = await parseJson(request);
  const kind: ContributionKind = body.kind === "draft_edit" ? "draft_edit" : "suggestion";
  if (kind === "draft_edit" && role !== "edit") return errorResponse(403, "PLAN_COLLABORATION_ROLE_REFUSED", "This invitation can suggest changes but cannot edit the working draft.");
  const message = cleanText(body.message, 2_000);
  const section = cleanText(body.section, 80) ?? "general";
  if (!message) return errorResponse(422, "PLAN_COLLABORATION_UPDATE_INVALID", "Add a concise contribution before saving it.");
  const count = await db.prepare("SELECT COUNT(*) AS count FROM plan_collaboration_updates WHERE scope_id = ? AND plan_id = ? AND actor_scope_id = ? AND status = 'open'")
    .bind(row.scope_id, row.plan_id, accountScopeId).first<{ count: number }>();
  if (Number(count?.count ?? 0) >= 100) return errorResponse(409, "PLAN_COLLABORATION_UPDATE_LIMIT", "Resolve an earlier contribution before adding another.");
  const createdAt = new Date().toISOString();
  const updateHash = await authSha256({ inviteId: row.invite_id, actorScopeId: accountScopeId, createdAt, message, kind, nonce: crypto.randomUUID() });
  const updateId = `collab_${updateHash.slice(0, 16)}`;
  await db.batch([db.prepare("INSERT INTO plan_collaboration_updates (scope_id, update_id, invite_id, plan_id, actor_scope_id, kind, section, message, status, created_at, resolved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, NULL)")
    .bind(row.scope_id, updateId, row.invite_id, row.plan_id, accountScopeId, kind, section, message, createdAt)]);
  return response(201, { ok: true, code: kind === "draft_edit" ? "PLAN_DRAFT_EDIT_ADDED" : "PLAN_SUGGESTION_ADDED", contribution: { updateId, inviteId: row.invite_id, planId: row.plan_id, kind, section, message, status: "open", createdAt, resolvedAt: null } });
};

const resolveContribution = async (request: Request, db: D1Database, ownerScope: string, updateId: string): Promise<Response> => {
  if (!validUpdateId(updateId)) return errorResponse(400, "PLAN_COLLABORATION_UPDATE_ID_INVALID", "Choose one collaboration update.");
  const body = await parseJson(request);
  const status = body.status === "incorporated" ? "incorporated" : body.status === "dismissed" ? "dismissed" : null;
  if (!status) return errorResponse(422, "PLAN_COLLABORATION_STATUS_INVALID", "Mark the contribution incorporated or dismissed.");
  const row = await db.prepare("SELECT update_id, invite_id, plan_id, actor_scope_id, kind, section, message, status, created_at, resolved_at FROM plan_collaboration_updates WHERE scope_id = ? AND update_id = ?")
    .bind(ownerScope, updateId).first<ContributionRow>();
  if (!row) return errorResponse(404, "PLAN_COLLABORATION_UPDATE_NOT_FOUND", "That contribution was not found.");
  const resolvedAt = row.resolved_at ?? new Date().toISOString();
  if (row.status === "open") await db.batch([db.prepare("UPDATE plan_collaboration_updates SET status = ?, resolved_at = ? WHERE scope_id = ? AND update_id = ? AND status = 'open'").bind(status, resolvedAt, ownerScope, updateId)]);
  return response(200, { ok: true, code: "PLAN_COLLABORATION_UPDATE_RESOLVED", contribution: { ...serializeContribution(row), status: row.status === "open" ? status : row.status, resolvedAt } });
};

export const handlePlanCollaborationRequest = async (request: Request, db: D1Database): Promise<Response | null> => {
  const url = new URL(request.url);
  const ownerRoute = url.pathname === "/api/plan-invites" || url.pathname.startsWith("/api/plan-invites/") || url.pathname.startsWith("/api/plan-collaboration-updates/");
  const collaborationRoute = url.pathname.startsWith("/api/collaborations/");
  if (!ownerRoute && !collaborationRoute) return null;
  if (request.method !== "GET" && !sameOriginWrite(request)) return errorResponse(403, "CROSS_ORIGIN_WRITE_REFUSED", "Finite writes must be same-origin.");
  try {
    const scope = await accountScope(request, db);
    if (scope instanceof Response) return scope;
    if (url.pathname === "/api/plan-invites") {
      if (request.method === "GET") return listOwnerInvites(request, db, scope);
      if (request.method === "POST") return createInvite(request, db, scope);
    }
    if (url.pathname.startsWith("/api/plan-invites/") && request.method === "DELETE") {
      const inviteId = decodeURIComponent(url.pathname.slice("/api/plan-invites/".length));
      return inviteId.includes("/") ? errorResponse(400, "PLAN_INVITATION_ID_INVALID", "Choose one plan invitation.") : revokeInvite(db, scope, inviteId);
    }
    if (url.pathname.startsWith("/api/plan-collaboration-updates/") && request.method === "PATCH") {
      const updateId = decodeURIComponent(url.pathname.slice("/api/plan-collaboration-updates/".length));
      return updateId.includes("/") ? errorResponse(400, "PLAN_COLLABORATION_UPDATE_ID_INVALID", "Choose one collaboration update.") : resolveContribution(request, db, scope, updateId);
    }
    if (collaborationRoute) {
      const suffix = decodeURIComponent(url.pathname.slice("/api/collaborations/".length));
      const parts = suffix.split("/");
      if (parts.length === 1 && request.method === "GET") return loadCollaboration(request, db, scope, parts[0] ?? "");
      if (parts.length === 2 && parts[1] === "claim" && request.method === "POST") return claimInvite(db, scope, parts[0] ?? "");
      if (parts.length === 2 && parts[1] === "updates" && request.method === "POST") return addContribution(request, db, scope, parts[0] ?? "");
    }
    return errorResponse(405, "METHOD_NOT_ALLOWED", "Unsupported collaboration operation.");
  } catch (error) {
    if (error instanceof SyntaxError || (error instanceof Error && ["JSON_REQUIRED", "BODY_TOO_LARGE", "OBJECT_REQUIRED"].includes(error.message))) return errorResponse(400, "PLAN_COLLABORATION_REQUEST_INVALID", "The collaboration request is invalid.");
    return errorResponse(500, "PLAN_COLLABORATION_SERVICE_FAILED", "Collaboration failed safely.");
  }
};
