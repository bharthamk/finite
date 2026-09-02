# Immutable Plan Amendment Acceptance — 2026-08-26

## Outcome

Finite can now evolve an accepted plan without editing history in place. Codex
derives a new compiler-valid version from the active accepted allocations,
entities, preferences, corrected actuals, and evidence. The human confirms the
exact compiled profile, draft, and semantic-diff hashes outside WebMCP. Codex
then activates that bound successor through the existing guarded transaction.

The prior version remains immutable and switchable. A superseded version cannot
spawn a competing branch; further amendments must derive from its current
successor.

## Contract proved

1. `finite_get_amendment_blueprint` rolls live accepted truth forward into a new
   plan id while preserving the active plan, hash, and revision as the base.
2. `finite_stage_plan_amendment` requires the same semantic family, a new plan
   id, the exact active revision, and at least one material semantic change.
3. The deterministic diff names allocation deltas, lock changes, preference
   changes, entity-value changes, and every other changed profile section. Its
   hash is bound into the draft, human confirmation, activation receipt, and
   persisted catalog lineage.
4. WebMCP still cannot create human confirmation. A fabricated confirmation id
   is refused without changing accepted truth.
5. Activation persists the prior snapshot, successor snapshot, catalog entry,
   and checksum receipt before changing the active in-memory kernel. An injected
   late receipt-write failure rolls back the successor snapshot and catalog and
   leaves the exact draft available for retry.
6. Both versions remain switchable with their own accepted state and revision.
   Catalog reads show `supersedes`/`supersededBy` lineage.
7. Reload admits a lineage-bearing catalog entry only when its activation receipt
   exists, verifies, and matches the plan/profile/supersession/diff fields.
   Fabricated lineage is quarantined.
8. Exact activation retry replays the persisted receipt without creating another
   version or mutating state.

## Automated receipt

- TypeScript typecheck: pass.
- Production Vite build: pass.
- Runtime dependency audit: zero vulnerabilities.
- Contract suite: **32/32 pass**.
- New amendment cases: live-state derivation, corrected-actual rollover,
  preference rollover, no-op refusal, entity-metadata recognition, family and
  revision guards, exact allocation/lock diff, fabricated authority refusal,
  linear supersession, prior/successor switching, reload, replay, tamper
  quarantine, injected storage rollback, and exact retry.
- WebMCP inventory: **27 stable plus three contextual tools**; all human approval
  and confirmation creators remain absent.

## Product consequence

This closes the evolving-plan failure from the creation-story lab. Versioning is
not a document-history feature bolted onto the UI: it is an operator transaction
that lets Codex change the kitchen while the consumer receives a precise
supersession decision and the application retains auditable history.

The remaining local product gaps are now:

1. construction/intake packets are volatile across reload;
2. the semantic compiler still has only travel, renovation, and event families;
3. fresh Codex Site Tools discovery remains externally unprovisioned.

The next experiment should make unfinished construction work resumable without
persisting human authority or confusing a draft with accepted truth. Submission
packaging remains later.
