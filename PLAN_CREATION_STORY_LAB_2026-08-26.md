# Plan Creation Story Lab — 2026-08-26

## Question

Can a human order a genuinely new finite plan while Codex operates the kitchen,
without turning Finite into a form builder, a three-template gallery, or an app
with its own hidden model?

This pass exercised 12 human-consumer stories and 12 Codex-operator stories over
the bounded plan-intake contract. Presentation quality was deliberately excluded.

## Human-consumer stories

| ID | Ordered outcome | Result | What happened |
|:--|:--|:--|:--|
| HC01 | “Set up our 180-person customer summit” with complete totals and constraints | Pass | Codex can start from the event blueprint, replace the facts and stage a different run-of-show surface. |
| HC02 | Give totals that do not add up | Pass | Compilation refuses the draft before it becomes visible or active. |
| HC03 | Include already-paid costs | Pass | The blueprint makes the actual-ledger/evidence law explicit; evidence must be registered before staging. |
| HC04 | Supply a statement where no receipt exists | Pass | `user_statement` evidence can be admitted as bounded evidence without becoming authority. |
| HC05 | Say “that is not the plan I meant” | Pass | The human surface can now return the inert draft; active truth is unchanged and Codex can restage. |
| HC06 | Confirm the exact plan Codex prepared | Pass | Confirmation binds the compiled profile and evidence hashes but does not itself activate anything. |
| HC07 | Order a wedding rather than a product launch | Partial | The event family can express headcount, capacity and run-of-show, but contextual tool names remain `event_*`; the semantic family is visible. |
| HC08 | Order a house move with phases and a fixed spend | Partial | Renovation can technically express phases, dates and contingency, but its fixed contextual operations are a semantic stretch. |
| HC09 | Order a monthly household cashflow plan | Fail | No recurring-period family or time model exists; mapping it to travel, renovation or event would be dishonest. |
| HC10 | Reload while reviewing an unconfirmed plan | Fail | Draft and human authority are deliberately volatile; the work packet is lost across reload. |
| HC11 | Change the structure of an already activated plan | Partial | Codex can create a new `planId`, but there is no explicit supersedes/version lineage or amendment receipt. |
| HC12 | Keep and switch among multiple confirmed plans | Pass | Catalog persistence, actual plan ids, evidence bundles and contextual-tool replacement survive reload. |

Human result: **7 pass, 3 partial, 2 fail**.

## Codex-operator stories

| ID | Operator job | Result | What happened |
|:--|:--|:--|:--|
| TC01 | Discover how to construct a plan without repository knowledge | Pass | `finite_get_plan_blueprint` returns a compiler-valid clean definition, fixed fields, semantic requirements, caps, evidence order and authority law. |
| TC02 | Avoid inheriting seeded paid costs | Pass | Blueprints now contain zero spent actuals and no fixture evidence bindings. |
| TC03 | Compile and stage a novel plan instance | Pass | The complete definition produces stable profile and draft hashes while accepted truth remains unchanged. |
| TC04 | Recover from incomplete or contradictory human facts | Pass | The new assessor returns machine-addressable paths/codes/prompts, derives one safe residual, and never stages or mutates truth. |
| TC05 | Admit evidence in the right order | Pass | Standard evidence classes are shared across families, registered first and hash-bound into the draft. |
| TC06 | Attempt to fabricate activation consent | Pass | Exact human-action confirmation is structurally unavailable and fabricated ids are refused. |
| TC07 | Retrieve confirmation after the human acts | Pass | `finite_list_plans` exposes the pending draft’s confirmation id only after human confirmation. |
| TC08 | Activate and continue operating the new plan | Pass | Guarded activation switches the kernel and atomically refreshes contextual tools. |
| TC09 | Recover after the source plan/revision changes | Pass | Confirmation/activation refuses the stale draft with a restage path. |
| TC10 | Retry an activation after uncertainty or reload | Pass | Persistent checksum-verified idempotency replays the exact receipt; mutation and key reuse fail. |
| TC11 | Construct a use case outside all three semantic families | Fail | The compiler correctly refuses it, but the capability ceiling is a product blocker rather than a safety defect. |
| TC12 | Amend an active plan without losing lineage | Fail | No first-class draft-from-active-version or supersession receipt exists. |

Codex result: **10 pass, 0 partial, 2 fail**.

## What WebMCP is buying us

The strongest WebMCP behavior is not “the model filled out a profile.” It is that
Codex can discover a construction contract from the same live application,
compose a new operating object, stage it beside the human surface, observe exact
human authority, activate it, and immediately continue with the new contextual
tool set. The operator and consumer stay on one stateful page without adding an
application-owned agent.

The exact-activation seam is the moat candidate: profile compiler, evidence
quarantine, deterministic hashes, consumer authority, live tool replacement and
adaptive plating form one transaction. Clever application code supplies the
laws; Codex supplies interpretation and composition.

## Friction and blockers

1. **Semantic-family ceiling — real blocker.** Custom instances are now real,
   but the compiler still admits only travel, renovation and event families with
   fixed contextual tool sets and three time models. This is safer than arbitrary
   generated tools, but it is not yet a general adaptive-plan grammar.
2. **Partial intake is now structured but volatile.** Codex can assess incomplete
   facts and exact clarification paths, but the packet is not a durable shared
   work object across reload.
3. **Draft volatility — product trade-off.** Losing an unconfirmed construction
   packet on reload protects the “only accepted truth persists” law but wastes
   operator and consumer work.
4. **No plan version lineage — real blocker.** A new id works mechanically, but
   Finite cannot yet say that plan B amends or supersedes plan A.
5. **Evidence vocabulary is deliberately closed.** This avoids a pre-activation
   evidence deadlock and arbitrary trust classes, but new domains may earn new
   standard classes later.

## Engineering ruling

Do not add more seeded examples and do not start submission preparation. The
next build should tackle one contract:

1. an immutable plan-version/amendment transaction with explicit supersession,
   human confirmation and a receipt.

The typed partial-intake/missing-facts packet was earned and landed during this
run, alongside a clean blueprint and human draft-return action.

Generalizing semantic families should follow those experiments, not precede
them. Arbitrary generated code, tools or UI remain out of bounds.
