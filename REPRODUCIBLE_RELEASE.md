# Reproducible release contract

Updated: 2026-09-01

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

The current local gate is 367/367 tests, a successful TypeScript check, a
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
The public-history release source for the currently deployed v242 product is
`b7e112486f2a56dc68f131cac76dc8a3d8796994`, with release marker
`hosted-release-marker-v242`, at `https://finite.bharthamk.chatgpt.site`.
Saved version `appgprj_6a8e253e5c888191bd46de9e62734133~appgver_27b5872b1df48191a3a7a0d280f573cc`
was promoted by deployment `appgdep_6a9736c4d91c8191bcef1024ecce1598`.
The local release archive SHA-256 is
`dedba0a84e007c2a7e2f2f5cc25073be74d451e7f126f721b3e935ea014bfa2e`.
Production acceptance covered the public marker, signed-out prerequisite copy,
canonical Spotlight WebMCP entry, browser-local reload continuity, honest
pre-connection activity, disabled-share explanation, and a 390-pixel-wide
layout with no horizontal overflow or console errors.

## Authority still required

This repository intentionally has no project license yet. Selecting a license,
creating a public remote, changing Site access, or publishing judge credentials
remain owner release decisions. The public Site deployment does not imply any
of those separate submission or repository decisions.
