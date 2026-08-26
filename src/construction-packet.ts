import { clone } from "./crypto.js";
import type { PlanConstructionPacket } from "./types.js";

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
  save(packet: PlanConstructionPacket): Promise<PlanConstructionPacket>;
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

  async load(): Promise<PlanConstructionPacket | null> {
    if (this.tombstone) throw new ConstructionPacketRepositoryError("CONSTRUCTION_PACKET_CLEARED", "The last construction packet was discarded.", this.tombstone);
    return clone(this.packet);
  }

  async save(packet: PlanConstructionPacket): Promise<PlanConstructionPacket> {
    if (this.tombstone && (this.tombstone.packetId === packet.packetId || Date.parse(packet.createdAt) <= Date.parse(this.tombstone.clearedAt))) throw new ConstructionPacketRepositoryError("CONSTRUCTION_PACKET_TOMBSTONED", "A discarded construction packet cannot be restored by a stale surface.", this.tombstone);
    this.packet = clone(packet);
    this.tombstone = null;
    return clone(packet);
  }

  async clear(packetId: string): Promise<void> {
    if (this.tombstone?.packetId === packetId) return;
    if (!this.packet || this.packet.packetId !== packetId) throw new ConstructionPacketRepositoryError("CONSTRUCTION_PACKET_NOT_FOUND", "Construction packet was not found.");
    this.tombstone = { packetId, clearedAt: new Date().toISOString() };
    this.packet = null;
  }
}
