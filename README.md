# Finite

**You state the outcome. Codex operates. You decide what becomes true.**

Finite is the agent-native working layer behind plans that must survive change.
People describe what needs to happen in ordinary language. Codex operates the
same live plan they can see. Finite keeps accepted facts, constraints, evidence,
revisions, trade-offs and receipts coherent while the person retains every
consequential decision.

[Open Finite](https://finite.bharthamk.chatgpt.site/) ·
[Run the judge Spotlight](https://finite.bharthamk.chatgpt.site/?start=spotlight-active&tour=spotlight&plan=1&fresh=1)

## Why Finite exists

Most planning software hands the person forms, dashboards and workflows and
still expects them to do the operational work. Finite inverts that relationship:

- the person states the outcome, supplies judgment and grants authority;
- Codex interprets, researches, compares and operates;
- Finite owns coherent state, arithmetic, constraints, persistence and receipts.

The person is the diner, Codex is the chef, and Finite is the kitchen and
service system. Travel, renovation, events, interview preparation and general
outcomes are projections of one planning grammar—not renamed copies of one
generic dashboard.

## Why WebMCP matters

WebMCP makes the visible page the operating environment. Codex discovers typed,
page-scoped capabilities against the exact plan the person is viewing. There is
no copied chat replica, pixel guessing or hidden application-owned model.

Finite exposes seven stable native tools for the document lifetime:

1. page readiness;
2. canonical kitchen entry;
3. capability inspection;
4. bounded semantic toolset selection;
5. exact content-addressed result reading;
6. effort receipts; and
7. guarded semantic invocation.

Each route advertises a bounded typed manifest. Every mutation is revalidated
against current revision, evidence and authority. Large results remain in an
ephemeral content-addressed vault and are retrieved only by exact semantic path.

Human confirmation creators are structurally absent from WebMCP. Codex can
prepare and recommend; the person alone can create consequential authority.

## The core transaction

1. Codex enters one checksum-bound service ticket with canonical identity and
   one authoritative next action.
2. A real-world change is recorded against the current accepted revision.
3. Finite enumerates permitted moves and produces distinct bounded options.
4. The person sees the trade-offs and approves one exact result.
5. Finite atomically applies that approved option and emits a receipt.
6. Accepted truth and replay protection survive a browser-empty reload from D1.

The Spotlight demonstrates this complete transaction, including visible human
authority, accepted apply, receipt, reload and idempotent replay.

## Product capabilities

- Adaptive travel, renovation, event and general-plan surfaces compiled from a
  closed safe component grammar.
- Exact integer-money conservation, locks, constraints, typed relationships and
  deterministic option search.
- Immutable plan revisions, SHA-256-bound profiles, atomic apply and durable
  receipts.
- Arrival-first planning from ordinary language, with source-labelled known,
  inferred and missing information.
- Manual editing, Planning-to-Managing progression, real-world changes,
  attachments, evidence and completion learning.
- Multi-plan catalogues, cross-device restore, role-bounded collaboration and
  published read-only views.
- Browser-local Demo mode that cannot write into the signed-in workspace.
- Account-isolated D1 truth, R2 file storage and retry-safe cross-store work.
- Responsive and keyboard-operable human surfaces.

The product direction and operating law are documented in
[PRODUCT_NORTH_STAR.md](./PRODUCT_NORTH_STAR.md) and
[ARRIVAL_AND_SURFACE_CONTINUITY.md](./ARRIVAL_AND_SURFACE_CONTINUITY.md).

## Architecture

Finite has no backend language model and no application-owned agent.

- `src/` contains the deterministic planning kernel, adaptive compiler, browser
  product, persistence adapters and WebMCP registry.
- `worker/` contains authenticated D1/R2 APIs and the production asset shell.
- `db/` and `drizzle/` define the durable schema and migrations.
- `tests/` contains kernel, authority, persistence, WebMCP, product-route and
  full-journey regression coverage.
- `submission/` contains the hackathon narrative, judge route, script,
  storyboard and evidence map.
- `docs/acceptance/` contains dated engineering acceptance records.
- `docs/engineering/` contains the deeper architecture and endurance reports.

## Run locally

Requirements: Node.js 22.13 or newer.

```bash
npm ci
npm run db:local:migrate
npm run typecheck
npm test
npm run build
npm run dev
```

Local development uses an isolated D1 database named `finite-local` and an
isolated R2 bucket. The placeholder identifiers in `wrangler.local.jsonc` are
local-only. Production uses the Sites-managed `DB` and `FILES` bindings declared
in `.openai/hosting.json`.

Native Chrome WebMCP testing currently requires
`chrome://flags/#enable-webmcp-testing`. A supported host shows that Codex is
connected.

## Release proof

The accepted live release is v242 with marker
`hosted-release-marker-v242`.

- 367/367 automated tests pass.
- 20/20 independent hostile Spotlight kernel transactions pass.
- TypeScript, production client and Worker builds pass.
- The client chunk budget and submission working gate pass.
- The deployed public root and WebMCP readiness/entry path have been verified.

See [the v242 acceptance record](./docs/acceptance/FINITE_V242_PRODUCT_ACCEPTANCE_2026-09-02.md),
[reproducible release instructions](./REPRODUCIBLE_RELEASE.md), and
[judge testing instructions](./submission/JUDGE_TESTING_INSTRUCTIONS.md).

## Project ownership

Finite is a project by [Benji Hart](https://github.com/bharthamk), created during
the WebMCP Challenge submission period.
