# Chef and human failure audit — 2026-08-27

This register is written from the operator's side of the kitchen. “Chef burden” means the judgment Codex still has to exercise even when the deterministic backend behaves correctly.

## Full-pass disposition

All 54 items are now routed. Deterministic faults are closed in code; irreducibly external or human conditions are controlled through explicit boundaries rather than silently inferred.

- Items 1–10: stable bootstrap, one route arbiter, hash-bound pointer handoff, stale refusal, receipt-backed activation/arrival reconciliation, concurrency guards, and one release source.
- Items 11–17: returned-draft separation, expiry refusal, template-leak prevention, bounded recovery moves, evidence freshness, and explicit AUD/minor-unit metadata.
- Items 18–21: external-state ladder with evidence/human attestation, consumer-language impossible-scope refusal, staged-work invalidation, and immutable amendment routing.
- Items 22–30: receipted lifecycle/status history, append-only correction, confirmed preference effects, authority-only discovery with receipt replay, guarded context switches, hostile-input rendering, and truthful empty states.
- Items 31–54: a versioned 24-rule human-reality contract returned to Codex. Group work preserves named positions and requires a selected human decision protocol rather than averaging people away.
- Cross-cutting proof: every tool result now reports chef-effort counters for calls, human boundaries, stale work, authority refusals, failures, accepted mutations, and elapsed time. Token measurement is explicitly host-owned.

Regression proof: 114/114 tests, including the original twelve full journeys, authority discovery/replay, same-revision hash drift, guarded switching, external execution vocabulary, all 24 human rules, group authority, and long nested mixed-language rendering.

Live proof: owner-private Sites version 47, source `84934e2037aad1e92dd2334388d0beeec55f9c68`, deployment `appgdep_6a8f585c45348191ae761ce89d8b09e6`. Authenticated inspection returned `audit-closure-v47`, main top 78px, 32px arrival title, 1280px document/client width, and an authority-filtered construction registry with no activation tool.

## Operational failure points

| # | Failure point | Current defence | Remaining chef burden / next improvement |
|---:|---|---|---|
| 1 | WebMCP registry is queried before page tools finish registering | Stable page-start proxy and retryable `WEBMCP_INITIALIZING` | Host should expose an explicit ready event and measured registration latency |
| 2 | Arrival route and accepted-plan route disagree | Server-side arrival-first arbitration and one `nextAction` | Keep a single authoritative route in every result; contract-test every result code |
| 3 | Route refresh hides the tool required for the next step | Result-code-to-toolset mapping | Generate route mappings from one declarative state machine |
| 4 | Copied handoff is mistaken for authority or truth | Handoff carries a rendezvous pointer only | Codex must always enter the authenticated kitchen before acting |
| 5 | Plan ID/revision match but same-revision content drifts | Profile/snapshot hashes after entry | Add expected snapshot hash to copied handoff or formally guarantee immutable revisions |
| 6 | A delayed Site answer arrives after Codex began a draft | Exact arrival version/checksum binding | Codex must discard attractive stale work without defending sunk effort |
| 7 | Plan activates but originating arrival remains open | Terminal `plan_activated` arrival event | Reconcile closure after transport failure; add an outbox if API boundaries separate |
| 8 | Activation succeeds but response is lost | Idempotent activation receipt replay | Retry only with the identical key and independently close the arrival |
| 9 | Two Codex/browser operators write the same revision | Optimistic concurrency and rollback | Re-enter, explain the winner, rebuild rather than merge authority |
| 10 | Browser cache or static-first HTML reports an older build than its loaded assets | Exact no-store release shell, matching source marker, and asset hashes | Automate release-manifest generation instead of hand-maintained hashes |
| 11 | A returned draft is mistaken for a discarded draft | Durable returned-review packet and separate Start over | Codex must materially address the feedback, not just reword the same draft |
| 12 | Construction packet expires mid-task | Seven-day expiry and explicit status | Preserve source facts in human-readable form; recompile without pretending authority survived |
| 13 | Typed intake silently inherits example details | Clean family compiler and intake-only moves/stages | Audit names, amounts, places, and stages for template leakage before review |
| 14 | New plan has no viable recovery moves | Intake-supplied bounded move menu | Ask for real trade-offs or declare buffer-only operation visibly |
| 15 | Move savings or impacts become stale | Profile hash, revision binding, evidence policy | Research and amend moves when external prices materially change |
| 16 | A material change has no current evidence | Materiality/freshness checks | Distinguish researchable fact from human judgment and ask only at the latter boundary |
| 17 | Currency or minor units are ambiguous | `*Minor` integer contract | Return explicit currency code and exponent in every operator argument envelope |
| 18 | External action is treated as completed because it was planned | Accepted truth records planning receipts, not bookings | Require connector evidence or human attestation before marking external completion |
| 19 | Impossible scope produces a persuasive but invalid option | `NO_VALID_OPTION` and deterministic violations | Explain refusal in consumer language and offer bounded scope changes |
| 20 | New shock arrives while an option is staged | One active event invalidates candidates and approval | Codex must surface that prior work was superseded, not quietly replace it |
| 21 | Structural scope change is applied as an ordinary event | Immutable amendment route | Decide whether identity/locks/entities/search menu changed materially |
| 22 | A completed or abandoned plan receives “one more thing” | `PLAN_NOT_ACTIVE` | Ask whether to reopen, clone, or start a new plan; never infer which |
| 23 | Paused looks identical to finished | Distinct lifecycle truth and route | UI needs stronger visual status and the condition for resumption |
| 24 | Reopening erases why the plan stopped | Append-only lifecycle events | Summarize prior conclusion and what changed before new work |
| 25 | Actual correction overwrites history | Append-only correction plus evidence | Explain original, corrected, delta, and provenance without ledger jargon |
| 26 | Preference feedback becomes accepted truth without review | Separate feedback, typed staging, human confirmation | Show the behavioral consequence, not only a 0–100 weight |
| 27 | Approval ID is fabricated or copied | Exact staged candidate and authority binding | Hide apply tools until a valid challenge exists where hosts permit dynamic discovery |
| 28 | Plan/profile switch happens accidentally | Explicit tool and durable verification | Add expected current plan/revision guard and a consumer-visible switch receipt |
| 29 | Large interpretation leaks JSON/internal paths into the UI | Consumer-language renderer | Continue fuzzing nested, long, malformed, and mixed-language input |
| 30 | “No plan” actually means “no arrival waiting” | Separate arrival and plan state | Audit every empty-state noun against canonical state |

