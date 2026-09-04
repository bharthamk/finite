# Final browser repair batch — 4 September 2026

Status: validated and published as release 253 on 4 September 2026. The checks below were completed before publication; the approved interactive-guidance additions were subsequently saved to the public Devpost story and judge-only testing instructions. The submitted video and gallery remain unchanged.

## Repairs

- Accepted Spotlight receipts now project stay lengths into both the next-stage card and full timeline, including a Netherlands reduction. Obsolete literal day ranges are replaced with **Timing to reconcile** and an explanation. This is not an exact-date scheduling engine: transport and fixed-booking reconciliation remains outstanding.
- Travel starters understand stated adults, travellers and contiguous mixed adult/child groups. The exercised two-adult Hobart example now has a two-person transport allowance.
- Interview preparation preserves seven requested days and a daily time allowance. Preparation wording is not mistaken for an interviewer; unstated interviewer and format remain open. Explicit video/COO examples retain their supplied context.
- Daily practice uses seven weekly slots, and its question/to-do text no longer contradicts that rhythm.
- Non-office renovation starters no longer seed desks or office DIY work. The kitchen example preserves existing plumbing and the exact AUD 1,000 contingency within AUD 9,500.
- Local-demo Settings/resume and the draft's own arrival-active reload route retain local mode. Fresh authenticated and collaboration routes are not converted into local access.
- The header exposes the waiting draft while a saved plan is open and supports returning to it.
- Local-demo file-upload and all share buttons are disabled with explanatory copy. Unicode CSS expansion symbols use explicit escapes to avoid encoding-dependent mojibake.
- Starter copy distinguishes Finite's editable first pass from subsequent Codex research. README, story and judge-guide source now explain product-native navigation, highlights, popups and permission boundaries. The approved public Devpost story and judge-only testing instructions now include that explanation.

## Chrome checks performed

1. Remembered unsigned demo Settings opened without sign-in; return to plan worked.
2. Built the two-adult Hobart draft: two-traveller note and AUD 500 flight allowance visible; activated synthetic plan into Managing.
3. Built the seven-day interview draft: calendar showed preparation on 18–24 November before the 25 November interview, with 30 minutes/day in the selected item's notes.
4. Switched from that draft to saved Hobart and back using the header; resumed after reload without sign-in.
5. Built daily Spanish practice: four weekly items, each with 7 × 15-minute sessions; the reload test exposed and repaired the arrival-active bootstrap edge case.
6. Built kitchen renovation: 2–20 November, AUD 9,500 allocated; visible categories 3,400 + 3,825 + 1,275 + 1,000; plumbing requirement labelled as supplied by the request.
7. Ran the exact Spotlight route through Chrome native document.modelContext tools: entry, planning discovery, record change, compare five options. Chose option 5 and clicked the visible confirmation as a synthetic QA action, then applied through the guarded native tool. This is not independent human testing.
8. Accepted result: revision 2, AUD 910 freedom, Paris 7 nights and Netherlands 2 nights; both stayed correct after a real browser reload. All stage ranges explicitly require reconciliation. Native local receipt: receipt_650f3b355cdc9104; event: event_8e08fc92; candidate: candidate_778447f6b22f5bba.

## Automated checks

392 tests pass, including all five Spotlight objectives before/after persisted reload and idempotent replay. Typecheck and production build pass; all client chunks remain below 500 kB. Built Worker document checks pass for root, index, complete-demo, share and collaboration routes. Submission final gate passes 15 artifacts; its historical release-245/373-test baseline is not a claim about this candidate's current test count.

Reproduce the checks with `npm test`, `npm run build`, `npm run check:submission:final` and `npm run check:hosted:webmcp`. A fresh pre-GitHub run passed all 392 tests and all three hosted document-header checks. The published main bundle matched the validated local build byte for byte.

## Explicit remaining limits

- Native Chrome registration/execution is proven. A dedicated Codex-to-Chrome client connection was not exposed in this session; native Console execution is not certification of that client bridge.
- No second-account, valid multi-user invitation, cloud upload or published share lifecycle was certified here.
- The draft starter is heuristic and provisional, not live research or a universal natural-language parser.
- Exact itinerary day/date reconciliation remains visible outstanding work. Accepted aggregate totals and authority rules were not changed by this patch.
- Public submission text edits are complete. A real guided-popup gallery capture remains an optional addition requiring selection and approval; the submitted video and gallery remain unchanged.
