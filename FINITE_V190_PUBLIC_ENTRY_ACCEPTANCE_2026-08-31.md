# Finite v190 — public entry correction

Date: 2026-08-31  
Release marker: `hosted-release-marker-v190`

## Correction

v189 restored the compact entry gateway only after authentication. Signed-out visitors still saw the older two-action public gate. v190 puts the three-route Finite gateway on the actual root public page.

## Root routes

1. **Start fresh** begins ChatGPT identity and returns directly to the fresh-plan form.
2. **Start from an example** opens an isolated 24-hour workspace and carries the selected editable prefill into Finite.
3. **Walk through with Codex** opens an isolated 24-hour workspace directly in the live guided walkthrough.

The root no longer presents the generic “Continue with ChatGPT / Try the demo” pair.

## Continuity and boundaries

- The fresh route uses a same-origin SIWC return path.
- Example identity is carried by a bounded example ID; the actual text comes from Finite's shared source list.
- Guided mode automatically enables the existing consented read-only guide and opens its handoff once.
- Demo work remains isolated and expires after 24 hours.
- No accepted plan truth, authority, or authentication token is placed in the URL.

## Verification

- Full automated suite passing.
- Production typecheck, build, and client chunk budget passing.
- Diff check passing.
- Live release marker verified after publish.
