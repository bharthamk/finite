# Finite

<p align="center">
  <img src="./public/finite-wordmark.png#gh-light-mode-only" width="260" alt="Finite">
  <img src="./docs/media/finite-wordmark-dark.png#gh-dark-mode-only" width="260" alt="Finite">
</p>

<p align="center"><strong>Change your plans without rebuilding them.</strong></p>

<p align="center">
  Finite is for plans with too many connected parts to update one by one. Tell Codex what changed. Codex and Finite work through the knock-on effects across dates, money, bookings, people and commitments, then bring back the distinct ways forward that fit your plan.
</p>

<p align="center">
  <a href="https://finite.bharthamk.chatgpt.site/"><strong>Open Finite</strong></a>
  &nbsp;·&nbsp;
  <a href="https://finite.bharthamk.chatgpt.site/?start=spotlight-active&tour=spotlight&plan=1&fresh=1"><strong>Run the two-minute judge Spotlight</strong></a>
  &nbsp;·&nbsp;
  <a href="./submission/JUDGE_TESTING_INSTRUCTIONS.md"><strong>Testing guide</strong></a>
</p>

<p align="center">
  <a href="https://github.com/bharthamk/finite/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/bharthamk/finite/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="Release v245" src="https://img.shields.io/badge/live_release-v245-d9f45f?labelColor=123d34">
  <img alt="368 tests passing" src="https://img.shields.io/badge/tests-368%20passing-d9f45f?labelColor=123d34">
  <a href="./LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-f3eee5?labelColor=123d34"></a>
</p>

![A concrete example of Finite keeping an entire trip working after three extra nights are added in Paris](./docs/media/finite-overview.png)

## One request. Every knock-on effect handled.

Your 18-day trip is planned. The international flights cannot move, and you
want to keep at least A$500 spare. Then you decide to stay three more nights in
Paris.

In an ordinary planner, you now have to revisit every date, stay, journey and
budget line yourself. A general AI can suggest an answer, but it does not own
the live plan and cannot prove the rest of it still works.

Finite checks the whole trip together. It rules out changes that break the
flights or the spending floor, then brings back each distinct way forward that
fits, with its trade-offs made clear. You choose **Protect breathing room**. The trip
becomes 21 days, the flights stay fixed, and A$910 remains spare.

Instead of rebuilding the plan, you keep shaping it with Codex from the same
live picture.

![The workable directions for adding Paris nights while protecting the rest of the trip](./docs/media/04-bounded-decision.png)

## You should be the diner, not the kitchen staff

Most planning software hands you the kitchen. It gives you forms, tables and
controls, then leaves you to research, recalculate and keep everything in sync.

Finite works more like a restaurant. You say what you want, explain what
matters and choose between the trade-offs. Codex is the chef: it interprets,
researches, compares and prepares the change. Finite is the kitchen: it keeps
the dates, costs, commitments and rules working together.

WebMCP is what lets Codex work inside that kitchen directly. It can use the
same live plan you see instead of guessing from pixels, copying the plan into a
separate chat or returning advice that you still have to implement yourself.

## One system, many kinds of plan

Finite is not a travel app. The same planning engine adapts to what you are
trying to accomplish. A trip needs dates, places and transport. A renovation
needs phases, dependencies and handover. An event needs a run of show, capacity
and commitments. Interview preparation and dinner planning need different
information again.

![Finite adapting into travel, renovation, event, interview and dinner plan shapes](./docs/media/02-adaptive-system.png)

These are not renamed copies of one dashboard. Each plan gets the timeline,
measures, records and choices that fit the work.

## Why this needs WebMCP

Without WebMCP, Codex can give advice in a chat or try to click through software
designed for a person with a mouse. You still have to transfer its answer into
the real plan, and it can miss connected details along the way.

With WebMCP, Codex can work on the same live plan you are looking at. Finite
gives it exact actions to read the current plan, record what changed, compare
possible revisions and carry the selected direction into the plan. Finite
handles the exact state and calculations while you and Codex keep shaping what
comes next.

![Finite WebMCP operating seam showing typed entry, bounded actions, revalidation and receipts](./docs/media/03-webmcp-operating-seam.png)

Finite keeps seven stable page tools discoverable for the document lifetime:

| Stable tool | Responsibility |
|---|---|
| `finite_webmcp_status` | Report bootstrap readiness without exposing plan state |
| `finite_enter_kitchen` | Return canonical identity, accepted state and one grounded next action |
| `finite_get_capabilities` | Describe the active contract, vocabulary and authority law |
| `finite_open_toolset` | Open one bounded semantic action manifest |
| `finite_invoke` | Execute one exact action after revalidating revision, evidence and authority |
| `finite_read_result` | Recover exact fields from a content-addressed result when needed |
| `finite_get_effort_receipt` | Report tool effort, failures, boundaries and accepted mutations |

