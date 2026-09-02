# Durable Construction Packet Acceptance — 2026-08-26

## Outcome

Finite no longer loses unfinished plan construction on reload. This first
acceptance established one device-local construction packet preserving either
the latest typed intake assessment or
the exact staged new-plan/amendment draft. The packet is work, not accepted
truth and not authority.

This device-local persistence class was superseded on 2026-08-27 by the
authenticated cross-surface contract in
`CROSS_SURFACE_CONSTRUCTION_ACCEPTANCE_2026-08-27.md`. The packet and authority
laws below remain; D1 is now authoritative and browser storage is only a cache.

> 2026-08-27 addendum: arrival-built packets now also bind the exact human-order
> id, version, and checksum. Newer human input makes the prior packet
> `stale_arrival`, removes its pending authority, and restores the arrival
> reconcile route. See `ARRIVAL_BOUND_CONSTRUCTION_ACCEPTANCE_2026-08-27.md`.

The browser automatically attempts safe restoration on startup. Codex can also
inspect, resume, or explicitly discard the packet through WebMCP.

## Packet law

Every packet binds:

- packet kind: `intake` or `draft`;
- exact source plan id, profile hash, and accepted revision;
- exact source arrival order id, version, and checksum when construction began
  from reviewed arrival intake;
- creation and seven-day expiry timestamps;
- typed facts or compiled profile/draft/amendment payload;
- required evidence records with their content and provenance hashes;
- deterministic SHA-256 checksum and checksum-derived packet id.

Only one construction packet exists at a time. A new assessment or staged draft
replaces earlier unfinished work. Accepted allocations, revisions, catalog
entries, and receipts are not changed by save, inspect, resume, or discard.

Human confirmation is never serialized. If the consumer confirmed a draft and
the page reloads, the draft can return but confirmation cannot: the exact hashes
and semantic diff must be shown and confirmed again.

## WebMCP lifecycle

- `finite_assess_plan_intake` now honestly declares a write because it replaces
  the durable work packet, although it still cannot change accepted truth.
- `finite_get_construction_packet` exposes safe metadata and resumability status,
  not the private work payload or authority.
- `finite_resume_construction_packet` restores only a fully verified, current
  packet and imports its verified evidence as volatile construction context.
- `finite_discard_construction_packet` requires the exact packet id and deletes
  no accepted state.

The active registry is **30 stable plus three contextual tools**.

## Fail-closed proof

The acceptance suite proves:

1. an incomplete event intake survives reload with the same missing-fact result;
2. a human-confirmed amendment draft survives reload with the same profile,
   draft, and semantic-diff hashes but without its confirmation;
3. the old confirmation id cannot activate the restored draft;
4. fresh human confirmation can activate it and clears the matching packet;
5. expiry refuses resume after exactly seven days;
6. switching away makes a packet stale; switching back to the exact source
   plan/revision makes it resumable again;
7. payload/checksum tampering restores no draft, evidence, confirmation, or
   accepted mutation;
8. evidence hashes are verified before entering volatile runtime state;
9. a storage write failure refuses draft staging rather than implying durable
   success;
10. explicit discard requires the matching packet id and is idempotently absent
    afterward;
11. malformed stored JSON is quarantined by removal;
12. all human approval and confirmation creators remain absent from WebMCP.

## Automated receipt

- Contract suite: **36/36 pass**.
- TypeScript typecheck: pass.
- Vite production build: pass.
- Runtime dependency audit: zero vulnerabilities.
- Accepted state mutation across packet tests: zero.

## Product consequence

This closes the operator-continuity failure from creation story HC10 without
weakening the “only accepted truth and proof persist” law. Finite now preserves
mise en place while still throwing away the diner’s authorization when service
is interrupted.

The remaining local product ceiling is semantic breadth: travel, renovation,
and event are still the only compiled families. The next experiment should
stress recurring-period and milestone/project orders to discover whether the
safe family grammar can be generalized without generated code, arbitrary tools,
or one generic budgeting surface. Submission work remains later.
