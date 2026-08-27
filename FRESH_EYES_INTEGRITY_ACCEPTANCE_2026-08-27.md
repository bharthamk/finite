# Fresh-eyes integrity acceptance — 2026-08-27

## Outcome

Finite's full production codebase was reviewed again from the trust boundary inward rather than from the existing feature narrative. The kernel and operator contract remained strong, but the review found seven material engineering gaps hidden by successful happy-path journeys. All seven are repaired and regression-covered before the human-facing UI pass begins.

## Defects found and closed

1. **Cross-account browser cache bleed.** Browser persistence was origin-global, so two authenticated identities sharing a browser could see the same snapshots, custom catalog, construction packet, activation receipts, and active selection. `ScopedStorage` now prefixes every cache key with the server-derived opaque tenant scope. Invalid or broad scopes are refused; startup removes foreign Finite cache namespaces, and a historical owner's old unscoped keys are deleted only after successful scoped adoption.
2. **Unsafe implicit legacy ownership.** The server let the first authenticated account automatically inherit `owner-private-v1`. That made arrival order—not explicit authority—the migration rule. New accounts now always provision with `legacy_scope_adopted = 0`; no ordinary sign-in copies legacy data. Existing already-adopted owner lineage remains intact.
3. **Custom plans were device-local definitions.** D1 stored accepted snapshots but not the complete compiled definition, evidence, surface, moves, search policy, or activation lineage. The new `plan_catalog` table and `/api/plan-catalog` route persist and return a hash-validated reconstruction packet. A browser-empty device now recompiles the exact custom adaptive surface before hydrating accepted truth.
4. **Authority challenges covered only option apply.** Corrections, preference changes, lifecycle, group decisions, external-action truth, and plan activation relied on memory-local confirmation plus receipt validation. Every accepted mutation now creates an exact server challenge binding target type/id, plan, profile, base revision, content hash, and human authority id. The server validates and consumes it atomically with the accepted write.
5. **Arrival closure trusted a caller-supplied plan binding.** An arrival could be marked accepted without proving the named plan/profile/revision was the tenant's durable head. Closure now requires an exact `plan_heads` match and otherwise returns `ARRIVAL_ACCEPTED_PLAN_NOT_CURRENT` without changing arrival or accepted truth.
6. **Demo cleanup was incomplete.** Ending or expiring a demo omitted construction packets, returned-draft reviews, and the custom plan catalog; abandoned expired demos could remain indefinitely. The purge covers the full namespace and demo creation garbage-collects a bounded batch of expired scopes.
7. **Production shell hardening and proof drift.** The build log still described an obsolete 61-test/45-tool architecture, production source maps were emitted, and security headers existed only in local Vite. Copy now describes the permanent seven-tool dispatcher, source maps are disabled, and every Worker/API/asset response receives CSP, opener/resource isolation, permissions, no-referrer, and `nosniff` headers.

## Determinism repairs

The untouched v55 suite exposed a timing-sensitive legacy-registry replay (`TOOL_NOT_FOUND` instead of `IDEMPOTENT_REPLAY`). A coverage-instrumented run found the same harness assumption in the twelve-journey endurance suite. Legacy tests now await the adapter's documented route-settlement boundary; the production endurance suite uses the same permanent `finite_invoke` dispatcher as the deployed page. No production registry weakening was introduced.

## Executable proof

- **148/148** complete tests pass.
- The full suite also passes under Node's experimental coverage instrumentation.
- TypeScript and the production Vite client/Worker build pass.
- Drizzle migration `0008_previous_vulture.sql` applies cleanly to local D1.
- A real local demo session reads the new empty durable plan catalog, then end-demo purges its namespace.
- `npm audit --omit=dev` reports zero vulnerabilities.
- The production build emits no source-map files.
- Worker HTML and JSON responses expose the same tested security-header contract.

New regressions specifically prove shared-origin account cache isolation, invalid scope refusal, no implicit legacy adoption, durable custom-plan reconstruction on an empty browser, exact arrival/head matching, complete demo purge and expired-demo garbage collection, security headers, and permanent-dispatcher endurance under changed timing.

## Release boundary

The release marker is `fresh-eyes-integrity-v56`. Deployment remains owner-private. Public access, repository publication, license selection, judge credentials, and submission preparation remain explicit later decisions; this tranche changes none of them.
