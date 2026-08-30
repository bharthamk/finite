# Finite v189 — guided entry acceptance

Date: 2026-08-31  
Release marker: `hosted-release-marker-v189`

## Product outcome

Finite returns first-time and new-plan users to a compact entry gateway instead of dropping them directly into the large planning form. The gateway offers three honest routes into the same product:

1. Start fresh with the existing hints and optional prefill fields.
2. Start from an editable example and change its wording before building.
3. Start a live Codex walkthrough of the real Finite interface.

The guided route is a reusable onboarding mode, not a submission-only playback. It enables the existing consented view controls, creates a walkthrough-specific Codex handoff, and lets Codex move between bounded Finite surfaces, spotlight one named area, and display one short explanatory note at a time.

## Human-control boundary

- Guided view is opt-in and can be stopped from the visible overlay.
- `finite_guide_view` remains read-only.
- The guide cannot target arbitrary selectors or URLs.
- The guide cannot type into human fields, choose an option, change plan truth, or approve.
- The handoff explicitly tells Codex to pause after each step and reach real human decision boundaries.
- Example starts prefill an editable human input instead of silently creating accepted plan truth.

## Verification

- `npm test`: 282/282 passing.
- `npm run build`: typecheck, production build, and client chunk budget passing.
- `git diff --check`: passing.
- Guided request schema accepts only a bounded 240-character message in addition to the existing bounded surface and target enums.
- Focused tests cover the three entry routes, visible guidance schema, and walkthrough-specific handoff law.

## Demo path

For a product video, choose **Walk through with Codex**, copy the generated introduction into Codex, and let Codex guide the actual Finite page. The same path remains useful to a first-time user outside the submission.
