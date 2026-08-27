import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
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
  assert.equal(source.match(/class="header-actions"/g)?.length, 2);
  assert.match(source, /class="header-action" data-action="open-theme-settings">Appearance<\/button>/);
  assert.match(source, /<details class="account-menu">/);
});

test("every product surface uses the accepted ImageGen identity source", () => {
  assert.match(source, /const renderBrand = \(\): string =>/);
  assert.match(source, /src="\/finite-wordmark\.png"/);
  assert.equal(source.match(/\$\{renderBrand\(\)\}/g)?.length, 5);
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
});

test("the header plan dropdown creates and opens plans from both product surfaces", () => {
  assert.equal(source.match(/renderPlanSwitcher\("(?:arrival|plan)"\)/g)?.length, 2);
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
  assert.match(source, /Preview exact page/);
  assert.match(source, /Publish this page/);
  assert.match(source, /Never included/);
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
  assert.match(source, /Only this page will be shared\./);
  assert.match(source, /Same plan\. Same saved starting point\./);
  assert.match(source, /Codex works through the plan\./);
});
