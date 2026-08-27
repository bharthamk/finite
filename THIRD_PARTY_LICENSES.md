# Direct dependency and license inventory

Date: 2026-08-27

Versions are locked by `package-lock.json`. This inventory covers Finite's
direct dependencies; transitive notices remain supplied in each installed
package and must be regenerated from the lockfile for a public release artifact.

| Package | Version | Use | Declared license |
|---|---:|---|---|
| `drizzle-orm` | 0.45.2 | Runtime D1 schema/query layer | Apache-2.0 |
| `@cloudflare/vite-plugin` | 1.54.0 | Development/build | MIT |
| `@openai/sites-vite-plugin` | 0.2.0 | Sites build packaging | MIT |
| `drizzle-kit` | 0.31.10 | Migration generation/inspection | MIT |
| `typescript` | 5.9.3 | Type checking/library build | Apache-2.0 |
| `vite` | 8.2.2 | Client/Worker build | MIT |
| `wrangler` | 4.126.0 | Local D1 and Worker tooling | MIT OR Apache-2.0 |

`npm audit --omit=dev` reported zero runtime vulnerabilities at this release
gate. This inventory does not choose a license for Finite itself.
