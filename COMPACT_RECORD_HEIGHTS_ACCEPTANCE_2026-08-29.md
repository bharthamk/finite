# Compact record heights acceptance — 2026-08-29

## Product contract

- Ordinary plan records remain two per row by default.
- Every record uses its own content height; a short card is never stretched to
  match a longer card beside it.
- The Edit control follows the record content instead of being pinned to an
  artificial shared row height.
- Fact, relationship and edit spacing stays readable while avoiding empty
  vertical bands inside cards.
- Options remain one full-width alternative per row and are unaffected.

## Automated proof

- The shared record grid explicitly aligns cards to the start of each row.
- The Edit section has a fixed compact content margin and cannot use
  `margin-top: auto`.
- Full regression, TypeScript, production build and diff integrity must pass.

## Visual proof

- Uneven populated transport records end immediately after their own Edit
  control rather than sharing the taller neighbour's lower edge.
- Two records remain readable side by side at the standard desktop width.
- The three Europe-arrival Options remain separate full-width rows.
