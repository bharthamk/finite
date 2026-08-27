import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const webmcp = readFileSync(new URL("../src/webmcp.ts", import.meta.url), "utf8");
const handoffSource = readFileSync(new URL("../src/codex-handoff.ts", import.meta.url), "utf8");
const consumerServerCopy = ["auth", "skins", "themes"].map((name) => readFileSync(new URL(`../worker/${name}.ts`, import.meta.url), "utf8")).join("\n");
const shell = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const identityNotes = readFileSync(new URL("../design/identity/README.md", import.meta.url), "utf8");
const wordmark = readFileSync(new URL("../public/finite-wordmark.png", import.meta.url));
const mark = readFileSync(new URL("../public/finite-mark.png", import.meta.url));

test("the product header contains actions instead of unexplained internal state", () => {
  for (const obsoleteLabel of ["Arrival / a new finite plan", "Codex browser present", "Saved kitchen", "Local kitchen"]) {
    assert.doesNotMatch(source, new RegExp(obsoleteLabel));
  }
  assert.equal(source.match(/class="header-actions"/g)?.length, 3);
  assert.match(source, /class="header-action" data-action="open-theme-settings">Appearance<\/button>/);
  assert.match(source, /<details class="account-menu">/);
  assert.doesNotMatch(source, /class="account-menu__name"/);
  assert.doesNotMatch(styles, /\.account-menu__name/);
  assert.match(source, /<p><span>Signed in as<\/span><strong>\$\{escapeHtml\(accountName\)\}<\/strong><\/p>/);
  assert.match(styles, /grid-template-columns:auto minmax\(210px,340px\) auto minmax\(0,1fr\)/);
  assert.match(styles, /@media \(max-width:1180px\) and \(min-width:981px\)/);
});

