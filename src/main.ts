import { compileBuiltInProfiles } from "./profiles.js";
import { clearFiniteScope, clearForeignFiniteScopes, MemoryStorage, PlanCatalogStore, PlanSnapshotStore, ScopedStorage } from "./persistence.js";
import { compileCatalogEntries, FinitePlanRuntime } from "./runtime.js";
import { compileSurfaceManifest, resolveSurfaceBinding } from "./surface.js";
import type { Candidate, PlanLifecycleStatus, ProfileId, Receipt, SurfaceManifest, SurfaceZone } from "./types.js";
import { FinitePlanWebMCPAdapter, type FiniteWebMCPReadiness } from "./webmcp.js";
import { HttpAcceptedTruthRepository } from "./accepted-truth.js";
import { HttpConstructionPacketRepository } from "./construction-packet.js";
import { HttpArrivalRepository, type ArrivalOrder, type ArrivalResult } from "./arrival.js";
import { createCodexHandoff } from "./codex-handoff.js";
import { finiteRelease } from "./release.js";
import { humanLabel, inputKindLabel, inputSurfaceLabel, renderHumanValue, renderTextList } from "./arrival-presentation.js";
import { isWaitingArrivalStatus, selectExperienceSurface } from "./experience-route.js";
import { reconcileScopedSurfaceMessage } from "./surface-message.js";
import { HttpKitchenResetRepository, kitchenResetConfirmation, type KitchenResetResult } from "./kitchen-reset.js";
import { applyThemeDefinition, builtInThemes, defaultTheme, HttpThemeRepository, themeCoreTokenKeys, type ThemeCatalogResult, type ThemeCoreTokens, type ThemeDefinition, type ThemeMode, type ThemeResult } from "./theme.js";
import { applySkinDefinition, builtInSkins, defaultSkin, HttpSkinRepository, skinTraitKeys, type SkinCatalogResult, type SkinDefinition, type SkinRecipe, type SkinResult } from "./skin.js";

const root = document.querySelector<HTMLElement>("#app");
document.querySelector<HTMLMetaElement>('meta[name="finite-build"]')?.setAttribute("content", finiteRelease.build);
const announcer = document.querySelector<HTMLElement>("#announcer");
if (!root || !announcer) throw new Error("Finite host elements are missing.");
const surfaceRoot = root;
const webmcpReadiness: FiniteWebMCPReadiness = window.finiteWebMCPReadiness ?? { state: "initializing" };
window.finiteWebMCPReadiness = webmcpReadiness;

interface FiniteAuthSession {
  kind: "account" | "demo";
  provider: "chatgpt" | "demo";
  displayName: string;
  email: string | null;
  expiresAt: string | null;
  storageScope: string;
  legacyBrowserCacheEligible: boolean;
}

interface FiniteAuthStatus {
  ok: boolean;
  code: string;
  session: FiniteAuthSession | null;
  signInPath?: string;
}

