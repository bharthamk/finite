# Finite hackathon provenance

Finite is a new project created during the WebMCP Challenge submission period.

- Submission period opened: 2026-08-25 11:00 PDT / 2026-08-26 04:00 AEST.
- First repository commit: `1b03f6e` at 2026-08-26 09:30:09 AEST.
- Accepted live product source: `a33897152d38bb08e74015974612d2b30fa19dd4`.
- Product A+ sweep commit: `461a1ffbad05886202876afc19efd1da85bbd4c1`.
- Duration-contract hardening commit: `1620ecad617eeeeb5491f0710766821273addba8`.
- Matching release-marker commit: `2c2b678d01e7b4c92d5c7a97a0804f8757f5722c`.
- Mobile interaction finish commit: `a33897152d38bb08e74015974612d2b30fa19dd4`.
- Live release: Sites v240 with marker `hosted-release-marker-v240`.

The complete dated Git history therefore supplies direct evidence that the
project and its WebMCP implementation were created after the submission period
began. The repository includes the imperative registrations in
`src/webmcp-bootstrap.ts`, the document-lifetime dispatcher in `src/webmcp.ts`,
and executable WebMCP quality, cancellation, authority, endurance, and hostile
transaction tests under `tests/`.

The final source gate is 353/353 tests plus TypeScript, production client and
Worker builds, client chunk budget, and diff integrity. The accepted public
transaction and deployment facts are recorded in
`FINITE_V240_PRODUCT_A_PLUS_ACCEPTANCE_2026-09-01.md`.
