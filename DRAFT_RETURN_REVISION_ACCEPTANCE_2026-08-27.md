# Returned-draft revision acceptance

Date: 2026-08-27

## Outcome

Finite now treats **Request changes** as a first-class revision lifecycle, not
as discard. The human remains on the draft surface, explains what was wrong,
and sees that exact draft and feedback until Codex compiles a materially
different replacement. Accepted plan truth and reviewed arrival truth remain
unchanged throughout.

## Human journey

1. The Site presents a compiled kitchen with **Confirm this exact kitchen** and
   **Request changes**.
2. Requesting changes opens an inline reason selector and required free-text
   instruction without navigating away or clearing the draft.
3. Submission records an immutable returned-draft review and renders **Changes
   requested** beside the exact packet and draft proof.
4. The consumer may hand that revision to Codex or return later on another
   authenticated surface without repeating the feedback.
5. A replacement draft shows a revision receipt and the areas changed from the
   returned draft.
6. **Start over instead** is deliberately separate and is the only action that
   discards the construction packet.

## Codex journey

1. `finite_enter_kitchen` arbitrates a returned draft ahead of ordinary plan
   creation and emits one route: `draft_returned`.
2. Its exact next tool is `finite_get_returned_plan_draft`.
3. That read returns the rejected draft, reason, human instruction, source
   binding, and proof without restoring human confirmation or granting
   authority.
4. A same-content replacement fails with `CONSTRUCTION_RETURN_UNCHANGED`.
5. A materially different compiled draft resolves the return and records the
   replacement packet id.

Legacy builds that previously cleared a draft on **Not this kitchen** are
recovered as `legacy_return_pending`: the old draft is restored for context and
the Site asks the human what was wrong before Codex proceeds.

## Persistence and authority laws

- Returned review is tenant-scoped in `construction_return_reviews`.
- The exact prior packet is preserved with the human reason and message.
- Review status is `returned`, `resolved`, or `discarded`.
- A return never mutates accepted plan truth, reviewed arrival truth, or human
  authority.
- Human feedback is created only on the Site; WebMCP exposes a read-only
  returned-draft context tool.
- Resolution requires a materially different draft packet.
- Explicit discard tombstones the packet and prevents stale resurrection.

## Proof

- TypeScript typecheck passed.
- Production build passed.
- Drizzle migration integrity check passed for migrations 0006 and 0007.
- 91 of 91 automated tests passed, including cross-surface return, legacy
  recovery, exact feedback, route arbitration, and resolution by a revised
  draft.
