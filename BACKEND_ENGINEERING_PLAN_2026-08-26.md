# Finite operator-backend engineering plan

Date: 2026-08-26  
Status: active build plan, not submission preparation  
Product law: Codex is the operator; the human is the consumer.

## 1. Outcome

Build an operator-grade deterministic control plane that lets Codex turn a
small human order into a safe, adaptive finite plan without making the human
operate budgeting software and without hiding consequential decisions inside
an application-owned agent.

The backend is successful when:

1. a human can state an outcome in ordinary language, answer only genuinely
   missing questions, compare intelligible trade-offs, provide exact authority,
   and consume an adapted result;
2. Codex can discover the whole live kitchen in one bounded read, bring in
   outside evidence as quarantined data, produce and compare legal options,
   stage one exact decision, wait for human authority, apply it idempotently,
   and verify the durable result;
3. the same laws hold for travel, renovation, and event plans even though the
   state, actions, constraints, language, and consumer projection differ;
4. every consequential transition is revision-bound, hash-bound,
   failure-atomic, replay-safe, observable, and recoverable; and
5. a model can be clever without the application trusting model-generated
   arithmetic, code, tools, approval, or state transitions.

## 2. Non-negotiable boundaries

- Codex interprets the human and chooses which deterministic capability to use.
- The application owns schemas, arithmetic, constraints, search, hashing,
  revision control, persistence, idempotency, and receipts.
- The human surface alone creates approval or confirmation authority.
- WebMCP never exposes a tool that manufactures human authority.
- External evidence is untrusted content, never executable instruction.
- Accepted truth, unfinished construction work, authority, and UI preference are
  separate persistence classes.
- A visual refresh can fail without rewriting the result of a deterministic
  backend operation.
- A storage failure cannot leave in-memory accepted truth ahead of durable truth.
- No generic chat backend and no application-owned reasoning model are required.

## 3. The six release-gate journeys

Each family has two inseparable journeys. The human journey proves that the
consumer gets an outcome. The Codex journey proves that the kitchen can create
that outcome without the human operating the machinery.

### A. Travel — extend the useful trip without losing control

#### Human consumer journey T-H

1. The human says: “Add three nights in Paris, keep the international flights,
   and leave at least A$500 free.”
2. The surface presents the interpreted order in travel language: trip length,
   booked days, fixed flights, forecast, and freedom left.
3. If a material price or date is missing, the human is asked only for that
   fact. They are not asked to allocate a spreadsheet or choose an algorithm.
4. The surface shows distinct routes with the real sacrifice attached: fewer
   Netherlands nights, more hostel nights, cheaper meals, or another legal mix.
5. The human selects or rejects one exact route and acknowledges any warning.
6. After approval, the trip surface updates to the new dates, allocations, and
   freedom; it explains what changed and what remained protected.
7. Reload shows the same accepted trip and receipt. An interrupted approval
   never silently completes.

#### Codex kitchen journey T-C

1. Open the kitchen and receive one compact, hash-bound brief containing the
   active plan, revision, allocations, constraints, entities, preferences,
   pending work, legal moves, authority state, and exact next route.
2. Register current lodging or rail evidence if it matters; the app assigns
   untrusted provenance and validates freshness.
3. Compile the order through `travel_extend_stay` or the generic typed change
   event, bound to the active revision and evidence.
4. Ask the kernel to enumerate the bounded legal move space and return distinct,
   ranked decision packets.
5. Stage exactly one canonical option. Re-derivation must catch any mutation.
6. Stop at the human gate. Codex can explain the option but cannot approve it.
7. Apply only the exact human-approved candidate with a fresh idempotency key.
8. Verify the operation proof and accepted receipt, then re-open the kitchen and
   confirm the new revision and empty pending state.

### B. Renovation — absorb a supplier problem without breaking handover

#### Human consumer journey R-H

1. The human says: “The imported tile is ten days late. Keep the handover date
   and protect at least A$1,000 contingency if we can.”
