# Finite v201 — browser choice before operation

## Product contract

The first Codex interaction must ask where the person wants to watch Finite:

- one visible controlled browser window; or
- the Codex built-in browser.

Codex must wait for an explicit answer before opening, claiming, navigating, inspecting, discovering page tools, or calling Finite. It must use exactly one visible tab on the chosen surface for the whole run and must not infer the choice from ambient browser state.

If the selected surface cannot be visibly presented, Codex stops before any Finite call or page change.

## Release proof

- Full automated suite.
- Typecheck and production build.
- Production deployment.
- Live acceptance must exercise each display route separately; a successful run in one does not prove the other.
