# Finite v195 — Unsaved guide-state acceptance

## Live defect

The first full production replay exposed a gap that source inspection did not: invoking `finite_guide_view` on the current blank arrival screen rendered the entire application before adding the guide overlay. That erased the synthetic brief from the unsaved textarea, so the overlay claimed the text was visible while the field had returned to its placeholder.

## Correction

`VIEW_GUIDED` calls targeting the current surface now preserve the existing DOM unless an explicit refresh was requested. Finite still renders when the guide changes surfaces, so the first loading-to-arrival transition continues to work. Waiting and paused guide calls retain their existing no-render behavior.

## Required proof

- Automated suite and production build pass.
- Live release marker and deployed contract readback.
- A real replay types the brief, adds the first Next overlay, and confirms the textarea value remains visible without retyping.
