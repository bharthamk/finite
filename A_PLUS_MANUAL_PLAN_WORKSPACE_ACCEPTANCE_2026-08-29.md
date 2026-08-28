# Finite v125 A+ Manual Plan Workspace Acceptance

Date: 2026-08-29

## Goal

Remove the known human-control walls exposed by the authenticated real-trip
walkthrough before asking the human to inspect the product again.

## Accepted product behaviour

- An open module stays open while an item is saved.
- Calendar/List choice, selected calendar item and item-type filter survive the
  render cycle caused by a save.
- Calendar exposes exactly one `Add locations & activities` control.
- Calendar filters Locations, Activities, Events, Travel days and Milestones.
- A multi-day item shows its name on the first day and a compact continuation
  lane on later days instead of repeating the full title in every cell.
- Travel exposes a first-class `People & commitments` module with role, status,
  location, date window and plan dependency.
- Stay and transport records derive links to matching calendar locations and
  expose unresolved-link warnings rather than relying on hidden note prose.
- Relationship matching keeps meaningful country/city names such as Luxembourg,
  preventing false warnings when the same word identifies both city and country.
- Related-record controls open the linked calendar item directly.
- Stay and transport price state distinguishes planning allowance, live quote,
  booked price and paid price.
- Price records support checked date, local amount/currency, base currency and
  a conversion rate; decimal conversion updates the base amount before save.
- Calendar and transport records have explicit time-zone fields.
- Money automatically rolls up recorded stay and transport costs, compares them
  with their editable category envelopes and reports price confidence.
- The compact top report distinguishes location stops from activities/events and
  includes linked-record cost context without replacing category allocations.

## Local browser acceptance

The local Sites build was exercised through the visible manual workspace:

1. Created a travel fixture through `Build it myself`.
2. Opened Calendar and confirmed one add control and six filter controls.
3. Added a five-day Munich item and confirmed Calendar remained open with the
   newly created item selected.
4. Switched to List, edited and saved the item, and confirmed List remained the
   active view.
5. Added a tentative companion dependency and confirmed the module summary
   surfaced one item to check.
6. Added a quoted stay using EUR 500 and a 1.7 AUD conversion rate; the base
   amount became AUD 850 and saved successfully.
7. Confirmed the stay derived a direct Calendar link to Munich.
8. Confirmed Money automatically reported AUD 850 from one stay and classified
   the record as a quote.
9. Used the related-record control and confirmed Calendar opened with Munich
   selected.
10. Confirmed later days render accessible `continues` controls with compact
    continuation marks instead of repeating the title text.

## Automated proof

- Release marker: `a-plus-manual-plan-workspace-v125`
- Tests: 216/216
- TypeScript: pass
- Production client/Worker build: pass
- Source diff integrity: pass

## Boundary

Automatic matching is intentionally conservative and visible. A missing match
creates a check rather than silently changing dates, bookings or money. Price
conversion is an editable planning calculation, not a live exchange-rate claim.
No option becomes booked, paid or availability-validated without an explicit
human change.
