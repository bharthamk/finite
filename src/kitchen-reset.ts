import type { RepositoryRequestContext } from "./arrival.js";
import type { ToolResult } from "./types.js";

export const kitchenResetConfirmation = "START OVER";

export type KitchenResetCounts = Record<string, number>;

export type KitchenResetResult = ToolResult & {
  confirmation?: typeof kitchenResetConfirmation;
  counts?: KitchenResetCounts;
  totalRecords?: number;
  receipt?: {
    receiptVersion: "finite-kitchen-reset.v1";
    resetId: string;
    clearedAt: string;
    sourceSurface: "site" | "codex";
    cleared: KitchenResetCounts;
    totalRecords: number;
    replay?: boolean;
  };
};

export interface KitchenResetRepository {
  preview(context?: RepositoryRequestContext): Promise<KitchenResetResult>;
  reset(input: { confirmation: string; idempotencyKey: string; sourceSurface: "site" | "codex" }, context?: RepositoryRequestContext): Promise<KitchenResetResult>;
}

const requestJson = async (url: string, init?: RequestInit): Promise<KitchenResetResult> => {
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        accept: "application/json",
        ...(init?.body ? { "content-type": "application/json" } : {}),
        ...init?.headers,
      },
    });
    return await response.json() as KitchenResetResult;
  } catch (error) {
    if (init?.signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) throw error;
    return {
      ok: false,
      code: "KITCHEN_RESET_SERVICE_UNAVAILABLE",
      message: error instanceof Error ? error.message : String(error),
      acceptedStateChanged: false,
      next: "Nothing was deleted. Re-open the reset preview before retrying.",
    };
  }
};

export class HttpKitchenResetRepository implements KitchenResetRepository {
  preview(context: RepositoryRequestContext = {}): Promise<KitchenResetResult> {
    return requestJson("/api/auth/reset", { ...(context.signal ? { signal: context.signal } : {}) });
  }

  reset(input: { confirmation: string; idempotencyKey: string; sourceSurface: "site" | "codex" }, context: RepositoryRequestContext = {}): Promise<KitchenResetResult> {
    return requestJson("/api/auth/reset", {
      method: "POST",
      ...(context.signal ? { signal: context.signal } : {}),
      body: JSON.stringify(input),
    });
  }
}
