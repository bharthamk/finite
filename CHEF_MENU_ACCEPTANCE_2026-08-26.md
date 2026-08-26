# Finite chef menu and operator packet acceptance

Date: 2026-08-26

## Product contract

`finite_enter_kitchen` returns one authoritative `finite-operator-packet.v1`.
Its `nextAction` contains the selected stage, reason, next or intended tools,
known arguments, derived arguments, missing inputs with source class, the exact
human question when one is required, target identity, and authority state.

The accompanying `finite-chef-menu.v1` contains at most three dishes. Every
dish states its kind, readiness, viability class, next tool, known arguments,
missing inputs, trade-offs, and evidence state. The governing distinction is:

- `suggested_route` is useful but not yet proven viable;
- `operator_action` is safe for Codex to perform without human authority;
- `validated_option` has passed the deterministic constraints but still needs
  a human choice before staging;
- `human_decision` stops at the consumer or authority boundary.

## Arbitration proof

- Empty arrival plus `entryIntent: start_new` returns `outcome_required` and
  `finite_create_arrival_order`; the seeded demonstration plan cannot capture
  the route.
- A named or active arrival wins over accepted-plan work and returns the exact
  order/version checkpoint arguments.
- `continue_current` with no arrival returns the active plan menu.
- Recorded changes advance to deterministic comparison without human input.
- Generated candidates replace suggestions with up to three
  constraint-validated menu items.
- Staged work stops at the human surface; no menu item supplies approval.

## Three example kitchens

Travel offers: research three Paris stays; use a human nightly/total cap; or
show which unlocked trip parts can flex. Renovation offers: source a local
substitute; protect the original finish; or refresh the delayed supplier facts.
Event offers: price the additional guests; protect guest experience; or protect
contingency with movable show elements.

These built-in menus are plan-ID specific. Custom and amended plans receive a
generic menu derived from their current profile capabilities, locks, move space,
evidence policy, and revision; they never inherit Paris, tile, or launch-event
assumptions merely because they share a family.

## Readiness and handoff

`finite_webmcp_status` registers in the document before the application module
hydrates. It exposes no kitchen state. It returns `WEBMCP_INITIALIZING`,
`WEBMCP_READY`, `AUTHENTICATED_USER_REQUIRED`, or
`WEBMCP_INITIALIZATION_FAILED`. The copied handoff tells a fresh Codex task to
use this only when `finite_enter_kitchen` is not yet visible.

An empty arrival handoff now copies `entryIntent: start_new` and omits the
underlying demonstration plan identity. Existing-plan and named-order handoffs
remain checksum/revision pointers and never copy credentials, plan contents, or
human authority.

## Local proof

- 72 tests pass, including seven new menu/arbitration journeys and the page-start
  readiness regression.
- TypeScript typecheck and production Vite build pass.
- All tests assert accepted state remains unchanged during orientation and menu
  reads.
