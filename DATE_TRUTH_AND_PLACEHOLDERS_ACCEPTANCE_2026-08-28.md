# Date truth and placeholders acceptance — 2026-08-28

## Corrected date truth

Finite now resolves the human-supplied overall date window before considering
generated route dates. A start of 15 September 2026 plus the supplied one-month
duration renders as 15 September–15 October 2026. Generated stop timing can no
longer shorten that plan-wide window.

## Focused editing

- The Dates pencil opens a date-only dialog.
- The dialog contains From, To, Single day, optional times/time zone, and the
  date Placeholder toggle.
- Total budget has its own separate focused dialog.
- Budget split retains its own category editor.

## Certainty contract

- Generated, guessed, open, or human-marked placeholder values render in
  italics throughout the rough-plan report and detailed records.
- Every record edit section includes a Placeholder toggle.
- Budget and category editors use the same certainty treatment.
- Turning Placeholder on or off changes presentation/context only and never
  changes dates, budgets, percentages, or other calculations.
- Human-supplied and explicitly settled values render in normal type.

## Automated proof

- Arrival presentation asserts the exact `2026-09-15` to `2026-10-15` window
  and provisional status for the supplied approximate month.
- Header acceptance asserts the Dates dialog contains no budget fields.
- Header acceptance asserts date, budget, category, and generic record
  Placeholder controls plus report/record italic styling.
- Full regression, TypeScript, production build, and diff-integrity results are
  recorded with the hosted release.

## Release identity

- Release marker: `date-truth-and-placeholders-v118`
