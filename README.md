# Finite

Finite is an adaptive planning system for plans that must survive change. It is the live replanning layer between human intent, external reality, and agent execution. Codex is the operator, WebMCP is the page-scoped connection, the deterministic kernel owns accepted truth, and the human receives the result and supplies the only consequential approval.

The product is not a travel planner, budgeting dashboard, task manager, or chat wrapper. Money is one constrained resource inside a plan alongside time, capacity, sequence, commitments, preferences, and contingency. One finite-plan grammar compiles into materially different travel, renovation, and event surfaces while preserving the same state, constraint, revision, authority, persistence, and receipt laws.

The governing product direction is in [`PRODUCT_NORTH_STAR.md`](./PRODUCT_NORTH_STAR.md). The defining question is: **Reality changed. What should the plan become now?**

[`ARRIVAL_AND_SURFACE_CONTINUITY.md`](./ARRIVAL_AND_SURFACE_CONTINUITY.md) governs the Site, Codex, and inline-browser relationship: useful input can begin on either primary surface, presence is optional, delays are normal, and every handoff resumes from one durable versioned state.

## What is implemented

- TypeScript finite-plan kernel with exact integer-money conservation.
- Immutable, SHA-256-bound travel, renovation, and event profiles.
- A validated adaptive-surface compiler with a closed safe component grammar, revision-bound intent, mandatory control laws, field bindings, and manifest hashes.
- Three distinct projections: calendar travel timeline, renovation phase lane, and event run-of-show.
- Typed entities, executable relationships, locks, legal moves, evidence materiality/freshness, and preference weights.
- Compiled bounded option search that enumerates legal move combinations, scores explicit preference impacts, returns three distinct objective-shaped options, and exposes its search proof to Codex.
- Compact state selectors, deterministic option simulation, immutable staging, revision-bound approval, atomic apply, and receipts.
- One-call operator orientation: `finite_enter_kitchen` arbitrates arrival-versus-plan work and returns exact accepted truth, one authoritative `nextAction`, known and missing inputs, authority state, and a state-grounded chef menu without asking the human to explain the application.
- A deterministic chef-menu contract distinguishes untested suggestions, research routes, constraint-validated options, and human-authority decisions. Codex may recommend and serve the menu; Finite alone decides when an option is proven viable, and the human alone chooses or authorizes it.
- Content-addressed operation proofs on every stable and contextual WebMCP result, including canonical input/result hashes and exact plan/profile/revision context before and after execution.
- Independent candidate re-derivation at stage, human approval, and apply so mutated numbers, context, hashes, approvals, locked moves, stale events, and impossible plans fail closed.
- One active change-order lifecycle: a replacement order explicitly supersedes and invalidates every volatile candidate, staged packet, and approval from the prior order.
- Immediate WebMCP-to-surface synchronization after tool completion, with revision, active-event, and manifest proof returned to Codex; renderer failure is reported without rewriting the deterministic tool outcome.
- Provenance-bound evidence registration for Codex research: SHA-256 content and record hashes, deterministic identifiers, content deduplication, forced untrusted classification, freshness/materiality assessment, candidate binding, integrity refusal, and accepted-lineage-only persistence.
- Bounded staged plan intake: Codex can submit a complete travel, renovation, or event operating profile; the compiler closes its schema, finite-total arithmetic, actual ledger, entities, relationships, moves, search policy, evidence policy, surface grammar, and implemented contextual-tool contract before the draft exists.
- A clean compiler-valid blueprint plus typed partial-intake assessment: Codex can discover the family contract, translate an incomplete human brief into bounded facts, receive exact missing/conflicting paths, and let code derive one residual allocation without adding an application-owned language model.
- An adaptive-shell compiler that can start useful planning from exact finite limits plus source-labelled working assumptions and typed operator-research, human-coordination, external-evidence, and human-decision dependencies without inventing complete costs, dates, moves, or a seeded vertical plan.
- Durable non-authoritative construction packets: incomplete intake or an exact staged draft survives reload behind checksum, seven-day expiry, evidence integrity, source-plan/revision guards, and—when built from arrival—an exact order id/version/checksum; resuming never restores human confirmation.
- Arrival-first invalidation: newer human input outranks draft review, marks older construction `stale_arrival`, removes its pending authority and activation tool, and forces Codex to reconcile and compile from the current order before anything can be confirmed.
- Exact plan activation authority: a draft remains inert until the human confirms its profile and draft hashes outside WebMCP; Codex can then activate only that bound packet with plan/revision guards and persistent idempotency proof.
- Immutable linear plan amendments: Codex derives a successor from live accepted truth, stages a deterministic semantic diff, and activates only the exact human-confirmed supersession while both versions remain independently switchable and replayable.
- A persistent multi-plan catalog keyed by actual `planId`, including compiled custom plans, bound actual evidence, legacy snapshot fallback, switching, contextual-tool replacement, and reload-safe activation receipts.
- Human-only approval and confirmation creators, structurally excluded from WebMCP.
- Failure-atomic accepted-state persistence: option, actual-correction, and preference commits restore memory, pending work, authority, receipts, and idempotency maps if the snapshot write fails, then permit exact retry.
- Transactional D1 accepted truth: plan heads, immutable revision snapshots, receipts, domain events, and accepted evidence commit behind an async repository boundary with optimistic concurrency and deterministic retry identity.
- Cross-browser restore from D1 with client-side profile, finite-total, receipt, evidence, lineage, and snapshot-hash verification; browser snapshots are now only a best-effort cache when the remote repository is present.
- Server-derived authenticated tenancy: Sites identity is hashed into a private D1 scope, raw identity is not stored, and the first owner atomically adopts the prior `owner-private-v1` lineage once while later tenants receive empty namespaces.
- Zero-credential entry: Sites owns ChatGPT sign-in and first use automatically provisions a private kitchen; signed-out visitors may instead create a 24-hour isolated demo whose HTTP-only bearer, tenant data, and authority traces are purged on end or expiry.
- Expiring cross-device operator sessions preserve bounded work but never accepted truth or human authority; stale, closed, expired, and foreign-tenant packets fail closed.
- Five-minute exact-command human handoff challenges can be resumed only after independent candidate reconstruction and are consumed in the same D1 transaction as the accepted commit.
- Hosted three-family proof: the signed-in owner namespace holds travel, renovation, and event at revision 3 with three stale-base decision sessions, three atomically consumed challenges, and three matching receipts; session transport restored no authority.
- Route-sized WebMCP discovery: the live page advertises only bootstrap/orientation plus the current bounded safe route, with the full catalog available through explicit capability groups. One content-free page-start readiness tool prevents an empty-registry race; `finite_enter_kitchen` is the deterministic first kitchen call from a copied handoff, and all human authority creators remain absent.
- A responsive, keyboard-operable consumption surface with no mobile horizontal overflow.
- Cloudflare Worker APIs for accepted plan truth and durable asynchronous arrival orders, with inspected Drizzle/D1 migrations; there is no backend model or application-owned agent.

