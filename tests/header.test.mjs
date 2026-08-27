import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
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
});

test("the header plan dropdown uses the durable catalog and guarded switch path", () => {
  assert.equal(source.match(/renderPlanSwitcher\("(?:arrival|plan)"\)/g)?.length, 2);
  assert.match(source, /runtime\.listPlans\(\)\.plans/);
  assert.match(source, /data-action="plan-switch" aria-label="Open a Finite plan"/);
  assert.match(source, /optgroup label="Current plans"/);
  assert.match(source, /optgroup label="Earlier versions"/);
  assert.match(source, /runtime\.switchPlanPersisted\(planId, \{ expectedCurrentPlanId:/);
  assert.match(source, /target\.searchParams\.set\("kitchen", "1"\)/);
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
  assert.match(source, /forceArrivalSurface = !isWaitingArrivalStatus/);
  assert.match(source, /Sign in to publish a view\./);
  assert.match(source, /Live view/);
  assert.match(source, /Frozen snapshot/);
  assert.match(source, /Preview exact page/);
  assert.match(source, /Publish this page/);
  assert.match(source, /Never included/);
  assert.match(source, /No kitchen access · no editing · no approval controls/);
  assert.match(shell, /!location\.pathname\.startsWith\("\/share\/"\)/);
  assert.match(styles, /\.publication-page/);
});
