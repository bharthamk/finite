# Finite hackathon provenance

Finite is a new project created during the WebMCP Challenge submission period.

- Submission period opened: 2026-08-25 11:00 PDT / 2026-08-26 04:00 AEST.
- First repository commit: `1b03f6e` at 2026-08-26 09:30:09 AEST.
- Accepted live product source: `8194ce37ae6795ebda217ce82f4bf25bb86b73ef`.
- Product A+ sweep commit: `461a1ffbad05886202876afc19efd1da85bbd4c1`.
- Duration-contract hardening commit: `1620ecad617eeeeb5491f0710766821273addba8`.
- Matching release-marker commit: `2c2b678d01e7b4c92d5c7a97a0804f8757f5722c`.
- Judge-path continuity and Spotlight entry commit: `8194ce37ae6795ebda217ce82f4bf25bb86b73ef`.
- Live release: Sites v241 with marker `hosted-release-marker-v241`.

The complete dated Git history therefore supplies direct evidence that the
project and its WebMCP implementation were created after the submission period
began. The repository includes the imperative registrations in
`src/webmcp-bootstrap.ts`, the document-lifetime dispatcher in `src/webmcp.ts`,
and executable WebMCP quality, cancellation, authority, endurance, and hostile
transaction tests under `tests/`.

The final source gate is 358/358 tests plus TypeScript, production client and
Worker builds, client chunk budget, and diff integrity. The accepted public
transaction and deployment facts are recorded in
`FINITE_V241_PRODUCT_A_PLUS_ACCEPTANCE_2026-09-01.md`.
