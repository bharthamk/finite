# Arrival and interaction-surface continuity

Status: governing product and engineering contract
Updated: 2026-08-27

## Product law

Finite has two primary interaction surfaces and one common hybrid:

1. **The Site** — the human's durable consumption, input, correction, evidence,
   and authority surface.
2. **Codex** — the operator's conversational, interpretive, research, and tool
   surface.
3. **The Site inside Codex's inline browser** — the shared hybrid where Codex
   can operate the page-native kitchen while the human sees the compiled result.

These are different views of one plan. They are not separate products and must
never create separate truth.

The user will often begin on a non-ideal surface. Finite must accept useful work
where it arrives, preserve it without pretending it has been processed, and
move the user to another surface only when that surface has a real exclusive
capability.

## Presence is optional

The Site and Codex must not depend on being open at the same time.

A human may spend twenty minutes entering dates, commitments, bookings, costs,
preferences, notes, links, and constraints on the Site, close it, and open Codex
later. Codex must be able to orient once and receive the entire current intake,
including what changed since any prior operator checkpoint.

Conversely, a human may begin in Codex without opening Finite. Codex should open
the Site in its inline browser, establish the authenticated Finite context, and
continue through the same order and plan state. If authentication or human
authority is required, Codex prepares the work and hands the exact next action
to the Site.

Processing delay is normal. The product must distinguish:

- human input saved;
- waiting for Codex;
- Codex reviewing;
- clarification required;
- proposed plan ready;
- awaiting exact human authority; and
- accepted and receipted.

“Codex connected” describes capability availability. It does not claim that
Codex has read, interpreted, or processed the latest input.

## The first-plan arrival

With no accepted plans, the Site is an order counter rather than an empty
dashboard or setup wizard.

The only required initial field is:

> What are you trying to make happen?

The human may optionally add as much structured or unstructured context as they
already possess:

- current reality and work already underway;
- dates, durations, routes, phases, and dependencies;
- bookings, payments, reservations, quotes, or promises;
- hard boundaries and unacceptable outcomes;
- preferences and trade-off taste;
- files, links, schedules, notes, and other evidence; and
- locale, timezone, and currency corrections.

The human is never required to choose a Finite family, name a plan, define a
schema, build categories, or complete every field before saving.

Site input is durable human-originated material. It is not accepted plan truth
and it is not evidence that Codex has interpreted it.

## Durable arrival packet

Every new-plan intake converges on one server-backed, non-authoritative order
packet whether the human began on the Site or in Codex.

The packet contains:

- opaque order and tenant identity;
- monotonically increasing order version;
- raw human outcome and append-only human input events;
- structured fields the human explicitly entered;
- attachment and evidence references with provenance;
- declared locks, commitments, preferences, and assumptions;
- locale, timezone, and currency defaults;
- staged Codex interpretations kept separate from raw human input;
- clarification questions and human answers;
- last operator checkpoint and the versions it covered;
- current lifecycle status and exact next actor; and
- checksum, timestamps, expiry/retention policy, and source surface.

Raw human input is never rewritten by Codex. Interpretation is a separate,
version-bound projection that the human can correct.

## Operator orientation

When Codex arrives, one read must return an orientation packet containing:

- the complete current order snapshot;
- every human change since the last operator checkpoint;
- unprocessed input count and source surfaces;
- evidence and attachment inventory;
- inferred plan family, if any, with confidence and alternatives;
- machine-addressable missing facts and contradictions;
- any saved non-authoritative operator work;
- current accepted-plan identity when this is a change to an existing plan;
- the exact order version and checksum Codex must use; and
- the next safe route.

Codex may take time to interpret, research, and prepare a plan. Its work is
non-authoritative and resumable. Before it stages a clarification, draft, or
change, Finite verifies that the order version is still current. If the human
edited the order while Codex worked, the stale result fails closed with an
order-version conflict and Codex re-orients from the latest packet.

## Construction freshness law

A compiled kitchen derived from an arrival order is valid only for the exact
order id, version, and checksum that produced its typed intake. Its accepted
source-plan revision guard is necessary but not sufficient: the accepted plan
may remain unchanged while human intent advances.

When newer human input exists:

