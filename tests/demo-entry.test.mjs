import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { bindDemoEntry, demoExplorePath, renderDemoEntryCard, renderDemoEntryPicker } from "../dist-test/src/demo-entry.js";
import { shouldBootstrapLocalDemo } from "../dist-test/src/experience-route.js";

test("both home screens use the same two-choice demo copy and navigation", async () => {
  const publicCard = renderDemoEntryCard("public");
  const workspaceCard = renderDemoEntryCard("workspace");
  assert.equal(publicCard.replace('data-public-entry="live-demo"', 'data-entry-action="live-demo"'), workspaceCard);
  assert.match(publicCard, /04 \/ Demo mode/);
  assert.match(publicCard, /Try Finite/);
  const picker = renderDemoEntryPicker();
  assert.match(picker, /Explore myself/);
  assert.match(picker, /Guide me with Codex/);
  assert.match(picker, /No sign-in or Codex needed/);
  assert.match(picker, /sharing and uploads are unavailable/);
  assert.match(picker, /<details class="demo-entry-guided">/);
  for (const depth of ["spotlight", "basics", "standard", "complete"]) {
    assert.match(picker, new RegExp(`href="/\\?start=live-demo&tour=${depth}`));
  }
  for (const file of ["main.ts", "public-gate.ts"]) {
    const source = await readFile(new URL(`../src/${file}`, import.meta.url), "utf8");
    assert.match(source, /renderDemoEntryCard\(/);
    assert.match(source, /renderDemoEntryPicker\(\)/);
    assert.match(source, /bindDemoEntry\(root\)/);
  }
});

test("self-guided demo enters the local product directly without a Codex handoff or account", async () => {
  const url = new URL(demoExplorePath, "https://finite.example");
  assert.equal(url.searchParams.get("start"), "explore-demo");
  assert.equal(url.searchParams.get("plan"), "1");
  assert.equal(url.searchParams.get("fresh"), "1");
  assert.equal(url.searchParams.has("tour"), false);
  assert.equal(shouldBootstrapLocalDemo({ pathname: "/", startMode: "explore-demo", collaborationToken: null, localDemoResume: false }), true);
  const source = await readFile(new URL("../src/main.ts", import.meta.url), "utf8");
  assert.match(source, /startupStartMode === "explore-demo"\) && startupQuery.get\("fresh"\) === "1"/);
  assert.match(source, /const localDemoMode = guidedDemoLocalMode \|\| startupStartMode === "explore-demo"/);
  const playback = source.match(/let demoPlaybackMode = ([^;]+);/)[1];
  assert.doesNotMatch(playback, /explore-demo/);
});

test("demo choice disclosure opens and closes with keyboard focus preserved", () => {
  const makeControl = () => ({ events: {}, attrs: {}, focused: false, addEventListener(name, fn) { this.events[name] = fn; }, setAttribute(name, value) { this.attrs[name] = value; }, focus() { this.focused = true; } });
  const opener = makeControl(), closer = makeControl(), explore = makeControl();
  const picker = { hidden: true, querySelector(selector) { return selector === "[data-demo-explore]" ? explore : closer; } };
  bindDemoEntry({ querySelector(selector) { return selector === "[data-demo-entry-open]" ? opener : picker; } });
  opener.events.click();
  assert.equal(picker.hidden, false);
  assert.equal(opener.attrs["aria-expanded"], "true");
  assert.equal(explore.focused, true);
  closer.events.click();
  assert.equal(picker.hidden, true);
  assert.equal(opener.attrs["aria-expanded"], "false");
  assert.equal(opener.focused, true);
});
