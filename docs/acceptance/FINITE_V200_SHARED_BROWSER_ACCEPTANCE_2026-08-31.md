# Finite v200 — shared-browser acceptance

## P0 contract correction

Finite's live demo is invalid if Codex operates a background duplicate while the person watches another tab.

The copied handoff now requires Codex to:

- claim the already-open, user-owned Finite tab;
- keep the built-in browser visibly presented;
- never create a duplicate tab or switch to Chrome;
- verify the claimed visible tab before page-tool discovery;
- fail before any Finite call or page change if the shared tab cannot be presented.

The loading page also tells the person to keep that exact Finite tab open because it is the page Codex will operate.

## Release proof

- Full automated suite.
- Typecheck and production build.
- Production deployment.
- A real shared-view acceptance run remains mandatory before the live-control pitch can be considered proven.
