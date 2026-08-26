# Arrival continuity acceptance — 2026-08-26

## Outcome

Finite now has a durable arrival boundary for the period before a plan exists.
The Site and Codex may be used hours or days apart. The human order, its raw
updates, Codex interpretation, operator checkpoint, lifecycle state, exact
version, and checksum survive that delay in the authenticated D1 namespace.

The arrival record is not accepted plan truth. Codex may interpret, checkpoint,
ask, and stage; it cannot silently rewrite human-supplied facts or create human
authority.

## Contract proved

- `arrival_orders` materializes the current bounded packet.
- `arrival_events` preserves append-only human and Codex event lineage.
- Every order and event is content-addressed with SHA-256.
- Creation is idempotent per authenticated tenant.
- Every mutation requires `expectedVersion`.
- A changed human order refuses stale Codex work with
  `ORDER_VERSION_CONFLICT` and returns the current orientation.
- Human input and Codex interpretation remain separate fields and event actors.
- “Connected” never means “processing.” The product reports
  `Saved · waiting for Codex` until an operator checkpoint exists.
- The orientation packet includes the whole order, delta since checkpoint,
  unprocessed human input count, evidence references, inferred family, missing
  facts, contradictions, saved operator work, exact version/checksum, and next
  safe route.

## Journey 1 — Site first, Codex later

1. The human saves a trip outcome, dates, one fixed flight, one preference, and
   an evidence reference on the Site.
2. Finite reports the order saved without claiming background processing.
3. Codex opens the arrival later.
4. The orientation contains the original order plus all later Site updates and
   reports three unprocessed human events.
5. Codex checkpoints the exact version and stages a labelled interpretation.
6. The complete interpretation becomes `proposed_plan_ready`; accepted truth
   remains unchanged.

Result: pass.

## Journey 2 — Codex first, Site later

1. The human states a renovation outcome in Codex.
2. Codex records the human-originated order, checkpoints it, and stages one
   bounded handover-date question.
3. The human answers later on the Site.
4. Finite removes the answered pending question, returns the order to
   `waiting_for_codex`, and records the answer as a Site-originated human event.
5. On resume, Codex sees exactly one new unprocessed human update.

Result: pass.

## Journey 3 — concurrent human edit during Codex work

1. Codex opens event order version 1.
2. The human adds a venue-capacity constraint on the Site, creating version 2.
3. Codex tries to stage its version-1 interpretation.
4. Finite refuses the stale write with `ORDER_VERSION_CONFLICT`.
5. The refusal returns version 2, its checksum, and the new human delta.
6. No accepted state changes.

Result: pass.

## Exposed Codex tools

- `finite_create_arrival_order`
- `finite_append_arrival_input`
- `finite_open_arrival`
- `finite_checkpoint_arrival`
- `finite_stage_clarification`
- `finite_stage_plan_interpretation`

The complete live inventory is now 42 stable Finite tools plus three
profile-contextual tools. Human approval creators remain absent.

## Product surface

Authenticated users now arrive at an outcome-first product page rather than a
preselected travel dashboard. They can:

- state an outcome without choosing a plan family;
- optionally record timing, the finite resource, a hard constraint, and useful
  evidence or links;
- see exact saved/waiting/review/question/proposal state;
- append facts while Codex is absent or working;
- answer a Codex-staged clarification;
- review Codex interpretation with inferences explicitly labelled;
- use an exact cross-surface handoff without repeating the brief.

The prior engineering kitchen remains available only through explicit lab or
`?kitchen=1` routes while the new-plan activation path is completed.

## Automated proof

Command: `npm run build && npm test`

Result:

- production TypeScript build: pass;
- Vite client and Worker build: pass;
- 61 tests: 61 pass, 0 fail;
- five dedicated arrival tests include all three delayed-surface journeys,
  WebMCP inventory/authority assertions, and auth/origin refusal.

