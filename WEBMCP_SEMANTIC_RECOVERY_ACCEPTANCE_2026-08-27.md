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

TypeScript library compilation passes. The release target is `semantic-recovery-v52`; deployed native proof is the next gate.
