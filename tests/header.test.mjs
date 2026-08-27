import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

test("the product header contains actions instead of unexplained internal state", () => {
  for (const obsoleteLabel of ["Arrival / a new finite plan", "Codex browser present", "Saved kitchen", "Local kitchen"]) {
    assert.doesNotMatch(source, new RegExp(obsoleteLabel));
  }
  assert.equal(source.match(/class="header-actions"/g)?.length, 2);
  assert.match(source, /class="header-action" data-action="open-theme-settings">Appearance<\/button>/);
  assert.match(source, /<details class="account-menu">/);
});

test("every product surface uses the accepted reroute-f identity", () => {
  assert.match(source, /const renderBrand = \(\): string =>/);
  assert.match(source, /src="\/finite-mark\.svg"/);
  assert.equal(source.match(/\$\{renderBrand\(\)\}/g)?.length, 3);
  assert.doesNotMatch(source, /<span>finite<\/span><i><\/i>/);
  assert.match(styles, /\.brand img/);
  assert.doesNotMatch(styles, /\.brand i\s*\{/);
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
