# Finite v245 product acceptance

Accepted: 2026-09-03

## Release identity

- Live product: https://finite.bharthamk.chatgpt.site/
- Sites version: v245
- Product and deployed source: `b196755208028262ebbcbb17d6eca8467477d596`
- Matching public source snapshot:
  [`4424fda`](https://github.com/bharthamk/finite/commit/4424fda9a1f1b0426f78f0b7b602d272a071c98c)
- Marker: `hosted-release-marker-v245`
- Sites version ID:
  `appgprj_6a8e253e5c888191bd46de9e62734133~appgver_4fbc588556f88191a28c0aa61f6a9a57`
- Deployment ID: `appgdep_6a987bd798988191809ea739020a56ab`
- Local packaged archive SHA-256:
  `fab2279be05ca5b76a02725adf64e487c144434e65877e312f4dad18f40f2374`
- Stored archive content hash:
  `a1a490a0bc60837c42e27ed607a33445212236172f3a44b472b75f68b267d155`
- Rollback: Sites v244, version ID
  `appgprj_6a8e253e5c888191bd46de9e62734133~appgver_cebbbff9f43081919bfe3574d8e1696b`.

## Product acceptance

v245 is the final wording and product-model correction.

1. Search returns every meaningfully different workable direction found for the
   current plan instead of targeting a fixed suggestion count.
2. A plan with one workable direction returns one suggestion. The Spotlight
   plan returns five because five distinct directions exist.
3. The live decision state says `workable directions`, handles singular and
   plural correctly, and invites the person to compare or continue working with
   Codex.
4. The blocked state says `No workable direction yet` and explains that the
   tested versions conflict with a current boundary.
5. `Legal route`, defensive pre-change reassurance, and deterministic three-plan
   language are absent from current product and submission copy.
6. The real-world boundary remains precise where it matters: updating a plan is
   separate from booking, buying, cancelling, or contacting people.

## Live WebMCP proof

The public no-credential Spotlight was opened in ChatGPT's in-app browser after
deployment.

- The page returned `hosted-release-marker-v245` and the corrected planning
  status.
- The page advertised the seven stable WebMCP tools.
- `finite_enter_kitchen` returned `KITCHEN_ENTERED` at revision 1.
- `finite_record_change_event` returned `CHANGE_RECORDED` for the three-night
  Paris change.
- `finite_compare_options` returned `OPTIONS_AVAILABLE` with accepted state
  unchanged.
- Exact result recovery returned 26 explored combinations, 18 legal
  combinations, 8 rejected combinations, 5 generated options, and 5 valid
  options.
- The five distinct objectives were balanced, comfort, experience, schedule,
  and buffer.

## Quality gate

- 368/368 automated tests pass.
- 20/20 hostile independent Spotlight kernel transaction runs pass.
- TypeScript passes.
- Production client and Worker builds pass.
- Client chunk budget passes.
- The live Spotlight returned HTTP 200 with the v245 marker.
- The final copy and variable-count WebMCP result were verified in the in-app
  browser after deployment.

## Remaining submission boundary

The final film is locally accepted. Public YouTube publication, final playback
verification, and Devpost submission remain owner-controlled. Devpost has not
been submitted.
