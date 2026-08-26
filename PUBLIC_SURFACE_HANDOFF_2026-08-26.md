# Public surface workstream handoff

## Assignment

Design and implement the first public-facing Finite product surface from the
governing direction in `PRODUCT_NORTH_STAR.md`.

This is product/website work, not submission packaging. Do not prepare Devpost
copy, a video, screenshots, a repository release, or judging collateral.

## Outcome

A person arriving cold should understand within one viewport that:

1. Finite keeps live plans coherent when reality changes;
2. it works across travel, renovation, and events rather than being a travel or
   budgeting app;
3. Codex operates the kitchen through WebMCP while the human chooses and
   approves outcomes; and
4. they can sign in for a private kitchen or try an isolated demo.

## Source truth to read first

- `PRODUCT_NORTH_STAR.md`
- `README.md`
- `SURFACE_ACCEPTANCE_2026-08-26.md`
- `OPERATOR_BACKEND_ACCEPTANCE_2026-08-26.md`
- `AUTHENTICATION.md`
- the existing live app source in `src/main.ts`, `src/styles.css`,
  `src/surface.ts`, and `src/profiles.ts`

Historical acceptance documents are proof, not copy decks. Do not rewrite
their past claims.

## Product truths that are locked

- Canonical line: **Finite is an adaptive planning system for plans that must
  survive change.**
- Public promise: **Plans that survive contact with reality.**
- Defining question: **Reality changed. What should the plan become now?**
- Operating model: **Codex is the operator; the human is the consumer.**
- Money is one constrained resource, not the product category.
- One planning grammar compiles into materially different travel, renovation,
  and event surfaces.
- WebMCP connects Codex to the same live page and accepted state.
- Finite owns deterministic state, rules, safety, approval boundaries, and
  receipts; it has no backend reasoning model.
- External bookings and third-party systems are not yet modified automatically.

## Creative freedom

Choose the information architecture, visual hierarchy, interaction model,
motion, typography, and responsive behaviour. The current product aesthetic is
a reference, not a cage. Preserve working kitchen behaviour and accessibility,
but make the public story feel like a coherent product rather than engineering
documentation.

Use the three plan families as living proof. Avoid three generic feature cards
with different colours. Show how the same kind of disruption produces
different state, decisions, and surfaces.

The kitchen metaphor is valuable, but concrete product behaviour must lead.

## Recommended first slice

Build one strong public entry experience around the Paris story:

- the human order;
- the whole-plan consequence across flights, accommodation, transport, dates,
  comfort, and remaining room;
- a visible transition from changed reality to viable revised plan;
- a compact glimpse of renovation and event as structurally different
  outcomes; and
- clear “Continue with ChatGPT” and “Try the demo” routes using the existing
  auth contract.

The authenticated kitchen may remain the application destination. Do not
weaken or duplicate its authority controls.

## Do not do yet

- Do not change Site audience access or publish publicly without Benji's
  explicit approval.
- Do not alter the deterministic kernel, WebMCP tool contract, D1 tenancy,
  approval law, or authentication architecture merely to simplify the page.
- Do not add a backend model, generic chat box, fake connector, fabricated
  testimonial, unsupported statistic, or claimed booking action.
- Do not collapse the three families into one financial dashboard.
- Do not begin submission preparation.

## Definition of done

- Cold-start comprehension succeeds in the first viewport.
- The Paris story demonstrates whole-plan replanning rather than arithmetic
  alone.
- Travel, renovation, and event read as different human outcomes.
- The agent/operator inversion is understandable without an architecture
  lecture.
- Existing account/demo routes remain accurate and functional.
- The surface is responsive, keyboard-operable, and build-clean.
- The result remains private until public access is separately approved.