The tool surface covers the planning work. When a direction is ready to become
part of the plan, the person confirms it in the visible product and Codex
continues from that exact decision.

## How one change becomes a working plan

![Finite decision transaction from accepted revision through pressure, bounded search, human authority and durable receipt](./docs/media/diagram-decision-transaction.png)

The public Spotlight makes that flow concrete. An 18-day trip has fixed flights
and must retain at least A$500. Reality adds three Paris nights. Finite checks 26
possible combinations, finds 18 that fit and brings back the meaningfully
different routes. The person and Codex can compare or refine them before one is
carried into the plan. In the demonstrated route, the trip becomes 21 days,
Paris moves from 4 to 7 nights, and A$910 remains free.

![Distinct workable directions produced from one real-world change](./docs/media/04-bounded-decision.png)

![Accepted revision and replay-safe receipt surviving reload](./docs/media/05-durable-receipt.png)

## System architecture

Finite has no backend language model and no application-owned agent. Codex is
the operator. Finite is the deterministic product and persistence layer.

![Finite system architecture showing the human authority boundary, browser document and durable Cloudflare layer](./docs/media/diagram-system-architecture.png)

The browser runtime compiles adaptive surfaces, validates typed actions and
keeps proposed work separate from accepted state. The Worker owns authenticated
durability across D1 and R2. Every accepted mutation is revision-bound,
authority-bound and idempotent.

[Read the complete engineering architecture](./docs/ARCHITECTURE.md)

## What is implemented

- Arrival-first planning from ordinary language or structured manual input
- Adaptive travel, renovation, event and general-plan workspaces
- Exact integer-money conservation, locks, constraints and typed relationships
- Deterministic option search with visible rejected and accepted combinations
- Human-bound approval, immutable revisions and replay-safe receipts
- Planning-to-Managing progression with real-world change handling
- Evidence, attachments, tasks, files, decisions and completion learning
- Multi-plan catalogues, cross-device restore and role-bounded collaboration
- Published read-only views and isolated browser-local demonstrations
- Responsive, keyboard-operable human surfaces

## Repository map

| Path | Purpose |
|---|---|
| [`src/`](./src) | Browser product, adaptive compiler, planning kernel and WebMCP registry |
| [`worker/`](./worker) | Cloudflare Worker, authenticated APIs and D1/R2 coordination |
| [`db/`](./db) and [`drizzle/`](./drizzle) | Durable schema and ordered migrations |
| [`tests/`](./tests) | Kernel, authority, persistence, WebMCP and full-journey regression coverage |
| [`docs/architecture`](./docs/ARCHITECTURE.md) | System boundaries, state transitions and data flow |
| [`docs/acceptance/`](./docs/acceptance) | Dated product and engineering acceptance records |
| [`docs/engineering/`](./docs/engineering) | Deeper design and endurance reports |
| [`submission/`](./submission) | Judge route, project story, evidence map, film script and storyboard |

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

Open the local URL printed by Vite. Native Chrome WebMCP testing currently
requires `chrome://flags/#enable-webmcp-testing`. A supported host will show
that Codex is connected.

Local development uses an isolated D1 database named `finite-local` and an
isolated R2 bucket. The identifiers in `wrangler.local.jsonc` are local-only.
Production uses the Sites-managed `DB` and `FILES` bindings declared in
`.openai/hosting.json`.

## Release proof

The accepted public release is **v245** with marker
`hosted-release-marker-v245`.

- **368/368** automated tests pass
- **20/20** independent hostile Spotlight kernel transactions pass
- TypeScript, production client and Worker builds pass
- Client chunk budget and submission working gate pass
- Public root, WebMCP readiness and canonical kitchen entry are verified

Read the [v245 acceptance record](./docs/acceptance/FINITE_V245_PRODUCT_ACCEPTANCE_2026-09-03.md),
[reproducible release instructions](./REPRODUCIBLE_RELEASE.md) and
[judge testing instructions](./submission/JUDGE_TESTING_INSTRUCTIONS.md).

## Product principles

Finite is built around a small set of non-negotiable rules:

1. Planning stays collaborative from the first request through the accepted revision.
2. Proposed and accepted work remain easy to distinguish.
3. Decisions that require human judgment stay with the person.
4. Every accepted transition produces a durable, inspectable receipt.
5. The plan must remain coherent when reality changes, not only when it is created.

The full product direction lives in
[PRODUCT_NORTH_STAR.md](./PRODUCT_NORTH_STAR.md) and
[ARRIVAL_AND_SURFACE_CONTINUITY.md](./ARRIVAL_AND_SURFACE_CONTINUITY.md).

## Ownership and licence

Finite is a project by [Benji Hart](https://github.com/bharthamk), created for
the WebMCP Challenge.

The source and documentation are available under the [MIT License](./LICENSE).
The Finite name, wordmark and logo identify this project. The licence grants no
trademark rights in that branding.
