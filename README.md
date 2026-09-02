<h1 align="center">
  <img src="./public/finite-wordmark.png#gh-light-mode-only" width="260" alt="Finite">
  <img src="./docs/media/finite-wordmark-dark.png#gh-dark-mode-only" width="260" alt="Finite">
</h1>

<p align="center"><strong>Change your plans without rebuilding them.</strong></p>

<p align="center">
  Finite is a planning partner for trips, renovations, events, work and anything else with connected parts. Tell Codex what changed. Finite works through the affected dates, costs, commitments and dependencies, then brings back the distinct ways forward that still fit.
</p>

<p align="center">
  <a href="https://finite.bharthamk.chatgpt.site/?start=spotlight-active&tour=spotlight&plan=1&fresh=1"><strong>Try the live demo</strong></a>
  &nbsp;·&nbsp;
  <a href="https://finite.bharthamk.chatgpt.site/"><strong>Open Finite</strong></a>
</p>

<p align="center">
  <sub>Judging Finite? <a href="./submission/JUDGE_TESTING_INSTRUCTIONS.md">Read the testing guide</a>.</sub>
</p>

<p align="center">
  <a href="https://github.com/bharthamk/finite/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/bharthamk/finite/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="Release v245" src="https://img.shields.io/badge/live_release-v245-d9f45f?labelColor=123d34">
  <img alt="368 tests passing" src="https://img.shields.io/badge/tests-368%20passing-d9f45f?labelColor=123d34">
  <a href="./LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-f3eee5?labelColor=123d34"></a>
</p>

![A concrete example of Finite keeping an entire trip working after three extra nights are added in Paris](./docs/media/finite-overview.png)

## See one change worked through across the whole plan

Your 18-day trip is planned. The international flights cannot move, and you
want to keep at least A$500 spare. Then you decide to stay three more nights in
Paris.

In an ordinary planner, you now have to revisit every date, stay, journey and
budget line yourself. A chat assistant can suggest an answer, but you still
have to transfer it into the plan and check what else broke.

Finite checks the whole trip together. It rules out changes that break the
flights or the spending floor, then brings back each distinct way forward that
fits, with its trade-offs made clear. You choose **Protect breathing room**. The trip
becomes 21 days, the flights stay fixed, and A$910 remains spare.

Instead of rebuilding the plan, you keep shaping it with Codex from the same
live picture.

## You should be the diner, not the kitchen staff

Most planning software makes you run the kitchen. It gives you forms, tables
and controls, then leaves you to research, recalculate and keep every connected
part in sync.

Finite lets you stay focused on the outcome. You tell Codex what you want, what
matters and what has changed. Codex works through the plan with you: asking
questions, researching, comparing possibilities and adapting as you refine the
brief. Finite is the kitchen behind that collaboration, keeping the dates,
costs, dependencies, commitments and constraints working together.

WebMCP is the direct connection between Codex and that kitchen. It lets Codex
work with the same live plan you see, use Finite to evaluate real changes and
continue from the exact result. The conversation and the planning software
become one workflow.

![The Finite restaurant model showing the person and Codex planning together while WebMCP connects Codex to the live plan](./docs/media/diagram-restaurant-model.png)

## One system, shaped around the work

Finite changes shape around the work. A trip becomes a route, calendar,
bookings and budget. A renovation becomes phases,
dependencies, costs and handover. An event becomes a run of show, capacity and
commitments. An interview becomes evidence, questions and rehearsal. A dinner
becomes guests, dietary needs, courses and timing.

![Finite adapting into travel, renovation, event, interview and dinner plan shapes](./docs/media/02-adaptive-system.png)

Underneath, Finite uses one planning model for connected facts, constraints,
choices and revisions. On screen, each plan gets the structure and language
the work actually needs.

## Why this needs WebMCP

Without WebMCP, Codex sits outside the plan. It can suggest what to do, but you
still have to copy the answer into the planner, recheck every dependency and
keep the conversation aligned with whatever changed next.

With WebMCP, the planning conversation reaches the product itself. Codex can
read the current plan, tell Finite what changed, ask it to test the connected
consequences, compare every distinct workable direction and continue from the
chosen revision. Finite handles the calculations and connected state while you
and Codex keep working through what comes next.

![A real Finite WebMCP exchange turning one request into direct plan actions and a live, reusable result](./docs/media/03-webmcp-operating-seam.png)

