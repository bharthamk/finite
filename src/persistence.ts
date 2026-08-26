import { clone } from "./crypto.js";
import type { PlanActivationReceipt, PlanCatalogEntry, PlanConstructionPacket, PlanSnapshot, ProfileDefinition } from "./types.js";

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

  private key(planId: string): string {
    return `${this.namespace}:${planId}`;
  }

  save(snapshot: PlanSnapshot): void {
    this.storage.setItem(this.key(snapshot.planId), JSON.stringify(snapshot));
  }

  load(planId: string, expectedProfileHash: string, legacyProfileId?: string): PlanSnapshot | null {
    const raw = this.storage.getItem(this.key(planId)) ?? (legacyProfileId ? this.storage.getItem(this.key(legacyProfileId)) : null);
    if (!raw) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.storage.removeItem(this.key(planId));
      return null;
    }
    if (!isPlanSnapshot(parsed) || parsed.planId !== planId || parsed.profileHash !== expectedProfileHash) return null;
    return clone(parsed);
  }

  clear(planId: string): void {
    this.storage.removeItem(this.key(planId));
  }
}

export class PlanCatalogStore {
  constructor(
    private readonly storage: StoragePort,
    private readonly key = "finite-plan.catalog.v1",
    private readonly receiptKey = "finite-plan.activation-receipts.v1",
    private readonly constructionKey = "finite-plan.construction.v1",
  ) {}

  load(): PlanCatalogEntry[] {
    const raw = this.storage.getItem(this.key);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return clone(parsed.filter((entry): entry is PlanCatalogEntry => isRecord(entry) && isRecord(entry.definition) && Array.isArray(entry.evidenceRecords)));
    } catch {
      return [];
    }
  }

  save(definition: ProfileDefinition, evidenceRecords: PlanCatalogEntry["evidenceRecords"], lineage?: PlanCatalogEntry["lineage"]): void {
    const entries = this.load().filter((entry) => entry.definition.planId !== definition.planId);
    entries.push({ definition: clone(definition), evidenceRecords: clone(evidenceRecords), ...(lineage ? { lineage: clone(lineage) } : {}) });
    this.storage.setItem(this.key, JSON.stringify(entries));
  }

  remove(planId: string): void {
    const entries = this.load().filter((entry) => entry.definition.planId !== planId);
    this.storage.setItem(this.key, JSON.stringify(entries));
  }

  loadActivationReceipts(): PlanActivationReceipt[] {
    const raw = this.storage.getItem(this.receiptKey);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? clone(parsed.filter(isPlanActivationReceipt)) : [];
    } catch {
      return [];
    }
  }

  saveActivationReceipt(receipt: PlanActivationReceipt): void {
    const receipts = this.loadActivationReceipts().filter((existing) => existing.idempotencyKey !== receipt.idempotencyKey);
    receipts.push(clone(receipt));
    this.storage.setItem(this.receiptKey, JSON.stringify(receipts));
  }

  removeActivationReceipt(idempotencyKey: string): void {
    this.storage.setItem(this.receiptKey, JSON.stringify(this.loadActivationReceipts().filter((receipt) => receipt.idempotencyKey !== idempotencyKey)));
  }

  loadConstructionPacket(): PlanConstructionPacket | null {
    const raw = this.storage.getItem(this.constructionKey);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!isPlanConstructionPacket(parsed)) {
        this.storage.removeItem(this.constructionKey);
        return null;
      }
      return clone(parsed);
    } catch {
      this.storage.removeItem(this.constructionKey);
      return null;
    }
  }

  saveConstructionPacket(packet: PlanConstructionPacket): void {
    this.storage.setItem(this.constructionKey, JSON.stringify(clone(packet)));
  }

  clearConstructionPacket(): void {
    this.storage.removeItem(this.constructionKey);
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
    && (value.evidenceRecords === undefined || Array.isArray(value.evidenceRecords))
    && Array.isArray(value.receipts);
};

const isPlanActivationReceipt = (value: unknown): value is PlanActivationReceipt => isRecord(value)
  && typeof value.receiptId === "string"
  && typeof value.idempotencyKey === "string"
  && typeof value.fromPlanId === "string"
  && typeof value.toPlanId === "string"
  && typeof value.profileId === "string"
  && typeof value.profileHash === "string"
  && typeof value.draftId === "string"
  && typeof value.confirmationId === "string"
  && typeof value.replayChecksum === "string";

const isPlanConstructionPacket = (value: unknown): value is PlanConstructionPacket => isRecord(value)
  && value.packetVersion === "finite-plan-construction.v1"
  && (value.kind === "intake" || value.kind === "draft")
  && typeof value.packetId === "string"
  && typeof value.basePlanId === "string"
  && typeof value.baseProfileHash === "string"
  && Number.isInteger(value.baseRevision)
  && typeof value.createdAt === "string"
  && typeof value.expiresAt === "string"
  && typeof value.checksum === "string"
  && isRecord(value.payload);
