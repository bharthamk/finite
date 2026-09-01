# Finite hackathon provenance

Finite is a new project created during the WebMCP Challenge submission period.

- Submission period opened: 2026-08-25 11:00 PDT / 2026-08-26 04:00 AEST.
- First repository commit: `1b03f6e` at 2026-08-26 09:30:09 AEST.
- Accepted live product source: `11558d2346b404cc13312f9d5cd7f1daf9a051e7`.
- Product A+ sweep commit: `461a1ffbad05886202876afc19efd1da85bbd4c1`.
- Duration-contract hardening commit: `1620ecad617eeeeb5491f0710766821273addba8`.
- Matching release-marker commit: `2c2b678d01e7b4c92d5c7a97a0804f8757f5722c`.
- Judge-path continuity and Spotlight entry are included in the accepted live
  product source above.
- Documentation reconciliation after product freeze: `07d5225519801534cb224206e703ef335b8b8422`.
- Final local v241 media-package assembly: `165f07cff83a3ac9647ddd6526cd74fdcbe6588e`.
- v242 submission-story reconciliation: `c9640daf01e78b18084edf87eaec4d1e1bf6b4aa`.
- Live release: Sites v242 with marker `hosted-release-marker-v242`, version ID
  `appgprj_6a8e253e5c888191bd46de9e62734133~appgver_27b5872b1df48191a3a7a0d280f573cc`
  and deployment ID `appgdep_6a9736c4d91c8191bcef1024ecce1598`.

The complete dated Git history therefore supplies direct evidence that the
project and its WebMCP implementation were created after the submission period
began. The repository includes the imperative registrations in
`src/webmcp-bootstrap.ts`, the document-lifetime dispatcher in `src/webmcp.ts`,
and executable WebMCP quality, cancellation, authority, endurance, and hostile
transaction tests under `tests/`.

The final source gate is 367/367 tests plus TypeScript, production client and
Worker builds, client chunk budget, and diff integrity. The accepted public
transaction and deployment facts are recorded in
`FINITE_V242_PRODUCT_ACCEPTANCE_2026-09-02.md`.
