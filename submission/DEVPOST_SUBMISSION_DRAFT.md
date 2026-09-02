# Finite: Devpost submission draft

Status: content-complete draft for accepted public release v245. The final video,
five images and thumbnail are packaged locally. Only the public YouTube URL and
entrant/team details remain owner-supplied.

## Devpost paste map

This file is the copy source. Benji enters and saves the draft; Codex reviews
the saved draft read-only. Do not select the final submission control during
draft assembly.

- **Project name:** paste `Project name` below.
- **Tagline:** paste `Tagline` below.
- **Project story / description:** paste the complete contents of
  `DEVPOST_PROJECT_STORY_FINAL.md`.
- **Try it out / live app:** `https://finite.bharthamk.chatgpt.site/`
- **Source code:** `https://github.com/bharthamk/finite`
- **Video:** leave blank until the improved final public YouTube film has been
  accepted and public-playback QC has passed.
- **Built with:** add the tags under `Built with` below in that order. Do not
  pad the field to 25.
- **Testing instructions:** paste the recommended route from
  `JUDGE_TESTING_INSTRUCTIONS.md`; lead with the no-credential Spotlight URL.
- **Gallery:** upload the five images below in numeric order:
  1. `media/images/01_product_thesis.png`
  2. `media/images/02_one_adaptable_system.png`
  3. `media/images/03_webmcp_operating_seam.png`
  4. `media/images/04_bounded_decision_transaction.png`
  5. `media/images/05_accepted_receipt.png`
- **Thumbnail:** upload
  `media/images/finite_devpost_thumbnail_3x2.png` (purpose-built 3:2 asset).
- **Entrant/team fields:** use Benji's own account details; do not infer or add
  team members or contributor credits.

## Project name

Finite

## Tagline

The agent-native workspace for plans that must survive change.

## Short description

Finite is the agent-native working layer behind plans that must survive change.
People state outcomes in ordinary language, then keep shaping the same live plan
with Codex through WebMCP. Finite keeps the connected dates, money, commitments,
evidence and revisions coherent across travel, renovations, events, interviews
and more.

## Inspiration

Most software gives the person the kitchen: forms, dashboards, settings and
workflows. Then the person still has to cook. Adding an AI assistant often means
the same work with advice about which controls to use.

Finite inverts that relationship. The person is the diner: they describe the
outcome, preferences and hard boundaries, then judge what is served. Codex is
the chef. Finite is the kitchen and service system that Codex operates.

We chose planning because it exposes the failure of the old model. Planning
tools can record an initial intention, but when one assumption changes people
usually rebuild the plan in chat, patch a spreadsheet or update disconnected
tasks by hand. A chat agent can reason about the change, but without a canonical
operating surface it cannot reliably keep the whole outcome together.

Finite asks a sharper question: **Reality changed. What should the plan become
now?**

It is for the person who remains accountable after the original plan stops
being correct: a traveller with fixed bookings, a household coordinating
trades, an event producer balancing capacity and suppliers, or anyone carrying
an outcome across changing dates, money, evidence and commitments.

## What it does

Finite carries an outcome through the complete planning lifecycle: rough intent,
an editable plan, day-to-day management, real-world disruption, consequential
decisions, accepted revisions, completion and reusable learning.

The human surface adapts to the work. Travel becomes a calendar and route.
Renovation becomes phases, dependencies and contingency. An event becomes a
run-of-show, capacity and suppliers. Interview preparation, recurring practice
and a dinner for eight use different records and measures, not a travel dashboard
with renamed labels.

When reality changes, Codex uses page-defined WebMCP tools to:

- enter the current plan without asking the person to restate it;
- record the new pressure without changing accepted truth;
- inspect constraints, locks, evidence, and movable parts;
- evaluate the bounded option space against current constraints;
- present distinct routes with explicit protections and trade-offs; and
- apply only the exact route the person chose and confirmed.

The accepted revision leaves a before/after receipt, persists across reload,
and never claims that research, quoting, holding, booking, payment, or
verification are the same action.

## Why WebMCP

WebMCP is what lets the chef work inside the kitchen. The live page explains the
plan to the person and, at the same time, exposes its accepted facts, evidence,
available actions and next safe step to Codex as typed, page-scoped tools.

That shared surface is essential. Browser automation would make Codex guess at
pixels and controls. A conventional API or hidden agent backend would create a
parallel state the person cannot see. Through WebMCP, the plan on screen is the
plan Codex operates, tied to the current revision and the visible human
authority boundary.

