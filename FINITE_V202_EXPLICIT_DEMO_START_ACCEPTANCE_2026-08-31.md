# Finite v202 — explicit demo start outranks saved work

## Defect

Opening `?start=live-demo` in a browser with an older waiting arrival restored the saved Planning surface instead of showing the requested Codex demo handoff. The URL selected demo mode, but rendering required there to be no waiting arrival.

## Product contract

- An explicit Codex live or demo launch always renders its handoff first.
- Existing arrival and plan state remains saved and unchanged.
- Finite does not enter, mutate, or clear that state until the person has chosen a browser surface and Codex begins the selected route.

## Release proof

- Regression assertion for explicit-launch precedence.
- Full automated suite.
- Typecheck and production build.
- Production deployment and visible reload in the same Codex browser tab.
