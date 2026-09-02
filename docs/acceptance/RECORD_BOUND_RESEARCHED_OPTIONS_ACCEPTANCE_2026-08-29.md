# Record-bound researched Options acceptance — 2026-08-29

## Product contract

- Options belong to one exact working-plan record, not to a whole section.
- Every working card exposes its own compact Options count and opens a focused
  pop-out without expanding the rest of the plan.
- Options remain outside dates, calendar counts, relationships and money until
  the person chooses **Add to plan**.
- A researched option can carry the date it was checked and multiple direct
  source links; the links remain editable by the person.
- A card with no alternatives opens an empty, usable pop-out where the person
  can add one manually.
- Existing section-level options remain visible through a bounded legacy
  fallback to the first working record in that section.

## Real-plan evidence

The outbound Australia-to-Europe record is the first production case. Dated
research for Brisbane to Munich on 15 September 2026 produced three distinct
one-way economy comparisons:

1. A$1,094 — Virgin Australia and Qatar Airways via Sydney and Doha.
2. A$1,535 — Emirates via Dubai, arriving Munich the same day.
3. A$1,548 — Qatar Airways via Doha, the shortest one-stop result observed.

Each option records `2026-08-29` as its research date, links the dated Google
Flights result and relevant airline schedule or partnership pages, and remains
visibly provisional. These are observed fares, not bookings, availability
guarantees or constraint-validated recommendations.

## Automated proof

- Presentation replay preserves `parentRecordId` from both Site and WebMCP
  option events.
- The Worker validates the record identity before persistence.
- WebMCP advertises record attachment explicitly and stays inside discovery
  metadata budgets.
- UI contract tests require the card trigger, record dialog, research date and
  research sources while refusing the removed section shelf.
- Full regression, TypeScript, production build and diff integrity must pass.

## Interaction proof

- Opening one card's Options shows only alternatives attached to that record.
- The pop-out renders each alternative on its own line with its dated evidence
  links and **Add to plan** action.
- Closing the pop-out returns to the same expanded module and selected record.
- A separate card reports its own count and does not inherit the first card's
  researched alternatives.
