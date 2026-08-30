import { clone } from "./crypto.js";
import type { StoragePort } from "./persistence.js";
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
  load(context?: RepositoryRequestContext): Promise<PlanConstructionPacket | null>;
  loadReturned(context?: RepositoryRequestContext): Promise<ReturnedConstructionReview | null>;
  save(packet: PlanConstructionPacket, context?: RepositoryRequestContext): Promise<PlanConstructionPacket>;
  returnForRevision(packetId: string, feedback: { reasonCode: ConstructionReturnReason; message: string }, context?: RepositoryRequestContext): Promise<ReturnedConstructionReview>;
  clear(packetId: string, context?: RepositoryRequestContext): Promise<void>;
}

export type RepositoryRequestContext = { signal?: AbortSignal };

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

  async load(context: RepositoryRequestContext = {}): Promise<PlanConstructionPacket | null> {
    const response = await fetch(this.baseUrl, { headers: { accept: "application/json" }, ...(context.signal ? { signal: context.signal } : {}) });
    if (response.status === 404) return null;
    const payload = await decodeJson<{ ok: true; packet: PlanConstructionPacket }>(response);
    return clone(payload.packet);
  }

  async save(packet: PlanConstructionPacket, context: RepositoryRequestContext = {}): Promise<PlanConstructionPacket> {
    const response = await fetch(this.baseUrl, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ packet }),
      ...(context.signal ? { signal: context.signal } : {}),
    });
    const payload = await decodeJson<{ ok: true; packet: PlanConstructionPacket }>(response);
    return clone(payload.packet);
  }

  async loadReturned(context: RepositoryRequestContext = {}): Promise<ReturnedConstructionReview | null> {
    const response = await fetch(`${this.baseUrl}/returned`, { headers: { accept: "application/json" }, ...(context.signal ? { signal: context.signal } : {}) });
    if (response.status === 404) return null;
    const payload = await decodeJson<{ ok: true; review: ReturnedConstructionReview }>(response);
    return clone(payload.review);
  }

  async returnForRevision(packetId: string, feedback: { reasonCode: ConstructionReturnReason; message: string }, context: RepositoryRequestContext = {}): Promise<ReturnedConstructionReview> {
    const response = await fetch(`${this.baseUrl}/${encodeURIComponent(packetId)}/return`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(feedback),
      ...(context.signal ? { signal: context.signal } : {}),
    });
    const payload = await decodeJson<{ ok: true; review: ReturnedConstructionReview }>(response);
    return clone(payload.review);
  }

  async clear(packetId: string, context: RepositoryRequestContext = {}): Promise<void> {
    await decodeJson(await fetch(`${this.baseUrl}/${encodeURIComponent(packetId)}`, {
      method: "DELETE",
      headers: { accept: "application/json" },
      ...(context.signal ? { signal: context.signal } : {}),
    }));
  }
}

export class MemoryConstructionPacketRepository implements ConstructionPacketRepository {
  private packet: PlanConstructionPacket | null = null;
  private tombstone: { packetId: string; clearedAt: string } | null = null;
  private returned: ReturnedConstructionReview | null = null;

  constructor(private readonly now: () => Date = () => new Date(), private readonly storage?: StoragePort, private readonly storageKey = "finite-plan.local-construction.v1") {
    if (!storage) return;
    try {
      const parsed = JSON.parse(storage.getItem(storageKey) ?? "null") as { packet?: PlanConstructionPacket | null; tombstone?: { packetId: string; clearedAt: string } | null; returned?: ReturnedConstructionReview | null } | null;
      this.packet = clone(parsed?.packet ?? null);
      this.tombstone = clone(parsed?.tombstone ?? null);
      this.returned = clone(parsed?.returned ?? null);
    } catch { storage.removeItem(storageKey); }
  }

  private persist(): void { this.storage?.setItem(this.storageKey, JSON.stringify({ packet: this.packet, tombstone: this.tombstone, returned: this.returned })); }

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
      const resolvedAt = this.now().toISOString();
      this.returned = { ...this.returned, status: "resolved", feedbackRequired: false, resolvedByPacketId: packet.packetId, resolvedAt };
    }
    this.packet = clone(packet);
    this.tombstone = null;
    this.persist();
    return clone(packet);
  }

  async returnForRevision(packetId: string, feedback: { reasonCode: ConstructionReturnReason; message: string }): Promise<ReturnedConstructionReview> {
    if (this.returned?.packetId === packetId) return clone(this.returned);
    if (!this.packet || this.packet.packetId !== packetId || this.packet.kind !== "draft") throw new ConstructionPacketRepositoryError("CONSTRUCTION_DRAFT_NOT_RETURNABLE", "The exact draft packet is not available for return.");
    const returnedAt = this.now().toISOString();
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
    this.persist();
    return clone(this.returned);
  }

  async clear(packetId: string): Promise<void> {
    if (this.tombstone?.packetId === packetId) { this.returned = null; this.persist(); return; }
    if (!this.packet || this.packet.packetId !== packetId) throw new ConstructionPacketRepositoryError("CONSTRUCTION_PACKET_NOT_FOUND", "Construction packet was not found.");
    this.tombstone = { packetId, clearedAt: this.now().toISOString() };
    this.packet = null;
    this.returned = null;
    this.persist();
  }
}