2. The surface becomes a phase/critical-path view, not a travel timeline or
   generic budget table. It foregrounds completion day, committed handover,
   current phase, forecast, and contingency.
3. The human sees that structural scope and completion date are protected, and
   that finishes or sequencing are movable.
4. Options state the practical trade-off: local tile, resequenced painting,
   weekend labour, simpler splashback, or a legal combination.
5. The human approves one exact recovery plan or returns it with taste feedback.
6. The accepted build updates once, produces a receipt, and preserves prior
   evidence and actual corrections as append-only history.
7. Reload restores the same handover-safe plan. A stale quote, changed revision,
   or failed save leaves the previous accepted build intact.

#### Codex kitchen journey R-C

1. Open the same generic kitchen brief, now compiled with renovation nouns,
   phase entities, constraints, moves, and contextual capabilities.
2. Admit the supplier quote as evidence and inspect its freshness/materiality.
3. Record the supplier or phase change against the exact build revision.
4. Enumerate only moves that do not violate the locked completion date or
   structural scope.
5. Compare options by schedule, contingency, and the human’s finish preference.
6. Stage one canonical recovery plan and hand the exact diff to the surface.
7. Wait for human authority, then apply idempotently.
8. Verify that completion remains within the committed day, the finite total
   still conserves, the evidence is in accepted lineage, and a durable receipt
   proves the transition.

### C. Event — welcome more people without breaking the room or the show

#### Human consumer journey E-H

1. The human says: “We need fifteen more guests. Keep the venue, doors time,
   and guest experience; tell me what gives.”
2. The surface becomes a run-of-show and capacity view. It foregrounds guest
   count, venue capacity, deposits, forecast, contingency, and show stages.
3. The human sees whether the request fits the room before seeing cosmetic
   budget choices.
4. Options make the actual sacrifice visible: service level, menu, sponsored
   AV, program length, or a legal combination.
5. The human approves one exact show plan or rejects it with feedback.
6. The accepted show updates headcount and finances together, never exceeding
   capacity and never shifting doors time through an unrelated move.
7. Reload restores the same run-of-show, capacity, accepted receipt, and current
   revision.

#### Codex kitchen journey E-C

1. Open the generic kitchen brief and receive event-specific capacity entities,
   run-of-show stages, locks, moves, and tools.
2. Register any current caterer or venue evidence as untrusted input.
3. Compile the headcount request into both cost and entity change through
   `event_change_headcount`.
4. Ask deterministic search for distinct legal show plans. Capacity violation
   must invalidate a candidate regardless of model preference.
5. Stage the best canonical option for the stated guest-experience preference.
6. Stop for human authority.
7. Apply once with revision and idempotency guards.
8. Verify that the accepted guest count is within capacity, the finite total is
   conserved, pending authority is cleared, and the receipt reloads.

## 4. Shared journey contract

Every journey follows the same state machine:

`orient → evidence/intake → typed change → bounded search → exact stage → human authority → consequential apply → receipt/re-orient`

Family adaptation is data and compiled policy. The transaction laws are shared.
No family may receive a privileged shortcut around evidence, search,
human-authority, persistence, or receipt checks.

The release gate for a backend phase is therefore a 3 × 2 matrix:

| Gate | Travel | Renovation | Event |
| --- | --- | --- | --- |
| Human gets the intended outcome | T-H | R-H | E-H |
| Codex can operate the kitchen safely | T-C | R-C | E-C |

A feature is not complete when only its unit tests pass. It is complete when all
six affected journeys pass from a fresh state, including at least one refusal,
one reload, and one injected persistence failure where relevant.

## 5. Target backend architecture

### 5.1 WebMCP operator socket

- Small stable tools expose cross-family laws.
- Three contextual tools expose the current family’s most natural operations.
- Tool discovery changes when the active plan changes.
- Every result carries an operation proof: input hash, before/after context,
  result code, state-change claim, and content hash.
