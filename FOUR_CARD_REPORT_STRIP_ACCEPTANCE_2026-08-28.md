# Four-card report strip acceptance — 2026-08-28

## Product correction

The rough-plan overview is a compact BI/project-report readout, not an editable
form presented as a dashboard. The open **Plan at a glance** surface contains
exactly four cards:

1. Dates
2. Total budget
3. Budget split
4. Available or over

Each card has one dominant value and quiet supporting metrics. A pencil button
opens a small, focused modal editor. Date, time, single-day, currency, total,
category, percentage, and over-allocation behaviour remain available without
occupying the report surface.

## Interaction contract

- The report remains open by default and can be collapsed.
- No input, checkbox, category row, or save button appears in the report cards.
- Dates and Total budget open the plan-overview editor and focus the relevant
  field.
- Budget split and Available/over open the category-budget editor.
- Native dialogs close via their close buttons or Escape.
- All edits continue through the existing durable workspace operations.
- The report becomes two columns on tablet and one column on narrow phones.

## Automated proof

- Header acceptance asserts exactly four report cards, four pencil triggers,
  both focused dialogs, the four-column report grid, and removal of the former
  visible overview body.
- Existing arrival-presentation coverage continues to prove timed single-day
  plans and category allocations above 100%.
- Full regression: 215/215 tests.
- TypeScript, production build, and diff-integrity gates pass.

## Release identity

- Release marker: `four-card-report-strip-v117`
- Source and hosted deployment receipts are recorded in the project log for
  this release.
