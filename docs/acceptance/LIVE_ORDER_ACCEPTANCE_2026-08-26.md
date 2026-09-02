# Live Order Acceptance — 2026-08-26

## Outcome

The Codex-operated kitchen and the human consumption surface now share one
explicit live change-order lifecycle. WebMCP operations cannot leave the
visible page behind the kernel, and two same-revision orders cannot mix their
options or authority state.

## Active-order isolation

- `recordChangeEvent` promotes the new event to `activeEventId`.
- Any prior active event, generated candidates, staged candidate, and human
  approval are returned as explicit superseded identifiers and invalidated.
- Search or simulation against the earlier same-revision event returns
  `EVENT_SUPERSEDED` with the current `activeEventId` and recovery instruction.
- Candidate reads and the visible option surface filter by both revision and
  active event.
- Unaccepted orders remain volatile across persistence/reload, while the event
  behind an applied receipt remains in accepted lineage.
- Applying an approved option clears the active decision and advances the
  lifecycle to `idle` at the new revision.

## Codex recovery contract

`finite_get_capabilities` now returns the full decision lifecycle and its
current state. The `pending` selector returns:

- active event;
- lifecycle status;
- active candidate identifiers;
- staged candidate and approval identifiers; and
- the next legal operator step.

The states proven in order are `change_recorded`, `options_available`,
`option_staged`, `human_approved`, and `idle` after application.

## Live surface bridge

Every registered WebMCP tool is wrapped by a fail-contained completion
observer. In the browser application the observer recompiles and renders the
consumption surface, then attaches a synchronization proof containing the tool
and result code, plan revision, profile, active event, and manifest hash.

If rendering fails after a deterministic operation, the original tool outcome
is preserved and `surfaceSync` reports `SURFACE_SYNC_FAILED`. A presentation
failure therefore cannot disguise or roll back an accepted kernel mutation.

## Automated proof

The production suite passes 21/21 tests, including:

1. replacing a human-approved same-revision order invalidates its event,
   candidates, staged packet, and approval;
2. the old event cannot be searched again;
3. an unaccepted order disappears across persistence while an applied event is
   retained with revision lineage;
4. WebMCP change → search → stage → reject → restage → human approve → apply
   emits synchronized lifecycle receipts at each operator boundary;
5. final application reaches revision 2, clears the active order, and reports
   an `idle` synchronized surface; and
6. a synthetic renderer failure leaves `CAPABILITIES` successful while adding
   an explicit synchronization failure.

TypeScript typecheck, Vite 8 production build, and runtime dependency audit also
pass.

## Remaining boundary

This proves the application-side same-page bridge and its WebMCP adapter. It
does not claim fresh Codex Site Tools discovery, safety review, or model tool
selection; those remain unavailable in the current account/build.
