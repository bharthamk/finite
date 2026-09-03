# Finite judging narrative and evidence

Use this as the claim-control layer for the Devpost text, video, screenshots,
README and live demo. Do not add a stronger claim unless it has evidence below.

## One-sentence thesis

Finite is a planning partner where you and Codex work through change on the
same live plan, with WebMCP connecting the conversation to a product that keeps
every affected date, cost, constraint and commitment aligned.

## Why it matters

Planning software is good at recording a first plan. The expensive work begins
when one assumption changes and every connected part has to be reconsidered.
Finite lets Codex do that work with the current plan instead of asking the
person to explain it again, copy an answer back and check every consequence by
hand.

## Why WebMCP is essential

**Judge takeaway:** WebMCP turns Codex from an adviser outside the product into
a planning partner working with the same live plan the person sees.

Proof to show:

- Codex enters the current plan in one call and receives the next useful action.
- The page exposes seven stable tools whose available planning actions adapt to
  the current plan and revision.
- Codex can record a change, ask Finite to test the connected consequences,
  compare the distinct workable directions and continue from the chosen result.
- The accepted run reached its first useful action in three calls with no failed
  calls.
- Larger results can be read in exact sections instead of flooding the model
  context.

The implementation is in `src/webmcp-bootstrap.ts` and `src/webmcp.ts`.

## Product execution

**Judge takeaway:** Finite is a complete planning product, not a tool-call demo.

Proof to show:

- The public release covers creating, editing, activating, managing, changing,
  completing and learning from a plan.
- One planning model produces genuinely different travel, renovation, event,
  interview, practice and general planning surfaces.
- The updated plan persists through reload and safely returns the same result
  when the accepted action is repeated.
- D1 stores plan history and R2 stores files and evidence.
- The release passes 373 tests and 20 repeated Spotlight transaction runs.

## Concrete proof story

The public Spotlight begins with an 18-day trip. International flights are
fixed and at least A$500 must remain spare. The person asks to add three Paris
nights.

Finite checks 26 connected combinations across dates, accommodation, transport,
commitments and budget. Eighteen fit the current constraints, eight do not, and
five meaningfully different directions remain. Five is the result for this
plan, not a fixed menu.

The person chooses **Protect breathing room**. Paris grows from four nights to
seven, the trip becomes 21 days, the flights remain fixed and A$910 remains
spare. The live plan moves from revision 1 to revision 2 once, retains a full
before-and-after receipt and survives reload.

## Potential impact

The audience is anyone still responsible for an outcome after the first plan
stops being correct. That includes travellers with fixed bookings, households
coordinating trades, event producers balancing capacity and suppliers, people
preparing for interviews and teams managing other connected work.

Finite reduces the manual coordination between chats, spreadsheets and task
lists. The same approach can help wherever dates, money, dependencies, evidence
and trade-offs need to move together.

Do not claim measured adoption or time savings. No external user cohort has
been completed yet.

## Creative idea

The restaurant model explains the product clearly. The person is the diner,
Codex is the chef, and Finite is the kitchen and service system. The diner
describes what they want and judges what comes back. The chef does the work.
WebMCP lets the chef use the kitchen.

This metaphor is implemented in the product. Codex supplies reasoning and
orchestration. Finite supplies connected state, calculations, constraints and
persistence. The visible product is where the person and Codex compare and
refine the plan together.

## Claim and evidence matrix

| Public claim | Evidence | Best surface |
|---|---|---|
| 26 combinations, 18 fit, 8 do not, five distinct directions | Production Spotlight receipt and kernel tests | Video + gallery image 4 |
| The result count adapts to the situation | Search implementation and test coverage | Story + README |
| One update, safe repeat | Revision 1 to 2 receipt retained after repeat and reload | Video + gallery image 5 |
| The person and Codex use the same live plan | Public WebMCP exchange and page tool registry | Video + gallery image 3 |
| Three calls to the first useful action, no failures | Accepted effort receipt | Devpost + README |
| 373 tests and 20 repeated transaction runs | Repository test gate and v245 acceptance | README + repository |
| Multiple plan types use one adaptable system | Live product templates and adaptive compiler | Video montage + README |
| No credentials required | Browser-local Spotlight and public Site | Testing instructions |
| Built during the submission period | First commit `1b03f6e`, 2026-08-26 09:30 AEST | Provenance file |

## Claims to avoid

- Do not say Finite booked, bought, paid, contacted, cancelled or verified
  something unless the product has evidence of that completed action.
- Do not say an external user study was completed.
- Do not imply that a workable direction is universally correct. It fits the
  current plan and its recorded constraints; the person still judges the choice.
- Do not say v238 was a release. It was a rejected intermediate build.
- The public repository and MIT licence are verified. Do not claim a public
  final video exists until it has been uploaded and checked.