## Human failure points that are rational in human terms

| # | Human behaviour | Why it happens | Chef response |
|---:|---|---|---|
| 31 | Keeps a sentimental venue, finish, city, or ritual despite cheaper alternatives | Identity and memory are real value | Encode it as a preference or lock; stop relitigating it as arithmetic |
| 32 | Changes their mind after approving a sensible option | Preference is discovered through seeing consequences | Record a new event; never rewrite the prior approval as if it did not happen |
| 33 | Says the budget is fixed, then reveals another pool of money | Shame, mental accounting, or changing willingness | Ask what the finite limit covers and version the scope visibly |
| 34 | Refuses to spend available buffer even when the plan was designed for it | Loss aversion and safety seeking | Show the cost of preserving buffer as well as the cost of using it |
| 35 | Spends more to avoid one unpleasant conversation | Social friction can outweigh money | Treat coordination cost as a preference, but do not disguise it as financial optimality |
| 36 | Adds guests/scope because saying no feels worse than violating the plan | Social pressure and optimism | Enforce hard safety/capacity constraints; make the human choose the compensating sacrifice |
| 37 | Answers “unsure” to the only question that unlocks the plan | Decision fatigue or missing experience | Offer reversible defaults, research routes, or a bounded experiment—label assumptions |
| 38 | Gives different answers on Site and in Codex | Context changes expression; memory is imperfect | Latest explicit human input wins only after reconciliation; show the conflict |
| 39 | Assumes silence from a partner/vendor means agreement | Hope substitutes for coordination | Keep it an open human-coordination dependency, never a commitment |
| 40 | Treats a quote as a booking | The distinction is cognitively inconvenient | Separate researched, quoted, held, booked, paid, and verified states |
| 41 | Continues because too much has already been spent | Sunk-cost bias | Compare forward cost/value only, while acknowledging the emotional loss |
| 42 | Rejects a correct plan because the presentation feels cold or financial | Consumption experience changes trust | Replate the same truth around sequence, people, and outcome without altering numbers |
| 43 | Wants the cheapest, fastest, best, safest option simultaneously | Aspirations arrive before trade-offs | Return the constraint collision and ask which value wins at the margin |
| 44 | Panics during a last-minute shock and asks for immediate irreversible action | Stress collapses deliberation | Offer the smallest reversible stabilizing move first; preserve authority boundaries |
| 45 | Conceals a purchase or commitment already made | Embarrassment or fear of judgment | Make correction safe and append-only; optimize from reality, not blame |
| 46 | Overestimates future time, energy, or DIY capacity | Planning fallacy and optimism | Model capacity as finite; create pause/abandon routes before crisis |
| 47 | Protects one luxury while cutting several “more sensible” items | Salience and personal meaning | Optimize to lived value, provided constraints remain valid |
| 48 | Reopens a completed plan for a tiny unresolved detail | Psychological closure differs from operational closure | Ask whether this is reconciliation, a new plan, or genuine reopening |
| 49 | Wants to abandon but will not say so directly | Loss of face and identity threat | Offer pause and abandon as legitimate outcomes, with neutral language |
| 50 | Post-rationalizes a choice after making it emotionally | Humans preserve a coherent self-story | Preserve the factual decision lineage; do not challenge the story unless safety depends on it |
| 51 | Chooses convenience over a previously stated value | Immediate friction dominates abstract preference | Surface the conflict and let the human confirm the updated preference |
| 52 | Keeps asking for more options instead of choosing | Choice defers responsibility | Cap the menu, explain what distinguishes options, and recommend one with reasons |
| 53 | Believes the model “handled it” when only a plan was produced | Fluent output feels like completed work | Clearly separate planned, staged, authorized, externally executed, and verified |
| 54 | A couple/team has no single preference function | People are not one optimizer | Preserve named conflicts and require a human decision protocol rather than averaging them away |

## Highest-value next engineering work

1. Generate the release manifest automatically from Vite output.
2. Include explicit currency metadata and operator-ready `knownArgs`, provenance, and `missingInputs` on every contextual route.
3. Add a durable activation/arrival outbox for cross-endpoint exactly-once closure.
4. Add plan/revision guards and receipts to context switching.
5. Make external state vocabulary first-class: researched, quoted, held, booked, paid, verified.
6. Render lifecycle status and resumption conditions prominently without displacing the current dish.
7. Add conflict presentation for contradictory human inputs across surfaces.
8. Add fuzz/property tests for long natural-language arrival inputs and consumer rendering.
9. Add multi-human preference/authority policy rather than silently treating a group as one consumer.
10. Measure chef effort: calls, tokens, missing-input turns, stale-work loss, and time-to-safe-conclusion per journey.
