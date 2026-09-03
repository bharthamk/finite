# Finite v245 product acceptance

Accepted: 2026-09-03

## Release identity

- Live product: https://finite.bharthamk.chatgpt.site/
- Sites version: 246
- Product and deployed source: `db8a59bbfdbd7b353a36fb5690b1f0f4bb5d6a68`
- Matching public source snapshot:
  [`db8a59b`](https://github.com/bharthamk/finite/commit/db8a59bbfdbd7b353a36fb5690b1f0f4bb5d6a68)
- Marker: `hosted-release-marker-v245`
- Sites version ID:
  `appgprj_6a8e253e5c888191bd46de9e62734133~appgver_bb11b815427c81918c4debc2e17b1ee8`
- Deployment ID: `appgdep_6a9951af964081919ed29086f12ac81b`
- Local packaged archive SHA-256:
  `b118682bcec07da22c3d4e2afbabdd51e6d050b3d1ac1c440854d851023e3c83`
- Stored archive content hash:
  `62a08618e169c1612ad6431b8b44c5b822bc5fef999594d1e0f253993d1d1673`
- Rollback: Sites version 245, version ID
  `appgprj_6a8e253e5c888191bd46de9e62734133~appgver_4fbc588556f88191a28c0aa61f6a9a57`.

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

- 373/373 automated tests pass.
- 20/20 hostile independent Spotlight kernel transaction runs pass.
- TypeScript passes.
- Production client and Worker builds pass.
- Client chunk budget passes.
- The live Spotlight returned HTTP 200 with the v245 marker.
- The final copy and variable-count WebMCP result were verified in the in-app
  browser after deployment.

## Final source remediation

The accepted source fixes the later
judge-QC findings around whole-unit budget allocation, over-allocation gating,
plan titles, resolved money questions, plan-family option language, exact-floor
copy, and Spotlight handoff length and route order.

- 373/373 automated tests pass.
- TypeScript, production builds, client chunk limits, and the submission gate
  pass.
- The repaired AUD 650 manual dinner and Spotlight comparison paths pass in an
  isolated browser with no console warnings or errors.

## Remaining submission boundary

Film v14 is the accepted local upload candidate. Public YouTube publication,
final playback verification, and Devpost submission remain owner-controlled.
Devpost has not been submitted.
