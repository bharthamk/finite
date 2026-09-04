# Guided-demo header/menu regression

During the live complete tour on September 4, top-bar highlighting opened its
descendant account menu. That menu intercepted a later click on Build it myself
and opened Start over. The reset confirmation was never entered or submitted;
Keep everything dismissed it. The preview's full redraw lost the unsaved brief
and hid the local-demo badge because the guide had set newPlanDraftMode.

## Bounded repair

- Broad highlights no longer auto-open a nested disclosure. Exact disclosure
  targets and their ancestors still open; priority section targets retain their
  existing descendant-disclosure behavior.
- Local demo arrival screens retain the full header and local-only badge even
  when newPlanDraftMode is set. Ordinary fresh user plans keep their entry layout.
- No reset, data migration, authentication or dependency changes.

## Acceptance

Run the full test/build gates and the hosted isolation-header check. Then replay
the complete-tour top highlight, confirm the account menu remains closed, select
Weekend trip, edit the synthetic Hobart brief, and switch to Build it myself.
The manual form must appear instead of any menu/reset dialog. Keep the first
form unsubmitted until its prescribed Next gate. Use a guide refresh to verify
the local-only badge survives a redraw before any form writes.

Separate open QC items: arbitrary full redraws can discard unsaved starting-form
text; the host injects an inline Cloudflare challenge script blocked by the
existing CSP; the dedicated Codex Chrome tool-caller connection is unproven.
Native Console transport has verified Finite registration and entry execution,
but is not a substitute for certifying that dedicated connector.
