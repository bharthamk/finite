# Per-area Options acceptance — 2026-08-29

## Product contract

- Every editable plan area has a collapsed **Options** section.
- An option is an alternative, not part of the working plan.
- Options do not affect dates, calendar entries, plan counts, budgets, relationships, or progress.
- A person can add, edit, or delete an option manually.
- Codex can save researched suggestions with visible operator provenance.
- Only the person-facing **Add to plan** action promotes an option into the working plan.
- Promotion creates an ordinary editable plan item and removes the source option.

## First real-plan case

The outbound Europe leg remains open rather than treating Munich as settled. The option shelf contains three arrival strategies for comparison:

1. Munich with a one-stop itinerary via Dubai or Doha.
2. Frankfurt Airport followed by a direct ICE connection to Munich.
3. Vienna followed by Railjet or Westbahn to Munich.

All prices are allowances, not live quotes. Exact flight availability, through-ticketing, baggage, fares, and September 2026 timetables remain to be checked before selection.

## Automated proof

- `npm test`: 218/218 passing.
- Presentation tests prove options remain outside plan records and mathematics until promotion.
- Arrival tests prove Codex suggestions are operator events rather than human input or authority.
- WebMCP tests prove a bounded option-writing tool is available in the planning toolset.
- UI tests cover every-area disclosures, manual option controls, promotion, provenance, and styling.

## Manual and live proof required for release

- Confirm all seven travel areas expose the collapsed Options section.
- Add, edit, delete, and promote a local manual option.
- Confirm totals and plan counts do not change before promotion and do change after promotion.
- Save the three Europe-arrival suggestions through the page tool and confirm they render as **Codex suggestion · not in plan**.
- Confirm the live outbound working item says the arrival airport is open.
