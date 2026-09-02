# Bounded Search and Mutation Acceptance — 2026-08-26

## Outcome

Finite no longer retrieves three profile-authored move recipes. Each profile compiles a bounded search policy and explicit move impacts. The kernel enumerates the legal move space, validates every explored combination against the active event and accepted revision, ranks distinct results for the profile's objectives, and returns the search proof with the decision packet.

The consequential boundary also no longer trusts the mutable candidate object. Stage, human approval, and apply independently reconstruct the candidate from the accepted profile, event, revision, legal move definitions, entity relationships, evidence policy, and exact arithmetic before proceeding.

## Search proof

| Profile | Legal moves | Explored combinations | Objectives | Returned options |
|:--|--:|--:|:--|--:|
| Travel | 5 | 26 | comfort, balanced, buffer | 3 distinct valid |
| Renovation | 4 | 15 | schedule, balanced, contingency | 3 distinct valid |
| Event | 4 | 15 | experience, balanced, buffer | 3 distinct valid |

- Search includes the empty move set and every combination through the compiled maximum move count.
- Locked dimensions are removed before enumeration.
- The profile compiler bounds exploration to at most 256 combinations and validates objective, option-count, move-count, and impact grammar.
- A forced three-combination policy stops exactly at three and reports `truncated: true`.
- Candidate identifiers and content hashes are deterministic for the same profile hash, event, revision, objective, source, and move set.
- Repeating generation replaces the prior generated set rather than accumulating duplicates.
- Every selected option exposes its source, move set, preference impacts, exact buffer/day result, violations, warnings, and score.

## Consequential-boundary proof

The contract suite refuses each of these without changing accepted truth:

- locked move simulation;
- stale event search after a legitimate revision change;
- impossible venue-capacity search and attempted staging;
- malformed integer-money or ambiguous entity-change events;
- material changes without evidence;
- candidate numbers mutated before staging;
- staged candidate numbers mutated after human approval;
- approval context mutated before apply;
- fabricated consent, reused idempotency keys, and finite-total violations retained from the prior suite.

Candidate integrity binds plan ID, profile ID, profile hash, accepted revision, event, search source, objective, unique move set, calculated impacts, resulting entities, evidence assessments, violations, warnings, and all exact allocation outputs.

## Three-profile transaction proof

For travel, renovation, and event independently, the suite:

1. records the profile-shaped disruption;
2. enumerates the bounded legal move space;
3. receives three deterministic, distinct, valid options;
4. stages the first exact option;
5. records human approval;
6. atomically applies it;
7. advances revision 1 → 2; and
8. proves the finite total is conserved.

## Automated proof

- TypeScript typecheck: pass.
- Contract suite: 17/17 pass, zero fail.
- Production Vite/Worker build: pass.
- Clean local Worker route: HTTP 200 with the required WebMCP security headers.
- Production dependency audit: zero runtime vulnerabilities.
- Sites packaging: pass with Worker entry, static client assets, and deployment metadata.

## Remaining boundary

The kernel now owns bounded search and integrity verification; Codex still owns interpreting the human order, selecting evidence, composing novel simulations, and deciding which valid option best serves the consumer. Fresh-session Codex Site Tools operation remains the only unproven operator gate.
