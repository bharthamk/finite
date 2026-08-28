# Record and Options layout acceptance — 2026-08-29

## Product contract

- Ordinary plan records render two per row by default.
- The two-column grid remains usable in the standard narrow app panel and
  collapses to one column only on genuinely small screens.
- Compact facts pair inside each record; providers, addresses, links and notes
  receive wider spans.
- Records in the same row align their edit controls at the bottom.
- Options always render one alternative per row.
- Full-width Options use four internal fact columns on wide screens, two in the
  standard app panel and one on small screens.
- The Add to plan action never squeezes or vertically breaks the option title.

## Automated proof

- CSS contract coverage fixes ordinary records at two columns and Options at
  one full-width row.
- Display-field markup marks long values for wider internal spans.
- Responsive rules preserve the two-column default through the standard panel
  width and collapse both layouts safely below 460px.
- Full regression, TypeScript, production build and diff integrity must pass.

## Visual proof

- A populated transport module shows two ordinary cards beside one another.
- Two populated Options stack vertically as separate full-width rows.
- Each Option keeps its title and Add to plan action on one usable header row.
- Option facts use paired columns while provider and notes receive wider rows.
