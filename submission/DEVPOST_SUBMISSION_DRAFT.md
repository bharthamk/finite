# Finite: Devpost submission draft

Status: content-complete draft for accepted public release v245. Do not submit.
The project story has one source: `DEVPOST_PROJECT_STORY_FINAL.md`.

## Devpost paste map

This file is the field map. Benji enters and saves the draft; Codex may review
and improve the saved draft, but must not select the final submission control.

- **Project name:** paste `Project name` below.
- **Tagline:** paste `Tagline` below.
- **Project story / description:** paste the complete contents of
  `DEVPOST_PROJECT_STORY_FINAL.md`.
- **Try it out / live app:** `https://finite.bharthamk.chatgpt.site/`
- **Source code:** `https://github.com/bharthamk/finite`
- **Video:** keep the temporary required placeholder until the final film is
  accepted, uploaded and checked through public playback.
- **Built with:** add the tags under `Built with` below in that order. Do not
  pad the field to 25.
- **Testing instructions:** paste the recommended route from
  `JUDGE_TESTING_INSTRUCTIONS.md`; lead with the no-credential Spotlight URL.
- **Gallery and thumbnail:** use the final files named in
  `SCREENSHOT_AND_CAPTURE_PLAN.md` after film QC.
- **Entrant/team fields:** use Benji's own account details; do not infer or add
  team members or contributor credits.

## Project name

Finite

## Tagline

Change your plans without rebuilding them.

## Short description

Finite is a planning partner where you and Codex work through change on the
same live plan. WebMCP connects Codex to the product while Finite keeps the
affected dates, costs, constraints and commitments aligned across trips,
renovations, events, work and more.

## Project story

Paste the complete contents of `DEVPOST_PROJECT_STORY_FINAL.md`. Do not maintain
a second copy here.

## Links

- Live app: https://finite.bharthamk.chatgpt.site/
- Judge Spotlight: https://finite.bharthamk.chatgpt.site/?start=spotlight-active&tour=spotlight&plan=1&fresh=1
- Public source repository: https://github.com/bharthamk/finite
- Public YouTube demo: `[OWNER: paste public YouTube URL]`

## Judge-only testing instructions

No credentials are required. The URL opens a prepared, browser-local Spotlight
plan in Demo mode. In ChatGPT's in-app browser, keep the Finite tab open while
working with Codex so WebMCP remains connected. The page provides its own
handoff and walkthrough controls. You can explore the plan naturally, ask Codex
about it, introduce or refine a change, compare whatever directions are
available, or create a different kind of plan. Reload the current tab to inspect
persistence. The `fresh=1` URL restarts the prepared example. For Chrome, use
version 149 or later, enable `chrome://flags/#enable-webmcp-testing`, restart
Chrome and reopen the URL.

## Agents or clients tested

OpenAI Codex using ChatGPT's in-app browser, and Google Chrome 149 with WebMCP
testing enabled.

## AI tools used

OpenAI Codex for product design, implementation, testing, documentation and
WebMCP operation; ChatGPT's in-app browser for live WebMCP testing; and Qwen3-TTS
1.7B CustomVoice running locally through MLX Audio for the video narration.

## Built with

1. WebMCP
2. OpenAI Codex
3. ChatGPT
4. ChatGPT Sites
5. TypeScript
6. Vite
7. Cloudflare Workers
8. Cloudflare D1
9. Cloudflare R2
10. Drizzle ORM
11. HTML5
12. CSS3

## Release proof

- Live product: Finite v245
- Automated suite: 373 passing tests
- Repeated Spotlight transaction runs: 20/20
