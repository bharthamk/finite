import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const webmcp = readFileSync(new URL("../src/webmcp.ts", import.meta.url), "utf8");
const runtimeSource = readFileSync(new URL("../src/runtime.ts", import.meta.url), "utf8");
const handoffSource = readFileSync(new URL("../src/codex-handoff.ts", import.meta.url), "utf8");
const consumerServerCopy = ["auth", "skins", "themes"].map((name) => readFileSync(new URL(`../worker/${name}.ts`, import.meta.url), "utf8")).join("\n");
const shell = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const bootstrap = readFileSync(new URL("../src/webmcp-bootstrap.ts", import.meta.url), "utf8");
const entry = readFileSync(new URL("../src/entry.ts", import.meta.url), "utf8");
const publicGate = readFileSync(new URL("../src/public-gate.ts", import.meta.url), "utf8");
const shareEntry = readFileSync(new URL("../src/share-entry.ts", import.meta.url), "utf8");
const viteConfig = readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");
const packageSource = readFileSync(new URL("../package.json", import.meta.url), "utf8");
const chunkBudget = readFileSync(new URL("../scripts/check-client-chunks.mjs", import.meta.url), "utf8");
const identityNotes = readFileSync(new URL("../design/identity/README.md", import.meta.url), "utf8");
const wordmark = readFileSync(new URL("../public/finite-wordmark.png", import.meta.url));
const mark = readFileSync(new URL("../public/finite-mark.png", import.meta.url));

test("the production client has intentional chunks and a hard regression budget", () => {
  for (const chunk of ["finite-arrival", "finite-services", "finite-operator"]) assert.match(viteConfig, new RegExp(chunk));
  assert.match(viteConfig, /manualChunks: finiteClientChunk/);
  assert.match(packageSource, /node scripts\/check-client-chunks\.mjs/);
  assert.match(chunkBudget, /const maximumBytes = 500_000/);
  assert.match(chunkBudget, /Production client chunk budget exceeded/);
});