- A single `finite_open_kitchen` read gives Codex enough verified context to
  choose the next call without reconstructing state through many speculative
  reads.

### 5.2 Application command gateway

All writes pass through one internal gateway even when they retain separate
typed WebMCP schemas. The gateway owns:

- input bounds and normalization;
- plan/profile/revision preconditions;
- operation and idempotency identity;
- authority-class checks;
- failure-atomic commit;
- structured refusal and recovery instructions;
- before/after operation proofs; and
- observability metadata with no private content leakage.

The public tool layer must not call persistence directly.

### 5.3 Deterministic domain kernel

The kernel remains the source of domain truth:

- integer minor-unit arithmetic;
- finite-total conservation;
- relationship and lock evaluation;
- evidence freshness/materiality;
- bounded legal-move enumeration;
- deterministic candidate identity and ranking;
- independent candidate re-derivation at stage, authority, and apply;
- append-only correction and preference events; and
- immutable plan-version lineage.

### 5.4 Workflow coordinator

The coordinator owns the generic state machine, not domain reasoning:

- exactly one active same-revision order;
- invalidation of superseded candidates, stage, and approval;
- precise next-action projection;
- non-authoritative construction continuity;
- human-handoff state; and
- recovery after reload or retry.

### 5.5 Authority boundary

Authority records are volatile, short-lived, exact-content bindings created
only by a human interaction. They are never accepted merely because a request
contains an approval-looking identifier. A reload deliberately destroys them.

Future multi-device authority may use a short-lived server challenge, but only
after identity and replay semantics are designed together. It must never become
a durable “approved=true” flag.

### 5.6 Persistence and transaction layer

Persistence is divided by truth class:

| State | Current correct home | Target home |
| --- | --- | --- |
| Accepted plan snapshots and receipts | D1 transactional records | D1 transactional records |
| Immutable plan definitions and lineage | catalog remains device-local; accepted activation head is D1-initialized | D1 catalog transaction after authenticated tenancy is designed |
| Accepted evidence metadata/content | D1 records referenced by accepted snapshots | D1; R2 only for future source files |
| Incomplete intake/draft | seven-day device-local packet | remain local unless cross-device continuation is explicitly required |
| Human approval/confirmation | memory only | memory or short-lived identity-bound challenge; never durable authority |
| Active projection preference | device local | device local |

The D1 migration is earned before real multi-session/product use because
accepted product truth must survive devices and browser clearing. D1 tables
should be append-oriented:

- `plans` — immutable version identity and active/superseded pointers;
- `plan_revisions` — accepted state snapshots and prior revision hash;
- `domain_events` — accepted typed transitions;
- `receipts` — unique `(plan_id, idempotency_key)` and replay checksum;
- `evidence_records` — provenance, content hash, record hash, trust, and policy
  assessment metadata;
- `operation_log` — redacted operator proof and outcome code;
- `schema_migrations` — explicit deployed schema version.

Each consequential command should execute in one D1 transaction or fail with no
accepted mutation. Local prototype commits must provide the same observable
failure-atomic semantics so the domain layer does not depend on storage quality.

### 5.7 Projection layer

Consumer surfaces are compiled projections of accepted and pending state. They
cannot mutate domain state directly except through explicit human-action ports.
Manifest hashes bind a projection to plan/profile/revision. A renderer error is
reported separately from the backend operation.

### 5.8 Evidence boundary

- Codex may submit external findings.
- The gateway strips authority, assigns untrusted trust, validates schema and
  size, hashes content and provenance, and deduplicates exact content.
- Policies decide freshness and materiality; evidence text is never executed.
- Only evidence referenced by accepted lineage becomes durable product truth.
- Future file bytes go to R2; searchable metadata remains in D1.

### 5.9 Observability and audit

Every tool operation emits a content-addressed proof containing:

