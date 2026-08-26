# WebMCP semantic recovery and cancellation acceptance

Date: 2026-08-27

## Accepted claim

Codex can recover omitted operation detail by meaning rather than byte position, and a WebMCP cancellation reaches every authenticated network rail involved in operator work. Finite never returns a broken semantic fragment and never interprets an interrupted commit response as failure or success.

## Semantic recovery law

The content-addressed result vault now retains the complete deterministic result, its serialized representation, full hash, originating tool, and a bounded semantic path index.

`finite_read_result` behaves in two modes:

1. With only `resultRef`, it returns `RESULT_DETAIL_MANIFEST` with the full hash, total size, path count, and a route-prioritized bounded list of exact RFC 6901 JSON Pointer paths.
2. With one to eight `paths`, it returns `RESULT_DETAIL_SELECTED` with exact values and a selection hash.

Unknown paths fail with `RESULT_DETAIL_PATH_NOT_FOUND`. If a requested value would push the response over 1,500 characters, Finite returns `RESULT_DETAIL_SELECTION_TOO_LARGE` and narrower descendants. It does not slice strings, split JSON tokens, or imply that a partial value is complete.

## Cancellation law

The WebMCP host `AbortSignal` is forwarded through:

- the page-start entry proxy;
- canonical kitchen entry and all arrival reads/writes;
- construction-packet load, save, return, and clear;
- operator-session and authority-handoff requests; and
- accepted-truth initialization, load, and commit.

A pre-cancelled call returns `TOOL_CANCELLED` before work. An in-flight interrupted read/write returns `TOOL_CANCELLED_OUTCOME_UNKNOWN` and instructs Codex to re-read canonical state. An interrupted accepted-truth commit restores the complete local optimistic checkpoint—including revision, accepted allocation, entities, staged candidate, approval, and idempotency state—while refusing to guess whether the remote server committed before the response was lost. The same idempotency key may be replayed only after canonical reconciliation.

Cancelled tools do not trigger route replacement, continuation orientation, or a second repository read.

## Deterministic recovery clock

The pressure run exposed a wall-clock dependency in `MemoryConstructionPacketRepository`: simulated packet timestamps could cross midnight relative to the host clock and be falsely rejected as stale. The repository now accepts an injected clock, and the cross-surface return/revision test uses one explicit timeline.

## Automated receipt

The complete production suite passes **126/126** tests. The focused WebMCP quality suite passes eight tests and proves:

- discovery and metadata budgets;
- semantic bootstrap metadata and cancellation forwarding;
- bounded content-addressed manifests and exact semantic selection;
- refusal of oversized semantic values;
- a complete bounded travel change-to-commit route;
- no work from pre-cancellation;
- in-flight arrival cancellation with no second read;
- interrupted accepted-truth rollback with unknown remote outcome; and
- in-flight construction cancellation without work resurrection.

TypeScript library compilation and the production build pass.

## Live correction before acceptance

Owner-private Sites v52 proved the native semantic registry and `finite_read_result` schema, but its first kitchen call exposed a sufficiency regression: twelve advertised root paths enlarged the compact ticket enough to trigger the emergency fallback. The response remained only 933 characters and safe, but it omitted canonical identity and the exact human question. v52 is therefore deployment evidence, not an accepted operator release.

The v53 correction removes path discovery from the service ticket—`finite_read_result` owns the manifest—and adds explicit regression checks that the compact result retains identity and the route packet.

## Accepted live receipt

Exact source `6d852f0f67870f135781c47274d1cbd0da435fbc` is deployed owner-private as Sites version `appgprj_6a8e253e5c888191bd46de9e62734133~appgver_2a6e9d02e18c81918c76b1f567f205f0`, archive `sha256:0a1408f8d1edd38f01811cfa065cc6bdad2e807d81e890e9fb230b65b91451e1`, deployment `appgdep_6a8f7659b33c8191a743b8d17d41a379`. The live shell reports `semantic-recovery-v53` and serves `index--CrFYB4x.js`.

The native `finite_enter_kitchen` result is 1,474 serialized characters. It preserves `plan_travel_europe`, profile `travel`, revision 3, profile hash `7b5b23bbaa4539b5dc83f304483e6f4605012e362ef7cb64054f6d0e043bfc3e`, returned arrival version 27, and the exact bounded question “What wasn't right about this kitchen, and what should Codex change?”. It exposes no authority and reports `acceptedStateChanged:false`. The complete 23,010-character result is retained under full hash `4ed0cedef9d8601c99d719b274d4e27cf28108e1e3113557514c8b87fe9f810b` and result reference `b6c9c85e682675502badb4baad1acf9120c656ede7c8f1b9307d20daead7f1fe`.

A manifest read returned `RESULT_DETAIL_MANIFEST`, 256 indexed paths, the same full hash, and no mutation. Selecting only `/operatorPacket/nextAction` returned `RESULT_DETAIL_SELECTED` in 1,161 characters with selection hash `e7b8fed2f002cb117435ff0d027790d086014fa071b0467277f79cf6ff9e9436`; the value preserved the full reason, known argument, missing input provenance, and human question. Requesting the oversized `/operatorPacket` returned `RESULT_DETAIL_SELECTION_TOO_LARGE` with exact narrower descendants and no mutation.

The bootstrap status was observed once as `WEBMCP_INITIALIZING`; entry remained callable and safe. After the route refresh it reported `WEBMCP_READY` with 16 route-sized tools including semantic recovery. This is an honest readiness transition rather than an empty-registry failure.
