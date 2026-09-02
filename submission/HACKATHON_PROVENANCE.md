# Finite hackathon provenance

Finite is a new project created during the WebMCP Challenge submission period.

- Submission period opened: 2026-08-25 11:00 PDT / 2026-08-26 04:00 AEST.
- First repository commit: `1e3b3c8` at 2026-08-26 09:30:09 AEST.
- Accepted live product source: `b7e112486f2a56dc68f131cac76dc8a3d8796994`.
- Product A+ sweep commit: `14e91b1878630b11649d3e49fb4aedf99c41a406`.
- Duration-contract hardening commit: `dade54718d1b508b4c7ec98e1eae2d63bbb5746b`.
- Matching release-marker commit: `ea1c88cd7901d52a941d530fe024149e32fbd3ab`.
- Judge-path continuity and Spotlight entry are included in the accepted live
  product source above.
- Documentation reconciliation after product freeze: `739b4f3810e60f9fe086e00d6531d2a106ffc0cb`.
- Final local v241 media-package assembly: `f72efd940e5a2e1e16d7952b4c9335b6c356998d`.
- v242 submission-story reconciliation: `09f5e609d6d2db6937c083b8fe468b54468695ad`.
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
`docs/acceptance/FINITE_V242_PRODUCT_ACCEPTANCE_2026-09-02.md`.
