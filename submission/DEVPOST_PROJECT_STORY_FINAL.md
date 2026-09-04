## Inspiration

Planning software is usually good at storing the first version of a plan. It is much less useful after something changes.

A delayed supplier, a new date, a smaller budget or one fixed booking can affect everything around it. At that point, people often end up rebuilding the plan in chat, patching a spreadsheet and checking every dependency by hand.

Finite started with a simple comparison. Most software gives you the kitchen and still expects you to cook. With Finite, you are the diner, Codex is the chef, and Finite is the kitchen and service system. You describe the outcome and judge the result. Codex does the work. WebMCP gives Codex a real way to operate the kitchen.

The goal was to build a planning system that stays useful when the original plan stops being correct.

## What it does

Finite is a planning partner for plans that need to survive change.

You can start with an outcome in ordinary language. Finite turns it into a working plan with the right structure for the job. A trip needs dates, routes, bookings and a budget. A renovation needs phases, dependencies, suppliers and contingency. An event needs capacity, commitments and a run of show. Interview preparation and recurring practice need different records again.

These are different product surfaces built from the same planning model. The same system can support all of them because it understands the connected facts, constraints, choices and revisions underneath each plan.

Codex can enter the live plan through WebMCP and read its current facts, limits, evidence and open work. When something changes, Codex can explore what is movable, test the available combinations and bring back the distinct directions that fit the plan.

The public Spotlight shows this with a request to add three nights in Paris. The international flights are fixed, the total budget still matters and at least AUD 500 must remain free. Finite checks 26 possible combinations. Eighteen satisfy the encoded constraints, eight do not, and five meaningfully different directions exist for this plan. If only one direction worked, Finite would return one.

The person chooses Protect breathing room and reviews the exact effect before confirming it. Codex can then apply that approved route. The plan moves from revision 1 to revision 2 once, retains AUD 910 of freedom and saves a before and after receipt that survives reload.

Finite keeps research, comparison, verification, booking and payment as separate states. It does not claim that finding an option means the option is available or that a saved plan means anything has been purchased.

## How we used WebMCP

WebMCP is the connection between Codex and the live plan.

The page that the person sees also exposes typed, page-scoped tools to Codex. That means Codex works with the same accepted plan, current revision and visible decision state instead of guessing its way through buttons or using a hidden copy of the data.

Finite registers seven stable document tools. Codex uses them to enter the current work, discover the available capability group, invoke the relevant planning action and read exact parts of a larger result when needed. The available actions are checked again against the active plan and revision before they run.

Codex handles language, research and orchestration. Finite handles the calculations, constraints, saved state and receipts. You decide which direction becomes part of the plan.

The person makes the final choice on the visible planning surface. WebMCP lets Codex prepare the alternatives and carry the selected direction into the same live plan.

Codex does not just send advice back to chat. With your permission, it can guide you through the real Finite interface: move to the relevant section, highlight the actual controls, explain them in an on-page popup, and pause for questions or Next. These are built-in, page-scoped WebMCP capabilities, not a prerecorded tour. You can work manually, let Codex develop the plan, or switch between both in the same workspace. Guidance never grants permission to choose or approve a plan change for you.

## How it improves the human and agent experience

Without this connection, the person has to carry information between the app and the agent. They explain the plan in chat, receive a recommendation, then update every affected field themselves.

With Finite, Codex can enter the current plan in one call and see what is already known. It can work across the whole plan, then stop when a real decision is required. The person sees the trade-offs and the exact proposed change instead of operating the planning machinery.

This makes the relationship straightforward. Codex does the planning work. Finite keeps that work consistent. The person stays responsible for the outcome.

## How it was built

Finite uses TypeScript, Vite, Cloudflare Workers, D1, R2 and ChatGPT Sites.

The planning kernel uses integer money, revision-bound candidates, constraint checks, short-lived approval challenges, optimistic concurrency, atomic receipts and idempotent replay. Accepted plan state is stored in D1 and can be restored after reload.

An adaptive surface compiler builds each type of plan from a limited set of validated components. The same plan definition also limits what Codex can discover and do through WebMCP.

Large results are stored temporarily by content hash. Codex receives a compact summary and can request the exact section it needs. This keeps the tool responses small without cutting important values in half.

Codex provides the reasoning. Finite provides the connected state, calculations and persistence that make that reasoning useful inside a real product.

## Challenges

The difficult part was keeping the plan correct while the person and Codex were both involved.

A reported change is not an accepted change. A proposed option is not a decision. A click on an approval control is not the same as a completed plan update. Those states have to remain separate through retries, reloads and stale browser sessions.

The first implementation also exposed too many route-specific tools and returned too much data. It was replaced with seven stable tools, smaller capability groups and exact retrieval for larger results.

Testing also found small wording problems that could cause large mistakes. For example, `value: 3` could be read as either an absolute duration or an instruction to add three days. The final contract separates `value` from `delta` and rejects contradictory inputs.

## Accomplishments

- A complete public WebMCP plan change from revision 1 to revision 2
- A situation-dependent set of distinct suggestions derived from 26 checked combinations
- Seven stable WebMCP tools for the lifetime of the page
- Human choice kept inside the visible planning conversation
- Persistent receipts with the exact before and after state
- Distinct travel, renovation, event, interview, practice and general planning surfaces
- 373 passing tests, including 20 repeated Spotlight transaction runs
- Three calls to the first useful action in the measured production route

## What we learned

More tools do not automatically make an agent more capable. A small toolset with current state and clear boundaries is easier for Codex to use well.

We also learned that honest status matters. Research is not verification. A valid route is not approval. An updated plan is not a booking. Showing those differences makes the product easier to trust and easier to understand.

The best division of work is built into the workflow. Codex can do the repetitive planning work while the person decides what becomes part of the plan.

## What's next

The next step is to watch new users bring their own outcomes into Finite and see where the planning model is unclear without explanation. After that, the adaptive grammar and evidence connections can expand to cover more kinds of plans while keeping the same rules for accepted state and human approval.
