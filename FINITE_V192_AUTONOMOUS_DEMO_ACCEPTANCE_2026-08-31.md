# Finite v192 — autonomous live demo

Date: 2026-08-31  
Release marker: `hosted-release-marker-v192`

## Correction

The live demo is not a collaborative or approval-bearing plan. It is a fully synthetic run controlled by Codex. The person has only two roles:

1. Click **Next** when they understand the current chapter and want Codex to continue.
2. Ask Codex questions about anything they saw, during or after the run.

## Prepared run

Codex receives a complete synthetic Hobart scenario and runs four prepared chapters through Finite's real page tools:

1. Create and show the complete starting point.
2. Build and show the structured editable draft.
3. Add a synthetic rainy-day change and show the draft adapting.
4. Show the resulting plan summary and what remains editable.

The demo supplies all example facts itself, never asks the person to type or choose, stays within non-sensitive draft work, and does not enter activation, confirmation, external-action, or other consequential flows. It closes by inviting questions in Codex or letting the person leave.

## Verification

- Full automated suite: 284 tests passing.
- Production typecheck, build, and client chunk budget passing.
- Diff check passing.
- Live release marker and autonomous-demo copy verified after publish.
