# Finite Plan production kernel

This package is the browser-ready implementation of the Finite Plan control plane. Codex is the operator, WebMCP is the page-scoped socket, the deterministic kernel owns accepted truth, and the human surface is the only place that can create approval or confirmation identifiers.

It is intentionally not a finished product UI. The included page is a native-host diagnostic canary used to prove the protocol, transaction, authority, profile-lifecycle, persistence, and retry boundaries before presentation work begins.

## What is implemented

- TypeScript finite-plan kernel with exact integer-money conservation.
- Compiled and SHA-256-hashed travel, renovation, and event profiles.
- Typed entities, executable relationships, locks, legal moves, evidence materiality/freshness, and preference weights.
- Compact semantic state selectors rather than one oversized state dump.
- Proposed change events, deterministic option simulation/comparison, immutable staging, revision-bound approval, atomic apply, and receipts.
- Staged human-confirmed append-only actual correction and preference interpretation.
- Local accepted-state snapshots and reload-safe idempotency indexes rebuilt from persisted receipts.
- 18 stable WebMCP tools plus three profile-contextual tools, dynamically replaced on profile switch.
- Compatibility with both object input and Chrome 151's experimental serialized-JSON input.
- Structural exclusion of `humanApprove`, `humanConfirmActualCorrection`, and `humanConfirmPreferenceChange` from WebMCP registration.

## Run

```bash
npm install
npm run typecheck
npm test
npm run build
npm run dev
```

The native Chrome canary currently requires `chrome://flags/#enable-webmcp-testing` to be enabled. Open the local URL printed by Vite. A passing host shows `Native WebMCP registered`, a secure and cross-origin-isolated context, and 21 registered tools.

The visible acceptance controls intentionally separate the paths:

1. the native agent path discovers tools, records a change, compares and stages an option, then proves a fabricated approval is refused;
2. the human-authority control creates approval bound to the exact staged content and revision;
3. the native agent applies that approval and persists a receipt;
4. after reload, the native retry returns `IDEMPOTENT_REPLAY` without changing the accepted revision;
5. the profile lifecycle replaces travel tools with renovation tools and restores them.

## Architecture boundary

There is no backend model and no application-owned agent. Natural-language interpretation, research, and orchestration belong to Codex. The application owns state, arithmetic, validation, transaction laws, persistence, and receipts. WebMCP exposes those capabilities; it does not supply reasoning or persistence.

Chrome-native self-invocation proves the browser protocol and page contract. It does not prove Codex Site Tools discovery, model tool selection, safety review, or fresh-session behavior. Those remain a separate acceptance gate until the Codex account/build exposes the page tools.

## Source map

- `src/profiles.ts` — profile definitions and compiler.
- `src/kernel.ts` — deterministic state machine and authority-gated transactions.
- `src/persistence.ts` — accepted snapshot storage.
- `src/runtime.ts` — active-profile lifecycle.
- `src/webmcp.ts` — native host adapter and tool registry.
- `src/main.ts` — diagnostic canary only.
- `tests/` — profile, kernel, persistence, authority, and adapter contracts.

