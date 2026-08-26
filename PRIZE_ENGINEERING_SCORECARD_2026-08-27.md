# Finite prize-engineering scorecard

Date: 2026-08-27

This is an engineering control surface, not submission copy. It translates the current WebMCP challenge judging dimensions—WebMCP leverage, execution, potential impact, and creativity/ambition—into falsifiable Finite gates. The product is not ready because a document says it is ready; every closed gate needs code, an executable check, a live receipt, or a fresh-operator trial.

## Winning claim

Finite makes the browser application an agent-native operating environment. The human states the outcome, consumes options, supplies preference and exact authority, and judges the result. Codex operates the kitchen. Deterministic code owns accepted truth, constraints, arithmetic, concurrency, persistence, evidence admission, authority challenges, and receipts.

The WebMCP leverage is not button automation. A fresh Codex must be able to enter the same signed-in plan the human sees, orient without prior Finite knowledge, discover only the safe tools for the current route, operate across delays and surfaces, recover dropped responses, and stop at the smallest genuine human boundary.

## Hard product gates

| Gate | Target | Current proof | State |
|---|---:|---|---|
| Fresh-task orientation | Correct route in one kitchen call, no human re-explanation | `finite_enter_kitchen`; handoff and chef-menu suites | Closed locally |
| First-result context | At most 1,500 serialized characters | `tests/webmcp-quality.test.mjs` | Closed locally |
| On-demand detail | Content-addressed, bounded, hash-verifiable pages | `finite_read_result`; quality suite | Closed locally |
| Discovery size | At most 20 advertised tools on every route | Quality and adapter suites | Closed locally |
| Metadata quality | Names ≤30 chars; tool descriptions ≤500; parameter descriptions ≤150 and non-empty | Quality suite over every tool group | Closed locally |
| Human authority | No approval/confirmation creator in WebMCP | Authority, intake, evidence, arrival, reality suites | Closed locally |
| Accepted truth | Atomic, revision-bound, remotely durable, reload-safe | Accepted-truth and operator-journey suites | Closed locally |
| Retry safety | Exact idempotent replay after dropped commit response | Reality and accepted-truth suites | Closed locally |
| Cross-surface continuity | Site/Codex delay and browser-empty reload preserve work, not authority | Arrival, construction, authenticated-handoff suites | Closed locally |
| Adaptability | One grammar produces materially different travel, renovation and event plans | Profile, surface and 12-journey endurance suites | Closed locally |
| Human irrationality | Preference reversals, sunk-cost pressure, silence, disagreement and scope shocks remain explicit | 54-point failure audit and endurance suite | Closed locally |
| External reality | Research/quote/hold/book/pay/verify remain distinct; planning never claims execution | Reality-execution suite | Closed locally |
| Cancellation | Pre-cancelled work performs nothing; page-start and canonical entry forward the host signal; in-flight I/O aborts cleanly | Quality suite and static bootstrap contract | Partial |
| Live native proof | Current bounded contract exercised by a fresh Codex against deployed Site tools | v50 inline-Codex entry and verified detail-page receipt | Closed for orientation; full-family journeys open |
| Portable judging access | Public live demo or supplied judge credentials | Current deployment is owner-private; isolated demo exists | Open |
| Open-source release | Sanitized public repository with visible owner-selected license | No Git remote or license in this working tree | Blocked on explicit public-release authority |

Current regression baseline: **123/123 tests pass** after the bounded-output and bootstrap-contract tranches.

## Measured baseline and correction

Before this tranche the active catalog contained 53 tools across bounded groups. Only four tool names exceeded the current 30-character recommendation, but no input parameter had a semantic description. The important failure was output size:

| Operation | Prior serialized output |
|---|---:|
| `finite_enter_kitchen` | 19,433 characters |
| `finite_open_kitchen` | 9,822 characters |
| `finite_get_capabilities` | 7,523 characters |
| `finite_get_chef_menu` | 5,982 characters |
| `finite_get_plan_state` | 2,277 characters |
| `finite_get_movable_set` | 2,146 characters |

The entry response was approximately thirteen times the target. That caused client `[Object]` rendering, forced redundant reads, and spent model context on state unrelated to the immediate route.

Production now returns a compact service ticket and stores the complete deterministic result behind an ephemeral content-addressed reference. `finite_read_result` returns at most 800 characters of JSON payload per page plus verification metadata. `finite_open_kitchen` and `finite_get_chef_menu` remain implementation operations but are no longer permanently advertised; `finite_enter_kitchen` is the single orientation contract.

The first deployed inline-Codex trial returned `finite_enter_kitchen` in 1,470 serialized characters, selected the exact returned-draft human boundary without a redundant state read, preserved travel plan revision 3, exposed no authority, and performed no accepted-state mutation. A deliberate `finite_read_result` call returned a 1,352-character verified page for the 23,011-character complete result. The follow-on v51 source closes the bootstrap metadata and cancellation-forwarding seam discovered by that trial.

## Judging-dimension score

Scores are deliberately conservative until live proof closes the local/live gap.

| Dimension | Current | Prize target | What moves it |
|---|---:|---:|---|
| WebMCP leverage | 9.0/10 | 10/10 | Complete deployed change routes across all three families and prove selective semantic detail plus route changes |
| Execution | 8.0/10 | 9.5/10 | Live vNext deployment, adversarial browser runs, in-flight HTTP cancellation, sanitized release reproducibility |
| Potential impact | 7.5/10 | 9/10 | Demonstrate the same operator law across three complete outcomes and show measurable human/model effort reduction |
| Creativity and ambition | 9.0/10 | 10/10 | Make “software as the agent’s kitchen” undeniable through adaptive plan construction and real-world recovery, not narrative alone |

## Highest-impact open queue

1. Propagate WebMCP cancellation into every HTTP arrival/construction/accepted-truth request and prove no ambiguous retry can duplicate a write.
2. Replace arbitrary JSON page slicing with semantic path reads while preserving the 1,500-character hard budget and content hash.
3. Run a fresh deployed Codex journey for each family from handoff through late shock, human authority, accepted commit, lost response, reload, and lifecycle conclusion.
4. Add an operator-effort evaluator that records discovered tool count, calls to first useful action, detail-page reads, human-boundary turns, stale refusals, and accepted mutations for every journey.
5. Adversarially test route-controller replacement during in-flight work, including pre-Chrome-153 behavior where unregistering may cancel execution.
6. Exercise signed-out demo, owner account, delayed Site edits, stale handoff hashes, same-revision drift, and two-browser optimistic concurrency on the live build.
7. Produce a sanitized reproducible source bundle and dependency/license inventory. Public release and license selection remain an explicit owner boundary because internal RUI material must not be exposed accidentally.
8. Keep the human-facing surface functional but defer aesthetic and interaction finalization to the later joint UI pass.

## Sources governing this scorecard

- OpenAI, “Site tools”: <https://learn.chatgpt.com/docs/webmcp>
- Chrome, “WebMCP best practices”: <https://developer.chrome.com/docs/ai/webmcp/best-practices>
- Chrome, “Imperative API”: <https://developer.chrome.com/docs/ai/webmcp/imperative-api>
- WebMCP Challenge: <https://webmcp.devpost.com/>

The OpenAI guidance confirms the core product shape: site tools let Codex and the human operate the same live page and signed-in session. Chrome’s guidance supplies the discovery, metadata, output, cancellation, and safety budgets. The challenge page supplies the four evaluation dimensions and live/open-source delivery constraints.
