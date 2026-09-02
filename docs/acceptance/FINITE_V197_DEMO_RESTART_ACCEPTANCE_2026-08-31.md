# Finite v197 — Demo restart acceptance

## Defect

Restarting from an active demo could carry the previous chapter's in-memory Next gate into the new launch. The new loading page looked correct, but the first guide call returned `GUIDE_WAITING_FOR_PERSON` for a button that belonged to the previous run and was no longer visible.

## Correction

Both “create a new plan” and every entry-route selection now reset the demo's Next-required, Next-advanced, paused, and paused-context state. A new live demo therefore always begins at its own arrival sequence and cannot inherit a hidden gate.

## Required proof

- Automated suite and production build pass.
- Live marker readback.
- In one visible tab: active pause → create new plan → Watch live demo → first guide opens blank arrival without a reload workaround.
