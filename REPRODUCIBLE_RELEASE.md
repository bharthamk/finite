# Reproducible release contract

Updated: 2026-09-03

Finite can be rebuilt from a clean checkout without a Finite-owned backend
agent, model key, or user database. The runtime boundary is Node 22.13 or newer,
the lockfile, Cloudflare Workers/D1, and an identity provider that supplies the
documented authenticated user header or the included isolated demo route.

## Clean build

```bash
npm ci
npm run db:local:migrate
npm test
npm run build
```

The current local gate is 373/373 tests, a successful TypeScript check, a
successful Vite client/Worker build, a clean-copy `drizzle-kit generate` no-op,
and successful migration rehearsals both from an empty database and from a
database stopped at `0008`. The gate also verifies that the production lab is
absent, private operator JavaScript is loaded only after authentication, and
the script CSP no longer permits inline execution.

The build writes the exact release marker into the emitted HTML. Every Worker
response carries the same value in `x-finite-build`. Hosted verification proves
both the static entry shell and the live API without assuming that the Sites
edge routes HTML through the Worker before serving an asset. Static response
headers remain owned by the Sites edge; Finite does not emit an ineffective
Cloudflare `_headers` file for that path.

## Source boundary

The reproducible source is the committed repository state, excluding generated
or machine-local directories:

- exclude `node_modules/`, `dist/`, `dist-test/`, `.wrangler/`, `.DS_Store`,
  editor files, logs, coverage, and any environment file;
- include `.openai/hosting.json`, `package.json`, `package-lock.json`, TypeScript
  and Vite configuration, `src/`, `worker/`, `db/`, `drizzle/`, `tests/`, static
  assets, and the governing product/architecture documentation;
- never include D1 contents, browser storage, cookies, identity headers,
  deployment bypass tokens, local Wrangler state, or human plan data.

An inspection over the source tree found no environment file, private key,
credential file, absolute local path, or internal agent/workspace identifier.
The migration filename `0004_secret_power_pack.sql` is a Drizzle-generated name,
not a secret. Test strings containing `SECRET_*` are deliberate redaction
fixtures and are not credentials.

## Deployment provenance

The Sites release archive must be created only after the committed source passes
the clean gate. `commit_sha` must equal that exact HEAD; the archive must contain
the successful build output rather than the source tree. The saved Sites version
records both the commit and archive SHA-256 before a deployment is promoted.
The accepted product and deployed source is
`b196755208028262ebbcbb17d6eca8467477d596`, with release marker
`hosted-release-marker-v245`, at `https://finite.bharthamk.chatgpt.site`.
The matching public source snapshot is
[`4424fda`](https://github.com/bharthamk/finite/commit/4424fda9a1f1b0426f78f0b7b602d272a071c98c).
The application, Worker, schema, migrations, tests, static assets, lockfile and
build configuration have identical Git object IDs in both commits.
Saved version `appgprj_6a8e253e5c888191bd46de9e62734133~appgver_4fbc588556f88191a28c0aa61f6a9a57`
was promoted by deployment `appgdep_6a987bd798988191809ea739020a56ab`.
The local release archive SHA-256 is
`fab2279be05ca5b76a02725adf64e487c144434e65877e312f4dad18f40f2374`.
Production acceptance covered the public marker, signed-out prerequisite copy,
canonical Spotlight WebMCP entry, browser-local reload continuity, honest
pre-connection activity, disabled-share explanation, and a 390-pixel-wide
layout with no horizontal overflow or console errors.

## Remaining publication boundary

This repository is released under the MIT License. The Finite name and marks
remain outside that trademark grant. Publishing judge credentials, the final
YouTube URL and the Devpost entry remain separate owner release actions.
