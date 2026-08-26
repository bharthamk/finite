import { clone } from "./crypto.js";
import type { ConstructionReturnReason, PlanConstructionPacket, ReturnedConstructionReview } from "./types.js";

export class ConstructionPacketRepositoryError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ConstructionPacketRepositoryError";
  }
}

export interface ConstructionPacketRepository {
  load(): Promise<PlanConstructionPacket | null>;
  loadReturned(): Promise<ReturnedConstructionReview | null>;
  save(packet: PlanConstructionPacket): Promise<PlanConstructionPacket>;
  returnForRevision(packetId: string, feedback: { reasonCode: ConstructionReturnReason; message: string }): Promise<ReturnedConstructionReview>;
  clear(packetId: string): Promise<void>;
}

const decodeJson = async <T>(response: Response): Promise<T> => {
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new ConstructionPacketRepositoryError(
    String(payload.code ?? "CONSTRUCTION_PACKET_REPOSITORY_FAILURE"),
    String(payload.message ?? `Construction repository returned HTTP ${response.status}.`),
    payload,
  );
  return payload as T;
};

export class HttpConstructionPacketRepository implements ConstructionPacketRepository {
  constructor(private readonly baseUrl = "/api/construction-packet") {}

  async load(): Promise<PlanConstructionPacket | null> {
    const response = await fetch(this.baseUrl, { headers: { accept: "application/json" } });
    if (response.status === 404) return null;
    const payload = await decodeJson<{ ok: true; packet: PlanConstructionPacket }>(response);
    return clone(payload.packet);
  }

  async save(packet: PlanConstructionPacket): Promise<PlanConstructionPacket> {
    const response = await fetch(this.baseUrl, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ packet }),
    });
    const payload = await decodeJson<{ ok: true; packet: PlanConstructionPacket }>(response);
    return clone(payload.packet);
  }

  async loadReturned(): Promise<ReturnedConstructionReview | null> {
    const response = await fetch(`${this.baseUrl}/returned`, { headers: { accept: "application/json" } });
    if (response.status === 404) return null;
    const payload = await decodeJson<{ ok: true; review: ReturnedConstructionReview }>(response);
    return clone(payload.review);
  }

  async returnForRevision(packetId: string, feedback: { reasonCode: ConstructionReturnReason; message: string }): Promise<ReturnedConstructionReview> {
    const response = await fetch(`${this.baseUrl}/${encodeURIComponent(packetId)}/return`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(feedback),
    });
    const payload = await decodeJson<{ ok: true; review: ReturnedConstructionReview }>(response);
    return clone(payload.review);
  }

  async clear(packetId: string): Promise<void> {
    await decodeJson(await fetch(`${this.baseUrl}/${encodeURIComponent(packetId)}`, {
      method: "DELETE",
      headers: { accept: "application/json" },
    }));
  }
}

export class MemoryConstructionPacketRepository implements ConstructionPacketRepository {
  private packet: PlanConstructionPacket | null = null;
  private tombstone: { packetId: string; clearedAt: string } | null = null;
  private returned: ReturnedConstructionReview | null = null;

  async load(): Promise<PlanConstructionPacket | null> {
    if (this.tombstone) throw new ConstructionPacketRepositoryError("CONSTRUCTION_PACKET_CLEARED", "The last construction packet was discarded.", this.tombstone);
    return clone(this.packet);
  }

  async loadReturned(): Promise<ReturnedConstructionReview | null> {
    return clone(this.returned);
  }

  async save(packet: PlanConstructionPacket): Promise<PlanConstructionPacket> {
    if (this.tombstone && (this.tombstone.packetId === packet.packetId || Date.parse(packet.createdAt) <= Date.parse(this.tombstone.clearedAt))) throw new ConstructionPacketRepositoryError("CONSTRUCTION_PACKET_TOMBSTONED", "A discarded construction packet cannot be restored by a stale surface.", this.tombstone);
    if (this.returned && this.returned.status !== "resolved" && packet.kind === "draft") {
      if (this.returned.packet.kind === "draft" && this.returned.packet.payload.contentHash === packet.payload.contentHash) throw new ConstructionPacketRepositoryError("CONSTRUCTION_RETURN_UNCHANGED", "A returned draft must be materially revised before it can be served again.");
      const resolvedAt = new Date().toISOString();
      this.returned = { ...this.returned, status: "resolved", feedbackRequired: false, resolvedByPacketId: packet.packetId, resolvedAt };
    }
    this.packet = clone(packet);
    this.tombstone = null;
    return clone(packet);
  }

  async returnForRevision(packetId: string, feedback: { reasonCode: ConstructionReturnReason; message: string }): Promise<ReturnedConstructionReview> {
    if (this.returned?.packetId === packetId) return clone(this.returned);
    if (!this.packet || this.packet.packetId !== packetId || this.packet.kind !== "draft") throw new ConstructionPacketRepositoryError("CONSTRUCTION_DRAFT_NOT_RETURNABLE", "The exact draft packet is not available for return.");
    const returnedAt = new Date().toISOString();
    this.returned = {
      status: "returned",
      packet: clone(this.packet),
      packetId,
      draftId: this.packet.payload.draftId,
      reasonCode: feedback.reasonCode,
      message: feedback.message,
      returnedAt,
      feedbackRequired: false,
      source: "human_action",
    };
    this.tombstone = { packetId, clearedAt: returnedAt };
    this.packet = null;
    return clone(this.returned);
  }

  async clear(packetId: string): Promise<void> {
    if (this.tombstone?.packetId === packetId) { this.returned = null; return; }
    if (!this.packet || this.packet.packetId !== packetId) throw new ConstructionPacketRepositoryError("CONSTRUCTION_PACKET_NOT_FOUND", "Construction packet was not found.");
    this.tombstone = { packetId, clearedAt: new Date().toISOString() };
    this.packet = null;
    this.returned = null;
  }
}
