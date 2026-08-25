# Finite

Finite is an agent-operated adaptive planning surface. Codex is the operator, WebMCP is the page-scoped socket, the deterministic kernel owns accepted truth, and the human receives the result and supplies the only consequential approval.

The product is not a travel planner or a generic budgeting dashboard. One finite-plan grammar compiles into materially different travel, renovation, and event surfaces while preserving the same arithmetic, revision, authority, persistence, and receipt laws.

## What is implemented

- TypeScript finite-plan kernel with exact integer-money conservation.
- Immutable, SHA-256-bound travel, renovation, and event profiles.
- A validated adaptive-surface compiler with a closed safe component grammar, revision-bound intent, mandatory control laws, field bindings, and manifest hashes.
- Three distinct projections: calendar travel timeline, renovation phase lane, and event run-of-show.
- Typed entities, executable relationships, locks, legal moves, evidence materiality/freshness, and preference weights.
- Compact state selectors, deterministic option simulation, immutable staging, revision-bound approval, atomic apply, and receipts.
- Human-only approval and confirmation creators, structurally excluded from WebMCP.
- Accepted-state persistence with reload-safe receipt idempotency.
- 18 stable WebMCP tools plus three profile-contextual tools, dynamically replaced on profile switch.
- A responsive, keyboard-operable consumption surface with no mobile horizontal overflow.
- A Cloudflare Worker-compatible pass-through deployment shell; there is no backend model or application-owned agent.

## Run

```bash
npm install
npm run typecheck
npm test
npm run build
npm run dev
```

The native Chrome path currently requires `chrome://flags/#enable-webmcp-testing`. A supported host shows `Codex kitchen connected`; the optional diagnostic trace is available at `?lab=1`.

The deployed owner-private build is [Finite](https://finite-plan-kitchen.bharthamk.chatgpt.site). Sign in with ChatGPT to open it.

## Product transaction

1. Codex discovers the profile and compact semantic state.
2. Codex records a change, explores legal moves, and composes deterministic options.
3. The application validates and stages one exact option.
4. The human sees the decision packet and approves that exact result.
5. The application atomically applies the approved option and emits a receipt.
6. Accepted truth and replay protection survive reload; volatile staging and authority do not.

## Architecture boundary

There is no backend model and no application-owned agent. Natural-language interpretation, research, and orchestration belong to Codex. The application owns state, arithmetic, validation, transaction laws, persistence, rendering, and receipts. WebMCP exposes those capabilities; it does not supply reasoning or persistence.

Chrome-native self-invocation proves the browser protocol and page contract. It does not prove Codex Site Tools discovery, model tool selection, safety review, or fresh-session behavior. Those remain a separate acceptance gate until the Codex account/build exposes page tools.

## Source map

- `src/profiles.ts` — profile and surface definitions plus compiler validation.
- `src/surface.ts` — safe surface grammar, manifest compiler, bindings, and hashes.
- `src/kernel.ts` — deterministic state machine and authority-gated transactions.
- `src/persistence.ts` — accepted snapshot storage.
- `src/runtime.ts` — active-profile lifecycle.
- `src/webmcp.ts` — native host adapter and tool registry.
- `src/main.ts` — adaptive product renderer and human authority surface.
- `src/styles.css` — profile-aware responsive presentation.
- `worker/index.ts` — deployment-only static asset pass-through.
- `tests/` — profile, surface, kernel, persistence, authority, and adapter contracts.
- `SURFACE_ACCEPTANCE_2026-08-26.md` — cross-profile, transaction, reload, responsive, and deployment receipt.
