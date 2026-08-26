import type { ModelContextHost } from "./types.js";
import type { FinitePlanRuntime } from "./runtime.js";
import type { FinitePlanWebMCPAdapter, FiniteWebMCPReadiness } from "./webmcp.js";

declare global {
  interface Document {
    modelContext?: ModelContextHost;
  }

  interface Window {
    finiteWebMCPReadiness?: FiniteWebMCPReadiness;
    finiteEnterKitchen?: (input?: unknown, context?: { signal?: AbortSignal }) => Promise<import("./types.js").ToolResult>;
    finitePlanCanary?: {
      runtime: FinitePlanRuntime;
      adapter: FinitePlanWebMCPAdapter | null;
      refresh(): void;
    };
  }
}

export {};
