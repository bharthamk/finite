# Demo front door acceptance — 2026-09-04

## Scope

Restore Demo mode as a clear fourth entry route. Distinguish independent exploration from a Codex-led tour, use the same copy on both home screens, and preserve the existing guided demonstration routes. No authentication, tenant authority, storage schema or accepted-plan approval changes.

## Product contract

- Option 4: **Demo mode — Try Finite.**
- **Explore myself** opens a sample Europe plan directly, without sign-in or Codex, using `/?start=explore-demo&plan=1&fresh=1`.
- **Guide me with Codex** expands to Spotlight, basics, standard and complete tours; Codex/WebMCP prerequisites are explicit.
- Both choices use a separate browser-local workspace. Saved account plans are untouched; sharing and uploads remain unavailable.
- A fresh self-guided entry creates a new local demo scope. Its `fresh` flag is consumed before subsequent reloads, so manual edits survive reload.
- The shared demo-entry module owns both home-screen cards, choices and disclosure behavior.

## Verification

- Full suite: **379/379 passed**.
- Typecheck and production build: passed.
- Client chunk budget: passed, 11 budgeted chunks below 500 KB each.
- Submission final gate: passed (15 artifacts; existing v245 release marker and frozen 373-test submission baseline preserved).
- `git diff --check`: passed.
- Browser: option 4 opens two clear choices; focus moves to Explore myself; close behavior is unit-tested.
- Browser: Explore myself opens the actual managing surface at revision 1 with the local-only badge, disabled sharing and no Codex launch or guide overlay.
- Browser: added synthetic checklist item `Demo QA: review the travel checklist`; reloaded; item persisted and progress remained 0 of 5.
- Browser: guided choice reveals all four lengths; each route renders its correct Codex handoff label.
- Browser: desktop layout visually inspected; 390 × 844 viewport reports document width 390, with no horizontal overflow. Viewport restored.
- Browser: zero console errors across the tested routes.

## Boundaries

The second-person ChatGPT sign-in proof gap remains outside this change. No real second-account session was claimed or simulated as live evidence. Existing dependency manifests and lockfile are unchanged.

Publication receipts are recorded in the owning task trace after explicit public-release approval.