const loadAuthStatus = async (): Promise<FiniteAuthStatus> => {
  const response = await fetch("/api/auth/session", { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`Finite identity returned HTTP ${response.status}.`);
  return response.json() as Promise<FiniteAuthStatus>;
};

const renderAuthGate = (signInPath = "/signin-with-chatgpt"): void => {
  document.title = "Finite — plans that survive contact with reality";
  root.innerHTML = `
    <div class="public-surface">
      <header class="public-header">
        <a class="brand" href="#main" aria-label="Finite home"><span>finite</span><i></i></a>
        <nav class="public-nav" aria-label="Product">
          <a href="#surfaces">Product</a>
          <a href="#how-it-works">How it works</a>
          <a href="#build">Build log</a>
          <a href="#roadmap">Roadmap</a>
        </nav>
        <div class="public-header__actions">
          <a class="public-header__cta" href="${signInPath}">Continue with ChatGPT</a>
          <button class="public-header__demo" data-action="start-demo">Try demo</button>
        </div>
      </header>
      <main class="public-main" id="main">
        <section class="public-hero" aria-labelledby="public_title">
          <div class="public-hero__copy">
            <p class="eyebrow">Travel · Renovation · Event / adaptive planning</p>
            <h1 id="public_title">Plans that survive <em>contact with reality.</em></h1>
            <p class="public-question">Reality changed. What should the plan become now?</p>
            <p class="public-lede">Finite keeps the whole outcome coherent as dates, availability, commitments, comfort and remaining resources move. Codex operates the live plan. You choose and approve what it becomes.</p>
            <div class="public-actions">
              <a class="button button--entry" href="${signInPath}">Continue with ChatGPT</a>
              <button class="button button--demo" data-action="start-demo">Try the demo</button>
            </div>
            <p class="public-auth-note">One private kitchen with ChatGPT identity, or a separate 24-hour demo.</p>
          </div>
          <article class="paris-plan" aria-label="Paris whole-plan replanning example">
            <header class="paris-plan__head">
              <p><span>Human order</span>Add three nights in Paris.</p>
              <strong>Whole plan / revision 1</strong>
            </header>
            <div class="reality-change">
              <span>Reality changed</span>
              <p>Paris stays longer. The international flights cannot move. Keep at least A$500 of breathing room.</p>
            </div>
            <ol class="plan-system" aria-label="Resources considered in the revised plan">
              <li class="is-locked"><span>01</span><p>Flights</p><strong>Locked</strong></li>
              <li class="is-moving"><span>02</span><p>Accommodation</p><strong>+3 nights</strong></li>
              <li><span>03</span><p>Transport</p><strong>Reconnected</strong></li>
              <li><span>04</span><p>Dates</p><strong>Reflowed</strong></li>
              <li><span>05</span><p>Comfort</p><strong>Protected</strong></li>
              <li class="is-result"><span>06</span><p>Remaining room</p><strong>A$500+</strong></li>
            </ol>
            <footer><span>Changed reality</span><i aria-hidden="true"></i><strong>Viable revised trip</strong></footer>
          </article>
        </section>

        <section class="adaptation-story" id="surfaces" aria-labelledby="surfaces_title">
          <div class="public-section-head">
            <p class="eyebrow">One planning grammar, three human outcomes</p>
            <h2 id="surfaces_title">The plan changes shape with the work.</h2>
            <p>Finite is not one dashboard with different labels. Time, measures, actions and the decision itself adapt to what must survive.</p>
          </div>

          <article class="travel-surface" aria-labelledby="travel_title">
            <header class="surface-story__head">
              <div><p class="eyebrow">Travel / calendar</p><h3 id="travel_title">More Paris, without losing the trip.</h3></div>
              <p><span>Change</span>Three more nights</p>
            </header>
            <div class="travel-route" aria-label="Revised European itinerary">
              <div class="travel-stop is-locked"><span>01–04</span><strong>London</strong><p>International flight fixed</p></div>
              <div class="travel-stop is-changed"><span>05–11</span><strong>Paris</strong><p>Three nights added</p></div>
              <div class="travel-stop"><span>12–14</span><strong>Amsterdam</strong><p>Stay rebalanced</p></div>
              <div class="travel-stop"><span>15–18</span><strong>Barcelona</strong><p>Comfort protected</p></div>
            </div>
            <footer class="surface-story__result"><span>Flights fixed</span><span>Dates reflowed</span><span>Transport reconnected</span><strong>A$500+ room preserved</strong></footer>
          </article>

          <div class="secondary-surfaces">
            <article class="renovation-surface" aria-labelledby="renovation_title">
              <header class="surface-story__head">
                <div><p class="eyebrow">Renovation / phases</p><h3 id="renovation_title">Protect the handover, not every finish.</h3></div>
                <p><span>Reality</span>Tile delayed 10 days</p>
              </header>
              <ol class="phase-lane" aria-label="Revised renovation phases">
                <li class="is-done"><span>Phase 01</span><div><strong>Strip-out</strong><p>Complete</p></div><b>✓</b></li>
                <li><span>Phase 02</span><div><strong>Cabinetry</strong><p>Sequence held</p></div><b>Fixed</b></li>
                <li class="is-replanned"><span>Phase 03</span><div><strong>Surfaces</strong><p>Local substitute evaluated</p></div><b>Replanned</b></li>
                <li><span>Day 90</span><div><strong>Handover</strong><p>Commitment protected</p></div><b>Locked</b></li>
              </ol>
              <footer class="surface-story__result"><span>Materials</span><span>Trades</span><span>Dependencies</span><strong>Contingency floor held</strong></footer>
            </article>

            <article class="event-surface" aria-labelledby="event_title">
              <header class="surface-story__head">
                <div><p class="eyebrow">Event / run of show</p><h3 id="event_title">Welcome more guests without breaking the room.</h3></div>
                <p><span>Change</span>+15 guests</p>
              </header>
              <div class="show-board" aria-label="Revised event run of show">
                <div><time>15:00</time><p>Load-in</p><span>Supplier sequence</span></div>
                <div><time>18:30</time><p>Doors</p><span>Timing locked</span></div>
                <div class="is-live"><time>19:30</time><p>Programme</p><span>Experience protected</span></div>
                <div><time>22:45</time><p>Close</p><span>Staffing rebalanced</span></div>
              </div>
              <div class="capacity-line"><span>Guest capacity</span><strong>115 / 120</strong><i aria-hidden="true"><b></b></i></div>
              <footer class="surface-story__result"><span>Vendors</span><span>Capacity</span><span>Staffing</span><strong>Show remains viable</strong></footer>
            </article>
          </div>
        </section>

        <section class="operating-story" id="how-it-works" aria-labelledby="operating_title">
          <div class="public-section-head public-section-head--light">
            <p class="eyebrow">The operating inversion</p>
            <h2 id="operating_title">Codex operates. You consume, choose and approve.</h2>
            <p>Finite gives the agent a deterministic kitchen rather than giving you another appliance to operate.</p>
          </div>
          <ol class="service-line" aria-label="Finite operating sequence">
            <li><span>01 / Order</span><h3>You state the outcome.</h3><p>Bring the change, preferences and hard constraints. Finite does not make you translate them into a dashboard.</p></li>
            <li><span>02 / Operate</span><h3>Codex opens the whole kitchen.</h3><p>It sees accepted truth, legal moves, current evidence and the exact next safe action.</p></li>
            <li><span>03 / Connect</span><h3>WebMCP uses the same live page.</h3><p>The operator works through page-scoped tools against the plan you can see, not a hidden parallel state.</p></li>
            <li><span>04 / Authority</span><h3>You approve one exact result.</h3><p>No consequential change lands until you choose the bound option and authorize that revision.</p></li>
          </ol>
          <div class="webmcp-seam">
            <div class="webmcp-seam__page">
              <span>Live page / accepted plan</span>
              <strong>Revision 1</strong>
              <div><i></i><i></i><i></i></div>
              <p>Travel surface</p>
            </div>
            <div class="webmcp-seam__connection"><span>WebMCP</span><i aria-hidden="true"></i><strong>Same state</strong></div>
            <div class="webmcp-seam__operator">
              <span>Operator</span>
              <strong>Codex</strong>
              <p>Interpret, research, explore, prepare.</p>
            </div>
          </div>
        </section>

        <section class="trust-story" id="trust" aria-labelledby="trust_title">
          <div class="public-section-head">
            <p class="eyebrow">Creative operator, deterministic control plane</p>
            <h2 id="trust_title">The agent can be clever. Accepted truth cannot be persuaded.</h2>
            <p>Finite owns the parts that must remain exact while Codex handles the interpretive work.</p>
          </div>
          <div class="trust-laws">
            <article><span>01</span><h3>One accepted truth</h3><p>Immutable revisions, exact plan state and replayable lineage survive the session.</p></article>
            <article><span>02</span><h3>Rules stay code</h3><p>Conservation, locks, relationships and legal moves are recalculated deterministically.</p></article>
            <article><span>03</span><h3>Research stays evidence</h3><p>Prices, availability and observations enter as provenance-bound untrusted data.</p></article>
            <article><span>04</span><h3>Authority stays human</h3><p>Approval creators remain outside WebMCP and bind only one candidate and revision.</p></article>
            <article><span>05</span><h3>Every change leaves a receipt</h3><p>Applied outcomes carry content-addressed before-and-after proof and replay protection.</p></article>
            <article><span>06</span><h3>No fictional execution</h3><p>Finite can model and revise the plan. It does not currently alter an external booking or supplier system.</p></article>
          </div>
        </section>

        <section class="build-story" id="build" aria-labelledby="build_title">
          <div class="build-story__head">
            <div class="public-section-head">
              <p class="eyebrow">Build log / selected engineering milestones</p>
              <h2 id="build_title">The product is live in the details.</h2>
              <p>Finite is an active owner-private build, not a rendered concept. These are working contracts in the current product; the acceptance suite checks the boundaries again on every build.</p>
            </div>
            <aside class="build-state" aria-label="Current build state">
              <span>Current build</span>
              <strong>Active engineering</strong>
              <dl>
                <div><dt>Contract gate</dt><dd>Full suite passing</dd></div>
                <div><dt>Plan families</dt><dd>3 compiled</dd></div>
                <div><dt>Live tools</dt><dd>7 native + adaptive menus</dd></div>
                <div><dt>Audience</dt><dd>Owner-private</dd></div>
              </dl>
              <small>Verified 27 August 2026</small>
            </aside>
          </div>

          <ol class="build-log" aria-label="Finite build milestones">
            <li>
              <div class="build-log__index"><span>Build 05</span><time datetime="2026-08-26">26 Aug 2026</time></div>
              <div class="build-log__copy"><h3>The product gets a public front door.</h3><p>The Paris change now demonstrates whole-plan replanning across flights, accommodation, transport, dates, comfort and remaining resources. Travel, renovation and event each expose a different adaptive surface rather than one relabelled dashboard.</p></div>
              <span class="build-status">Working</span>
            </li>
            <li>
              <div class="build-log__index"><span>Build 04</span><time datetime="2026-08-26">26 Aug 2026</time></div>
              <div class="build-log__copy"><h3>Identity becomes a boundary, not a credential store.</h3><p>ChatGPT owns sign-in. Finite derives an isolated tenant, provisions a private kitchen on first use, and offers a separate 24-hour demo whose complete namespace expires with it.</p></div>
              <span class="build-status">Proven</span>
            </li>
            <li>
              <div class="build-log__index"><span>Build 03</span><time datetime="2026-08-26">26 Aug 2026</time></div>
              <div class="build-log__copy"><h3>One plan crosses devices without carrying authority with it.</h3><p>Travel, renovation and event each complete the same two-device journey. Codex can resume exact decision work; the receiving runtime rebuilds the candidate independently; only a fresh, short-lived human handoff can authorize the commit.</p></div>
              <span class="build-status">Proven</span>
            </li>
            <li>
              <div class="build-log__index"><span>Build 02</span><time datetime="2026-08-26">26 Aug 2026</time></div>
              <div class="build-log__copy"><h3>Accepted truth leaves the browser.</h3><p>A D1 transaction now commits the head, immutable revision, receipt, domain event and referenced evidence together. Competing writers, stale revisions, tampered envelopes and lost-response retries fail closed or resolve through the stored receipt.</p></div>
              <span class="build-status">Proven</span>
            </li>
            <li>
              <div class="build-log__index"><span>Build 01</span><time datetime="2026-08-26">26 Aug 2026</time></div>
            <div class="build-log__copy"><h3>Codex reaches the same live plan through WebMCP.</h3><p>The Site exposes a route-sized kitchen against the page the human sees, with bounded content-addressed results instead of the full catalog or plan dumped into context. Deterministic code owns state, constraints, commits and receipts; Codex interprets, researches and prepares legal moves.</p></div>
              <span class="build-status">Working</span>
            </li>
          </ol>

          <p class="build-boundary"><span>Deliberate boundary</span>Finite models, compares and revises the plan. It does not currently change a booking, make a purchase, pay a supplier or imply that an external system has acted.</p>
        </section>

        <section class="roadmap-story" id="roadmap" aria-labelledby="roadmap_title">
          <div class="public-section-head public-section-head--light">
            <p class="eyebrow">Known roadmap / ordered by product risk</p>
            <h2 id="roadmap_title">Make the loop harder to break before making it wider.</h2>
            <p>The roadmap follows the control plane: deepen the real loop, make it portable, then earn external action one bounded capability at a time.</p>
          </div>
          <div class="roadmap-lanes">
            <article class="roadmap-lane roadmap-lane--now">
              <span>Now / hardening</span>
              <h3>Production resilience for accepted plans.</h3>
              <ul>
                <li>Recovery and export drills against the durable plan lineage</li>
                <li>Property and invariant fuzzing across replanning operations</li>
                <li>Rate, latency and redacted telemetry budgets</li>
                <li>Deeper end-to-end pressure on the Paris loop and all three surfaces</li>
              </ul>
            </article>
            <article class="roadmap-lane">
              <span>Next / portability</span>
              <h3>A kitchen another person can own.</h3>
              <ul>
                <li>Standard OIDC for a portable, self-hosted identity route</li>
                <li>Supported recovery, migration and first-run ownership paths</li>
                <li>Recurring-period and milestone plan experiments</li>
                <li>Public beta only after tenancy and recovery survive independent use</li>
              </ul>
            </article>
            <article class="roadmap-lane">
              <span>Later / earned expansion</span>
              <h3>External action with capability-specific authority.</h3>
              <ul>
                <li>Booking, supplier and calendar connectors with explicit approval per action</li>
                <li>Proof of what an external system actually accepted or refused</li>
                <li>More plan families only where the work demands a genuinely different grammar</li>
                <li>No generic automation permission and no invisible parallel state</li>
              </ul>
            </article>
          </div>
        </section>

        <section class="public-entry" id="enter" aria-labelledby="enter_title">
          <div>
            <p class="eyebrow">Your kitchen, when you are ready</p>
            <h2 id="enter_title">Bring the plan that cannot afford to fall apart.</h2>
            <p>Continue with ChatGPT for a private kitchen across visits, or enter an isolated demo that expires with its complete namespace after 24 hours.</p>
          </div>
          <div class="public-entry__actions">
            <a class="button button--entry" href="${signInPath}">Continue with ChatGPT</a>
            <button class="button button--demo" data-action="start-demo">Try the demo</button>
          </div>
          <dl class="identity-promises">
            <div><dt>No Finite password</dt><dd>ChatGPT handles identity. Finite stores no credential.</dd></div>
            <div><dt>No registration form</dt><dd>Your private kitchen is provisioned on first use.</dd></div>
            <div><dt>Demo means isolated</dt><dd>It never adopts or copies an authenticated plan history.</dd></div>
          </dl>
        </section>
      </main>
      <footer class="public-footer"><p>Plans that survive contact with reality.</p><span><a href="#build">Build log</a> · <a href="#roadmap">Roadmap</a> / Finite through WebMCP</span></footer>
    </div>`;
  root.querySelectorAll<HTMLButtonElement>("[data-action='start-demo']").forEach((demoButton) => demoButton.addEventListener("click", async (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    button.disabled = true;
    button.textContent = "Opening the demo kitchen…";
    const response = await fetch("/api/auth/demo", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    if (response.ok) location.reload();
    else {
      button.disabled = false;
      button.textContent = "Try the demo";
      announcer.textContent = "The demo kitchen could not be opened. Nothing was saved.";
    }
  }));
};

const startKitchen = async (authSession: FiniteAuthSession): Promise<void> => {

const profiles = await compileBuiltInProfiles();
clearForeignFiniteScopes(localStorage, authSession.storageScope);
const scopedStorage = new ScopedStorage(localStorage, authSession.storageScope);
const legacyCacheOwnerKey = "finite-plan.browser-cache-owner.v1";
if (authSession.legacyBrowserCacheEligible) {
  const claimedBy = localStorage.getItem(legacyCacheOwnerKey);
  if (!claimedBy || claimedBy === authSession.storageScope) {
    const legacyKeys = ["finite-plan.catalog.v1", "finite-plan.activation-receipts.v1", "finite-plan.construction.v1", "finite-plan.surface.active-profile"];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith("finite-plan.v1:")) legacyKeys.push(key);
    }
    for (const key of [...new Set(legacyKeys)]) {
      const value = localStorage.getItem(key);
      if (value !== null) {
        if (scopedStorage.getItem(key) === null) scopedStorage.setItem(key, value);
        localStorage.removeItem(key);
      }
    }
    localStorage.setItem(legacyCacheOwnerKey, authSession.storageScope);
  }
}
const store = new PlanSnapshotStore(scopedStorage);
const catalogStore = new PlanCatalogStore(scopedStorage);
const acceptedRepository = new HttpAcceptedTruthRepository();
try {
  const remoteCatalog = await acceptedRepository.listCatalog();
  for (const entry of remoteCatalog.entries) catalogStore.save(entry.definition, entry.evidenceRecords, entry.lineage);
  for (const receipt of remoteCatalog.activationReceipts) catalogStore.saveActivationReceipt(receipt);
} catch { /* Scoped cache remains a safe availability fallback; accepted heads still verify every consequential write. */ }
const catalogEntries = await compileCatalogEntries(catalogStore.load(), catalogStore.loadActivationReceipts());
const savedProfile = scopedStorage.getItem("finite-plan.surface.active-profile");
const savedBuiltIn = savedProfile === "renovation" || savedProfile === "event" || savedProfile === "travel" ? savedProfile : null;
const savedPlan = catalogEntries.some(({ profile }) => profile.planId === savedProfile) ? savedProfile : null;
const initialProfile = savedPlan ?? savedBuiltIn ?? "travel";
const constructionRepository = new HttpConstructionPacketRepository();
const arrivalRepository = new HttpArrivalRepository();
const resetRepository = new HttpKitchenResetRepository();
const themeRepository = new HttpThemeRepository();
const skinRepository = new HttpSkinRepository();
let themeCatalog: ThemeCatalogResult;
try {
  themeCatalog = await themeRepository.list();
  if (!themeCatalog.ok) throw new Error(themeCatalog.code);
} catch {
  themeCatalog = { ok: true, code: "THEME_CATALOG_FALLBACK", builtIns: builtInThemes, custom: [], activeThemeId: defaultTheme.themeId, activeTheme: defaultTheme, acceptedStateChanged: false };
}
applyThemeDefinition(themeCatalog.activeTheme);
const refreshThemeCatalog = async (): Promise<void> => {
  const next = await themeRepository.list();
  if (!next.ok) throw new Error(next.code);
  themeCatalog = next;
  applyThemeDefinition(themeCatalog.activeTheme);
};
let skinCatalog: SkinCatalogResult;
try {
  skinCatalog = await skinRepository.list();
  if (!skinCatalog.ok) throw new Error(skinCatalog.code);
} catch {
  skinCatalog = { ok: true, code: "SKIN_CATALOG_FALLBACK", builtIns: builtInSkins, custom: [], activeSkinId: defaultSkin.skinId, activeSkin: defaultSkin, acceptedStateChanged: false };
}
applySkinDefinition(skinCatalog.activeSkin);
const refreshSkinCatalog = async (): Promise<void> => {
  const next = await skinRepository.list();
  if (!next.ok) throw new Error(next.code);
  skinCatalog = next;
  applySkinDefinition(skinCatalog.activeSkin);
};
let arrivalResult: ArrivalResult = await arrivalRepository.open();
const runtime = new FinitePlanRuntime(profiles, store, initialProfile, catalogStore, catalogEntries, () => new Date(), acceptedRepository, constructionRepository);
await runtime.hydrateAcceptedTruth();
await runtime.hydrateConstructionPacket();
await runtime.resumeConstructionPacket();
const modelContext = document.modelContext;
window.finitePlanCanary?.adapter?.dispose();
const adapter = modelContext ? new FinitePlanWebMCPAdapter(modelContext, runtime, async ({ toolName, result }) => {
  if (["PLAN_ACTIVATED", "PLAN_AMENDMENT_ACTIVATED", "PLAN_SWITCHED", "PROFILE_SWITCHED"].includes(result.code)) scopedStorage.setItem("finite-plan.surface.active-profile", runtime.kernel.profile.planId);
  if (toolName.includes("arrival") || result.code.startsWith("ARRIVAL_") || result.code === "ORDER_VERSION_CONFLICT" || ["PLAN_ACTIVATED", "PLAN_AMENDMENT_ACTIVATED", "IDEMPOTENT_PLAN_ACTIVATION_REPLAY"].includes(result.code)) arrivalResult = await arrivalRepository.open();
  const manifest = await render();
  return {
    toolName,
    resultCode: result.code,
    planRevision: runtime.kernel.revision,
    profileId: runtime.kernel.profile.profileId,
    activeEventId: runtime.kernel.activeEventId,
    manifestHash: manifest.manifestHash,
  };
}, arrivalRepository, true, resetRepository, async () => {
  clearFiniteScope(localStorage, authSession.storageScope);
  if (localStorage.getItem(legacyCacheOwnerKey) === authSession.storageScope) localStorage.removeItem(legacyCacheOwnerKey);
  window.setTimeout(() => location.assign("/"), 1_500);
}, themeRepository, async (result: ThemeResult) => {
  if (result.theme) applyThemeDefinition(result.theme);
  await refreshThemeCatalog();
}, skinRepository, async (result: SkinResult) => {
  if (result.skin) applySkinDefinition(result.skin);
  await refreshSkinCatalog();
}).useBoundedOutputs().useStableDispatcher() : null;
if (adapter) {
  const inventory = await adapter.register();
  window.finiteEnterKitchen = (input, context) => adapter.enterKitchen(input, context);
  webmcpReadiness.state = "ready";
  webmcpReadiness.inventory = inventory;
}
const hotModule = (import.meta as ImportMeta & { hot?: { dispose(callback: () => void): void } }).hot;
if (hotModule) hotModule.dispose(() => adapter?.dispose());

let busy = false;
let message = "";
let messageScope = "";
let draftReturnFormOpen = false;
let kitchenResetPreview: KitchenResetResult | null = null;
let themeSettingsOpen = false;
let themeEditingId: string | null = null;
let themeDeleteId: string | null = null;
let skinEditingId: string | null = null;
let skinDeleteId: string | null = null;
const labMode = new URLSearchParams(location.search).get("lab") === "1";
let labAcceptanceResult: unknown = null;

const escapeHtml = (value: unknown): string => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#039;");

const renderIdentityPill = (): string => `<div class="identity-pill"><span>${escapeHtml(authSession.displayName)}</span>${authSession.kind === "account" ? `<button type="button" data-action="open-theme-settings" aria-label="Appearance settings">Appearance</button>` : ""}<button type="button" data-action="open-kitchen-reset">Start over</button>${authSession.kind === "demo" ? `<button data-action="end-demo">End demo</button>` : `<a href="/signout-with-chatgpt?return_to=/">Sign out</a>`}</div>`;

const resetCategoryCount = (names: string[]): number => names.reduce((sum, name) => sum + Number(kitchenResetPreview?.counts?.[name] ?? 0), 0);

const renderKitchenResetDialog = (): string => {
  const total = Number(kitchenResetPreview?.totalRecords ?? 0);
  const ready = kitchenResetPreview?.ok === true;
  return `<dialog class="kitchen-reset-dialog" data-kitchen-reset-dialog aria-labelledby="kitchen_reset_title">
    <form method="dialog" class="kitchen-reset-dialog__close"><button aria-label="Close start-over dialog">×</button></form>
    <div class="kitchen-reset-dialog__intro"><p class="eyebrow">Permanent reset / this kitchen only</p><h2 id="kitchen_reset_title">Start Finite over?</h2><p>This deletes the plans and work in this signed-in Finite kitchen. It does not sign you out or change a booking, purchase, supplier, calendar, or any other external system.</p></div>
    ${ready ? `<dl class="kitchen-reset-dialog__counts">
      <div><dt>Arrival history</dt><dd>${resetCategoryCount(["arrival_orders", "arrival_events"])}</dd></div>
      <div><dt>Plans and revisions</dt><dd>${resetCategoryCount(["plan_catalog", "plan_heads", "plan_revisions", "activation_receipts"])}</dd></div>
      <div><dt>Construction work</dt><dd>${resetCategoryCount(["construction_packets", "construction_return_reviews"])}</dd></div>
      <div><dt>Evidence, decisions and receipts</dt><dd>${resetCategoryCount(["evidence_records", "domain_events", "receipts", "operation_log"])}</dd></div>
      <div><dt>Authority and operator sessions</dt><dd>${resetCategoryCount(["authority_challenges", "challenge_consumptions", "operator_sessions"])}</dd></div>
    </dl><p class="kitchen-reset-dialog__total"><strong>${total}</strong> durable record${total === 1 ? "" : "s"} will be cleared, plus this tenant's browser cache.</p>` : `<p class="kitchen-reset-dialog__warning">Finite could not verify the exact reset scope. Nothing can be deleted until the preview loads.</p>`}
    <form data-kitchen-reset-form class="kitchen-reset-dialog__form">
      <label><span>Type <strong>${kitchenResetConfirmation}</strong> to confirm</span><input name="confirmation" required autocomplete="off" spellcheck="false" pattern="${kitchenResetConfirmation}" ${ready ? "" : "disabled"}></label>
      <div><button class="button button--danger" type="submit" ${ready && !busy ? "" : "disabled"}>Permanently start over</button><button class="text-button" type="button" data-action="cancel-kitchen-reset">Keep my kitchen</button></div>
      <small>This cannot be undone. Finite keeps only a non-content reset receipt so an interrupted request cannot delete twice.</small>
    </form>
  </dialog>`;
};

const themeCore = (theme: ThemeDefinition): ThemeCoreTokens => Object.fromEntries(themeCoreTokenKeys.map((key) => [key, theme.tokens[key]])) as ThemeCoreTokens;
const allThemes = (): ThemeDefinition[] => [...themeCatalog.builtIns, ...themeCatalog.custom];
const currentThemeDraft = (): ThemeDefinition => themeCatalog.custom.find((theme) => theme.themeId === themeEditingId) ?? themeCatalog.activeTheme;
const allSkins = (): SkinDefinition[] => [...skinCatalog.builtIns, ...skinCatalog.custom];
const currentSkinDraft = (): SkinDefinition => skinCatalog.custom.find((skin) => skin.skinId === skinEditingId) ?? skinCatalog.activeSkin;
const skinTraitLabel = (value: string): string => value.replaceAll("-", " ").replace(/^./, (letter) => letter.toUpperCase());
const skinTraitOptions: Record<keyof SkinRecipe, readonly string[]> = {
  typeStyle: ["grotesk", "editorial", "system", "humanist"],
  headingScale: ["restrained", "balanced", "expressive"],
  density: ["compact", "comfortable", "airy"],
  cornerStyle: ["square", "subtle", "rounded", "pill"],
  borderStyle: ["none", "hairline", "strong"],
  shadowStyle: ["none", "soft", "offset"],
  controlStyle: ["plain", "solid", "pill"],
  panelStyle: ["flat", "outlined", "layered"],
  motionStyle: ["none", "restrained", "expressive"],
};
const renderSkinCard = (skin: SkinDefinition): string => {
  const current = skin.skinId === skinCatalog.activeSkinId;
  const confirmingDelete = skin.skinId === skinDeleteId;
  return `<article class="skin-card skin-card--${escapeHtml(skin.skinId)}${current ? " is-current" : ""}" data-skin-card="${escapeHtml(skin.skinId)}">
    <div class="skin-card__sample" aria-hidden="true"><span>Finite</span><i></i><b>Make room.</b><small>One plan, calmly held.</small></div>
    <div class="skin-card__copy"><span>${skin.kind === "built_in" ? "Finite skin" : "Your skin"}</span><h3>${escapeHtml(skin.name)}</h3><p>${escapeHtml(skin.description)}</p></div>
    <button type="button" data-skin-apply="${escapeHtml(skin.skinId)}" ${current || busy ? "disabled" : ""}>${current ? "Current" : "Use skin"}</button>
    ${skin.kind === "custom" ? `<div class="skin-card__custom">${confirmingDelete ? `<button type="button" class="is-danger" data-skin-delete-confirm="${escapeHtml(skin.skinId)}">Delete permanently</button><button type="button" data-action="cancel-skin-delete">Keep</button>` : `<button type="button" data-skin-edit="${escapeHtml(skin.skinId)}">Edit</button><button type="button" data-skin-delete="${escapeHtml(skin.skinId)}">Delete</button>`}</div>` : ""}
  </article>`;
};
const renderThemeCard = (theme: ThemeDefinition): string => {
  const current = theme.themeId === themeCatalog.activeThemeId;
  const confirmingDelete = theme.themeId === themeDeleteId;
  return `<article class="theme-card${current ? " is-current" : ""}" data-theme-card="${escapeHtml(theme.themeId)}">
    <div class="theme-card__swatches" aria-hidden="true"><i style="background:${theme.tokens.paper}"></i><i style="background:${theme.tokens.panel}"></i><i style="background:${theme.tokens.accent}"></i><i style="background:${theme.tokens.deep}"></i><i style="background:${theme.tokens.signal}"></i></div>
    <div class="theme-card__copy"><span>${theme.kind === "built_in" ? "Finite palette" : "Your palette"} · ${theme.mode}</span><h3>${escapeHtml(theme.name)}</h3></div>
    <button type="button" data-theme-apply="${escapeHtml(theme.themeId)}" ${current || busy ? "disabled" : ""}>${current ? "Current" : "Use palette"}</button>
    ${theme.kind === "custom" ? `<div class="theme-card__custom">${confirmingDelete ? `<button type="button" class="is-danger" data-theme-delete-confirm="${escapeHtml(theme.themeId)}">Delete permanently</button><button type="button" data-action="cancel-theme-delete">Keep</button>` : `<button type="button" data-theme-edit="${escapeHtml(theme.themeId)}">Edit</button><button type="button" data-theme-delete="${escapeHtml(theme.themeId)}">Delete</button>`}</div>` : ""}
  </article>`;
};

const renderThemeSettingsDialog = (): string => {
  const draft = currentThemeDraft();
  const skinDraft = currentSkinDraft();
  const core = themeCore(draft);
  const editing = themeEditingId !== null;
  const editingSkin = skinEditingId !== null;
  return `<dialog class="theme-settings-dialog" data-theme-settings-dialog aria-labelledby="theme_settings_title">
    <form method="dialog" class="theme-settings-dialog__close"><button aria-label="Close appearance settings">×</button></form>
    <header class="theme-settings-dialog__head"><p class="eyebrow">Appearance / this kitchen</p><h2 id="theme_settings_title">Choose how Finite feels.</h2><p>Skins change Finite’s visual character without moving its layout. Palettes set colour independently. Plan identity, authority and accepted truth stay unchanged.</p></header>
    <section class="appearance-section" aria-labelledby="skin_heading"><div class="appearance-section__head"><p class="eyebrow">01 / Skin</p><h3 id="skin_heading">Visual character</h3><p>Typography, scale, spacing, edges, depth, controls, panels and motion.</p></div><div class="skin-gallery">${allSkins().map(renderSkinCard).join("")}</div></section>
    <details class="theme-maker skin-maker" ${editingSkin ? "open" : ""}>
      <summary><span>${editingSkin ? "Editing your skin" : "Custom skin"}</span><strong>${editingSkin ? escapeHtml(skinDraft.name) : "Compose a recipe"}</strong><small>Bounded visual traits</small></summary>
      <form data-skin-custom-form>
        <input type="hidden" name="skinId" value="${editingSkin ? escapeHtml(skinDraft.skinId) : ""}">
        <div class="theme-maker__identity"><label><span>Name</span><input name="name" required maxlength="60" value="${editingSkin ? escapeHtml(skinDraft.name) : ""}" placeholder="Calm studio"></label><label><span>Description</span><input name="description" required maxlength="160" value="${editingSkin ? escapeHtml(skinDraft.description) : ""}" placeholder="A quiet, spacious working surface."></label></div>
        <div class="skin-trait-grid">${skinTraitKeys.map((key) => `<label><span>${escapeHtml(skinTraitLabel(key))}</span><select name="${key}">${skinTraitOptions[key].map((value) => `<option value="${value}" ${skinDraft.recipe[key] === value ? "selected" : ""}>${escapeHtml(skinTraitLabel(value))}</option>`).join("")}</select></label>`).join("")}</div>
        <div class="theme-maker__actions"><button class="button" type="submit" ${busy ? "disabled" : ""}>${editingSkin ? "Save and use changes" : "Save and use custom skin"}</button>${editingSkin ? `<button class="text-button" type="button" data-action="new-custom-skin">Make another instead</button>` : ""}</div>
        <p class="theme-maker__boundary">Skin recipes use validated choices only. They cannot contain CSS, selectors, markup, scripts, URLs, fonts or assets.</p>
      </form>
    </details>
    <section class="appearance-section appearance-section--palette" aria-labelledby="palette_heading"><div class="appearance-section__head"><p class="eyebrow">02 / Palette</p><h3 id="palette_heading">Colour and contrast</h3><p>Keep your skin and change only its colour roles.</p></div><div class="theme-gallery" aria-label="Available palettes">${allThemes().map(renderThemeCard).join("")}</div></section>
    <details class="theme-maker" ${editing ? "open" : ""}>
      <summary><span>${editing ? "Editing your palette" : "Custom palette"}</span><strong>${editing ? escapeHtml(draft.name) : "Make your own"}</strong><small>Contrast validated before save</small></summary>
      <form data-theme-custom-form>
        <input type="hidden" name="themeId" value="${editing ? escapeHtml(draft.themeId) : ""}">
        <div class="theme-maker__identity">
          <label><span>Name</span><input name="name" required maxlength="60" value="${editing ? escapeHtml(draft.name) : ""}" placeholder="Quiet studio"></label>
          <label><span>Mode</span><select name="mode"><option value="light" ${draft.mode === "light" ? "selected" : ""}>Light</option><option value="dark" ${draft.mode === "dark" ? "selected" : ""}>Dark</option></select></label>
        </div>
        <div class="theme-token-grid">${themeCoreTokenKeys.map((key) => `<label><span>${escapeHtml(key.replace(/([A-Z])/g, " $1"))}</span><input type="color" name="${key}" value="${core[key]}"><code>${core[key]}</code></label>`).join("")}</div>
        <div class="theme-maker__actions"><button class="button" type="submit" ${busy ? "disabled" : ""}>${editing ? "Save and use changes" : "Save and use custom palette"}</button>${editing ? `<button class="text-button" type="button" data-action="new-custom-theme">Make another instead</button>` : ""}</div>
        <p class="theme-maker__boundary">Finite checks text contrast, focus visibility and signal surfaces. Custom palettes cannot contain CSS, selectors, scripts, URLs, fonts or assets.</p>
      </form>
    </details>
  </dialog>`;
};

const violationMessage = (code: string): string => ({
  MINIMUM_BUFFER: "This would use more breathing room than you allowed.",
  LOCKED_COMPLETION_DATE: "This would move a date you marked as fixed.",
  LOCKED_COMMITMENT: "This would change something you marked as fixed.",
  RELATIONSHIP_CONSTRAINT: "This combination conflicts with another part of the plan.",
  EVIDENCE_REQUIRED: "This needs current evidence before it is safe to rely on.",
  INSUFFICIENT_CAPACITY: "The current plan does not have enough room for this combination.",
}[code] ?? "This option conflicts with one of the plan's current boundaries.");

const money = (minor: number): string => new Intl.NumberFormat("en-AU", {
  style: "currency", currency: "AUD", maximumFractionDigits: 0,
}).format(minor / 100);

const announce = (value: string): void => {
  message = value;
  messageScope = currentMessageScope();
  announcer.textContent = value;
};

const objectiveLabel = (objective: string): string => ({
  preserve_comfort: "Protect comfort",
  preserve_experience: "Protect the guest experience",
  preserve_buffer: "Protect breathing room",
  preserve_contingency: "Protect contingency",
  preserve_schedule: "Protect the handover",
  balanced: "Smallest balanced change",
  custom: "Custom route",
}[objective] ?? objective.replaceAll("_", " "));

const currentArrival = (): ArrivalOrder | null => arrivalResult.ok && arrivalResult.order ? arrivalResult.order : null;
const currentMessageScope = (): string => {
  const kernel = runtime.kernel;
  const arrival = currentArrival();
  return JSON.stringify({
    planId: kernel.profile.planId,
    profileId: kernel.profile.profileId,
    revision: kernel.revision,
    lifecycleStatus: kernel.lifecycleStatus,
    activeEventId: kernel.activeEventId,
    stagedCandidateId: kernel.stagedCandidate?.candidateId ?? null,
    approvalId: kernel.approval?.approvalId ?? null,
    lifecycleChangeId: kernel.pendingLifecycleChange?.lifecycleChangeId ?? null,
    lifecycleConfirmationId: kernel.lifecycleConfirmation?.confirmationId ?? null,
    groupDecisionId: kernel.pendingGroupDecision?.groupDecisionId ?? null,
    groupDecisionConfirmationId: kernel.groupDecisionConfirmation?.confirmationId ?? null,
    externalActionChangeId: kernel.pendingExternalAction?.externalActionChangeId ?? null,
    externalActionConfirmationId: kernel.externalActionConfirmation?.confirmationId ?? null,
    draftId: runtime.pendingPlanDraft?.draftId ?? null,
    planActivationConfirmationId: runtime.planActivationConfirmation?.confirmationId ?? null,
    arrivalId: arrival?.orderId ?? null,
    arrivalVersion: arrival?.version ?? null,
    arrivalStatus: arrival?.status ?? null,
  });
};
const pendingDraftMatchesArrival = (): boolean => {
  const draft = runtime.pendingPlanDraft;
  const orientation = arrivalResult.ok ? arrivalResult.orientation : undefined;
  if (!draft || !orientation) return Boolean(draft);
  const source = draft.sourceArrival;
  if (!source) return false;
  return orientation.interpretationIsCurrent
    && source.orderId === orientation.order.orderId
    && source.orderVersion === orientation.exactOrderVersion
    && source.orderChecksum === orientation.exactOrderChecksum;
};

const currentCodexHandoff = () => createCodexHandoff({
  siteOrigin: location.origin,
  inline: Boolean(modelContext),
  order: currentArrival(),
  entryIntent: currentArrival()
    ? "resume_handoff"
    : new URLSearchParams(location.search).has("kitchen") || new URLSearchParams(location.search).has("lab")
      ? "continue_current"
      : "start_new",
  plan: {
    planId: runtime.kernel.profile.planId,
    profileId: runtime.kernel.profile.profileId,
    profileHash: runtime.kernel.profile.profileHash,
    revision: runtime.kernel.revision,
    snapshotHash: runtime.kernel.acceptedTruth.snapshotHash,
  },
});

const renderCodexHandoffButton = (): string => {
  const handoff = currentCodexHandoff();
  return `<button type="button" class="codex-handoff-trigger" data-action="open-codex-handoff" aria-haspopup="dialog"><span aria-hidden="true"></span>${escapeHtml(handoff.buttonLabel)}</button>`;
};

const renderCodexHandoffDialog = (): string => {
  const handoff = currentCodexHandoff();
  const order = currentArrival();
  return `<dialog class="codex-handoff-dialog" data-codex-handoff-dialog aria-labelledby="codex_handoff_title">
    <form method="dialog" class="codex-handoff-sheet">
      <header>
        <div><p class="eyebrow">Operator handoff / no account connection</p><h2 id="codex_handoff_title">${escapeHtml(handoff.title)}</h2></div>
        <button class="codex-handoff-close" value="close" aria-label="Close Codex handoff">×</button>
      </header>
      <p class="codex-handoff-lede">${escapeHtml(handoff.detail)}</p>
      <ol class="codex-handoff-steps">
        <li><span>01</span><p>Open your Codex task.</p></li>
        <li><span>02</span><p>Paste the introduction below.</p></li>
        <li><span>03</span><p>Codex opens Finite and reads the live kitchen.</p></li>
      </ol>
      <label class="codex-handoff-prompt"><span>What Codex receives</span><textarea readonly spellcheck="false" data-codex-handoff-prompt>${escapeHtml(handoff.prompt)}</textarea></label>
      <div class="codex-handoff-actions">
        <button type="button" class="button" data-action="copy-codex-handoff">Copy handoff prompt</button>
        <p data-codex-handoff-status>Nothing has been sent to Codex yet.</p>
      </div>
      <dl class="codex-handoff-boundary">
        <div><dt>Kitchen</dt><dd>${escapeHtml(handoff.copiedPayload.siteOrigin)}</dd></div>
        <div><dt>Order receipt</dt><dd>${order ? `Version ${order.version} · ${escapeHtml(order.checksum.slice(0, 12))}…` : "No order yet"}</dd></div>
        <div><dt>Copied</dt><dd>Directions only</dd></div>
        <div><dt>Not copied</dt><dd>Credentials, plan contents, authority</dd></div>
      </dl>
    </form>
  </dialog>`;
};

const bindCodexHandoffInteractions = (): void => {
  const dialog = root.querySelector<HTMLDialogElement>("[data-codex-handoff-dialog]");
  root.querySelectorAll<HTMLButtonElement>("[data-action='open-codex-handoff']").forEach((trigger) => trigger.addEventListener("click", () => dialog?.showModal()));
  dialog?.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
  root.querySelector<HTMLButtonElement>("[data-action='copy-codex-handoff']")?.addEventListener("click", async (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    const prompt = currentCodexHandoff().prompt;
    const status = root.querySelector<HTMLElement>("[data-codex-handoff-status]");
    try {
      await navigator.clipboard.writeText(prompt);
      button.textContent = "Copied — open Codex";
      if (status) status.textContent = "Copied. Nothing has been sent or connected; paste it into Codex when you are ready.";
      announce("Codex handoff copied. Nothing has been sent yet.");
    } catch {
      const textarea = root.querySelector<HTMLTextAreaElement>("[data-codex-handoff-prompt]");
      textarea?.focus();
      textarea?.select();
      if (status) status.textContent = "Automatic copying is unavailable here. The complete prompt is selected for you to copy.";
      announce("The handoff prompt is selected and ready to copy.");
    }
  });
};

const arrivalStatus = (order: ArrivalOrder): { label: string; title: string; detail: string } => {
  if (order.status === "waiting_for_codex") return modelContext
    ? { label: "Saved · ready for Codex", title: "Your order is safe. Codex has not processed the latest version yet.", detail: "You can keep adding details here. When Codex opens the order, it receives the full brief and every change since its last checkpoint." }
    : { label: "Saved · waiting for Codex", title: "Your order is safe. Nothing is pretending to process in the background.", detail: "Open Codex when you are ready and ask it to open your Finite arrival. It will receive this exact version and every saved detail." };
  if (order.status === "codex_reviewing") return { label: "Codex reviewing", title: "The operator has checkpointed your latest order.", detail: "You may still add or correct facts. Any change creates a new order version and stale Codex work will be refused." };
  if (order.status === "clarification_required") return { label: "Your answer needed", title: "Codex needs one decision before it can keep cooking.", detail: "Your answer is appended as human-supplied input. Codex cannot fill it in for you." };
  if (order.status === "proposed_plan_ready") return { label: "Proposed plan ready", title: "Codex has staged its interpretation for your review.", detail: "This is still a proposal. Accepted plan truth changes only through an exact human confirmation on the Site." };
  if (order.status === "interpretation_confirmed") return { label: "Brief confirmed", title: "Codex can now construct the plan.", detail: "You confirmed what Codex understood. This review does not authorize plan activation or any external action." };
  if (order.status === "awaiting_human_authority") return { label: "Approval needed", title: "One exact plan is waiting for your authority.", detail: "Review the proposed outcome here. Codex cannot press the approval control." };
  return { label: order.status.replaceAll("_", " "), title: "This arrival is complete.", detail: "Its immutable plan and receipt remain available in the kitchen." };
};

const renderArrival = (manifest: SurfaceManifest): void => {
  const order = currentArrival();
  const status = order ? arrivalStatus(order) : null;
  const interpretation = order?.interpretation;
  const question = order?.pendingClarification;
  const inputTrail = order?.inputs.slice(-5).reverse() ?? [];
  surfaceRoot.dataset.profile = "arrival";
  surfaceRoot.setAttribute("aria-busy", String(busy));
  surfaceRoot.innerHTML = `
    <header class="site-header arrival-header">
      <a class="brand" href="#main" aria-label="Finite home"><span>finite</span><i></i></a>
      <p class="arrival-header__mode">Arrival / a new finite plan</p>
      <div class="identity-cluster">
        ${order ? renderCodexHandoffButton() : ""}
        <div class="operator-status"><span></span>${modelContext ? "Codex browser present" : "Saved kitchen"}</div>
        ${renderIdentityPill()}
      </div>
    </header>
    <main id="main" class="arrival-main">
      ${!order ? `
        <section class="arrival-compose" aria-labelledby="arrival_title">
          <div class="arrival-compose__intro">
            <p class="eyebrow">Start with the outcome</p>
            <h1 id="arrival_title">What are you trying to make <em>happen?</em></h1>
            <p class="arrival-compose__lede">Tell Finite in your own language. One sentence is enough. You do not need to choose a plan type, build a dashboard, or know every detail yet.</p>
            <p class="arrival-compose__promise"><span>Your words stay intact.</span> Codex interprets them later; Finite does not pretend the work has already started.</p>
          </div>
          <form class="arrival-order" data-arrival-form="create">
            <div class="arrival-order__head"><p class="eyebrow">Your starting point</p><span>Only this is required</span></div>
            <label class="arrival-order__outcome"><span>What needs to happen?</span><textarea name="rawOutcome" required maxlength="4000" placeholder="I’m trying to…"></textarea><small>Write it how you would say it. Finite keeps your exact words.</small></label>
            <div class="arrival-examples" aria-label="Example outcomes">
              <span>Need a starting point?</span>
              <button type="button" data-arrival-example="Plan a three-week Europe trip around my fixed flights, with room to change as prices and ideas move.">A trip</button>
              <button type="button" data-arrival-example="Get my renovation to handover without losing the parts of the design I care about.">A renovation</button>
              <button type="button" data-arrival-example="Deliver an event that can absorb guest, supplier and programme changes without falling apart.">An event</button>
              <button type="button" data-arrival-example="Help me turn a messy outcome with limited time and resources into a plan that can keep adapting.">Something else</button>
            </div>
            <details class="arrival-more">
              <summary><span>Add context</span><strong>Dates, limits, commitments, or links</strong><small>Optional</small></summary>
              <div class="arrival-fields">
                <label><span>When does it need to happen?</span><input name="deadline" maxlength="200" placeholder="A date, window, or ‘not sure’"></label>
                <label><span>What is finite?</span><input name="finiteLimit" maxlength="300" placeholder="Money, time, capacity, energy—or none yet"></label>
                <label><span>What must not move?</span><input name="hardConstraint" maxlength="500" placeholder="One known commitment or hard edge"></label>
                <label><span>Evidence or useful links</span><input name="evidence" maxlength="1000" placeholder="Receipts, booking refs, documents, URLs"></label>
              </div>
            </details>
            <div class="arrival-order__actions"><button class="button arrival-order__submit" type="submit" ${busy ? "disabled" : ""}>Save this starting point</button><p>Saved first. Interpreted only when Codex opens it.</p></div>
          </form>
          <button type="button" class="arrival-codex-start" data-action="open-codex-handoff" aria-haspopup="dialog"><span>Prefer to talk it through?</span><strong>Start with Codex</strong><small>Same kitchen. Same saved starting point.</small></button>
        </section>
        ${message ? `<div class="service-message" role="status">${escapeHtml(message)}</div>` : ""}` : `
        <section class="arrival-order-head" aria-label="Arrival status">
          <h1 id="arrival_order_title" class="sr-only">${escapeHtml(order.rawOutcome)}</h1>
          <details class="arrival-order-source">
            <summary><span>Original order · version ${order.version}</span><strong>View what you asked Finite to make happen</strong></summary>
            <p>${escapeHtml(order.rawOutcome)}</p>
          </details>
          <aside class="arrival-state"><span>${escapeHtml(status?.label)}</span><div><h2>${escapeHtml(status?.title)}</h2><p>${escapeHtml(status?.detail)}</p></div><small>Order v${order.version}</small></aside>
        </section>
        ${message ? `<div class="service-message" role="status">${escapeHtml(message)}</div>` : ""}
        ${question ? `<section class="arrival-question"><p class="eyebrow">One question from Codex</p><h2>${escapeHtml(question.prompt)}</h2><form data-arrival-form="answer"><label><span>Your answer</span><input name="answer" required maxlength="1000" ${question.answerKind === "date" ? "type=\"date\"" : ""}></label><button class="button" type="submit" ${busy ? "disabled" : ""}>Save my answer</button></form><small>Your answer is saved as human input. Codex cannot fill it in for you.</small></section>` : ""}
        ${order.status === "proposed_plan_ready" && interpretation ? `<section class="arrival-review" aria-labelledby="arrival_review_title">
          <div><p class="eyebrow">Your brief / ready for review</p><h2 id="arrival_review_title">Does this capture what you want me to build?</h2><p class="arrival-review__summary">${escapeHtml(interpretation.summary)}</p><p class="arrival-review__boundary">Confirming releases this exact brief to Codex for plan construction. It does not activate a plan, spend money, make a booking, or authorize an external action.</p></div>
          <button class="button" data-action="confirm-arrival-interpretation" ${busy ? "disabled" : ""}>Yes, build from this brief</button>
          <small>Need a change? Open “Add or correct something” below. Finite will invalidate this proposal automatically.</small>
        </section>` : ""}
        ${interpretation ? `<details class="arrival-interpretation">
          <summary class="arrival-interpretation__head"><div><p class="eyebrow">Codex interpretation / not human fact</p><h2>Review assumptions and source details</h2></div><span>${interpretation.complete ? "Complete proposal" : "Work in progress"}</span></summary>
          <div class="arrival-interpretation__grid">
            <article class="arrival-interpretation__family"><span>Working shape</span><strong>${escapeHtml(humanLabel(interpretation.inferredFamily ?? "Still being inferred"))}</strong><p>Codex selected this planning grammar. You can correct it before anything becomes accepted.</p></article>
            <article><span>What I’m working from</span>${renderHumanValue(interpretation.known)}</article>
            <article><span>What Codex currently thinks</span>${renderHumanValue(interpretation.inferred)}<p class="interpretation-note">These are working assumptions, not facts you supplied.</p></article>
            <article><span>What I still need</span>${renderTextList(interpretation.missing, "Nothing currently blocking")}</article>
            ${interpretation.dependencies?.length ? `<article><span>Work still outside the brief</span><ul class="interpretation-list">${interpretation.dependencies.map((dependency) => `<li><strong>${escapeHtml(dependency.title)}</strong><small class="interpretation-provenance">${escapeHtml(humanLabel(dependency.kind))} · ${escapeHtml(humanLabel(dependency.status))}${dependency.blocking ? " · blocking" : ""}</small>${dependency.detail ? `<p>${escapeHtml(dependency.detail)}</p>` : ""}</li>`).join("")}</ul></article>` : ""}
            ${interpretation.contradictions.length ? `<article class="is-warning"><span>Things that do not agree yet</span>${renderTextList(interpretation.contradictions, "No contradictions")}</article>` : ""}
          </div>
        </details>` : ""}
        ${renderPlanDraft()}
        <details class="arrival-continuity">
          <summary><span>Order controls</span><strong>Add or correct something</strong><small>New facts create a fresh version and invalidate stale work.</small></summary>
          <div class="arrival-continuity__body"><div><p class="eyebrow">Keep shaping the order</p><h2>Add something Codex must know.</h2><p>New facts are append-only. If Codex is already working, this creates a fresh version and invalidates stale staging automatically.</p></div>
            <form data-arrival-form="append">
              <label><span>Kind</span><select name="kind"><option value="detail">Detail</option><option value="constraint">Hard constraint</option><option value="preference">Preference</option><option value="commitment">Commitment</option><option value="correction">Correction</option><option value="evidence_reference">Evidence reference</option></select></label>
              <label><span>What changed or was missing?</span><textarea name="detail" required maxlength="2000" placeholder="Add the fact in your own words"></textarea></label>
              <button class="button" type="submit" ${busy ? "disabled" : ""}>Append to order</button>
            </form>
          </div>
        </details>
        ${inputTrail.length ? `<details class="arrival-history"><summary>Recent details you supplied</summary><ol>${inputTrail.map((input) => `<li><span>${escapeHtml(inputKindLabel(input.kind))} · ${escapeHtml(inputSurfaceLabel(input.sourceSurface))}</span>${renderHumanValue(input.payload)}</li>`).join("")}</ol></details>` : ""}
      `}
      ${labMode ? `<details class="protocol-lab"><summary>Protocol lab</summary><pre>${escapeHtml(JSON.stringify({ modelContext: typeof document.modelContext, arrival: order, manifestHash: manifest.manifestHash, tools: adapter?.inventory() ?? [] }, null, 2))}</pre></details>` : ""}
    </main>
    <footer><p>The human orders. Codex operates. Finite keeps the work exact.</p><span>${order ? `Arrival · version ${order.version}` : "No arrival waiting · accepted plans remain available"}</span></footer>
    ${renderCodexHandoffDialog()}
    ${renderKitchenResetDialog()}
    ${renderThemeSettingsDialog()}`;
  bindArrivalInteractions();
};

const refreshArrival = async (): Promise<void> => {
  arrivalResult = await arrivalRepository.open();
};

const submitArrivalOrder = async (form: HTMLFormElement): Promise<void> => {
  if (busy) return;
  const data = new FormData(form);
  const rawOutcome = String(data.get("rawOutcome") ?? "").trim();
  if (!rawOutcome) return;
  busy = true;
  announce("Saving your exact order…");
  await render();
  const structured = Object.fromEntries(["deadline", "finiteLimit", "hardConstraint"].map((key) => [key, String(data.get(key) ?? "").trim()]).filter(([, value]) => value));
  const evidence = String(data.get("evidence") ?? "").trim();
  arrivalResult = await arrivalRepository.create({ idempotencyKey: `site-arrival-${crypto.randomUUID()}`, rawOutcome, structured, attachments: evidence ? [{ kind: "human_reference", value: evidence }] : [], sourceSurface: modelContext ? "inline" : "site" });
  busy = false;
  announce(arrivalResult.ok ? "Your order is saved. Codex has not processed it yet." : `The order was not saved: ${arrivalResult.code}`);
  await render();
};

const appendArrivalDetail = async (form: HTMLFormElement, answer = false): Promise<void> => {
  const order = currentArrival();
  if (!order || busy) return;
  const data = new FormData(form);
  const value = String(data.get(answer ? "answer" : "detail") ?? "").trim();
  if (!value) return;
  busy = true;
  announce("Appending your update to the exact order…");
  await render();
  arrivalResult = await arrivalRepository.appendInput({
    orderId: order.orderId,
    expectedVersion: order.version,
    kind: answer ? "answer" : String(data.get("kind") ?? "detail") as never,
    payload: answer ? { questionId: order.pendingClarification?.questionId, value } : { text: value },
    sourceSurface: modelContext ? "inline" : "site",
  });
  busy = false;
  announce(arrivalResult.ok ? (answer ? "Your answer is saved. Codex must re-open the new order version." : "Your update is saved. Any stale Codex work will now be refused.") : `The update was not saved: ${arrivalResult.code}`);
  await render();
};

const confirmArrivalInterpretation = async (): Promise<void> => {
  const order = currentArrival();
  if (!order || order.status !== "proposed_plan_ready" || busy) return;
  busy = true;
  announce("Confirming the exact interpretation for plan construction…");
  await render();
  arrivalResult = await arrivalRepository.reviewInterpretation({
    orderId: order.orderId,
    expectedVersion: order.version,
    expectedChecksum: order.checksum,
    sourceSurface: modelContext ? "inline" : "site",
  });
  busy = false;
  announce(arrivalResult.ok ? "Brief confirmed. Codex may construct a plan, but no plan is activated yet." : `The brief was not confirmed: ${arrivalResult.code}`);
  await render();
};

const openKitchenReset = async (): Promise<void> => {
  if (busy) return;
  kitchenResetPreview = await resetRepository.preview();
  if (!kitchenResetPreview.ok) announce("Finite could not verify the reset scope. Nothing was deleted.");
  await render();
  const dialog = root.querySelector<HTMLDialogElement>("[data-kitchen-reset-dialog]");
  dialog?.showModal();
  dialog?.querySelector<HTMLInputElement>("input[name='confirmation']")?.focus();
};

const submitKitchenReset = async (form: HTMLFormElement): Promise<void> => {
  if (busy || !kitchenResetPreview?.ok) return;
  const confirmation = String(new FormData(form).get("confirmation") ?? "");
  if (confirmation !== kitchenResetConfirmation) return;
  busy = true;
  const submit = form.querySelector<HTMLButtonElement>("button[type='submit']");
  if (submit) { submit.disabled = true; submit.textContent = "Clearing this kitchen…"; }
  const result = await resetRepository.reset({ confirmation, idempotencyKey: `site-reset-${crypto.randomUUID()}`, sourceSurface: "site" });
  if (result.ok && result.code === "KITCHEN_RESET") {
    clearFiniteScope(localStorage, authSession.storageScope);
    if (localStorage.getItem(legacyCacheOwnerKey) === authSession.storageScope) localStorage.removeItem(legacyCacheOwnerKey);
    location.assign("/");
    return;
  }
  busy = false;
  announce(`Nothing was deleted: ${result.code}`);
  kitchenResetPreview = await resetRepository.preview();
  await render();
  root.querySelector<HTMLDialogElement>("[data-kitchen-reset-dialog]")?.showModal();
};

const bindKitchenResetInteractions = (): void => {
  root?.querySelector<HTMLButtonElement>("[data-action='open-kitchen-reset']")?.addEventListener("click", () => { void openKitchenReset(); });
  root?.querySelector<HTMLButtonElement>("[data-action='cancel-kitchen-reset']")?.addEventListener("click", () => root.querySelector<HTMLDialogElement>("[data-kitchen-reset-dialog]")?.close());
  root?.querySelector<HTMLFormElement>("[data-kitchen-reset-form]")?.addEventListener("submit", (event) => { event.preventDefault(); void submitKitchenReset(event.currentTarget as HTMLFormElement); });
};

const themeSlug = (name: string): string => name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 38) || "theme";

const openThemeSettings = async (): Promise<void> => {
  if (busy) return;
  try { await Promise.all([refreshThemeCatalog(), refreshSkinCatalog()]); }
  catch { announce("Finite could not refresh appearance settings. Your current appearance is unchanged."); }
  themeSettingsOpen = true;
  themeEditingId = null;
  themeDeleteId = null;
  skinEditingId = null;
  skinDeleteId = null;
  await render();
};

const skinSlug = (name: string): string => name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 38) || "skin";
const applySkinChoice = async (skinId: string): Promise<void> => {
  if (busy || skinId === skinCatalog.activeSkinId) return;
  busy = true;
  const result = await skinRepository.setActive({ skinId, idempotencyKey: `site-skin-apply-${crypto.randomUUID()}`, sourceSurface: "site" });
  busy = false;
  if (result.ok && result.code === "SKIN_APPLIED" && result.skin) {
    applySkinDefinition(result.skin); await refreshSkinCatalog(); announce(`${result.skin.name} is now your Finite skin.`);
  } else announce(`The skin was not changed: ${result.code}`);
  await render();
};

const saveCustomSkin = async (form: HTMLFormElement): Promise<void> => {
  if (busy) return;
  const data = new FormData(form); const name = String(data.get("name") ?? "").trim(); const existingId = String(data.get("skinId") ?? "");
  const skinId = existingId || `custom_${skinSlug(name)}-${crypto.randomUUID().slice(0, 8)}`;
  const recipe = Object.fromEntries(skinTraitKeys.map((key) => [key, String(data.get(key) ?? "")])) as SkinRecipe;
  const draft = { skinId, name, description: String(data.get("description") ?? "").trim(), recipe };
  busy = true;
  const preview = await skinRepository.preview(draft); if (!preview.ok) {
    busy = false; announce(`That skin needs adjustment: ${(preview.issues ?? [preview.message ?? preview.code]).slice(0, 2).join(" ")}`); await render(); return;
  }
  const saved = await skinRepository.save({ ...draft, idempotencyKey: `site-skin-save-${crypto.randomUUID()}`, sourceSurface: "site" });
  if (!saved.ok) { busy = false; announce(`The custom skin was not saved: ${saved.code}`); await render(); return; }
  const applied = await skinRepository.setActive({ skinId, idempotencyKey: `site-skin-apply-${crypto.randomUUID()}`, sourceSurface: "site" });
  busy = false;
  if (applied.ok && applied.skin) { applySkinDefinition(applied.skin); await refreshSkinCatalog(); skinEditingId = skinId; announce(`${applied.skin.name} is saved and active.`); }
  else announce(`The custom skin was saved but could not be applied: ${applied.code}`);
  await render();
};

const deleteCustomSkin = async (skinId: string): Promise<void> => {
  if (busy) return; busy = true;
  const result = await skinRepository.delete({ skinId, idempotencyKey: `site-skin-delete-${crypto.randomUUID()}`, sourceSurface: "site" });
  busy = false; skinDeleteId = null;
  if (result.ok && result.code === "CUSTOM_SKIN_DELETED") { await refreshSkinCatalog(); skinEditingId = null; announce("The custom skin was deleted."); }
  else announce(`The custom skin was not deleted: ${result.code}`);
  await render();
};

const applyThemeChoice = async (themeId: string): Promise<void> => {
  if (busy || themeId === themeCatalog.activeThemeId) return;
  busy = true;
  const result = await themeRepository.setActive({ themeId, idempotencyKey: `site-theme-apply-${crypto.randomUUID()}`, sourceSurface: "site" });
  busy = false;
  if (result.ok && result.code === "THEME_APPLIED" && result.theme) {
    applyThemeDefinition(result.theme);
    await refreshThemeCatalog();
    announce(`${result.theme.name} is now your Finite palette.`);
  } else announce(`The palette was not changed: ${result.code}`);
  await render();
};

const saveCustomTheme = async (form: HTMLFormElement): Promise<void> => {
  if (busy) return;
  const data = new FormData(form);
  const name = String(data.get("name") ?? "").trim();
  const existingId = String(data.get("themeId") ?? "");
  const themeId = existingId || `custom_${themeSlug(name)}-${crypto.randomUUID().slice(0, 8)}`;
  const mode = String(data.get("mode")) as ThemeMode;
  const tokens = Object.fromEntries(themeCoreTokenKeys.map((key) => [key, String(data.get(key) ?? "")])) as ThemeCoreTokens;
  const draft = { themeId, name, mode, tokens };
  busy = true;
  const preview = await themeRepository.preview(draft);
  if (!preview.ok) {
    busy = false;
    announce(`That palette needs adjustment: ${(preview.issues ?? [preview.message ?? preview.code]).slice(0, 2).join(" ")}`);
    return;
  }
  const saved = await themeRepository.save({ ...draft, idempotencyKey: `site-theme-save-${crypto.randomUUID()}`, sourceSurface: "site" });
  if (!saved.ok) {
    busy = false;
    announce(`The custom palette was not saved: ${saved.code}`);
    return;
  }
  const applied = await themeRepository.setActive({ themeId, idempotencyKey: `site-theme-apply-${crypto.randomUUID()}`, sourceSurface: "site" });
  busy = false;
  if (applied.ok && applied.theme) {
    applyThemeDefinition(applied.theme);
    await refreshThemeCatalog();
    themeEditingId = themeId;
    announce(`${applied.theme.name} is saved and active.`);
  } else announce(`The custom palette was saved but could not be applied: ${applied.code}`);
  await render();
};

const deleteCustomTheme = async (themeId: string): Promise<void> => {
  if (busy) return;
  busy = true;
  const result = await themeRepository.delete({ themeId, idempotencyKey: `site-theme-delete-${crypto.randomUUID()}`, sourceSurface: "site" });
  busy = false;
  themeDeleteId = null;
  if (result.ok) {
    await refreshThemeCatalog();
    themeEditingId = null;
    announce("The custom palette was deleted. Your available palettes are up to date.");
  } else announce(`The custom palette was not deleted: ${result.code}`);
  await render();
};

const bindThemeSettingsInteractions = (): void => {
  root?.querySelector<HTMLButtonElement>("[data-action='open-theme-settings']")?.addEventListener("click", () => { void openThemeSettings(); });
  const dialog = root?.querySelector<HTMLDialogElement>("[data-theme-settings-dialog]");
  dialog?.addEventListener("close", () => { themeSettingsOpen = false; themeDeleteId = null; skinDeleteId = null; });
  root?.querySelectorAll<HTMLButtonElement>("[data-skin-apply]").forEach((button) => button.addEventListener("click", () => { void applySkinChoice(button.dataset.skinApply ?? ""); }));
  root?.querySelectorAll<HTMLButtonElement>("[data-skin-edit]").forEach((button) => button.addEventListener("click", async () => { skinEditingId = button.dataset.skinEdit ?? null; skinDeleteId = null; await render(); root.querySelector<HTMLInputElement>("[data-skin-custom-form] input[name='name']")?.focus(); }));
  root?.querySelectorAll<HTMLButtonElement>("[data-skin-delete]").forEach((button) => button.addEventListener("click", async () => { skinDeleteId = button.dataset.skinDelete ?? null; await render(); }));
  root?.querySelectorAll<HTMLButtonElement>("[data-skin-delete-confirm]").forEach((button) => button.addEventListener("click", () => { void deleteCustomSkin(button.dataset.skinDeleteConfirm ?? ""); }));
  root?.querySelector<HTMLButtonElement>("[data-action='cancel-skin-delete']")?.addEventListener("click", async () => { skinDeleteId = null; await render(); });
  root?.querySelector<HTMLButtonElement>("[data-action='new-custom-skin']")?.addEventListener("click", async () => { skinEditingId = null; await render(); root.querySelector<HTMLInputElement>("[data-skin-custom-form] input[name='name']")?.focus(); });
  root?.querySelector<HTMLFormElement>("[data-skin-custom-form]")?.addEventListener("submit", (event) => { event.preventDefault(); void saveCustomSkin(event.currentTarget as HTMLFormElement); });
  root?.querySelectorAll<HTMLButtonElement>("[data-theme-apply]").forEach((button) => button.addEventListener("click", () => { void applyThemeChoice(button.dataset.themeApply ?? ""); }));
  root?.querySelectorAll<HTMLButtonElement>("[data-theme-edit]").forEach((button) => button.addEventListener("click", async () => { themeEditingId = button.dataset.themeEdit ?? null; themeDeleteId = null; await render(); root.querySelector<HTMLInputElement>("[data-theme-custom-form] input[name='name']")?.focus(); }));
  root?.querySelectorAll<HTMLButtonElement>("[data-theme-delete]").forEach((button) => button.addEventListener("click", async () => { themeDeleteId = button.dataset.themeDelete ?? null; await render(); }));
  root?.querySelectorAll<HTMLButtonElement>("[data-theme-delete-confirm]").forEach((button) => button.addEventListener("click", () => { void deleteCustomTheme(button.dataset.themeDeleteConfirm ?? ""); }));
  root?.querySelector<HTMLButtonElement>("[data-action='cancel-theme-delete']")?.addEventListener("click", async () => { themeDeleteId = null; await render(); });
  root?.querySelector<HTMLButtonElement>("[data-action='new-custom-theme']")?.addEventListener("click", async () => { themeEditingId = null; await render(); root.querySelector<HTMLInputElement>("[data-theme-custom-form] input[name='name']")?.focus(); });
  root?.querySelector<HTMLFormElement>("[data-theme-custom-form]")?.addEventListener("submit", (event) => { event.preventDefault(); void saveCustomTheme(event.currentTarget as HTMLFormElement); });
  root?.querySelectorAll<HTMLInputElement>("[data-theme-custom-form] input[type='color']").forEach((input) => input.addEventListener("input", () => { const code = input.parentElement?.querySelector("code"); if (code) code.textContent = input.value; }));
  if (themeSettingsOpen && dialog && !dialog.open) dialog.showModal();
};

function bindArrivalInteractions(): void {
  bindCodexHandoffInteractions();
  bindKitchenResetInteractions();
  bindThemeSettingsInteractions();
  root?.querySelector<HTMLFormElement>("[data-arrival-form='create']")?.addEventListener("submit", (event) => { event.preventDefault(); void submitArrivalOrder(event.currentTarget as HTMLFormElement); });
  root?.querySelector<HTMLFormElement>("[data-arrival-form='append']")?.addEventListener("submit", (event) => { event.preventDefault(); void appendArrivalDetail(event.currentTarget as HTMLFormElement); });
  root?.querySelector<HTMLFormElement>("[data-arrival-form='answer']")?.addEventListener("submit", (event) => { event.preventDefault(); void appendArrivalDetail(event.currentTarget as HTMLFormElement, true); });
  root?.querySelector<HTMLButtonElement>("[data-action='confirm-arrival-interpretation']")?.addEventListener("click", () => { void confirmArrivalInterpretation(); });
  root?.querySelectorAll<HTMLButtonElement>("[data-arrival-example]").forEach((button) => button.addEventListener("click", () => {
    const textarea = root.querySelector<HTMLTextAreaElement>("textarea[name='rawOutcome']");
    if (textarea) { textarea.value = button.dataset.arrivalExample ?? ""; textarea.focus(); }
  }));
  root?.querySelector<HTMLButtonElement>("[data-action='confirm-plan']")?.addEventListener("click", (event) => { void confirmPlanDraft((event.currentTarget as HTMLButtonElement).dataset.draft ?? ""); });
  root?.querySelector<HTMLButtonElement>("[data-action='open-plan-return']")?.addEventListener("click", async () => { draftReturnFormOpen = true; announce(""); await render(); root.querySelector<HTMLTextAreaElement>("[data-plan-return] textarea")?.focus(); });
  root?.querySelector<HTMLButtonElement>("[data-action='cancel-plan-return']")?.addEventListener("click", async () => { draftReturnFormOpen = false; await render(); });
  root?.querySelector<HTMLFormElement>("[data-plan-return]")?.addEventListener("submit", (event) => { event.preventDefault(); void returnPlanDraft(event.currentTarget as HTMLFormElement); });
  root?.querySelector<HTMLButtonElement>("[data-action='discard-returned-draft']")?.addEventListener("click", (event) => { void discardReturnedDraft((event.currentTarget as HTMLButtonElement).dataset.packet ?? ""); });
  root?.querySelector<HTMLButtonElement>("[data-action='end-demo']")?.addEventListener("click", async () => {
    const response = await fetch("/api/auth/demo/end", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    if (response.ok) location.reload();
    else announce("The demo session could not be ended safely.");
  });
}

const activeCandidates = (): Candidate[] => [...runtime.kernel.candidates.values()]
  .filter((candidate) => candidate.baseRevision === runtime.kernel.revision && candidate.eventId === runtime.kernel.activeEventId)
  .sort((a, b) => Number(b.valid) - Number(a.valid)
    || (runtime.kernel.profile.searchPolicy.objectives.indexOf(a.objective) < 0 ? Number.MAX_SAFE_INTEGER : runtime.kernel.profile.searchPolicy.objectives.indexOf(a.objective))
      - (runtime.kernel.profile.searchPolicy.objectives.indexOf(b.objective) < 0 ? Number.MAX_SAFE_INTEGER : runtime.kernel.profile.searchPolicy.objectives.indexOf(b.objective))
    || b.preferenceScore - a.preferenceScore);

const requireCode = (result: { code: string }, expected: string): void => {
  if (result.code !== expected) throw new Error(`Expected ${expected}; received ${result.code}.`);
};

const runAuthenticatedHandoffAcceptance = async (): Promise<void> => {
  if (!labMode || busy) return;
  busy = true;
  labAcceptanceResult = { status: "running" };
  announce("Running the authenticated three-kitchen handoff acceptance…");
  await render();
  try {
    const journeys = [];
    for (const profileId of ["travel", "renovation", "event"] as ProfileId[]) {
      const deviceA = new FinitePlanRuntime(profiles, new PlanSnapshotStore(new MemoryStorage()), profileId, undefined, [], () => new Date(), acceptedRepository);
      const hydratedA = await deviceA.hydrateAcceptedTruth();
      requireCode(hydratedA, "ACCEPTED_TRUTH_CURRENT");
      const fromRevision = deviceA.kernel.revision;
      if (fromRevision >= 3) {
        journeys.push({ profileId, status: "already_complete", revision: fromRevision });
        continue;
      }
      if (fromRevision !== 2) throw new Error(`${profileId} must begin the hosted handoff at revision 2; received ${fromRevision}.`);

      const recorded = deviceA.kernel.recordChangeEvent({
        type: "live_acceptance",
        title: `${profileId} authenticated cross-device acceptance`,
        costDeltaMinor: 10_000,
        daysDelta: 0,
        minimumBufferMinor: 0,
        evidenceRefs: ["evidence_current"],
        expectedRevision: fromRevision,
      });
      requireCode(recorded, "CHANGE_RECORDED");
      const event = recorded.event as { eventId: string };
      const compared = await deviceA.kernel.compareOptions({ eventId: event.eventId, generate: true });
      requireCode(compared, "OPTIONS_AVAILABLE");
      const chosen = (compared.options as Candidate[]).find((candidate) => candidate.valid);
      if (!chosen) throw new Error(`${profileId} produced no valid candidate.`);
      const staged = await deviceA.kernel.stageOption({ candidateId: chosen.candidateId, expectedRevision: fromRevision });
      requireCode(staged, "OPTION_STAGED");
      const stagedCandidate = staged.staged as Candidate;
      const approved = await deviceA.kernel.humanApprove({ candidateId: chosen.candidateId, warningsAcknowledged: stagedCandidate.warnings.map((warning) => String(warning.code)) });
      requireCode(approved, "HUMAN_APPROVAL_RECORDED");
      const approval = approved.approval as { approvalId: string; authorityChallengeId?: string };
      if (!approval.authorityChallengeId) throw new Error(`${profileId} did not create an authority challenge.`);

      const saved = await deviceA.saveOperatorSession({
        idempotencyKey: `hosted-phase3-${profileId}-r${fromRevision}`,
        kind: "decision_work",
        payload: { event: recorded.event, candidateId: chosen.candidateId, challengeId: approval.authorityChallengeId },
        ttlSeconds: 3600,
      });
      requireCode(saved, "OPERATOR_SESSION_SAVED");
      const session = saved.session as { sessionId: string };

      const deviceB = new FinitePlanRuntime(profiles, new PlanSnapshotStore(new MemoryStorage()), profileId, undefined, [], () => new Date(), acceptedRepository);
      requireCode(await deviceB.hydrateAcceptedTruth(), "ACCEPTED_TRUTH_CURRENT");
      const listed = await deviceB.listOperatorSessions();
      requireCode(listed, "OPERATOR_SESSIONS");
      const listedSession = (listed.sessions as Array<{ sessionId: string; baseCurrent: boolean }>).find((candidate) => candidate.sessionId === session.sessionId);
      if (!listedSession?.baseCurrent) throw new Error(`${profileId} session was not listed against its current base.`);
      const resumed = await deviceB.resumeOperatorSession({ sessionId: session.sessionId });
      requireCode(resumed, "OPERATOR_DECISION_SESSION_RESUMED");
      if (resumed.authorityRestored !== false) throw new Error(`${profileId} session improperly restored authority.`);
      requireCode(await deviceB.kernel.resumeHumanAuthorityChallenge({ challengeId: approval.authorityChallengeId }), "HUMAN_AUTHORITY_HANDOFF_RESUMED");
      const applied = await deviceB.kernel.applyApprovedOption({ candidateId: chosen.candidateId, approvalId: approval.approvalId, expectedRevision: fromRevision, idempotencyKey: `hosted-phase3-apply-${profileId}-r${fromRevision}` });
      requireCode(applied, "OPTION_APPLIED");
      let consumedCode = "AUTHORITY_CHALLENGE_STILL_AVAILABLE";
      try {
        await acceptedRepository.loadAuthorityChallenge(approval.authorityChallengeId);
      } catch (error) {
        consumedCode = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "AUTHORITY_CHALLENGE_LOOKUP_FAILED";
      }
      if (consumedCode !== "AUTHORITY_CHALLENGE_CONSUMED") throw new Error(`${profileId} challenge was not durably consumed; received ${consumedCode}.`);
      requireCode(await deviceA.hydrateAcceptedTruth(), "ACCEPTED_TRUTH_CURRENT");
      const stale = await deviceA.resumeOperatorSession({ sessionId: session.sessionId });
      requireCode(stale, "OPERATOR_SESSION_BASE_STALE");
      journeys.push({
        profileId,
        status: "passed",
        fromRevision,
        toRevision: deviceB.kernel.revision,
        sessionId: session.sessionId,
        challengeId: approval.authorityChallengeId,
        receiptId: (applied.receipt as { receiptId: string }).receiptId,
        authorityRestoredBySession: resumed.authorityRestored,
        consumedReplay: consumedCode,
        staleReplay: stale.code,
      });
    }
    labAcceptanceResult = { status: "passed", journeys };
    await runtime.hydrateAcceptedTruth();
    announce("Authenticated handoff acceptance passed for travel, renovation and event.");
  } catch (error) {
    labAcceptanceResult = { status: "failed", error: error instanceof Error ? error.message : String(error) };
    announce(`Authenticated handoff acceptance failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    busy = false;
    await render();
    document.querySelector(".protocol-lab")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
};

const seedDecision = async (): Promise<void> => {
  const kernel = runtime.kernel;
  if (kernel.lifecycleStatus !== "active" || kernel.receipts.length || activeCandidates().length) return;
  const revision = kernel.revision;
  const input = kernel.profile.profileId === "travel"
    ? { type: "intent_change", title: "Add three nights in Paris", costDeltaMinor: 66_000, daysDelta: 3, minimumBufferMinor: 50_000, evidenceRefs: ["evidence_current"], entityChanges: [{ entityId: "trip_days", field: "days", delta: 3 }, { entityId: "booked_segment_days", field: "days", delta: 3 }], expectedRevision: revision }
    : kernel.profile.profileId === "renovation"
      ? { type: "supplier_change", title: "Imported tile delayed by ten days", costDeltaMinor: 80_000, daysDelta: 10, minimumBufferMinor: 60_000, evidenceRefs: ["evidence_current"], expectedRevision: revision }
      : { type: "headcount_change", title: "Welcome fifteen additional guests", costDeltaMinor: 15_000, daysDelta: 0, minimumBufferMinor: 20_000, evidenceRefs: ["evidence_current"], entityChanges: [{ entityId: "guest_headcount", field: "count", delta: 15 }], expectedRevision: revision };
  const recorded = kernel.recordChangeEvent(input);
  const eventId = (recorded.event as { eventId?: string } | undefined)?.eventId;
  if (!eventId) throw new Error(`Demo change could not be recorded: ${recorded.code}`);
  await kernel.compareOptions({ eventId, generate: true });
};

const formatBinding = (zone: SurfaceZone): string => zone.bindings.map((binding) => {
  const raw = resolveSurfaceBinding(runtime.kernel, binding);
  const formatted = binding.format === "money" && typeof raw === "number" ? money(raw)
    : binding.format === "days" && typeof raw === "number" ? `${raw} days`
      : String(raw ?? "—");
  return `<div class="measure"><span>${escapeHtml(binding.label)}</span><strong>${escapeHtml(formatted)}</strong></div>`;
}).join("");

const renderStages = (manifest: SurfaceManifest, component: SurfaceZone["component"]): string => `
  <ol class="stage-list stage-list--${escapeHtml(manifest.timeModel)}" aria-label="${escapeHtml(component.replaceAll("_", " "))}">
    ${manifest.stages.map((stage) => `
      <li class="stage stage--${escapeHtml(stage.status)}">
        <span class="stage__marker">${escapeHtml(stage.marker)}</span>
        <div><strong>${escapeHtml(stage.label)}</strong><span>${escapeHtml(stage.detail)}</span></div>
        <small>${escapeHtml(stage.status)}</small>
      </li>`).join("")}
  </ol>`;

const renderOptions = (): string => {
  const candidates = activeCandidates();
  if (!candidates.length) return runtime.kernel.activeEventId
    ? `<p class="quiet">A change is recorded. Codex has not prepared the decision routes yet.</p>`
    : `<p class="quiet">No decision is waiting. The accepted plan is currently settled.</p>`;
  return `<div class="option-grid">
    ${candidates.map((candidate, index) => `
      <article class="option-card ${candidate.candidateId === runtime.kernel.stagedCandidate?.candidateId ? "is-staged" : ""}">
        <div class="option-card__top"><span>Route ${index + 1}</span><span>${candidate.valid ? "Viable" : "Blocked"}</span></div>
        <h3>${escapeHtml(objectiveLabel(candidate.objective))}</h3>
        <div class="option-card__number">${money(candidate.resultingBufferMinor)}</div>
        <p>left as ${escapeHtml(runtime.kernel.profile.surface.nouns.buffer)}</p>
        <ul>${candidate.selectedMoves.length ? candidate.selectedMoves.map((move) => `<li>${escapeHtml(move.tradeoff)}</li>`).join("") : "<li>No additional compromise required</li>"}</ul>
        <div class="option-card__delta"><span>Plan impact</span><strong>${candidate.netForecastDeltaMinor >= 0 ? "+" : "−"}${money(Math.abs(candidate.netForecastDeltaMinor))}</strong></div>
        ${candidate.valid
          ? `<button class="button button--choose" data-action="choose" data-candidate="${escapeHtml(candidate.candidateId)}">Choose this ${escapeHtml(runtime.kernel.profile.surface.nouns.option)}</button>`
          : `<p class="refusal">${escapeHtml(candidate.violations.map((violation) => violationMessage(violation.code)).join(" "))}</p>`}
      </article>`).join("")}
  </div>`;
};

const renderReceipt = (receipt: Receipt): string => {
  const after = receipt.payload.after as { bufferMinor?: number } | undefined;
  const lifecycle = receipt.payload.lifecycle as { status?: PlanLifecycleStatus } | undefined;
  return `<div class="receipt">
    <div><span class="receipt__tick" aria-hidden="true">✓</span><p class="eyebrow">Served and receipted</p><h2>${lifecycle?.status ? `This plan is now ${escapeHtml(lifecycle.status)}.` : `The accepted plan is now revision ${receipt.toRevision}.`}</h2></div>
    <dl>
      <div><dt>${escapeHtml(runtime.kernel.profile.surface.nouns.buffer)}</dt><dd>${typeof after?.bufferMinor === "number" ? money(after.bufferMinor) : money(runtime.kernel.accepted.bufferMinor)}</dd></div>
      <div><dt>Receipt</dt><dd>${escapeHtml(receipt.receiptId)}</dd></div>
      <div><dt>Replay proof</dt><dd>${escapeHtml(receipt.replayChecksum.slice(0, 12))}…</dd></div>
    </dl>
  </div>`;
};

const renderLifecycleControl = (): string => {
  const kernel = runtime.kernel;
  const pending = kernel.pendingLifecycleChange;
  const latest = kernel.lifecycleEvents.at(-1);
  if (pending) {
    const confirmed = kernel.lifecycleConfirmation?.targetId === pending.lifecycleChangeId;
    return `<section class="lifecycle-control lifecycle-control--pending" aria-label="Plan status confirmation">
    <div><p class="eyebrow">Plan conclusion</p><h2>Mark this plan ${escapeHtml(pending.after)}?</h2><p>${escapeHtml(pending.reason)}</p></div>
    <div class="lifecycle-control__actions"><span>Current: ${escapeHtml(pending.before)}</span>${confirmed ? `<p class="quiet">Human confirmation recorded. Codex may now apply this exact status and return its receipt.</p>` : `<button class="button" type="button" data-action="confirm-lifecycle" data-lifecycle="${escapeHtml(pending.lifecycleChangeId)}">Confirm exact status</button><button class="text-button" type="button" data-action="cancel-lifecycle">Keep plan ${escapeHtml(pending.before)}</button>`}</div>
  </section>`;
  }
  const inactive = kernel.lifecycleStatus !== "active";
  return `<details class="lifecycle-control ${inactive ? "lifecycle-control--inactive" : ""}" ${inactive ? "open" : ""}>
    <summary><span>Plan status</span><strong>${escapeHtml(kernel.lifecycleStatus)}</strong><small>${inactive ? "New changes are blocked until you reopen it" : latest ? `Last changed because: ${escapeHtml(latest.reason)}` : "Finish, pause, or stop cleanly"}</small></summary>
    <form data-plan-lifecycle>
      <label><span>What should happen?</span><select name="status" required>
        <option value="">Choose one</option>
        ${kernel.lifecycleStatus === "active" ? '<option value="completed">Complete — the outcome happened</option><option value="paused">Pause — keep it, but stop active work</option><option value="abandoned">Abandon — the outcome is no longer being pursued</option>' : '<option value="active">Reopen — resume active planning</option>'}
      </select></label>
      <label><span>Why?</span><textarea name="reason" required maxlength="1000" placeholder="Preserve what happened, or why the plan is changing state."></textarea></label>
      <button class="button" type="submit" ${busy ? "disabled" : ""}>Review this status change</button>
    </form>
  </details>`;
};

const renderHumanRealityControl = (): string => {
  const kernel = runtime.kernel;
  if (kernel.pendingGroupDecision) {
    const pending = kernel.pendingGroupDecision;
    const confirmed = kernel.groupDecisionConfirmation?.targetId === pending.groupDecisionId;
    return `<section class="zone zone--approval_panel lifecycle-control" aria-label="Group decision review"><div class="zone__heading"><p class="eyebrow">Group decision</p><h2>${escapeHtml(pending.question)}</h2></div><div class="approval-copy"><p>${escapeHtml(pending.resolvedOutcome)}</p><div><span>Decision protocol</span><strong>${escapeHtml(pending.protocol.replaceAll("_", " "))}</strong></div><details><summary>Named positions (${pending.positions.length})</summary><ul>${pending.positions.map((position) => `<li><strong>${escapeHtml(position.participantName)}</strong>: ${escapeHtml(position.position)}</li>`).join("")}</ul></details>${pending.unresolvedConflicts.length ? `<details><summary>Still unresolved (${pending.unresolvedConflicts.length})</summary><ul>${pending.unresolvedConflicts.map((conflict) => `<li>${escapeHtml(conflict)}</li>`).join("")}</ul></details>` : ""}${confirmed ? `<p class="quiet">Human confirmation recorded. Codex may now append this exact group outcome.</p>` : `<button class="button button--approve" data-action="confirm-group-decision" data-group-decision="${escapeHtml(pending.groupDecisionId)}">Confirm this exact group outcome</button><button class="text-button" data-action="cancel-group-decision">Not accurate</button>`}</div></section>`;
  }
  if (kernel.pendingExternalAction) {
    const pending = kernel.pendingExternalAction;
    const confirmed = kernel.externalActionConfirmation?.targetId === pending.externalActionChangeId;
    return `<section class="zone zone--approval_panel lifecycle-control" aria-label="External action review"><div class="zone__heading"><p class="eyebrow">Real-world status</p><h2>Is ${escapeHtml(pending.label)} really ${escapeHtml(pending.after)}?</h2></div><div class="approval-copy"><p>${escapeHtml(pending.reason)}</p><div><span>Prior status</span><strong>${escapeHtml(pending.before ?? "not recorded")}</strong></div><div><span>Proposed status</span><strong>${escapeHtml(pending.after)}</strong></div><p class="quiet">This records reality only. Finite has not booked, paid, verified, or cancelled anything.</p>${confirmed ? `<p class="quiet">Human confirmation recorded. Codex may now append this exact status.</p>` : `<button class="button button--approve" data-action="confirm-external-action" data-external-action="${escapeHtml(pending.externalActionChangeId)}">Confirm this exact status</button><button class="text-button" data-action="cancel-external-action">Not accurate</button>`}</div></section>`;
  }
  return "";
};

const renderPlanDraft = (): string => {
  const draft = runtime.pendingPlanDraft;
  const returned = runtime.returnedConstructionReview;
  if (!draft && !returned) return "";
  if (!draft && returned && returned.packet.kind === "draft") {
    const profile = returned.packet.payload.profile;
    const feedback = returned.feedbackRequired ? `<form class="draft-return-form" data-plan-return="legacy" data-packet="${escapeHtml(returned.packetId)}">
      <div><p class="eyebrow">Help the chef revise it</p><h3>What wasn’t right about this kitchen?</h3><p>Your answer changes the next draft, not the confirmed trip brief or accepted plan.</p></div>
      <label><span>What kind of change?</span><select name="reasonCode" required><option value="">Choose one</option><option value="assumptions">Wrong assumptions</option><option value="structure">Wrong structure or emphasis</option><option value="missing">Something important is missing</option><option value="too_rigid">Too rigid or decided too early</option><option value="too_vague">Too vague to be useful</option><option value="other">Something else</option></select></label>
      <label><span>Tell Codex what should change</span><textarea name="reason" required maxlength="1000" placeholder="For example: this feels like a budget shell, not the living trip plan I expected."></textarea></label>
      <button class="button" type="submit" ${busy ? "disabled" : ""}>Send back for revision</button>
    </form>` : `<div class="draft-returned-copy"><span>Changes requested</span><strong>${escapeHtml(returned.reasonCode?.replaceAll("_", " ") ?? "Revision requested")}</strong><p>${escapeHtml(returned.message)}</p><button class="button" type="button" data-action="open-codex-handoff">Hand off this revision to Codex</button></div>`;
    return `<section class="zone zone--approval_panel plan-intake plan-intake--returned" aria-label="Returned plan draft">
      <div class="zone__heading"><p class="eyebrow">Kitchen returned / accepted plan unchanged</p><h2>${escapeHtml(profile.name)}</h2></div>
      <div class="approval-copy"><p>The rejected draft remains visible as revision context. It cannot be confirmed or activated.</p><div><span>Packet proof</span><strong>${escapeHtml(returned.packet.checksum.slice(0, 16))}…</strong></div><div><span>Draft proof</span><strong>${escapeHtml(returned.packet.payload.contentHash.slice(0, 16))}…</strong></div></div>
      ${feedback}
      <details class="draft-discard"><summary>Start over instead</summary><p>Discard the returned draft and begin again from the unchanged reviewed brief.</p><button class="text-button" type="button" data-action="discard-returned-draft" data-packet="${escapeHtml(returned.packetId)}">Discard this draft entirely</button></details>
    </section>`;
  }
  if (!draft) return "";
  const priorReview = runtime.lastConstructionReturnReview?.status === "resolved" && runtime.lastConstructionReturnReview.packet.kind === "draft"
    ? runtime.lastConstructionReturnReview
    : null;
  const priorProfile = priorReview?.packet.kind === "draft" ? priorReview.packet.payload.profile : null;
  const changedSinceReturn = priorProfile ? [
    ["outcome framing", priorProfile.name !== draft.profile.name || JSON.stringify(priorProfile.surface.hero) !== JSON.stringify(draft.profile.surface.hero)],
    ["finite allocation", JSON.stringify(priorProfile.accepted) !== JSON.stringify(draft.profile.accepted)],
    ["route and stages", JSON.stringify(priorProfile.surface.stages) !== JSON.stringify(draft.profile.surface.stages)],
    ["working assumptions", JSON.stringify(priorProfile.surface.assumptions ?? []) !== JSON.stringify(draft.profile.surface.assumptions ?? [])],
    ["planning dependencies", JSON.stringify(priorProfile.surface.dependencies ?? []) !== JSON.stringify(draft.profile.surface.dependencies ?? [])],
    ["constraints and preferences", JSON.stringify({ locks: priorProfile.locks, preferenceLabels: priorProfile.preferenceLabels, preferenceWeights: priorProfile.preferenceWeights, relationships: priorProfile.relationships }) !== JSON.stringify({ locks: draft.profile.locks, preferenceLabels: draft.profile.preferenceLabels, preferenceWeights: draft.profile.preferenceWeights, relationships: draft.profile.relationships })],
  ].filter((entry) => entry[1]).map((entry) => String(entry[0])) : [];
  const revisionReceipt = priorReview ? `<section class="draft-revision-diff" aria-label="Revision response"><div><p class="eyebrow">Revised from your returned kitchen</p><h3>${escapeHtml(priorReview.message)}</h3></div><div><span>Codex changed</span><strong>${escapeHtml(changedSinceReturn.join(" · ") || "the compiled plan content")}</strong></div></section>` : "";
  const orientation = arrivalResult.ok ? arrivalResult.orientation : undefined;
  if (orientation && !pendingDraftMatchesArrival()) return `<section class="zone zone--approval_panel plan-intake" aria-label="Kitchen update queued">
    <div class="zone__heading"><p class="eyebrow">New detail saved</p><h2>The previous kitchen is no longer confirmable.</h2></div>
    <div class="approval-copy"><p>Order v${orientation.exactOrderVersion} has newer human input. Codex must reconcile that exact version and compile a replacement before you can confirm anything.</p><div><span>Current order</span><strong>v${orientation.exactOrderVersion}</strong></div><div><span>Prior draft</span><strong>${escapeHtml(draft.contentHash.slice(0, 16))}… · stale</strong></div></div>
  </section>`;
  const confirmation = runtime.planActivationConfirmation;
  const confirmed = confirmation?.draftId === draft.draftId;
  const amendment = draft.amendment;
  const dependencies = draft.profile.surface.dependencies ?? [];
  const assumptions = draft.profile.surface.assumptions ?? [];
  return `<section class="zone zone--approval_panel plan-intake" aria-label="New plan activation">
    <div class="zone__heading"><p class="eyebrow">New finite kitchen</p><h2>${escapeHtml(draft.profile.name)}</h2></div>
    <div class="approval-copy">
      <p>Codex compiled a complete <strong>${escapeHtml(draft.profile.profileId)}</strong> operating profile${amendment ? ` that supersedes <strong>${escapeHtml(amendment.supersedesPlanId)}</strong>` : ""}. Confirming authorizes only this exact packet; it does not activate the plan.</p>
      <div><span>Profile proof</span><strong>${escapeHtml(draft.profile.profileHash.slice(0, 16))}…</strong></div>
      <div><span>Draft proof</span><strong>${escapeHtml(draft.contentHash.slice(0, 16))}…</strong></div>
      ${dependencies.length ? `<details><summary>Open planning dependencies (${dependencies.filter((dependency) => dependency.status === "open").length})</summary><ul>${dependencies.map((dependency) => `<li><strong>${escapeHtml(dependency.title)}</strong> · ${escapeHtml(dependency.kind.replaceAll("_", " "))} · ${escapeHtml(dependency.status)}</li>`).join("")}</ul></details>` : ""}
      ${assumptions.length ? `<details><summary>Working assumptions (${assumptions.length})</summary><ul>${assumptions.map((assumption) => `<li><strong>${escapeHtml(assumption.path)}</strong>: ${escapeHtml(String(assumption.value))} · ${escapeHtml(assumption.basis)}</li>`).join("")}</ul></details>` : ""}
      ${revisionReceipt}
      ${amendment ? `<div><span>Amendment proof</span><strong>${escapeHtml(amendment.diffHash.slice(0, 16))}…</strong></div><p class="quiet">Changed: ${escapeHtml(amendment.diff.changedSections.join(", "))}</p>` : ""}
      ${confirmed
        ? `<p class="quiet">Human confirmation recorded. Codex can now activate this exact draft through WebMCP.</p>`
        : `<button class="button button--approve" data-action="confirm-plan" data-draft="${escapeHtml(draft.draftId)}">Confirm this exact kitchen</button>`}
      ${draftReturnFormOpen ? `<form class="draft-return-form" data-plan-return="current" data-draft="${escapeHtml(draft.draftId)}">
        <div><p class="eyebrow">Return for revision</p><h3>What wasn’t right about this kitchen?</h3><p>The draft stays visible while you explain. This does not change the confirmed brief or accepted plan.</p></div>
        <label><span>What kind of change?</span><select name="reasonCode" required><option value="">Choose one</option><option value="assumptions">Wrong assumptions</option><option value="structure">Wrong structure or emphasis</option><option value="missing">Something important is missing</option><option value="too_rigid">Too rigid or decided too early</option><option value="too_vague">Too vague to be useful</option><option value="other">Something else</option></select></label>
        <label><span>Tell Codex what should change</span><textarea name="reason" required maxlength="1000" placeholder="Say what you expected to receive instead."></textarea></label>
        <div class="draft-return-actions"><button class="button" type="submit" ${busy ? "disabled" : ""}>Send back for revision</button><button class="text-button" type="button" data-action="cancel-plan-return">Keep reviewing</button></div>
      </form>` : `<button class="text-button" data-action="open-plan-return" data-draft="${escapeHtml(draft.draftId)}">Request changes</button>`}
    </div>
  </section>`;
};

const renderZone = (manifest: SurfaceManifest, zone: SurfaceZone): string => {
  if (zone.collapsed) return "";
  const kernel = runtime.kernel;
  const actualsState = kernel.getState(["actuals"]).state as { actuals?: Array<{ label: string; currentAmountMinor: number }> };
  const latestEvent = kernel.events.find((event) => event.eventId === kernel.activeEventId);
  let body = "";
  if (["finite_summary", "entity_table"].includes(zone.component)) body = `<div class="measure-grid">${formatBinding(zone)}</div>`;
  else if (zone.component === "pressure_meter") {
    const percentage = Math.max(0, Math.min(100, Math.round((kernel.accepted.bufferMinor / kernel.accepted.totalBudgetMinor) * 100)));
    body = `<div class="pressure-copy"><strong>${money(kernel.accepted.bufferMinor)}</strong><span>${escapeHtml(kernel.profile.surface.nouns.buffer)} remains · ${percentage}% of the finite total</span></div><div class="pressure-track" role="meter" aria-label="Remaining buffer" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percentage}"><span style="width:${percentage}%"></span></div>`;
  } else if (["timeline_lane", "phase_lane", "run_of_show"].includes(zone.component)) body = renderStages(manifest, zone.component);
  else if (zone.component === "commitment_stack") body = `<div class="truth-list"><div><span>Spent and evidenced</span><strong>${money(kernel.accepted.spentMinor)}</strong></div><div><span>Already committed</span><strong>${money(kernel.accepted.committedMinor)}</strong></div><div><span>Protected locks</span><strong>${kernel.profile.locks.length}</strong></div></div>`;
  else if (zone.component === "actual_forecast") body = `<div class="actual-list">${(actualsState.actuals ?? []).map((actual) => `<div><span>${escapeHtml(actual.label)}</span><strong>${money(actual.currentAmountMinor)}</strong></div>`).join("")}</div>`;
  else if (zone.component === "constraint_panel") body = `<div class="lock-list">${kernel.profile.locks.map((lock) => `<span><b aria-hidden="true">×</b>${escapeHtml(lock.replaceAll("_", " "))}</span>`).join("")}</div><p class="preference-line">Preference signal: ${kernel.profile.preferenceLabels.map((label) => escapeHtml(label.replaceAll("_", " "))).join(" · ")}</p>`;
  else if (zone.component === "change_tray") body = latestEvent ? `<p class="change-title">${escapeHtml(latestEvent.title)}</p><div class="change-numbers"><span>${latestEvent.costDeltaMinor >= 0 ? "+" : "−"}${money(Math.abs(latestEvent.costDeltaMinor))}</span><span>${latestEvent.daysDelta >= 0 ? "+" : ""}${latestEvent.daysDelta} days</span></div>` : `<p class="quiet">No active disruption.</p>`;
  else if (zone.component === "option_compare") body = renderOptions();
  else if (zone.component === "approval_panel") {
    const staged = kernel.stagedCandidate;
    const approved = staged && kernel.approval?.candidateId === staged.candidateId;
    body = staged ? `<div class="approval-copy"><p>This commits exactly <strong>${escapeHtml(objectiveLabel(staged.objective))}</strong> against revision ${kernel.revision}. It changes no booking, purchase, or payment outside this demonstration.</p><div><span>Forecast change</span><strong>${staged.netForecastDeltaMinor >= 0 ? "+" : "−"}${money(Math.abs(staged.netForecastDeltaMinor))}</strong></div><div><span>${escapeHtml(kernel.profile.surface.nouns.buffer)} after</span><strong>${money(staged.resultingBufferMinor)}</strong></div>${approved ? `<p class="quiet">Human approval recorded. Codex may now apply this exact option and return its receipt.</p>` : `<button class="button button--approve" data-action="approve">Approve this exact plan</button><button class="text-button" data-action="return">Not this one</button>`}</div>` : `<p class="quiet">Choose an outcome before approval.</p>`;
  }
  return `<section class="zone zone--${escapeHtml(zone.component)}" id="${escapeHtml(zone.zoneId)}"><div class="zone__heading"><p class="eyebrow">${escapeHtml(manifest.nouns.plan)}</p><h2>${escapeHtml(zone.title)}</h2></div>${body}</section>`;
};

async function render(): Promise<SurfaceManifest> {
  const kernel = runtime.kernel;
  const reconciledMessage = reconcileScopedSurfaceMessage({ message, scope: messageScope }, currentMessageScope());
  if (message && !reconciledMessage.message) announcer!.textContent = "";
  message = reconciledMessage.message;
  messageScope = reconciledMessage.scope;
  const manifest = await compileSurfaceManifest(kernel.profile, kernel);
  const params = new URLSearchParams(location.search);
  const experienceSurface = selectExperienceSurface({
    labMode: params.get("lab") === "1",
    kitchenMode: params.get("kitchen") === "1",
    hasArrival: isWaitingArrivalStatus(currentArrival()?.status),
    hasActivatedPlan: runtime.hasActivationReceipt(),
  });
  if (experienceSurface === "arrival") {
    renderArrival(manifest);
    return manifest;
  }
  const receipt = kernel.receipts.at(-1);
  const spentPercent = Math.round(((kernel.accepted.spentMinor + kernel.accepted.committedMinor) / kernel.accepted.totalBudgetMinor) * 100);
  surfaceRoot.dataset.profile = kernel.profile.profileId;
  surfaceRoot.setAttribute("aria-busy", String(busy));
  surfaceRoot.innerHTML = `
    <header class="site-header">
      <a class="brand" href="#main" aria-label="Finite home"><span>finite</span><i></i></a>
      <nav class="profile-nav" aria-label="Demonstration plan">
        ${(["travel", "renovation", "event"] as ProfileId[]).map((profileId) => `<button data-action="profile" data-profile="${profileId}" aria-pressed="${kernel.profile.profileId === profileId}">${profileId === "event" ? "Launch event" : profileId}</button>`).join("")}
      </nav>
      <div class="identity-cluster">
        ${renderCodexHandoffButton()}
        <div class="operator-status"><span></span>${modelContext ? "Codex browser present" : "Local kitchen"}</div>
        ${renderIdentityPill()}
      </div>
    </header>
    <main id="main">
      <div class="plan-status-strip plan-status-strip--${escapeHtml(kernel.lifecycleStatus)}" role="status"><span>${escapeHtml(kernel.lifecycleStatus)}</span><strong>${kernel.lifecycleStatus === "active" ? "This plan is open for change." : `This plan is ${escapeHtml(kernel.lifecycleStatus)}. Ordinary changes are blocked.`}</strong>${kernel.lifecycleEvents.at(-1) ? `<small>${escapeHtml(kernel.lifecycleEvents.at(-1)!.reason)}</small>` : ""}</div>
      <section class="hero">
        <div class="hero__copy"><p class="eyebrow">${escapeHtml(kernel.profile.surface.hero.eyebrow)}</p><h1>${escapeHtml(manifest.title)}</h1><p class="hero__brief">${escapeHtml(manifest.brief)}</p><div class="brief-card"><span>You ordered</span><p>${escapeHtml(manifest.decisionFocus ?? kernel.profile.surface.hero.brief)}</p></div></div>
        <aside class="plan-orbit" aria-label="Current finite plan summary"><div class="orbit-number"><span>Total plan</span><strong>${money(kernel.accepted.totalBudgetMinor)}</strong></div><div class="orbit-ring" style="--used:${spentPercent}%"><div><strong>${money(kernel.accepted.bufferMinor)}</strong><span>${escapeHtml(kernel.profile.surface.nouns.buffer)} left</span></div></div><p>${spentPercent}% spent or committed. Every option below keeps the same finite total.</p></aside>
      </section>
      ${message ? `<div class="service-message" role="status">${escapeHtml(message)}</div>` : ""}
      ${renderLifecycleControl()}
      ${renderHumanRealityControl()}
      ${renderPlanDraft()}
      ${receipt ? renderReceipt(receipt) : ""}
      <div class="surface-grid">${manifest.zones.map((zone) => renderZone(manifest, zone)).join("")}</div>
      ${labMode ? `<details class="protocol-lab" open><summary>Protocol lab</summary><p>This acceptance creates synthetic, receipted revision 3 changes in all three kitchens. The explicit click is the human test authority.</p><button class="button" data-action="run-handoff-acceptance" ${busy ? "disabled" : ""}>Run authenticated handoff acceptance</button><pre>${escapeHtml(JSON.stringify({ modelContext: typeof document.modelContext, crossOriginIsolated, profileId: kernel.profile.profileId, profileHash: kernel.profile.profileHash, revision: kernel.revision, manifestHash: manifest.manifestHash, tools: adapter?.inventory() ?? [], acceptance: labAcceptanceResult }, null, 2))}</pre></details>` : ""}
    </main>
    <footer><p>Codex operates the kitchen. You choose, approve and consume the result.</p><span>Finite plan · revision ${kernel.revision}</span></footer>
    ${renderCodexHandoffDialog()}
    ${renderKitchenResetDialog()}
    ${renderThemeSettingsDialog()}`;
  bindInteractions();
  return manifest;
}

const chooseCandidate = async (candidateId: string): Promise<void> => {
  const result = await runtime.kernel.stageOption({ candidateId, expectedRevision: runtime.kernel.revision });
  announce(result.ok ? "Your chosen outcome is ready for exact approval." : `That outcome could not be staged: ${result.code}`);
  await render();
  document.querySelector("#approval_panel")?.scrollIntoView({ behavior: "smooth", block: "center" });
};

const approveCandidate = async (): Promise<void> => {
  const kernel = runtime.kernel;
  const candidate = kernel.stagedCandidate;
  if (!candidate) return;
  busy = true;
  await render();
  const approval = await kernel.humanApprove({ candidateId: candidate.candidateId, warningsAcknowledged: candidate.warnings.map((warning) => String(warning.code)) });
  if (approval.ok) await adapter?.enterKitchen({ entryIntent: "continue_current" });
  busy = false;
  announce(approval.ok ? "Exact option approved. Codex may now apply it through the guarded WebMCP tool." : `Approval was not recorded: ${approval.code}`);
  await render();
};

const switchProfile = async (profileId: ProfileId): Promise<void> => {
  if (profileId === runtime.kernel.profile.profileId || busy) return;
  busy = true;
  announce("");
  const result = await runtime.switchProfilePersisted(profileId, { expectedCurrentPlanId: runtime.kernel.profile.planId, expectedCurrentRevision: runtime.kernel.revision });
  if (!result.ok) {
    busy = false;
    announce(`That plan could not be opened safely: ${result.code}`);
    await render();
    return;
  }
  scopedStorage.setItem("finite-plan.surface.active-profile", runtime.kernel.profile.planId);
  await adapter?.refreshContextualTools();
  await seedDecision();
  busy = false;
  await render();
  window.scrollTo({ top: 0, behavior: "smooth" });
};

const confirmPlanDraft = async (draftId: string): Promise<void> => {
  if (!pendingDraftMatchesArrival()) {
    announce("That draft is stale because the human order changed. Codex must compile a replacement from the latest version.");
    await render();
    return;
  }
  const result = runtime.humanConfirmPlanDraft({ draftId });
  if (result.ok) await adapter?.enterKitchen({ entryIntent: "continue_current" });
  announce(result.ok ? "Exact plan draft confirmed. Codex may now activate it through the guarded WebMCP tool." : `The plan draft was not confirmed: ${result.code}`);
  await render();
};

const returnPlanDraft = async (form: HTMLFormElement): Promise<void> => {
  if (busy) return;
  const data = new FormData(form);
  const reasonCode = String(data.get("reasonCode") ?? "") as import("./types.js").ConstructionReturnReason;
  const reason = String(data.get("reason") ?? "").trim();
  if (!reasonCode || !reason) return;
  busy = true;
  announce("Returning the exact kitchen with your revision notes…");
  await render();
  const result = form.dataset.draft
    ? await runtime.humanRejectPlanDraft({ draftId: form.dataset.draft, reasonCode, reason })
    : await runtime.humanDescribeReturnedDraft({ packetId: form.dataset.packet ?? "", reasonCode, message: reason });
  busy = false;
  draftReturnFormOpen = false;
  announce(result.ok ? "Your revision request is saved. Codex will receive this exact draft and your notes; the accepted plan is unchanged." : `The revision request was not saved: ${result.code}`);
  await render();
};

const discardReturnedDraft = async (packetId: string): Promise<void> => {
  const result = await runtime.discardConstructionPacket({ packetId });
  announce(result.ok ? "The returned draft was discarded. Codex will begin again from the unchanged reviewed brief." : `The draft was not discarded: ${result.code}`);
  await render();
};

const stageLifecycle = async (form: HTMLFormElement): Promise<void> => {
  if (busy) return;
  const data = new FormData(form);
  const status = String(data.get("status") ?? "") as PlanLifecycleStatus;
  const reason = String(data.get("reason") ?? "").trim();
  if (!status || !reason) return;
  const result = await runtime.kernel.stagePlanLifecycle({ status, reason, expectedRevision: runtime.kernel.revision });
  announce(result.ok ? "Review the exact plan status below. Nothing has changed yet." : `The plan status could not be prepared: ${result.code}`);
  await render();
  document.querySelector(".lifecycle-control")?.scrollIntoView({ behavior: "smooth", block: "center" });
};

const confirmLifecycle = async (lifecycleChangeId: string): Promise<void> => {
  const pending = runtime.kernel.pendingLifecycleChange;
  if (!pending || pending.lifecycleChangeId !== lifecycleChangeId) return;
  busy = true;
  await render();
  const confirmed = runtime.kernel.humanConfirmPlanLifecycle({ lifecycleChangeId });
  if (confirmed.ok) await adapter?.enterKitchen({ entryIntent: "continue_current" });
  busy = false;
  announce(confirmed.ok ? "Exact plan status confirmed. Codex may now apply it through the guarded WebMCP tool." : `The plan status was not confirmed: ${confirmed.code}`);
  await render();
};

const confirmGroupDecision = async (groupDecisionId: string): Promise<void> => {
  const result = runtime.kernel.humanConfirmGroupDecision({ groupDecisionId });
  if (result.ok) await adapter?.enterKitchen({ entryIntent: "continue_current" });
  announce(result.ok ? "Exact group outcome confirmed. Codex may now append it with a receipt." : `The group outcome was not confirmed: ${result.code}`);
  await render();
};

const confirmExternalAction = async (externalActionChangeId: string): Promise<void> => {
  const result = runtime.kernel.humanConfirmExternalAction({ externalActionChangeId });
  if (result.ok) await adapter?.enterKitchen({ entryIntent: "continue_current" });
  announce(result.ok ? "Exact real-world status confirmed. Codex may now append it with a receipt." : `The status was not confirmed: ${result.code}`);
  await render();
};

function bindInteractions(): void {
  bindCodexHandoffInteractions();
  bindKitchenResetInteractions();
  bindThemeSettingsInteractions();
  root?.querySelectorAll<HTMLButtonElement>("[data-action='profile']").forEach((button) => button.addEventListener("click", () => switchProfile(button.dataset.profile as ProfileId)));
  root?.querySelectorAll<HTMLButtonElement>("[data-action='choose']").forEach((button) => button.addEventListener("click", () => chooseCandidate(String(button.dataset.candidate))));
  root?.querySelector<HTMLButtonElement>("[data-action='approve']")?.addEventListener("click", () => approveCandidate());
  root?.querySelector<HTMLButtonElement>("[data-action='return']")?.addEventListener("click", async () => { runtime.kernel.rejectStagedOption({ reason: "Human returned the staged option from the consumption surface." }); announce("Returned to the three viable outcomes. Accepted truth is unchanged."); await render(); });
  root?.querySelector<HTMLButtonElement>("[data-action='confirm-plan']")?.addEventListener("click", (event) => { void confirmPlanDraft((event.currentTarget as HTMLButtonElement).dataset.draft ?? ""); });
  root?.querySelector<HTMLButtonElement>("[data-action='open-plan-return']")?.addEventListener("click", async () => { draftReturnFormOpen = true; announce(""); await render(); root.querySelector<HTMLTextAreaElement>("[data-plan-return] textarea")?.focus(); });
  root?.querySelector<HTMLButtonElement>("[data-action='cancel-plan-return']")?.addEventListener("click", async () => { draftReturnFormOpen = false; await render(); });
  root?.querySelector<HTMLFormElement>("[data-plan-return]")?.addEventListener("submit", (event) => { event.preventDefault(); void returnPlanDraft(event.currentTarget as HTMLFormElement); });
  root?.querySelector<HTMLButtonElement>("[data-action='discard-returned-draft']")?.addEventListener("click", (event) => { void discardReturnedDraft((event.currentTarget as HTMLButtonElement).dataset.packet ?? ""); });
  root?.querySelector<HTMLFormElement>("[data-plan-lifecycle]")?.addEventListener("submit", (event) => { event.preventDefault(); void stageLifecycle(event.currentTarget as HTMLFormElement); });
  root?.querySelector<HTMLButtonElement>("[data-action='confirm-lifecycle']")?.addEventListener("click", (event) => { void confirmLifecycle((event.currentTarget as HTMLButtonElement).dataset.lifecycle ?? ""); });
  root?.querySelector<HTMLButtonElement>("[data-action='cancel-lifecycle']")?.addEventListener("click", async () => { runtime.kernel.pendingLifecycleChange = null; runtime.kernel.lifecycleConfirmation = null; announce("Plan status change cancelled. Accepted truth is unchanged."); await render(); });
  root?.querySelector<HTMLButtonElement>("[data-action='confirm-group-decision']")?.addEventListener("click", (event) => { void confirmGroupDecision((event.currentTarget as HTMLButtonElement).dataset.groupDecision ?? ""); });
  root?.querySelector<HTMLButtonElement>("[data-action='cancel-group-decision']")?.addEventListener("click", async () => { runtime.kernel.pendingGroupDecision = null; runtime.kernel.groupDecisionConfirmation = null; announce("Group decision returned. Accepted truth is unchanged."); await render(); });
  root?.querySelector<HTMLButtonElement>("[data-action='confirm-external-action']")?.addEventListener("click", (event) => { void confirmExternalAction((event.currentTarget as HTMLButtonElement).dataset.externalAction ?? ""); });
  root?.querySelector<HTMLButtonElement>("[data-action='cancel-external-action']")?.addEventListener("click", async () => { runtime.kernel.pendingExternalAction = null; runtime.kernel.externalActionConfirmation = null; announce("Real-world status returned. Accepted truth is unchanged."); await render(); });
  root?.querySelector<HTMLButtonElement>("[data-action='run-handoff-acceptance']")?.addEventListener("click", () => { void runAuthenticatedHandoffAcceptance(); });
  root?.querySelector<HTMLButtonElement>("[data-action='end-demo']")?.addEventListener("click", async () => {
    const response = await fetch("/api/auth/demo/end", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    if (response.ok) location.reload();
    else announce("The demo session could not be ended safely.");
  });
}

if (labMode || new URLSearchParams(location.search).get("kitchen") === "1") await seedDecision();
await render();
window.finitePlanCanary = { runtime, adapter, refresh: () => { void render(); } };
};

const authStatus = await loadAuthStatus();
if (authStatus.session) {
  try { await startKitchen(authStatus.session); }
  catch (error) {
    webmcpReadiness.state = "failed";
    webmcpReadiness.detail = error instanceof Error ? error.message : String(error);
    throw error;
  }
} else {
  webmcpReadiness.state = "signed_out";
  renderAuthGate(authStatus.signInPath);
}