## Run

```bash
npm install
npm run typecheck
npm test
npm run build
npm run dev
```

The native Chrome path currently requires `chrome://flags/#enable-webmcp-testing`. A supported host shows `Codex kitchen connected`; the optional diagnostic and explicit authenticated acceptance trace is available at `?lab=1`.

The deployed owner-private build is [Finite](https://finite-plan-kitchen.bharthamk.chatgpt.site). Sign in with ChatGPT to open it.

## Product transaction

1. Codex opens one checksum-bound kitchen brief containing the profile, compact semantic state, move space, pending lifecycle, authority state, and exact next route.
2. Codex records a change, explores legal moves, and composes deterministic options.
3. The application validates and stages one exact option.
4. The human sees the decision packet and approves that exact result.
5. The application atomically applies the approved option and emits a receipt.
6. Accepted truth and replay protection survive browser-empty reload from D1. A bounded operator packet may cross devices, but authority crosses only as an unexpired exact challenge consumed with the accepted write.

Plan creation uses the same authority law: Codex stages a complete compiled plan,
the human confirms the exact hashes on the consumption surface, and Codex invokes
the guarded activation tool. The human-confirmation creator is never registered
with WebMCP. Later structural change derives a new immutable version from current
accepted truth; the human confirms its semantic diff, and the prior version stays
available rather than being silently overwritten.

Construction work has a separate persistence law. The latest typed intake or
compiled draft is saved as an expiring, checksum-bound packet so Codex can safely
resume after reload. The consumer's confirmation is never part of that packet and
must be recreated on the restored exact hashes. Arrival-built construction also
binds the exact human-order id, version, and checksum. If the order advances,
arrival reconciliation takes priority and the old draft cannot be reviewed or
activated.

## Architecture boundary

There is no backend model and no application-owned agent. Natural-language interpretation, research, and orchestration belong to Codex. The application owns state, arithmetic, validation, transaction laws, persistence, rendering, and receipts. WebMCP exposes those capabilities; it does not supply reasoning or persistence.

Chrome-native self-invocation proves the browser protocol independently. A fresh
Codex task has now also completed authenticated live page-tool discovery,
canonical kitchen entry, bounded state reading, delayed human-input
reconciliation, and correct refusal at the human-preference boundary. The
remaining acceptance work is product breadth and repeated operator-quality
testing, not basic Site Tools availability.

## Source map

- `src/profiles.ts` — profile and surface definitions plus compiler validation.
- `src/surface.ts` — safe surface grammar, manifest compiler, bindings, and hashes.
- `src/kernel.ts` — deterministic state machine and authority-gated transactions.
- `src/accepted-truth.ts` — async accepted-truth repository contract, integrity verification, HTTP adapter, and in-memory concurrency test adapter.
- `src/arrival.ts` — arrival-order contract, orientation packet, HTTP client, and in-memory delayed-surface acceptance adapter.
- `worker/accepted-truth.ts` — same-origin D1 API, optimistic-concurrency commit, deterministic replay, and transactional revision/event/receipt/evidence persistence.
- `worker/arrival.ts` — same-origin D1 arrival API with append-only human input, labelled Codex interpretation, operator checkpoints, and fail-closed order-version guards.
- `db/schema.ts` and `drizzle/` — accepted-truth schema and inspected migration.
- `src/persistence.ts` — accepted snapshot, plan catalog, evidence bundle, and activation-receipt storage.
- `src/runtime.ts` — staged plan intake, immutable amendment/version lineage, exact activation, switching, rollback, and reload.
- `src/webmcp.ts` — native host adapter and tool registry.
- `src/main.ts` — adaptive product renderer and human authority surface.
- `PRODUCT_NORTH_STAR.md` — canonical category, operating model, plan grammar, adaptive-surface promise, moat, boundaries, and public narrative.
- `ARRIVAL_AND_SURFACE_CONTINUITY.md` — zero-plan arrival, asynchronous Site/Codex continuity, wrong-surface recovery, lifecycle truth, and version-conflict law.
- `PUBLIC_SURFACE_HANDOFF_2026-08-26.md` — bounded workstream brief for the public product surface; explicitly excludes submission preparation.
- `worker/auth.ts` and `AUTHENTICATION.md` — provider-owned identity, automatic tenant provisioning, isolated demo lifecycle, and the portable self-hosting boundary.
- `src/styles.css` — profile-aware responsive presentation.
- `worker/index.ts` — deployment-only static asset pass-through.
- `tests/` — profile, surface, kernel, persistence, authority, and adapter contracts.
- `SURFACE_ACCEPTANCE_2026-08-26.md` — cross-profile, transaction, reload, responsive, and deployment receipt.
- `SEARCH_ACCEPTANCE_2026-08-26.md` — bounded enumeration, deterministic ranking, mutation/refusal, and three-profile transaction receipt.
- `LIVE_ORDER_ACCEPTANCE_2026-08-26.md` — active-order isolation, lifecycle recovery state, WebMCP-to-surface synchronization, and fail-contained rendering receipt.
- `EVIDENCE_ACCEPTANCE_2026-08-26.md` — researched-evidence admission, quarantine, hashing, deduplication, integrity, event binding, and accepted-lineage persistence receipt.
- `PLAN_INTAKE_ACCEPTANCE_2026-08-26.md` — complete profile compilation, human-confirmed activation, multi-plan persistence/switching, WebMCP authority separation, and refusal receipt.
- `PLAN_CREATION_STORY_LAB_2026-08-26.md` — 12 human and 12 Codex creation stories, results, WebMCP superpowers, friction, blockers, and next engineering ruling.
- `PLAN_AMENDMENT_ACCEPTANCE_2026-08-26.md` — live-state successor derivation, semantic diff, human authority, atomic rollback, immutable switching, lineage integrity, and replay receipt.
- `CONSTRUCTION_PACKET_ACCEPTANCE_2026-08-26.md` — incomplete-intake and staged-draft continuity, checksum/expiry/source guards, evidence restoration, authority loss, explicit discard, and refusal receipt.
- `ARRIVAL_BOUND_CONSTRUCTION_ACCEPTANCE_2026-08-27.md` — exact arrival-source binding, delayed-input invalidation, stale activation refusal, live v24→v26 journey, and deployment proof.
- `BACKEND_ENGINEERING_PLAN_2026-08-26.md` — six paired human/Codex journeys, target backend architecture, persistence split, engineering phases, and quality gates.
- `OPERATOR_BACKEND_ACCEPTANCE_2026-08-26.md` — one-call kitchen orientation, per-operation proofs, failure-atomic writes, and paired travel/renovation/event journey receipt.
- `AUTHENTICATED_HANDOFF_ACCEPTANCE_2026-08-26.md` — authenticated tenancy, one-time legacy adoption, expiring operator sessions, exact human challenges, cross-device family journeys, and isolation/replay/expiry proof.
- `AUTH_ENTRY_ACCEPTANCE_2026-08-26.md` — provider-owned login, first-use kitchen provisioning, isolated demo lifecycle, signed-out WebMCP boundary, and portable OIDC release contract.
