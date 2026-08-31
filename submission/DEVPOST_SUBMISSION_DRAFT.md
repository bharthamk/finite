# Finite — Devpost copy draft

## Project name

Finite

## Tagline

Plans that survive contact with reality—Codex works the change; people choose
what becomes true.

## Short description

Finite is an agent-native planning product for the moment a real plan stops
matching the world. A cost changes, dates move, someone becomes unavailable, or
a commitment becomes fixed. Through WebMCP, Codex works directly against the
same visible, versioned plan the person sees. Finite tests legal combinations,
shows distinct trade-offs, stops for exact human authority, and applies one
replay-safe revision without pretending that planning completed a real-world
action.

## Inspiration

Planning tools are good at recording an initial intention and poor at absorbing
reality. When one assumption changes, people usually rebuild the plan in chat,
patch a spreadsheet, or update disconnected tasks by hand. Agent chat can reason
about the change, but it often lacks canonical state and can blur advice,
authority, and accepted truth.

Finite asks a sharper question: **Reality changed. What should the plan become
now?**

## What it does

Finite turns an ordinary goal into a visible, editable plan with finite dates,
money, stages, tasks, evidence, commitments, and open decisions. When reality
changes, Codex can use page-defined WebMCP tools to:

- enter the current plan without asking the person to restate it;
- record the new pressure without changing accepted truth;
- inspect constraints, locks, evidence, and movable parts;
- enumerate and compare bounded legal combinations;
- present distinct routes with explicit protections and trade-offs; and
- apply only the exact route the person chose and confirmed.

The accepted revision leaves a before/after receipt, persists across reload,
and never claims that research, quoting, holding, booking, payment, or
verification are the same action.

## Why WebMCP

This experience depends on the website and agent sharing one live operating
surface. Browser automation would force Codex to infer state from pixels and
controls. A conventional API would detach the agent from the page the person is
judging. WebMCP lets Finite expose bounded semantic tools from the document
itself, tied to the current plan, revision, evidence, and visible human
authority boundary.

The result is not “an agent clicks the app.” Codex handles interpretation,
research, and orchestration; Finite deterministically owns arithmetic,
constraints, concurrency, persistence, evidence admission, authority, and
receipts; the person owns consequential choice.

## Better human-agent experience

Before WebMCP, the person had to explain the plan again, the agent had to guess
which interface state was current, and approval could become another ambiguous
chat message. With Finite, Codex enters canonical state in one call, requests
only the semantic detail needed for the current route, works visibly in the same
plan, and stops at one exact decision. The human can see what each option
protects, what it trades, why it works, and precisely what changed after apply.

## How it was built

Finite uses TypeScript, Vite, Cloudflare Workers, D1, R2, and ChatGPT Sites. The
document registers seven stable imperative WebMCP tools. A bounded toolset
selector returns route-specific typed action manifests, and a single semantic
invoker revalidates the active group, revision, evidence, and authority before
dispatch. Large deterministic results live in an ephemeral content-addressed
vault and can be recovered by exact JSON Pointer rather than flooding model
context.

The deterministic kernel uses integer money, immutable profile hashes, legal
move enumeration, revision-bound candidates, five-minute exact authority
challenges, optimistic concurrency, atomic receipts, and idempotent replay.
Human confirmation creators are never registered with WebMCP.

## What we learned

The most useful agent interface is not the largest tool catalogue. Finite began
with dozens of route tools and oversized state responses. It now keeps a stable
seven-tool document contract, advertises one bounded semantic manifest at a
time, and measures discovery width, calls to first useful action, semantic
recovery, human boundaries, failures, and accepted mutations.

We also learned that trustworthy agency needs visible incompleteness. Recording
a change is not accepting it. Research is not verification. A proposed route is
not human authority. A committed receipt is not a booking. Keeping those states
separate made Finite both safer and more comprehensible.

## Accomplishments

- A complete public revision 1→2 WebMCP transaction with visible human choice.
- 26 bounded combinations distilled into three legal, understandable routes.
- Seven stable document tools instead of an ever-growing browser registry.
- Complete before/after, authority, search, and replay proof in one receipt.
- Travel, renovation, event, interview-preparation, and recurring-practice plan
  shapes on one closed adaptive grammar.
- 346 passing tests, including 20 hostile end-to-end Spotlight runs.
- Reload-safe accepted truth, isolated public Demo mode, responsive layout, and
  keyboard/screen-reader hardening.

## What's next

Observe new users running the Spotlight without coaching, then improve only
demonstrated comprehension failures. Longer term, expand the adaptive grammar
and evidence connectors without weakening the same authority and accepted-truth
contract.

## Links

- Live app: https://finite.bharthamk.chatgpt.site/
- Judge Spotlight: https://finite.bharthamk.chatgpt.site/?start=spotlight-active&tour=spotlight&plan=1&fresh=1
- Public source repository: `[pending]`
- Public YouTube demo: `[pending]`

## Built with

WebMCP, TypeScript, Vite, Cloudflare Workers, D1, R2, ChatGPT Sites, HTML, CSS.
