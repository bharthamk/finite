import type { ModelContextHost } from "./types.js";
import type { FinitePlanRuntime } from "./runtime.js";
import type { FinitePlanWebMCPAdapter } from "./webmcp.js";

declare global {
  interface Document {
    modelContext?: ModelContextHost;
  }

  interface Window {
    finitePlanCanary?: {
      runtime: FinitePlanRuntime;
      adapter: FinitePlanWebMCPAdapter | null;
      refresh(): void;
    };
  }
}

export {};
