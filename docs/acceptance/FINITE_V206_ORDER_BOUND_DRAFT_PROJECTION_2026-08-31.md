# Finite v206 — bind pending drafts to their own arrival order

A pending compiled draft from an older arrival must never hide the editable workspace for a newly created plan.

`renderPlanDraft` now returns no draft projection when the pending draft's `sourceArrival.orderId` differs from the active arrival order. Same-order version drift still shows the existing “previous draft is no longer confirmable” boundary; only cross-order leakage is suppressed.

This keeps new-plan and live-demo creation isolated without deleting the older draft or weakening stale-draft protection.
