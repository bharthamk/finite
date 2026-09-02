# Finite v194 — Visible first chapter acceptance

## Product correction

The autonomous demonstration now starts where a real user starts: Finite's blank first form. Codex opens that surface, visibly types the complete synthetic Hobart brief into the field labelled “What do you want to plan?”, and pauses before submission so the viewer can understand the input. Only after the viewer clicks Next does Codex use the visible “Build my rough plan” control.

The guide overlay footer is isolated from the global site footer. Next is a dark, high-contrast, 42px-tall control with explicit foreground, background, border, and disabled colours.

## Guardrails

- The first chapter explicitly forbids `finite_create_arrival_order` and direct DOM assignment.
- Demo submission does not reopen the handoff dialog because Codex is already operating.
- Opening a Codex run on the arrival surface preserves fresh-plan mode even when the browser already contains another plan.
- The viewer's role remains comprehension pacing through Next, Pause/Resume, or questions in Codex—not data entry or approval.

## Validation

- Automated suite: 285/285 passed.
- Production typecheck, client/server build, and client chunk budget passed.
- `git diff --check` passed.

## Remaining release proof

- Source checkpoint with a clean worktree.
- Sites publish and live release-marker readback.
- In-app-browser proof that the blank first form is shown, the brief can be typed visibly, and the computed Next colours are high contrast.
