# WebMCP operator-context acceptance

Date: 2026-08-27

## Accepted claim

A fresh inline Codex can enter Finite through the live signed-in page, receive one route-sized service ticket, identify the exact next human or operator boundary, and defer omitted detail behind a bounded content-addressed reference. The entry contract does not mutate accepted truth or manufacture human authority.

## Engineering correction

The earlier kitchen entry serialized 19,433 characters. Other orientation reads ranged from 2,146 to 9,822 characters. That made the registry technically semantic but operationally expensive: the client collapsed nested values, Codex spent context on unrelated state, and the promised one-call orientation still encouraged follow-up reads.

Production now enforces these laws:

- Every WebMCP result is at most 1,500 serialized characters.
- The complete deterministic result is retained in a 24-entry ephemeral content-addressed vault.
- `finite_read_result` returns at most 800 characters of JSON payload plus cursor and hash verification metadata.
- `finite_enter_kitchen` is the one authoritative orientation route; redundant open/menu operations are not permanently advertised.
- Every advertised tool name, parameter name, tool description, and parameter description stays inside the current discovery budgets.
- The page-start proxy and canonical entry forward the host cancellation signal and refuse pre-cancelled work.
- Human approval and confirmation creation remain structurally absent from WebMCP.

## Automated proof

The production package passes 123/123 tests. The dedicated quality suite proves:

1. every dynamically advertised route group stays at or below 20 tools;
2. tool names are at most 30 characters, parameter names are at most 30 characters, tool descriptions are at most 500 characters, and semantic parameter descriptions are present and at most 150 characters;
3. the page-start proxy carries the same semantic metadata and forwards cancellation;
4. production entry results are bounded, content-addressed, and recoverable;
5. every result in a full travel change-to-commit route stays inside the 1,500-character budget; and
6. a pre-cancelled execution performs no operation.

`npm run build` also passes TypeScript validation and the Vite production build.

## Live inline-Codex receipt

The owner-private v50 Site was loaded in Codex's inline browser and its native WebMCP registry was fetched after the page reported ready.

The first canonical operation was read-only:

`finite_enter_kitchen({ entryIntent: "continue_current", expectedPlanId: "plan_travel_europe", expectedPlanRevision: 3 })`

It returned:

- result code `KITCHEN_ENTERED`;
- 1,470 serialized characters;
- travel plan `plan_travel_europe`, revision 3;
- arrival `arrival_3b9dfea46b2b3025`, version 27, state `interpretation_confirmed`;
- one authoritative route, `awaiting_human`;
- the exact bounded question, “What wasn't right about this kitchen, and what should Codex change?”;
- `requiresHuman: true`, `authorityPresent: false`, and `acceptedStateChanged: false`;
- operation/result reference `30da4d41f679e76b7a4b6d5bbdb4e1838da3c94c64f6342f390da368a4956c84`;
- complete-result hash `75bac01a143f839512dd940fe8cb6b0fc3b28dd88df727f6e323f634ab3e92a7`; and
- complete-result size 23,011 characters.

Codex needed no detail read to identify the next boundary. A deliberate recovery call for page zero returned 1,352 serialized characters, an 800-character payload, cursor 800, the same complete-result hash, and chunk hash `c7d5365655c84c82c84b165dc46bca0bc1d97e4ae6ebaf88325d1a8c7091193d`.

No accepted-plan, arrival, candidate, feedback, authority, or staging mutation was made during this trial.

## Remaining boundary

This closes deployed orientation, not the entire competition-grade system. In-flight HTTP cancellation remains partial; arbitrary JSON character pages should become semantic path reads; and deployed end-to-end change, shock, authority, commit, lost-response, reload, and conclusion journeys still need fresh receipts for travel, renovation, and event. Portable judging access and public source also remain release boundaries.