test("public bootstrap routes do not preload the authenticated operator surface", () => {
  assert.match(entry, /if \(auth\.session\) \{[\s\S]*await import\("\.\/main\.js"\)/);
  assert.match(entry, /await import\("\.\/share-entry\.js"\)/);
  assert.match(entry, /await import\("\.\/public-gate\.js"\)/);
  assert.doesNotMatch(shell, /<script>(?![\s\S]*type="module")/);
  assert.match(source, /const labMode = import\.meta\.env\.DEV &&/);
  assert.match(viteConfig, /name: "finite-release-contract"/);
  assert.match(viteConfig, /transformIndexHtml/);
  assert.match(viteConfig, /content="\$\{finiteRelease\.build\}"/);
  assert.doesNotMatch(viteConfig, /fileName: "_headers"/);
});

test("the signed-out first page is the four-route Finite gateway", () => {
  assert.match(publicGate, /How do you want to begin\?/);
  assert.match(publicGate, /data-public-entry="fresh"/);
  assert.match(publicGate, /data-public-example=/);
  assert.match(publicGate, /data-public-entry="codex-live"/);
  assert.match(publicGate, /data-public-entry="live-demo"/);
  assert.match(publicGate, /return_to/);
  assert.match(publicGate, /\/?start=codex-live/);
  assert.match(publicGate, /\/?start=live-demo/);
  assert.match(publicGate, /\/?start=example&example=/);
  assert.match(publicGate, /isolated 24-hour workspace/);
  assert.match(publicGate, /Choose a template\./);
  assert.match(publicGate, /Use Codex live/);
  assert.match(publicGate, /Watch live demo/);
  assert.doesNotMatch(publicGate, /Borrow a useful beginning/);
  assert.doesNotMatch(publicGate, /Continue with ChatGPT|Try the demo/);
});

test("blocked option cards never claim that no compromise is required", () => {
  assert.match(source, /candidateTradeoffLines\(candidate\)/);
  assert.doesNotMatch(source, /No additional compromise required/);
});

test("the product header contains actions instead of unexplained internal state", () => {
  for (const obsoleteLabel of ["Arrival / a new finite plan", "Codex browser present", "Saved kitchen", "Local kitchen"]) {
    assert.doesNotMatch(source, new RegExp(obsoleteLabel));
  }
  assert.equal(source.match(/class="header-actions"/g)?.length, 6);
  assert.match(source, /class="header-action" data-action="open-theme-settings">Appearance<\/button>/);
  assert.match(source, /<details class="account-menu">/);
  assert.doesNotMatch(source, /class="account-menu__name"/);
  assert.doesNotMatch(styles, /\.account-menu__name/);
  assert.match(source, /<p><span>Signed in as<\/span><strong>\$\{escapeHtml\(accountName\)\}<\/strong><\/p>/);
  assert.match(styles, /grid-template-columns:auto minmax\(210px,340px\) auto minmax\(0,1fr\)/);
});

test("cold navigation shows a useful loading state instead of an empty page", () => {
  assert.match(shell, /class="app-loading" role="status" aria-label="Opening Finite"/);
  assert.match(shell, /Finite is opening/);
  assert.match(shell, /data-loading-status>Checking your saved plans…/);
  assert.match(shell, /Your plan stays saved while this loads\./);
  assert.match(source, /updateOpeningStatus\("Loading your saved plans…"\)/);
  assert.match(source, /updateOpeningStatus\("Preparing your workspace…"\)/);
  assert.match(source, /updateOpeningStatus\("Opening your workspace…"\)/);
  assert.match(source, /const \[remoteCatalog, loadedSettings, loadedThemes, loadedSkins, openedArrival\] = await Promise\.all/);
  assert.match(source, /const opensFreshArrival = !arrivalResult\.order/);
  assert.match(source, /if \(!opensFreshArrival && !opensProfileSurface\) await hydrateCanonicalRuntime\(\)/);
  assert.match(source, /const \[, construction\] = await Promise\.all\(\[\s*runtime\.hydrateAcceptedTruth\(\),\s*runtime\.hydrateConstructionPacket\(\),\s*\]\)/);
  assert.match(source, /CONSTRUCTION_PACKET_REMOTE_HYDRATED[\s\S]{0,120}runtime\.resumeConstructionPacket\(\)/);
  assert.match(source, /if \(opensFreshArrival\) void hydrateCanonicalRuntime\(\)/);
  assert.match(source, /const initialSecondaryPlanData = startupSurface === "plan"/);
  assert.match(source, /refreshSecondaryPlanData\(\)\.finally\(\(\) => \{ secondaryPlanDataReady = true; \}\)/);
  assert.match(source, /if \(startupSurface === "arrival"\) \{[\s\S]{0,180}refreshSecondaryPlanData\(\), refreshProfileContext\(\)/);
  assert.match(source, /initialSecondaryPlanData\.then\(async \(\) =>/);
  assert.match(source, /if \(opensProfileSurface\) \{[\s\S]{0,140}refreshProfileContext\(\)\.then\(\(\) => render\(\)\)/);
  assert.match(styles, /\.app-loading \{ min-height:100vh;/);
  assert.match(styles, /\.app-loading__panel/);
  assert.match(styles, /@media \(prefers-reduced-motion:reduce\) \{ \.app-loading__progress i/);
});

test("private product surfaces show the plan lifecycle without pretending it is percentage complete", () => {
  for (const label of ["Starting", "Planning", "Managing", "Finished"]) assert.match(source, new RegExp(`label: "${label}"`));
  assert.match(source, /aria-label="Plan lifecycle"/);
  assert.match(source, /aria-current="step"/);
  assert.equal(source.match(/\$\{renderLifecycleRail\(/g)?.length, 4);
  assert.match(source, /renderLifecycleRail\(order \? "planning" : "starting"\)/);
  assert.match(source, /status === "completed" \|\| status === "abandoned" \? "wrapping" : "managing"/);
  assert.match(source, /detail: "Day-to-day use"/);
  assert.match(source, /state === "current" \? "Current · " : ""/);
  assert.doesNotMatch(source, / · core/);
  assert.doesNotMatch(source, /plan-lifecycle[^\n]*(?:percent|%)/i);
  assert.match(styles, /\.private-top-shell \{ position:sticky; top:0;/);
  assert.match(styles, /\.plan-lifecycle ol \{[^}]*grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(styles, /\.plan-lifecycle__step\.is-current/);
  assert.match(styles, /\.plan-lifecycle__step\.is-complete/);
  assert.doesNotMatch(styles, /\.plan-lifecycle__step\.is-core/);
});

test("every product surface uses the accepted ImageGen identity source", () => {
  assert.match(source, /const renderBrand = \(\): string =>/);
  assert.match(source, /src="\/finite-wordmark\.png"/);
  assert.equal(source.match(/\$\{renderBrand\(\)\}/g)?.length, 12);
  assert.doesNotMatch(source, /<span>finite<\/span><i><\/i>/);
  assert.match(styles, /\.brand img/);
  assert.doesNotMatch(styles, /\.brand i\s*\{/);
  assert.match(identityNotes, /exact ImageGen concept accepted by Benji/);
  assert.match(identityNotes, /does not redraw or reinterpret the logo/);
  assert.ok(wordmark.byteLength > 4_000);
  assert.ok(mark.byteLength > 4_000);
  assert.match(shell, /href="\/finite-mark\.png" type="image\/png"/);
});

test("first-use entry offers fresh, template, Codex live, and live-demo routes", () => {
  assert.match(source, /const renderEntryGateway = \(\): void =>/);
  assert.match(source, /How do you want to begin\?/);
  assert.match(source, /data-entry-action="fresh"/);
  assert.match(source, /data-entry-example=/);
  assert.match(source, /data-entry-action="codex-live"/);
  assert.match(source, /data-entry-action="live-demo"/);
  assert.match(source, /How much Finite do you want to see\?/);
  assert.match(source, /data-demo-depth="basics"/);
  assert.match(source, /data-demo-depth="standard"/);
  assert.match(source, /data-demo-depth="complete"/);
  assert.match(source, /Just the basics/);
  assert.match(source, /All the bells &amp; whistles/);
  assert.match(source, /selectedDemoDepth: selected/);
  assert.match(source, /Choose a template\./);
  assert.match(source, /Same real product in every route\./);
  assert.match(source, /codexLaunchMode = codexMode/);
  assert.match(source, /scopedStorage\.setItem\("finite-plan\.follow-codex", "true"\)/);
  assert.match(source, /const renderCodexLaunch = \(\): void =>/);
  assert.match(source, /Copy setup for Codex/);
  assert.match(source, /Loading your live demo…/);
  assert.match(source, /pausing for Next and questions/);
  assert.match(source, /Click Next when you are ready to keep watching, or ask Codex about anything you see/);
  assert.match(source, /Live demo · click Next when this chapter makes sense/);
  assert.match(source, /Paused here · ask Codex anything about this screen/);
  assert.match(source, /data-action="toggle-codex-demo-pause"/);
  assert.match(source, /GUIDE_PAUSED_FOR_QUESTION/);
  assert.match(styles, /\.entry-route-grid/);
  assert.match(styles, /\.entry-route--codex-live/);
  assert.match(styles, /\.entry-route--live-demo/);
  assert.match(styles, /\.entry-demo-picker__options/);
  assert.match(styles, /\.codex-launch/);
});

test("Codex handoff asks where the person wants to watch before operating Finite", () => {
  assert.match(source, /first ask where you want to watch: a controlled browser window or the Codex built-in browser/);
  assert.match(source, /Its first question will be where you want to watch/);
  assert.match(source, /Codex will ask where you want the visible run before it touches Finite/);
});

test("an explicit Codex or demo launch outranks an older waiting arrival", () => {
  assert.match(source, /if \(codexLaunchMode\) \{\s*renderCodexLaunch\(\);/);
  assert.doesNotMatch(source, /if \(codexLaunchMode && !hasWaitingArrival\)/);
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

test("the header plan dropdown creates and opens plans from every private product surface", () => {
  assert.equal(source.match(/renderPlanSwitcher\("(?:arrival|plan)"(?:, manifest\.title)?\)/g)?.length, 4);
  assert.match(source, /runtime\.listPlans\(\)\.plans/);
  assert.match(runtimeSource, /title: resolvePlanTitle\(\{ proposed: profile\.surface\.hero\.title, brief: profile\.surface\.hero\.brief \}\)/);
  assert.match(source, /projectAcceptedPlanCopyFromReceipts\(plan\.title, receipts\)/);
  assert.match(source, /const persistedPlanIds = new Set\(catalogEntries\.map/);
  assert.match(source, /filter\(\(plan\) => persistedPlanIds\.has\(plan\.planId\) \|\| \(surface === "plan" && plan\.active\)\)/);
  assert.match(source, /filter\(\(plan\) => persistedPlanIds\.has\(plan\.planId\)\)/);
  assert.match(source, /persistedPlanIds\.add\(runtime\.kernel\.profile\.planId\)/);
  assert.match(source, /if \(envelope && envelope\.revision > 0\) persistedPlanIds\.add\(plan\.planId\)/);
  assert.match(source, /data-action="plan-switch" aria-label="Open a Finite plan"/);
  assert.match(source, /<option value="\$\{newPlanChoice\}">＋ Create a new plan…<\/option>/);
  assert.match(source, /optgroup label="Current plans"/);
  assert.match(source, /optgroup label="Earlier versions"/);
  assert.match(source, /if \(planId === newPlanChoice\) \{ void startNewPlan\(\); return; \}/);
  assert.equal(source.match(/bindPlanSwitcherInteractions\(\);/g)?.length, 2);
  assert.match(source, /newPlanDraftMode = true;\s*forceArrivalSurface = false;\s*entryGatewayOpen = true;/);
  assert.match(source, /const currentArrival = \(\): ArrivalOrder \| null => !newPlanDraftMode/);
  assert.match(source, /const openPlan = async \(planId: string\): Promise<void> => \{\s*if \(!planId \|\| busy\) return;\s*newPlanDraftMode = false;\s*forceArrivalSurface = false;/);
  assert.match(source, /runtime\.switchPlanPersisted\(planId, \{ expectedCurrentPlanId:/);
  assert.match(source, /Promise\.all\(\[planInputRepository\.list\(\{ planId \}\), planWorkRepository\.list\(planId\)\]\)/);
  assert.match(source, /item\.planId !== planId/);
  assert.match(source, /Your current plan is unchanged\./);
  assert.match(source, /target\.searchParams\.set\("plan", "1"\)/);
  assert.match(source, /target\.searchParams\.delete\("kitchen"\)/);
  assert.doesNotMatch(source, /aria-label="Demonstration plan"/);
});

test("plan sharing publishes a selected plate without registering a kitchen on the shared route", () => {
  assert.equal(source.match(/data-action="open-plan-share"/g)?.length, 2);
  assert.match(source, /renderShareHeaderAction\("arrival"\)/);
  assert.match(source, /renderShareHeaderAction\("plan"\)/);
  assert.equal(source.match(/\$\{renderPlanShareDialog\(\)\}/g)?.length, 3);
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
  assert.match(bootstrap, /!location\.pathname\.startsWith\("\/share\/"\)/);
  assert.match(shell, /src="\/src\/entry\.ts"/);
  assert.match(styles, /\.publication-page/);
  assert.match(shareEntry, /Recent accepted changes/);
  assert.match(shareEntry, /Actual spend/);
  assert.match(shareEntry, /item\.contextLabel/);
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
  assert.match(source, /Build my rough plan/);
  assert.match(source, /Build it myself/);
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

test("arrival offers Codex or manual starts and keeps the rough plan directly editable", () => {
  assert.match(source, /role="tablist" aria-label="How do you want to start\?"/);
  assert.match(source, /data-arrival-start-tab="codex"/);
  assert.match(source, /data-arrival-start-tab="manual"/);
  assert.match(source, /data-arrival-start-panel="manual" hidden/);
  assert.match(source, /name="codexOutcome" required/);
  assert.match(source, /name="manualOutcome" required/);
  assert.match(source, /planningMode === "manual" \? "manualOutcome" : "codexOutcome"/);
  assert.match(source, /const structured = planningMode === "manual"/);
  assert.match(source, /Anything left blank stays open for you to add later\./);
  assert.match(source, /control\.disabled = !selected \|\| busy/);
  assert.match(source, /\["ArrowLeft", "ArrowRight", "Home", "End"\]/);
  assert.match(styles, /\.arrival-start-panel\[hidden\] \{ display:none; \}/);
  assert.match(source, /How do you want to continue\?/);
  assert.match(source, /Continue in \$\{escapeHtml\(agenticName\(\)\)\}/);
  assert.match(source, /Edit manually for now/);
  assert.match(source, /Codex has not processed it\./);
  assert.match(source, /workspaceOperation: "manual_takeover"/);
  assert.match(source, /workspaceOperation: "codex_handoff_workspace"/);
  assert.match(source, /void prepareArrivalPlanDraft\(arrivalResult\)\.catch/);
  assert.match(source, /await confirmPlanDraft\(prepared\.draftId, prepared\.progression, prepared\.opened, activationTimer\)/);
  assert.match(source, /arrivalUsesManualWorkspace\(order\)/);
  assert.match(source, /arrivalUsesCodexWaitingWorkspace\(order\)/);
  assert.match(source, /arrivalInputIsWorkflowOnly\(input\)/);
  assert.doesNotMatch(source, /Copy and continue in \$\{escapeHtml\(agenticName\(\)\)\}/);
  assert.match(styles, /\.codex-handoff-choices \{ display:grid; grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(styles, /\.codex-handoff-choices\[hidden\] \{ display:none; \}/);
  assert.match(source, /Open \$\{escapeHtml\(agenticName\(\)\)\} and paste the prompt to continue\./);
  assert.match(source, />Copy again<\/button>/);
  assert.match(source, /Continue to the plan while you wait/);
  assert.match(styles, /\.codex-handoff-copied\[hidden\] \{ display:none; \}/);
  assert.match(source, /class="arrival-primary-action" aria-label="What happens next"/);
  assert.match(source, /Next step \/ answer one question/);
  assert.doesNotMatch(source, /Next step \/ review your brief/);
  assert.doesNotMatch(source, /Accept brief and open draft/);
  assert.doesNotMatch(source, /confirm-arrival-interpretation|toggle-starter-draft/);
  assert.match(source, /name="planningMode" value="codex"/);
  assert.match(source, /name="planningMode" value="manual"/);
  assert.match(source, /const showStarterPlan = Boolean\(starterPlanMarkup && !planDraftMarkup/);
  assert.match(source, /data-arrival-form="workspace-add"/);
  assert.match(source, /data-arrival-form="workspace-update"/);
  assert.match(source, /data-arrival-form="workspace-option-add"/);
  assert.match(source, /data-arrival-form="workspace-option-update"/);
  assert.match(source, /data-action="workspace-option-promote"/);
  assert.match(source, /data-action="workspace-option-delete"/);
  assert.match(source, /Compare researched or manually added alternatives here\. Nothing changes in the working plan until you choose Add to plan\./);
  assert.match(source, /data-action="open-record-options"/);
  assert.match(source, /data-record-options-dialog/);
  assert.match(source, /data-parent-record-id/);
  assert.match(source, /Research checked/);
  assert.match(source, /Research sources/);
  assert.match(source, /data-action="workspace-delete"/);
  assert.match(source, /data-action="workspace-toggle"/);
  assert.match(source, /data-arrival-form="workspace-comment"/);
  assert.match(source, /Ask \$\{escapeHtml\(agenticName\(\)\)\}/);
  assert.match(source, /workspaceOperation: "reorder"/);
  assert.match(source, /draggable="true"/);
  assert.match(source, /This is a first-pass plan, not a researched recommendation\./);
  assert.match(source, /Build this plan your way\./);
  assert.doesNotMatch(source, /This is useful now\.|is deliberately lightweight|is only needed/);
  assert.match(source, /Talk to \$\{escapeHtml\(agenticName\(\)\)\}/);
  assert.doesNotMatch(source, /The chef handoff carries this saved draft/);
  assert.doesNotMatch(source, /Brief confirmed\. Use \$\{escapeHtml\(agenticName\(\)\)\} to continue\./);
  assert.doesNotMatch(source, /Brief confirmed\. Codex may construct a plan/);
  assert.doesNotMatch(source, /Nothing is activated until you approve the exact plan/);
  assert.doesNotMatch(source, /class="codex-handoff-boundary"/);
  assert.doesNotMatch(source, /<dt>Finite site<\/dt>|<dt>Your plan<\/dt>|<dt>Copied<\/dt>|<dt>Stays private<\/dt>/);
  assert.doesNotMatch(handoffSource, /display name you chose in Finite/);
  assert.match(source, /!question && order\.status !== "proposed_plan_ready" && order\.status !== "interpretation_confirmed" && !planDraftMarkup && !showStarterPlan/);
  assert.match(source, /<\/section>\s*\$\{message[^]*?<details class="arrival-order-source">/);
  assert.match(source, /<div class="arrival-working-grid">\s*\$\{interpretation \? `<details class="arrival-interpretation">/);
  assert.match(source, /<details class="arrival-continuity">/);
  assert.match(styles, /\.arrival-working-grid \{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(styles, /\.starter-workspace \{[^}]*grid-template-columns:1fr/);
  assert.match(styles, /\.starter-record-options-dialog/);
  assert.match(styles, /\.starter-record__options-trigger/);
  assert.match(styles, /\.starter-option__research/);
  assert.doesNotMatch(styles, /\.starter-module__options/);
  assert.match(styles, /\.starter-option-grid/);
  assert.match(styles, /\.starter-module__records \{ display:grid; grid-template-columns:repeat\(2,minmax\(0,1fr\)\); gap:12px; align-items:start/);
  assert.match(styles, /\.starter-record__edit \{ margin-top:12px;/);
  assert.doesNotMatch(styles, /\.starter-record__edit \{ margin-top:auto;/);
  assert.match(styles, /\.starter-option-grid \{ display:grid; grid-template-columns:minmax\(0,1fr\)/);
  assert.match(styles, /\.starter-option dl \{ display:grid; grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(source, /class=\"\$\{layoutClass\}\"/);
  assert.match(source, /<details class="starter-plan__overview" open>/);
  assert((source.match(/<article class="starter-report-card/g)?.length ?? 0) >= 5);
  for (const label of ["Dates", "Total budget", "Budget split", "Plan items", "Open questions", "To-do"]) assert.match(source, new RegExp(`>${label}<`));
  assert.match(source, /\$\{openTasks\}<\/strong>/);
  assert.match(source, /data-action="open-workspace-module" data-module-id="tasks"/);
  assert.match(source, /allocationDelta < 0 \? "Over" : "Available"/);
  assert((source.match(/data-action="open-overview-editor"/g)?.length ?? 0) >= 4);
  assert.match(source, /aria-label="Edit plan dates"/);
  assert.match(source, /aria-label="Edit total budget"/);
  assert.match(source, /data-overview-dialog="dates"/);
  assert.match(source, /data-overview-dialog="budget"/);
  assert.match(source, /data-overview-dialog="split"/);
  const dateDialog = source.match(/<dialog class="starter-overview-dialog starter-overview-dialog--compact" data-overview-dialog="dates"[^]*?<\/dialog>/)?.[0] ?? "";
  assert.match(dateDialog, /<h3 id="overview_dates_title">Dates<\/h3>/);
  assert.match(dateDialog, /name="datesProvisional" type="checkbox"/);
  assert.doesNotMatch(dateDialog, /name="totalBudget"|name="currency"|Budget split/);
  assert.match(source, /data-action="close-overview-editor"/);
  assert.match(source, /data-arrival-form="workspace-overview"/);
  assert.match(source, /name="singleDay" type="checkbox"/);
  assert.match(source, /name="includeTime" type="checkbox"/);
  assert.match(source, /name="budgetProvisional" type="checkbox"/);
  assert.match(source, /name="field_provisional" type="checkbox"/);
  assert.match(source, /data-arrival-form="workspace-category-update"/);
  assert.match(source, /data-arrival-form="workspace-category-add"/);
  assert.match(source, /% of total/);
  assert.doesNotMatch(source, /starter-plan__money-strip/);
  assert.match(styles, /\.starter-plan__overview/);
  assert.match(styles, /\.starter-report-strip \{ display:grid; grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(styles, /\.starter-report-card \{[^}]*min-height:132px/);
  assert.match(styles, /\.starter-overview-dialog \{/);
  assert.match(styles, /\.starter-report-card\.is-provisional \.starter-report-card__value/);
  assert.match(styles, /\.starter-record\.is-provisional :where\(h4,dd\)/);
  assert.doesNotMatch(source, /starter-overview__body/);
  assert.doesNotMatch(styles, /\.starter-overview__settings \{ display:contents; \}/);
  assert.match(source, /return `<details class="starter-module starter-module--\$\{section\.variant\}\$\{section\.custom/);
  assert.doesNotMatch(source, /return `<section class="starter-module/);
  assert.match(source, /Customise workspace/);
  assert.match(source, /data-custom-workspace-dialog/);
  assert.match(source, /data-arrival-form="workspace-module-add"/);
  assert.match(source, /data-arrival-form="workspace-module-request"/);
  assert.match(source, /Custom is an extension, not a different plan/);
  assert.match(styles, /\.custom-workspace-dialog/);
  assert.match(styles, /\.starter-module>summary \{/);
  assert.match(styles, /\.starter-module\[open\]>summary/);
  for (const moduleId of ["itinerary", "people", "stays", "transport", "money", "requirements", "tasks"]) assert.match(styles, new RegExp(`data-workspace-module="${moduleId}"`));
  assert.match(styles, /--module-tone:/);
  assert.match(styles, /--module-mark:/);
  assert.match(styles, /border-left:6px solid var\(--module-mark\)/);
  assert.match(source, /module\.open = true/);
  assert.match(source, /data-calendar-view="calendar" aria-pressed="true">Calendar/);
  assert.match(source, /data-calendar-view="list" aria-pressed="false">List/);
  assert.match(source, /<table><caption>/);
  assert.match(source, /<th scope="col"><abbr title=/);
  assert.match(source, /data-action="select-calendar-item"/);
  assert.match(source, /data-calendar-detail data-record-context/);
  assert.match(source, /Selected item/);
  assert.match(source, /calendarEntryNoun/);
  assert.match(source, /travel: "Locations & activities"/);
  assert.match(source, /data-action='calendar-view'/);
  assert.match(source, /data-action='select-calendar-item'/);
  assert.match(source, /data-action='calendar-filter'/);
  assert.match(source, /captureWorkspaceUiState/);
  assert.match(source, /restoreWorkspaceUiState/);
  assert.match(source, /data-action="open-related-record"/);
  assert.match(source, /Live plan roll-up/);
  assert.match(source, /Automatically summed from/);
  assert.match(source, /Budget allocation/);
  assert.match(source, /starter\.family === "travel" \? travelBudgetInsight : adaptiveBudgetInsight/);
  assert.match(styles, /\.starter-calendar__filters/);
  assert.match(styles, /\.starter-record__relationships/);
  assert.match(styles, /\.starter-cost-rollup/);
  assert.match(source, /\[data-workspace-record\], \[data-record-context\]/);
  assert.match(styles, /\.starter-calendar__layout \{ display:grid; grid-template-columns:minmax\(0,1fr\) minmax\(290px,360px\)/);
  assert.match(styles, /\.starter-calendar__month table \{/);
  assert.match(styles, /\.starter-calendar__selection \{ position:sticky;/);
  assert.match(source, /field\.inputType === "url"/);
  assert.match(source, /Open website/);
  assert.doesNotMatch(styles, /\.starter-module--stays \.starter-module__records \{ grid-template-columns:repeat\(auto-fit/);
  assert.match(styles, /\.starter-record\[draggable="true"\]/);
  assert.match(styles, /@media \(max-width:980px\) \{[^]*\.arrival-compose,\.arrival-working-grid,\.arrival-continuity__body,\.arrival-handoff,\.arrival-continue,\.settings-section \{ grid-template-columns:1fr; \}/);
});

test("manual record ordering has a keyboard alternative to drag and drop", () => {
  assert.match(source, /data-action="workspace-move" data-direction="up"/);
  assert.match(source, /data-action="workspace-move" data-direction="down"/);
  assert.match(source, /aria-label="Move \$\{escapeHtml\(title\)\} earlier"/);
  assert.match(source, /const moveWorkspaceRecord/);
});

test("arrival creation keeps the typed starting point in place while persistence is pending", () => {
  const submit = source.slice(source.indexOf("const submitArrivalOrder"), source.indexOf("const appendArrivalDetail"));
  assert.match(submit, /form\.setAttribute\("aria-busy", "true"\)/);
  assert.match(submit, /submitButton\.textContent = "Saving your starting point…"/);
  assert.match(submit, /Your starting point is still here so you can try again\./);
  assert.doesNotMatch(submit.slice(0, submit.indexOf("arrivalRepository\.create")), /await render\(\)/);
});

test("workspace saves keep the edited form visible until the durable write returns", () => {
  const save = source.slice(source.indexOf("const saveWorkspaceMutation"), source.indexOf("const addWorkspaceRecord"));
  assert.match(save, /saveRegion\?\.setAttribute\("aria-busy", "true"\)/);
  assert.match(save, /saveRegion\?\.setAttribute\("data-save-state", "saving"\)/);
  assert.match(save, /submitButton\.textContent = "Saving…"/);
  assert.doesNotMatch(save.slice(0, save.indexOf("arrivalRepository\.appendInput")), /await render\(\)/);
  assert.match(save, /Your changes are still here\./);
  assert.match(save, /if \(!arrivalResult\.ok\) \{[^]*return false;[^]*\}[^]*await render\(\)/);
  assert.doesNotMatch(save, /root\?\.setAttribute\("aria-busy"/);
});

test("the guided workspace keeps a truthful Codex phase after questions are answered", () => {
  assert.match(source, /Finite marks the handoff point; work continues when Codex is connected\./);
  assert.match(source, /Current section ·/);
  assert.match(source, /data-codex-phase-current="true"/);
  assert.match(source, /working section/);
  assert.match(styles, /\.starter-operator-phase/);
});

test("the live demo starts on the ordinary blank first form even when saved work exists", () => {
  assert.match(source, /const openingFreshCodexRun = codexLaunchMode !== null \|\| \(demoPlaybackMode && request\.surface === "arrival"\);/);
  assert.match(source, /entryGatewayOpen = false;/);
  assert.match(source, /forceArrivalSurface = request\.surface === "arrival";/);
  assert.match(source, /newPlanDraftMode = openingFreshCodexRun;/);
  assert.match(source, /planningMode === "codex" && !demoPlaybackMode/);
  assert.match(source, /if \(!demoPlaybackMode\) void prepareArrivalPlanDraft\(arrivalResult\)/);
  assert.match(source, /draft\.sourceArrival && activeArrival && draft\.sourceArrival\.orderId !== activeArrival\.orderId\) return ""/);
  assert.match(source, /const freshArrivalEntry = !order && newPlanDraftMode;/);
  assert.match(source, /freshArrivalEntry \? `<div class="arrival-entry-shell"/);
  assert.match(source, /No plan exists yet\./);
  assert.match(source, /The planning workspace opens only after this starting point is submitted\./);
  assert.match(styles, /\.arrival-entry-shell \{[^}]*min-height:100svh;/);
  const freshShell = source.slice(source.indexOf('freshArrivalEntry ? `<div class="arrival-entry-shell"'), source.indexOf(': `<div class="private-top-shell"'));
  assert.doesNotMatch(freshShell, /renderPlanSwitcher|renderLifecycleRail/);
  assert.match(styles, /\.codex-guide-overlay footer \{[^}]*min-height:0;[^}]*color:var\(--deep\);[^}]*background:transparent;/);
  assert.match(styles, /\.codex-guide-overlay footer \.codex-guide-next \{[^}]*min-height:42px;[^}]*color:var\(--on-deep\);[^}]*background:var\(--deep\);/);
});

test("guiding the current surface preserves unsaved browser input", () => {
  assert.match(source, /const preserveUnsavedCurrentSurface = guideRequest\?\.surface === "current" && guideRequest\.refresh !== true;/);
  assert.match(source, /preservePausedDemoView \|\| preserveUnsavedCurrentSurface \|\| \["GUIDE_WAITING_FOR_PERSON", "GUIDE_PAUSED_FOR_QUESTION"\]/);
  assert.match(source, /const guidedView = guideRequest \? applyCodexSpotlight\(guideRequest\) : null;/);
});

test("each natural demo pause offers Next or a Codex question without another continuation message", () => {
  assert.match(source, /Paused at a natural stopping point/);
  assert.match(source, /class="codex-guide-question">Or ask/);
  assert.match(source, /or tell it to keep going/);
  assert.match(source, /GUIDE_WAITING_FOR_PERSON[^]*pausedAt: lastDemoGuide/);
  assert.match(source, /use the normal visible interface to click Next for them/);
  assert.match(styles, /\.codex-guide-overlay footer \.codex-guide-question/);
});

test("guided highlights point at one exact surface at a time", () => {
  assert.match(source, /top: \{ label: "the top of this page", selectors: \["\.site-header"/);
  assert.match(source, /root\.querySelectorAll<HTMLElement>\("\[data-codex-priority\]"\)\.forEach/);
  assert.match(source, /if \(request\.target === "priority"\) \{ element\.dataset\.codexPriority = "true"/);
});

test("starting or restarting a demo cannot inherit a hidden prior Next gate", () => {
  const startNew = source.slice(source.indexOf("const startNewPlan"), source.indexOf("const bindPlanSwitcherInteractions"));
  const openEntry = source.slice(source.indexOf("const openEntryRoute"), source.indexOf("const renderCodexLaunch"));
  for (const block of [startNew, openEntry]) {
    assert.match(block, /demoNextRequired = false;/);
    assert.match(block, /demoNextAdvanced = false;/);
    assert.match(block, /demoPaused = false;/);
  }
  assert.match(startNew, /lastDemoGuide = null;/);
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

test("settings exposes a local-only Demo mode and sharing fails closed inside it", () => {
  assert.match(source, /Demo mode · Local only/);
  assert.match(source, /Keep this browser local/);
  assert.match(source, /installLocalDemoWriteGuard\(window, localDemoMode\)/);
  assert.match(source, /localDemoMode \? new MemoryArrivalRepository/);
  assert.match(source, /Sharing and invitations are unavailable because Demo mode keeps this plan only in this browser/);
  assert.match(source, /Turning this off never uploads the local workspace/);
});

test("sharing and authenticated collaboration stay distinct with enforced owner authority", () => {
  assert.match(source, /Publish a view/);
  assert.match(source, /Invite to collaborate/);
  assert.match(source, /Can view/);
  assert.match(source, /Can suggest/);
  assert.match(source, /Can edit the draft/);
  assert.match(source, /Owner-only authority/);
  assert.match(source, /collaborationRepository\.create/);
  assert.match(source, /collaborationRepository\.revoke/);
  assert.match(source, /collaborationRepository\.resolve/);
});

test("human writing fields use the browser language for native spellcheck while control text opts out", () => {
  assert.match(shell, /<html lang="en">/);
  assert.match(shell, /<div id="app" aria-busy="true" spellcheck="true">/);
  assert.match(source, /navigator\.languages\.find\(\(language\) => language\.trim\(\)\) \?\? navigator\.language \?\? "en"/);
  assert.match(source, /field\.spellcheck = true; field\.lang = browserWritingLanguage;/);
  assert.equal(source.match(/enableNativeWritingAssistance\(\);/g)?.length, 6);
  assert.match(source, /<textarea readonly spellcheck="false" data-codex-handoff-prompt>/);
  assert.match(source, /name="confirmation" required autocomplete="off" spellcheck="false"/);
});

test("About you is inspectable and new plans expose plan-local profile selection", () => {
  assert.match(source, /<h1>About you<\/h1>/);
  assert.match(source, /Suggestions to review/);
  assert.match(source, /Nothing here is hidden, permanent, or permission to act/);
  assert.match(source, /name="action" value="retire">Stop using/);
  assert.match(source, /name="action" value="delete">Delete/);
  assert.match(source, /name="profileUse"/);
  assert.match(source, /finite-plan-profile-selection\.v1/);
  assert.match(source, /Used only for this plan; changing it here does not edit About you/);
  assert.match(styles, /\.about-memory-grid/);
  assert.match(styles, /\.arrival-profile-context/);
});

test("guided highlighting is a human-controlled option inside the single Codex handoff", () => {
  assert.equal(source.match(/\$\{renderFollowCodexButton\(\)\}/g)?.length ?? 0, 0);
  assert.doesNotMatch(source, /const renderFollowCodexButton/);
  assert.doesNotMatch(source, />Follow \$\{escapeHtml\(agenticName\(\)\)\}</);
  assert.match(source, /class="codex-handoff-guidance"><input type="checkbox" data-action="toggle-follow-codex" \$\{followCodexEnabled \? "checked" : ""\}/);
  assert.match(source, /class="codex-handoff-choice-note codex-handoff-choice-note--codex" data-codex-handoff-status>Copies one introduction for your/);
  assert.match(source, /class="codex-handoff-choice-note codex-handoff-choice-note--manual">Everything remains editable/);
  assert.doesNotMatch(source, /data-action="copy-codex-handoff">[^<]+<\/button>\s*<small data-codex-handoff-status/);
  assert.match(source, /Let \$\{escapeHtml\(agenticName\(\)\)\} guide this view/);
  assert.match(source, /scopedStorage\.getItem\("finite-plan\.follow-codex"\) === "true"/);
  assert.match(source, /FOLLOW_CODEX_DISABLED/);
  assert.match(source, /enable guided highlighting inside Finite's Codex handoff/);
  assert.match(source, /request\.surface !== "current"/);
  assert.match(source, /target\.searchParams\.set\("plan", "1"\)/);
  assert.match(source, /const guideTargetSelectors: Record<FiniteGuideTarget/);
  assert.match(source, /plan_ideas: \{ label: "the ready-made plan ideas", selectors: \["\.arrival-examples"\] \}/);
  assert.match(source, /planning_window: \{ label: "the planning window", selectors: \["\.arrival-order__outcome"\] \}/);
  assert.match(source, /build_method: \{ label: "the two ways to begin", selectors: \["\.arrival-start-tabs"\] \}/);
  assert.match(source, /manual_details: \{ label: "the structured plan details", selectors: \["\.arrival-start-panel--manual"\] \}/);
  assert.match(source, /plan_summary: \{ label: "the plan summary", selectors: \["\.starter-plan__overview", "\.arrival-starter-plan", "\.draft-review__summary", "\.hero", "\.plan-orbit"\] \}/);
  assert.match(source, /demoPlaybackMode && request\.surface === "arrival"/);
  assert.match(source, /element\.scrollIntoView\(\{ behavior: "smooth", block: "center" \}\)/);
  assert.match(source, /\$\{agenticName\(\)\} is showing \$\{descriptor\.label\}/);
  assert.match(source, /\$\{escapeHtml\(agenticName\(\)\)\} view on/);
  assert.match(source, /starter-module__question-count/);
  assert.match(source, /data-arrival-form="workspace-question-answer"/);
  assert.match(source, /data-codex-priority="true" open/);
  assert.match(source, /unresolvedSafetySectionId/);
  assert.match(styles, /\[data-codex-spotlight="true"\]/);
  assert.match(styles, /\[data-codex-priority="true"\]/);
  assert.match(styles, /\.starter-module__questions/);
  assert.match(source, /const questionMarkup = section\.openQuestions\.length \?/);
  assert.doesNotMatch(source, /No open questions in this section\./);
  assert.match(source, /Known &amp; assumed information/);
  assert.match(source, /<h4>Answered questions<\/h4>/);
  assert.match(source, /<h4>Known information<\/h4>/);
  assert.match(source, /<h4>Working assumptions<\/h4>/);
  assert.match(styles, /\.starter-module__knowledge/);
  assert.match(styles, /@media \(prefers-reduced-motion:reduce\)/);
  assert.match(styles, /\.codex-handoff-guidance \{ grid-column:1\/-1; display:grid;/);
  assert.match(styles, /\.codex-handoff-choice \{ display:grid; grid-template-rows:auto auto 1fr auto;/);
  assert.match(styles, /\.codex-handoff-choice-note \{/);
  assert.doesNotMatch(styles, /\.follow-codex-toggle/);
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
  assert.match(source, /activationTimer\.measure\("arrivalFreshness"/);
  assert.match(source, /validatedArrival\?\.ok && validatedArrival\.order \? validatedArrival : arrivalRepository\.open\(\)/);
  assert.match(source, /draft\.sourceArrival && !latestArrival\.ok/);
  assert.match(source, /idempotencyKey: `human-plan-activation:\$\{draftId\}:\$\{confirmation\.confirmationId\}`/);
  assert.match(source, /arrivalRepository\.acceptPlan\(\{/);
  assert.match(source, /target\.searchParams\.set\("plan", "1"\)/);
  assert.match(source, /announcer\.textContent = "Plan approved\. Managing is ready\."/);
  assert.match(source, /Starting your plan…/);
  assert.match(source, /planActivationTransition = true/);
  assert.match(source, /renderLifecycleRail\("managing"\)/);
  assert.match(source, /You can keep reviewing it below while Finite prepares and secures the exact version you chose to start\./);
  assert.match(source, /class="activation-transition-plan" inert/);
  assert.match(source, /Continue to Managing/);
  assert.doesNotMatch(source, /Plan approved and ready\. You are now in Managing\./);
  assert.doesNotMatch(source, /Plan approved\. \$\{escapeHtml\(agenticName\(\)\)\} can now put it into action\./);
  assert.doesNotMatch(source, /Exact plan draft confirmed\. Codex may now activate it/);
});

test("the editable rough plan exposes one top-level human progression action", () => {
  assert.match(source, /data-action="progress-arrival-plan"/);
  assert.match(source, /busy \? "Starting…" : "Start managing"/);
  assert.match(source, /arrivalProgressionFromStarter\(opened\.order, starter\)/);
  assert.match(source, /arrivalRepository\.reviewWorkspace\(\{/);
  assert.match(source, /runtime\.compileIntakeToDraft\(\{ preparedIntake: progression\.intake \}\)/);
  assert.match(source, /prepareArrivalPlanDraft\(latest\)/);
  assert.match(source, /confirmPlanDraft\(prepared\.draftId, prepared\.progression, prepared\.opened, activationTimer\)/);
  assert.match(source, /beginClickActivationTimingReceipt\(document\.documentElement\.dataset\)/);
  assert.match(source, /publishClickActivationTimingReceipt\(document\.documentElement\.dataset, timer, outcome, guarded\)/);
  assert.match(source, /const activationTimer = beginClickActivationTiming\(\)/);
  assert.match(source, /const activationTimer = existingTimer \?\? beginClickActivationTiming\(\)/);
  for (const phase of ["transitionRender", "arrivalFreshness", "draftPreparation", "confirmationRender", "localConfirmation", "guardedActivation", "localActivation", "finalRender"]) assert.match(source, new RegExp(`"${phase}"`));
  assert.match(source, /seedArrivalContinuity\(continuity\)/);
  assert.match(source, /const postActivationSync = Promise\.resolve\(\)\.then/);
  assert.match(source, /void Promise\.all\(\[continuityWork, postActivationSync\]\)\.then/);
  assert.doesNotMatch(source, /continuitySaved = await seedArrivalContinuity/);
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
  assert.match(styles, /\.hero \{ padding:32px 0 28px;/);
  assert.match(source, /<details class="plan-input-items/);
  assert.match(source, /Saved plan information/);
  assert.match(source, /const renderPendingPlanPriority = \(\): string =>/);
  assert.match(source, /<p class="eyebrow">Codex priority<\/p>/);
  assert.match(source, /Visible working input · accepted numbers and constraints stay unchanged/);
  assert.match(source, /\$\{renderPendingPlanPriority\(\)\}\s+\$\{renderNextStep\(manifest\)\}/);
  assert.match(styles, /\.plan-priority-update \{/);
  assert.match(source, /\$\{renderPlanWork\(\)\}\s+\$\{renderPlanInputItems\("general"\)\}/);
  const managingHero = source.match(/<section class="hero">([\s\S]*?)<\/section>\s+\$\{message/);
  assert.ok(managingHero);
  assert.doesNotMatch(managingHero[1], /renderPlanInputItems/);
  assert.doesNotMatch(styles, /\.hero-summary \{/);
  assert.match(styles, /\.managing-next \{/);
  assert.doesNotMatch(styles, /\.orbit-ring \{/);
});

test("ordinary plan views never invent demo disruptions", () => {
  assert.match(source, /if \(labMode\) await seedDecision\(\);/);
  assert.doesNotMatch(source, /labMode \|\| new URLSearchParams\(location\.search\)\.get\("plan"\)/);
  assert.doesNotMatch(source, /if \(result\.code === "PLAN_SWITCHED"\) \{\s*await adapter\?\.refreshContextualTools\(\);\s*await seedDecision\(\);/);
});

test("a reality change reads as one human decision and leaves a visible outcome", () => {
  assert.match(source, /What changed/);
  assert.match(source, /What stays true/);
  assert.match(source, /What you’re choosing/);
  assert.match(source, />Use this option<\/button>/);
  assert.match(source, />Confirm and update plan<\/button>/);
  assert.match(source, /The change is now part of your plan\./);
  assert.match(source, /This updates your plan only—it does not book, buy, cancel, or contact anyone\./);
  assert.match(source, /item\.receiptType === "plan_option" && item\.toRevision === kernel\.revision/);
  assert.match(styles, /\.change-context \{/);
  assert.match(styles, /\.latest-plan-update \{/);
  assert.doesNotMatch(source, /outside this demonstration/);
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

test("checklist progress updates optimistically and rolls back failed writes", () => {
  assert.match(source, /idempotencyKey: `checklist-sync-\$\{runtime\.kernel\.profile\.profileHash\.slice\(0, 16\)\}-\$\{runtime\.kernel\.revision\}-\$\{stage\.stageId\}`/);
  assert.match(source, /const priorChecklist = checklistItems;/);
  assert.match(source, /checklistItems = checklistItems\.map\(\(candidate\) => candidate\.itemId === itemId/);
  assert.match(source, /planWorkBusy = true;\s*\[\.\.\.\(root\?\.querySelectorAll<HTMLInputElement>/);
  assert.doesNotMatch(source, /planWorkBusy = true;\s*await render\(\);\s*try/);
  assert.match(source, /checklistItems = priorChecklist; announce\(result\.message/);
});

test("appearance opens from cache before refreshing choices", () => {
  assert.match(source, /themeSettingsOpen = true;[\s\S]*?await render\(\);\s*try \{\s*await Promise\.all\(\[refreshThemeCatalog\(\), refreshSkinCatalog\(\)\]\)/);
  assert.match(source, /if \(themeSettingsOpen\) await render\(\)/);
});