The result is not “an agent clicks the app.” Codex handles interpretation,
research, and orchestration; Finite deterministically owns arithmetic,
constraints, concurrency, persistence, evidence admission, authority, and
receipts; the person owns consequential choice.

## Better human-agent experience

Without WebMCP, the person must operate the planning machinery or repeatedly
translate the plan into chat. The agent can recommend, but the person must
manually reconcile every affected date, cost, commitment and task.

With Finite, the person states what needs to happen. Codex enters canonical
state in one call, requests only the semantic detail needed, explores the change
across the whole plan and stops at the exact decision only the person can make.
The human sees what each option protects, what it trades and precisely what will
change. Codex does the work; the person keeps judgment and authority.

## How it was built

Finite uses TypeScript, Vite, Cloudflare Workers, D1, R2, and ChatGPT Sites. The
document registers seven stable imperative WebMCP tools. A bounded toolset
selector returns route-specific typed action manifests, and a single semantic
invoker revalidates the active group, revision, evidence, and authority before
dispatch. Large deterministic results live in an ephemeral content-addressed
vault and can be recovered by exact JSON Pointer rather than flooding model
context.

The deterministic kernel uses integer money, immutable profile hashes,
constraint-valid move enumeration, revision-bound candidates, five-minute exact authority
challenges, optimistic concurrency, atomic receipts, and idempotent replay.
Human confirmation creators are never registered with WebMCP.

## Challenges we ran into

The hard problem was not generating options. It was making Codex a genuine
operator without turning the product into an autonomous black box. That required
keeping five states
separate under retries, reloads, and shared human-agent control: observed
reality, proposed change, human choice, exact authority, and accepted truth.
Early versions also exposed too many route-specific tools and returned too much
state. We replaced that with seven stable document tools, bounded semantic
manifests, content-addressed detail recovery, and exact revision-bound
challenges. A late end-to-end run caught an especially important ambiguity:
`value: 3` could be mistaken for “add three days.” The final contract names
relative `delta` and absolute `value` explicitly and refuses contradictory
duration changes.

## What we learned

The most useful agent interface is not the largest tool catalogue. Finite began
with dozens of route tools and oversized state responses. It now keeps a stable
seven-tool document contract, advertises one bounded semantic manifest at a
time, and measures discovery width, calls to first useful action, semantic
recovery, human boundaries, failures, and accepted mutations.

We also learned that trustworthy agency needs visible incompleteness. Recording
a change is not accepting it. Research is not verification. A proposed route is
not human authority. A committed receipt is not a booking. Keeping those states
separate made Finite both safer and more comprehensible.

## Accomplishments

- A complete public revision 1→2 WebMCP transaction with visible human choice.
- 26 possible combinations distilled into five distinct workable directions for
  this plan, with the count allowed to change when another plan has fewer or more.
- Seven stable document tools instead of an ever-growing browser registry.
- Complete before/after, authority, search, and replay proof in one receipt.
- A complete product lifecycle and distinct travel, renovation, event,
  interview-preparation, recurring-practice and general-plan surfaces on one
  adaptive grammar.
- 368 passing tests, including 20 repeated hostile Spotlight kernel transaction runs.
- Reload-safe accepted truth, isolated public Demo mode, responsive layout, and
  keyboard/screen-reader hardening.
- A production route completed in three calls to first useful action with zero
  failed calls and exactly one accepted mutation.

## What's next

Observe new users bringing their own outcomes and running the Spotlight without
coaching, then improve demonstrated comprehension failures. Longer term, extend
the adaptive grammar and evidence connectors so Codex can operate more kinds of
real plans without weakening the same human-authority and accepted-truth
contract.

## Links

- Live app: https://finite.bharthamk.chatgpt.site/
- Judge Spotlight: https://finite.bharthamk.chatgpt.site/?start=spotlight-active&tour=spotlight&plan=1&fresh=1
- Public source repository: https://github.com/bharthamk/finite
- Public YouTube demo: `[OWNER: paste public YouTube URL]`

## Built with

1. WebMCP
2. OpenAI Codex
3. ChatGPT
4. ChatGPT Sites
5. TypeScript
6. Vite
7. Cloudflare Workers
8. Cloudflare D1
9. Cloudflare R2
10. Drizzle ORM
11. HTML5
12. CSS3
