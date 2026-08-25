import { clone } from "./crypto.js";
import type { PlanSnapshot, ProfileId } from "./types.js";

export interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class MemoryStorage implements StoragePort {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

export class PlanSnapshotStore {
  constructor(
    private readonly storage: StoragePort,
    private readonly namespace = "finite-plan.v1",
  ) {}

  private key(profileId: ProfileId): string {
    return `${this.namespace}:${profileId}`;
  }

  save(snapshot: PlanSnapshot): void {
    this.storage.setItem(this.key(snapshot.profileId), JSON.stringify(snapshot));
  }

  load(profileId: ProfileId, expectedProfileHash: string): PlanSnapshot | null {
    const raw = this.storage.getItem(this.key(profileId));
    if (!raw) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.storage.removeItem(this.key(profileId));
      return null;
    }
    if (!isPlanSnapshot(parsed) || parsed.profileId !== profileId || parsed.profileHash !== expectedProfileHash) return null;
    return clone(parsed);
  }

  clear(profileId: ProfileId): void {
    this.storage.removeItem(this.key(profileId));
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object";

const isPlanSnapshot = (value: unknown): value is PlanSnapshot => {
  if (!isRecord(value)) return false;
  return value.snapshotVersion === "finite-plan-snapshot.v1"
    && typeof value.profileId === "string"
    && typeof value.profileHash === "string"
    && typeof value.planId === "string"
    && Number.isInteger(value.revision)
    && isRecord(value.accepted)
    && isRecord(value.preferenceWeights)
    && isRecord(value.entities)
    && Array.isArray(value.events)
    && Array.isArray(value.correctionEvents)
    && Array.isArray(value.preferenceEvents)
    && Array.isArray(value.feedback)
    && Array.isArray(value.receipts);
};
