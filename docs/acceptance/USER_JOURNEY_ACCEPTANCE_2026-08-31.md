# Finite full user-journey acceptance — 31 August 2026

This ledger records sequential use of the real local Finite interface at `http://127.0.0.1:4192/`. The journeys used ordinary visible controls and synthetic, non-sensitive plans. Repairs were made in source as defects appeared, then the affected path was repeated.

## Acceptance summary

| # | Full journey | Result | Repair or proof |
|---:|---|---|---|
| 1 | Start from a plain-language outcome | Pass | Entered a Wellington trip brief from the blank first screen and reached a complete editable rough plan with the correct NZD 3,200 total. |
| 2 | Edit money and survive reload | Pass after repair | Changed NZD 3,200 to AUD 3,500, saw the change summary, and reloaded into the same editable draft. Successful submission now removes stale `start=fresh` and `reset` query parameters. |
| 3 | Tailor a template | Pass | Changed Dinner for eight into dinner for twelve friends with a vegetarian main, two gluten-free guests, and an AUD 650 limit; the resulting event plan reflected the edited facts. |
| 4 | Build manually | Pass after repair | Entered an interview-preparation plan with date, time limit, hard truthfulness constraint, and public reference. Manual starts now remain directly editable and do not enter the Codex draft-approval route or return to the entry gateway. |
| 5 | Resolve an open question | Pass | Added interview time, timezone, and available evenings through Open questions; the count moved from 6 to 5 and the saved consequence was shown. |
| 6 | Customise the workspace | Pass | Added the reusable Practice log section and verified it became part of the plan. |
| 7 | Move from Planning to Managing | Pass | Started the manual interview plan and verified its four saved sections, including Practice log, carried into Managing. |
| 8 | Manage live work | Pass | Added and completed a post-interview thank-you task; progress changed from 0/8 to 1/8 and survived reload. |
| 9 | Add reference material | Pass | Added an Atlassian Jira guide link and a synthetic source note; both remained attached to the interview plan. |
| 10 | Ask Codex to guide an existing plan, then opt out | Pass | Started current-plan guidance, disabled it, reloaded, and remained on the ordinary Managing surface without guide controls returning. |
| 11 | Reach the sharing boundary safely | Pass with copy correction | A temporary server demo correctly asked the person to sign in before publishing or inviting. Submission instructions now reserve role-based invites for an authenticated owner workspace. |
| 12 | Turn browser-local Demo mode on and off | Pass after repair | Settings now describes account, temporary-server, and browser-local storage accurately. Enabling local Demo mode opens a genuinely blank first screen rather than inheriting `?plan=1` and a built-in plan. |
| 13 | Choose a guided-demo depth | Pass | From the ordinary entry surface, selected All the bells & whistles and reached the loading/handoff screen with the correct real-interface, Next, pause, and question contract. |
| 14 | Finish, reflect, and reopen | Pass after repair | Finished the interview plan, saved three plan-local lessons, saw reusable memory remain sign-in-only, reopened through explicit review and confirmation, and returned to Managing at revision 3 with tasks, references, and custom sections intact. Temporary demos may now save their own retrospective without gaining reusable profile-memory writes. |
| 15 | Switch plans without state leakage | Pass | Switched from interview to Hobart and back. Interview task, Jira reference, and Practice log were absent from Hobart and present again on return; Hobart tasks did not leak into interview. |
| 16 | Record a real-world weather update in its natural section | Pass after repair | Added a rainy-day Timeline update to Hobart, received a bounded change summary, reloaded, opened Timeline, and found the saved update. Timeline summaries now show `Calendar · 1 update · 2 sections` instead of incorrectly claiming only one section. |
| 17 | Run the under-three-minute WebMCP Spotlight from a clean or previously used browser | Pass after repair | Chrome and an in-app Browser with older local Finite history both opened a newly isolated active Europe plan. Native WebMCP recorded one sourced Paris change, produced three legal routes, stopped at visible human choice and confirmation, applied only the approved option, advanced revision 1 to 2, and showed the plan-update receipt. The trial exposed and repaired shared-cookie dependence, stale browser-local scope inheritance, missing evidence, collapsed Decisions and approval panels, and a stale receipt guide target. |

## Repairs earned by the journeys

- Fresh-start routing no longer overrides the plan created by that same submission.
- The entry gateway closes after a successful starting-point save.
- Manual plans stay manual; only Codex starts prepare a background Codex draft.
- Pending approval renders only for an arrival genuinely awaiting human authority.
- Settings distinguishes account storage, temporary 24-hour demo storage, and browser-local Demo mode.
- Toggling browser-local Demo mode enters a clean first screen and cannot inherit a saved `plan=1` route.
- Temporary server demos can save a retrospective attached to that temporary plan; reusable cross-plan memory remains account-only.
- The finished-plan UI explains that boundary and does not offer a control that will be refused.
- Saved-section summaries count unheaded plain-language updates as well as structured headings.
- Local submission instructions no longer imply that collaboration roles can be tested from temporary or browser-local demo storage.
- The recommended Spotlight route is browser-local and cookie-free, and its one-use `fresh` handoff creates a new local scope before removing that reset marker from the stable URL. A judge may therefore choose either supported browser even when it contains older Finite demo history.
- Spotlight includes its registered synthetic evidence, opens Decisions when options arrive, opens Exact approval after a choice, and guides the final plan-update receipt.

## Definition of done

This acceptance tranche is complete when all seventeen visible journeys pass after reload where continuity matters, focused regression tests pass, the full suite passes, the production build and client-chunk budget pass, and `git diff --check` is clean. The Spotlight release is handled as the following product tranche; public repository and submission publication remain separate owner decisions.
