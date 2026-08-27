export type PlanShareMode = "live" | "frozen";
export type PlanShareSection = "overview" | "allocation" | "measures" | "stages" | "changes";

export interface PublicPlanMeasure { label: string; format: string; value: string | number }
export interface PublicPlanStage { label: string; detail: string; marker: string; status: string }
export interface PublicPlanChange { title: string; revision: number }

export interface PublicPlanProjection {
  publicationVersion: "finite-plan-publication.v1";
  mode: PlanShareMode;
  sections: PlanShareSection[];
  plan: {
    name: string;
    family: string;
    revision: number;
    status: string;
    updatedAt: string;
    headline?: string;
    brief?: string;
    eyebrow?: string;
    allocation?: {
      totalBudgetMinor: number;
      spentMinor: number;
      committedMinor: number;
      forecastMinor: number;
      bufferMinor: number;
    };
    measures?: PublicPlanMeasure[];
    stages?: PublicPlanStage[];
    changes?: PublicPlanChange[];
  };
}

export interface PlanPublicationRecord {
  shareId: string;
  planId: string;
  mode: PlanShareMode;
  sections: PlanShareSection[];
  label: string;
  createdAt: string;
  revokedAt: string | null;
  path?: string;
}

interface FailureBody { code?: string; message?: string }

export class PlanShareRepositoryError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = "PlanShareRepositoryError"; }
}

const decode = async <T>(response: Response): Promise<T> => {
  const body = await response.json() as T & FailureBody;
  if (!response.ok) throw new PlanShareRepositoryError(body.code ?? "PUBLICATION_FAILED", body.message ?? "The plan page could not be published.");
  return body;
};

export class HttpPlanShareRepository {
  async list(planId: string): Promise<PlanPublicationRecord[]> {
    const response = await fetch(`/api/plan-shares?planId=${encodeURIComponent(planId)}`, { headers: { accept: "application/json" } });
    const body = await decode<{ publications: PlanPublicationRecord[] }>(response);
    return body.publications;
  }

  async preview(input: { planId: string; mode: PlanShareMode; sections: PlanShareSection[] }): Promise<PublicPlanProjection> {
    const response = await fetch("/api/plan-shares/preview", { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(input) });
    const body = await decode<{ publication: PublicPlanProjection }>(response);
    return body.publication;
  }

  async create(input: { planId: string; mode: PlanShareMode; sections: PlanShareSection[]; label: string }): Promise<PlanPublicationRecord> {
    const response = await fetch("/api/plan-shares", { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(input) });
    const body = await decode<{ publication: PlanPublicationRecord }>(response);
    return body.publication;
  }

  async revoke(shareId: string): Promise<PlanPublicationRecord> {
    const response = await fetch(`/api/plan-shares/${encodeURIComponent(shareId)}`, { method: "DELETE", headers: { accept: "application/json" } });
    const body = await decode<{ publication: PlanPublicationRecord }>(response);
    return body.publication;
  }

  async loadPublic(token: string): Promise<{ label: string; publishedAt: string; publication: PublicPlanProjection }> {
    const response = await fetch(`/api/publications/${encodeURIComponent(token)}`, { headers: { accept: "application/json" } });
    return decode(response);
  }
}
