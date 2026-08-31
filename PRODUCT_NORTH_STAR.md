# Finite product north star

Status: governing product direction  
Updated: 2026-08-31

## The product

**Finite is an adaptive planning system for plans that must survive change.**

It is the live replanning layer between human intent, external reality, and
agent execution.

Finite is not a travel planner, budgeting dashboard, project-management suite,
or chat wrapper. Money is one constrained resource inside a plan. A finite plan
may also conserve time, capacity, sequence, availability, commitments,
permissions, comfort, contingency, or other bounded quantities.

The product's defining question is:

> Reality changed. What should the plan become now?

The public promise is:

> Plans that survive contact with reality.

## The operating model

**Codex can operate the plan. The human owns and shapes the outcome.**

Most software gives the human a complex application to operate and adds AI to
make those controls easier to use. Finite gives Codex a bounded operating
surface while keeping the visible product fully useful to the person. The human
can always see the current plan, make selections, add or correct requests,
inspect the finite picture, and retain the only consequential approval. Codex
develops and coheres the plan when asked; it is not a gate to seeing or shaping
what the person already accepted.

Arrival has four explicit paths: **Start fresh**, **Use a template**, **Use Codex live**, or **Watch the live demo**. A person can always build the plan manually; Codex is help, not a gate.
There is no separate interpretation-confirmation tollbooth. On the Codex path,
Codex turns the supplied facts and source-labelled working assumptions into a
populated rough plan. On the manual path, Finite opens the same complete
planning workspace immediately without invented Codex content. From either
path the human may add, edit, remove and reorder schedule records; maintain
family-specific places, stays, transport, resources and requirements; adjust
overall, daily and item-level money; manage a to-do list; add a local note or
Codex request to any section; or talk to Codex about the whole plan.

The rough-plan surface opens with a collapsible **Plan at a glance** report,
not a form or a separate overview workspace. Exactly four compact cards show
Dates, Total budget, Budget split, and Available/over. Each card has one
dominant value, quiet sub-metrics, and a pencil control that opens a focused
editor. The report itself contains no input wall or category ledger.

Those focused editors own the plan-wide from/to window, optional start/end
times and time zone, single-day shape, total budget and base currency, plus
editable main-category allocations as both set amounts and percentages of the
total. Finite may warn when the split exceeds 100%, but it must not prevent the
human from deliberately modelling an overcommitted plan. Derived duration,
scope, open-work and requirement signals provide centering without becoming a
second source of truth; edits update the same underlying plan records used
below.

Every rough-plan value has visible certainty. Human facts and settled values
use normal type; generated, guessed, open, or explicitly placeholder values use
italics everywhere they are presented. Each focused edit section includes a
Placeholder toggle so the human can change that status directly. Certainty is
presentation and planning context only: it never changes arithmetic.

The Codex-created rough plan is centering, not a researched recommendation. It
may use clearly labelled first-pass timing, cost and routing assumptions, but
never presents training-data estimates as live fares, availability, legal or
visa advice, or confirmed bookings. Codex remains the route for research,
insight, detailed construction, reconciliation and replanning. Consequential
plan activation and external action remain separately human-authorized. The
difference between the manual and Codex-developed plan is the depth and quality
of populated content—not whether the human has usable controls.

Codex performs the interpretive work:

- understand the human's outcome and changing intent;
- inspect the whole accepted plan;
- research current external reality;
- identify the relevant entities, constraints, and legal moves;
- explore alternatives and explain trade-offs; and
- operate Finite's deterministic tools to prepare the result.

Finite performs the truth and safety work:

- hold canonical plan state and immutable history;
- enforce conservation laws, locks, relationships, and revision boundaries;
- quarantine researched evidence as untrusted data;
- deterministically search, simulate, stage, apply, and receipt changes;
- keep human authority outside WebMCP; and
- compile the accepted result into the right human surface.

WebMCP is the page-scoped operating connection between the two. There is no
application-owned reasoning model behind the product.

Finite also hands Codex a menu rather than a pile of controls. The menu is
compiled from the current plan, arrival, legal move space, evidence state, and
authority boundary. It may contain suggested routes, research routes, or
constraint-validated options, but those classes never blur: a suggestion is
not called viable, a validated option is not called approved, and a human menu
choice is not treated as consequential authority. Codex recommends and serves;
the human chooses the dish; Finite proves what can safely be cooked.

### Interaction surfaces

Finite has two primary surfaces and one hybrid: the standalone Site, the Codex
conversation, and the Site inside Codex's inline browser. A human may begin on
either primary surface and may switch between them after a meaningful delay.
They are different views of one versioned plan, never separate sources of
truth.

Useful intent is accepted where it arrives. Human input may wait durably for
Codex; Codex work may wait durably for the human. Only genuinely
surface-exclusive actions require a handoff—most importantly, consequential
authority remains a human action on the Site. The governing continuity and
arrival contract is in `ARRIVAL_AND_SURFACE_CONTINUITY.md`.

## What a plan contains

A plan is an executable, evolving model of an outcome rather than a task list
or spreadsheet. Its grammar can contain:

