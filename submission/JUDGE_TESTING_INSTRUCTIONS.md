# Finite judge testing instructions

No account or credential is required for the judge route. It runs in visibly
labelled browser-local Demo mode and writes no personal data or signed-in plan.

Accepted release: Sites v240, marker `hosted-release-marker-v240`.

## 60-second visual route

Open the Spotlight link below. The page immediately shows the active plan,
fixed international flights, total budget, current freedom, and the synthetic
Paris pressure. Expand **Decisions** to inspect the three legal routes and the
rejected-combination count. No mutation is required to understand the product.

## Recommended route

1. Open the [Finite Spotlight](https://finite.bharthamk.chatgpt.site/?start=spotlight-active&tour=spotlight&plan=1&fresh=1)
   in ChatGPT's in-app browser.
2. Wait for the active **More Paris, without losing the trip** plan at revision
   1 and confirm the visible **Demo mode · Local only** badge.
3. Select **Hand off to Codex**, then **Start the live walkthrough**. Copy the
   generated introduction into the current Codex task and choose the built-in
   browser when asked where to watch.
4. Codex records the built-in synthetic change—add three nights in Paris while
   preserving fixed international flights and at least AUD 500 of freedom—and
   asks Finite to compare legal options.
5. At the visible decision boundary, choose **Protect breathing room**, select
   **Use this option**, review the exact effect, and select **Confirm and update
   plan**. Codex cannot perform either human action.
6. Codex re-enters canonical state, detects the exact authority, applies only
   that candidate, and shows the revision 1→2 receipt.
7. Reload. Revision 2, the receipt, the changed measures, and the accepted
   seven-night Paris projection remain visible.

Expected search proof: 26 bounded combinations, 18 legal combinations, 8
rejected combinations, and 3 surfaced legal routes. Expected protected truth:
international flights and total budget.

This route never books, buys, cancels, contacts anyone, or uses personal data.

Expected accepted result for **Protect breathing room**: trip duration and
booked duration both move from 18 to 21 days, with AUD 910 freedom retained.
The accepted plan advances from revision 1 to 2 exactly once.

## If WebMCP tools do not appear

- In ChatGPT, keep the Site open in the in-app browser and refresh once.
- In Chrome, use Chrome 149 or later, enable
  `chrome://flags/#enable-webmcp-testing`, restart Chrome, and reopen the route.
- The visible product remains inspectable without tools; no credentials or
  private test data are required.