The result is not just an answer at the end of a chat. It becomes the next
working state for the conversation and the product. When a direction is ready,
the person confirms it in Finite and both Codex and Finite continue from that
revision.

<details>
<summary><strong>How the WebMCP surface is built</strong></summary>

Finite keeps seven stable page tools available while the actions inside them
adapt to the current plan:

| Stable tool | What it gives Codex |
|---|---|
| `finite_webmcp_status` | Check whether the WebMCP connection is ready |
| `finite_enter_kitchen` | Read the active plan and receive the next useful planning step |
| `finite_get_capabilities` | Learn the plan's language and available work |
| `finite_open_toolset` | Open the relevant set of typed planning actions |
| `finite_invoke` | Run one selected action against the current revision |
| `finite_read_result` | Retrieve larger exact results only when they are needed |
| `finite_get_effort_receipt` | Report the work performed, failures and accepted changes |

The wrappers remain predictable for Codex while their planning actions change
with the compiled plan. A trip, renovation and event therefore expose different
working vocabulary through the same durable connection.

</details>

## How Finite works through a real change

![The Paris example moving from the current plan through a whole-plan check to a workable updated plan](./docs/media/diagram-change-to-plan.png)

The public Spotlight starts with an 18-day trip. The international flights are
fixed and at least A$500 must remain spare. You ask to add three Paris nights
without losing either condition.

Finite checks more than the Paris row. It tests 26 connected combinations
across dates, stays, transport and budget. Eighteen still fit, eight break the
plan, and five meaningfully different directions remain. You and Codex can
compare, question and refine them before carrying **Protect breathing room**
into the plan. The result is a 21-day trip with the flights fixed and A$910
spare.

![Distinct workable directions produced from one real-world change](./docs/media/04-bounded-decision.png)

The five directions exist because five genuinely different routes work for
this change. If only one direction works, Finite returns one.

<details>
<summary><strong>Engineering proof: the updated plan survives reload</strong></summary>

![The accepted updated plan and its receipt surviving reload](./docs/media/05-durable-receipt.png)

</details>

## One live plan, two ways to work with it

Finite keeps one live plan shared by the visible product and Codex. You work
with it through the interface. Codex works with it through WebMCP. Both reach
the same planning engine, so dates, costs, constraints, choices and revisions
stay aligned.

![Finite architecture showing the visible product and WebMCP sharing one planning engine and durable plan](./docs/media/diagram-shared-plan-architecture.png)

Inside the browser, Finite shapes the workspace around the work, runs the
calculations and checks each change against the connected plan. A Cloudflare
Worker stores plan history in D1 and files and evidence in R2, so the same plan
survives reloads and can continue across devices.

[Read the complete engineering architecture](./docs/ARCHITECTURE.md)

## What you can do today

The public release covers the full life of a plan, from the first outcome to
day-to-day work, real-world change and wrap-up.

| When you need to... | Finite lets you... |
|---|---|
| **Turn an outcome into a working plan** | Describe what you want in ordinary language or enter it yourself. Finite builds the workspace around the work, whether it is a trip, renovation, event or something custom. |
| **Plan with Codex inside the product** | Let Codex read the current plan through WebMCP, work with its exact dates, costs and constraints, add researched evidence and continue from the live result. |
| **Respond when reality changes** | Bring in a new cost, delay or change of intent. Finite checks the connected plan and returns however many meaningfully different workable directions exist, with rejected routes and trade-offs visible. |
| **Carry the plan into execution** | Keep tasks, checklists, files, references, decisions and actual costs beside the plan instead of rebuilding the work in another tool. |
| **Continue and collaborate** | Return to the same plan across devices, manage multiple plans, invite others to view, suggest or edit, and publish a selected read-only view. |
| **Keep useful history** | Move through revisions with clear receipts, wrap up completed work and carry forward only the lessons you choose to retain. |

Every surface is responsive and keyboard-operable, including the browser-local
demo used in the public judge route.

## Where the engineering lives

For technical judges and contributors, the main implementation and proof
surfaces are:

