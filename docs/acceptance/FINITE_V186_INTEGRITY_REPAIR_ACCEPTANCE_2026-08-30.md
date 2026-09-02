# Finite v186 integrity repair acceptance — 2026-08-30

## Scope

Finite v186 closes the independently reviewed concurrency and persistence gaps in the accepted-plan workflow. The validated source baseline was `c8960132f1611b3f6043fc59d24c642dab3131aa`.

## Repairs accepted

- Plan activation now commits behind one atomic D1 write guard that revalidates the authority challenge, source plan head, accepted arrival, construction packet, target absence, and idempotency state at write time. A stale interleave leaves no target plan, receipt, challenge consumption, or packet retirement behind.
- Construction-packet writes now use a compare-and-set upsert tied to the current plan head, latest accepted arrival, and expected prior packet state.
- Arrival acceptance now checks the accepted plan head inside the mutating statement instead of relying on a preceding read.
- Hosted activation remains truthfully successful after remote acceptance even if the browser cache write fails; the UI adopts the accepted target and reports the degraded cache state. Local-only storage failure still rolls back.
- Click-to-activation timing receipt lifecycle is exported and covered behaviorally, including stale receipt clearing and publish semantics.

## Verification

- `npm test`: 279 tests passed, 0 failed.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- Client chunk budget: 7 chunks checked; all at or below 500,000 bytes.
- `git diff --check`: passed.
- Schema impact: none; no D1 migration is required.

## Concurrency proof

The acceptance suite now injects state changes between validation and the final write for plan activation, construction-packet save, and arrival acceptance. Each path rejects the stale write with its specific conflict response and verifies that no partial accepted state survives.

## Residual verification

- Production click-to-activation timing remains an observational measurement after deployment; v186 makes the receipt lifecycle testable but does not manufacture a live latency sample.
- The separate CD-twin review remains review-only and is tracked independently from this implementation acceptance.
