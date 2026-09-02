# Demo mode and collaboration acceptance — 2026-08-31

## Product contract

Demo mode is a browser-local workspace, not another remote tenant. Finite selects it before repository hydration, uses a separate installation-scoped namespace, does not load account plans, disables sharing, invitations, and uploads, and blocks every same-origin API mutation at the network boundary. Turning Demo mode off never synchronizes its local records.

Publishing and collaboration are separate product actions. A publication is a bounded read-only live or frozen view. An invitation is authenticated, expires, can be revoked immediately, and becomes bound to the first signed-in account that claims it.

Invitation roles are enforced by the Worker:

- `view` can read only the selected live projection.
- `suggest` can also add a provisional suggestion.
- `edit` can also add a provisional working-draft edit.

No collaborator route can mutate accepted plan truth, create human authority, activate a plan, administer access, or represent an external action. The owner can mark a contribution incorporated or dismissed; this records handling and does not pretend the contribution was automatically accepted.

## Proof

- `npm test`: 297 tests passed after release-marker and single-account claim race hardening.
- `tests/local-demo.test.mjs`: local mode ownership, isolated namespace, mutation guard, and reload-safe local arrival state.
- `tests/plan-collaboration.test.mjs`: one-account claim, selected projection, role enforcement, contribution boundary, owner handling, revocation, authentication, and cross-origin refusal.
- `tests/release-shell.test.mjs`: dedicated collaboration route receives the current no-store product shell.
- `npm run build`: production client and Worker compile; all chunks remain below the 500 kB regression ceiling.
- In-app browser: Settings visibly reports `Demo mode · Local only` and `On · remote writes are blocked`; the owner dialog visibly separates `Publish a view` from `Invite to collaborate`, shows all three roles, previews bounded access, and states the owner-only authority boundary.

## Release boundary

Migration `0021_goofy_gideon.sql` adds tenant-owned invitations and collaboration updates. Tenant reset removes owner records, collaborator contributions, and accepted invitation bindings. Release marker: `hosted-release-marker-v207`.
