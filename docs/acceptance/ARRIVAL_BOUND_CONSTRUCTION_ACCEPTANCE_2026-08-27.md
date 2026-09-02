# Arrival-Bound Construction Acceptance — 2026-08-27

## Outcome

Finite now treats a compiled kitchen as work derived from one exact human-order
version, not as a timeless draft. If the human adds or corrects anything after
construction, the older draft loses its review and activation route before
Codex does more work.

The live acceptance used a real delayed-surface journey. Order v24 had a
compiled travel kitchen waiting for human review. The human then added a v25
preference for a deliberate mix of five-star stays and party hostels. Finite
preserved that input, routed Codex to reconcile it, marked the earlier draft as
`stale_arrival`, and removed the draft from pending authority. Codex reconciled
the preference into a complete v26 interpretation and a non-blocking
accommodation-mix research dependency. The Site now offers only review of that
updated brief.

Accepted plan truth remained `plan_travel_europe` revision 3 throughout.

## Binding law

Arrival-built intake and draft packets carry:

- source arrival order id;
- exact source order version;
- exact source order checksum;
- accepted source plan id, profile hash, and revision;
- packet checksum, expiry, and evidence bindings; and
- no persisted human confirmation.

`finite_assess_plan_intake` obtains the binding from the canonical current
arrival. A caller-supplied mismatch is refused. Unbound legacy construction is
not considered current while an arrival order is active.

## Route law

Arrival arbitration runs before construction review:

1. unprocessed human input returns `arrival_delta_ready` and
   `finite_reconcile_arrival`;
2. stale construction is reported as `stale_arrival` with its source and the
   current arrival binding;
3. stale pending drafts are omitted from the operator packet;
4. the human Site replaces the confirm controls with an explicit stale notice;
5. `finite_activate_confirmed_plan` is not advertised on the stale route; and
6. a direct stale activation attempt returns `PLAN_DRAFT_ARRIVAL_STALE`.

No copied handoff, old confirmation, or unchanged accepted-plan revision can
override a newer human-order version.

## Live journey

1. Human review released arrival v24 to construction.
2. Codex compiled draft `plan_draft_1b33996f1da242b0`.
3. The human added: “I want a mix of 5 star and party hostels for my accomm.”
4. Arrival v25 reported one unprocessed human update.
5. The earlier draft became `stale_arrival` and non-confirmable.
6. Codex reconciled the preference as human truth, kept the exact split
   adaptive, and added an operator-research dependency for the accommodation
   mix.
7. Arrival v26 became a complete proposal for human review.
8. The visible action is `Yes, build from this brief`; the stale kitchen has no
   confirm or activation action.

## Proof

- Source commits:
  - `344c3af21ea704ee93a28659f47cedc59a7a520b`
  - `1621f89aedd880982b0e46436803ed147693c1a3`
- Automated suite: 88/88 pass.
- TypeScript typecheck: pass.
- Vite production build: pass.
- Private Sites version: 40.
- Deployment: `appgdep_6a8f1b2d825c819180f881b2a170ac90`.
- Live Site: <https://finite-plan-kitchen.bharthamk.chatgpt.site/>.
- Accepted-state mutation during reconcile and invalidation: none.

## Product consequence

The human can keep shaping an order on the Site while Codex is delayed without
creating an authority race. The kitchen is now versioned against the order as
well as the accepted plan. This is the required engineering basis for Finite’s
two-surface product promise: input may arrive anywhere and later, but only work
derived from current human intent can reach review or activation.
