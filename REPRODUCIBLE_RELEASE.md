# Reproducible release contract

Date: 2026-08-27

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

The accepted v56 gate is 148/148 tests, no pending D1 migration, a successful
TypeScript check, a successful Vite client/Worker build, and zero runtime audit
findings from `npm audit --omit=dev`.

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
records both the commit and archive SHA-256 before the owner-private deployment
is promoted.

## Authority still required

This repository intentionally has no project license yet. Selecting a license,
creating a public remote, changing Site access, or publishing judge credentials
are owner release decisions. Reproducibility is ready; public release is not
silently implied.
