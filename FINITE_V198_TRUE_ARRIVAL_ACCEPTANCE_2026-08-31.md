# Finite v198 — true arrival acceptance

## Product correction

The first unsaved brief is no longer rendered inside Finite's private planning chrome.

- The arrival form has its own pre-plan shell.
- The plan switcher and lifecycle rail are absent while the first brief is unsaved.
- The ordinary `What do you want to plan?` field and `Build my rough plan` control remain the real persistence path.
- Guided-demo overlays and visible typing still target that ordinary form.
- Once the form is submitted, Finite opens the saved starting-point/planning workspace.

## Proof required before release

- Full automated suite.
- Typecheck and production build.
- Production deployment.
- Attached-browser receipt showing the unsaved Hobart brief on the pre-plan arrival shell with no plan switcher or lifecycle rail.
