# Operator backend acceptance — 2026-08-26

## Outcome

Finite now has the first operator-grade backend control-plane slice across all
three current uses.

Codex can open the whole live kitchen in one read, see the family-specific human
outcome and exact deterministic state, follow a precise next route, and receive
a content-addressed before/after proof for every WebMCP operation. Consequential
option, correction, and preference writes are failure-atomic: if durable
snapshot storage refuses the write, accepted memory, revision, receipt maps,
pending work, and human authority all roll back to the exact retryable state.

The detailed target architecture and phased route live in
`BACKEND_ENGINEERING_PLAN_2026-08-26.md`.

## The six paired journeys

| Journey | Human outcome | Codex kitchen proof | Result |
| --- | --- | --- | --- |
| T-H | Add three Paris nights while keeping flights and at least A$500 freedom | Travel projection exposes calendar measures and exact trade-offs | Pass |
| T-C | Orient, record extension, search, stage, wait, apply once, verify, reload | `travel_extend_stay` → bounded options → exact human approval → receipt | Pass |
| R-H | Absorb the imported-tile delay while preserving handover and contingency | Renovation projection exposes phases, completion relationship, and recovery sacrifices | Pass |
| R-C | Orient, compile supplier change, search only legal moves, stage, wait, apply, reload | `renovation_replace_material` preserves `completion_day <= committed_completion_day` | Pass |
| E-H | Add fifteen guests while keeping the venue, doors time, and experience | Event projection exposes capacity and run-of-show before cosmetic budget choices | Pass |
| E-C | Orient, compile cost plus quantity change, search, stage, wait, apply, verify capacity | `event_change_headcount` reaches 115/120 with receipt and reload | Pass |

Each executable family journey starts from a fresh runtime and completes:

`open kitchen → contextual change → bounded compare → exact stage → human approval → idempotent apply → invariant checks → replay → reload`

The human approval creator is called only through the test’s human-surface port.
It is not present in the WebMCP registry.

## `finite_open_kitchen`

The new stable read returns one `finite-plan-kitchen.v1` packet containing:

- exact plan id, family, profile hash, and revision;
- the human’s current ordered outcome;
- family time model, nouns, headline, and primary measures;
- allocations, actuals, locks, relationships, entities, preferences, and
  pending lifecycle state;
- compact legal and blocked move summaries plus search bounds;
- current change event and construction-packet status;
- active catalog context;
- the exact next tool or explicit human handoff; and
- the authority law.

The packet has a SHA-256 `briefHash`. Travel opens with `calendar` and
`travel_extend_stay`; renovation with `phases` and
`renovation_replace_material`; event with `run_of_show` and
`event_change_headcount`. After staging, all three return `awaiting_human` with
no next tool. After human approval, all three return
`finite_apply_approved_option`.

## Operation proof

Every registered stable and contextual tool is wrapped with a
`finite-plan-operation.v1` proof containing:

- canonical transport input hash;
- result hash;
- result code;
- plan id, profile id, profile hash, and revision before and after;
- the tool’s accepted-state-change claim;
- whether active context changed; and
- a hash over the complete proof body.

The adapter adds the proof after deterministic execution and optional surface
synchronization, so renderer failure remains visible but cannot alter the
kernel result. Acceptance recomputes both result and proof hashes.

## Failure-atomic accepted writes

The kernel now checkpoints every mutable field touched by a consequential
option, actual-correction, or preference-change commit:

- revision and accepted allocation;
- entities and preference weights;
- events and receipts;
- candidate/stage/approval state;
- correction/preference pending state and confirmations; and
- all three idempotency maps.

An injected snapshot write failure returns
`ACCEPTED_STATE_STORAGE_FAILED`, `acceptedStateChanged: false`, the mutation
class, the unchanged plan/revision, an exact-retry instruction, and
`retryable: true`. The test then retries the same confirmed command with the
same idempotency key and succeeds exactly once.

This closes the prior local hazard where an exception after in-memory mutation
could leave the visible accepted state ahead of the durable snapshot.

## Verification receipt

- 40/40 tests pass.
- The six paired journey gates pass.
- Failure injection passes for `plan_option`, `actual_correction`, and
  `preference_change`.
- TypeScript library compilation passes.
- Vite production build passes.
- Runtime dependency audit reports zero vulnerabilities.
- WebMCP registry is 31 stable plus three contextual tools.
- Human approval/confirmation creators remain structurally absent.

## Persistence ruling

Temporary intake and draft packets remain device-local because they are
non-authoritative mise en place. Human authority remains memory-only because a
reload must destroy it.

Accepted production truth should move to D1 in the next backend phase, behind
async repository ports and one transactional revision/event/receipt/evidence
commit. It should not be bolted directly into the browser kernel or represented
as a best-effort mirror. Identity and any future cross-device authority must be
designed together; no durable `approved` flag will be introduced.

## Remaining backend work

1. Extract async accepted-truth repository ports.
2. Add D1 schema and inspected migrations.
3. Commit revision, event, receipt, accepted evidence lineage, and active-plan
   pointer in one transaction with optimistic concurrency.
4. Prove two concurrent revision-N writers cannot both win.
5. Verify hash-chained restore and disaster recovery.
6. Only then design short-lived cross-device operator/human handoff.

Semantic-family expansion and submission preparation remain separate later
work. The backend transaction boundary is now the next engineering phase.
