# Native Chrome production acceptance — 2026-08-26

## Scope

This receipt covers the production `finite-plan/` TypeScript package through Chrome 151's experimental native WebMCP host at `http://127.0.0.1:4188/` with `#enable-webmcp-testing` enabled.

It proves browser-native registration, discovery, invocation, dynamic registration lifecycle, application authority enforcement, accepted-state persistence, and reload-safe idempotency. It does not prove Codex Site Tools discovery, model selection, safety review, or fresh-session behavior.

## Build proof

- `npm run typecheck` — pass.
- `npm test` — 7 tests, 7 pass, 0 fail.
- `npm run build` — pass; 10 modules transformed.
- `dist/index.html` SHA-256: `19ea0f30a24a10154451132ad0cdc4c3bebb015b70866923c5c3c327af205e85`.
- `dist/assets/index-CUtQSJ66.js` SHA-256: `4b9cc0fc32c496a4629281976b58dedec4e17dc932f87ae5eb056691b914fcf2`.
- `package-lock.json` SHA-256: `709355d53579ae25e7c83526fcb388b849bd2dcf799bf1745732b4f7b5088e8a`.

## Host diagnostics

- Status: `Native WebMCP registered`.
- Secure context: `true`.
- Cross-origin isolated: `true`.
- `document.modelContext`: `object`.
- Active profile: `travel`.
- Compiled profile SHA-256: `fb2188e90ce0c6fa4970b99154f3278d62c9be4bff61fe94d016edda358d62b2`.
- Registered tools: 21 (18 stable plus 3 travel-contextual).

## Transaction trace

1. Native `finite_get_capabilities` returned `CAPABILITIES`.
2. Native `travel_extend_stay` recorded a three-night Paris extension and returned `CHANGE_RECORDED`.
3. Native `finite_compare_options` returned `OPTIONS_AVAILABLE`.
4. Native `finite_stage_option` returned `OPTION_STAGED`.
5. Native `finite_apply_approved_option` with `agent_fabricated` returned `CONSENT_MISSING_OR_MISMATCHED`; revision remained 1.
6. The separate human-authority surface created an approval bound to the staged candidate, content hash, plan, and revision.
7. Native approved apply returned `OPTION_APPLIED`, moved revision 1 → 2, conserved the A$6,500.00 finite total, and emitted receipt `receipt_8181a115` with replay checksum `d6239cc20b734c08939365691d8d9cd90e5dbb62a0fbf19946bc4e16889d5e3d`.
8. Reload restored revision 2, the accepted allocations/entities, the change event, and one receipt; no pending candidate or authority state survived.
9. Native retry using persisted idempotency key `native-option-1` returned `IDEMPOTENT_REPLAY`; revision remained 2.
10. The rebuilt production bundle was reloaded and the same retry passed again.

## Contextual-tool lifecycle

- Before switch: 21 tools including `travel_extend_stay`.
- Travel → renovation returned `PROFILE_SWITCHED`.
- During renovation: 21 tools; `travel_extend_stay` absent and `renovation_replace_material` present.
- Renovation → travel returned `PROFILE_SWITCHED`.
- After restore: 21 tools; travel contextual tools present and renovation contextual tools absent.
- Result: `NATIVE_CONTEXT_LIFECYCLE_PASS`.

## Authority boundary

The adapter inventory contains no `humanApprove`, `humanConfirmActualCorrection`, or `humanConfirmPreferenceChange` tool. The canary's human-labelled controls are diagnostic authority-surface fixtures, not WebMCP registrations. Browser automation exercised that surface for the synthetic test; this proves route separation, not a real consumer decision.

## Open gate

This Codex account/build still does not expose the page's WebMCP tools to the Codex task. Fresh-session discovery, tool choice, untrusted-evidence behavior, confirmation presentation, and end-to-end agent latency remain external acceptance work.

