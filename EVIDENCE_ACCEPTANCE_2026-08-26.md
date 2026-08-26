# Evidence Admission Acceptance — 2026-08-26

## Outcome

Codex can now introduce researched context into Finite without turning external
content into instruction, authority, or mutable plan truth. Evidence is admitted
through a narrow deterministic boundary before any event, search, staging, or
human approval.

## Admission contract

`finite_register_evidence` accepts a bounded source label, profile-supported
source class, exact observed date, source type, locator, and content.

The application:

- assigns `untrusted_external` trust regardless of submitted text;
- records Codex as the submitting operator and the profile as-of date as capture
  time;
- requires HTTP(S) locators for URL evidence;
- refuses malformed or future dates, unsupported source classes, invalid
  locators, empty fields, and content over 10,000 characters;
- computes one SHA-256 content hash and one provenance-bound record hash;
- derives a deterministic evidence identifier from the record hash;
- deduplicates exact content without creating parallel records; and
- returns metadata only, never echoing hostile content from the registration
  result.

## Trust and transaction binding

- Evidence content remains readable only through the existing WebMCP tool
  marked with `untrustedContentHint`.
- Change events refuse unknown or duplicate evidence references before they can
  become active orders.
- Candidate creation recomputes both evidence hashes. Altered content or record
  fields produce `EVIDENCE_INTEGRITY_FAILED` and no valid option.
- Candidate identity binds the evidence identifier, content hash, and record
  hash, so stage, human approval, and apply re-derive the same evidence-backed
  packet.
- Registration alone is volatile. Only evidence referenced by an applied event
  or accepted correction enters the persisted snapshot and portable export.

## Automated proof

The production suite passes 24/24 tests. The evidence tests prove:

1. hostile instruction text is stored as untrusted data and never changes a
   plan or authority state;
2. exact duplicate content returns the existing deterministic evidence record;
3. a material researched quote can be bound to a change, searched, staged,
   separately approved by the human, applied, reloaded, and exported with its
   hashes intact;
4. an unaccepted registered record disappears across persistence;
5. unknown, malformed-date, future-date, unsupported-class, invalid-locator,
   oversized, and post-hash-mutated evidence fail closed; and
6. WebMCP exposes 19 stable tools plus three profile-contextual tools while
   keeping evidence reads explicitly marked untrusted.

TypeScript typecheck and the Vite 8 production build also pass.

## Remaining boundary

This is an application-side evidence-admission contract, not a web crawler or
connector. Codex still performs research and judgment. The next product layer is
bounded plan intake so the same kernel can operate a human's finite project
rather than only the three seeded fixtures.
