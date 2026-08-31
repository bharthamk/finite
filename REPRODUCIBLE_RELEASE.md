# Reproducible release contract

Updated: 2026-08-31

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

The current local gate is 325/325 tests, a successful TypeScript check, a
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
The currently deployed product is release v236 from source
`3e5fd8e48e45c78549e033550bf733285c3ae76e`, with release marker
`hosted-release-marker-v236`, at `https://finite.bharthamk.chatgpt.site`.
Release v235 was superseded during live acceptance after a previously used
browser exposed stale browser-local demo scope. v236 consumes a one-use fresh
Spotlight launch parameter, removes it from the stable URL, and then preserves
the accepted plan across reload. Production acceptance covered signed-out HTTP,
the returning-browser reset, native WebMCP change recording and legal option
generation, visible human choice and confirmation, a revision-bound apply from
revision 1 to 2, the visible receipt, and post-reload continuity.

## Authority still required

This repository intentionally has no project license yet. Selecting a license,
creating a public remote, changing Site access, or publishing judge credentials
remain owner release decisions. The public Site deployment does not imply any
of those separate submission or repository decisions.