- tool name and input hash;
- plan id, profile hash, and revision before and after;
- result code;
- accepted-state-change claim;
- whether active context changed;
- operation hash; and
- surface-sync status when relevant.

Production telemetry records codes, duration, version, and hashes—not human
briefs, evidence content, confirmations, or personal data. Receipts remain the
authoritative audit artifact; telemetry is diagnostic only.

## 6. Engineering phases

### Phase 0 — executable architecture and journey harness

Deliverables:

- this plan;
- named T-H/T-C, R-H/R-C, and E-H/E-C acceptance fixtures;
- one fresh-runtime factory per family;
- assertions for finite total, protected constraints, exact authority,
  idempotency, reload, and pending-state cleanup;
- failure injection at the persistence port.

Exit: all existing tests remain green and the six journey contracts are
executable rather than prose-only.

### Phase 1 — operator control plane and failure-atomic local commits

Deliverables:

- `finite_open_kitchen` compact orientation packet;
- operation proof on every stable and contextual WebMCP result;
- generic before/after context capture;
- rollback of every accepted option, preference, and correction mutation when
  durable snapshot save fails;
- exact structured recovery codes;
- paired-journey acceptance across all three families.

Exit: Codex can orient in one call; every operation is self-auditing; injected
save failure leaves both accepted memory and durable snapshot unchanged.

### Phase 2 — repository ports and transactional durable truth

Deliverables:

- async repository interfaces independent of browser storage;
- D1 schema and inspected migrations;
- one transaction for revision, event, receipt, evidence lineage, and active
  plan pointer;
- unique revision and idempotency constraints;
- optimistic concurrency on `(plan_id, revision, profile_hash)`;
- catalog and snapshot reads that verify hash chains;
- local adapter retained for fast tests.

Exit: two concurrent operators cannot both commit revision N → N+1; retry
returns the original receipt; process interruption produces either the complete
transition or none of it.

### Phase 3 — durable operator sessions without durable authority

Status: implemented and locally accepted on 2026-08-26; hosted D1 receipt pending.

Deliverables:

- short-lived operator session identity and correlation id;
- resumable non-authoritative work references;
- explicit human-handoff challenge bound to content, identity, origin, expiry,
  and single use;
- confirmation consumption in the same consequential transaction;
- deliberate invalidation on plan/revision change.

Exit: cross-device continuation is possible without turning confirmation into a
replayable durable permission.

Implementation note: Sites identity now derives the tenant server-side; the
first owner atomically adopts the legacy owner-private lineage once. Expiring
operator packets bind exact plan/profile/revision work, while an independently
rebuilt candidate may resume one five-minute human-created challenge. Challenge
consumption shares the accepted D1 batch, and receipt-first replay preserves
lost-response recovery after that once-only consumption.

### Phase 4 — semantic-family grammar expansion

Deliverables are earned from recurring-period and milestone/project story labs,
not guessed in advance. Likely shared primitives to test:

- time shapes: calendar span, ordered phases, run-of-show, recurring periods,
  milestone dependency graph;
- quantities and capacities;
- deadlines and dependency relationships;
- replenishing versus finite totals;
- move effects across money, time, quantity, and dependency fields;
- family-owned contextual tool contracts.

Exit: a fourth family compiles without weakening the closed grammar or adding
generated code/arbitrary tool execution.

### Phase 5 — production resilience and operational readiness

Deliverables:

- schema compatibility policy and migration rehearsal;
- export/import and disaster-recovery verification;
- property-based invariant tests and deterministic replay tests;
- load and latency budgets;
- redacted metrics, trace sampling, and refusal-rate dashboards;
- rate limits and payload budgets;
- dependency and supply-chain policy;
- threat-model review of WebMCP, evidence, authority, and cross-origin paths.

Exit: recovery drills and journey suites pass against the deployed persistence
adapter, not only the in-memory test adapter.

## 7. Quality gates

### Correctness

