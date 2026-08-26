# Bounded Plan Intake Acceptance — 2026-08-26

## Outcome

Finite is no longer limited to its three seeded plan instances. Codex can stage a
complete new operating profile inside one implemented semantic family, have the
application compile and freeze it, obtain exact human confirmation on the
consumption surface, and activate it through WebMCP. No model or backend agent
was added.

## Compile and authority contract

- The draft compiler accepts at most 100,000 serialized characters and a closed
  top-level profile schema.
- It validates finite-total conservation, the actual ledger, identifier and text
  bounds, entities, relationships, legal moves, preference impacts, search caps,
  evidence age/materiality policy, safe surface bindings and components, and the
  exact contextual tools implemented for its travel, renovation, or event
  family.
- Malformed nested input becomes `PLAN_DRAFT_INVALID`; it never escapes as an
  unexpected tool failure.
- Every actual must bind to known, hash-valid evidence already admitted to the
  active kitchen.
- The draft hash binds its compiled profile hash, evidence content/record hashes,
  source plan, and source revision.
- Staging changes no accepted plan truth. WebMCP cannot create the required
  `human_action` confirmation.
- Activation requires the exact draft id, confirmation id, source plan, source
  revision, and idempotency key. A forged, stale, altered, or duplicate plan is
  refused.

## Persistence and operator contract

Confirmed plans enter a device-local plan catalog with their validated definition
and actual-evidence bundle. Snapshots are keyed by actual `planId`, with fallback
for older built-in profile keys. A custom plan can be selected after reload and
switches the live contextual WebMCP vocabulary. Activation receipts persist;
exact retries replay, key reuse is refused, and a modified stored receipt fails
its checksum.

The live registry now exposes 25 stable WebMCP tools plus three contextual tools:
`finite_list_plans`, `finite_get_plan_blueprint`, `finite_assess_plan_intake`, `finite_stage_plan_draft`,
`finite_activate_confirmed_plan`, and `finite_switch_plan` are the new stable
operations. `humanConfirmPlanDraft` remains structurally absent.

## Automated proof

The 29/29 production tests prove:

1. a customer-summit plan with different totals, capacity, copy, and run-of-show
   compiles while the travel plan remains active;
2. fabricated activation authority is refused;
3. exact human confirmation activates the bound profile and evidence at revision
   1;
4. activation, selection, evidence, and idempotent replay survive reconstruction;
5. travel-to-custom-event switching replaces contextual tools;
6. malformed, unsafe, excessive, duplicate, missing-evidence, stale, and
   unsupported drafts fail closed; and
7. WebMCP exposes all operator actions while exposing no human authority creator;
8. family blueprints contain no inherited spent actuals or fixture evidence; and
9. typed partial intake returns exact missing/conflicting paths and safely derives
   one residual allocation without changing accepted truth.

TypeScript typecheck, Vite 8 production build, and the production dependency
audit pass with zero runtime vulnerabilities.

## What remains deliberately open

This slice now assesses an incomplete Codex-interpreted brief, but that packet is
volatile and deliberately does not interpret language or generate a profile.
The next product work is safe amendment/versioning for an already activated plan,
followed by experiments on the semantic-family ceiling. Submission preparation
is not the next engineering task.
