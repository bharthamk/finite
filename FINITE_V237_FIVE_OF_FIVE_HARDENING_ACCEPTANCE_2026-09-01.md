# Finite v237 product hardening acceptance

Date: 2026-09-01

## Accepted product outcome

Finite's Spotlight transaction now explains how its options were found, keeps
the human decision boundary unmistakable, and leaves a legible before/after
receipt after the accepted plan changes.

For the canonical Paris change, the product visibly proves:

- 26 bounded combinations checked, with legal and rejected totals;
- three distinct legal routes and the trade made by each route;
- fixed flights and the total budget remain protected;
- the chosen route was confirmed by a person for revision 1;
- forecast, buffer, trip length, booked days, and the Paris stay all show their
  before and after values;
- the accepted plan, next step, and timeline all project Paris as seven nights;
- the receipt is revision-bound and replay-safe.

## Automated proof

`npm test` passes 346/346 tests.

Twenty independent hostile Spotlight runs each cover the full bounded-search
and authority path. Every run verifies search accounting, hard-lock protection,
stale or missing staging refusal, fabricated approval refusal, exact human
approval, one accepted apply, allocation conservation, exact idempotent replay,
conflicting replay refusal, and reload continuity.

`npm run build` passes TypeScript checking, the production client and Worker
builds, and the 500 kB per-chunk regression budget.

## Visible browser proof

The real local product completed the canonical WebMCP transaction from revision
1 to revision 2. Visible browser inspection confirmed:

- the option-search explanation and three accessible option labels;
- focus moves to exact approval after a route is selected;
- focus moves to the confirmation status after the person confirms;
- the final receipt contains the change, route, protections, search proof,
  authority proof, receipt identity, and complete before/after measures;
- Paris is seven nights in both `Up next` and the plan timeline;
- a 390 by 844 viewport has no horizontal overflow;
- every visible button, selector, disclosure, and text input at that viewport is
  at least 44 pixels high;
- the document has a skip link, atomic polite status regions, visible focus
  treatment, and reduced-motion fallbacks.

## Remaining evidence boundary

This release has deterministic and browser-visible product proof, but no fresh
human-user cohort was available. That is a validation limitation, not an
unimplemented product path. No submission materials are part of this release.

