# Authenticated cross-device handoff acceptance — 2026-08-26

## Outcome

Finite now has an authenticated operator-continuity layer without adding a
backend agent and without converting human approval into durable permission.
Sites supplies the signed-in identity; the Worker derives a private tenant key,
Codex may save bounded non-authoritative work, and a human-created five-minute
challenge can cross devices only when the receiving runtime independently
rebuilds the exact candidate. The accepted D1 commit consumes that challenge in
the same atomic batch as the revision and receipt.

## Identity and migration contract

- The client never supplies or selects a durable D1 scope.
- The Worker requires `oai-authenticated-user-id` and derives a SHA-256 tenant
  key; raw user id and email are not stored.
- Every accepted head, revision, receipt, event, evidence record, operation,
  operator session, authority challenge, and consumption is tenant-scoped.
- The first authenticated owner atomically claims the one-time legacy adoption
  and copies the existing `owner-private-v1` lineage without deleting it.
- The adoption decision and guarded copy are in one D1 batch. A second tenant
  receives an empty namespace even under first-use contention.
- Non-GET API calls are same-origin and bounded to JSON objects.

## Operator-session contract

- `outcome_intake`, `decision_work`, and `research_handoff` packets are bounded
  to 30 KB, an exact plan/profile/base revision, 60 seconds to seven days, and
  a tenant-local idempotency key.
- A session is context, never accepted truth or human authority.
- `decision_work` contains an exact change event and candidate id. Resume reruns
  deterministic bounded search and stages the same canonical candidate; it does
  not restore approval.
- Expired, closed, foreign-tenant, and stale-base sessions fail closed.

## Human-handoff contract

- Only the human surface creates an approval and asks the repository for its
  exact challenge. No WebMCP tool manufactures approval or confirmation.
- The challenge binds tenant, plan, profile, revision, candidate, candidate
  content hash, human authority id, command hash, creation time, and expiry.
- The receiving device must independently restore the exact decision work before
  `finite_resume_human_handoff` can restore that authority.
- A mismatch, expiry, prior consumption, stale revision, or absent staged
  candidate refuses the command.
- Consumption is inserted in the same D1 batch as head advancement, immutable
  revision, receipt, domain event, accepted evidence, and operation proof.
- Exact lost-response retry resolves through the stored receipt before checking
  challenge availability, so once-only authority and idempotent recovery coexist.

## Executable travel, renovation, and event proof

For each semantic family, the 51-test suite runs this actual two-device journey:

1. device A hydrates accepted truth;
2. deterministic code records a family change, searches, stages, and the human
   approves one exact candidate;
3. device A saves the event, candidate id, and challenge reference as
   non-authoritative `decision_work`;
4. device B hydrates the same accepted revision and resumes the packet;
5. device B independently reproduces and stages the exact candidate while
   proving `authorityRestored: false`;
6. device B loads the live challenge, restores only its exact human authority,
   applies the candidate, and commits revision N → N+1;
7. challenge reload returns `AUTHORITY_CHALLENGE_CONSUMED`; and
8. device A reloads the new head and the old operator session returns
   `OPERATOR_SESSION_BASE_STALE`.

The suite also proves optimistic one-winner concurrency, complete loser
rollback, lost-response replay, tampered-envelope refusal, session expiry,
challenge expiry with no accepted mutation, missing-identity refusal, and
cross-origin-write refusal. Typecheck, Vite production build, migration apply,
and zero runtime-vulnerability audit pass.

## Local D1 migration and isolation rehearsal

All three migrations applied to a fresh local D1: the seven accepted-truth
tables plus `tenant_accounts`, `operator_sessions`, `authority_challenges`, and
`challenge_consumptions`, including the challenge authority-id addition.

A synthetic `owner-private-v1` revision-2 plan was then exercised through the
real Worker:

- authenticated user A loaded it with HTTP 200 and received logical scope
  `authenticated-user-v1`;
- user A saved one operator session with HTTP 201;
- authenticated user B received 404 for the legacy plan and user A's exact
  session, and an empty session list;
- missing identity returned 401;
- a foreign-origin write returned 403; and
- D1 inspection showed two tenant rows, exactly one
  `legacy_scope_adopted = 1`, one copied user-A head, no user-B head, and one
  user-A-only operator session.

## Live owner-private gate

Pending in the implementation commit. The deployment receipt must prove the
existing owner adopts all three live revision-2 family heads, completes the
three cross-device-style handoff journeys against hosted D1, and leaves exactly
three challenge consumptions. Access must remain custom owner-only with one
allowed owner, no groups, and no external visitors.

## Boundary and next risk

The challenge is deliberately short-lived durable coordination, not accepted
authority state. The application still has no backend model. Temporary plan
construction remains device-local. The next backend phase is production
resilience—recovery/export drills, property/invariant fuzzing, rate and latency
budgets, and redacted telemetry—not submission preparation.