- All monetary values are safe integers in minor units.
- Every accepted allocation conserves the finite total.
- Every entity relationship evaluates after a candidate and after apply.
- A candidate’s canonical content is independently re-derived three times.
- Accepted revision increments exactly once per consequential command.
- Idempotent replay returns the original receipt and no state change.

### Safety

- No WebMCP authority creator exists.
- Confirmation source must be `human_action` and exact-content bound.
- Stale revision, stale plan, stale profile, mutated evidence, and mutated
  candidate all fail closed.
- Untrusted evidence content can never change policy or invoke a tool.
- A surface intent cannot hide required approval or constraint controls.

### Reliability

- Accepted write is failure-atomic.
- All accepted truth reloads with the same hash and receipt.
- Incomplete work may resume; authority never does.
- Multi-key activation uses a transaction in the durable adapter.
- Recovery instructions identify the exact safe next action.

### Operator experience

- One orientation call is sufficient to select the next operation.
- Results always include before/after context and an operation proof.
- Contextual tool discovery matches the active family.
- Refusals are typed and actionable, not generic exceptions.
- The complete happy path remains small enough for Codex to operate reliably.

### Consumer experience

- The human supplies goals, facts, feedback, and authority—not system commands.
- Each family exposes its natural measures and time shape.
- Options state sacrifice and protected constraints.
- Applied results explain what changed, what stayed fixed, and the remaining
  room to move.

## 8. Implementation decision and current phase

Phase 1 and Phase 2 are complete.

Accepted truth now crosses an async repository port into one D1 batch for the
head compare-and-swap, immutable revision, receipt, domain event, accepted
evidence, and optional operation record. Receipt identity is deterministic, so
a response lost after commit can replay the same request. A browser-empty
runtime rehydrates from D1 and independently verifies the profile, finite total,
receipt/evidence hashes, revision lineage, actual ledger, and snapshot hash.

The current deployment is deliberately single-owner. Its scope is
`owner-private-v1`, backed by owner-only Sites access. It must not be shared or
treated as multi-tenant until authenticated user scoping is part of every key,
query, idempotency record, and authorization decision. Temporary construction
packets remain device-local and human authority remains volatile.

## 9. Phase 1 definition of done

1. `finite_open_kitchen` returns a checksum-bound brief for travel, renovation,
   and event with the exact family semantics and next action.
2. Every WebMCP result contains an operation proof whose before/after context
   matches the live runtime.
3. Option, preference, and correction apply paths roll back in-memory state,
   pending work, receipts, and idempotency maps when snapshot persistence fails.
4. T-H/T-C, R-H/R-C, and E-H/E-C pass on fresh runtimes.
5. Each family completes record → search → stage → human approval → apply →
   receipt → reload.
6. At least one injected save failure per consequential mutation class proves
   no accepted change.
7. Existing profile, evidence, intake, amendment, construction, surface, search,
   and WebMCP suites remain green.
8. The exact validated source is deployed owner-private; project truth and
   traces name the proof. Submission artifacts remain untouched.

## 10. Phase 2 completion receipt

1. Drizzle produced an inspected migration for seven D1 tables and all query
   indexes; the packaged migration includes `PRAGMA optimize`.
2. The remote repository initializes or restores exact accepted truth and
   refuses profile-hash drift.
3. One D1 batch owns head compare-and-swap, immutable revision, receipt, domain
   event, and accepted evidence records.
4. Competing revision-N operators produce exactly one winner; the loser restores
   its full approved checkpoint and must rehydrate before rebuilding.
5. A response lost after the durable commit retries with the same deterministic
   receipt and receives repository replay rather than a second transition.
6. Tampered durable envelopes fail client verification before consequential
   work.
7. Travel, renovation, and event each commit live revision 1 → 2 and restore
   revision 2 from an empty browser store.
8. The exact source and migration are deployed owner-private as Sites version
   11; live D1 inspection shows three revision-2 heads, six immutable revisions,
   three receipts, three domain events, and accepted evidence rows.