test("private product surfaces show the plan lifecycle without pretending it is percentage complete", () => {
  for (const label of ["Starting", "Planning", "Managing", "Wrapping up"]) assert.match(source, new RegExp(`label: "${label}"`));
  assert.match(source, /aria-label="Plan lifecycle"/);
  assert.match(source, /aria-current="step"/);
  assert.equal(source.match(/\$\{renderLifecycleRail\(/g)?.length, 2);
  assert.match(source, /renderLifecycleRail\(order \? "planning" : "starting"\)/);
  assert.match(source, /status === "completed" \|\| status === "abandoned" \? "wrapping" : "managing"/);
  assert.match(source, /detail: "Day-to-day use"/);
  assert.match(source, /stage\.id === "managing" \? " · core"/);
  assert.doesNotMatch(source, /plan-lifecycle[^\n]*(?:percent|%)/i);
  assert.match(styles, /\.private-top-shell \{ position:sticky; top:0;/);
  assert.match(styles, /\.plan-lifecycle ol \{[^}]*grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(styles, /\.plan-lifecycle__step\.is-current/);
  assert.match(styles, /\.plan-lifecycle__step\.is-complete/);
  assert.match(styles, /\.plan-lifecycle__step\.is-core/);
});

test("every product surface uses the accepted ImageGen identity source", () => {
  assert.match(source, /const renderBrand = \(\): string =>/);
  assert.match(source, /src="\/finite-wordmark\.png"/);
  assert.equal(source.match(/\$\{renderBrand\(\)\}/g)?.length, 6);
  assert.doesNotMatch(source, /<span>finite<\/span><i><\/i>/);
  assert.match(styles, /\.brand img/);
  assert.doesNotMatch(styles, /\.brand i\s*\{/);
  assert.match(identityNotes, /exact ImageGen concept accepted by Benji/);
  assert.match(identityNotes, /does not redraw or reinterpret the logo/);
  assert.ok(wordmark.byteLength > 4_000);
  assert.ok(mark.byteLength > 4_000);
  assert.match(shell, /href="\/finite-mark\.png" type="image\/png"/);
});

test("account and destructive actions live in a labelled account menu", () => {
  assert.match(source, /aria-label="Open account menu for/);
  assert.match(source, /<span>Signed in as<\/span>/);
  assert.match(source, /data-action="open-kitchen-reset">Start over<\/button>/);
  assert.match(source, /href="\/signout-with-chatgpt\?return_to=\/">Sign out<\/a>/);
  assert.match(source, /<details class="account-menu__how">/);
  assert.match(source, /<summary>How Finite works<\/summary>/);
  assert.match(source, /Think of Finite as the kitchen behind your plan/);
  assert.match(source, /<a href="\$\{escapeHtml\(settingsPath\)\}">Settings<\/a>/);
});

test("the header plan dropdown creates and opens plans from both product surfaces", () => {
  assert.equal(source.match(/renderPlanSwitcher\("(?:arrival|plan)"(?:, manifest\.title)?\)/g)?.length, 2);
  assert.match(source, /runtime\.listPlans\(\)\.plans/);
  assert.match(source, /data-action="plan-switch" aria-label="Open a Finite plan"/);
  assert.match(source, /<option value="\$\{newPlanChoice\}">＋ Create a new plan…<\/option>/);
  assert.match(source, /optgroup label="Current plans"/);
  assert.match(source, /optgroup label="Earlier versions"/);
  assert.match(source, /if \(planId === newPlanChoice\) \{ void startNewPlan\(\); return; \}/);
  assert.equal(source.match(/bindPlanSwitcherInteractions\(\);/g)?.length, 2);
  assert.match(source, /newPlanDraftMode = true;\s*forceArrivalSurface = true;/);
  assert.match(source, /const currentArrival = \(\): ArrivalOrder \| null => !newPlanDraftMode/);
  assert.match(source, /const openPlan = async \(planId: string\): Promise<void> => \{\s*if \(!planId \|\| busy\) return;\s*newPlanDraftMode = false;\s*forceArrivalSurface = false;/);
  assert.match(source, /runtime\.switchPlanPersisted\(planId, \{ expectedCurrentPlanId:/);
  assert.match(source, /target\.searchParams\.set\("plan", "1"\)/);
  assert.match(source, /target\.searchParams\.delete\("kitchen"\)/);
  assert.doesNotMatch(source, /aria-label="Demonstration plan"/);
});

test("plan sharing publishes a selected plate without registering a kitchen on the shared route", () => {
  assert.equal(source.match(/data-action="open-plan-share"/g)?.length, 1);
  assert.match(source, /renderShareHeaderAction\("arrival"\)/);
  assert.match(source, /renderShareHeaderAction\("plan"\)/);
  assert.equal(source.match(/\$\{renderPlanShareDialog\(\)\}/g)?.length, 2);
  assert.match(source, /function bindArrivalInteractions\(\): void \{\s*bindCodexHandoffInteractions\(\);\s*bindPlanShareInteractions\(\);/);
  assert.match(styles, /html \.header-action--share/);
  assert.match(styles, /\.site-header>\.header-action--share \{ grid-column:3; grid-row:2; \}/);
  assert.match(styles, /@media \(max-width:460px\)/);
  assert.match(source, /Which plan do you want to share\?/);
  assert.match(source, /There isn’t a plan to share yet\./);
  assert.match(source, /data-share-plan-choice/);
  assert.match(source, /data-action="start-plan-from-share">Start a new plan<\/button>/);
  assert.match(source, /Sign in to publish a view\./);
  assert.match(source, /Live view/);
  assert.match(source, /Frozen snapshot/);
  assert.match(source, /data-share-intent="preview"[^>]*>Update preview/);
  assert.match(source, /Publish this page/);
  assert.match(source, /class="plan-share-workspace"/);
  assert.match(source, /This is all they can see\./);
  assert.match(source, /Choices changed — update the preview\./);
  assert.match(source, /shareForm\?\.addEventListener\("change", refreshShareDraftState\)/);
  assert.match(styles, /\.plan-share-workspace \{ display:grid; grid-template-columns:/);
  assert.match(styles, /\.plan-share-preview \{ position:sticky;/);
  assert.match(source, /Stays private/);
  assert.match(source, /No editing · no approval controls · no access to the full plan/);
  assert.match(shell, /!location\.pathname\.startsWith\("\/share\/"\)/);
  assert.match(styles, /\.publication-page/);
});

test("consumer copy uses plan language outside explicit how-it-works explanations", () => {
  for (const phrase of [
    "Only this leaves the kitchen.", "Same kitchen. Same saved starting point.",
    "Keep my kitchen", "Codex operates the kitchen", "What wasn’t right about this kitchen?",
    "New finite kitchen", "This plate is no longer on the pass.", "Demo kitchen",
  ]) assert.doesNotMatch(source, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  assert.doesNotMatch(handoffSource, /Bring Codex into the kitchen\.|points to the kitchen and the correct first tool/);
  assert.doesNotMatch(consumerServerCopy, /available in (?:this|a signed-in) kitchen|resetting a kitchen|clear this Finite kitchen/i);
  assert.match(source, /This is all they can see\./);
  assert.match(source, /Same plan\. Same saved starting point\./);
  assert.match(source, /\$\{escapeHtml\(agenticName\(\)\)\} works through the plan\./);
});

test("arrival shows the complete human starting point without protocol language or overlay-prone disclosure sizing", () => {
  for (const field of ["What needs to happen", "When", "What is limited", "Must not change", "Useful reference"]) {
    assert.match(source, new RegExp(field));
  }
  assert.match(source, /order\.structured\.deadline/);
  assert.match(source, /order\.structured\.finiteLimit/);
  assert.match(source, /order\.structured\.hardConstraint/);
  assert.match(source, /order\.attachments\.flatMap/);
  assert.match(source, /See everything you originally shared/);
  for (const phrase of [
    "Original request · version", "New facts create a fresh version", "New facts are append-only",
    "invalidates stale staging", "checkpointed your latest update", "Request v", "Request · version",
    "Codex interpretation / not human fact", "planning grammar", "invalidate this proposal automatically",
  ]) assert.doesNotMatch(source, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  assert.match(styles, /\.arrival-order-source \{[^}]*margin-top:16px/);
  assert.doesNotMatch(styles, /\.arrival-order-source summary \{[^}]*min-height:100%/);
  assert.match(styles, /\.arrival-order-source__content p \{[^}]*overflow-wrap:anywhere/);
});

test("arrival prioritizes the next action and keeps secondary review tools side by side", () => {
  assert.match(source, /class="arrival-primary-action" aria-label="What happens next"/);
  assert.match(source, /Next step \/ answer one question/);
  assert.match(source, /Next step \/ review your brief/);
  assert.match(source, /order\.status === "interpretation_confirmed" && !planDraftMarkup/);
  assert.match(source, /Brief confirmed\. Use \$\{escapeHtml\(agenticName\(\)\)\} to continue\./);
  assert.match(source, /data-action="open-codex-handoff" aria-haspopup="dialog">Use \$\{escapeHtml\(agenticName\(\)\)\} to continue/);
  assert.doesNotMatch(source, /Brief confirmed\. Codex may construct a plan/);
  assert.doesNotMatch(source, /Nothing is activated until you approve the exact plan/);
  assert.doesNotMatch(source, /class="codex-handoff-boundary"/);
  assert.doesNotMatch(source, /<dt>Finite site<\/dt>|<dt>Your plan<\/dt>|<dt>Copied<\/dt>|<dt>Stays private<\/dt>/);
  assert.doesNotMatch(handoffSource, /display name you chose in Finite/);
  assert.match(source, /!question && order\.status !== "proposed_plan_ready" && order\.status !== "interpretation_confirmed" && !planDraftMarkup/);
  assert.match(source, /<\/section>\s*\$\{message[^]*?<details class="arrival-order-source">/);
  assert.match(source, /<div class="arrival-working-grid">\s*\$\{interpretation \? `<details class="arrival-interpretation">/);
  assert.match(source, /<details class="arrival-continuity">/);
  assert.match(styles, /\.arrival-working-grid \{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(styles, /@media \(max-width:980px\) \{[^]*\.arrival-compose,\.arrival-working-grid,\.arrival-continuity__body,\.arrival-handoff,\.arrival-continue,\.settings-section \{ grid-template-columns:1fr; \}/);
});

test("settings provides a durable Agentic name preference with Codex as the honest default", () => {
  assert.match(source, /params\.get\("settings"\) === "1"/);
  assert.match(source, /<p class="eyebrow">Agentic name<\/p>/);
  assert.match(source, /What should Finite call your agent\?/);
  assert.match(source, /The default is Codex\./);
  assert.match(source, /name="agenticName" type="text" required maxlength="40"/);
  assert.match(source, /It does not change the underlying agent, model, permissions, or approval boundaries\./);
  assert.match(source, /data-action="reset-agentic-name"/);
  assert.match(styles, /\.settings-main/);
  assert.match(styles, /\.agentic-name-form/);
});

test("human writing fields use the browser language for native spellcheck while control text opts out", () => {
  assert.match(shell, /<html lang="en">/);
  assert.match(shell, /<div id="app" aria-busy="true" spellcheck="true"><\/div>/);
  assert.match(source, /navigator\.languages\.find\(\(language\) => language\.trim\(\)\) \?\? navigator\.language \?\? "en"/);
  assert.match(source, /field\.spellcheck = true; field\.lang = browserWritingLanguage;/);
  assert.equal(source.match(/enableNativeWritingAssistance\(\);/g)?.length, 3);
  assert.match(source, /<textarea readonly spellcheck="false" data-codex-handoff-prompt>/);
  assert.match(source, /name="confirmation" required autocomplete="off" spellcheck="false"/);
});

test("Follow Codex is a human-controlled top-bar permission with bounded accessible spotlights", () => {
  assert.equal(source.match(/\$\{renderFollowCodexButton\(\)\}/g)?.length, 2);
  assert.match(source, /data-action="toggle-follow-codex" aria-pressed="\$\{followCodexEnabled\}"/);
  assert.match(source, /scopedStorage\.getItem\("finite-plan\.follow-codex"\) === "true"/);
  assert.match(source, /FOLLOW_CODEX_DISABLED/);
  assert.match(source, /request\.surface !== "current"/);
  assert.match(source, /target\.searchParams\.set\("plan", "1"\)/);
  assert.match(source, /const guideTargetSelectors: Record<FiniteGuideTarget/);
  assert.match(source, /element\.scrollIntoView\(\{ behavior: "smooth", block: "center" \}\)/);
  assert.match(source, /\$\{agenticName\(\)\} is showing \$\{descriptor\.label\}/);
  assert.match(styles, /\[data-codex-spotlight="true"\]/);
  assert.match(styles, /@media \(prefers-reduced-motion:reduce\)/);
  assert.match(styles, /\.follow-codex-toggle\[aria-pressed="true"\]/);
});

test("pending plan review leads with the actual plan and hides internal proof language", () => {
  assert.match(source, /Your plan is ready/);
  assert.match(source, /draft-review__summary/);
  assert.match(source, /The plan/);
  assert.match(source, /What happens next/);
  assert.match(source, /What it protects/);
  assert.match(source, /Things you can decide later/);
  assert.match(source, /surface\.stages\.map/);
  assert.match(source, /Approve this plan/);
  for (const phrase of [
    "Profile proof", "Draft proof", "Packet proof", "New Finite plan",
    "operating profile", "Confirming authorizes only this exact packet",
  ]) assert.doesNotMatch(source, new RegExp(phrase, "i"));
  assert.match(styles, /\.draft-review__stages/);
  assert.match(styles, /\.draft-review__summary/);
});

test("approving a pending plan activates it and enters Managing in the same human action", () => {
  assert.match(source, /const confirmPlanDraft = async/);
  assert.match(source, /runtime\.humanConfirmPlanDraft\(\{ draftId \}\)/);
  assert.match(source, /runtime\.activateConfirmedPlanDraft\(\{/);
  assert.match(source, /const latestArrival = await arrivalRepository\.open\(\);/);
  assert.match(source, /draft\.sourceArrival && !latestArrival\.ok/);
  assert.match(source, /idempotencyKey: `human-plan-activation:\$\{draftId\}:\$\{confirmation\.confirmationId\}`/);
  assert.match(source, /arrivalRepository\.acceptPlan\(\{/);
  assert.match(source, /target\.searchParams\.set\("plan", "1"\)/);
  assert.match(source, /announcer\.textContent = "Plan approved\. Managing is ready\."/);
  assert.match(source, /Starting your plan…/);
  assert.match(source, /Continue to Managing/);
  assert.doesNotMatch(source, /Plan approved and ready\. You are now in Managing\./);
  assert.doesNotMatch(source, /Plan approved\. \$\{escapeHtml\(agenticName\(\)\)\} can now put it into action\./);
  assert.doesNotMatch(source, /Exact plan draft confirmed\. Codex may now activate it/);
});

test("Managing starts with one brief and prioritises the next step", () => {
  assert.match(source, /<p class="eyebrow">Current plan \$\{pendingBadge\("general"\)\}<\/p>/);
  assert.match(source, /<section class="managing-next"/);
  assert.match(source, /<p class="eyebrow">Up next \$\{pendingBadge\("timeline", next\.stageId\)\}<\/p>/);
  assert.match(source, /visibleManagingZones\(manifest\)/);
  assert.match(source, /hiddenDuplicates.*pressure_meter.*entity_table.*commitment_stack/);
  assert.match(source, /<div class="plan-detail-grid">/);
  assert.match(source, /data-action="open-plan-facts"/);
  assert.match(source, /editablePlanFacts\(runtime\.kernel\.profile/);
  assert.match(source, /kernel\.lifecycleStatus === "active" \? "" : `<div class="plan-status-strip/);
  assert.doesNotMatch(source, /<div class="brief-card">/);
  assert.doesNotMatch(source, /<aside class="plan-orbit"/);
  assert.doesNotMatch(source, /<span>You asked for<\/span>/);
  assert.match(styles, /\.hero \{ padding:38px 0 34px;/);
  assert.doesNotMatch(styles, /\.hero-summary \{/);
  assert.match(styles, /\.managing-next \{/);
  assert.doesNotMatch(styles, /\.orbit-ring \{/);
});

test("ordinary plan views never invent demo disruptions", () => {
  assert.match(source, /if \(labMode\) await seedDecision\(\);/);
  assert.doesNotMatch(source, /labMode \|\| new URLSearchParams\(location\.search\)\.get\("plan"\)/);
  assert.doesNotMatch(source, /if \(result\.code === "PLAN_SWITCHED"\) \{\s*await adapter\?\.refreshContextualTools\(\);\s*await seedDecision\(\);/);
});

test("Managing accepts general and section-specific decisions from both the page and Codex", () => {
  assert.match(source, />\+ Add or change<\/button>/);
  assert.match(source, /data-plan-input-section="timeline"/);
  assert.match(source, /zone\.component === "finite_summary" \? "money"/);
  assert.match(source, /zone\.component === "constraint_panel" \? "boundaries"/);
  assert.match(source, /<dialog class="plan-input-dialog"/);
  assert.match(source, />\$\{planInputBusy \? "Saving…" : "Save to plan"\}<\/button>/);
  assert.match(source, /Ask \$\{escapeHtml\(agenticName\(\)\)\} to update/);
  assert.match(source, /pending-badge/);
  assert.doesNotMatch(source, /Put it where it belongs/);
  assert.doesNotMatch(source, /It does not silently rewrite the approved plan/);
  assert.match(source, /planInputRepository\.add\(/);
  assert.match(source, /planInputRepository\.update\(/);
  assert.match(source, /planInputRepository\.resolve\(/);
  assert.match(webmcp, /finite_list_plan_inputs/);
  assert.match(webmcp, /finite_add_plan_input/);
  assert.match(webmcp, /finite_update_plan_input/);
  assert.match(webmcp, /finite_resolve_plan_input/);
  assert.match(styles, /main \{[^}]*scroll-margin-top:132px/);
});
