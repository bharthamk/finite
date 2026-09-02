# Authentication entry acceptance — 2026-08-26

## Decision

Finite owns authorization, never authentication credentials.

- ChatGPT Sites owns sign-in, sign-out, session continuity, verified email, and the stable Site-scoped user subject.
- Finite hashes the stable subject into a tenant scope and creates that private kitchen on first use. There is no registration form.
- A signed-out visitor may explicitly choose a 24-hour demo. Its opaque bearer is available only as a secure HTTP-only cookie; its namespace never adopts authenticated lineage and is purged on end or expiry.
- A portable Google/OIDC deployment will require the self-hoster to own its provider client and secrets. Finite will consume only a server-verified immutable subject through a later adapter.

## Proof

- `GET /api/auth/session` returns one of `SIGNED_OUT`, `AUTHENTICATED_SESSION`, or `DEMO_SESSION` without exposing a provider subject.
- `POST /api/auth/demo` refuses cross-origin writes, creates a random 256-bit bearer, stores only derived hashes, provisions a `demo_…` scope with `legacy_scope_adopted = 0`, and sets `Secure; HttpOnly; SameSite=Lax; Max-Age=86400`.
- Protected accepted-truth APIs accept a valid demo tenant but cannot read another namespace.
- `POST /api/auth/demo/end` purges the complete demo scope and expires its cookie.
- Signed-out pages do not construct the runtime or register WebMCP tools. The human must choose account or demo before Codex receives a kitchen.
- Signed-in Sites users retain the existing stable `oai-authenticated-user-id` tenancy. Optional name is decoded only under the platform's declared encoding; email/name remain display-only.

## Verification

- TypeScript production build: pass.
- Full deterministic suite: **56/56 pass**.
- Runtime dependency audit: **0 vulnerabilities**.
- Drizzle migration `0003_solid_komodo.sql` is generated from `db/schema.ts` and adds the indexed demo-session lifecycle table.
- The signed-out local route returns HTTP 200 and renders the account/demo entry surface. The plain local runner has no Sites-managed D1 binding, so durable demo creation is proven at the Worker contract and will receive its real binding only in the packaged Sites deployment.

## Release boundary

The current production Site remains owner-only. Publishing the Site publicly is a separate access decision because it changes who can reach the anonymous/demo entry surface. The auth build can be deployed privately without changing that audience.