| Path | Purpose |
|---|---|
| [`src/`](./src) | Visible product, adaptive workspaces, shared planning engine and WebMCP actions |
| [`worker/`](./worker) | Cloudflare APIs for plan history, collaboration, publishing and D1/R2 persistence |
| [`db/`](./db) and [`drizzle/`](./drizzle) | Durable data model and ordered migrations |
| [`tests/`](./tests) | 368 tests covering calculations, plan changes, persistence, collaboration, WebMCP and complete journeys |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | End-to-end design, state transitions and data flow |
| [`docs/acceptance/`](./docs/acceptance) | Dated product and engineering acceptance records |
| [`docs/engineering/`](./docs/engineering) | Deeper technical and endurance reports |
| [`submission/`](./submission) | Judge route, project story, evidence map, screenshots, film script and storyboard |

## Run locally

Requirements: Node.js 22.13 or newer.

Start the product:

```bash
npm ci
npm run db:local:migrate
npm run dev
```

Open the local URL printed by Vite. Choose **Watch the live demo**, then
**See Finite adapt**, for the shortest credential-free route. Its plan stays in
that browser.

To verify the complete release from the same checkout:

```bash
npm run typecheck
npm test
npm run build
npm run check:submission
```

For native WebMCP testing in Chrome, enable
`chrome://flags/#enable-webmcp-testing` before opening Finite. A supported host
shows that Codex is connected.

<details>
<summary><strong>How local storage is isolated</strong></summary>

Local development uses an isolated D1 database named `finite-local` and an
isolated R2 bucket. The identifiers in `wrangler.local.jsonc` are local-only.
Production uses the Sites-managed `DB` and `FILES` bindings declared in
`.openai/hosting.json`.

</details>

## Reproduced release evidence

The deployed product is **v245**. Live responses identify it with
`hosted-release-marker-v245`; its public application source snapshot is commit
[`4424fda`](https://github.com/bharthamk/finite/commit/4424fda9a1f1b0426f78f0b7b602d272a071c98c).
Later commits on `main` improve the public documentation without changing that
deployed application build.

| Evidence | Result |
|---|---|
| **Clean checkout** | All 22 local migrations, TypeScript checks, the production client build and the Worker build pass. |
| **Automated coverage** | **368/368 tests** pass across planning, change handling, persistence, collaboration, WebMCP and complete user journeys. |
| **Repeated change stress** | **20/20** separate Spotlight transaction runs preserve the plan, survive reload and return the same result when safely retried. |
| **Live WebMCP route** | The public Spotlight advertised all seven stable tools, opened the current plan and tested the Paris change across 26 connected combinations. |
| **Production experience** | The public root returns the v245 marker; the browser-local demo survives reload; the 390-pixel layout has no horizontal overflow or console errors. |

Read the [v245 acceptance record](./docs/acceptance/FINITE_V245_PRODUCT_ACCEPTANCE_2026-09-03.md)
for the exact result, the [reproducible release contract](./REPRODUCIBLE_RELEASE.md)
for build and deployment provenance, or the
[judge testing instructions](./submission/JUDGE_TESTING_INSTRUCTIONS.md) for a
short independent product check.

## How Finite is meant to work

1. **Start with the outcome.** The workspace should take the shape of the work,
   instead of forcing every plan into the same template.
2. **Keep one live picture.** You, Codex and the product should work from the
   same dates, costs, constraints, evidence and decisions.
3. **Treat change as part of planning.** When one thing moves, Finite should
   check the connected plan rather than patching one isolated row.
4. **Make trade-offs understandable.** Finite handles the calculations and
   shows the workable directions. You decide what makes sense.
5. **Continue from the result.** A chosen direction should become the next
   working plan, with a clear history of how it got there.
6. **Learn deliberately.** Completed plans should improve future work only
   through lessons you choose to keep.

The deeper product model is documented in
[PRODUCT_NORTH_STAR.md](./PRODUCT_NORTH_STAR.md) and
[ARRIVAL_AND_SURFACE_CONTINUITY.md](./ARRIVAL_AND_SURFACE_CONTINUITY.md).

## Project and licence

Finite was designed and built by [Benji Hart](https://github.com/bharthamk) for
the WebMCP Challenge.

The source and documentation are available under the [MIT License](./LICENSE).
The Finite name, wordmark and logo remain project marks and are not licensed as
trademarks.

[Run Finite](https://finite.bharthamk.chatgpt.site/) or follow the
[short judge route](./submission/JUDGE_TESTING_INSTRUCTIONS.md) to see the live
plan and WebMCP working together.
