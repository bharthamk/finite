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
`db8a59bbfdbd7b353a36fb5690b1f0f4bb5d6a68`, with release marker
`hosted-release-marker-v245`, at `https://finite.bharthamk.chatgpt.site`.
The matching public source snapshot is
[`db8a59b`](https://github.com/bharthamk/finite/commit/db8a59bbfdbd7b353a36fb5690b1f0f4bb5d6a68).
The application, Worker, schema, migrations, tests, static assets, lockfile and
build configuration have identical Git object IDs in both commits.
Saved version `appgprj_6a8e253e5c888191bd46de9e62734133~appgver_bb11b815427c81918c4debc2e17b1ee8`
was promoted by deployment `appgdep_6a9951af964081919ed29086f12ac81b`.
The local release archive SHA-256 is
`b118682bcec07da22c3d4e2afbabdd51e6d050b3d1ac1c440854d851023e3c83`.
Production acceptance covered the public marker, signed-out prerequisite copy,
canonical Spotlight WebMCP entry, browser-local reload continuity, honest
pre-connection activity, disabled-share explanation, and a 390-pixel-wide
layout with no horizontal overflow or console errors.

## Remaining publication boundary

This repository is released under the MIT License. The Finite name and marks
remain outside that trademark grant. Publishing judge credentials, the final
YouTube URL and the Devpost entry remain separate owner release actions.