- arrival reconciliation outranks any construction-review route;
- the prior construction packet is reported as `stale_arrival`;
- the prior draft is removed from pending authority and cannot be confirmed;
- activation tools are not advertised for that draft;
- any direct activation attempt fails closed; and
- the Site explains that the previous kitchen is stale while preserving its
  proof for audit.

Only after Codex reconciles the current order, the human reviews the replacement
interpretation, and Codex compiles a newly bound packet may the Site offer exact
draft confirmation again. An unbound legacy packet is never assumed to match an
active arrival.

## Wrong-surface recovery law

When a user attempts an action on a surface that cannot complete it, Finite
must never discard the intent, demand repeated entry, silently reduce the
authority requirement, or leave the user at a dead end.

It must:

1. capture and durably version whatever that surface is allowed to accept;
2. state what was saved and what has not yet happened;
3. preserve the exact pending work and continuation point;
4. explain why another surface is required;
5. offer the smallest exact handoff; and
6. resume from the same state when the other surface appears.

Examples:

- The human enters a full trip on the standalone Site while Codex is absent.
  The Site says **Saved · waiting for Codex**, not **Processing**.
- The human tells Codex to change a plan while the Site is closed. Codex opens
  Finite inline, records and stages the work, then asks the human to use the
  exact Site approval surface.
- The human edits a constraint while Codex researches. The draft based on the
  previous version is refused; Codex receives the new input rather than
  overwriting it.
- The human answers a clarification on the Site while Codex is idle. The answer
  remains queued until the next operator orientation.

## Capability ownership

Useful intent may originate on either primary surface, but the surfaces are not
artificially identical.

| Capability | Site | Codex | Inline hybrid |
| --- | --- | --- | --- |
| Enter or revise human intent | Yes | Yes, as human-provided input | Yes |
| Add files, links, and structured facts | Yes | Yes, subject to tool/connector access | Yes |
| Inspect accepted plan and pending work | Yes, human projection | Yes, operator packet | Both |
| Interpret language and research | No application model | Yes | Yes |
| Simulate and stage deterministic options | Shows results | Operates tools | Both |
| Create consequential human authority | **Yes, exclusively** | Never | Human action on Site only |
| Apply an exactly authorized command | Shows receipt | Yes, through guarded tool | Both |

The Site must remain useful when Codex is absent. Codex must remain able to
begin when the Site was not previously open. The inline browser is the meeting
place, not a requirement for simultaneous presence.

## Required lifecycle primitives

The arrival implementation should earn these page-native primitives:

- `finite_open_arrival` — read the complete versioned order, delta since the
  operator checkpoint, lifecycle, and next safe route;
- `finite_checkpoint_arrival` — record which exact order version Codex has
  processed without changing human input or accepted truth;
- `finite_stage_clarification` — place one bounded, version-bound question on
  the Site;
- `finite_stage_plan_interpretation` — preserve what Codex understood separately
  from what the human entered; and
- the existing typed intake, draft, confirmation, activation, and receipt
  operations, extended with exact order-version guards.

Names remain subject to implementation review. The behaviours and boundaries
are locked.

## Acceptance journeys

### Site first, Codex later

1. A signed-in human with no plans enters a detailed order and attachments on
   the Site while Codex is absent.
2. The Site durably shows the saved version and **waiting for Codex**.
3. Later, Codex opens Finite and reads the complete order plus all changes in
   one orientation call.
4. Codex stages one genuinely missing question.
5. The human answers on the Site and leaves.
6. Codex later resumes from the new version without repeated input.
7. Codex compiles a draft; the Site shows what was entered, what was
   interpreted, and the exact proposed plan.
8. Only a fresh human Site action creates confirmation; Codex activates the
   exact confirmed draft and both surfaces converge on the receipt.

### Codex first, Site later

1. A signed-in human tells Codex what they want without opening Finite.
2. Codex opens Finite inline and records the human-originated order.
3. Codex researches and prepares a version-bound interpretation and draft.
4. The Site can be closed and reopened without losing pending work.
5. Codex hands the exact confirmation step to the Site.
6. The human confirms there; Codex applies and verifies the accepted result.

### Concurrent change during delay

1. Codex checkpoints order version 4 and begins research.
2. The human adds a new hard constraint on the Site, creating version 5.
3. Codex attempts to stage work against version 4.
4. Finite refuses it without changing accepted or pending truth.
5. Codex re-opens arrival, receives the version-5 delta, and continues without
   asking the human to repeat prior information.
