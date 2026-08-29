if (document.modelContext && !location.pathname.startsWith("/share/")) {
  window.finiteWebMCPReadiness = { state: "initializing" };
  document.modelContext.registerTool({
    name: "finite_webmcp_status",
    title: "Check whether the Finite kitchen is ready",
    description: "A minimal page-start bootstrap tool that exposes no plan state, credentials, or human authority.",
    inputSchema: { type: "object", properties: {}, required: [], additionalProperties: false },
    annotations: { readOnlyHint: true },
    execute: async () => {
      const readiness = window.finiteWebMCPReadiness ?? { state: "initializing" };
      if (readiness.state === "ready") return { ok: true, code: "WEBMCP_READY", inventory: readiness.inventory ?? [], acceptedStateChanged: false, next: "Call finite_enter_kitchen from this bootstrap snapshot or refresh discovery for the full catalogue." };
      if (readiness.state === "signed_out") return { ok: false, code: "AUTHENTICATED_USER_REQUIRED", acceptedStateChanged: false, next: "Complete the Site's official sign-in boundary; do not request or transmit credentials through WebMCP." };
      if (readiness.state === "failed") return { ok: false, code: "WEBMCP_INITIALIZATION_FAILED", detail: readiness.detail ?? "Finite did not finish initializing.", acceptedStateChanged: false, next: "Reload the Site. Do not infer plan state from a partial registry." };
      return { ok: true, code: "WEBMCP_INITIALIZING", retryAfterMs: 100, acceptedStateChanged: false, next: "Call the already-visible finite_enter_kitchen tool; it will wait for canonical state. Do not infer that the kitchen has no tools." };
    },
  });
  document.modelContext.registerTool({
    name: "finite_enter_kitchen",
    title: "Enter Finite as the operator",
    description: "A page-start proxy for the canonical Finite kitchen entry. It waits for authenticated state and then returns the same instrumented operator packet as the full registry tool.",
    inputSchema: {
      type: "object",
      properties: {
        entryIntent: { type: "string", enum: ["start_new", "continue_current", "resume_handoff"], description: "Whether to start, continue, or resume a handed-off kitchen." },
        orderId: { type: "string", minLength: 1, maxLength: 200, description: "Canonical human arrival-order identity." },
        sinceVersion: { type: "integer", minimum: 0, description: "Human-change cursor returned by the prior kitchen entry when more page edits remain." },
        expectedOrderVersion: { type: "integer", minimum: 1, description: "Arrival-order event version copied into the handoff." },
        expectedOrderChecksum: { type: "string", minLength: 64, maxLength: 64, description: "Arrival-order checksum copied into the handoff." },
        expectedPlanId: { type: "string", minLength: 1, maxLength: 200, description: "Accepted plan identity copied into the handoff." },
        expectedPlanRevision: { type: "integer", minimum: 1, description: "Accepted plan revision copied into the handoff." },
        expectedProfileHash: { type: "string", minLength: 64, maxLength: 64, description: "Compiled profile hash copied into the handoff." },
        expectedSnapshotHash: { type: "string", minLength: 64, maxLength: 64, description: "Persistence snapshot hash copied into the handoff." },
      },
      required: [],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    execute: async (input = {}, context = {}) => {
      if (context.signal?.aborted) return { ok: false, code: "TOOL_CANCELLED", acceptedStateChanged: false, next: "No operation started. Re-open canonical state before retrying." };
      const deadline = Date.now() + 15_000;
      while (Date.now() < deadline) {
        if (context.signal?.aborted) return { ok: false, code: "TOOL_CANCELLED", acceptedStateChanged: false, next: "No canonical kitchen operation started. Re-open state before retrying." };
        const readiness = window.finiteWebMCPReadiness ?? { state: "initializing" };
        if (readiness.state === "signed_out") return { ok: false, code: "AUTHENTICATED_USER_REQUIRED", acceptedStateChanged: false, next: "Complete the Site's official sign-in boundary; do not request or transmit credentials through WebMCP." };
        if (readiness.state === "failed") return { ok: false, code: "WEBMCP_INITIALIZATION_FAILED", detail: readiness.detail ?? "Finite did not finish initializing.", acceptedStateChanged: false, next: "Reload the Site. Do not infer plan state from a partial registry." };
        if (typeof window.finiteEnterKitchen === "function") return window.finiteEnterKitchen(input, context);
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      return { ok: false, code: "WEBMCP_INITIALIZATION_TIMEOUT", acceptedStateChanged: false, next: "Reload the Site and retry finite_enter_kitchen. Do not reconstruct plan state from the copied handoff." };
    },
  });
}
