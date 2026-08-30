# Finite v193 — pausable, question-aware live demo

Date: 2026-08-31  
Release marker: `hosted-release-marker-v193`

## Product improvement

The autonomous Codex demo now has a persistent **Pause demo** control. A viewer can pause on any guided chapter, ask Codex a question about the exact Finite surface they are seeing, and resume from the same place.

## Context continuity

Finite preserves the last guided surface, semantic target, human-readable target label, and explanation. While paused:

- the visible Finite surface remains fixed even if an already-started operation finishes;
- the next chapter cannot advance;
- Codex receives `GUIDE_PAUSED_FOR_QUESTION` with the preserved context;
- Codex may answer using that context and canonical Finite state but may not change the product; and
- resuming continues the intended next chapter instead of restarting the run.

The viewer can still use **Next** for normal chapter pacing or **End demo** to leave.

## Verification

- Full automated suite passing.
- Production typecheck, build, and client chunk budget passing.
- Diff check passing.
- Live release marker and pause/context contract verified after publish.
