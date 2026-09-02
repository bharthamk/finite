# Accepted-truth D1 acceptance — 2026-08-26

## Outcome

Finite's accepted truth is no longer browser-owned. The deterministic kernel
still decides what may change, Codex still operates through WebMCP, and the
human still creates the only consequential authority. Once that exact command
is ready, an async repository commits the accepted head, immutable revision,
receipt, domain event, and referenced evidence in one D1 batch.

Temporary intake/draft construction remains device-local. Approval and
confirmation remain memory-only. No backend model or application-owned agent
was added.

## Transaction contract

- One accepted head per `(scope_id, plan_id)` records profile hash, revision,
  snapshot hash, and update time.
- Immutable revisions bind the complete snapshot to its predecessor hash and
  receipt.
- Unique `(scope_id, plan_id, idempotency_key)` receipts store the canonical
  request hash and original response.
- Receipt IDs derive from deterministic command content, allowing exact retry
  after a lost response.
- D1 `batch()` owns compare-and-swap head update plus revision, receipt, domain
  event, evidence, and optional operation-proof writes.
- Unique revision and receipt constraints force a competing writer to fail and
  reload the current head.
- Same-origin writes, bounded JSON, closed versions, profile identity, finite
  total, lineage tail, receipt checksum, evidence hashes, and snapshot hash are
  verified before commit.

## Executable proof

The 46-test suite includes:

- travel, renovation, and event human/Codex journeys that commit through a
  remote repository and restore from a browser-empty runtime;
- two simultaneous operators at revision N, with exactly one N → N+1 winner
  and exact checkpoint rollback for the loser;
- a response lost after commit, followed by deterministic exact replay;
- tampered durable-envelope refusal;
- all prior profile, search, evidence, intake, amendment, construction,
  authority, surface, WebMCP, and local failure-atomic tests.

Typecheck, Vite production build, and runtime dependency audit pass. The
packaged Drizzle migration contains seven user tables, primary/unique keys,
query indexes, and `PRAGMA optimize`.

## Live owner-private proof

- Exact code commit: `fa3c074103b8878f834d33e20df4b1b96f5068e2`.
- Sites version: 11.
- Deployment: `appgdep_6a8eadbc47cc81918e956e31db0bb199`.
- URL: `https://finite-plan-kitchen.bharthamk.chatgpt.site`.
- Access: custom owner-only; one allowed owner, no groups, no external viewers.
- Live binding: `DB`.
- Live tables: `activation_receipts`, `domain_events`, `evidence_records`,
  `operation_log`, `plan_heads`, `plan_revisions`, and `receipts`.
- Travel, renovation, and event each committed revision 1 → 2 through the live
  Worker and rehydrated revision 2 with one receipt from an empty browser store.
- D1 inspection shows three revision-2 heads, six immutable revision rows,
  three receipts, three domain events, and three accepted evidence rows.

## Boundary and next risk

The current D1 scope is explicitly `owner-private-v1`. Sites owner-only access
is the tenancy boundary. The app must not be shared, made public, or presented
as multi-user until authenticated user identity is included in every durable
key and authorization check.

The next backend phase is not another model. It is authenticated tenancy,
cross-device non-authoritative operator sessions, single-use expiring human
handoff challenges, migration/recovery rehearsal, and redacted production
telemetry. Submission preparation remains separate and later.