- entities: flights, rooms, suppliers, phases, guests, venues, materials;
- resources: money, days, people, capacity, stock, contingency;
- time: dates, durations, dependencies, sequences, connection windows;
- commitments: paid, booked, contracted, reserved, or otherwise difficult to
  move;
- constraints: hard locks, minimum buffers, equality and ordering laws;
- preferences: comfort, experience, quality, convenience, risk appetite;
- evidence: current prices, availability, quotes, documents, and observations;
- candidate moves: legal, blocked, and combined reallocations;
- authority: the exact human-approved command; and
- lineage: revisions, evidence, operations, and deterministic receipts.

The domain determines which of these matter and how the human sees them.

## The adaptive surface

One planning grammar compiles into materially different consumption surfaces:

- Travel becomes an itinerary with segments, bookings, nights, connections,
  flexibility, comfort, cost, and remaining breathing room.
- Renovation becomes a phased programme with materials, contractors,
  dependencies, completion risk, contingency, and handover.
- Event becomes a run-of-show with guests, capacity, suppliers, staffing,
  timing, experience, and contingency.

This is not one dashboard with changed labels. Structure, measures, language,
time model, actions, and decision presentation adapt to the outcome.

## The core transaction

1. The human states the desired outcome or reports that reality changed.
2. The human chooses whether Codex should build the first rough plan or whether
   to open the complete manual workspace immediately.
3. On the Codex path, Codex opens the verified plan surface, asks only for genuinely
   missing human judgments, and returns a populated editable rough plan without
   a separate brief-confirmation step.
4. Codex may research current external reality; Finite admits it only as
   provenance-bound untrusted evidence.
5. Finite enumerates or simulates legal moves against exact accepted truth.
6. Codex presents a small set of intelligible, outcome-shaped options.
7. The human chooses and approves one exact result.
8. Finite atomically applies it, recompiles the human surface, and emits a
   replayable receipt.
9. When reality changes again, the loop begins from the new accepted truth.

## Signature story

The human says: “Add three nights in Paris. Keep the international flights
fixed and preserve at least A$500 of breathing room.”

Codex inspects the trip, researches relevant availability, understands the
locked flights and connected segments, and asks Finite to model viable changes
across dates, accommodation, transport, comfort, and remaining resources. The
human receives a revised itinerary and a few clear choices—not a budget table
or a chat transcript.

Today Finite can model, research, replan, stage, approve, apply, persist, and
receipt this kind of change. It does not yet purchase or alter an external
booking. External execution requires a later connector plus explicit human
authority.

## Product moat

The moat is the complete agent-operable system, not any single calculation:

1. a page-scoped operating surface that exposes exact, composable capabilities to
   Codex;
2. a deterministic control plane that lets a frontier model be clever without
   trusting it with arithmetic, state, or authority;
3. a surface compiler that turns the same accepted grammar into a genuinely
   domain-specific human outcome;
4. a structural separation between operator work and human approval;
5. evidence, lineage, replay, and receipts strong enough for live plans; and
6. an open, self-hostable architecture with provider-owned identity and no
   central Finite agent or account service.

## Current proof

The working product currently includes:

- travel, renovation, and event plan families;
- seven stable native WebMCP tools with bounded route-specific semantic manifests, including one canonical Codex-entry bootstrap;
- native Codex discovery and operation from the live Site;
- bounded deterministic option search and simulation;
- typed evidence, entities, constraints, preferences, actuals, and locks;
- human-only approval, failure-atomic commits, immutable revisions, and
  content-addressed receipts;
- authenticated D1 tenancy and cross-device operator continuity;
- durable asynchronous continuity between Site-first and Codex-first journeys;
- official ChatGPT sign-in, an isolated expiring demo path, and browser-local Demo mode that prevents remote writes;
- live/frozen sharing plus authenticated view, suggest and edit-draft invitations;
- a Codex-operated, pausable guided walkthrough of the real visible product; and
- three materially different adaptive human surfaces.

## Product boundaries

Do not describe or design Finite as:

- a generic budgeting product;
- a travel booking service;
- another project/task manager;
- an autonomous agent acting without human authority;
- a chat interface placed beside conventional software;
- an application with its own hidden AI backend; or
- a system that currently purchases, books, emails, or edits third-party
  systems without a connector.
- a system that assumes the Site and Codex are simultaneously open or that
  “Codex connected” means the latest human input has been processed.

## Public narrative order

1. **Outcome:** plans that survive contact with reality.
2. **Concrete proof:** the Paris change across the whole trip.
3. **Breadth:** travel, renovation, and event become different surfaces.
4. **Operating inversion:** the agent operates; the human consumes and judges.
5. **Why WebMCP:** Codex works through the same live page and accepted state.
6. **Trust:** deterministic rules, human approval, evidence, and receipts.
7. **Invitation:** continue with ChatGPT or enter an isolated demo.

Internal tool names may retain the original kitchen metaphor for protocol
compatibility. Consumer copy should call the product Finite and explain the
concrete plan capability directly.
