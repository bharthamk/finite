import type { PlanShareSection, PublicPlanProjection } from "./plan-share.js";

export type PlanCollaborationRole = "view" | "suggest" | "edit";
export type PlanContributionKind = "suggestion" | "draft_edit";
export type PlanContributionStatus = "open" | "incorporated" | "dismissed";

export interface PlanInvitationRecord {
  inviteId: string;
  planId: string;
  role: PlanCollaborationRole;
  sections: PlanShareSection[];
  label: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  acceptedAt: string | null;
  claimed: boolean;
  path?: string;
}

export interface PlanContributionRecord {
  updateId: string;
  inviteId: string;
  planId: string;
  kind: PlanContributionKind;
  section: string;
  message: string;
  status: PlanContributionStatus;
  createdAt: string;
  resolvedAt: string | null;
}

export interface PlanInvitationCatalog {
  invitations: PlanInvitationRecord[];
  contributions: PlanContributionRecord[];
}

export interface PlanCollaborationView {
  invitation: PlanInvitationRecord;
  claimRequired: boolean;
  projection?: PublicPlanProjection;
  contributions?: PlanContributionRecord[];
}

export class PlanCollaborationRepositoryError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) { super(message); this.name = "PlanCollaborationRepositoryError"; }
}

const read = async <T>(response: Response): Promise<T> => {
  const body = await response.json() as { code?: string; message?: string } & T;
  if (!response.ok) throw new PlanCollaborationRepositoryError(body.code ?? "PLAN_COLLABORATION_FAILED", body.message ?? "The collaboration request failed.", response.status);
  return body;
};

export class HttpPlanCollaborationRepository {
  async list(planId: string): Promise<PlanInvitationCatalog> {
    const response = await fetch(`/api/plan-invites?planId=${encodeURIComponent(planId)}`, { headers: { accept: "application/json" } });
    const body = await read<{ invitations: PlanInvitationRecord[]; contributions: PlanContributionRecord[] }>(response);
    return { invitations: body.invitations, contributions: body.contributions };
  }

  async create(input: { planId: string; role: PlanCollaborationRole; sections: PlanShareSection[]; label: string; expiresInDays: 7 | 30 | 90 }): Promise<PlanInvitationRecord> {
    const response = await fetch("/api/plan-invites", { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(input) });
    return (await read<{ invitation: PlanInvitationRecord }>(response)).invitation;
  }

  async revoke(inviteId: string): Promise<void> {
    await read(await fetch(`/api/plan-invites/${encodeURIComponent(inviteId)}`, { method: "DELETE", headers: { accept: "application/json" } }));
  }

  async resolve(updateId: string, status: "incorporated" | "dismissed"): Promise<PlanContributionRecord> {
    const response = await fetch(`/api/plan-collaboration-updates/${encodeURIComponent(updateId)}`, { method: "PATCH", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ status }) });
    return (await read<{ contribution: PlanContributionRecord }>(response)).contribution;
  }

  async load(token: string): Promise<PlanCollaborationView> {
    const response = await fetch(`/api/collaborations/${encodeURIComponent(token)}`, { headers: { accept: "application/json" } });
    return read<PlanCollaborationView>(response);
  }

  async claim(token: string): Promise<PlanInvitationRecord> {
    const response = await fetch(`/api/collaborations/${encodeURIComponent(token)}/claim`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: "{}" });
    return (await read<{ invitation: PlanInvitationRecord }>(response)).invitation;
  }

  async contribute(token: string, input: { kind: PlanContributionKind; section: string; message: string }): Promise<PlanContributionRecord> {
    const response = await fetch(`/api/collaborations/${encodeURIComponent(token)}/updates`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(input) });
    return (await read<{ contribution: PlanContributionRecord }>(response)).contribution;
  }
}
