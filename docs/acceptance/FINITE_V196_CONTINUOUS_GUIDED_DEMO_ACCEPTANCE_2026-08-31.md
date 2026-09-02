# Finite v196 — Continuous guided demo acceptance

## Product contract

The viewer watches Codex operate Finite's real interface. An explanatory overlay remains visible while Codex works. At each natural stopping point, the overlay offers a high-contrast Next control followed by “Or ask Codex any questions you have.”

Next is the complete continuation signal. The viewer does not need to return to the Codex conversation merely to say “proceed”. Codex keeps the turn alive, observes the released guide gate, clicks the real product control that advances the plan, and continues until the next natural pause.

Every Next gate is also a question-safe pause. `GUIDE_WAITING_FOR_PERSON` now returns the exact `pausedAt` context so Codex can answer questions without changing Finite. Pause demo remains available during active chapters.

## Required proof

- Automated suite and production build pass.
- Live release marker and deployed prompt/overlay contract readback.
- Fresh browser replay confirms visible typing, the question line beneath Next, Next-only continuation, and the real first submit transition.
