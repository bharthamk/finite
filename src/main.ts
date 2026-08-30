import { compileBuiltInProfiles } from "./profiles.js";
import { clearFiniteScope, clearForeignFiniteScopes, MemoryStorage, PlanCatalogStore, PlanSnapshotStore, ScopedStorage } from "./persistence.js";
import { compileCatalogEntries, FinitePlanRuntime } from "./runtime.js";
import { compileSurfaceManifest, projectAcceptedPlanCopy, projectAcceptedPlanCopyFromReceipts, resolveSurfaceBinding } from "./surface.js";
import { resolvePlanTitle } from "./plan-title.js";
import type { Candidate, PlanLifecycleStatus, ProfileDefinition, ProfileId, SurfaceManifest, SurfaceZone } from "./types.js";
import { FinitePlanWebMCPAdapter, type FiniteGuideTarget, type FiniteGuideViewRequest, type FiniteWebMCPReadiness } from "./webmcp.js";
import { HttpAcceptedTruthRepository } from "./accepted-truth.js";
import { HttpConstructionPacketRepository } from "./construction-packet.js";
import { HttpArrivalRepository, type ArrivalOrder, type ArrivalResult } from "./arrival.js";
import { createCodexHandoff } from "./codex-handoff.js";
import { finiteRelease } from "./release.js";
import { arrivalInputIsWorkflowOnly, arrivalUsesCodexWaitingWorkspace, arrivalUsesManualWorkspace, hasInterpretationDetail, humanLabel, inputKindLabel, inputSurfaceLabel, interpretationNeedsForDisplay, interpretationSourcesForDisplay, renderHumanValue, renderTextList, starterPlanForArrival } from "./arrival-presentation.js";
import { isWaitingArrivalStatus, selectExperienceSurface } from "./experience-route.js";
import { reconcileScopedSurfaceMessage } from "./surface-message.js";
import { HttpKitchenResetRepository, kitchenResetConfirmation, type KitchenResetResult } from "./kitchen-reset.js";
import { applyThemeDefinition, builtInThemes, defaultTheme, HttpThemeRepository, themeCoreTokenKeys, type ThemeCatalogResult, type ThemeCoreTokens, type ThemeDefinition, type ThemeMode, type ThemeResult } from "./theme.js";
import { applySkinDefinition, builtInSkins, defaultSkin, HttpSkinRepository, skinTraitKeys, type SkinCatalogResult, type SkinDefinition, type SkinRecipe, type SkinResult } from "./skin.js";
import { HttpPlanShareRepository, type PlanPublicationRecord, type PlanShareMode, type PlanShareSection, type PublicPlanProjection } from "./plan-share.js";
import { defaultAgentSettings, defaultAgenticName, HttpSettingsRepository, validateAgenticName, type AgentSettings } from "./settings.js";
import { HttpPlanInputRepository, type PlanInputKind, type PlanInputMode, type PlanInputRecord, type PlanInputSection } from "./plan-input.js";
import { HttpPlanWorkRepository, type ChecklistItem, type PlanAttachment, type PlanWorkResult } from "./plan-work.js";
import { emptyRetrospective, HttpPlanLearningRepository, type PlanLearningResult, type PlanRetrospective, type ProfileMemory, type ProfileMemoryAction, type ProfileMemoryKind } from "./plan-learning.js";
import { editablePlanFacts, type EditablePlanFact, type PlanFactChange } from "./plan-facts.js";
import { arrivalContinuityTasks, arrivalProgressionFromStarter, type ArrivalProgression } from "./arrival-progression.js";
import { candidateTradeoffLines } from "./option-presentation.js";

const root = document.querySelector<HTMLElement>("#app");
const labMode = import.meta.env.DEV && new URLSearchParams(location.search).get("lab") === "1";
document.querySelector<HTMLMetaElement>('meta[name="finite-build"]')?.setAttribute("content", finiteRelease.build);
const announcer = document.querySelector<HTMLElement>("#announcer");
if (!root || !announcer) throw new Error("Finite host elements are missing.");
const surfaceRoot = root;
const updateOpeningStatus = (status: string): void => {
  const statusNode = root.querySelector<HTMLElement>("[data-loading-status]");
  if (statusNode) statusNode.textContent = status;
};
const browserWritingLanguage = navigator.languages.find((language) => language.trim()) ?? navigator.language ?? "en";
const enableNativeWritingAssistance = (): void => {
  root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("textarea:not([readonly]):not([spellcheck='false']), input:not([type]):not([readonly]):not([spellcheck='false']), input[type='text']:not([readonly]):not([spellcheck='false'])")
    .forEach((field) => { field.spellcheck = true; field.lang = browserWritingLanguage; });
};
const webmcpReadiness: FiniteWebMCPReadiness = window.finiteWebMCPReadiness ?? { state: "initializing" };
window.finiteWebMCPReadiness = webmcpReadiness;

export interface FiniteAuthSession {
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

const renderBrand = (): string => `<a class="brand" href="#main" aria-label="Finite home"><img src="/finite-wordmark.png" width="98" height="30" alt=""></a>`;
const shareRepository = new HttpPlanShareRepository();
const escapePublicHtml = (value: unknown): string => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const publicMoney = (minor: number): string => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(minor / 100);

const publicMeasure = (value: string | number, format: string): string => {
  if (format === "money" && typeof value === "number") return publicMoney(value);
  if (format === "days" && typeof value === "number") return `${value} day${value === 1 ? "" : "s"}`;
  if (format === "percent" && typeof value === "number") return `${value}%`;
  return String(value);
};

const renderPublicProjection = (projection: PublicPlanProjection, compact = false): string => {
  const plan = projection.plan;
  const allocation = plan.allocation;
  const outcome = plan.outcome;
  return `<article class="published-plan${compact ? " published-plan--preview" : ""}" data-publication-mode="${projection.mode}">
    <header class="published-plan__hero">
      <p class="eyebrow">${escapePublicHtml(plan.eyebrow || `${plan.family} plan`)}</p>
      <h1>${escapePublicHtml(plan.headline || plan.name)}</h1>
      ${plan.brief ? `<p>${escapePublicHtml(plan.brief)}</p>` : ""}
      <dl class="published-plan__meta"><div><dt>Plan</dt><dd>${escapePublicHtml(plan.name)}</dd></div><div><dt>Revision</dt><dd>${plan.revision}</dd></div><div><dt>Status</dt><dd>${escapePublicHtml(plan.status)}</dd></div><div><dt>${projection.mode === "live" ? "Updated" : "Frozen"}</dt><dd>${escapePublicHtml(new Date(plan.updatedAt).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" }))}</dd></div></dl>
    </header>
    ${allocation ? `<section class="published-plan__allocation" aria-labelledby="published_allocation"><h2 id="published_allocation">The finite total</h2><dl><div><dt>Total</dt><dd>${publicMoney(allocation.totalBudgetMinor)}</dd></div><div><dt>Spent</dt><dd>${publicMoney(allocation.spentMinor)}</dd></div><div><dt>Committed</dt><dd>${publicMoney(allocation.committedMinor)}</dd></div><div><dt>Forecast</dt><dd>${publicMoney(allocation.forecastMinor)}</dd></div><div class="is-buffer"><dt>Remaining</dt><dd>${publicMoney(allocation.bufferMinor)}</dd></div></dl></section>` : ""}
    ${plan.measures?.length ? `<section class="published-plan__measures" aria-labelledby="published_measures"><h2 id="published_measures">Key measures</h2><dl>${plan.measures.map((measure) => `<div><dt>${escapePublicHtml(measure.label)}</dt><dd>${escapePublicHtml(publicMeasure(measure.value, measure.format))}</dd></div>`).join("")}</dl></section>` : ""}
    ${plan.stages?.length ? `<section class="published-plan__stages" aria-labelledby="published_stages"><h2 id="published_stages">Plan stages</h2><ol>${plan.stages.map((stage) => `<li data-stage-status="${escapePublicHtml(stage.status)}"><span>${escapePublicHtml(stage.marker)}</span><div><strong>${escapePublicHtml(stage.label)}</strong><p>${escapePublicHtml(stage.detail)}</p></div><small>${escapePublicHtml(stage.status)}</small></li>`).join("")}</ol></section>` : ""}
    ${plan.changes?.length ? `<section class="published-plan__changes" aria-labelledby="published_changes"><h2 id="published_changes">Recent accepted changes</h2><ol>${plan.changes.map((change) => `<li><span>Revision ${change.revision}</span><strong>${escapePublicHtml(change.title)}</strong></li>`).join("")}</ol></section>` : ""}
    ${outcome ? `<section class="published-plan__outcome"><h2>What happened</h2><blockquote>${escapePublicHtml(outcome.note)}</blockquote><dl><div><dt>Completed</dt><dd>${outcome.completedAt ? escapePublicHtml(new Date(outcome.completedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })) : "Not recorded"}</dd></div><div><dt>Actual spend</dt><dd>${outcome.actualSpendMinor === null ? "Not recorded" : publicMoney(outcome.actualSpendMinor)}</dd></div></dl></section>` : ""}
    ${plan.progress ? `<section class="published-plan__progress"><h2>Progress · ${plan.progress.done} of ${plan.progress.total}</h2>${plan.progress.items.length ? `<ul>${plan.progress.items.map((item) => `<li><span aria-hidden="true">${item.status === "done" ? "✓" : "○"}</span><div><strong>${escapePublicHtml(item.label)}</strong>${item.contextLabel ? `<small>${escapePublicHtml(item.contextLabel)}</small>` : ""}</div></li>`).join("")}</ul>` : ""}</section>` : ""}
    ${plan.decisions?.length ? `<section class="published-plan__record"><h2>Decisions and updates</h2>${plan.decisions.map((item) => `<article><span>${escapePublicHtml(item.kind)}${item.contextLabel ? ` · ${escapePublicHtml(item.contextLabel)}` : ""}</span><p>${escapePublicHtml(item.message)}</p></article>`).join("")}</section>` : ""}
    ${plan.references?.length ? `<section class="published-plan__references"><h2>References</h2><ul>${plan.references.map((item) => `<li><strong>${escapePublicHtml(item.label)}</strong><span>${escapePublicHtml(item.kind)}${item.contextLabel ? ` · ${escapePublicHtml(item.contextLabel)}` : ""}</span>${item.value ? `<p>${escapePublicHtml(item.value)}</p>` : ""}</li>`).join("")}</ul></section>` : ""}
  </article>`;
};

const renderPublishedPage = (label: string, publishedAt: string, projection: PublicPlanProjection): void => {
  document.title = `${projection.plan.name} — shared from Finite`;
  document.documentElement.dataset.skin = "quiet";
  root.innerHTML = `<div class="publication-page">
    <header class="publication-header">${renderBrand()}<div><span>${projection.mode === "live" ? "Live view" : "Frozen snapshot"}</span><strong>View only</strong></div></header>
    <main id="main" class="publication-main"><div class="publication-context"><p>Shared as</p><h2>${escapePublicHtml(label)}</h2><span>Published ${escapePublicHtml(new Date(publishedAt).toLocaleDateString(undefined, { dateStyle: "long" }))}</span></div>${renderPublicProjection(projection)}</main>
    <footer class="publication-footer"><p>This is a read-only page selected and published by the plan owner.</p><span>No editing · no approval controls · no access to the full plan</span></footer>
  </div>`;
};

const renderPublicationFailure = (message: string): void => {
  document.title = "Shared page unavailable — Finite";
  root.innerHTML = `<div class="publication-page"><header class="publication-header">${renderBrand()}<div><strong>View only</strong></div></header><main id="main" class="publication-missing"><p class="eyebrow">Shared page unavailable</p><h1>This shared page is no longer available.</h1><p>${escapePublicHtml(message)}</p></main></div>`;
};

const renderAuthGate = (signInPath = "/signin-with-chatgpt"): void => {
  document.title = "Finite — plans that survive contact with reality";
  root.innerHTML = `
    <div class="public-surface">
      <header class="public-header">
        ${renderBrand()}
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
            <p class="public-auth-note">One private workspace with ChatGPT identity, or a separate 24-hour demo.</p>
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
            <p class="eyebrow">One adaptable system, three human outcomes</p>
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
              <div class="build-log__copy"><h3>Identity becomes a boundary, not a credential store.</h3><p>ChatGPT owns sign-in. Finite creates an isolated private workspace on first use, plus a separate 24-hour demo whose saved data expires with it.</p></div>
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
            <div class="build-log__copy"><h3>Codex reaches the same live plan through WebMCP.</h3><p>The Site exposes only the tools needed for the page the human sees, with bounded results instead of the full catalog or plan dumped into context. Deterministic code owns state, constraints, commits and receipts; Codex interprets, researches and prepares legal moves.</p></div>
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
              <h3>A plan another person can own.</h3>
              <ul>
                <li>Standard OIDC for a portable, self-hosted identity route</li>
                <li>Supported recovery, migration and first-run ownership paths</li>
                <li>Recurring-period and milestone plan experiments</li>
                <li>Public beta only after tenancy and recovery survive independent use</li>
              </ul>
            </article>
            <article class="roadmap-lane">
              <span>Later / earned expansion</span>
              <h3>Shared ownership and external action, with explicit authority.</h3>
              <ul>
                <li>Multiple named people collaborating on one plan with clear roles, attribution and decision authority</li>
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
            <p class="eyebrow">Your plans, when you are ready</p>
            <h2 id="enter_title">Bring the plan that cannot afford to fall apart.</h2>
            <p>Continue with ChatGPT for private plans across visits, or enter an isolated demo whose saved data expires after 24 hours.</p>
          </div>
          <div class="public-entry__actions">
            <a class="button button--entry" href="${signInPath}">Continue with ChatGPT</a>
            <button class="button button--demo" data-action="start-demo">Try the demo</button>
          </div>
          <dl class="identity-promises">
            <div><dt>No Finite password</dt><dd>ChatGPT handles identity. Finite stores no credential.</dd></div>
            <div><dt>No registration form</dt><dd>Your private Finite workspace is ready on first use.</dd></div>
            <div><dt>Demo means isolated</dt><dd>It never adopts or copies an authenticated plan history.</dd></div>
          </dl>
        </section>
      </main>
      <footer class="public-footer"><p>Plans that survive contact with reality.</p><span><a href="#build">Build log</a> · <a href="#roadmap">Roadmap</a> / Finite through WebMCP</span></footer>
    </div>`;
  root.querySelectorAll<HTMLButtonElement>("[data-action='start-demo']").forEach((demoButton) => demoButton.addEventListener("click", async (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    button.disabled = true;
    button.textContent = "Opening the demo…";
    const response = await fetch("/api/auth/demo", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    if (response.ok) location.reload();
    else {
      button.disabled = false;
      button.textContent = "Try the demo";
      announcer.textContent = "The demo could not be opened. Nothing was saved.";
    }
  }));
};

export const startKitchen = async (authSession: FiniteAuthSession): Promise<void> => {

updateOpeningStatus("Loading your saved plans…");
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
const constructionRepository = new HttpConstructionPacketRepository();
const arrivalRepository = new HttpArrivalRepository();
const resetRepository = new HttpKitchenResetRepository();
const themeRepository = new HttpThemeRepository();
const skinRepository = new HttpSkinRepository();
const settingsRepository = new HttpSettingsRepository();
const planInputRepository = new HttpPlanInputRepository();
const planWorkRepository = new HttpPlanWorkRepository();
const planLearningRepository = new HttpPlanLearningRepository();
const [remoteCatalog, loadedSettings, loadedThemes, loadedSkins, openedArrival] = await Promise.all([
  acceptedRepository.listCatalog().catch(() => null),
  settingsRepository.load().catch(() => null),
  themeRepository.list().catch(() => null),
  skinRepository.list().catch(() => null),
  arrivalRepository.open(),
]);
if (remoteCatalog) {
  for (const entry of remoteCatalog.entries) catalogStore.save(entry.definition, entry.evidenceRecords, entry.lineage);
  for (const receipt of remoteCatalog.activationReceipts) catalogStore.saveActivationReceipt(receipt);
}
const catalogEntries = await compileCatalogEntries(catalogStore.load(), catalogStore.loadActivationReceipts());
const persistedPlanIds = new Set(catalogEntries.map((entry) => entry.profile.planId));
const savedProfile = scopedStorage.getItem("finite-plan.surface.active-profile");
const savedBuiltIn = savedProfile === "renovation" || savedProfile === "event" || savedProfile === "travel" ? savedProfile : null;
const savedPlan = catalogEntries.some(({ profile }) => profile.planId === savedProfile) ? savedProfile : null;
const initialProfile = savedPlan ?? savedBuiltIn ?? "travel";
let accountSettings: AgentSettings = loadedSettings?.ok ? loadedSettings.settings : defaultAgentSettings();
const agenticName = (): string => accountSettings.agenticName || defaultAgenticName;
let themeCatalog: ThemeCatalogResult = loadedThemes?.ok ? loadedThemes : { ok: true, code: "THEME_CATALOG_FALLBACK", builtIns: builtInThemes, custom: [], activeThemeId: defaultTheme.themeId, activeTheme: defaultTheme, acceptedStateChanged: false };
applyThemeDefinition(themeCatalog.activeTheme);
const refreshThemeCatalog = async (): Promise<void> => {
  const next = await themeRepository.list();
  if (!next.ok) throw new Error(next.code);
  themeCatalog = next;
  applyThemeDefinition(themeCatalog.activeTheme);
};
let skinCatalog: SkinCatalogResult = loadedSkins?.ok ? loadedSkins : { ok: true, code: "SKIN_CATALOG_FALLBACK", builtIns: builtInSkins, custom: [], activeSkinId: defaultSkin.skinId, activeSkin: defaultSkin, acceptedStateChanged: false };
applySkinDefinition(skinCatalog.activeSkin);
const refreshSkinCatalog = async (): Promise<void> => {
  const next = await skinRepository.list();
  if (!next.ok) throw new Error(next.code);
  skinCatalog = next;
  applySkinDefinition(skinCatalog.activeSkin);
};
let arrivalResult: ArrivalResult = openedArrival;
updateOpeningStatus("Preparing your workspace…");
const runtime = new FinitePlanRuntime(profiles, store, initialProfile, catalogStore, catalogEntries, () => new Date(), acceptedRepository, constructionRepository);
const startupParams = new URLSearchParams(location.search);
const opensProfileSurface = startupParams.get("about") === "1";
const opensFreshArrival = !arrivalResult.order && !labMode && startupParams.get("plan") !== "1" && startupParams.get("kitchen") !== "1";
const hydrateCanonicalRuntime = async (): Promise<void> => {
  const [, construction] = await Promise.all([
    runtime.hydrateAcceptedTruth(),
    runtime.hydrateConstructionPacket(),
  ]);
  if (["CONSTRUCTION_PACKET_REMOTE_HYDRATED", "CONSTRUCTION_PACKET_REMOTE_ADOPTED"].includes(String(construction.code))) await runtime.resumeConstructionPacket();
};
if (!opensFreshArrival && !opensProfileSurface) await hydrateCanonicalRuntime();
const planDisplayNames = new Map<string, string>();
const refreshPlanDisplayNames = async (): Promise<void> => {
  const plans = runtime.listPlans().plans as Array<{ planId: string; profileHash: string; name: string; title: string }>;
  await Promise.all(plans.map(async (plan) => {
    try {
      const envelope = await acceptedRepository.load(plan.planId, plan.profileHash);
      const receipts = envelope?.snapshot.receipts ?? [];
      if (envelope && envelope.revision > 0) persistedPlanIds.add(plan.planId);
      planDisplayNames.set(plan.planId, projectAcceptedPlanCopyFromReceipts(plan.title, receipts));
    } catch { planDisplayNames.set(plan.planId, plan.title); }
  }));
};
let planInputs: PlanInputRecord[] = [];
let checklistItems: ChecklistItem[] = [];
let planAttachments: PlanAttachment[] = [];
let planRetrospective: PlanRetrospective | null = null;
let profileMemories: ProfileMemory[] = [];
let profileContextReady = false;
const refreshPlanInputs = async (): Promise<void> => {
  const result = await planInputRepository.list({ planId: runtime.kernel.profile.planId });
  planInputs = result.ok ? result.inputs : [];
};
const refreshPlanWork = async (): Promise<void> => {
  const result = await planWorkRepository.list(runtime.kernel.profile.planId);
  checklistItems = result.ok ? result.checklist : [];
  planAttachments = result.ok ? result.attachments : [];
};
const refreshPlanLearning = async (): Promise<void> => {
  const result = await planLearningRepository.list(runtime.kernel.profile.planId);
  planRetrospective = result.ok ? result.retrospective : emptyRetrospective(runtime.kernel.profile.planId, runtime.kernel.revision);
  if (result.ok) profileMemories = result.memories;
  profileContextReady = profileContextReady || result.ok;
};
const refreshProfileContext = async (): Promise<void> => {
  const result = await planLearningRepository.listProfile();
  if (result.ok) profileMemories = result.memories;
  profileContextReady = result.ok;
};
const startupSurface = selectExperienceSurface({
  labMode,
  kitchenMode: startupParams.get("plan") === "1" || startupParams.get("kitchen") === "1",
  hasArrival: isWaitingArrivalStatus(arrivalResult.order?.status),
  hasActivatedPlan: runtime.hasActivationReceipt(),
});
const refreshSecondaryPlanData = (): Promise<unknown[]> => Promise.all([
  refreshPlanDisplayNames().catch(() => undefined),
  refreshPlanInputs().catch(() => { planInputs = []; }),
  refreshPlanWork().catch(() => { checklistItems = []; planAttachments = []; }),
  refreshPlanLearning().catch(() => { planRetrospective = emptyRetrospective(runtime.kernel.profile.planId, runtime.kernel.revision); }),
]);
let secondaryPlanDataReady = startupSurface !== "plan" || opensProfileSurface;
const initialSecondaryPlanData = startupSurface === "plan" && !opensProfileSurface
  ? refreshSecondaryPlanData().finally(() => { secondaryPlanDataReady = true; })
  : Promise.resolve([]);
const syncAdaptiveChecklist = async (): Promise<void> => {
  const manifest = await compileSurfaceManifest(runtime.kernel.profile, runtime.kernel);
  for (const [position, stage] of manifest.stages.entries()) {
    const sourceRef = `stage:${stage.stageId}`;
    const existing = checklistItems.find((item) => item.sourceRef === sourceRef);
    if (existing?.baseCurrent && existing.label === stage.detail && existing.contextLabel === stage.label) continue;
    const result = await planWorkRepository.addChecklist({ planId: runtime.kernel.profile.planId, expectedRevision: runtime.kernel.revision, section: "timeline", contextId: stage.stageId, contextLabel: stage.label, label: stage.detail, origin: "adaptive", sourceRef, position, idempotencyKey: `checklist-sync-${runtime.kernel.profile.profileHash.slice(0, 16)}-${runtime.kernel.revision}-${stage.stageId}`, sourceSurface: "site" });
    if (result.ok) { checklistItems = result.checklist; planAttachments = result.attachments; }
  }
};
let forceArrivalSurface = false;
let newPlanDraftMode = false;
let followCodexEnabled = scopedStorage.getItem("finite-plan.follow-codex") === "true";
let activeCodexPrioritySectionId = scopedStorage.getItem("finite-plan.codex-priority-section") ?? "";
const guideView = async (request: FiniteGuideViewRequest) => {
  if (!followCodexEnabled) return { ok: false, code: "FOLLOW_CODEX_DISABLED", acceptedStateChanged: false, next: "Ask the person to enable guided highlighting inside Finite's Codex handoff. Codex must not move or highlight their screen without that permission." };
  if (request.target === "priority" && request.sectionId) {
    activeCodexPrioritySectionId = request.sectionId;
    scopedStorage.setItem("finite-plan.codex-priority-section", request.sectionId);
  }
  if (request.refresh) {
    arrivalResult = await arrivalRepository.open();
    await runtime.hydrateAcceptedTruth();
    await runtime.hydrateConstructionPacket();
    await runtime.resumeConstructionPacket();
    await refreshPlanInputs();
    await refreshPlanWork();
    await refreshPlanLearning();
  }
  if (request.surface !== "current") {
    forceArrivalSurface = request.surface === "arrival";
    newPlanDraftMode = false;
    const target = new URL(location.href);
    target.searchParams.delete("kitchen");
    target.searchParams.delete("lab");
    if (request.surface === "plan") target.searchParams.set("plan", "1");
    else target.searchParams.delete("plan");
    history.replaceState({}, "", target);
  }
  return { ok: true, code: "VIEW_GUIDED", guide: request, acceptedStateChanged: false, next: "Keep working from canonical Finite state. Move the person's view again only when it materially helps them follow along." };
};
const modelContext = document.modelContext;
window.finitePlanCanary?.adapter?.dispose();
const adapter = modelContext ? new FinitePlanWebMCPAdapter(modelContext, runtime, async ({ toolName, result }) => {
  if (["PLAN_ACTIVATED", "PLAN_AMENDMENT_ACTIVATED", "PLAN_SWITCHED", "PROFILE_SWITCHED"].includes(result.code)) scopedStorage.setItem("finite-plan.surface.active-profile", runtime.kernel.profile.planId);
  if (["PLAN_ACTIVATED", "PLAN_AMENDMENT_ACTIVATED"].includes(result.code)) persistedPlanIds.add(runtime.kernel.profile.planId);
  if (["PLAN_ACTIVATED", "PLAN_AMENDMENT_ACTIVATED", "PLAN_SWITCHED", "PROFILE_SWITCHED"].includes(result.code)) { await refreshPlanInputs(); await refreshPlanWork(); await refreshPlanLearning(); await syncAdaptiveChecklist(); }
  if (["PLAN_ACTIVATED", "PLAN_AMENDMENT_ACTIVATED", "PLAN_FACT_CHANGES_APPLIED"].includes(result.code)) await refreshPlanDisplayNames();
  if (toolName.includes("arrival") || result.code.startsWith("ARRIVAL_") || result.code === "ORDER_VERSION_CONFLICT" || ["PLAN_ACTIVATED", "PLAN_AMENDMENT_ACTIVATED", "IDEMPOTENT_PLAN_ACTIVATION_REPLAY"].includes(result.code)) arrivalResult = await arrivalRepository.open();
  const manifest = await render();
  const guidedView = result.code === "VIEW_GUIDED" ? applyCodexSpotlight(result.guide as FiniteGuideViewRequest) : null;
  return {
    toolName,
    resultCode: result.code,
    planRevision: runtime.kernel.revision,
    profileId: runtime.kernel.profile.profileId,
    activeEventId: runtime.kernel.activeEventId,
    manifestHash: manifest.manifestHash,
    ...(guidedView ? { guidedView } : {}),
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
}, planInputRepository, async (result) => {
  planInputs = result.inputs;
}, planWorkRepository, async (result: PlanWorkResult) => {
  checklistItems = result.checklist;
  planAttachments = result.attachments;
}, planLearningRepository, async (result: PlanLearningResult) => {
  planRetrospective = result.retrospective;
  profileMemories = result.memories;
}).withGuideView(guideView).useBoundedOutputs().useStableDispatcher() : null;
if (adapter) {
  const inventory = await adapter.register();
  window.finiteEnterKitchen = (input, context) => adapter.enterKitchen(input, context);
  webmcpReadiness.state = "ready";
  webmcpReadiness.inventory = inventory;
}
const hotModule = (import.meta as ImportMeta & { hot?: { dispose(callback: () => void): void } }).hot;
if (hotModule) hotModule.dispose(() => adapter?.dispose());

let busy = false;
type WorkspaceUiState = {
  openModules: Set<string>;
  openRecordOptions: Set<string>;
  calendarViews: Map<string, "calendar" | "list">;
  calendarSelections: Map<string, string>;
  calendarFilters: Map<string, string>;
};
const workspaceUiState: WorkspaceUiState = {
  openModules: new Set(),
  openRecordOptions: new Set(),
  calendarViews: new Map(),
  calendarSelections: new Map(),
  calendarFilters: new Map(),
};
let customWorkspaceOpen = false;
let message = "";
let messageScope = "";
let settingsBusy = false;
let settingsMessage = "";
let settingsError = "";
let planInputDialogOpen = false;
let planInputBusy = false;
let planInputError = "";
let planInputEditingId: string | null = null;
let planInputContext: { section: PlanInputSection; contextId: string | null; contextLabel: string | null } = { section: "general", contextId: null, contextLabel: null };
let attachmentDialogOpen = false;
let planWorkBusy = false;
let planWorkError = "";
let planLearningBusy = false;
let planLearningError = "";
let lessonsOpen = false;
let profilePageBusy = false;
let profilePageError = "";
let profilePageMessage = "";
let attachmentContext: { section: PlanInputSection; contextId: string | null; contextLabel: string | null } = { section: "general", contextId: null, contextLabel: null };
let planFactDialogOpen = false;
let planFactBusy = false;
let planFactError = "";
let planStatusDialogOpen = false;
const openManagingZones = new Set<string>();
let draftReturnFormOpen = false;
let planActivationError = "";
let kitchenResetPreview: KitchenResetResult | null = null;
let themeSettingsOpen = false;
let themeEditingId: string | null = null;
let themeDeleteId: string | null = null;
let skinEditingId: string | null = null;
let skinDeleteId: string | null = null;
type ShareDialogMode = "closed" | "choose" | "compose" | "signin";
let shareDialogMode: ShareDialogMode = "closed";
let shareBusy = false;
let shareDraft: { label: string; mode: PlanShareMode; sections: PlanShareSection[] } = { label: "Plan update", mode: "live", sections: ["overview"] };
let sharePreview: PublicPlanProjection | null = null;
let sharePreviewKey = "";
let planPublications: PlanPublicationRecord[] = [];
let newPublicationUrl = "";
let shareError = "";
let labAcceptanceResult: unknown = null;

const escapeHtml = (value: unknown): string => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#039;");

const renderHeaderControls = (): string => {
  const accountName = authSession.displayName.trim() || (authSession.kind === "demo" ? "Finite demo" : "Finite account");
  const initial = Array.from(accountName)[0]?.toLocaleUpperCase() ?? "F";
  const settingsTarget = new URL(location.href);
  settingsTarget.searchParams.delete("about");
  settingsTarget.searchParams.set("settings", "1");
  const settingsPath = `${settingsTarget.pathname}${settingsTarget.search}${settingsTarget.hash}`;
  const aboutTarget = new URL(location.href);
  aboutTarget.searchParams.delete("settings");
  aboutTarget.searchParams.set("about", "1");
  const aboutPath = `${aboutTarget.pathname}${aboutTarget.search}${aboutTarget.hash}`;
  const proposedCount = profileMemories.filter((memory) => memory.status === "proposed").length;
  return `${authSession.kind === "account" ? `<a class="header-action header-action--about" href="${escapeHtml(aboutPath)}">About you${proposedCount ? `<span>${proposedCount}</span>` : ""}</a><button type="button" class="header-action" data-action="open-theme-settings">Appearance</button>` : ""}
    <details class="account-menu">
      <summary aria-label="Open account menu for ${escapeHtml(accountName)}"><span class="account-menu__avatar" aria-hidden="true">${escapeHtml(initial)}</span></summary>
      <div class="account-menu__popover">
        <p><span>Signed in as</span><strong>${escapeHtml(accountName)}</strong></p>
        <details class="account-menu__how">
          <summary>How Finite works</summary>
          <div><p>Think of Finite as the kitchen behind your plan: you describe the outcome, ${escapeHtml(agenticName())} works through the moving parts, and you approve the exact result.</p><ol><li>Say what needs to happen.</li><li>${escapeHtml(agenticName())} keeps the whole plan coherent.</li><li>You review and approve every consequential change.</li></ol></div>
        </details>
        ${authSession.kind === "account" ? `<a href="${escapeHtml(aboutPath)}">About you</a>` : ""}
        <a href="${escapeHtml(settingsPath)}">Settings</a>
        <button type="button" data-action="open-kitchen-reset">Start over</button>
        ${authSession.kind === "demo" ? `<button type="button" data-action="end-demo">End demo</button>` : `<a href="/signout-with-chatgpt?return_to=/">Sign out</a>`}
      </div>
    </details>`;
};

const guideTargetSelectors: Record<FiniteGuideTarget, { label: string; selectors: string[] }> = {
  top: { label: "the top of this page", selectors: [".arrival-compose", ".arrival-order-head", ".hero"] },
  starting_point: { label: "your starting point", selectors: [".arrival-order", ".arrival-order-source"] },
  status: { label: "the current status", selectors: [".arrival-state", ".plan-status-strip", ".lifecycle-control"] },
  question: { label: `${agenticName()}'s question`, selectors: [".arrival-question"] },
  priority: { label: `${agenticName()}'s current priority section`, selectors: ["[data-codex-priority='true']", ".starter-module__questions"] },
  review: { label: "the item ready for your review", selectors: [".arrival-review", ".plan-intake", ".zone--approval_panel"] },
  interpretation: { label: `${agenticName()}'s working interpretation`, selectors: [".arrival-interpretation"] },
  updates: { label: "where to add or correct information", selectors: [".arrival-continuity", ".plan-input-items", ".plan-input-dialog", "[data-action='open-plan-input']"] },
  plan_summary: { label: "the plan summary", selectors: [".hero", ".plan-orbit"] },
  stages: { label: "the plan stages", selectors: [".zone--timeline_lane", ".zone--phase_lane", ".zone--run_of_show", ".stage-list"] },
  options: { label: "the available options", selectors: [".zone--option_compare", ".option-grid"] },
  approval: { label: "the approval area", selectors: [".zone--approval_panel", ".plan-intake", ".lifecycle-control--pending"] },
  receipt: { label: "the latest receipt", selectors: [".receipt"] },
};
let spotlightTimer: number | null = null;
const clearCodexSpotlight = (): void => {
  if (spotlightTimer !== null) window.clearTimeout(spotlightTimer);
  spotlightTimer = null;
  root.querySelectorAll<HTMLElement>("[data-codex-spotlight]").forEach((element) => element.removeAttribute("data-codex-spotlight"));
};
const applyCodexSpotlight = (request: FiniteGuideViewRequest): { target: FiniteGuideTarget; found: boolean; surface: string } => {
  clearCodexSpotlight();
  const descriptor = guideTargetSelectors[request.target];
  const exactPriority = request.target === "priority" && request.sectionId
    ? root.querySelector<HTMLElement>(`[data-workspace-module='${CSS.escape(request.sectionId)}']`)
    : null;
  const element = exactPriority ?? descriptor.selectors.map((selector) => root.querySelector<HTMLElement>(selector)).find(Boolean);
  const surface = forceArrivalSurface || root.querySelector(".arrival-main") ? "arrival" : "plan";
  if (!element) {
    announce(`${agenticName()} refreshed this view. ${descriptor.label.charAt(0).toUpperCase()}${descriptor.label.slice(1)} is not on this screen yet.`);
    return { target: request.target, found: false, surface };
  }
  const disclosure = element instanceof HTMLDetailsElement ? element : element.closest<HTMLDetailsElement>("details");
  if (disclosure) disclosure.open = true;
  element.setAttribute("data-codex-spotlight", "true");
  element.scrollIntoView({ behavior: "smooth", block: "center" });
  announce(`${agenticName()} is showing ${descriptor.label}.`);
  spotlightTimer = window.setTimeout(() => { element.removeAttribute("data-codex-spotlight"); spotlightTimer = null; }, 7_000);
  return { target: request.target, found: true, surface };
};

const bindFollowCodexInteractions = (): void => {
  root.querySelector<HTMLInputElement>("[data-action='toggle-follow-codex']")?.addEventListener("change", (event) => {
    followCodexEnabled = (event.currentTarget as HTMLInputElement).checked;
    if (followCodexEnabled) {
      scopedStorage.setItem("finite-plan.follow-codex", "true");
      const safetyFirst = /allerg/i.test(root.textContent ?? "")
        ? root.querySelector<HTMLDetailsElement>("[data-workspace-module='requirements'][data-open-questions]:not([data-open-questions='0'])")
        : null;
      const priority = safetyFirst
        ?? root.querySelector<HTMLDetailsElement>("[data-workspace-module][data-open-questions]:not([data-open-questions='0'])")
        ?? root.querySelector<HTMLDetailsElement>("[data-workspace-module][data-codex-phase-current='true']")
        ?? root.querySelector<HTMLDetailsElement>("[data-workspace-module]");
      if (priority) {
        activeCodexPrioritySectionId = priority.dataset.workspaceModule ?? "";
        scopedStorage.setItem("finite-plan.codex-priority-section", activeCodexPrioritySectionId);
        priority.dataset.codexPriority = "true";
        priority.classList.add("is-codex-priority");
        priority.open = true;
      }
    } else {
      scopedStorage.removeItem("finite-plan.follow-codex");
      scopedStorage.removeItem("finite-plan.codex-priority-section");
      activeCodexPrioritySectionId = "";
      clearCodexSpotlight();
      root.querySelectorAll<HTMLElement>("[data-codex-priority]").forEach((element) => { element.removeAttribute("data-codex-priority"); element.classList.remove("is-codex-priority"); });
    }
    announce(followCodexEnabled ? `${agenticName()} may now refresh, move and highlight this Finite view.` : `${agenticName()} can keep working, but cannot move or highlight this view.`);
  });
};

type HeaderPlanChoice = { planId: string; profileId: string; profileHash: string; name: string; title: string; active: boolean; supersededBy: string | null };
const newPlanChoice = "__new_plan__";

const renderPlanSwitcher = (surface: "arrival" | "plan", activeTitle?: string): string => {
  const plans = (runtime.listPlans().plans as HeaderPlanChoice[]).filter((plan) => persistedPlanIds.has(plan.planId) || (surface === "plan" && plan.active));
  const current = plans.filter((plan) => !plan.supersededBy);
  const earlier = plans.filter((plan) => Boolean(plan.supersededBy));
  const arrivalDraftTitle = surface === "arrival" && currentArrival() ? starterPlanForArrival(currentArrival()!)?.title ?? "Current draft" : null;
  const options = (items: HeaderPlanChoice[], historical = false): string => items.map((plan) => `<option value="${escapeHtml(plan.planId)}" ${surface === "plan" && plan.active ? "selected" : ""}>${escapeHtml(surface === "plan" && plan.active && activeTitle ? activeTitle : planDisplayNames.get(plan.planId) ?? plan.name)}${historical ? " · earlier version" : ""}</option>`).join("");
  return `<label class="plan-switcher"><span>Plans</span><select data-action="plan-switch" aria-label="Open a Finite plan" ${busy ? "disabled" : ""}>
    ${arrivalDraftTitle ? `<optgroup label="Drafts"><option value="" selected>${escapeHtml(arrivalDraftTitle)} · draft</option></optgroup>` : ""}
    <optgroup label="Plan actions"><option value="${newPlanChoice}">＋ Create a new plan…</option></optgroup>
    ${current.length ? `<optgroup label="Current plans">${options(current)}</optgroup>` : ""}
    ${earlier.length ? `<optgroup label="Earlier versions">${options(earlier, true)}</optgroup>` : ""}
  </select></label>`;
};

const renderShareHeaderAction = (context: "arrival" | "plan"): string => `<button type="button" class="header-action header-action--share" data-action="open-plan-share" data-share-context="${context}">${context === "plan" && runtime.kernel.lifecycleStatus === "completed" ? "Share this summary" : "Share this plan"}</button>`;

type FiniteLifecycleStage = "starting" | "planning" | "managing" | "wrapping";
const finiteLifecycleStages: Array<{ id: FiniteLifecycleStage; label: string; detail: string }> = [
  { id: "starting", label: "Starting", detail: "Outcome and limits" },
  { id: "planning", label: "Planning", detail: "Build the plan" },
  { id: "managing", label: "Managing", detail: "Day-to-day use" },
  { id: "wrapping", label: "Finished", detail: "Outcome summary" },
];

const lifecycleStageForPlan = (status: PlanLifecycleStatus): FiniteLifecycleStage =>
  status === "completed" || status === "abandoned" ? "wrapping" : "managing";

const renderLifecycleRail = (current: FiniteLifecycleStage): string => {
  const currentIndex = finiteLifecycleStages.findIndex((stage) => stage.id === current);
  return `<nav class="plan-lifecycle" aria-label="Plan lifecycle">
    <ol>${finiteLifecycleStages.map((stage, index) => {
      const state = index < currentIndex ? "complete" : index === currentIndex ? "current" : "upcoming";
      const detail = current === "wrapping" && stage.id === "wrapping" && runtime.kernel.lifecycleStatus === "abandoned" ? "Plan closed" : stage.detail;
      return `<li class="plan-lifecycle__step is-${state}" ${state === "current" ? 'aria-current="step"' : ""}>
        <span class="plan-lifecycle__marker" aria-hidden="true">${state === "complete" ? "✓" : index + 1}</span>
        <span class="plan-lifecycle__copy"><strong>${stage.label}</strong><small>${state === "current" ? "Current · " : ""}${detail}</small></span>
      </li>`;
    }).join("")}</ol>
  </nav>`;
};

const shareSelectionKey = (draft = shareDraft): string => JSON.stringify({ label: draft.label.trim(), mode: draft.mode, sections: [...draft.sections].sort() });
const shareSectionOptions: Array<{ id: PlanShareSection; name: string; description: string }> = [
  { id: "overview", name: "Summary", description: "Plan name, headline, brief, revision and status." },
  { id: "allocation", name: "Finances", description: "Total, spent, committed, forecast and remaining room." },
  { id: "measures", name: "Key measures", description: "The plan’s primary dates, counts or operating measures." },
  { id: "stages", name: "Timeline or stages", description: "The current plan shape and stage status." },
  { id: "changes", name: "Recent changes", description: "Titles of the five latest accepted plan changes." },
  { id: "outcome", name: "Outcome", description: "Closing note, completion time and recorded actual spend." },
  { id: "progress", name: "Progress", description: "What was finished and what remained open." },
  { id: "decisions", name: "Decisions", description: "Decisions and updates saved directly to the plan." },
  { id: "references", name: "References", description: "Selected file names, notes and links—not private uploads." },
];

const renderPlanShareDialog = (): string => {
  const plans = (runtime.listPlans().plans as HeaderPlanChoice[]).filter((plan) => persistedPlanIds.has(plan.planId));
  const currentPlans = plans.filter((plan) => !plan.supersededBy);
  const earlierPlans = plans.filter((plan) => Boolean(plan.supersededBy));
  if (shareDialogMode === "signin") return `<dialog class="plan-share-dialog plan-share-dialog--choice" data-plan-share-dialog aria-labelledby="plan_share_title">
    <button type="button" class="plan-share-dialog__close" data-action="close-plan-share" aria-label="Close share dialog">×</button>
    <header class="plan-share-dialog__head"><p class="eyebrow">Share a plan</p><h2 id="plan_share_title">Sign in to publish a view.</h2><p>A demo expires. Sign in first so Finite can keep the plan, its live or frozen pages, and your revocation controls together.</p></header>
    <div class="plan-share-choice__actions"><a class="button" href="/signin-with-chatgpt?return_to=/">Continue with ChatGPT</a><button type="button" class="text-button" data-action="close-plan-share">Not now</button></div>
  </dialog>`;
  if (shareDialogMode === "choose") return `<dialog class="plan-share-dialog plan-share-dialog--choice" data-plan-share-dialog aria-labelledby="plan_share_title">
    <button type="button" class="plan-share-dialog__close" data-action="close-plan-share" aria-label="Close share dialog">×</button>
    <header class="plan-share-dialog__head"><p class="eyebrow">Share a plan</p><h2 id="plan_share_title">${plans.length ? "Which plan do you want to share?" : "There isn’t a plan to share yet."}</h2><p>${plans.length ? "Choose an existing plan, then decide exactly what the other person can see." : "Start with the outcome you want. Once the plan exists, you can publish a live page or freeze a one-off view."}</p></header>
    ${shareError ? `<p class="plan-share-error" role="alert">${escapeHtml(shareError)}</p>` : ""}
    ${plans.length ? `<form class="plan-share-choice" data-share-plan-choice>
      <label><span>Plan to share</span><select name="planId" required aria-label="Choose a plan to share">
        <option value="">Choose a plan…</option>
        ${currentPlans.length ? `<optgroup label="Current plans">${currentPlans.map((plan) => `<option value="${escapeHtml(plan.planId)}">${escapeHtml(planDisplayNames.get(plan.planId) ?? plan.name)}</option>`).join("")}</optgroup>` : ""}
        ${earlierPlans.length ? `<optgroup label="Earlier versions">${earlierPlans.map((plan) => `<option value="${escapeHtml(plan.planId)}">${escapeHtml(planDisplayNames.get(plan.planId) ?? plan.name)} · earlier version</option>`).join("")}</optgroup>` : ""}
      </select></label>
      <button type="submit" class="button">Choose what to share</button>
    </form>` : ""}
    <section class="plan-share-new"><div><p class="eyebrow">${plans.length ? "Not here?" : "First step"}</p><h3>${plans.length ? "The plan you want doesn’t exist yet." : "Create the plan first."}</h3><p>Describe what you are trying to make happen. Finite will keep that new plan separate from anything already here.</p></div><button type="button" class="button button--secondary" data-action="start-plan-from-share">Start a new plan</button></section>
  </dialog>`;
  const active = planPublications.filter((publication) => !publication.revokedAt);
  return `<dialog class="plan-share-dialog" data-plan-share-dialog aria-labelledby="plan_share_title">
    <button type="button" class="plan-share-dialog__close" data-action="close-plan-share" aria-label="Close share dialog">×</button>
    <header class="plan-share-dialog__head"><p class="eyebrow">Share a read-only page</p><h2 id="plan_share_title">Choose what they can see.</h2><p>Pick the parts of this plan that belong on the page. Make it live so accepted changes keep appearing, or freeze it exactly as it is now.</p></header>
    ${newPublicationUrl ? `<section class="plan-share-created" aria-labelledby="plan_share_created"><p class="eyebrow">Page published</p><h3 id="plan_share_created">Your private link is ready.</h3><div><input value="${escapeHtml(newPublicationUrl)}" readonly data-publication-url aria-label="Published plan URL"><button type="button" class="button" data-action="copy-publication-url">Copy link</button></div><p>Anyone with this unguessable link can see only the page preview you approved. Keep or revoke it whenever you like.</p></section>` : ""}
    <div class="plan-share-workspace">
      <form class="plan-share-form" data-plan-share-form>
        <label class="plan-share-label"><span>Name this shared page</span><input name="label" maxlength="80" required value="${escapeHtml(shareDraft.label)}" placeholder="Family update, contractor view…"><small>This name helps you recognise the link later.</small></label>
        <fieldset class="plan-share-mode"><legend>Should it keep changing?</legend>
          <label><input type="radio" name="mode" value="live" ${shareDraft.mode === "live" ? "checked" : ""}><span><strong>Live</strong><small>Follows accepted changes.</small></span></label>
          <label><input type="radio" name="mode" value="frozen" ${shareDraft.mode === "frozen" ? "checked" : ""}><span><strong>Frozen</strong><small>Never changes.</small></span></label>
        </fieldset>
        <fieldset class="plan-share-sections"><legend>What goes on the page?</legend>${shareSectionOptions.map((option) => `<label><input type="checkbox" name="sections" value="${option.id}" ${shareDraft.sections.includes(option.id) ? "checked" : ""} ${option.id === "overview" ? "disabled" : ""}><span><strong>${option.name}${option.id === "overview" ? " · always" : ""}</strong><small>${option.description}</small></span></label>`).join("")}</fieldset>
        ${shareError ? `<p class="plan-share-error" role="alert">${escapeHtml(shareError)}</p>` : ""}
        <div class="plan-share-actions"><button type="submit" class="button button--secondary" data-share-intent="preview" ${shareBusy ? "disabled" : ""}>Update preview</button><button type="submit" class="button" data-share-intent="publish" ${shareBusy || !sharePreview || sharePreviewKey !== shareSelectionKey() ? "disabled" : ""}>Publish this page</button><small data-share-preview-state>${sharePreview && sharePreviewKey === shareSelectionKey() ? "Preview matches your choices." : "Preview your choices before publishing."}</small></div>
      </form>
      <section class="plan-share-preview" aria-labelledby="plan_share_preview"><header><div><p class="eyebrow">Their view</p><h3 id="plan_share_preview">This is all they can see.</h3></div><span>${sharePreview ? (sharePreview.mode === "live" ? "Live" : "Frozen") : "Not ready"}</span></header>${sharePreview ? `<div class="plan-share-preview__label"><span>Shared as</span><strong>${escapeHtml(shareDraft.label)}</strong></div>${renderPublicProjection(sharePreview, true)}` : `<p>Choose the page contents, then preview them before publishing.</p>`}</section>
    </div>
    <section class="plan-share-existing" aria-labelledby="plan_share_existing"><header><p class="eyebrow">Links you’ve shared</p><h3 id="plan_share_existing">Active pages</h3></header>${active.length ? `<p class="plan-share-existing__note">For privacy, a link can be copied only when it is first published. You can revoke any active page here.</p><ul>${active.map((publication) => `<li><div><strong>${escapeHtml(publication.label)}</strong><span>${publication.mode === "live" ? "Live view" : "Frozen snapshot"} · ${publication.sections.map((section) => shareSectionOptions.find((option) => option.id === section)?.name ?? section).join(", ")}</span><small>Published ${escapeHtml(new Date(publication.createdAt).toLocaleDateString(undefined, { dateStyle: "medium" }))}</small></div><button type="button" class="text-button" data-revoke-publication="${escapeHtml(publication.shareId)}">Revoke</button></li>`).join("")}</ul>` : `<p>You haven’t published a page for this plan yet.</p>`}</section>
    <footer class="plan-share-boundary"><strong>Stays private</strong><p>Your original request, notes, working details, editing and approval controls.</p></footer>
  </dialog>`;
};

const resetCategoryCount = (names: string[]): number => names.reduce((sum, name) => sum + Number(kitchenResetPreview?.counts?.[name] ?? 0), 0);

const renderKitchenResetDialog = (): string => {
  const total = Number(kitchenResetPreview?.totalRecords ?? 0);
  const ready = kitchenResetPreview?.ok === true;
  return `<dialog class="kitchen-reset-dialog" data-kitchen-reset-dialog aria-labelledby="kitchen_reset_title">
    <form method="dialog" class="kitchen-reset-dialog__close"><button aria-label="Close start-over dialog">×</button></form>
    <div class="kitchen-reset-dialog__intro"><p class="eyebrow">Permanent reset / this account only</p><h2 id="kitchen_reset_title">Start Finite over?</h2><p>This deletes every plan and all saved work in this Finite account. It does not sign you out or change a booking, purchase, supplier, calendar, or any other external system.</p></div>
    ${ready ? `<dl class="kitchen-reset-dialog__counts">
      <div><dt>Arrival history</dt><dd>${resetCategoryCount(["arrival_orders", "arrival_events"])}</dd></div>
      <div><dt>Plans, revisions and shared pages</dt><dd>${resetCategoryCount(["plan_catalog", "plan_heads", "plan_revisions", "activation_receipts", "plan_shares"])}</dd></div>
      <div><dt>Construction work</dt><dd>${resetCategoryCount(["construction_packets", "construction_return_reviews"])}</dd></div>
      <div><dt>Evidence, decisions and receipts</dt><dd>${resetCategoryCount(["evidence_records", "domain_events", "receipts", "operation_log"])}</dd></div>
      <div><dt>Authority and operator sessions</dt><dd>${resetCategoryCount(["authority_challenges", "challenge_consumptions", "operator_sessions"])}</dd></div>
    </dl><p class="kitchen-reset-dialog__total"><strong>${total}</strong> durable record${total === 1 ? "" : "s"} will be cleared, plus this tenant's browser cache.</p>` : `<p class="kitchen-reset-dialog__warning">Finite could not verify the exact reset scope. Nothing can be deleted until the preview loads.</p>`}
    <form data-kitchen-reset-form class="kitchen-reset-dialog__form">
      <label><span>Type <strong>${kitchenResetConfirmation}</strong> to confirm</span><input name="confirmation" required autocomplete="off" spellcheck="false" pattern="${kitchenResetConfirmation}" ${ready ? "" : "disabled"}></label>
      <div><button class="button button--danger" type="submit" ${ready && !busy ? "" : "disabled"}>Permanently start over</button><button class="text-button" type="button" data-action="cancel-kitchen-reset">Keep everything</button></div>
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
    <div class="skin-card__sample skin-preview skin-preview--type-${skin.recipe.typeStyle} skin-preview--heading-${skin.recipe.headingScale} skin-preview--density-${skin.recipe.density} skin-preview--corner-${skin.recipe.cornerStyle} skin-preview--border-${skin.recipe.borderStyle} skin-preview--shadow-${skin.recipe.shadowStyle} skin-preview--control-${skin.recipe.controlStyle} skin-preview--panel-${skin.recipe.panelStyle} skin-preview--motion-${skin.recipe.motionStyle}" role="img" aria-label="${escapeHtml(skin.name)} example showing the same Paris travel plan">
      <div class="skin-preview__bar"><span><i class="skin-preview__motion" aria-hidden="true"></i>Travel plan</span><em>On track</em></div>
      <h4>Paris without overruns.</h4>
      <p>Seven days · A$8,400 cap</p>
      <div class="skin-preview__panel"><small>Room to move</small><strong>A$1,260</strong><i>15% held back</i></div>
      <b class="skin-preview__control">Review plan</b>
    </div>
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
    <header class="theme-settings-dialog__head"><p class="eyebrow">Appearance / this account</p><h2 id="theme_settings_title">Choose how Finite feels.</h2><p>Skins change Finite’s visual character without moving its layout. Palettes set colour independently. Plan identity, authority and accepted truth stay unchanged.</p></header>
    <section class="appearance-section" aria-labelledby="skin_heading"><div class="appearance-section__head"><p class="eyebrow">01 / Skin</p><h3 id="skin_heading">Visual character</h3><p>Each choice shows the same Finite plan, so you can compare typography, hierarchy, panels and controls before applying it.</p></div><div class="skin-gallery">${allSkins().map(renderSkinCard).join("")}</div></section>
    <details class="theme-maker skin-maker" ${editingSkin ? "open" : ""}>
      <summary><span>${editingSkin ? "Editing your skin" : "Custom skin"}</span><strong>${editingSkin ? escapeHtml(skinDraft.name) : "Compose a recipe"}</strong><small>Bounded visual traits</small></summary>
      <form data-skin-custom-form>
        <input type="hidden" name="skinId" value="${editingSkin ? escapeHtml(skinDraft.skinId) : ""}">
        <div class="theme-maker__identity"><label><span>Name</span><input name="name" required maxlength="60" value="${editingSkin ? escapeHtml(skinDraft.name) : ""}" placeholder="Calm studio"></label><label><span>Description</span><input name="description" required maxlength="160" value="${editingSkin ? escapeHtml(skinDraft.description) : ""}" placeholder="A quiet, spacious working surface."></label></div>
        <div class="skin-trait-grid">${skinTraitKeys.map((key) => `<label><span>${escapeHtml(skinTraitLabel(key))}</span><select name="${key}" aria-label="${escapeHtml(skinTraitLabel(key))}">${skinTraitOptions[key].map((value) => `<option value="${value}" ${skinDraft.recipe[key] === value ? "selected" : ""}>${escapeHtml(skinTraitLabel(value))}</option>`).join("")}</select></label>`).join("")}</div>
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
          <label><span>Mode</span><select name="mode" aria-label="Palette mode"><option value="light" ${draft.mode === "light" ? "selected" : ""}>Light</option><option value="dark" ${draft.mode === "dark" ? "selected" : ""}>Dark</option></select></label>
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

const currentArrival = (): ArrivalOrder | null => !newPlanDraftMode && arrivalResult.ok && arrivalResult.order ? arrivalResult.order : null;
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
  agenticName: agenticName(),
  order: currentArrival(),
  entryIntent: currentArrival()
    ? "resume_handoff"
    : new URLSearchParams(location.search).has("plan") || new URLSearchParams(location.search).has("kitchen") || new URLSearchParams(location.search).has("lab")
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
  return `<button type="button" class="codex-handoff-trigger${followCodexEnabled ? " is-guided" : ""}" data-action="open-codex-handoff" aria-haspopup="dialog"><span aria-hidden="true"></span>${escapeHtml(handoff.buttonLabel)}${followCodexEnabled ? `<small>${escapeHtml(agenticName())} view on</small>` : ""}</button>`;
};

const renderCodexHandoffDialog = (): string => {
  const handoff = currentCodexHandoff();
  const order = currentArrival();
  const manualNeedsTakeover = Boolean(order && !starterPlanForArrival(order));
  return `<dialog class="codex-handoff-dialog" data-codex-handoff-dialog aria-labelledby="codex_handoff_title">
    <form method="dialog" class="codex-handoff-sheet">
      <header>
        <div><p class="eyebrow">${order ? "Your starting point is saved" : "Your plan stays here"}</p><h2 id="codex_handoff_title">How do you want to continue?</h2></div>
        <button class="codex-handoff-close" value="close" aria-label="Close ${escapeHtml(agenticName())} handoff">×</button>
      </header>
      <p class="codex-handoff-lede">Bring ${escapeHtml(agenticName())} in to research and develop the rough plan, or keep editing it yourself. You can bring ${escapeHtml(agenticName())} in later.</p>
      <div class="codex-handoff-choices" aria-label="Ways to continue">
        <section class="codex-handoff-choice codex-handoff-choice--codex">
          <span>With ${escapeHtml(agenticName())}</span><strong>Research and develop the plan</strong><p>${escapeHtml(handoff.detail)}</p>
          <button type="button" class="button" data-action="copy-codex-handoff">Continue in ${escapeHtml(agenticName())}</button>
        </section>
        <section class="codex-handoff-choice codex-handoff-choice--manual">
          <span>Without ${escapeHtml(agenticName())}</span><strong>${manualNeedsTakeover ? "Edit the saved plan yourself" : "Keep editing here"}</strong><p>${manualNeedsTakeover ? `Open an editable workspace using what you wrote as the starting point. It has not been researched or developed by ${escapeHtml(agenticName())}.` : `Close this window and continue editing the current plan. ${escapeHtml(agenticName())} will not be involved.`}</p>
          <button type="button" class="button button--secondary" data-action="continue-arrival-manually">${manualNeedsTakeover ? "Edit manually for now" : "Continue without Codex"}</button>
        </section>
        <small class="codex-handoff-choice-note codex-handoff-choice-note--codex" data-codex-handoff-status>Copies one introduction for your ${escapeHtml(agenticName())} task.</small>
        <small class="codex-handoff-choice-note codex-handoff-choice-note--manual">Everything remains editable. Ask ${escapeHtml(agenticName())} for help whenever you want.</small>
        <label class="codex-handoff-guidance"><input type="checkbox" data-action="toggle-follow-codex" ${followCodexEnabled ? "checked" : ""}><span><strong>Let ${escapeHtml(agenticName())} guide this view</strong><small>Allow it to refresh, move and highlight Finite while you work together.</small></span></label>
      </div>
      <section class="codex-handoff-copied" data-codex-handoff-copied tabindex="-1" hidden>
        <span>Prompt copied</span>
        <h3>Open ${escapeHtml(agenticName())} and paste the prompt to continue.</h3>
        <p>${escapeHtml(agenticName())} will enter this plan from the latest saved state. Finite does not need to stay blocked while that happens.</p>
        <div class="codex-handoff-copied__actions">
          <button type="button" class="button" data-action="copy-codex-handoff">Copy again</button>
          <button type="button" class="button button--secondary" data-action="continue-arrival-while-codex-starts">Continue to the plan while you wait</button>
        </div>
      </section>
      <details class="codex-handoff-advanced"><summary>What will be copied?</summary><label class="codex-handoff-prompt"><span>Finite plan handoff</span><textarea readonly spellcheck="false" data-codex-handoff-prompt>${escapeHtml(handoff.prompt)}</textarea></label></details>
    </form>
  </dialog>`;
};

const continueArrivalManually = async (): Promise<void> => {
  const dialog = root.querySelector<HTMLDialogElement>("[data-codex-handoff-dialog]");
  const order = currentArrival();
  dialog?.close();
  if (!order || starterPlanForArrival(order)) {
    announce("Keep editing the plan here. You can bring in Codex whenever you want.");
    return;
  }
  if (busy) return;
  busy = true;
  announce("Opening your editable rough plan…");
  arrivalResult = await arrivalRepository.appendInput({
    orderId: order.orderId,
    expectedVersion: order.version,
    kind: "preference",
    payload: { workspaceOperation: "manual_takeover", planningMode: "manual" },
    sourceSurface: modelContext ? "inline" : "site",
  });
  busy = false;
  announce(arrivalResult.ok ? "Your editable rough plan is open. Codex has not processed it." : `The rough plan could not be opened: ${arrivalResult.code}`);
  await render();
};

const continueArrivalWhileCodexStarts = async (): Promise<void> => {
  const dialog = root.querySelector<HTMLDialogElement>("[data-codex-handoff-dialog]");
  const order = currentArrival();
  dialog?.close();
  if (!order || starterPlanForArrival(order)) {
    root.querySelector<HTMLElement>("[data-starter-plan]")?.scrollIntoView({ behavior: "smooth", block: "start" });
    announce(`Keep editing here while ${agenticName()} opens the saved plan.`);
    return;
  }
  if (busy) return;
  busy = true;
  announce(`Opening the rough plan while ${agenticName()} starts…`);
  arrivalResult = await arrivalRepository.appendInput({
    orderId: order.orderId,
    expectedVersion: order.version,
    kind: "preference",
    payload: { workspaceOperation: "codex_handoff_workspace", planningMode: "codex" },
    sourceSurface: modelContext ? "inline" : "site",
  });
  busy = false;
  announce(arrivalResult.ok ? `Your rough plan is open. Keep editing while ${agenticName()} joins from the latest saved state.` : `The rough plan could not be opened: ${arrivalResult.code}`);
  await render();
  root.querySelector<HTMLElement>("[data-starter-plan]")?.scrollIntoView({ behavior: "smooth", block: "start" });
};

const bindCodexHandoffInteractions = (): void => {
  const dialog = root.querySelector<HTMLDialogElement>("[data-codex-handoff-dialog]");
  root.querySelectorAll<HTMLButtonElement>("[data-action='open-codex-handoff']").forEach((trigger) => trigger.addEventListener("click", () => dialog?.showModal()));
  dialog?.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
  root.querySelectorAll<HTMLButtonElement>("[data-action='copy-codex-handoff']").forEach((copyButton) => copyButton.addEventListener("click", async () => {
    const prompt = currentCodexHandoff().prompt;
    const status = root.querySelector<HTMLElement>("[data-codex-handoff-status]");
    try {
      await navigator.clipboard.writeText(prompt);
      const choices = root.querySelector<HTMLElement>(".codex-handoff-choices");
      const copied = root.querySelector<HTMLElement>("[data-codex-handoff-copied]");
      if (choices) choices.hidden = true;
      if (copied) { copied.hidden = false; copied.focus(); }
      if (status) status.textContent = `Copied. Open ${agenticName()} and paste the prompt to continue.`;
      announce(`${agenticName()} handoff copied.`);
    } catch {
      const textarea = root.querySelector<HTMLTextAreaElement>("[data-codex-handoff-prompt]");
      textarea?.focus();
      textarea?.select();
      if (status) status.textContent = "Automatic copying is unavailable here. The complete prompt is selected for you to copy.";
      announce("The handoff prompt is selected and ready to copy.");
    }
  }));
  root.querySelector<HTMLButtonElement>("[data-action='continue-arrival-manually']")?.addEventListener("click", () => { void continueArrivalManually(); });
  root.querySelector<HTMLButtonElement>("[data-action='continue-arrival-while-codex-starts']")?.addEventListener("click", () => { void continueArrivalWhileCodexStarts(); });
};

const readShareDraft = (form: HTMLFormElement): typeof shareDraft => {
  const label = form.querySelector<HTMLInputElement>("input[name='label']")?.value.trim() ?? "";
  const mode = form.querySelector<HTMLInputElement>("input[name='mode']:checked")?.value === "frozen" ? "frozen" : "live";
  const sections = [...form.querySelectorAll<HTMLInputElement>("input[name='sections']:checked")].map((input) => input.value as PlanShareSection);
  return { label, mode, sections: sections.includes("overview") ? sections : ["overview", ...sections] };
};

const openPlanShareDialog = async (): Promise<void> => {
  shareDialogMode = "compose";
  shareBusy = true;
  shareError = "";
  newPublicationUrl = "";
  const completed = runtime.kernel.lifecycleStatus === "completed";
  const currentPlanName = resolvePlanTitle({
    proposed: projectAcceptedPlanCopy(runtime.kernel.profile.name, runtime.kernel),
    brief: projectAcceptedPlanCopy(runtime.kernel.profile.surface.hero.brief, runtime.kernel),
  });
  shareDraft = { label: `${currentPlanName} ${completed ? "summary" : "update"}`, mode: completed ? "frozen" : "live", sections: completed ? ["overview", "allocation", "measures", "stages", "changes"] : ["overview"] };
  sharePreview = null;
  sharePreviewKey = "";
  await render();
  try {
    const [publications, preview] = await Promise.all([
      shareRepository.list(runtime.kernel.profile.planId),
      shareRepository.preview({ planId: runtime.kernel.profile.planId, mode: shareDraft.mode, sections: shareDraft.sections }),
    ]);
    planPublications = publications;
    sharePreview = preview;
    sharePreviewKey = shareSelectionKey();
  } catch (error) {
    shareError = error instanceof Error ? error.message : "The publication preview could not be prepared.";
  }
  shareBusy = false;
  await render();
};

const openPlanShareFlow = async (context: "arrival" | "plan"): Promise<void> => {
  shareError = "";
  if (authSession.kind !== "account") {
    shareDialogMode = "signin";
    await render();
    return;
  }
  if (context === "plan") {
    await openPlanShareDialog();
    return;
  }
  shareDialogMode = "choose";
  await render();
};

const choosePlanToShare = async (form: HTMLFormElement): Promise<void> => {
  const planId = String(new FormData(form).get("planId") ?? "");
  if (!planId) return;
  shareDialogMode = "closed";
  await openPlan(planId);
  if (runtime.kernel.profile.planId !== planId) {
    shareDialogMode = "choose";
    shareError = "That plan could not be opened safely. Choose it again or start a new plan.";
    await render();
    return;
  }
  await openPlanShareDialog();
};

const startNewPlan = async (): Promise<void> => {
  shareDialogMode = "closed";
  shareError = "";
  newPlanDraftMode = true;
  forceArrivalSurface = true;
  const target = new URL(location.href);
  target.searchParams.delete("plan");
  target.searchParams.delete("kitchen");
  target.searchParams.delete("lab");
  history.replaceState(null, "", `${target.pathname}${target.search}${target.hash}`);
  await render();
  root.querySelector<HTMLTextAreaElement>("[data-arrival-form='create'] textarea[name='codexOutcome']")?.focus();
};

const bindPlanSwitcherInteractions = (): void => {
  root?.querySelector<HTMLSelectElement>("[data-action='plan-switch']")?.addEventListener("change", (event) => {
    const planId = (event.currentTarget as HTMLSelectElement).value;
    if (planId === newPlanChoice) { void startNewPlan(); return; }
    if (planId) void openPlan(planId);
  });
};

const submitPlanShare = async (form: HTMLFormElement, intent: "preview" | "publish"): Promise<void> => {
  if (shareBusy) return;
  shareDraft = readShareDraft(form);
  shareError = "";
  newPublicationUrl = "";
  if (!shareDraft.label) {
    shareError = "Add a short audience label before previewing this page.";
    await render();
    return;
  }
  if (intent === "publish" && (!sharePreview || sharePreviewKey !== shareSelectionKey())) {
    shareError = "Preview this exact selection before publishing it.";
    await render();
    return;
  }
  shareBusy = true;
  await render();
  try {
    if (intent === "preview") {
      sharePreview = await shareRepository.preview({ planId: runtime.kernel.profile.planId, mode: shareDraft.mode, sections: shareDraft.sections });
      sharePreviewKey = shareSelectionKey();
    } else {
      const publication = await shareRepository.create({ planId: runtime.kernel.profile.planId, ...shareDraft });
      if (!publication.path) throw new Error("The page was published without a usable link.");
      newPublicationUrl = new URL(publication.path, location.origin).toString();
      planPublications = [publication, ...planPublications];
      announce("The read-only plan page is published. Its private link is ready to copy.");
    }
  } catch (error) {
    shareError = error instanceof Error ? error.message : "The plan page could not be published.";
  }
  shareBusy = false;
  await render();
};

const revokePlanShare = async (shareId: string): Promise<void> => {
  if (shareBusy) return;
  shareBusy = true;
  shareError = "";
  await render();
  try {
    await shareRepository.revoke(shareId);
    planPublications = await shareRepository.list(runtime.kernel.profile.planId);
    announce("The shared page was revoked. Its link no longer opens the plan view.");
  } catch (error) {
    shareError = error instanceof Error ? error.message : "The shared page could not be revoked.";
  }
  shareBusy = false;
  await render();
};

const bindPlanShareInteractions = (): void => {
  root.querySelectorAll<HTMLButtonElement>("[data-action='open-plan-share']").forEach((button) => button.addEventListener("click", () => { void openPlanShareFlow(button.dataset.shareContext === "plan" ? "plan" : "arrival"); }));
  const dialog = root.querySelector<HTMLDialogElement>("[data-plan-share-dialog]");
  root.querySelectorAll<HTMLElement>("[data-action='close-plan-share']").forEach((button) => button.addEventListener("click", () => { shareDialogMode = "closed"; dialog?.close(); }));
  dialog?.addEventListener("close", () => { shareDialogMode = "closed"; });
  dialog?.addEventListener("click", (event) => { if (event.target === dialog) { shareDialogMode = "closed"; dialog.close(); } });
  root.querySelector<HTMLFormElement>("[data-share-plan-choice]")?.addEventListener("submit", (event) => { event.preventDefault(); void choosePlanToShare(event.currentTarget as HTMLFormElement); });
  root.querySelector<HTMLButtonElement>("[data-action='start-plan-from-share']")?.addEventListener("click", () => { void startNewPlan(); });
  const shareForm = root.querySelector<HTMLFormElement>("[data-plan-share-form]");
  const refreshShareDraftState = (): void => {
    if (!shareForm) return;
    shareDraft = readShareDraft(shareForm);
    newPublicationUrl = "";
    const matchesPreview = Boolean(sharePreview) && sharePreviewKey === shareSelectionKey();
    const publishButton = shareForm.querySelector<HTMLButtonElement>("[data-share-intent='publish']");
    if (publishButton) publishButton.disabled = shareBusy || !matchesPreview;
    const previewState = shareForm.querySelector<HTMLElement>("[data-share-preview-state]");
    if (previewState) previewState.textContent = matchesPreview ? "Preview matches your choices." : "Choices changed — update the preview.";
  };
  shareForm?.addEventListener("input", refreshShareDraftState);
  shareForm?.addEventListener("change", refreshShareDraftState);
  shareForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const intent = ((event as SubmitEvent).submitter as HTMLButtonElement | null)?.dataset.shareIntent === "publish" ? "publish" : "preview";
    void submitPlanShare(event.currentTarget as HTMLFormElement, intent);
  });
  root.querySelectorAll<HTMLButtonElement>("[data-revoke-publication]").forEach((button) => button.addEventListener("click", () => { void revokePlanShare(button.dataset.revokePublication ?? ""); }));
  root.querySelector<HTMLButtonElement>("[data-action='copy-publication-url']")?.addEventListener("click", async (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    try {
      await navigator.clipboard.writeText(newPublicationUrl);
      button.textContent = "Copied";
      announce("Shared-page link copied.");
    } catch {
      const input = root.querySelector<HTMLInputElement>("[data-publication-url]");
      input?.focus(); input?.select();
      announce("The shared-page link is selected and ready to copy.");
    }
  });
  if (shareDialogMode !== "closed" && dialog && !dialog.open) dialog.showModal();
};

const originalRequestText = (value: unknown): string => {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
};

const renderOriginalRequest = (order: ArrivalOrder): string => {
  const fields = [
    { label: "What needs to happen", value: order.rawOutcome },
    { label: "When", value: order.structured.deadline },
    { label: "What is limited", value: order.structured.finiteLimit },
    { label: "Must not change", value: order.structured.hardConstraint },
  ].map((field) => ({ ...field, value: originalRequestText(field.value) })).filter((field) => field.value);
  const references = order.attachments.flatMap((attachment, index) => {
    const value = typeof attachment === "object" && attachment !== null
      ? originalRequestText((attachment as Record<string, unknown>).value)
      : originalRequestText(attachment);
    return value ? [{ label: `Useful reference${order.attachments.length > 1 ? ` ${index + 1}` : ""}`, value }] : [];
  });
  return `<div class="arrival-order-source__content">${[...fields, ...references].map((field) => `<div><span>${escapeHtml(field.label)}</span><p>${escapeHtml(field.value)}</p></div>`).join("")}</div>`;
};

const starterSourceLabels = { request: "Your request", known: "From your plan", working: "Codex rough choice", starter: "Rough assumption", human: "Changed by you", open: "Still open" } as const;

const renderStarterField = (field: import("./arrival-presentation.js").StarterPlanField, value: unknown = "", namePrefix = "field_"): string => {
  const safeValue = String(value ?? "");
  if (field.inputType === "select") return `<label><span>${escapeHtml(field.label)}</span><select name="${namePrefix}${escapeHtml(field.fieldId)}">${(field.options ?? []).map((option) => `<option value="${escapeHtml(option.value)}" ${safeValue === option.value ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}</select></label>`;
  if (field.inputType === "textarea") return `<label><span>${escapeHtml(field.label)}</span><textarea name="${namePrefix}${escapeHtml(field.fieldId)}" maxlength="2000" placeholder="${escapeHtml(field.placeholder ?? "")}">${escapeHtml(safeValue)}</textarea></label>`;
  const actualType = field.inputType === "date" && safeValue && !/^\d{4}-\d{2}-\d{2}$/.test(safeValue) ? "text" : field.inputType;
  return `<label><span>${escapeHtml(field.label)}</span><input name="${namePrefix}${escapeHtml(field.fieldId)}" type="${actualType}" ${field.fieldId === "title" ? "required" : ""} ${field.inputType === "number" ? "step=\"any\" inputmode=\"decimal\"" : ""} maxlength="${field.inputType === "number" ? "20" : "240"}" value="${escapeHtml(safeValue)}" placeholder="${escapeHtml(field.placeholder ?? "")}"></label>`;
};

const starterAmount = (value: unknown): number => {
  const number = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(number) ? number : 0;
};

const starterItemIsProvisional = (item: import("./arrival-presentation.js").StarterPlanItem): boolean => typeof item.fields.provisional === "boolean"
  ? item.fields.provisional
  : item.source === "working" || item.source === "starter" || item.source === "open";

const renderStarterCertaintyToggle = (provisional = false): string => `<label class="starter-certainty-toggle"><input name="field_provisional" type="checkbox" ${provisional ? "checked" : ""}><span><strong>Placeholder</strong><small>Italic until you mark it settled. This does not change calculations.</small></span></label>`;

const calendarDate = (value: unknown): Date | null => {
  const text = String(value ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const calendarDateKey = (date: Date): string => date.toISOString().slice(0, 10);

const calendarEntryNoun = (family: import("./arrival-presentation.js").StarterPlanPresentation["family"]): string => ({
  travel: "Locations & activities",
  renovation: "Phases & work",
  event: "Events & activities",
  general: "Scheduled items",
})[family];

const calendarFilterOptions = [{ value: "location", label: "Locations" }, { value: "activity", label: "Activities" }, { value: "event", label: "Events" }, { value: "travel", label: "Travel days" }, { value: "milestone", label: "Milestones" }];

const renderCalendarMonths = (
  section: import("./arrival-presentation.js").StarterPlanSection,
  overview: import("./arrival-presentation.js").StarterPlanOverview,
  selectedId: string,
): string => {
  const dated = section.items.map((item) => ({ item, start: calendarDate(item.fields.start), end: calendarDate(item.fields.end) })).filter((entry) => entry.start) as Array<{ item: import("./arrival-presentation.js").StarterPlanItem; start: Date; end: Date | null }>;
  const datedStarts = dated.map((entry) => entry.start.getTime());
  const datedEnds = dated.map((entry) => (entry.end && entry.end >= entry.start ? entry.end : entry.start).getTime());
  const today = new Date();
  const rangeStart = calendarDate(overview.start) ?? (datedStarts.length ? new Date(Math.min(...datedStarts)) : new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1, 12)));
  const rangeEndCandidate = calendarDate(overview.end) ?? (datedEnds.length ? new Date(Math.max(...datedEnds)) : rangeStart);
  const rangeEnd = rangeEndCandidate >= rangeStart ? rangeEndCandidate : rangeStart;
  const monthCursor = new Date(Date.UTC(rangeStart.getUTCFullYear(), rangeStart.getUTCMonth(), 1, 12));
  const finalMonth = new Date(Date.UTC(rangeEnd.getUTCFullYear(), rangeEnd.getUTCMonth(), 1, 12));
  const months: Date[] = [];
  while (monthCursor <= finalMonth && months.length < 12) {
    months.push(new Date(monthCursor));
    monthCursor.setUTCMonth(monthCursor.getUTCMonth() + 1);
  }
  const weekdays = [["Monday", "Mon"], ["Tuesday", "Tue"], ["Wednesday", "Wed"], ["Thursday", "Thu"], ["Friday", "Fri"], ["Saturday", "Sat"], ["Sunday", "Sun"]];
  const monthTables = months.map((month) => {
    const year = month.getUTCFullYear();
    const monthIndex = month.getUTCMonth();
    const monthName = new Intl.DateTimeFormat("en-AU", { month: "long", year: "numeric", timeZone: "UTC" }).format(month);
    const firstWeekday = (month.getUTCDay() + 6) % 7;
    const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0, 12)).getUTCDate();
    const cells = Array.from({ length: Math.ceil((firstWeekday + daysInMonth) / 7) * 7 }, (_, index) => {
      const dayNumber = index - firstWeekday + 1;
      if (dayNumber < 1 || dayNumber > daysInMonth) return `<td class="starter-calendar__empty" aria-hidden="true"></td>`;
      const date = new Date(Date.UTC(year, monthIndex, dayNumber, 12));
      const key = calendarDateKey(date);
      const active = dated.filter((entry) => {
        const end = entry.end && entry.end >= entry.start ? entry.end : entry.start;
        return date >= entry.start && date <= end;
      });
      const entries = active.map(({ item, start }) => {
        const title = String(item.fields.title || item.label);
        const provisional = starterItemIsProvisional(item);
        const kind = String(item.fields.kind || "location");
        const continuation = key !== calendarDateKey(start);
        return `<button class="starter-calendar__event starter-calendar__event--${escapeHtml(kind)}${continuation ? " is-continuation" : ""}${provisional ? " is-provisional" : ""}" type="button" data-action="select-calendar-item" data-calendar-kind="${escapeHtml(kind)}" data-record-id="${escapeHtml(item.itemId)}" aria-label="${escapeHtml(continuation ? `${title}, continues` : title)}" aria-pressed="${item.itemId === selectedId}" title="${escapeHtml(title)}"><span>${continuation ? "↳" : escapeHtml(title)}</span></button>`;
      }).join("");
      return `<td data-calendar-date="${key}"><time datetime="${key}">${dayNumber}</time>${entries}</td>`;
    });
    const rows = Array.from({ length: cells.length / 7 }, (_, index) => `<tr>${cells.slice(index * 7, index * 7 + 7).join("")}</tr>`).join("");
    return `<div class="starter-calendar__month"><table><caption>${escapeHtml(monthName)}</caption><thead><tr>${weekdays.map(([full, short]) => `<th scope="col"><abbr title="${full}">${short}</abbr></th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>`;
  }).join("");
  const unscheduled = section.items.length - dated.length;
  const truncated = monthCursor <= finalMonth;
  return `<div class="starter-calendar__months">${monthTables}</div>${unscheduled ? `<p class="starter-calendar__note">${unscheduled} ${unscheduled === 1 ? "item has" : "items have"} no start date yet. Select it from List to schedule it.</p>` : ""}${truncated ? `<p class="starter-calendar__note">The calendar shows the first 12 months. Use List for later items.</p>` : ""}`;
};

const renderStarterPlan = (order: ArrivalOrder): string => {
  const starter = starterPlanForArrival(order);
  if (!starter) return "";
  const manual = arrivalUsesManualWorkspace(order) && !order.interpretation?.complete;
  const { overview } = starter;
  const limit = starterAmount(overview.totalBudget);
  const currency = overview.currency;
  const money = (value: number): string => {
    try { return new Intl.NumberFormat("en-AU", { style: "currency", currency, maximumFractionDigits: 0 }).format(value); }
    catch { return `${currency} ${new Intl.NumberFormat("en-AU", { maximumFractionDigits: 0 }).format(value)}`; }
  };
  const dateLabel = (value: string): string => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Add date";
    return new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
  };
  const startMs = /^\d{4}-\d{2}-\d{2}$/.test(overview.start) ? Date.parse(`${overview.start}T12:00:00Z`) : Number.NaN;
  const endMs = /^\d{4}-\d{2}-\d{2}$/.test(overview.end) ? Date.parse(`${overview.end}T12:00:00Z`) : Number.NaN;
  const nights = Number.isFinite(startMs) && Number.isFinite(endMs) ? Math.max(0, Math.round((endMs - startMs) / 86_400_000)) : 0;
  const duration = Number.isFinite(startMs) ? overview.singleDay || !Number.isFinite(endMs) ? "1 day" : `${nights + 1} ${nights === 0 ? "day" : "days"}${starter.family === "travel" && nights ? ` · ${nights} ${nights === 1 ? "night" : "nights"}` : ""}` : "Dates open";
  const scheduleSection = starter.sections.find((section) => section.sectionId === "itinerary" || section.sectionId === "schedule");
  const staysSection = starter.sections.find((section) => section.sectionId === "stays");
  const transportSection = starter.sections.find((section) => section.sectionId === "transport");
  const peopleSection = starter.sections.find((section) => section.sectionId === "people");
  const openQuestionCount = starter.sections.reduce((sum, section) => sum + section.openQuestions.length, 0);
  const latestCodexWorkspaceSectionId = [...order.inputs].reverse().find((input) => input.sourceSurface === "codex" && /^(?:record|option|module)_/.test(String(input.payload.workspaceOperation ?? "")) && starter.sections.some((section) => section.sectionId === input.payload.moduleId))?.payload.moduleId;
  const developmentSectionId = String(latestCodexWorkspaceSectionId ?? starter.sections.find((section) => section.items.length)?.sectionId ?? starter.sections[0]?.sectionId ?? "");
  const defaultPrioritySectionId = (/allerg/i.test(order.rawOutcome) && starter.sections.find((section) => section.sectionId === "requirements" && section.openQuestions.length)?.sectionId)
    || starter.sections.find((section) => section.openQuestions.length)?.sectionId
    || "";
  const unresolvedSafetySectionId = /allerg/i.test(order.rawOutcome) && starter.sections.find((section) => section.sectionId === "requirements" && section.openQuestions.length)?.sectionId;
  const prioritySectionId = unresolvedSafetySectionId
    || (starter.sections.some((section) => section.sectionId === activeCodexPrioritySectionId && section.openQuestions.length) ? activeCodexPrioritySectionId : defaultPrioritySectionId || developmentSectionId);
  const prioritySectionLabel = starter.sections.find((section) => section.sectionId === prioritySectionId)?.label ?? "rough plan";
  const operatorPhaseMarkup = followCodexEnabled ? `<aside class="starter-operator-phase" data-codex-phase-section="${escapeHtml(prioritySectionId)}"><span>${openQuestionCount ? `${escapeHtml(agenticName())} questions` : `${escapeHtml(agenticName())} development`}</span><strong>${openQuestionCount ? `${openQuestionCount} open · ${escapeHtml(prioritySectionLabel)}` : `Current section · ${escapeHtml(prioritySectionLabel)}`}</strong><small>${openQuestionCount ? "Answer on the page or in Codex." : "Finite marks the handoff point; work continues when Codex is connected."}</small></aside>` : "";
  const normalizePlace = (value: unknown): string[] => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().match(/[a-z]{3,}/g)?.filter((token) => !["city", "area", "station", "airport", "hostel", "hotel"].includes(token)) ?? [];
  const samePlace = (left: unknown, right: unknown): boolean => {
    const leftTokens = normalizePlace(left);
    const rightTokens = normalizePlace(right);
    return leftTokens.some((token) => rightTokens.includes(token));
  };
  const rangeOverlaps = (leftStart: unknown, leftEnd: unknown, rightStart: unknown, rightEnd: unknown): boolean => {
    const aStart = calendarDate(leftStart)?.getTime();
    const bStart = calendarDate(rightStart)?.getTime();
    if (!aStart || !bStart) return true;
    const aEnd = calendarDate(leftEnd)?.getTime() ?? aStart;
    const bEnd = calendarDate(rightEnd)?.getTime() ?? bStart;
    return aStart <= bEnd && bStart <= aEnd;
  };
  const calendarLocations = scheduleSection?.items.filter((item) => String(item.fields.kind || "location") === "location") ?? [];
  const calendarMatches = (location: unknown, start?: unknown, end?: unknown) => calendarLocations.filter((candidate) => samePlace(location, candidate.fields.location || candidate.fields.title) && rangeOverlaps(start, end, candidate.fields.start, candidate.fields.end));
  const stayTotal = (item: import("./arrival-presentation.js").StarterPlanItem): number => {
    const explicit = starterAmount(item.fields.totalBudget);
    if (explicit) return explicit;
    const checkIn = calendarDate(item.fields.start)?.getTime();
    const checkOut = calendarDate(item.fields.end)?.getTime();
    const stayNights = checkIn && checkOut ? Math.max(0, Math.round((checkOut - checkIn) / 86_400_000)) : 0;
    return starterAmount(item.fields.nightlyBudget) * stayNights;
  };
  const staysRecorded = staysSection?.items.reduce((sum, item) => sum + stayTotal(item), 0) ?? 0;
  const transportRecorded = transportSection?.items.reduce((sum, item) => sum + starterAmount(item.fields.cost), 0) ?? 0;
  const recordedCosts = staysRecorded + transportRecorded;
  const taskItems = starter.sections.find((section) => section.sectionId === "tasks")?.items ?? [];
  const openTasks = taskItems.filter((item) => item.fields.done !== true).length;
  const openRequirements = starter.sections.find((section) => section.sectionId === "requirements")?.items.filter((item) => item.fields.status !== "ready").length ?? 0;
  const openPeople = peopleSection?.items.filter((item) => String(item.fields.status || "tentative") !== "confirmed").length ?? 0;
  const openItems = openTasks + openRequirements + openPeople;
  const allocationDelta = limit - overview.categoryAllocated;
  const allocationLabel = !limit ? "Add total budget" : allocationDelta >= 0 ? `${money(allocationDelta)} unallocated` : `${money(Math.abs(allocationDelta))} over budget`;
  const allocationClass = limit && overview.categoryPercent > 100 ? " is-over" : "";
  const dateRange = overview.start
    ? `${dateLabel(overview.start)}${overview.end && !overview.singleDay ? ` – ${dateLabel(overview.end)}` : ""}`
    : "Dates open";
  const scheduleCount = starter.family === "travel" ? scheduleSection?.items.filter((item) => String(item.fields.kind || "location") === "location").length ?? 0 : scheduleSection?.items.length ?? 0;
  const timingDetail = overview.includeTime
    ? `${overview.startTime || "Start open"}${overview.endTime ? ` – ${overview.endTime}` : ""}${overview.timeZone ? ` · ${overview.timeZone}` : ""}`
    : overview.singleDay ? "Single-day plan" : `${scheduleCount} ${starter.family === "travel" ? "stops" : starter.family === "general" ? "scheduled items" : "stages"}`;
  const splitDetail = overview.categories.slice(0, 2).map((item) => {
    const amount = starterAmount(item.fields.amount);
    const percentage = limit > 0 ? (amount / limit) * 100 : 0;
    return `${item.fields.title || item.label} ${percentage.toFixed(0)}%`;
  }).join(" · ");
  const availablePercent = limit > 0 ? (Math.abs(allocationDelta) / limit) * 100 : 0;
  const splitProvisional = overview.categories.some(starterItemIsProvisional);
  const availableProvisional = overview.budgetProvisional || splitProvisional;
  const categoryRows = overview.categories.map((item) => {
    const amount = starterAmount(item.fields.amount);
    const percentage = limit > 0 ? (amount / limit) * 100 : 0;
    const provisional = starterItemIsProvisional(item);
    return `<article class="starter-overview__category${percentage > 100 ? " is-over" : ""}${provisional ? " is-provisional" : ""}" data-category-record data-module-id="money" data-record-id="${escapeHtml(item.itemId)}">
      <form data-arrival-form="workspace-category-update" data-module-id="money" data-record-id="${escapeHtml(item.itemId)}">
        <label><span>Category</span><input name="field_title" required maxlength="120" value="${escapeHtml(item.fields.title || item.label)}"></label>
        <label><span>Set budget</span><span class="starter-overview__money-input"><b>${escapeHtml(currency)}</b><input name="field_amount" type="number" step="1" min="0" value="${escapeHtml(item.fields.amount)}"></span></label>
        <input name="field_currency" type="hidden" value="${escapeHtml(currency)}"><input name="field_moneyRole" type="hidden" value="cost"><input name="field_notes" type="hidden" value="${escapeHtml(item.fields.notes)}">
        <output><strong>${escapeHtml(money(amount))}</strong><span>${limit ? `${percentage.toFixed(1)}% of total` : "Set a total to see %"}</span></output>
        <div><button class="text-button" type="submit" ${busy ? "disabled" : ""}>Save</button><button class="text-button" type="button" data-action="workspace-category-delete" ${busy ? "disabled" : ""}>Delete</button></div>
        ${renderStarterCertaintyToggle(provisional)}
      </form>
    </article>`;
  }).join("");
  const planItemCount = starter.sections
    .filter((section) => !["money", "requirements", "tasks"].includes(section.sectionId))
    .reduce((sum, section) => sum + section.items.length, 0);
  const requirementsLabel = openRequirements === 1 ? "requirement" : "requirements";
  const adaptiveMetricCards = overview.moneyState === "zero" ? `
      <article class="starter-report-card">
        <header><span>Paid budget</span><button type="button" data-action="open-overview-editor" data-overview-editor="budget" data-overview-focus="totalBudget" aria-label="Edit budget state"><span aria-hidden="true">✎</span></button></header>
        <strong class="starter-report-card__value">${escapeHtml(money(0))}</strong>
        <small>No paid spend planned · change this any time</small>
      </article>` : `
      <article class="starter-report-card">
        <header><span>Plan items</span><button type="button" data-action="open-workspace-module" data-module-id="${escapeHtml(scheduleSection?.sectionId ?? starter.sections[0]?.sectionId ?? "scope")}" aria-label="Open plan items"><span aria-hidden="true">✎</span></button></header>
        <strong class="starter-report-card__value">${planItemCount}</strong>
        <small>Across ${starter.sections.filter((section) => !["money", "requirements", "tasks"].includes(section.sectionId)).length} editable sections</small>
      </article>`;
  const nonFinancialCards = overview.moneyState === "positive" ? `
      <article class="starter-report-card${overview.budgetProvisional ? " is-provisional" : ""}">
        <header><span>Total budget</span><button type="button" data-action="open-overview-editor" data-overview-editor="budget" data-overview-focus="totalBudget" aria-label="Edit total budget"><span aria-hidden="true">✎</span></button></header>
        <strong class="starter-report-card__value">${escapeHtml(money(limit))}</strong>
        <small>${escapeHtml(currency)} base · ${escapeHtml(money(overview.categoryAllocated))} allocated${recordedCosts ? ` · ${escapeHtml(money(recordedCosts))} in linked records` : ""}</small>
      </article>
      <article class="starter-report-card${allocationClass}${splitProvisional ? " is-provisional" : ""}">
        <header><span>Budget split</span><button type="button" data-action="open-overview-editor" data-overview-editor="split" aria-label="Edit budget split"><span aria-hidden="true">✎</span></button></header>
        <strong class="starter-report-card__value">${overview.categoryPercent.toFixed(0)}%</strong>
        <small>${overview.categories.length} ${overview.categories.length === 1 ? "category" : "categories"}${splitDetail ? ` · ${escapeHtml(splitDetail)}` : ""}</small>
      </article>
      <article class="starter-report-card${allocationClass}${availableProvisional ? " is-provisional" : ""}">
        <header><span>${allocationDelta < 0 ? "Over" : "Available"}</span><button type="button" data-action="open-overview-editor" data-overview-editor="split" aria-label="Edit available budget"><span aria-hidden="true">✎</span></button></header>
        <strong class="starter-report-card__value">${escapeHtml(money(Math.abs(allocationDelta)))}</strong>
        <small>${availablePercent.toFixed(0)}% ${allocationDelta < 0 ? "over" : "remaining"} · ${openItems} open ${openItems === 1 ? "item" : "items"}</small>
      </article>` : `${adaptiveMetricCards}
      <article class="starter-report-card">
        <header><span>Open questions</span><button type="button" data-action="open-workspace-module" data-module-id="${escapeHtml(prioritySectionId || starter.sections[0]?.sectionId || "scope")}" aria-label="Open questions"><span aria-hidden="true">✎</span></button></header>
        <strong class="starter-report-card__value">${openQuestionCount}</strong>
        <small>${openQuestionCount === 1 ? "question" : "questions"} remaining</small>
      </article>
      <article class="starter-report-card">
        <header><span>Requirements</span><button type="button" data-action="open-workspace-module" data-module-id="requirements" aria-label="Open requirements"><span aria-hidden="true">✎</span></button></header>
        <strong class="starter-report-card__value">${openRequirements}</strong>
        <small>open ${requirementsLabel}</small>
      </article>`;
  const overviewMarkup = `<details class="starter-plan__overview" open>
    <summary><span>Plan at a glance</span></summary>
    <div class="starter-report-strip" aria-label="Plan at a glance">
      <article class="starter-report-card${overview.datesProvisional ? " is-provisional" : ""}">
        <header><span>Dates</span><button type="button" data-action="open-overview-editor" data-overview-editor="dates" data-overview-focus="start" aria-label="Edit plan dates"><span aria-hidden="true">✎</span></button></header>
        <strong class="starter-report-card__value">${escapeHtml(dateRange)}</strong>
        <small>${escapeHtml(duration)} · ${escapeHtml(timingDetail)}</small>
      </article>
      ${nonFinancialCards}
      <article class="starter-report-card">
        <header><span>To-do</span><button type="button" data-action="open-workspace-module" data-module-id="tasks" aria-label="Open to-do list"><span aria-hidden="true">✎</span></button></header>
        <strong class="starter-report-card__value">${openTasks}</strong>
        <small>${openTasks === 1 ? "item" : "items"} remaining · ${taskItems.length} total</small>
      </article>
    </div>
  </details>
  <dialog class="starter-overview-dialog starter-overview-dialog--compact" data-overview-dialog="dates" aria-labelledby="overview_dates_title">
    <button class="starter-overview-dialog__close" type="button" data-action="close-overview-editor" aria-label="Close date editor">×</button>
    <header><p class="eyebrow">Edit plan overview</p><h3 id="overview_dates_title">Dates</h3></header>
    <form class="starter-overview-dialog__form starter-overview-dialog__form--single" data-arrival-form="workspace-overview">
      <section><div class="starter-overview__field-grid"><label><span>From</span><input name="start" type="date" value="${escapeHtml(overview.start)}"></label><label data-overview-end-date ${overview.singleDay ? "hidden" : ""}><span>To</span><input name="end" type="date" value="${escapeHtml(overview.end)}"></label></div>
        <div class="starter-overview__toggles"><label><input name="singleDay" type="checkbox" ${overview.singleDay ? "checked" : ""}> Single day</label><label><input name="includeTime" type="checkbox" ${overview.includeTime ? "checked" : ""}> Add times</label></div>
        <div class="starter-overview__field-grid" data-overview-times ${overview.includeTime ? "" : "hidden"}><label><span>Start time</span><input name="startTime" type="time" value="${escapeHtml(overview.startTime)}"></label><label><span>End time</span><input name="endTime" type="time" value="${escapeHtml(overview.endTime)}"></label><label class="is-wide"><span>Time zone</span><input name="timeZone" maxlength="80" value="${escapeHtml(overview.timeZone)}" placeholder="e.g. Europe/Berlin"></label></div>
        <label class="starter-certainty-toggle"><input name="datesProvisional" type="checkbox" ${overview.datesProvisional ? "checked" : ""}><span><strong>Placeholder dates</strong><small>Keep the date values italic until you decide they are settled. Calculations stay the same.</small></span></label>
      </section>
      <div class="starter-overview-dialog__actions"><button class="text-button" type="button" data-action="close-overview-editor">Cancel</button><button class="button" type="submit" ${busy ? "disabled" : ""}>Save dates</button></div>
    </form>
  </dialog>
  <dialog class="starter-overview-dialog starter-overview-dialog--compact" data-overview-dialog="budget" aria-labelledby="overview_budget_title">
    <button class="starter-overview-dialog__close" type="button" data-action="close-overview-editor" aria-label="Close total budget editor">×</button>
    <header><p class="eyebrow">Edit plan overview</p><h3 id="overview_budget_title">Total budget</h3></header>
    <form class="starter-overview-dialog__form starter-overview-dialog__form--single" data-arrival-form="workspace-overview">
      <section><label><span>How money fits this plan</span><select name="moneyState"><option value="positive" ${overview.moneyState === "positive" ? "selected" : ""}>A positive budget applies</option><option value="zero" ${overview.moneyState === "zero" ? "selected" : ""}>The paid budget is zero</option><option value="unknown" ${overview.moneyState === "unknown" ? "selected" : ""}>Not decided yet</option><option value="not_applicable" ${overview.moneyState === "not_applicable" ? "selected" : ""}>Money is not part of this plan</option></select></label><div class="starter-overview__field-grid"><label><span>Amount</span><input name="totalBudget" type="number" min="0" step="1" value="${escapeHtml(overview.totalBudget)}" placeholder="0"></label><label><span>Base currency</span><input name="currency" required maxlength="3" pattern="[A-Za-z]{3}" value="${escapeHtml(currency)}" aria-describedby="currency_hint"><small id="currency_hint">Three-letter code, such as AUD or EUR</small></label></div>
        <p class="starter-overview__allocation${allocationClass}"><span>${escapeHtml(money(overview.categoryAllocated))} allocated</span><strong>${escapeHtml(allocationLabel)}</strong></p>
        <label class="starter-certainty-toggle"><input name="budgetProvisional" type="checkbox" ${overview.budgetProvisional ? "checked" : ""}><span><strong>Placeholder budget</strong><small>Italic until settled. Calculations stay the same.</small></span></label>
      </section>
      <div class="starter-overview-dialog__actions"><button class="text-button" type="button" data-action="close-overview-editor">Cancel</button><button class="button" type="submit" ${busy ? "disabled" : ""}>Save budget</button></div>
    </form>
  </dialog>
  <dialog class="starter-overview-dialog starter-overview-dialog--split" data-overview-dialog="split" aria-labelledby="overview_split_title">
    <button class="starter-overview-dialog__close" type="button" data-action="close-overview-editor" aria-label="Close budget split editor">×</button>
    <header><p class="eyebrow">Edit plan overview</p><h3 id="overview_split_title">Budget split</h3><p>Category budgets can intentionally add up to more than 100%.</p></header>
    <div class="starter-overview__categories">${categoryRows || `<p class="starter-plan__empty">No budget categories yet.</p>`}</div>
    <details class="starter-overview__add"><summary>＋ Add budget category</summary><form data-arrival-form="workspace-category-add" data-module-id="money"><label><span>Category</span><input name="field_title" required maxlength="120" placeholder="e.g. Accommodation"></label><label><span>Budget (${escapeHtml(currency)})</span><input name="field_amount" type="number" min="0" step="1" value="0"></label><input name="field_currency" type="hidden" value="${escapeHtml(currency)}"><input name="field_moneyRole" type="hidden" value="cost">${renderStarterCertaintyToggle(false)}<button class="button" type="submit" ${busy ? "disabled" : ""}>Add category</button></form></details>
  </dialog>`;
  const modules = starter.sections.map((section) => {
    const isCodexPriority = followCodexEnabled && section.sectionId === prioritySectionId;
    const workspaceLabel = section.custom
      ? `Custom section · ${section.customSource === "working" ? `${agenticName()} built` : "Added by you"}`
      : `${starter.familyLabel} workspace`;
    const optionParentId = (option: import("./arrival-presentation.js").StarterPlanItem): string => option.parentRecordId || section.items[0]?.itemId || "";
    const optionsForRecord = (item: import("./arrival-presentation.js").StarterPlanItem): import("./arrival-presentation.js").StarterPlanItem[] => section.options.filter((option) => optionParentId(option) === item.itemId);
    const researchLinks = (item: import("./arrival-presentation.js").StarterPlanItem): Array<{ label: string; url: string }> => String(item.fields.researchSources ?? "").split("\n").map((line) => line.trim()).filter(Boolean).map((line, index) => {
      const separator = line.indexOf("|");
      const label = separator >= 0 ? line.slice(0, separator).trim() : `Source ${index + 1}`;
      const url = (separator >= 0 ? line.slice(separator + 1) : line).trim();
      return { label: label || `Source ${index + 1}`, url };
    }).filter((source) => /^https:\/\//i.test(source.url));
    const optionResearchFields = (item?: import("./arrival-presentation.js").StarterPlanItem): string => `<div class="starter-option__research-fields"><label><span>Research checked</span><input name="field_researchChecked" type="date" value="${escapeHtml(String(item?.fields.researchChecked ?? ""))}"></label><label><span>Research sources</span><textarea name="field_researchSources" placeholder="One per line: Source name | https://…">${escapeHtml(String(item?.fields.researchSources ?? ""))}</textarea><small>Use direct, dated sources where possible. These links stay with the option.</small></label></div>`;
    const renderOptionCard = (item: import("./arrival-presentation.js").StarterPlanItem, index: number): string => {
      const title = String(item.fields.title || item.label);
      const visibleFields = section.fields.filter((field) => field.fieldId !== "title" && item.fields[field.fieldId] !== undefined && item.fields[field.fieldId] !== "" && field.fieldId !== "moneyRole");
      const provisional = starterItemIsProvisional(item);
      const sourceLabel = item.source === "working" ? `${agenticName()} research` : "Added by you";
      const sources = researchLinks(item);
      const researchChecked = String(item.fields.researchChecked ?? "");
      return `<article class="starter-option${provisional ? " is-provisional" : ""}" data-workspace-option data-module-id="${escapeHtml(section.sectionId)}" data-record-id="${escapeHtml(item.itemId)}" data-parent-record-id="${escapeHtml(optionParentId(item))}">
        <header><div><span>Option ${String(index + 1).padStart(2, "0")}</span><h4>${escapeHtml(title)}</h4><small>${escapeHtml(sourceLabel)} · not in plan</small></div><button class="button button--secondary" type="button" data-action="workspace-option-promote" ${busy ? "disabled" : ""}>Add to plan</button></header>
        ${visibleFields.length ? `<dl>${visibleFields.map((field) => {
          const value = String(item.fields[field.fieldId] ?? "");
          const renderedValue = field.inputType === "url" && /^https:\/\//i.test(value) ? `<a href="${escapeHtml(value)}" target="_blank" rel="noreferrer">Open source <span aria-hidden="true">↗</span></a>` : escapeHtml(value);
          const layoutClass = field.inputType === "textarea" ? "is-full" : field.inputType === "url" || ["provider", "address", "location", "from", "to", "timeZone", "departureTimeZone", "arrivalTimeZone"].includes(field.fieldId) ? "is-span" : "";
          return `<div${layoutClass ? ` class="${layoutClass}"` : ""}><dt>${escapeHtml(field.label)}</dt><dd>${renderedValue}</dd></div>`;
        }).join("")}</dl>` : ""}
        ${researchChecked || sources.length ? `<section class="starter-option__research"><span>${researchChecked ? `Checked ${escapeHtml(dateLabel(researchChecked))}` : "Research sources"}</span><div>${sources.map((source) => `<a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.label)} <span aria-hidden="true">↗</span></a>`).join("")}</div></section>` : ""}
        <details class="starter-record__edit"><summary>Edit option</summary><form data-arrival-form="workspace-option-update" data-module-id="${escapeHtml(section.sectionId)}" data-record-id="${escapeHtml(item.itemId)}" data-parent-record-id="${escapeHtml(optionParentId(item))}"><div class="starter-record__fields">${section.fields.map((field) => renderStarterField(field, item.fields[field.fieldId])).join("")}</div>${optionResearchFields(item)}${renderStarterCertaintyToggle(provisional)}<div class="starter-record__buttons"><button class="button" type="submit" ${busy ? "disabled" : ""}>Save option</button><button class="text-button" type="button" data-action="workspace-option-delete" ${busy ? "disabled" : ""}>Delete</button></div></form></details>
      </article>`;
    };
    const recordOptionsButton = (item: import("./arrival-presentation.js").StarterPlanItem): string => {
      const count = optionsForRecord(item).length;
      return `<button class="starter-record__options-trigger" type="button" data-action="open-record-options" data-record-options-target="record_options_${escapeHtml(section.sectionId)}_${escapeHtml(item.itemId)}" aria-haspopup="dialog">Options <b>${count}</b></button>`;
    };
    const recordOptionsDialog = (item: import("./arrival-presentation.js").StarterPlanItem): string => {
      const title = String(item.fields.title || item.label);
      const attached = optionsForRecord(item);
      const dialogId = `record_options_${section.sectionId}_${item.itemId}`;
      return `<dialog class="starter-record-options-dialog" id="${escapeHtml(dialogId)}" data-record-options-dialog data-record-options-key="${escapeHtml(`${section.sectionId}:${item.itemId}`)}" aria-labelledby="${escapeHtml(dialogId)}_title">
        <button class="starter-overview-dialog__close" type="button" data-action="close-record-options" aria-label="Close options for ${escapeHtml(title)}">×</button>
        <header><p class="eyebrow">Options for this item</p><h3 id="${escapeHtml(dialogId)}_title">${escapeHtml(title)}</h3><p>Compare researched or manually added alternatives here. Nothing changes in the working plan until you choose Add to plan.</p></header>
        <div class="starter-option-grid">${attached.length ? attached.map(renderOptionCard).join("") : `<p class="starter-plan__empty">No options saved for this item yet.</p>`}</div>
        <details class="starter-module__option-add"><summary>＋ Add an option for this item</summary><form data-arrival-form="workspace-option-add" data-module-id="${escapeHtml(section.sectionId)}" data-parent-record-id="${escapeHtml(item.itemId)}"><div class="starter-record__fields">${section.fields.map((field) => renderStarterField(field)).join("")}</div>${optionResearchFields()}${renderStarterCertaintyToggle(true)}<button class="button" type="submit" ${busy ? "disabled" : ""}>Save as option</button></form></details>
      </dialog>`;
    };
    const renderRecord = (item: import("./arrival-presentation.js").StarterPlanItem, index: number): string => {
      const title = String(item.fields.title || item.label);
      const visibleFields = section.fields.filter((field) => field.fieldId !== "title" && item.fields[field.fieldId] !== undefined && item.fields[field.fieldId] !== "" && field.fieldId !== "moneyRole");
      const provisional = starterItemIsProvisional(item);
      const recordClass = `starter-record starter-record--${section.variant}${item.fields.done === true ? " is-done" : ""}${provisional ? " is-provisional" : ""}`;
      let relationshipMarkup = "";
      if (scheduleSection && section.sectionId === "stays") {
        const related = calendarMatches(item.fields.location, item.fields.start, item.fields.end);
        relationshipMarkup = related.length
          ? `<div class="starter-record__relationships"><span>Calendar link</span>${related.slice(0, 2).map((record) => `<button type="button" data-action="open-related-record" data-module-id="${escapeHtml(scheduleSection.sectionId)}" data-record-id="${escapeHtml(record.itemId)}">${escapeHtml(String(record.fields.title || record.label))}</button>`).join("")}</div>`
          : `<p class="starter-record__warning">No matching calendar stop for this location and date window.</p>`;
      }
      if (scheduleSection && section.sectionId === "transport") {
        const from = calendarMatches(item.fields.from)[0];
        const to = calendarMatches(item.fields.to)[0];
        const links = [from, to].filter(Boolean) as import("./arrival-presentation.js").StarterPlanItem[];
        relationshipMarkup = `<div class="starter-record__relationships"><span>Route link</span>${links.map((record) => `<button type="button" data-action="open-related-record" data-module-id="${escapeHtml(scheduleSection.sectionId)}" data-record-id="${escapeHtml(record.itemId)}">${escapeHtml(String(record.fields.title || record.label))}</button>`).join("")}${links.length < 2 ? `<small>Check ${from ? "destination" : to ? "origin" : "origin and destination"} against Calendar.</small>` : ""}</div>`;
      }
      if (scheduleSection && section.sectionId === "people") {
        const related = calendarMatches(item.fields.location, item.fields.start, item.fields.end);
        relationshipMarkup = `<div class="starter-record__relationships"><span>Plan dependency</span>${related.slice(0, 2).map((record) => `<button type="button" data-action="open-related-record" data-module-id="${escapeHtml(scheduleSection.sectionId)}" data-record-id="${escapeHtml(record.itemId)}">${escapeHtml(String(record.fields.title || record.label))}</button>`).join("")}${String(item.fields.status || "tentative") !== "confirmed" ? `<small>Dates are not confirmed yet.</small>` : ""}</div>`;
      }
      return `<article class="${recordClass}" draggable="true" data-workspace-record data-module-id="${escapeHtml(section.sectionId)}" data-record-id="${escapeHtml(item.itemId)}">
        <header><span class="starter-record__drag" aria-hidden="true">⋮⋮</span>${section.variant === "checklist" ? `<button class="starter-record__check" type="button" data-action="workspace-toggle" aria-label="${item.fields.done === true ? "Reopen" : "Complete"} ${escapeHtml(title)}">${item.fields.done === true ? "✓" : ""}</button>` : `<b>${String(index + 1).padStart(2, "0")}</b>`}<div><h4>${escapeHtml(title)}</h4><small>${escapeHtml(starterSourceLabels[item.source])}</small></div><span class="starter-record__move"><button type="button" data-action="workspace-move" data-direction="up" aria-label="Move ${escapeHtml(title)} earlier" ${index === 0 || busy ? "disabled" : ""}>↑</button><button type="button" data-action="workspace-move" data-direction="down" aria-label="Move ${escapeHtml(title)} later" ${index === section.items.length - 1 || busy ? "disabled" : ""}>↓</button></span>${recordOptionsButton(item)}</header>
        ${visibleFields.length ? `<dl>${visibleFields.map((field) => {
          const value = String(item.fields[field.fieldId] ?? "");
          const renderedValue = field.inputType === "url" && /^https:\/\//i.test(value) ? `<a href="${escapeHtml(value)}" target="_blank" rel="noreferrer">Open website <span aria-hidden="true">↗</span></a>` : escapeHtml(value);
          const layoutClass = field.inputType === "textarea" ? "is-full" : field.inputType === "url" || ["provider", "address", "location", "from", "to", "timeZone", "departureTimeZone", "arrivalTimeZone"].includes(field.fieldId) ? "is-span" : "";
          return `<div${layoutClass ? ` class="${layoutClass}"` : ""}><dt>${escapeHtml(field.label)}</dt><dd>${renderedValue}</dd></div>`;
        }).join("")}</dl>` : ""}
        ${relationshipMarkup}
        <details class="starter-record__edit"><summary>Edit</summary><form data-arrival-form="workspace-update" data-module-id="${escapeHtml(section.sectionId)}" data-record-id="${escapeHtml(item.itemId)}"><div class="starter-record__fields">${section.fields.map((field) => renderStarterField(field, item.fields[field.fieldId])).join("")}</div>${renderStarterCertaintyToggle(provisional)}<div class="starter-record__buttons"><button class="button" type="submit" ${busy ? "disabled" : ""}>Save changes</button><button class="text-button" type="button" data-action="workspace-delete" ${busy ? "disabled" : ""}>Delete</button></div></form></details>
        ${recordOptionsDialog(item)}
      </article>`;
    };
    const items = section.items.map(renderRecord).join("");
    const unresolvedPeople = peopleSection?.items.filter((item) => String(item.fields.status || "tentative") !== "confirmed").length ?? 0;
    const unlinkedStays = staysSection?.items.filter((item) => !calendarMatches(item.fields.location, item.fields.start, item.fields.end).length).length ?? 0;
    const unlinkedTransportEnds = transportSection?.items.reduce((count, item) => count + (calendarMatches(item.fields.from).length ? 0 : 1) + (calendarMatches(item.fields.to).length ? 0 : 1), 0) ?? 0;
    const moduleWarningCount = section.sectionId === "people" ? unresolvedPeople : section.sectionId === "stays" ? unlinkedStays : section.sectionId === "transport" ? unlinkedTransportEnds : 0;
    const moduleCountMarkup = `<b><span>${section.items.length} ${section.items.length === 1 ? "item" : "items"}${section.options.length ? ` · ${section.options.length} ${section.options.length === 1 ? "option" : "options"}` : ""}${moduleWarningCount ? ` · ${moduleWarningCount} to check` : ""}</span>${section.openQuestions.length ? `<span class="starter-module__question-count">${section.openQuestions.length} open ${section.openQuestions.length === 1 ? "question" : "questions"}</span>` : ""}${isCodexPriority ? `<span class="starter-module__codex-location">${openQuestionCount ? `${escapeHtml(agenticName())} is here` : `${escapeHtml(agenticName())} working section`}</span>` : ""}</b>`;
    const categoryAmount = (pattern: RegExp): number => starter.sections.find((candidate) => candidate.sectionId === "money")?.items.filter((item) => item.fields.moneyRole === "cost").filter((item) => pattern.test(String(item.fields.title || item.label))).reduce((sum, item) => sum + starterAmount(item.fields.amount), 0) ?? 0;
    const accommodationEnvelope = categoryAmount(/accommodation|stay|lodg/i);
    const transportEnvelope = categoryAmount(/flight|transport|rail|coach|ferry/i);
    const pricedRecords = [...(staysSection?.items ?? []), ...(transportSection?.items ?? [])];
    const pricedStates = ["quote", "booked", "paid"].map((state) => ({ state, count: pricedRecords.filter((item) => item.fields.priceState === state).length })).filter((entry) => entry.count);
    const allocationRemaining = limit - overview.categoryAllocated;
    const allocationState = !limit ? "Add a total budget" : overview.categoryPercent > 100 ? `${Math.round(overview.categoryPercent - 100)}% over-allocated` : `${Math.round(overview.categoryPercent)}% allocated`;
    const travelBudgetInsight = `<section class="starter-cost-rollup" aria-label="Costs from plan records">
      <header><div><span>Live plan roll-up</span><strong>${escapeHtml(money(recordedCosts))}</strong></div><p>Automatically summed from ${staysSection?.items.length ?? 0} stays and ${transportSection?.items.length ?? 0} transport records. Budget categories remain editable envelopes.</p></header>
      <div><article><span>Stays</span><strong>${escapeHtml(money(staysRecorded))}</strong><small>${accommodationEnvelope ? `${escapeHtml(money(accommodationEnvelope))} envelope · ${escapeHtml(money(Math.abs(accommodationEnvelope - staysRecorded)))} ${accommodationEnvelope >= staysRecorded ? "headroom" : "over"}` : "No accommodation envelope"}</small></article><article><span>Transport</span><strong>${escapeHtml(money(transportRecorded))}</strong><small>${transportEnvelope ? `${escapeHtml(money(transportEnvelope))} envelope · ${escapeHtml(money(Math.abs(transportEnvelope - transportRecorded)))} ${transportEnvelope >= transportRecorded ? "headroom" : "over"}` : "No transport envelope"}</small></article><article><span>Price confidence</span><strong>${pricedStates.length ? pricedStates.map((entry) => `${entry.count} ${entry.state}`).join(" · ") : "Allowances only"}</strong><small>Add a checked date, local price and conversion when a live quote arrives.</small></article></div>
    </section>`;
    const adaptiveBudgetInsight = `<section class="starter-cost-rollup" aria-label="Budget allocation">
      <header><div><span>Budget allocation</span><strong>${escapeHtml(money(overview.categoryAllocated))}</strong></div><p>Summed from ${overview.categories.length} editable ${overview.categories.length === 1 ? "category" : "categories"}. These are planning allowances until a real price, quote or payment is added.</p></header>
      <div><article><span>Total budget</span><strong>${limit ? escapeHtml(money(limit)) : "Not set"}</strong><small>${escapeHtml(allocationState)}</small></article><article><span>${allocationRemaining < 0 ? "Over allocation" : "Unallocated"}</span><strong>${limit ? escapeHtml(money(Math.abs(allocationRemaining))) : "—"}</strong><small>Category totals may intentionally exceed 100% while alternatives are being compared.</small></article><article><span>Cost confidence</span><strong>Allowances only</strong><small>Replace an allowance with a linked quote or known cost as the plan develops.</small></article></div>
    </section>`;
    const moduleInsight = section.sectionId === "money" ? (starter.family === "travel" ? travelBudgetInsight : adaptiveBudgetInsight) : section.sectionId === "people" && !section.items.length ? `<div class="starter-module__empty-callout"><strong>Make people-shaped dependencies explicit.</strong><p>Add each companion, host or appointment once, then connect decisions through location and dates.</p></div>` : "";
    const comments = section.comments.length ? `<div class="starter-module__comments"><span>Notes and requests</span>${section.comments.map((comment) => `<p><b>${comment.forCodex ? `${escapeHtml(agenticName())} request` : "Your note"}</b>${escapeHtml(comment.text)}</p>`).join("")}</div>` : "";
    const questionMarkup = section.openQuestions.length ? `<section class="starter-module__questions" aria-label="Open questions for ${escapeHtml(section.label)}"><header><div><span>Open questions</span><strong>${section.openQuestions.length}</strong></div><small>Answer here or in ${escapeHtml(agenticName())}.</small></header><div>${section.openQuestions.map((question) => `<form data-arrival-form="workspace-question-answer" data-module-id="${escapeHtml(section.sectionId)}" data-question-id="${escapeHtml(question.questionId)}" data-question-prompt="${escapeHtml(question.prompt)}"><p>${escapeHtml(question.prompt)}</p><label><span>Your answer</span><textarea name="answer" required maxlength="2000" placeholder="Type an answer, or reply in ${escapeHtml(agenticName())}"></textarea></label><button class="button button--secondary" type="submit" ${busy ? "disabled" : ""}>Save answer</button></form>`).join("")}</div></section>` : "";
    const knowledgeItems = section.items.map((item) => ({ item, provisional: starterItemIsProvisional(item) }));
    const knownItems = knowledgeItems.filter(({ provisional }) => !provisional);
    const assumedItems = knowledgeItems.filter(({ provisional }) => provisional);
    const renderKnowledgeItem = ({ item }: typeof knowledgeItems[number]): string => {
      const title = String(item.fields.title || item.label);
      const facts = section.fields.filter((field) => !["title", "moneyRole", "provisional", "done"].includes(field.fieldId) && item.fields[field.fieldId] !== undefined && item.fields[field.fieldId] !== "");
      return `<article><header><b>${escapeHtml(title)}</b><small>${escapeHtml(starterSourceLabels[item.source])}</small></header>${facts.length ? `<dl>${facts.map((field) => {
        const value = item.fields[field.fieldId];
        const text = typeof value === "boolean" ? (value ? "Yes" : "No") : String(value);
        const renderedValue = field.inputType === "url" && /^https:\/\//i.test(text) ? `<a href="${escapeHtml(text)}" target="_blank" rel="noreferrer">Open link <span aria-hidden="true">↗</span></a>` : escapeHtml(text);
        return `<div><dt>${escapeHtml(field.label)}</dt><dd>${renderedValue}</dd></div>`;
      }).join("")}</dl>` : ""}</article>`;
    };
    const knownCount = section.answers.length + knownItems.length;
    const knowledgeMarkup = knownCount || assumedItems.length ? `<details class="starter-module__knowledge"><summary><span>Known &amp; assumed information</span><small>${knownCount} known${assumedItems.length ? ` · ${assumedItems.length} ${assumedItems.length === 1 ? "assumption" : "assumptions"}` : ""}</small></summary><div>${section.answers.length ? `<section class="starter-module__answers"><h4>Answered questions</h4>${section.answers.map((answer) => `<p><b>${escapeHtml(answer.prompt)}</b><span>${escapeHtml(answer.answer)}</span></p>`).join("")}</section>` : ""}${knownItems.length ? `<section><h4>Known information</h4><div class="starter-module__knowledge-list">${knownItems.map(renderKnowledgeItem).join("")}</div></section>` : ""}${assumedItems.length ? `<section><h4>Working assumptions</h4><p class="starter-module__knowledge-note">These remain italic in the plan until you mark them settled.</p><div class="starter-module__knowledge-list">${assumedItems.map(renderKnowledgeItem).join("")}</div></section>` : ""}</div></details>` : "";
    const entryNoun = section.variant === "calendar" ? calendarEntryNoun(starter.family) : section.label;
    const addControl = `<details class="starter-module__add"><summary>＋ Add ${escapeHtml(entryNoun.toLowerCase())}</summary><form data-arrival-form="workspace-add" data-module-id="${escapeHtml(section.sectionId)}"><div class="starter-record__fields">${section.fields.map((field) => renderStarterField(field)).join("")}</div>${renderStarterCertaintyToggle(false)}<button class="button" type="submit" ${busy ? "disabled" : ""}>Add to plan</button></form></details>`;
    const commentControl = `<details class="starter-module__comment"><summary>Comment on this section</summary><form data-arrival-form="workspace-comment" data-module-id="${escapeHtml(section.sectionId)}"><label><span>Note or request</span><textarea name="comment" required maxlength="2000" placeholder="Add context, a preference, or something you want changed"></textarea></label><div><button class="text-button" type="submit" name="commentMode" value="note" ${busy ? "disabled" : ""}>Save note</button><button class="button" type="submit" name="commentMode" value="codex" ${busy ? "disabled" : ""}>Ask ${escapeHtml(agenticName())}</button></div></form></details>`;
    if (section.variant === "calendar") {
      const selectedItem = section.items.find((item) => calendarDate(item.fields.start)) ?? section.items[0];
      const selectedId = selectedItem?.itemId ?? "";
      const details = section.items.map((item) => {
        const title = String(item.fields.title || item.label);
        const provisional = starterItemIsProvisional(item);
        const start = String(item.fields.start ?? "");
        const end = String(item.fields.end ?? "");
        const startTime = String(item.fields.startTime ?? "");
        const endTime = String(item.fields.endTime ?? "");
        const timing = start ? `${dateLabel(start)}${startTime ? ` · ${startTime}` : ""}${end && end !== start ? ` – ${dateLabel(end)}` : ""}${endTime ? ` · ${endTime}` : ""}` : "No date yet";
        return `<article class="starter-calendar__detail${provisional ? " is-provisional" : ""}" data-calendar-detail data-record-context data-module-id="${escapeHtml(section.sectionId)}" data-record-id="${escapeHtml(item.itemId)}" ${item.itemId === selectedId ? "" : "hidden"}>
          <header><div><span>Selected item</span><h4 tabindex="-1">${escapeHtml(title)}</h4><small>${escapeHtml(timing)} · ${escapeHtml(starterSourceLabels[item.source])}</small></div>${recordOptionsButton(item)}</header>
          <form data-arrival-form="workspace-update" data-module-id="${escapeHtml(section.sectionId)}" data-record-id="${escapeHtml(item.itemId)}"><div class="starter-record__fields">${section.fields.map((field) => renderStarterField(field, item.fields[field.fieldId])).join("")}</div>${renderStarterCertaintyToggle(provisional)}<div class="starter-record__buttons"><button class="button" type="submit" ${busy ? "disabled" : ""}>Save changes</button><button class="text-button" type="button" data-action="workspace-delete" ${busy ? "disabled" : ""}>Delete</button></div></form>
          ${recordOptionsDialog(item)}
        </article>`;
      }).join("");
      return `<details class="starter-module starter-module--${section.variant}${section.custom ? " is-custom" : ""}${isCodexPriority ? " is-codex-priority" : ""}" data-workspace-module="${escapeHtml(section.sectionId)}" data-open-questions="${section.openQuestions.length}" ${section.sectionId === prioritySectionId ? `data-codex-phase-current="true"` : ""} ${isCodexPriority ? `data-codex-priority="true" open` : ""} aria-labelledby="starter_module_${escapeHtml(section.sectionId)}">
        <summary class="starter-module__summary"><div><span>${escapeHtml(workspaceLabel)}</span><strong id="starter_module_${escapeHtml(section.sectionId)}">${escapeHtml(section.custom ? section.label : "Calendar")}</strong><small>${escapeHtml(section.description)}</small></div>${moduleCountMarkup}</summary>
        <div class="starter-module__body">
          ${questionMarkup}
          <div class="starter-calendar__toolbar"><div><span>View</span><strong>${escapeHtml(entryNoun)}</strong></div><div class="starter-calendar__view-toggle" role="group" aria-label="Calendar display"><button type="button" data-action="calendar-view" data-calendar-view="calendar" aria-pressed="true">Calendar</button><button type="button" data-action="calendar-view" data-calendar-view="list" aria-pressed="false">List</button></div></div>
          ${section.custom ? "" : `<div class="starter-calendar__filters" role="group" aria-label="Show calendar item types"><button type="button" data-action="calendar-filter" data-calendar-kind="all" aria-pressed="true">All</button>${calendarFilterOptions.map((option) => `<button type="button" data-action="calendar-filter" data-calendar-kind="${escapeHtml(option.value)}" aria-pressed="false">${escapeHtml(option.label)}</button>`).join("")}</div>`}
          <div data-calendar-pane="calendar"><div class="starter-calendar__layout"><div class="starter-calendar__grid">${renderCalendarMonths(section, overview, selectedId)}</div><aside class="starter-calendar__selection" aria-label="Selected calendar item">${details || `<div class="starter-calendar__empty-selection"><strong>No item selected</strong><p>Add the first item below to place it on the calendar.</p></div>`}</aside></div></div>
          <div data-calendar-pane="list" hidden><div class="starter-calendar__list-heading"><span>${escapeHtml(entryNoun)}</span><small>Reorder with the arrow buttons or by dragging, then open an item to edit it.</small></div><div class="starter-module__records" data-workspace-records>${items || `<p class="starter-plan__empty">${escapeHtml(section.emptyLabel)}</p>`}</div></div>
          ${comments}<div class="starter-module__controls starter-module__controls--calendar">${addControl}${commentControl}</div>
          ${section.custom ? `<div class="starter-module__custom-footer"><span>This section extends the standard workspace.</span><button class="text-button" type="button" data-action="workspace-module-delete" data-module-id="${escapeHtml(section.sectionId)}" ${busy ? "disabled" : ""}>Remove section</button></div>` : ""}
          ${knowledgeMarkup}
        </div>
      </details>`;
    }
    return `<details class="starter-module starter-module--${section.variant}${section.custom ? " is-custom" : ""}${isCodexPriority ? " is-codex-priority" : ""}" data-workspace-module="${escapeHtml(section.sectionId)}" data-open-questions="${section.openQuestions.length}" ${section.sectionId === prioritySectionId ? `data-codex-phase-current="true"` : ""} ${isCodexPriority ? `data-codex-priority="true" open` : ""} aria-labelledby="starter_module_${escapeHtml(section.sectionId)}">
      <summary class="starter-module__summary"><div><span>${escapeHtml(workspaceLabel)}</span><strong id="starter_module_${escapeHtml(section.sectionId)}">${escapeHtml(section.label)}</strong><small>${escapeHtml(section.description)}</small></div>${moduleCountMarkup}</summary>
      <div class="starter-module__body">${moduleInsight}${questionMarkup}<div class="starter-module__records" data-workspace-records>${items || `<p class="starter-plan__empty">${escapeHtml(section.emptyLabel)}</p>`}</div>
        ${comments}
        <div class="starter-module__controls">${addControl}${commentControl}</div>
        ${section.custom ? `<div class="starter-module__custom-footer"><span>This section extends the standard workspace.</span><button class="text-button" type="button" data-action="workspace-module-delete" data-module-id="${escapeHtml(section.sectionId)}" ${busy ? "disabled" : ""}>Remove section</button></div>` : ""}
        ${knowledgeMarkup}
      </div>
    </details>`;
  }).join("");
  const customSections = starter.sections.filter((section) => section.custom);
  const customWorkspaceMarkup = `<dialog class="custom-workspace-dialog" data-custom-workspace-dialog aria-labelledby="custom_workspace_title">
    <button class="custom-workspace-dialog__close" type="button" data-action="close-custom-workspace" aria-label="Close custom workspace">×</button>
    <header><p class="eyebrow">Custom mode</p><h3 id="custom_workspace_title">Extend this workspace</h3><p>The standard workspace already covers dates, money, people, tasks, requirements, options and evidence. Add a specialist section when this plan needs its own fields or tracker.</p></header>
    ${customSections.length ? `<section class="custom-workspace-dialog__current" aria-labelledby="custom_workspace_current"><h4 id="custom_workspace_current">Custom sections</h4>${customSections.map((section) => `<article><div><strong>${escapeHtml(section.label)}</strong><small>${escapeHtml(section.fields.map((entry) => entry.label).join(" · "))}</small></div><button class="text-button" type="button" data-action="open-custom-module" data-module-id="${escapeHtml(section.sectionId)}">Open</button></article>`).join("")}</section>` : ""}
    <div class="custom-workspace-dialog__paths">
      <section><span class="custom-workspace-dialog__step">Build it yourself</span><h4>Add one specialist section</h4><p>Choose a useful shape and name the extra fields. You can add, edit and remove its records like every other part of the plan.</p>
        <form data-arrival-form="workspace-module-add">
          <label><span>Section name</span><input name="label" required maxlength="100" placeholder="e.g. Interview evidence"></label>
          <label><span>What belongs here?</span><textarea name="description" required maxlength="300" placeholder="A short description of what this section tracks"></textarea></label>
          <div class="custom-workspace-dialog__grid"><label><span>Layout</span><select name="variant"><option value="cards">Cards</option><option value="checklist">Checklist</option><option value="calendar">Calendar</option></select></label><label><span>Extra fields</span><input name="fieldLabels" maxlength="240" placeholder="e.g. Competency, Result, Confidence"></label></div>
          <small>Separate extra field names with commas. Every section includes a title and notes; calendar sections also include start and end dates.</small>
          <button class="button" type="submit" ${busy ? "disabled" : ""}>Add custom section</button>
        </form>
      </section>
      <section class="custom-workspace-dialog__codex"><span class="custom-workspace-dialog__step">Build it with ${escapeHtml(agenticName())}</span><h4>Describe the specialist view</h4><p>${escapeHtml(agenticName())} can propose the fields and layout, while every resulting record remains directly editable here.</p>
        <form data-arrival-form="workspace-module-request"><label><span>What should this plan track?</span><textarea name="request" required maxlength="2000" placeholder="e.g. Add an interview evidence bank with competency, example, result, proof and confidence"></textarea></label><button class="button button--secondary" type="submit" ${busy ? "disabled" : ""}>Save request and open ${escapeHtml(agenticName())}</button></form>
      </section>
    </div>
    <footer><strong>Custom is an extension, not a different plan.</strong><span>The overview, shared sections, history and human approval boundary stay in place.</span></footer>
  </dialog>`;
  return `<section class="arrival-starter-plan" data-starter-plan aria-labelledby="starter_plan_title">
    <header class="starter-plan__header">
      <div><p class="eyebrow">Your editable rough plan</p><h2 id="starter_plan_title">${escapeHtml(starter.title)}</h2><p>${escapeHtml(starter.brief)}</p></div>
      <div class="starter-plan__header-actions"><span>${starter.interpretationIsCurrent ? "Ready to edit" : "Your changes saved"}</span><button class="button button--progress" type="button" data-action="progress-arrival-plan" ${busy ? "disabled" : ""}>${busy ? "Starting…" : "Start managing"}</button><button class="button button--secondary" type="button" data-action="open-codex-handoff" aria-haspopup="dialog">Talk to ${escapeHtml(agenticName())}</button><button class="text-button starter-plan__customise" type="button" data-action="open-custom-workspace" aria-haspopup="dialog">Customise workspace</button><small>Start managing when this draft is useful enough. You can keep changing it afterward.</small></div>
    </header>
    <div class="starter-plan__notice"><strong>${manual ? "Build this plan your way." : "This is a first-pass plan, not a researched recommendation."}</strong><p>${manual ? `Add, edit, delete, tick off, or drag anything here. You can bring in ${escapeHtml(agenticName())} later if you want help.` : `It combines what you supplied with clearly labelled rough assumptions. Change anything yourself, comment on a section, or ask ${escapeHtml(agenticName())} to research it further.`}</p></div>
    ${overviewMarkup}
    ${operatorPhaseMarkup}
    <div class="starter-workspace">${modules}</div>
    ${customWorkspaceMarkup}
    ${starter.interpretationIsCurrent ? "" : `<div class="starter-plan__preview-footer"><p>Your changes are saved. Keep editing manually or ask ${escapeHtml(agenticName())} to work from the latest version.</p></div>`}
  </section>`;
};

const arrivalStatus = (order: ArrivalOrder): { label: string; title: string; detail: string } => {
  if (order.status === "waiting_for_codex" && arrivalUsesCodexWaitingWorkspace(order) && !order.interpretation) return { label: `${agenticName()} handoff ready`, title: `Your rough plan is open while ${agenticName()} starts.`, detail: `Keep editing here. ${agenticName()} will enter from the latest saved version when you paste the copied prompt.` };
  if (order.status === "waiting_for_codex" && arrivalUsesManualWorkspace(order) && !order.interpretation) return { label: "Manual plan", title: "Your planning workspace is ready.", detail: `Build the whole plan yourself, or bring in ${agenticName()} whenever useful.` };
  if (order.status === "waiting_for_codex" && order.interpretation?.complete) return { label: "Draft updated", title: "Your starter plan includes your latest change.", detail: `Keep shaping it here or ask ${agenticName()} to develop the updated draft when you are ready.` };
  if (order.status === "waiting_for_codex") return modelContext
    ? { label: `Saved · ready for ${agenticName()}`, title: "Your starting point is saved.", detail: `Add anything else whenever you like. ${agenticName()} will work from everything you have shared.` }
    : { label: `Saved · ready for ${agenticName()}`, title: "Your starting point is saved.", detail: `Open Codex for ${agenticName()} when you are ready and ask it to continue this plan. It will work from everything you have shared.` };
  if (order.status === "codex_reviewing") return { label: `${agenticName()} is working`, title: `${agenticName()} is working through what you shared.`, detail: `You can still add or correct something. ${agenticName()} will use your newest information before proposing a plan.` };
  if (order.status === "clarification_required") return { label: "Your answer needed", title: `${agenticName()} needs one decision before it can continue.`, detail: "Only you can answer this. Finite will add your answer to the plan." };
  if (order.status === "proposed_plan_ready") return { label: "Rough plan ready", title: `${agenticName()} has built a first-pass plan.`, detail: `Edit it yourself, comment on a section, or ask ${agenticName()} to research and develop it.` };
  if (order.status === "interpretation_confirmed") return { label: "Rough plan ready", title: "Your editable plan is ready.", detail: `Change it yourself or ask ${agenticName()} to develop any part.` };
  if (order.status === "awaiting_human_authority") return { label: "Your approval needed", title: "A proposed plan is ready.", detail: "Review it below. Nothing changes until you approve it." };
  return { label: "Complete", title: "This request is complete.", detail: "You can return to the finished plan whenever you need it." };
};

const renderArrivalProfileContext = (mode: "codex" | "manual"): string => {
  if (authSession.kind !== "account") return "";
  const target = new URL(location.href);
  target.searchParams.delete("settings");
  target.searchParams.set("about", "1");
  const aboutPath = `${target.pathname}${target.search}${target.hash}`;
  if (!profileContextReady) return `<div class="arrival-profile-context arrival-profile-context--loading"><span>Checking what you asked Finite to remember…</span></div>`;
  const accepted = profileMemories.filter((memory) => memory.status === "accepted");
  if (!accepted.length) return `<div class="arrival-profile-context arrival-profile-context--empty"><span>No saved preferences are being added to this plan.</span><a href="${escapeHtml(aboutPath)}">About you</a></div>`;
  return `<details class="arrival-profile-context" data-profile-selection>
    <summary><div><span>From About you</span><strong data-profile-selection-title>${accepted.length} selected for this plan</strong><small>Open this to skip or change anything for this plan.</small></div><em data-profile-selection-count>${accepted.length} on</em></summary>
    <div class="arrival-profile-context__items">${accepted.map((memory) => `<label class="arrival-profile-context__item"><input type="checkbox" name="profileUse" value="${escapeHtml(memory.memoryId)}" checked data-arrival-mode-control ${mode === "manual" ? "disabled" : ""}><span><small>${escapeHtml(profileMemoryKindLabel(memory.kind))}</small><input name="profileStatement:${escapeHtml(memory.memoryId)}" maxlength="500" value="${escapeHtml(memory.statement)}" aria-label="Change ${escapeHtml(memory.statement)} for this plan" data-arrival-mode-control ${mode === "manual" ? "disabled" : ""}><em>Used only for this plan; changing it here does not edit About you.</em></span></label>`).join("")}</div>
    <footer><p>These are revisable starting context—not current facts, permission, or approval.</p><a href="${escapeHtml(aboutPath)}">Manage About you</a></footer>
  </details>`;
};

const renderArrival = (manifest: SurfaceManifest): void => {
  const order = currentArrival();
  const status = order ? arrivalStatus(order) : null;
  const interpretation = order?.interpretation;
  const question = order?.pendingClarification;
  const interpretationSources = order && interpretation ? interpretationSourcesForDisplay(order, interpretation.known) : {};
  const interpretationNeeds = interpretation ? interpretationNeedsForDisplay(interpretation.missing, question ?? null) : [];
  const inputTrail = order?.inputs.filter((input) => !arrivalInputIsWorkflowOnly(input)).slice(-5).reverse() ?? [];
  const planDraftMarkup = order ? renderPlanDraft() : "";
  const starterPlanMarkup = order ? renderStarterPlan(order) : "";
  const showStarterPlan = Boolean(starterPlanMarkup && !planDraftMarkup);
  surfaceRoot.dataset.profile = "arrival";
  surfaceRoot.setAttribute("aria-busy", String(busy));
  surfaceRoot.innerHTML = `
    <div class="private-top-shell">
      <header class="site-header arrival-header">
        ${renderBrand()}
        ${renderPlanSwitcher("arrival")}
        ${renderShareHeaderAction("arrival")}
        <div class="header-actions">
          ${order ? renderCodexHandoffButton() : ""}
          ${renderHeaderControls()}
        </div>
      </header>
      ${renderLifecycleRail(order ? "planning" : "starting")}
    </div>
    <main id="main" class="arrival-main">
      ${!order ? `
        <section class="arrival-compose" aria-labelledby="arrival_title">
          <div class="arrival-compose__intro">
            <p class="eyebrow">Start with the outcome</p>
            <h1 id="arrival_title">What are you trying to make <em>happen?</em></h1>
            <p class="arrival-compose__lede">Tell Finite in your own language. One sentence is enough. You do not need to choose a plan type, build a dashboard, or know every detail yet.</p>
          </div>
          <form class="arrival-order" data-arrival-form="create">
            <div class="arrival-start-tabs" role="tablist" aria-label="How do you want to start?">
              <button id="arrival_start_codex" type="button" role="tab" aria-selected="true" aria-controls="arrival_panel_codex" tabindex="0" data-arrival-start-tab="codex">Build with ${escapeHtml(agenticName())}</button>
              <button id="arrival_start_manual" type="button" role="tab" aria-selected="false" aria-controls="arrival_panel_manual" tabindex="-1" data-arrival-start-tab="manual">Build it myself</button>
            </div>
            <section id="arrival_panel_codex" class="arrival-start-panel arrival-start-panel--codex" role="tabpanel" aria-labelledby="arrival_start_codex" data-arrival-start-panel="codex">
              <div class="arrival-order__head"><div><p class="eyebrow">Describe the plan</p><strong>Write naturally. One sentence is enough.</strong></div><span>Only this is required</span></div>
              <label class="arrival-order__outcome"><span>What do you want to plan?</span><textarea name="codexOutcome" required maxlength="4000" placeholder="I’m trying to…" data-arrival-mode-control></textarea><small>${escapeHtml(agenticName())} will turn this into a populated, editable rough plan. Any assumptions remain visibly provisional.</small></label>
              <div class="arrival-examples" aria-label="Plan ideas">
                <span>Try an idea</span>
                <button type="button" data-arrival-example="Plan a weekend trip to Hobart for two people, including a sensible budget and a few things we could do.">Weekend trip</button>
                <button type="button" data-arrival-example="Plan a dinner party at home for eight people, with menu, timing, shopping and dietary needs covered.">Dinner party</button>
                <button type="button" data-arrival-example="Help me prepare for a job interview for an operations lead role next month.">Job interview</button>
                <button type="button" data-arrival-example="Plan a home office makeover without replacing my current desk.">Home project</button>
              </div>
              ${renderArrivalProfileContext("codex")}
              <div class="arrival-order__actions"><button class="button arrival-order__submit" type="submit" name="planningMode" value="codex" data-arrival-mode-control ${busy ? "disabled" : ""}>Build my rough plan</button><p>You can change every part yourself once it opens.</p></div>
            </section>
            <section id="arrival_panel_manual" class="arrival-start-panel arrival-start-panel--manual" role="tabpanel" aria-labelledby="arrival_start_manual" data-arrival-start-panel="manual" hidden>
              <div class="arrival-order__head"><div><p class="eyebrow">Prefill the plan</p><strong>Add what you already know.</strong></div><span>Leave anything open</span></div>
              <label class="arrival-order__outcome arrival-order__outcome--manual"><span>What are you planning?</span><textarea name="manualOutcome" required maxlength="4000" placeholder="Name the outcome or plan" data-arrival-mode-control disabled></textarea><small>This becomes the heading and starting point for your workspace.</small></label>
              <div class="arrival-fields arrival-fields--manual">
                <label><span>When?</span><input name="deadline" maxlength="200" placeholder="Date, time, or window" data-arrival-mode-control disabled></label>
                <label><span>What is limited?</span><input name="finiteLimit" maxlength="300" placeholder="Budget, time, capacity, or energy" data-arrival-mode-control disabled></label>
                <label><span>What must not change?</span><input name="hardConstraint" maxlength="500" placeholder="A commitment, requirement, or hard edge" data-arrival-mode-control disabled></label>
                <label><span>Useful references</span><input name="evidence" maxlength="1000" placeholder="Links, booking references, or documents" data-arrival-mode-control disabled></label>
              </div>
              ${renderArrivalProfileContext("manual")}
              <div class="arrival-order__actions"><button class="button arrival-order__submit" type="submit" name="planningMode" value="manual" data-arrival-mode-control disabled ${busy ? "disabled" : ""}>Open my workspace</button><p>Anything left blank stays open for you to add later.</p></div>
            </section>
          </form>
        </section>
        ${message ? `<div class="service-message" role="status">${escapeHtml(message)}</div>` : ""}` : `
        <section class="arrival-primary-action" aria-label="What happens next">
          <h1 id="arrival_order_title" class="sr-only">${escapeHtml(order.rawOutcome)}</h1>
          ${question ? `<section class="arrival-question"><p class="eyebrow">Next step / answer one question</p><h2>${escapeHtml(question.prompt)}</h2><form data-arrival-form="answer"><label><span>Your answer</span><input name="answer" required maxlength="1000" ${question.answerKind === "date" ? "type=\"date\"" : ""}></label><button class="button" type="submit" ${busy ? "disabled" : ""}>Save my answer</button></form><small>Your answer becomes part of the plan. ${escapeHtml(agenticName())} will not guess it for you.</small></section>` : ""}
          ${showStarterPlan ? starterPlanMarkup : ""}
          ${planDraftMarkup}
          ${!question && order.status !== "proposed_plan_ready" && order.status !== "interpretation_confirmed" && !planDraftMarkup && !showStarterPlan ? `<section class="arrival-state arrival-state--action"><span>${escapeHtml(status?.label)}</span><div><h2>${escapeHtml(status?.title)}</h2><p>${escapeHtml(status?.detail)}</p></div>${order.status === "waiting_for_codex" ? `<button class="button" type="button" data-action="open-codex-handoff" aria-haspopup="dialog">Continue in ${escapeHtml(agenticName())}</button>` : ""}</section>` : ""}
        </section>
        ${message ? `<div class="service-message" role="status">${escapeHtml(message)}</div>` : ""}
        <details class="arrival-order-source">
          <summary><span>Your starting point</span><strong>See everything you originally shared</strong></summary>
          ${renderOriginalRequest(order)}
        </details>
        <div class="arrival-working-grid">
          ${interpretation ? `<details class="arrival-interpretation">
            <summary class="arrival-interpretation__head"><div><p class="eyebrow">${escapeHtml(agenticName())}’s working interpretation</p><h2>See what shaped the rough plan</h2></div><span>${interpretation.complete ? "Used in rough plan" : "Work in progress"}</span></summary>
            <div class="arrival-interpretation__grid">
              <article class="arrival-interpretation__family"><span>Type of plan</span><strong>${escapeHtml(interpretation.inferredFamily ? humanLabel(interpretation.inferredFamily) : "Not classified yet")}</strong><p>${interpretation.inferredFamily ? `This is ${escapeHtml(agenticName())}’s working classification. You can keep editing even if it changes.` : `${escapeHtml(agenticName())} will name the plan type once it has enough information.`}</p></article>
              <article><span>What I’m working from</span>${renderHumanValue(interpretationSources)}</article>
              <article><span>What ${escapeHtml(agenticName())} currently understands</span>${hasInterpretationDetail(interpretation.inferred) ? renderHumanValue(interpretation.inferred) : `<p class="interpretation-summary">${escapeHtml(interpretation.summary)}</p>`}<p class="interpretation-note">Anything beyond the facts you supplied is still a working interpretation.</p></article>
              <article><span>What I still need</span>${renderTextList(interpretationNeeds, interpretation.complete ? "Nothing else is needed for this brief." : `${agenticName()} is still working through the request.`)}</article>
              ${interpretation.dependencies?.length ? `<article><span>Work still outside the brief</span><ul class="interpretation-list">${interpretation.dependencies.map((dependency) => `<li><strong>${escapeHtml(dependency.title)}</strong><small class="interpretation-provenance">${escapeHtml(humanLabel(dependency.kind))} · ${escapeHtml(humanLabel(dependency.status))}${dependency.blocking ? " · blocking" : ""}</small>${dependency.detail ? `<p>${escapeHtml(dependency.detail)}</p>` : ""}</li>`).join("")}</ul></article>` : ""}
              ${interpretation.contradictions.length ? `<article class="is-warning"><span>Things that do not agree yet</span>${renderTextList(interpretation.contradictions, "No contradictions")}</article>` : ""}
            </div>
          </details>` : `<div class="arrival-working-grid__placeholder" aria-hidden="true"></div>`}
          <details class="arrival-continuity">
            <summary><span>Your information</span><strong>Add or correct something</strong><small>Anything you add here becomes part of the plan.</small></summary>
            <div class="arrival-continuity__body"><div><p class="eyebrow">Keep shaping the request</p><h2>Add information to this plan.</h2><p>Use this whenever something changes or you remember another detail.</p></div>
              <form data-arrival-form="append">
                <label><span>Kind</span><select name="kind"><option value="detail">Detail</option><option value="constraint">Hard constraint</option><option value="preference">Preference</option><option value="commitment">Commitment</option><option value="correction">Correction</option><option value="evidence_reference">Link or reference</option></select></label>
                <label><span>What changed or was missing?</span><textarea name="detail" required maxlength="2000" placeholder="Add the fact in your own words"></textarea></label>
                <button class="button" type="submit" ${busy ? "disabled" : ""}>Add to request</button>
              </form>
            </div>
          </details>
        </div>
        ${inputTrail.length ? `<details class="arrival-history"><summary>Recent details you supplied</summary><ol>${inputTrail.map((input) => `<li><span>${escapeHtml(inputKindLabel(input.kind))} · ${escapeHtml(inputSurfaceLabel(input.sourceSurface))}</span>${renderHumanValue(input.payload)}</li>`).join("")}</ol></details>` : ""}
      `}
      ${labMode ? `<details class="protocol-lab"><summary>Protocol lab</summary><pre>${escapeHtml(JSON.stringify({ modelContext: typeof document.modelContext, arrival: order, manifestHash: manifest.manifestHash, tools: adapter?.inventory() ?? [] }, null, 2))}</pre></details>` : ""}
    </main>
    <footer><p>You define the outcome. ${escapeHtml(agenticName())} works through the plan. Finite keeps it together as things change.</p><span>${order ? "Your starting point is saved" : "No request waiting · your plans remain available"}</span></footer>
    ${renderCodexHandoffDialog()}
    ${renderPlanShareDialog()}
    ${renderKitchenResetDialog()}
    ${renderThemeSettingsDialog()}`;
  enableNativeWritingAssistance();
  bindArrivalInteractions();
  restoreWorkspaceUiState();
};

const refreshArrival = async (): Promise<void> => {
  arrivalResult = await arrivalRepository.open();
};

const submitArrivalOrder = async (form: HTMLFormElement, planningMode: "codex" | "manual"): Promise<void> => {
  if (busy) return;
  const data = new FormData(form);
  const rawOutcome = String(data.get(planningMode === "manual" ? "manualOutcome" : "codexOutcome") ?? "").trim();
  if (!rawOutcome) return;
  const controls = [...form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLButtonElement>("input,textarea,select,button")];
  const disabledBefore = new Map(controls.map((control) => [control, control.disabled]));
  const submitButton = form.querySelector<HTMLButtonElement>(`button[type="submit"][value="${planningMode}"]`);
  const submitLabel = submitButton?.textContent ?? "";
  busy = true;
  announce("Saving your starting point…");
  form.setAttribute("aria-busy", "true");
  surfaceRoot.setAttribute("aria-busy", "true");
  controls.forEach((control) => { control.disabled = true; });
  if (submitButton) submitButton.textContent = "Saving your starting point…";
  const restoreComposeForm = (): void => {
    busy = false;
    form.removeAttribute("aria-busy");
    surfaceRoot.setAttribute("aria-busy", "false");
    controls.forEach((control) => { control.disabled = disabledBefore.get(control) ?? false; });
    if (submitButton) submitButton.textContent = submitLabel;
  };
  const acceptedProfile = profileMemories.filter((memory) => memory.status === "accepted");
  const selectedMemoryIds = new Set(data.getAll("profileUse").map(String));
  const selectedProfile = acceptedProfile.filter((memory) => selectedMemoryIds.has(memory.memoryId)).map((memory) => ({
    memoryId: memory.memoryId,
    kind: memory.kind,
    statement: String(data.get(`profileStatement:${memory.memoryId}`) ?? memory.statement).trim() || memory.statement,
    originalStatement: memory.statement,
    evidence: memory.evidence,
    sourcePlanId: memory.sourcePlanId,
    sourceUpdatedAt: memory.updatedAt,
  }));
  const profileContext = profileContextReady && acceptedProfile.length ? {
    selectionVersion: "finite-plan-profile-selection.v1",
    selected: selectedProfile,
    excludedMemoryIds: acceptedProfile.filter((memory) => !selectedMemoryIds.has(memory.memoryId)).map((memory) => memory.memoryId),
    humanReviewedAtSubmit: true,
    law: "Plan-local context only. It is not current fact, permission, approval, or a change to About you.",
  } : undefined;
  const structured = planningMode === "manual"
    ? { planningMode, ...Object.fromEntries(["deadline", "finiteLimit", "hardConstraint"].map((key) => [key, String(data.get(key) ?? "").trim()]).filter(([, value]) => value)), ...(profileContext ? { profileContext } : {}) }
    : { planningMode, ...(profileContext ? { profileContext } : {}) };
  const evidence = planningMode === "manual" ? String(data.get("evidence") ?? "").trim() : "";
  try {
    arrivalResult = await arrivalRepository.create({ idempotencyKey: `site-arrival-${crypto.randomUUID()}`, rawOutcome, structured, attachments: evidence ? [{ kind: "human_reference", value: evidence }] : [], sourceSurface: modelContext ? "inline" : "site" });
  } catch {
    restoreComposeForm();
    announce("The request could not be saved yet. Your starting point is still here so you can try again.");
    return;
  }
  if (arrivalResult.ok) { newPlanDraftMode = false; forceArrivalSurface = false; }
  busy = false;
  announce(arrivalResult.ok ? (planningMode === "manual" ? "Your manual planning workspace is ready." : `Your rough plan is ready to edit or develop with ${agenticName()}.`) : `The request was not saved: ${arrivalResult.code}`);
  if (!arrivalResult.ok) {
    restoreComposeForm();
    return;
  }
  await render();
  if (planningMode === "codex") root.querySelector<HTMLDialogElement>("[data-codex-handoff-dialog]")?.showModal();
};

const appendArrivalDetail = async (form: HTMLFormElement, answer = false): Promise<void> => {
  const order = currentArrival();
  if (!order || busy) return;
  const data = new FormData(form);
  const draftEdit = form.dataset.arrivalForm === "draft-edit";
  const detail = String(data.get(answer ? "answer" : "detail") ?? "").trim();
  const label = String(data.get("label") ?? "").trim();
  const value = draftEdit ? label : detail;
  if (!value) return;
  busy = true;
  announce("Adding your update…");
  await render();
  arrivalResult = await arrivalRepository.appendInput({
    orderId: order.orderId,
    expectedVersion: order.version,
    kind: answer ? "answer" : String(data.get("kind") ?? "detail") as never,
    payload: answer
      ? { questionId: order.pendingClarification?.questionId, value }
      : draftEdit
        ? { draftSection: String(data.get("draftSection") ?? "").trim(), label, ...(detail ? { detail } : {}), operation: String(data.get("kind") ?? "detail") === "correction" ? "correct" : "add" }
        : { text: value },
    sourceSurface: modelContext ? "inline" : "site",
  });
  busy = false;
  announce(arrivalResult.ok ? (answer
    ? `Your answer is saved. ${agenticName()} will use it when continuing the plan.`
    : draftEdit
      ? `Added to your draft. Keep editing here, or ask ${agenticName()} to reconcile the changes when you are ready.`
      : `Your update is saved. ${agenticName()} will work from your newest information.`) : `The update was not saved: ${arrivalResult.code}`);
  await render();
};

const workspaceFieldsFromForm = (form: HTMLFormElement): Record<string, string | boolean> => {
  const fields = Object.fromEntries([...new FormData(form).entries()]
    .filter(([key]) => key.startsWith("field_") && key !== "field_provisional")
    .map(([key, value]) => [key.slice(6), String(value).trim()])) as Record<string, string | boolean>;
  const provisional = form.querySelector<HTMLInputElement>("input[name='field_provisional']");
  if (provisional) fields.provisional = provisional.checked;
  return fields;
};

const captureWorkspaceUiState = (): void => {
  workspaceUiState.openRecordOptions.clear();
  root?.querySelectorAll<HTMLDialogElement>("[data-record-options-dialog][open]").forEach((dialog) => {
    const key = dialog.dataset.recordOptionsKey;
    if (key) workspaceUiState.openRecordOptions.add(key);
  });
  root?.querySelectorAll<HTMLDetailsElement>("details[data-workspace-module]").forEach((module) => {
    const moduleId = module.dataset.workspaceModule ?? "";
    if (!moduleId) return;
    if (module.open) workspaceUiState.openModules.add(moduleId);
    else workspaceUiState.openModules.delete(moduleId);
    const selected = module.querySelector<HTMLButtonElement>("[data-action='select-calendar-item'][aria-pressed='true']")?.dataset.recordId;
    if (selected) workspaceUiState.calendarSelections.set(moduleId, selected);
    const view = module.querySelector<HTMLButtonElement>("[data-action='calendar-view'][aria-pressed='true']")?.dataset.calendarView;
    if (view === "calendar" || view === "list") workspaceUiState.calendarViews.set(moduleId, view);
    const filter = module.querySelector<HTMLButtonElement>("[data-action='calendar-filter'][aria-pressed='true']")?.dataset.calendarKind;
    if (filter) workspaceUiState.calendarFilters.set(moduleId, filter);
  });
};

const applyCalendarView = (module: HTMLElement, view: "calendar" | "list"): void => {
  module.querySelectorAll<HTMLButtonElement>("[data-action='calendar-view']").forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate.dataset.calendarView === view)));
  module.querySelectorAll<HTMLElement>("[data-calendar-pane]").forEach((pane) => { pane.hidden = pane.dataset.calendarPane !== view; });
};

const applyCalendarSelection = (module: HTMLElement, recordId: string, focus = false): void => {
  module.querySelectorAll<HTMLButtonElement>("[data-action='select-calendar-item']").forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate.dataset.recordId === recordId)));
  let selected: HTMLElement | null = null;
  module.querySelectorAll<HTMLElement>("[data-calendar-detail]").forEach((detail) => {
    detail.hidden = detail.dataset.recordId !== recordId;
    if (!detail.hidden) selected = detail;
  });
  if (focus) (selected as HTMLElement | null)?.querySelector<HTMLElement>("h4")?.focus({ preventScroll: true });
};

const applyCalendarFilter = (module: HTMLElement, kind: string): void => {
  module.querySelectorAll<HTMLButtonElement>("[data-action='calendar-filter']").forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate.dataset.calendarKind === kind)));
  module.querySelectorAll<HTMLElement>("[data-calendar-kind]").forEach((entry) => { entry.hidden = kind !== "all" && entry.dataset.calendarKind !== kind; });
};

const restoreWorkspaceUiState = (): void => {
  root?.querySelectorAll<HTMLDetailsElement>("details[data-workspace-module]").forEach((module) => {
    const moduleId = module.dataset.workspaceModule ?? "";
    module.open = workspaceUiState.openModules.has(moduleId);
    applyCalendarView(module, workspaceUiState.calendarViews.get(moduleId) ?? "calendar");
    const selection = workspaceUiState.calendarSelections.get(moduleId);
    if (selection && module.querySelector(`[data-calendar-detail][data-record-id='${CSS.escape(selection)}']`)) applyCalendarSelection(module, selection);
    applyCalendarFilter(module, workspaceUiState.calendarFilters.get(moduleId) ?? "all");
  });
  root?.querySelectorAll<HTMLDialogElement>("[data-record-options-dialog]").forEach((dialog) => {
    if (workspaceUiState.openRecordOptions.has(dialog.dataset.recordOptionsKey ?? "") && !dialog.open) dialog.showModal();
  });
  const customDialog = root?.querySelector<HTMLDialogElement>("[data-custom-workspace-dialog]");
  if (customWorkspaceOpen && customDialog && !customDialog.open) customDialog.showModal();
};

const saveWorkspaceMutation = async (payload: Record<string, unknown>, kind: "detail" | "correction" | "answer" = "detail", message = "Your plan is updated.", source?: HTMLElement): Promise<boolean> => {
  const order = currentArrival();
  if (!order || busy) return false;
  captureWorkspaceUiState();
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const saveRegion = source ?? active?.closest<HTMLElement>("form,[data-workspace-record],[data-record-context],[data-category-record]") ?? null;
  const controls = saveRegion ? [...saveRegion.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLButtonElement>("input,textarea,select,button")] : [];
  const disabledBefore = new Map(controls.map((control) => [control, control.disabled]));
  const submitButton = active instanceof HTMLButtonElement ? active : saveRegion?.querySelector<HTMLButtonElement>("button[type='submit']") ?? null;
  const submitLabel = submitButton?.textContent ?? "";
  busy = true;
  announce("Saving your plan…");
  saveRegion?.setAttribute("aria-busy", "true");
  saveRegion?.setAttribute("data-save-state", "saving");
  controls.forEach((control) => { control.disabled = true; });
  if (submitButton) submitButton.textContent = "Saving…";
  arrivalResult = await arrivalRepository.appendInput({ orderId: order.orderId, expectedVersion: order.version, kind, payload, sourceSurface: modelContext ? "inline" : "site" });
  busy = false;
  const restoreSaveRegion = (): void => {
    saveRegion?.removeAttribute("aria-busy");
    saveRegion?.removeAttribute("data-save-state");
    controls.forEach((control) => { control.disabled = disabledBefore.get(control) ?? false; });
    if (submitButton) submitButton.textContent = submitLabel;
  };
  if (!arrivalResult.ok) {
    restoreSaveRegion();
    announce(`The plan was not updated: ${arrivalResult.code}. Your changes are still here.`);
    return false;
  }
  if (arrivalResult.ok && payload.workspaceOperation === "add" && (payload.moduleId === "itinerary" || payload.moduleId === "schedule") && typeof payload.recordId === "string") workspaceUiState.calendarSelections.set(payload.moduleId, payload.recordId);
  if (arrivalResult.ok && payload.workspaceOperation === "option_promote" && (payload.moduleId === "itinerary" || payload.moduleId === "schedule") && typeof payload.targetRecordId === "string") workspaceUiState.calendarSelections.set(payload.moduleId, payload.targetRecordId);
  announce(message);
  await render();
  return true;
};

const addWorkspaceRecord = async (form: HTMLFormElement): Promise<void> => {
  const fields = workspaceFieldsFromForm(form);
  if (!String(fields.title ?? "").trim()) return;
  const recordId = `manual_${crypto.randomUUID().replaceAll("-", "")}`;
  if (form.dataset.moduleId === "itinerary" || form.dataset.moduleId === "schedule") workspaceUiState.calendarSelections.set(form.dataset.moduleId, recordId);
  await saveWorkspaceMutation({ workspaceOperation: "add", moduleId: form.dataset.moduleId, recordId, label: fields.title, fields }, "detail", "Added to your plan.", form);
};

const updateWorkspaceRecord = async (form: HTMLFormElement): Promise<void> => {
  const fields = workspaceFieldsFromForm(form);
  if (!String(fields.title ?? "").trim()) return;
  await saveWorkspaceMutation({ workspaceOperation: "update", moduleId: form.dataset.moduleId, recordId: form.dataset.recordId, fields }, "correction", "Your changes are saved.", form);
};

const customFieldId = (label: string, used: Set<string>): string => {
  const words = label.normalize("NFKD").replace(/[^a-zA-Z0-9 ]+/g, " ").trim().split(/\s+/).filter(Boolean);
  const raw = words.map((word, index) => index ? `${word[0]?.toUpperCase() ?? ""}${word.slice(1).toLowerCase()}` : word.toLowerCase()).join("").replace(/^[^a-z]+/, "").slice(0, 40) || "detail";
  let candidate = raw;
  let suffix = 2;
  while (used.has(candidate)) candidate = `${raw.slice(0, 36)}${suffix++}`;
  used.add(candidate);
  return candidate;
};

const customModuleFields = (variant: "cards" | "checklist" | "calendar", labels: string[]): Array<{ fieldId: string; label: string; inputType: "text" | "date" | "textarea" }> => {
  const used = new Set(["title"]);
  const fields: Array<{ fieldId: string; label: string; inputType: "text" | "date" | "textarea" }> = [{ fieldId: "title", label: variant === "checklist" ? "Item" : "Title", inputType: "text" }];
  if (variant === "calendar") {
    fields.push({ fieldId: "start", label: "Start", inputType: "date" }, { fieldId: "end", label: "End", inputType: "date" });
    used.add("start"); used.add("end");
  } else if (variant === "checklist") {
    fields.push({ fieldId: "due", label: "Due", inputType: "date" });
    used.add("due");
  }
  labels.slice(0, 7).forEach((label) => fields.push({ fieldId: customFieldId(label, used), label: label.slice(0, 80), inputType: "text" }));
  fields.push({ fieldId: "notes", label: "Notes", inputType: "textarea" });
  return fields.slice(0, 12);
};

const addWorkspaceModule = async (form: HTMLFormElement): Promise<void> => {
  const data = new FormData(form);
  const label = String(data.get("label") ?? "").trim();
  const description = String(data.get("description") ?? "").trim();
  const variant = data.get("variant") === "calendar" ? "calendar" : data.get("variant") === "checklist" ? "checklist" : "cards";
  if (!label || !description) return;
  const labels = String(data.get("fieldLabels") ?? "").split(",").map((entry) => entry.trim()).filter(Boolean);
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 52) || "section";
  const moduleId = `custom_${slug}_${crypto.randomUUID().replaceAll("-", "").slice(0, 8)}`;
  customWorkspaceOpen = true;
  await saveWorkspaceMutation({ workspaceOperation: "module_add", moduleId, label, description, variant, fields: customModuleFields(variant, labels), moduleSource: "human" }, "detail", `${label} was added to your workspace.`);
};

const deleteWorkspaceModule = async (button: HTMLButtonElement): Promise<void> => {
  const moduleId = button.dataset.moduleId ?? "";
  if (!moduleId.startsWith("custom_")) return;
  workspaceUiState.openModules.delete(moduleId);
  await saveWorkspaceMutation({ workspaceOperation: "module_delete", moduleId, moduleSource: "human" }, "correction", "The custom section was removed. Its history remains in the plan record.");
};

const requestWorkspaceModule = async (form: HTMLFormElement): Promise<void> => {
  const request = String(new FormData(form).get("request") ?? "").trim();
  if (!request) return;
  customWorkspaceOpen = false;
  const saved = await saveWorkspaceMutation({ workspaceOperation: "module_request", moduleId: "custom_request", request, moduleSource: "human" }, "detail", `Your custom workspace request is saved for ${agenticName()}.`);
  if (saved) root.querySelector<HTMLDialogElement>("[data-codex-handoff-dialog]")?.showModal();
};

const addWorkspaceOption = async (form: HTMLFormElement): Promise<void> => {
  const fields = workspaceFieldsFromForm(form);
  if (!String(fields.title ?? "").trim()) return;
  await saveWorkspaceMutation({ workspaceOperation: "option_add", moduleId: form.dataset.moduleId, parentRecordId: form.dataset.parentRecordId, recordId: `option_${crypto.randomUUID().replaceAll("-", "")}`, label: fields.title, fields }, "detail", "The option is saved for this item outside the working plan.");
};

const updateWorkspaceOption = async (form: HTMLFormElement): Promise<void> => {
  const fields = workspaceFieldsFromForm(form);
  if (!String(fields.title ?? "").trim()) return;
  await saveWorkspaceMutation({ workspaceOperation: "option_update", moduleId: form.dataset.moduleId, parentRecordId: form.dataset.parentRecordId, recordId: form.dataset.recordId, fields }, "correction", "The option is updated.");
};

const deleteWorkspaceOption = async (record: HTMLElement): Promise<void> => {
  await saveWorkspaceMutation({ workspaceOperation: "option_delete", moduleId: record.dataset.moduleId, recordId: record.dataset.recordId }, "correction", "The option was removed.");
};

const promoteWorkspaceOption = async (record: HTMLElement): Promise<void> => {
  const targetRecordId = `manual_${crypto.randomUUID().replaceAll("-", "")}`;
  await saveWorkspaceMutation({ workspaceOperation: "option_promote", moduleId: record.dataset.moduleId, recordId: record.dataset.recordId, targetRecordId }, "correction", "The option is now part of the working plan.");
};

const saveWorkspaceOverview = async (form: HTMLFormElement): Promise<void> => {
  const data = new FormData(form);
  const fields: Record<string, string | boolean> = {};
  const hasDates = form.elements.namedItem("start") !== null;
  const hasBudget = form.elements.namedItem("totalBudget") !== null;
  if (hasDates) {
    const start = String(data.get("start") ?? "").trim();
    const singleDay = form.querySelector<HTMLInputElement>("input[name='singleDay']")?.checked === true;
    const includeTime = form.querySelector<HTMLInputElement>("input[name='includeTime']")?.checked === true;
    Object.assign(fields, {
      start,
      end: singleDay ? start : String(data.get("end") ?? "").trim(),
      datesProvisional: form.querySelector<HTMLInputElement>("input[name='datesProvisional']")?.checked === true,
      singleDay,
      includeTime,
      startTime: includeTime ? String(data.get("startTime") ?? "").trim() : "",
      endTime: includeTime ? String(data.get("endTime") ?? "").trim() : "",
      timeZone: includeTime ? String(data.get("timeZone") ?? "").trim() : "",
    });
  }
  if (hasBudget) {
    const moneyState = String(data.get("moneyState") ?? "unknown");
    Object.assign(fields, {
      totalBudget: moneyState === "positive" ? String(data.get("totalBudget") ?? "").trim() : moneyState === "unknown" ? "" : "0",
      currency: String(data.get("currency") ?? "AUD").trim().toUpperCase(),
      moneyState,
      budgetProvisional: form.querySelector<HTMLInputElement>("input[name='budgetProvisional']")?.checked === true,
    });
  }
  await saveWorkspaceMutation({ workspaceOperation: "overview", moduleId: "overview", fields }, "correction", hasDates ? "Your plan dates are saved." : "Your total budget is saved.");
};

const addWorkspaceCategory = async (form: HTMLFormElement): Promise<void> => {
  const fields = workspaceFieldsFromForm(form);
  if (!String(fields.title ?? "").trim()) return;
  await saveWorkspaceMutation({ workspaceOperation: "add", moduleId: "money", recordId: `category_${crypto.randomUUID().replaceAll("-", "")}`, label: fields.title, fields }, "detail", "The budget category was added.");
};

const updateWorkspaceCategory = async (form: HTMLFormElement): Promise<void> => {
  const fields = workspaceFieldsFromForm(form);
  if (!String(fields.title ?? "").trim()) return;
  await saveWorkspaceMutation({ workspaceOperation: "update", moduleId: "money", recordId: form.dataset.recordId, fields }, "correction", "The category budget is saved.");
};

const deleteWorkspaceCategory = async (record: HTMLElement): Promise<void> => {
  await saveWorkspaceMutation({ workspaceOperation: "delete", moduleId: "money", recordId: record.dataset.recordId }, "correction", "The budget category was removed.");
};

const bindWorkspaceOverviewToggles = (): void => {
  const form = root?.querySelector<HTMLFormElement>("[data-arrival-form='workspace-overview']");
  if (!form) return;
  const singleDay = form.querySelector<HTMLInputElement>("input[name='singleDay']");
  const includeTime = form.querySelector<HTMLInputElement>("input[name='includeTime']");
  const endDate = form.querySelector<HTMLElement>("[data-overview-end-date]");
  const times = form.querySelector<HTMLElement>("[data-overview-times]");
  const sync = (): void => {
    if (endDate) endDate.hidden = singleDay?.checked === true;
    if (times) times.hidden = includeTime?.checked !== true;
  };
  singleDay?.addEventListener("change", sync);
  includeTime?.addEventListener("change", sync);
  sync();
};

const bindWorkspaceOverviewEditors = (): void => {
  root?.querySelectorAll<HTMLButtonElement>("[data-action='open-overview-editor']").forEach((button) => button.addEventListener("click", () => {
    const dialog = root.querySelector<HTMLDialogElement>(`[data-overview-dialog='${button.dataset.overviewEditor ?? ""}']`);
    if (!dialog) return;
    dialog.showModal();
    const field = button.dataset.overviewFocus ? dialog.querySelector<HTMLInputElement>(`[name='${button.dataset.overviewFocus}']`) : null;
    (field ?? dialog.querySelector<HTMLElement>("input, button"))?.focus();
  }));
  root?.querySelectorAll<HTMLButtonElement>("[data-action='close-overview-editor']").forEach((button) => button.addEventListener("click", () => button.closest<HTMLDialogElement>("dialog")?.close()));
  root?.querySelectorAll<HTMLButtonElement>("[data-action='open-workspace-module']").forEach((button) => button.addEventListener("click", () => {
    const moduleId = String(button.dataset.moduleId ?? "");
    const module = [...root.querySelectorAll<HTMLDetailsElement>("details[data-workspace-module]")].find((candidate) => candidate.dataset.workspaceModule === moduleId);
    if (!module) return;
    module.open = true;
    workspaceUiState.openModules.add(moduleId);
    module.scrollIntoView({ behavior: "smooth", block: "start" });
    module.querySelector<HTMLElement>("summary")?.focus({ preventScroll: true });
  }));
  root?.querySelectorAll<HTMLButtonElement>("[data-action='calendar-view']").forEach((button) => button.addEventListener("click", () => {
    const module = button.closest<HTMLElement>("[data-workspace-module]");
    if (!module) return;
    const view = button.dataset.calendarView === "list" ? "list" : "calendar";
    applyCalendarView(module, view);
    workspaceUiState.calendarViews.set(module.dataset.workspaceModule ?? "", view);
  }));
  root?.querySelectorAll<HTMLButtonElement>("[data-action='calendar-filter']").forEach((button) => button.addEventListener("click", () => {
    const module = button.closest<HTMLElement>("[data-workspace-module]");
    if (!module) return;
    const kind = button.dataset.calendarKind ?? "all";
    applyCalendarFilter(module, kind);
    workspaceUiState.calendarFilters.set(module.dataset.workspaceModule ?? "", kind);
  }));
  root?.querySelectorAll<HTMLButtonElement>("[data-action='select-calendar-item']").forEach((button) => button.addEventListener("click", () => {
    const module = button.closest<HTMLElement>("[data-workspace-module]");
    const recordId = button.dataset.recordId ?? "";
    if (!module || !recordId) return;
    applyCalendarSelection(module, recordId, true);
    workspaceUiState.calendarSelections.set(module.dataset.workspaceModule ?? "", recordId);
  }));
  root?.querySelectorAll<HTMLButtonElement>("[data-action='open-related-record']").forEach((button) => button.addEventListener("click", () => {
    const moduleId = button.dataset.moduleId ?? "";
    const recordId = button.dataset.recordId ?? "";
    const module = root.querySelector<HTMLDetailsElement>(`details[data-workspace-module='${CSS.escape(moduleId)}']`);
    if (!module || !recordId) return;
    module.open = true;
    workspaceUiState.openModules.add(moduleId);
    workspaceUiState.calendarSelections.set(moduleId, recordId);
    applyCalendarView(module, "calendar");
    applyCalendarSelection(module, recordId);
    module.scrollIntoView({ behavior: "smooth", block: "start" });
  }));
  root?.querySelectorAll<HTMLDetailsElement>("details[data-workspace-module]").forEach((module) => module.addEventListener("toggle", () => {
    const moduleId = module.dataset.workspaceModule ?? "";
    if (!moduleId) return;
    if (module.open) workspaceUiState.openModules.add(moduleId);
    else workspaceUiState.openModules.delete(moduleId);
  }));
};

const deleteWorkspaceRecord = async (record: HTMLElement): Promise<void> => { await saveWorkspaceMutation({ workspaceOperation: "delete", moduleId: record.dataset.moduleId, recordId: record.dataset.recordId }, "correction", "The item was removed from your plan."); };

const toggleWorkspaceRecord = async (record: HTMLElement): Promise<void> => { await saveWorkspaceMutation({ workspaceOperation: "toggle", moduleId: record.dataset.moduleId, recordId: record.dataset.recordId, done: !record.classList.contains("is-done") }, "detail", record.classList.contains("is-done") ? "The task is open again." : "The task is complete."); };

const reorderWorkspaceRecords = async (module: HTMLElement, draggedId: string, targetId: string): Promise<void> => {
  const order = [...module.querySelectorAll<HTMLElement>("[data-workspace-record]")].map((record) => record.dataset.recordId ?? "").filter(Boolean);
  const from = order.indexOf(draggedId);
  const to = order.indexOf(targetId);
  if (from < 0 || to < 0 || from === to) return;
  order.splice(from, 1);
  order.splice(to, 0, draggedId);
  await saveWorkspaceMutation({ workspaceOperation: "reorder", moduleId: module.dataset.workspaceModule, recordOrder: order }, "correction", "The plan order is updated.");
};

const moveWorkspaceRecord = async (record: HTMLElement, direction: "up" | "down"): Promise<void> => {
  const module = record.closest<HTMLElement>("[data-workspace-module]");
  if (!module) return;
  const records = [...module.querySelectorAll<HTMLElement>("[data-workspace-record]")];
  const index = records.indexOf(record);
  const target = records[index + (direction === "up" ? -1 : 1)];
  if (target) await reorderWorkspaceRecords(module, record.dataset.recordId ?? "", target.dataset.recordId ?? "");
};

const addWorkspaceComment = async (form: HTMLFormElement, forCodex: boolean): Promise<void> => {
  const comment = String(new FormData(form).get("comment") ?? "").trim();
  if (!comment) return;
  const saved = await saveWorkspaceMutation({ workspaceOperation: "note", moduleId: form.dataset.moduleId, recordId: `comment_${crypto.randomUUID().replaceAll("-", "")}`, comment, forCodex }, "detail", forCodex ? `Your section request is saved for ${agenticName()}.` : "Your section note is saved.");
  if (saved && forCodex) root.querySelector<HTMLDialogElement>("[data-codex-handoff-dialog]")?.showModal();
};

const answerWorkspaceQuestion = async (form: HTMLFormElement): Promise<void> => {
  const answer = String(new FormData(form).get("answer") ?? "").trim();
  const questionId = String(form.dataset.questionId ?? "").trim();
  const question = String(form.dataset.questionPrompt ?? "").trim();
  if (!answer || !questionId || !question) return;
  await saveWorkspaceMutation({ workspaceOperation: "question_answer", moduleId: form.dataset.moduleId, questionId, question, answer }, "answer", "Your answer is saved in this section.", form);
};

const bindWorkspaceCurrencyConversions = (): void => {
  root?.querySelectorAll<HTMLFormElement>("[data-arrival-form='workspace-add'],[data-arrival-form='workspace-update'],[data-arrival-form='workspace-option-add'],[data-arrival-form='workspace-option-update']").forEach((form) => {
    const localAmount = form.querySelector<HTMLInputElement>("[name='field_localAmount'],[name='field_localTotal']");
    const baseRate = form.querySelector<HTMLInputElement>("[name='field_baseRate']");
    const baseAmount = form.querySelector<HTMLInputElement>("[name='field_cost'],[name='field_totalBudget']");
    if (!localAmount || !baseRate || !baseAmount) return;
    const sync = (): void => {
      const local = Number(localAmount.value);
      const rate = Number(baseRate.value);
      if (Number.isFinite(local) && local > 0 && Number.isFinite(rate) && rate > 0) baseAmount.value = (local * rate).toFixed(2).replace(/\.00$/, "");
    };
    localAmount.addEventListener("input", sync);
    baseRate.addEventListener("input", sync);
  });
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
  if (submit) { submit.disabled = true; submit.textContent = "Clearing your Finite data…"; }
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
  themeSettingsOpen = true;
  themeEditingId = null;
  themeDeleteId = null;
  skinEditingId = null;
  skinDeleteId = null;
  await render();
  try {
    await Promise.all([refreshThemeCatalog(), refreshSkinCatalog()]);
    if (themeSettingsOpen) await render();
  } catch { announce("Finite could not refresh appearance settings. Your current appearance is unchanged."); }
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
  bindPlanShareInteractions();
  bindFollowCodexInteractions();
  bindPlanSwitcherInteractions();
  bindKitchenResetInteractions();
  bindThemeSettingsInteractions();
  bindWorkspaceOverviewEditors();
  bindWorkspaceOverviewToggles();
  bindWorkspaceCurrencyConversions();
  const syncProfileSelectionCount = (): void => {
    const selection = root?.querySelector<HTMLElement>("[data-profile-selection]");
    if (!selection) return;
    const count = selection.querySelectorAll<HTMLInputElement>("input[name='profileUse']:checked").length;
    const countLabel = selection.querySelector<HTMLElement>("[data-profile-selection-count]");
    const title = selection.querySelector<HTMLElement>("[data-profile-selection-title]");
    if (countLabel) countLabel.textContent = `${count} on`;
    if (title) title.textContent = `${count} selected for this plan`;
  };
  root?.querySelectorAll<HTMLInputElement>("input[name='profileUse']").forEach((input) => input.addEventListener("change", syncProfileSelectionCount));
  root?.querySelector<HTMLButtonElement>("[data-action='open-custom-workspace']")?.addEventListener("click", () => {
    customWorkspaceOpen = true;
    const dialog = root.querySelector<HTMLDialogElement>("[data-custom-workspace-dialog]");
    dialog?.showModal();
    dialog?.querySelector<HTMLElement>("input, textarea, button")?.focus();
  });
  root?.querySelectorAll<HTMLButtonElement>("[data-action='close-custom-workspace']").forEach((button) => button.addEventListener("click", () => {
    customWorkspaceOpen = false;
    button.closest<HTMLDialogElement>("dialog")?.close();
  }));
  root?.querySelector<HTMLDialogElement>("[data-custom-workspace-dialog]")?.addEventListener("close", () => { customWorkspaceOpen = false; });
  root?.querySelectorAll<HTMLButtonElement>("[data-action='open-custom-module']").forEach((button) => button.addEventListener("click", () => {
    const moduleId = button.dataset.moduleId ?? "";
    customWorkspaceOpen = false;
    button.closest<HTMLDialogElement>("dialog")?.close();
    const module = root.querySelector<HTMLDetailsElement>(`details[data-workspace-module='${CSS.escape(moduleId)}']`);
    if (!module) return;
    module.open = true;
    workspaceUiState.openModules.add(moduleId);
    module.scrollIntoView({ behavior: "smooth", block: "start" });
  }));
  root?.querySelectorAll<HTMLButtonElement>("[data-action='open-record-options']").forEach((button) => button.addEventListener("click", () => {
    const target = button.dataset.recordOptionsTarget ?? "";
    const dialog = target ? root.querySelector<HTMLDialogElement>(`#${CSS.escape(target)}`) : null;
    if (!dialog) return;
    const key = dialog.dataset.recordOptionsKey;
    if (key) workspaceUiState.openRecordOptions.add(key);
    dialog.showModal();
    dialog.querySelector<HTMLElement>("button, summary, input")?.focus();
  }));
  root?.querySelectorAll<HTMLButtonElement>("[data-action='close-record-options']").forEach((button) => button.addEventListener("click", () => button.closest<HTMLDialogElement>("dialog")?.close()));
  root?.querySelectorAll<HTMLDialogElement>("[data-record-options-dialog]").forEach((dialog) => dialog.addEventListener("close", () => {
    const key = dialog.dataset.recordOptionsKey;
    if (key) workspaceUiState.openRecordOptions.delete(key);
  }));
  root?.querySelector<HTMLFormElement>("[data-arrival-form='create']")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const mode = ((event as SubmitEvent).submitter as HTMLButtonElement | null)?.value === "manual" ? "manual" : "codex";
    void submitArrivalOrder(event.currentTarget as HTMLFormElement, mode);
  });
  const setArrivalStartTab = (mode: "codex" | "manual", focusTab = false): void => {
    root?.querySelectorAll<HTMLButtonElement>("[data-arrival-start-tab]").forEach((tab) => {
      const selected = tab.dataset.arrivalStartTab === mode;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected && focusTab) tab.focus();
    });
    root?.querySelectorAll<HTMLElement>("[data-arrival-start-panel]").forEach((panel) => {
      const selected = panel.dataset.arrivalStartPanel === mode;
      panel.hidden = !selected;
      panel.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement>("[data-arrival-mode-control]").forEach((control) => { control.disabled = !selected || busy; });
    });
    if (!focusTab) root?.querySelector<HTMLElement>(`[data-arrival-start-panel='${mode}'] textarea`)?.focus();
  };
  root?.querySelectorAll<HTMLButtonElement>("[data-arrival-start-tab]").forEach((tab) => {
    tab.addEventListener("click", () => setArrivalStartTab(tab.dataset.arrivalStartTab === "manual" ? "manual" : "codex"));
    tab.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const mode = event.key === "ArrowLeft" || event.key === "Home" ? "codex" : "manual";
      setArrivalStartTab(mode, true);
    });
  });
  root?.querySelector<HTMLFormElement>("[data-arrival-form='append']")?.addEventListener("submit", (event) => { event.preventDefault(); void appendArrivalDetail(event.currentTarget as HTMLFormElement); });
  root?.querySelector<HTMLFormElement>("[data-arrival-form='draft-edit']")?.addEventListener("submit", (event) => { event.preventDefault(); void appendArrivalDetail(event.currentTarget as HTMLFormElement); });
  root?.querySelectorAll<HTMLFormElement>("[data-arrival-form='workspace-add']").forEach((form) => form.addEventListener("submit", (event) => { event.preventDefault(); void addWorkspaceRecord(event.currentTarget as HTMLFormElement); }));
  root?.querySelectorAll<HTMLFormElement>("[data-arrival-form='workspace-update']").forEach((form) => form.addEventListener("submit", (event) => { event.preventDefault(); void updateWorkspaceRecord(event.currentTarget as HTMLFormElement); }));
  root?.querySelector<HTMLFormElement>("[data-arrival-form='workspace-module-add']")?.addEventListener("submit", (event) => { event.preventDefault(); void addWorkspaceModule(event.currentTarget as HTMLFormElement); });
  root?.querySelector<HTMLFormElement>("[data-arrival-form='workspace-module-request']")?.addEventListener("submit", (event) => { event.preventDefault(); void requestWorkspaceModule(event.currentTarget as HTMLFormElement); });
  root?.querySelectorAll<HTMLFormElement>("[data-arrival-form='workspace-option-add']").forEach((form) => form.addEventListener("submit", (event) => { event.preventDefault(); void addWorkspaceOption(event.currentTarget as HTMLFormElement); }));
  root?.querySelectorAll<HTMLFormElement>("[data-arrival-form='workspace-option-update']").forEach((form) => form.addEventListener("submit", (event) => { event.preventDefault(); void updateWorkspaceOption(event.currentTarget as HTMLFormElement); }));
  root?.querySelectorAll<HTMLFormElement>("[data-arrival-form='workspace-overview']").forEach((form) => form.addEventListener("submit", (event) => { event.preventDefault(); void saveWorkspaceOverview(event.currentTarget as HTMLFormElement); }));
  root?.querySelectorAll<HTMLFormElement>("[data-arrival-form='workspace-category-add']").forEach((form) => form.addEventListener("submit", (event) => { event.preventDefault(); void addWorkspaceCategory(event.currentTarget as HTMLFormElement); }));
  root?.querySelectorAll<HTMLFormElement>("[data-arrival-form='workspace-category-update']").forEach((form) => form.addEventListener("submit", (event) => { event.preventDefault(); void updateWorkspaceCategory(event.currentTarget as HTMLFormElement); }));
  root?.querySelectorAll<HTMLFormElement>("[data-arrival-form='workspace-comment']").forEach((form) => form.addEventListener("submit", (event) => {
    event.preventDefault();
    const forCodex = ((event as SubmitEvent).submitter as HTMLButtonElement | null)?.value === "codex";
    void addWorkspaceComment(event.currentTarget as HTMLFormElement, forCodex);
  }));
  root?.querySelectorAll<HTMLFormElement>("[data-arrival-form='workspace-question-answer']").forEach((form) => form.addEventListener("submit", (event) => { event.preventDefault(); void answerWorkspaceQuestion(event.currentTarget as HTMLFormElement); }));
  root?.querySelectorAll<HTMLButtonElement>("[data-action='workspace-delete']").forEach((button) => button.addEventListener("click", () => { const record = button.closest<HTMLElement>("[data-workspace-record], [data-record-context]"); if (record) void deleteWorkspaceRecord(record); }));
  root?.querySelectorAll<HTMLButtonElement>("[data-action='workspace-module-delete']").forEach((button) => button.addEventListener("click", () => { void deleteWorkspaceModule(button); }));
  root?.querySelectorAll<HTMLButtonElement>("[data-action='workspace-option-delete']").forEach((button) => button.addEventListener("click", () => { const record = button.closest<HTMLElement>("[data-workspace-option]"); if (record) void deleteWorkspaceOption(record); }));
  root?.querySelectorAll<HTMLButtonElement>("[data-action='workspace-option-promote']").forEach((button) => button.addEventListener("click", () => { const record = button.closest<HTMLElement>("[data-workspace-option]"); if (record) void promoteWorkspaceOption(record); }));
  root?.querySelectorAll<HTMLButtonElement>("[data-action='workspace-category-delete']").forEach((button) => button.addEventListener("click", () => { const record = button.closest<HTMLElement>("[data-category-record]"); if (record) void deleteWorkspaceCategory(record); }));
  root?.querySelectorAll<HTMLButtonElement>("[data-action='workspace-toggle']").forEach((button) => button.addEventListener("click", () => { const record = button.closest<HTMLElement>("[data-workspace-record]"); if (record) void toggleWorkspaceRecord(record); }));
  root?.querySelectorAll<HTMLButtonElement>("[data-action='workspace-move']").forEach((button) => button.addEventListener("click", () => { const record = button.closest<HTMLElement>("[data-workspace-record]"); const direction = button.dataset.direction; if (record && (direction === "up" || direction === "down")) void moveWorkspaceRecord(record, direction); }));
  root?.querySelectorAll<HTMLElement>("[data-workspace-record]").forEach((record) => {
    record.addEventListener("dragstart", (event) => { event.dataTransfer?.setData("text/plain", record.dataset.recordId ?? ""); event.dataTransfer?.setData("application/x-finite-module", record.dataset.moduleId ?? ""); record.classList.add("is-dragging"); });
    record.addEventListener("dragend", () => record.classList.remove("is-dragging"));
    record.addEventListener("dragover", (event) => event.preventDefault());
    record.addEventListener("drop", (event) => { event.preventDefault(); const moduleId = event.dataTransfer?.getData("application/x-finite-module") ?? ""; if (moduleId !== record.dataset.moduleId) return; const module = record.closest<HTMLElement>("[data-workspace-module]"); if (module) void reorderWorkspaceRecords(module, event.dataTransfer?.getData("text/plain") ?? "", record.dataset.recordId ?? ""); });
  });
  root?.querySelector<HTMLFormElement>("[data-arrival-form='answer']")?.addEventListener("submit", (event) => { event.preventDefault(); void appendArrivalDetail(event.currentTarget as HTMLFormElement, true); });
  root?.querySelectorAll<HTMLButtonElement>("[data-arrival-example]").forEach((button) => button.addEventListener("click", () => {
    const textarea = root.querySelector<HTMLTextAreaElement>("textarea[name='codexOutcome']");
    if (textarea) { textarea.value = button.dataset.arrivalExample ?? ""; textarea.focus(); }
  }));
  root?.querySelector<HTMLButtonElement>("[data-action='confirm-plan']")?.addEventListener("click", (event) => { void confirmPlanDraft((event.currentTarget as HTMLButtonElement).dataset.draft ?? ""); });
  root?.querySelector<HTMLButtonElement>("[data-action='progress-arrival-plan']")?.addEventListener("click", () => { void progressArrivalPlan(); });
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
  announce("Running the authenticated three-plan handoff acceptance…");
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

const stageComponents = new Set<SurfaceZone["component"]>(["timeline_lane", "phase_lane", "run_of_show"]);

const planInputSectionLabel = (section: PlanInputSection): string => ({ general: "Whole plan", timeline: "Timeline", money: "Money", boundaries: "Boundaries" })[section];
const planInputKindLabel = (kind: PlanInputKind): string => ({ decision: "Decision", update: "Update", question: "Question" })[kind];
const planInputsFor = (section: PlanInputSection, contextId: string | null = null): PlanInputRecord[] => planInputs.filter((item) => item.section === section && (section !== "timeline" || item.contextId === contextId));
const pendingBadge = (section: PlanInputSection, contextId: string | null = null): string => planInputsFor(section, contextId).some((item) => item.mode === "codex") ? `<span class="pending-badge">Pending</span>` : "";
type PlanInputMessageBlock = { heading: string | null; lines: string[] };
const planInputMessageBlocks = (message: string): PlanInputMessageBlock[] => {
  const blocks: PlanInputMessageBlock[] = [];
  let current: PlanInputMessageBlock | null = null;
  message.split("\n").forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) return;
    if (line.endsWith(":") && Array.from(line).length <= 140) {
      current = { heading: line.slice(0, -1).trim(), lines: [] };
      blocks.push(current);
      return;
    }
    if (!current) { current = { heading: null, lines: [] }; blocks.push(current); }
    current.lines.push(line);
  });
  return blocks;
};
const planInputHeadings = (items: PlanInputRecord[]): string[] => [...new Set(items.flatMap((item) => planInputMessageBlocks(item.message).flatMap((block) => block.heading ? [block.heading] : [])))];
const renderPlanInputMessage = (message: string): string => planInputMessageBlocks(message).map((block) => `<section class="plan-input-item__section">
  ${block.heading ? `<h4>${escapeHtml(block.heading)}</h4>` : ""}
  ${block.lines.length > 1 ? `<ul>${block.lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>` : block.lines.length ? `<p>${escapeHtml(block.lines[0])}</p>` : ""}
</section>`).join("");
const renderPlanInputItems = (section: PlanInputSection, contextId: string | null = null, compact = false): string => {
  const items = planInputsFor(section, contextId);
  if (!items.length) return "";
  const headings = planInputHeadings(items);
  const pending = items.some((item) => item.mode === "codex" && item.baseCurrent);
  const summary = headings.length ? headings.slice(0, 3).join(" · ") : contextId ? items[0]?.contextLabel ?? "Saved information" : `${planInputSectionLabel(section)} notes`;
  const count = headings.length || items.length;
  return `<details class="plan-input-items${compact ? " plan-input-items--compact" : ""}${pending ? " plan-input-items--pending" : ""}" ${pending ? "open" : ""}>
    <summary><span>${pending ? `Waiting for ${escapeHtml(agenticName())}` : "Saved plan information"}</span><strong>${escapeHtml(summary)}</strong><small>${count} ${count === 1 ? "section" : "sections"}</small></summary>
    <div class="plan-input-items__body">${items.map((item) => `<article class="plan-input-item plan-input-item--${escapeHtml(item.mode)}">
    <div class="plan-input-item__copy"><span>${escapeHtml(item.mode === "direct" && item.kind === "update" ? "Plan details" : planInputKindLabel(item.kind))}</span>${renderPlanInputMessage(item.message)}</div>
    <div class="plan-input-item__actions"><button type="button" data-action="edit-plan-input" data-plan-input-id="${escapeHtml(item.inputId)}">Change</button><button type="button" data-action="handle-plan-input" data-plan-input-id="${escapeHtml(item.inputId)}">Mark handled</button></div>
  </article>`).join("")}</div>
  </details>`;
};

const renderPendingPlanPriority = (): string => {
  const pending = planInputs.filter((item) => item.mode === "codex" && item.status === "open" && item.baseCurrent);
  if (!pending.length) return "";
  const item = pending[0]!;
  return `<section class="plan-priority-update" aria-labelledby="plan_priority_update_title">
    <div class="plan-priority-update__status"><p class="eyebrow">Codex priority</p><span>${escapeHtml(planInputKindLabel(item.kind))}</span></div>
    <div class="plan-priority-update__copy"><h2 id="plan_priority_update_title">${escapeHtml(item.contextLabel ? `New update · ${item.contextLabel}` : "New plan update")}</h2>${renderPlanInputMessage(item.message)}<small>Visible working input · accepted numbers and constraints stay unchanged until a valid route is approved.</small></div>
    <div class="plan-priority-update__actions">${pending.length > 1 ? `<b>${pending.length} waiting</b>` : ""}<button type="button" data-action="edit-plan-input" data-plan-input-id="${escapeHtml(item.inputId)}">Change</button><button type="button" data-action="handle-plan-input" data-plan-input-id="${escapeHtml(item.inputId)}">Mark handled</button></div>
  </section>`;
};

const checklistFor = (section: PlanInputSection, contextId: string | null = null): ChecklistItem[] => checklistItems.filter((item) => item.section === section && (section !== "timeline" || item.contextId === contextId));
const checklistForStage = (stageId: string): ChecklistItem | null => checklistItems.find((item) => item.sourceRef === `stage:${stageId}`) ?? null;
const attachmentsFor = (section: PlanInputSection, contextId: string | null = null): PlanAttachment[] => planAttachments.filter((item) => item.section === section && (section !== "timeline" || item.contextId === contextId));
const attachmentKindLabel = (kind: PlanAttachment["kind"]): string => ({ image: "Image", file: "File", link: "Link", note: "Note" })[kind];
const attachmentRoleLabel = (role: PlanAttachment["attachmentRole"]): string => role === "source" ? "Source" : "Agent output";
const attachmentProcessingLabel = (item: PlanAttachment): string => item.attachmentRole === "output" ? "Output" : ({ unread: "New", in_progress: "Processing", processed: "Processed", needs_review: "Needs review", not_applicable: "Output" })[item.processingStatus];
const formatFileSize = (bytes: number | null): string => bytes === null ? "" : bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
const renderAttachmentItems = (items: PlanAttachment[], compact = false): string => {
  if (!items.length) return "";
  return `<div class="plan-attachments${compact ? " plan-attachments--compact" : ""}">${items.map((item) => `<article class="plan-attachment plan-attachment--${escapeHtml(item.kind)}${item.processingStatus === "unread" ? " is-new" : ""}">
    ${item.kind === "image" && item.contentUrl ? `<a class="plan-attachment__thumb" href="${escapeHtml(item.contentUrl)}" target="_blank" rel="noopener"><img src="${escapeHtml(item.contentUrl)}" alt=""></a>` : `<span class="plan-attachment__icon" aria-hidden="true">${item.kind === "link" ? "↗" : item.kind === "note" ? "≡" : "↓"}</span>`}
    <div><span>${escapeHtml(attachmentKindLabel(item.kind))}${item.contextLabel ? ` · ${escapeHtml(item.contextLabel)}` : ""}</span><div class="plan-attachment__badges"><b>${escapeHtml(attachmentRoleLabel(item.attachmentRole))}</b><b class="is-${escapeHtml(item.processingStatus)}">${escapeHtml(attachmentProcessingLabel(item))}</b></div>${item.linkUrl ? `<a href="${escapeHtml(item.linkUrl)}" target="_blank" rel="noopener">${escapeHtml(item.label)}</a>` : item.contentUrl ? `<a href="${escapeHtml(item.contentUrl)}" target="_blank" rel="noopener">${escapeHtml(item.label)}</a>` : `<strong>${escapeHtml(item.label)}</strong>`}${item.noteText ? `<p>${escapeHtml(item.noteText)}</p>` : ""}${item.processingSummary ? `<p class="plan-attachment__summary">${escapeHtml(item.processingSummary)}</p>` : ""}${item.derivedRefs.length ? `<small>${item.derivedRefs.length} derived plan ${item.derivedRefs.length === 1 ? "record" : "records"}</small>` : ""}${item.sizeBytes ? `<small>${escapeHtml(formatFileSize(item.sizeBytes))}</small>` : ""}</div>
    <button type="button" data-action="remove-attachment" data-attachment-id="${escapeHtml(item.attachmentId)}" aria-label="Remove ${escapeHtml(item.label)}">Remove</button>
  </article>`).join("")}</div>`;
};

const renderPlanWork = (): string => {
  const done = checklistItems.filter((item) => item.status === "done");
  const custom = checklistItems.filter((item) => item.origin !== "adaptive");
  return `<section class="plan-work" id="plan_work" aria-label="Plan progress and attachments">
    <article class="plan-work__checklist">
      <header><div><p class="eyebrow">Progress</p><h2>${done.length} of ${checklistItems.length} done</h2><small>Plan-stage tasks are ticked off in the timeline below.</small></div></header>
      ${custom.length ? `<div class="checklist-items">${custom.sort((a, b) => Number(a.status === "done") - Number(b.status === "done")).map((item) => `<label class="checklist-item${item.status === "done" ? " is-done" : ""}"><input type="checkbox" data-action="toggle-checklist" data-checklist-id="${escapeHtml(item.itemId)}" ${item.status === "done" ? "checked" : ""} ${planWorkBusy ? "disabled" : ""}><span><strong>${escapeHtml(item.label)}</strong>${item.contextLabel ? `<small>${escapeHtml(item.contextLabel)}</small>` : ""}</span></label>`).join("")}</div>` : ""}
      <form class="checklist-add" data-checklist-add><label><span class="sr-only">Add something to do</span><input name="label" type="text" maxlength="240" placeholder="Add something to do…" required></label><button type="submit" ${planWorkBusy ? "disabled" : ""}>Add</button></form>
    </article>
    <article class="plan-work__attachments">
      <header><div><p class="eyebrow">Reference material</p><h2>Files &amp; links</h2>${planAttachments.some((item) => item.attachmentRole === "source" && item.processingStatus === "unread") ? `<small>${planAttachments.filter((item) => item.attachmentRole === "source" && item.processingStatus === "unread").length} new for ${escapeHtml(agenticName())}</small>` : ""}</div><button type="button" data-action="open-attachment" data-attachment-section="general">+ Add</button></header>
      ${planAttachments.length ? renderAttachmentItems(planAttachments) : `<button type="button" class="attachment-empty" data-action="open-attachment" data-attachment-section="general"><span>＋</span><strong>Add a file, image, note or link</strong></button>`}
    </article>
  </section>`;
};

const renderAttachmentDialog = (manifest: SurfaceManifest): string => `<dialog class="plan-input-dialog attachment-dialog" aria-labelledby="attachment_title">
  <button type="button" class="dialog-close" data-action="close-attachment" aria-label="Close">×</button>
  <form data-attachment-form>
    <header><p class="eyebrow">Add to this plan</p><h2 id="attachment_title">Files, pictures, links or notes</h2></header>
    <div class="attachment-dialog__fields">
      <label><span>What is this?</span><select name="attachmentRole"><option value="source" selected>Source material</option><option value="output">Agent output</option></select><small>Source material waits for ${escapeHtml(agenticName())} to process. Agent output is a finished deliverable.</small></label>
      <label><span>Where does it belong?</span><select name="location">
        <option value="general" ${attachmentContext.section === "general" ? "selected" : ""}>Whole plan</option>
        <option value="money" ${attachmentContext.section === "money" ? "selected" : ""}>Money</option>
        <option value="boundaries" ${attachmentContext.section === "boundaries" ? "selected" : ""}>Boundaries</option>
        ${manifest.stages.map((stage) => `<option value="timeline:${escapeHtml(stage.stageId)}" ${attachmentContext.section === "timeline" && attachmentContext.contextId === stage.stageId ? "selected" : ""}>${escapeHtml(stage.label)}</option>`).join("")}
      </select></label>
      <label class="attachment-upload"><span>Upload files or pictures</span><input name="files" type="file" multiple><small>Up to 10 MB each</small></label>
      <div class="attachment-dialog__or"><span>or add information</span></div>
      <label><span>Link</span><input name="link" type="url" maxlength="2000" placeholder="https://…"></label>
      <label><span>Name for the link</span><input name="linkLabel" type="text" maxlength="160" placeholder="Optional"></label>
      <label class="attachment-note"><span>Note or information</span><textarea name="note" maxlength="5000" placeholder="Paste details, a reference number, instructions…"></textarea></label>
    </div>
    ${planWorkError ? `<p class="plan-input-dialog__error" role="alert">${escapeHtml(planWorkError)}</p>` : ""}
    <div class="plan-input-dialog__actions"><button class="button" type="submit" ${planWorkBusy ? "disabled" : ""}>${planWorkBusy ? "Adding…" : "Add to plan"}</button><button class="text-button" type="button" data-action="close-attachment">Cancel</button></div>
  </form>
</dialog>`;

const renderStages = (manifest: SurfaceManifest, component: SurfaceZone["component"]): string => `
  ${renderPlanInputItems("timeline")}
  <ol class="stage-list stage-list--${escapeHtml(manifest.timeModel)}" aria-label="${escapeHtml(component.replaceAll("_", " "))}">
    ${manifest.stages.map((stage) => {
      const direct = [...planInputsFor("timeline", stage.stageId)].reverse().find((item) => item.mode === "direct") ?? null;
      const decided = direct?.kind === "decision";
      const checklist = checklistForStage(stage.stageId);
      const completed = checklist?.status === "done";
      return `
      <li class="stage stage--${escapeHtml(completed ? "complete" : stage.status)}">
        <span class="stage__marker">${escapeHtml(completed ? "Completed" : decided ? "Chosen" : direct ? "Updated" : stage.marker)}</span>
        <div><strong>${escapeHtml(stage.label)}</strong><span>${escapeHtml(stage.detail)}</span></div>
        <div class="stage__actions">${checklist ? `<label class="stage__check"><input type="checkbox" data-action="toggle-checklist" data-checklist-id="${escapeHtml(checklist.itemId)}" ${completed ? "checked" : ""} ${planWorkBusy ? "disabled" : ""}><span>${completed ? "Completed" : "Mark complete"}</span></label>` : `<small>${escapeHtml(decided ? "chosen" : direct ? "updated" : stage.status)}</small>`}${pendingBadge("timeline", stage.stageId)}<button type="button" data-action="open-plan-input" data-plan-input-section="timeline" data-plan-input-context="${escapeHtml(stage.stageId)}" data-plan-input-label="${escapeHtml(stage.label)}">Add or change</button><button type="button" data-action="open-attachment" data-attachment-section="timeline" data-attachment-context="${escapeHtml(stage.stageId)}" data-attachment-label="${escapeHtml(stage.label)}">Attach</button></div>
        <div class="stage__inputs">${renderPlanInputItems("timeline", stage.stageId)}${renderAttachmentItems(attachmentsFor("timeline", stage.stageId), true)}</div>
      </li>`;
    }).join("")}
  </ol>`;

const renderNextStep = (manifest: SurfaceManifest): string => {
  const unresolved = (stage: SurfaceManifest["stages"][number]): boolean => {
    const checklist = checklistForStage(stage.stageId);
    return checklist ? checklist.status !== "done" : !planInputsFor("timeline", stage.stageId).some((item) => item.mode === "direct" && item.kind === "decision");
  };
  const next = manifest.stages.find((stage) => stage.status !== "complete" && unresolved(stage))
    ?? manifest.stages.find((stage) => unresolved(stage));
  const timeline = manifest.zones.find((zone) => stageComponents.has(zone.component));
  if (!next) {
    const finished = runtime.kernel.lifecycleStatus === "completed";
    return `<section class="managing-next managing-next--complete" aria-labelledby="managing_next_title">
      <div><p class="eyebrow">${finished ? "Plan complete" : "Current list"}</p><span class="managing-next__marker">${finished ? "Finished" : "All done"}</span></div>
      <div><h2 id="managing_next_title">${finished ? "This plan is finished." : "Everything is ticked off."}</h2><p>${finished ? "Your plan, decisions, files and history are still here." : "Reopen anything that still needs work, add another task, or wrap up this plan when the outcome has actually happened."}</p></div>
      <div class="managing-next__actions"><a href="#plan_work">Review the list ↑</a><a href="#plan_status">${finished ? "Reopen this plan ↓" : "Wrap up this plan ↓"}</a></div>
    </section>`;
  }
  const direct = [...planInputsFor("timeline", next.stageId)].reverse().find((item) => item.mode === "direct") ?? null;
  const chosen = direct?.kind === "decision";
  return `<section class="managing-next" aria-labelledby="managing_next_title">
    <div><p class="eyebrow">Up next ${pendingBadge("timeline", next.stageId)}</p><span class="managing-next__marker">${escapeHtml(chosen ? "Chosen" : direct ? "Updated" : next.marker)}</span></div>
    <div><h2 id="managing_next_title">${escapeHtml(next.label)}</h2><p>${escapeHtml(direct?.message ?? next.detail)}</p></div>
    <div class="managing-next__actions">${timeline ? `<button type="button" data-action="open-managing-zone" data-zone-id="${escapeHtml(timeline.zoneId)}">See the full plan ↓</button>` : ""}${direct ? `<button type="button" data-action="edit-plan-input" data-plan-input-id="${escapeHtml(direct.inputId)}">Change</button>` : `<button type="button" data-action="open-plan-input" data-plan-input-section="timeline" data-plan-input-context="${escapeHtml(next.stageId)}" data-plan-input-label="${escapeHtml(next.label)}">Add or change</button>`}</div>
  </section>`;
};

const renderPlanInputDialog = (): string => {
  const editing = planInputEditingId ? planInputs.find((item) => item.inputId === planInputEditingId) ?? null : null;
  const kind = editing?.kind ?? "decision";
  const section = editing?.section ?? planInputContext.section;
  const messageValue = editing?.message ?? "";
  return `<dialog class="plan-input-dialog" aria-labelledby="plan_input_title">
  <button type="button" class="dialog-close" data-action="close-plan-input" aria-label="Close">×</button>
  <form data-plan-input-form data-plan-input-id="${escapeHtml(editing?.inputId ?? "")}">
    <header><p class="eyebrow">${editing ? "Change this item" : "Add to this plan"}</p><h2 id="plan_input_title">Decision, update, or question</h2></header>
    <div class="plan-input-dialog__fields">
      <label><span>What is this?</span><select name="kind"><option value="decision" ${kind === "decision" ? "selected" : ""}>A decision</option><option value="update" ${kind === "update" ? "selected" : ""}>An update</option><option value="question" ${kind === "question" ? "selected" : ""}>A question</option></select></label>
      <label><span>Where does it belong?</span><select name="section">
        <option value="general" ${section === "general" ? "selected" : ""}>Whole plan</option>
        <option value="timeline" ${section === "timeline" ? "selected" : ""}>Timeline${section === "timeline" && planInputContext.contextLabel ? ` · ${escapeHtml(planInputContext.contextLabel)}` : editing?.contextLabel ? ` · ${escapeHtml(editing.contextLabel)}` : ""}</option>
        <option value="money" ${section === "money" ? "selected" : ""}>Money</option>
        <option value="boundaries" ${section === "boundaries" ? "selected" : ""}>Boundaries</option>
      </select></label>
      <label class="plan-input-dialog__message"><span>What should the plan say?</span><textarea name="message" required maxlength="2000" placeholder="For example: We decided on Monday 12 October.">${escapeHtml(messageValue)}</textarea></label>
    </div>
    ${planInputError ? `<p class="plan-input-dialog__error" role="alert">${escapeHtml(planInputError)}</p>` : ""}
    <div class="plan-input-dialog__actions"><button class="button" type="submit" name="mode" value="direct" ${planInputBusy ? "disabled" : ""}>${planInputBusy ? "Saving…" : "Save to plan"}</button><button class="button button--secondary" type="submit" name="mode" value="codex" ${planInputBusy ? "disabled" : ""}>Ask ${escapeHtml(agenticName())} to update</button><button class="text-button" type="button" data-action="close-plan-input">Cancel</button></div>
  </form>
</dialog>`;
};

const currentEditablePlanFacts = (): EditablePlanFact[] => editablePlanFacts(runtime.kernel.profile, runtime.kernel.accepted, runtime.kernel.entities);

const formatPlanFactValue = (fact: EditablePlanFact): string => fact.format === "money" ? money(fact.value)
  : fact.format === "days" ? `${fact.value} days`
    : String(fact.value);

const renderPlanFactDialog = (): string => {
  const facts = currentEditablePlanFacts();
  return `<dialog class="plan-fact-dialog" aria-labelledby="plan_fact_title">
    <button type="button" class="dialog-close" data-action="close-plan-facts" aria-label="Close">×</button>
    <form data-plan-fact-form>
      <header><p class="eyebrow">Plan details</p><h2 id="plan_fact_title">Change the numbers</h2></header>
      <div class="plan-fact-dialog__fields">${facts.map((fact) => {
        const moneyFact = fact.format === "money";
        const value = moneyFact ? fact.value / 100 : fact.value;
        const minimum = moneyFact ? fact.minimum / 100 : fact.minimum;
        const maximum = fact.maximum === null ? "" : String(moneyFact ? fact.maximum / 100 : fact.maximum);
        return `<label><span>${escapeHtml(fact.label)}</span><div class="plan-fact-input">${moneyFact ? `<span aria-hidden="true">$</span>` : ""}<input type="number" inputmode="${moneyFact ? "decimal" : "numeric"}" name="${escapeHtml(fact.factId)}" value="${escapeHtml(value)}" min="${escapeHtml(minimum)}" ${maximum ? `max="${escapeHtml(maximum)}"` : ""} step="${moneyFact ? "0.01" : escapeHtml(fact.step)}" required></div></label>`;
      }).join("")}</div>
      <div class="plan-fact-dialog__calculation"><span>Available after assigned costs</span><output data-plan-fact-available>${money(runtime.kernel.accepted.bufferMinor)}</output></div>
      ${planFactError ? `<p class="plan-input-dialog__error" role="alert">${escapeHtml(planFactError)}</p>` : ""}
      <div class="plan-input-dialog__actions"><button class="button" type="submit" ${planFactBusy ? "disabled" : ""}>${planFactBusy ? "Saving…" : "Save changes"}</button><button class="text-button" type="button" data-action="close-plan-facts">Cancel</button></div>
    </form>
  </dialog>`;
};

const visibleManagingZones = (manifest: SurfaceManifest): SurfaceZone[] => {
  const hiddenDuplicates = new Set<SurfaceZone["component"]>(["pressure_meter", "entity_table", "commitment_stack"]);
  if (runtime.kernel.profile.profileId === "general") hiddenDuplicates.delete("entity_table");
  const hasCurrentChange = Boolean(runtime.kernel.activeEventId);
  const priority = (zone: SurfaceZone): number => stageComponents.has(zone.component) ? 0
    : zone.component === "finite_summary" ? 1
      : zone.component === "actual_forecast" ? 2
        : zone.component === "constraint_panel" ? 3
          : zone.component === "change_tray" ? 4
            : zone.component === "option_compare" ? 5
              : zone.component === "approval_panel" ? 6 : 7;
  return manifest.zones
    .filter((zone) => !hiddenDuplicates.has(zone.component))
    .filter((zone) => zone.component !== "change_tray" || hasCurrentChange)
    .filter((zone) => zone.component !== "option_compare" || activeCandidates().length > 0)
    .sort((a, b) => priority(a) - priority(b));
};

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
        <ul>${candidateTradeoffLines(candidate).map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>
        <div class="option-card__delta"><span>Plan impact</span><strong>${candidate.netForecastDeltaMinor >= 0 ? "+" : "−"}${money(Math.abs(candidate.netForecastDeltaMinor))}</strong></div>
        ${candidate.valid
          ? `<button class="button button--choose" data-action="choose" data-candidate="${escapeHtml(candidate.candidateId)}">Choose this ${escapeHtml(runtime.kernel.profile.surface.nouns.option)}</button>`
          : `<p class="refusal">${escapeHtml(candidate.violations.map((violation) => violationMessage(violation.code)).join(" "))}</p>`}
      </article>`).join("")}
  </div>`;
};

const renderLifecycleControl = (): string => {
  const kernel = runtime.kernel;
  const pending = kernel.pendingLifecycleChange;
  const latest = kernel.lifecycleEvents.at(-1);
  if (pending) {
    const confirmed = kernel.lifecycleConfirmation?.targetId === pending.lifecycleChangeId;
    const completing = pending.after === "completed";
    return `<section class="lifecycle-control lifecycle-control--pending" id="plan_status" aria-label="Plan status confirmation">
    <div><p class="eyebrow">${completing ? "Finish plan" : "Plan status"}</p><h2>${completing ? "Finish this plan?" : `Mark this plan ${escapeHtml(pending.after)}?`}</h2><p>${escapeHtml(pending.reason)}</p></div>
    <div class="lifecycle-control__actions"><span>Current: ${escapeHtml(pending.before)}</span>${confirmed ? `<p class="quiet">Saving this status…</p>` : `<button class="button ${completing ? "button--finish" : ""}" type="button" data-action="confirm-lifecycle" data-lifecycle="${escapeHtml(pending.lifecycleChangeId)}">${completing ? "Yes, finish the plan" : "Confirm this status"}</button><button class="text-button" type="button" data-action="cancel-lifecycle">${completing ? "Not yet" : `Keep plan ${escapeHtml(pending.before)}`}</button>`}</div>
  </section>`;
  }
  const inactive = kernel.lifecycleStatus !== "active";
  if (!inactive) return `<section class="plan-status-entry" id="plan_status" aria-labelledby="plan_status_heading">
    <div><p class="eyebrow">Plan status</p><h2 id="plan_status_heading">Still managing this plan</h2><p>When the real outcome has happened, finish it. You can also pause or stop active work.</p></div>
    <button class="button button--secondary" type="button" data-action="open-plan-status">Finish or pause</button>
  </section>`;
  return `<details class="lifecycle-control ${inactive ? "lifecycle-control--inactive" : ""}" id="plan_status" ${inactive ? "open" : ""}>
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

const renderPlanStatusDialog = (): string => runtime.kernel.lifecycleStatus !== "active" ? "" : `<dialog class="plan-status-dialog" data-plan-status-dialog aria-labelledby="plan_status_dialog_title">
  <button type="button" class="dialog-close" data-action="close-plan-status" aria-label="Close plan status">×</button>
  <header><p class="eyebrow">Plan status</p><h2 id="plan_status_dialog_title">Finish or pause this plan</h2><p>You are currently in <strong>Managing</strong>. Finite only moves to the finished summary after you finish the plan here.</p></header>
  <form class="plan-finish__form" data-plan-lifecycle data-plan-complete>
    <input type="hidden" name="status" value="completed">
    <label><span>Closing note <small>optional</small></span><textarea name="reason" maxlength="1000" placeholder="What happened?"></textarea></label>
    <button class="button button--finish" type="submit" ${busy ? "disabled" : ""}>Finish plan and open summary</button>
  </form>
  <details class="plan-finish__other">
    <summary>Pause or stop this plan instead</summary>
    <form data-plan-lifecycle>
      <label><span>What should happen?</span><select name="status" required><option value="">Choose one</option><option value="paused">Pause — keep it, but stop active work</option><option value="abandoned">Abandon — the outcome is no longer being pursued</option></select></label>
      <label><span>Why?</span><textarea name="reason" required maxlength="1000" placeholder="Why is the plan changing status?"></textarea></label>
      <button class="button" type="submit" ${busy ? "disabled" : ""}>Review this change</button>
    </form>
  </details>
</dialog>`;

const renderHumanRealityControl = (): string => {
  const kernel = runtime.kernel;
  if (kernel.pendingPlanFactChange) {
    const pending = kernel.pendingPlanFactChange;
    return `<section class="zone zone--approval_panel lifecycle-control" aria-label="Plan detail review"><div class="zone__heading"><p class="eyebrow">Plan details</p><h2>Save these changes?</h2></div><div class="approval-copy"><div class="plan-fact-review">${pending.changes.map((change) => `<div><span>${escapeHtml(change.label)}</span><strong>${change.format === "money" ? `${money(change.before)} → ${money(change.after)}` : `${escapeHtml(change.before)} → ${escapeHtml(change.after)}`}</strong></div>`).join("")}</div><button class="button button--approve" type="button" data-action="confirm-plan-facts" data-plan-fact-change="${escapeHtml(pending.planFactChangeId)}">Save changes</button><button class="text-button" type="button" data-action="cancel-plan-facts">Cancel</button></div></section>`;
  }
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

const humanPlanLabel = (value: string): string => {
  const label = value.replaceAll("_", " ").trim();
  return label ? `${label.charAt(0).toUpperCase()}${label.slice(1)}` : "";
};

const renderPlanDraftContent = (profile: ProfileDefinition): string => {
  const { accepted, surface } = profile;
  const moneyState = profile.planningDimensions?.money ?? "positive";
  const moneyApplies = moneyState === "positive";
  const guestCount = profile.entities.guest_headcount?.values.count;
  const committedMinor = accepted.spentMinor + accepted.committedMinor;
  const allocationAssumptions = (surface.assumptions ?? []).filter((assumption) => assumption.path.startsWith("allocation."));
  const otherAssumptions = (surface.assumptions ?? []).filter((assumption) => !assumption.path.startsWith("allocation."));
  const openDependencies = (surface.dependencies ?? []).filter((dependency) => dependency.status === "open");
  const stillOpen = [
    ...(allocationAssumptions.length
      ? [committedMinor === 0 && accepted.forecastMinor === 0
        ? `No costs have been added yet. The full ${money(accepted.bufferMinor)} remains available until purchases are added.`
        : `${money(accepted.bufferMinor)} is still available after recorded costs and forecasts.`]
      : []),
    ...otherAssumptions.map((assumption) => assumption.path === "entityValues.venue.capacity"
      ? `Plan for space for ${assumption.value} people. The location can be decided later.`
      : assumption.basis),
    ...openDependencies.map((dependency) => dependency.detail || dependency.title),
  ];
  const protections = [...profile.locks, ...profile.preferenceLabels]
    .map(humanPlanLabel)
    .filter((label, index, labels) => label && labels.indexOf(label) === index);

  return `<div class="draft-review__content">
    <dl class="draft-review__summary" aria-label="Plan at a glance">
      ${moneyApplies ? `<div><dt>Total limit</dt><dd>${money(accepted.totalBudgetMinor)}</dd></div>` : `<div><dt>Paid budget</dt><dd>${moneyState === "zero" ? money(0) : moneyState === "not_applicable" ? "Not part of this plan" : "Not decided"}</dd></div>`}
      ${Number.isFinite(guestCount) ? `<div><dt>Guests</dt><dd>${escapeHtml(guestCount)}</dd></div>` : ""}
      ${moneyApplies ? `<div><dt>Already committed</dt><dd>${money(committedMinor)}</dd></div><div><dt>Available to plan</dt><dd>${money(accepted.bufferMinor)}</dd></div>` : `<div><dt>Plan stages</dt><dd>${surface.stages.length}</dd></div><div><dt>Open dependencies</dt><dd>${openDependencies.length}</dd></div>`}
    </dl>
    <section class="draft-review__section draft-review__plan" aria-labelledby="draft_plan_steps">
      <div class="draft-review__section-heading"><p class="eyebrow">The plan</p><h3 id="draft_plan_steps">What happens next</h3></div>
      <ol class="draft-review__stages">${surface.stages.map((stage) => `<li><span class="draft-review__marker">${escapeHtml(stage.marker)}</span><div><strong>${escapeHtml(stage.label)}</strong><p>${escapeHtml(stage.detail)}</p></div><small>${escapeHtml(humanPlanLabel(stage.status))}</small></li>`).join("")}</ol>
    </section>
    ${protections.length ? `<section class="draft-review__section" aria-labelledby="draft_plan_protects"><div class="draft-review__section-heading"><p class="eyebrow">What it protects</p><h3 id="draft_plan_protects">The things that should stay true</h3></div><ul class="draft-review__chips">${protections.map((label) => `<li>${escapeHtml(label)}</li>`).join("")}</ul></section>` : ""}
    ${stillOpen.length ? `<section class="draft-review__section" aria-labelledby="draft_plan_open"><div class="draft-review__section-heading"><p class="eyebrow">Still open</p><h3 id="draft_plan_open">Things you can decide later</h3></div><ul class="draft-review__open-list">${stillOpen.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>` : ""}
  </div>`;
};

const renderPlanDraft = (): string => {
  const draft = runtime.pendingPlanDraft;
  const returned = runtime.returnedConstructionReview;
  if (!draft && !returned) return "";
  if (!draft && returned && returned.packet.kind === "draft") {
    const profile = returned.packet.payload.profile;
    const feedback = returned.feedbackRequired ? `<form class="draft-return-form" data-plan-return="legacy" data-packet="${escapeHtml(returned.packetId)}">
      <div><p class="eyebrow">Help ${escapeHtml(agenticName())} revise it</p><h3>What wasn’t right about this plan?</h3><p>Your answer will shape the next version.</p></div>
      <label><span>What kind of change?</span><select name="reasonCode" required><option value="">Choose one</option><option value="assumptions">Wrong assumptions</option><option value="structure">Wrong structure or emphasis</option><option value="missing">Something important is missing</option><option value="too_rigid">Too rigid or decided too early</option><option value="too_vague">Too vague to be useful</option><option value="other">Something else</option></select></label>
      <label><span>Tell Codex what should change</span><textarea name="reason" required maxlength="1000" placeholder="For example: this feels like a budget shell, not the living trip plan I expected."></textarea></label>
      <button class="button" type="submit" ${busy ? "disabled" : ""}>Send back for revision</button>
    </form>` : `<div class="draft-returned-copy"><span>Changes requested</span><strong>${escapeHtml(returned.reasonCode?.replaceAll("_", " ") ?? "Revision requested")}</strong><p>${escapeHtml(returned.message)}</p><button class="button" type="button" data-action="open-codex-handoff">Hand off this revision to Codex</button></div>`;
    return `<section class="zone zone--approval_panel plan-intake plan-intake--returned draft-review" aria-label="Plan changes requested">
      <div class="zone__heading"><p class="eyebrow">Changes requested</p><h2>${escapeHtml(profile.name)}</h2><p class="draft-review__lede">Here is the plan you sent back. It will stay here while ${escapeHtml(agenticName())} prepares the next version.</p></div>
      ${renderPlanDraftContent(profile)}
      ${feedback}
      <details class="draft-discard"><summary>Start over instead</summary><p>Discard this version and begin again from what you originally asked for.</p><button class="text-button" type="button" data-action="discard-returned-draft" data-packet="${escapeHtml(returned.packetId)}">Discard this plan</button></details>
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
  const revisionReceipt = priorReview ? `<section class="draft-revision-diff" aria-label="Revision response"><div><p class="eyebrow">Revised from your returned draft</p><h3>${escapeHtml(priorReview.message)}</h3></div><div><span>Codex changed</span><strong>${escapeHtml(changedSinceReturn.join(" · ") || "the compiled plan content")}</strong></div></section>` : "";
  const orientation = arrivalResult.ok ? arrivalResult.orientation : undefined;
  if (orientation && !pendingDraftMatchesArrival()) return `<section class="zone zone--approval_panel plan-intake" aria-label="Plan update queued">
    <div class="zone__heading"><p class="eyebrow">New detail saved</p><h2>The previous draft is no longer confirmable.</h2></div>
    <div class="approval-copy"><p>You added something after this draft was made. Codex needs to prepare a new draft using your latest information before you can approve it.</p></div>
  </section>`;
  const confirmation = runtime.planActivationConfirmation;
  const confirmed = confirmation?.draftId === draft.draftId;
  const amendment = draft.amendment;
  return `<section class="zone zone--approval_panel plan-intake draft-review" aria-label="Review new plan">
    <div class="zone__heading"><p class="eyebrow">Your plan is ready</p><h2>${escapeHtml(draft.profile.name)}</h2><p class="draft-review__lede">${escapeHtml(draft.profile.surface.hero.brief)}</p></div>
    ${renderPlanDraftContent(draft.profile)}
    <div class="draft-review__actions">
      ${revisionReceipt}
      ${amendment ? `<p class="draft-review__amendment">This is an updated version of your plan. Changed: ${escapeHtml(amendment.diff.changedSections.map(humanPlanLabel).join(", "))}.</p>` : ""}
      ${planActivationError ? `<p class="draft-review__activation-error" role="alert">${escapeHtml(planActivationError)}</p>` : ""}
      ${busy
        ? `<button class="button button--approve" type="button" disabled>Starting your plan…</button>`
        : `<button class="button button--approve" data-action="confirm-plan" data-draft="${escapeHtml(draft.draftId)}">${confirmed ? "Continue to Managing" : planActivationError ? "Try again" : "Approve this plan"}</button>`}
      ${draftReturnFormOpen ? `<form class="draft-return-form" data-plan-return="current" data-draft="${escapeHtml(draft.draftId)}">
        <div><p class="eyebrow">Request changes</p><h3>What should be different?</h3><p>The plan will stay here while you explain what you want changed.</p></div>
        <label><span>What kind of change?</span><select name="reasonCode" required><option value="">Choose one</option><option value="assumptions">Wrong assumptions</option><option value="structure">Wrong structure or emphasis</option><option value="missing">Something important is missing</option><option value="too_rigid">Too rigid or decided too early</option><option value="too_vague">Too vague to be useful</option><option value="other">Something else</option></select></label>
        <label><span>Tell ${escapeHtml(agenticName())} what should change</span><textarea name="reason" required maxlength="1000" placeholder="Say what you expected to receive instead."></textarea></label>
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
  if (zone.component === "finite_summary") {
    const facts = currentEditablePlanFacts();
    body = `<div class="plan-detail-grid">
      ${facts.map((fact) => `<button type="button" class="plan-detail plan-detail--editable" data-action="open-plan-facts"><span>${escapeHtml(fact.label)}</span><strong>${escapeHtml(formatPlanFactValue(fact))}</strong><small>Change</small></button>`).join("")}
      <div class="plan-detail"><span>Spent</span><strong>${money(kernel.accepted.spentMinor)}</strong></div>
      <div class="plan-detail"><span>Committed</span><strong>${money(kernel.accepted.committedMinor)}</strong></div>
      <div class="plan-detail plan-detail--available"><span>Available</span><strong>${money(kernel.accepted.bufferMinor)}</strong></div>
    </div>`;
  }
  else if (zone.component === "entity_table") body = `<div class="measure-grid">${formatBinding(zone)}</div>`;
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
  const inputSection: PlanInputSection | null = zone.component === "finite_summary" ? "money" : zone.component === "constraint_panel" ? "boundaries" : null;
  const timelineSection = stageComponents.has(zone.component);
  const zoneTitle = zone.component === "finite_summary" ? "Plan details" : zone.title;
  const structuredEdit = zone.component === "finite_summary" ? `<button type="button" data-action="open-plan-facts">Edit numbers</button>` : "";
  const hasPending = inputSection
    ? planInputsFor(inputSection).some((item) => item.mode === "codex" && item.baseCurrent)
    : timelineSection ? planInputsFor("timeline").some((item) => item.mode === "codex" && item.baseCurrent) : false;
  const opened = openManagingZones.has(zone.zoneId) || hasPending;
  return `<section class="zone zone--collapsible zone--${escapeHtml(zone.component)}" id="${escapeHtml(zone.zoneId)}"><details data-managing-zone data-zone-id="${escapeHtml(zone.zoneId)}" ${opened ? "open" : ""}>
    <summary class="zone__summary"><h2>${escapeHtml(zoneTitle)} ${inputSection ? pendingBadge(inputSection) : timelineSection ? pendingBadge("timeline") : ""}</h2><span>${opened ? "Close section" : "Open section"}</span></summary>
    <div class="zone__content"><div class="zone__heading-actions">${structuredEdit}${inputSection ? `<button type="button" data-action="open-plan-input" data-plan-input-section="${inputSection}">+ Add or change</button>` : ""}</div>${body}${inputSection ? renderPlanInputItems(inputSection) : ""}</div>
  </details></section>`;
};

const renderWrapUpAttachments = (): string => `<div class="wrap-up-references">${planAttachments.map((item) => `<article class="wrap-up-reference">
  ${item.kind === "image" && item.contentUrl ? `<a class="wrap-up-reference__thumb" href="${escapeHtml(item.contentUrl)}" target="_blank" rel="noopener"><img src="${escapeHtml(item.contentUrl)}" alt=""></a>` : `<span class="wrap-up-reference__icon" aria-hidden="true">${item.kind === "link" ? "↗" : item.kind === "note" ? "≡" : "↓"}</span>`}
  <div><span>${escapeHtml(attachmentKindLabel(item.kind))}${item.contextLabel ? ` · ${escapeHtml(item.contextLabel)}` : ""}</span>${item.linkUrl ? `<a href="${escapeHtml(item.linkUrl)}" target="_blank" rel="noopener">${escapeHtml(item.label)}</a>` : item.contentUrl ? `<a href="${escapeHtml(item.contentUrl)}" target="_blank" rel="noopener">${escapeHtml(item.label)}</a>` : `<strong>${escapeHtml(item.label)}</strong>`}${item.noteText ? `<p>${escapeHtml(item.noteText)}</p>` : ""}</div>
</article>`).join("")}</div>`;

const profileMemoryKindLabel = (kind: ProfileMemoryKind): string => ({
  preference: "Preference",
  interest: "Interest",
  constraint: "Constraint",
  working_pattern: "Working pattern",
  avoid: "Avoid next time",
})[kind];

const renderPlanLessons = (): string => {
  const retrospective = planRetrospective ?? emptyRetrospective(runtime.kernel.profile.planId, runtime.kernel.revision);
  const memories = profileMemories.filter((memory) => memory.sourcePlanId === runtime.kernel.profile.planId && memory.status !== "rejected" && memory.status !== "retired");
  const proposed = memories.filter((memory) => memory.status === "proposed");
  const accepted = memories.filter((memory) => memory.status === "accepted");
  const notes = [retrospective.worked, retrospective.changed, retrospective.nextTime].filter(Boolean).length;
  const total = notes + memories.length;
  if (!secondaryPlanDataReady) return `<details class="wrap-up-section wrap-up-lessons" aria-labelledby="wrap_lessons_title"><summary class="wrap-up-section__summary"><div><p class="eyebrow">After the plan</p><h2 id="wrap_lessons_title">Lessons learned</h2></div><span>Loading…</span></summary></details>`;
  return `<details class="wrap-up-section wrap-up-lessons" aria-labelledby="wrap_lessons_title" data-plan-lessons ${lessonsOpen ? "open" : ""}>
    <summary class="wrap-up-section__summary"><div><p class="eyebrow">After the plan</p><h2 id="wrap_lessons_title">Lessons learned</h2></div><span>${proposed.length ? `${proposed.length} to review` : total ? `${total} saved` : "Add reflection"}</span></summary>
    <div class="wrap-up-lessons__intro"><p>Keep what happened with this plan. Decide separately what Finite may carry into later plans.</p>${planLearningError ? `<p class="form-error" role="alert">${escapeHtml(planLearningError)}</p>` : ""}</div>
    <form class="wrap-up-retrospective" data-plan-retrospective>
      <label><span>What worked</span><textarea name="worked" maxlength="2000" placeholder="What would you repeat?">${escapeHtml(retrospective.worked)}</textarea></label>
      <label><span>What changed</span><textarea name="changed" maxlength="2000" placeholder="What happened differently from the plan?">${escapeHtml(retrospective.changed)}</textarea></label>
      <label><span>Next time</span><textarea name="nextTime" maxlength="2000" placeholder="What would you do differently?">${escapeHtml(retrospective.nextTime)}</textarea></label>
      <button class="button button--secondary" type="submit" ${planLearningBusy ? "disabled" : ""}>${planLearningBusy ? "Saving…" : "Save to this plan"}</button>
    </form>
    <section class="profile-memory-review" aria-labelledby="carry_forward_title">
      <header><div><p class="eyebrow">Across plans</p><h3 id="carry_forward_title">Things to carry forward</h3></div><p>Only accepted items become reusable. Finite keeps the evidence with each one.</p></header>
      ${proposed.length ? `<div class="profile-memory-list profile-memory-list--proposed"><h4>Suggestions to review</h4>${proposed.map((memory) => `<form data-memory-decision class="profile-memory-card is-proposed"><input type="hidden" name="memoryId" value="${escapeHtml(memory.memoryId)}"><span>${escapeHtml(profileMemoryKindLabel(memory.kind))} · Suggested by ${escapeHtml(agenticName())}</span><input name="statement" maxlength="500" value="${escapeHtml(memory.statement)}" aria-label="Edit suggested memory"><p><b>Based on</b> ${escapeHtml(memory.evidence)}</p><div><button class="button button--secondary" name="status" value="accepted" type="submit">Remember this</button><button class="text-button" name="status" value="rejected" type="submit">Don’t use this</button></div></form>`).join("")}</div>` : ""}
      ${accepted.length ? `<div class="profile-memory-list"><h4>Saved from this plan</h4>${accepted.map((memory) => `<article class="profile-memory-card is-accepted"><span>${escapeHtml(profileMemoryKindLabel(memory.kind))} · Accepted</span><strong>${escapeHtml(memory.statement)}</strong><p><b>Based on</b> ${escapeHtml(memory.evidence)}</p></article>`).join("")}</div>` : ""}
      <form class="profile-memory-add" data-memory-add>
        <div><label><span>Remember something yourself</span><input name="statement" maxlength="500" placeholder="e.g. I enjoy cooking together before dinner" required></label><label><span>Type</span><select name="kind"><option value="preference">Preference</option><option value="interest">Interest</option><option value="constraint">Constraint</option><option value="working_pattern">Working pattern</option><option value="avoid">Avoid next time</option></select></label></div>
        <input type="hidden" name="evidence" value="Added by you after ${escapeHtml(resolvePlanTitle({ proposed: projectAcceptedPlanCopy(runtime.kernel.profile.name, runtime.kernel), brief: projectAcceptedPlanCopy(runtime.kernel.profile.surface.hero.brief, runtime.kernel) }))}.">
        <button class="button button--secondary" type="submit" ${planLearningBusy ? "disabled" : ""}>Add to future plans</button>
      </form>
    </section>
  </details>`;
};

const renderWrapUpSurface = (manifest: SurfaceManifest): string => {
  const kernel = runtime.kernel;
  const completion = [...kernel.lifecycleEvents].reverse().find((event) => event.after === "completed" && event.before !== "completed") ?? null;
  const recordedActual = [...kernel.lifecycleEvents].reverse().find((event) => event.actualSpendMinor !== undefined) ?? null;
  const facts = currentEditablePlanFacts();
  const done = checklistItems.filter((item) => item.status === "done");
  const customChecklist = checklistItems.filter((item) => item.origin !== "adaptive");
  const directInputs = planInputs.filter((item) => item.mode === "direct");
  const recordInputs = directInputs.filter((item) => item.section !== "timeline");
  const actualsState = kernel.getState(["actuals"]).state as { actuals?: Array<{ label: string; currentAmountMinor: number }> };
  const actuals = actualsState.actuals ?? [];
  const hasRecord = recordInputs.length || kernel.groupDecisionEvents.length || kernel.externalActionEvents.length;
  const pendingLifecycle = Boolean(kernel.pendingLifecycleChange);
  return `
    <div class="private-top-shell private-top-shell--wrap-up">
      <header class="site-header">
        ${renderBrand()}
        ${renderPlanSwitcher("plan", manifest.title)}
        ${renderShareHeaderAction("plan")}
        <div class="header-actions">${renderHeaderControls()}</div>
      </header>
      ${renderLifecycleRail("wrapping")}
    </div>
    <main id="main" class="wrap-up-main">
      <header class="wrap-up-hero">
        <div class="wrap-up-hero__status"><p class="eyebrow">Finished</p><span>Completed</span></div>
        <div class="wrap-up-hero__copy"><h1>${escapeHtml(manifest.title)}</h1><p>${escapeHtml(manifest.brief)}</p></div>
        <blockquote><span>What happened</span><p>${escapeHtml(completion?.reason ?? "The planned outcome happened.")}</p>${completion?.occurredAt ? `<small>Completed ${escapeHtml(new Date(completion.occurredAt).toLocaleString(undefined, { dateStyle: "long", timeStyle: "short" }))}</small>` : ""}</blockquote>
      </header>

      <section class="wrap-up-glance" aria-label="Finished plan at a glance">
        <div><span>Status</span><strong>Completed</strong></div>
        <div><span>Progress</span><strong>${secondaryPlanDataReady ? `${done.length} / ${checklistItems.length}` : "Loading…"}</strong></div>
        <div><span>Available</span><strong>${money(kernel.accepted.bufferMinor)}</strong></div>
        <div><span>Actual spend</span><strong>${recordedActual?.actualSpendMinor === undefined || recordedActual.actualSpendMinor === null ? "Not recorded" : money(recordedActual.actualSpendMinor)}</strong></div>
      </section>

      <details class="wrap-up-section" aria-labelledby="wrap_facts_title">
        <summary class="wrap-up-section__summary"><div><p class="eyebrow">Final position</p><h2 id="wrap_facts_title">The plan at finish</h2></div><span>Revision ${kernel.revision}</span></summary>
        <div class="wrap-up-facts">
          ${facts.map((fact) => `<div><span>${escapeHtml(fact.label)}</span><strong>${escapeHtml(formatPlanFactValue(fact))}</strong></div>`).join("")}
          <div><span>Planned as spent</span><strong>${money(kernel.accepted.spentMinor)}</strong></div>
          <div><span>Committed</span><strong>${money(kernel.accepted.committedMinor)}</strong></div>
          <div class="is-available"><span>Available</span><strong>${money(kernel.accepted.bufferMinor)}</strong></div>
          <div class="is-actual"><span>Actual spend</span><strong>${recordedActual?.actualSpendMinor === undefined || recordedActual.actualSpendMinor === null ? "Not recorded" : money(recordedActual.actualSpendMinor)}</strong></div>
        </div>
        ${actuals.length ? `<div class="wrap-up-actuals"><h3>Actual and forecast</h3>${actuals.map((actual) => `<div><span>${escapeHtml(actual.label)}</span><strong>${money(actual.currentAmountMinor)}</strong></div>`).join("")}</div>` : ""}
      </details>

      <details class="wrap-up-section" aria-labelledby="wrap_progress_title">
        <summary class="wrap-up-section__summary"><div><p class="eyebrow">Progress</p><h2 id="wrap_progress_title">${secondaryPlanDataReady ? `${done.length} of ${checklistItems.length} items finished` : "Loading finished items…"}</h2></div><span>${secondaryPlanDataReady ? checklistItems.length && done.length === checklistItems.length ? "All done" : `${checklistItems.length - done.length} left open` : "Please wait"}</span></summary>
        ${customChecklist.length ? `<h3>Other tasks</h3><ul class="wrap-up-checklist">${customChecklist.map((item) => `<li class="${item.status === "done" ? "is-done" : "is-open"}"><span aria-hidden="true">${item.status === "done" ? "✓" : "○"}</span><div><strong>${escapeHtml(item.label)}</strong>${item.contextLabel ? `<small>${escapeHtml(item.contextLabel)}</small>` : ""}</div><em>${item.status === "done" ? "Done" : "Not completed"}</em></li>`).join("")}</ul>` : ""}
      </details>

      <details class="wrap-up-section" aria-labelledby="wrap_journey_title">
        <summary class="wrap-up-section__summary"><div><p class="eyebrow">Plan journey</p><h2 id="wrap_journey_title">How it came together</h2></div><span>${manifest.stages.length} stages</span></summary>
        <ol class="wrap-up-journey">${manifest.stages.map((stage, index) => {
          const checklist = checklistForStage(stage.stageId);
          const stageInputs = directInputs.filter((item) => item.section === "timeline" && item.contextId === stage.stageId);
          return `<li><span>${index + 1}</span><div><h3>${escapeHtml(stage.label)}</h3><p>${escapeHtml(stage.detail)}</p>${stageInputs.map((item) => `<blockquote><strong>${escapeHtml(planInputKindLabel(item.kind))}</strong><p>${escapeHtml(item.message)}</p></blockquote>`).join("")}</div><em>${checklist?.status === "done" || stage.status === "complete" ? "Done" : "Open"}</em></li>`;
        }).join("")}</ol>
      </details>

      ${hasRecord ? `<details class="wrap-up-section" aria-labelledby="wrap_record_title"><summary class="wrap-up-section__summary"><div><p class="eyebrow">Plan record</p><h2 id="wrap_record_title">Decisions and updates</h2></div><span>${recordInputs.length + kernel.groupDecisionEvents.length + kernel.externalActionEvents.length}</span></summary><div class="wrap-up-record">
        ${recordInputs.map((item) => `<article><span>${escapeHtml(planInputKindLabel(item.kind))}${item.contextLabel ? ` · ${escapeHtml(item.contextLabel)}` : ""}</span><p>${escapeHtml(item.message)}</p></article>`).join("")}
        ${kernel.groupDecisionEvents.map((item) => `<article><span>Group decision</span><strong>${escapeHtml(item.question)}</strong><p>${escapeHtml(item.resolvedOutcome)}</p></article>`).join("")}
        ${kernel.externalActionEvents.map((item) => `<article><span>Real-world status</span><strong>${escapeHtml(item.label)} · ${escapeHtml(item.after)}</strong><p>${escapeHtml(item.reason)}</p></article>`).join("")}
      </div></details>` : ""}

      ${planAttachments.length ? `<details class="wrap-up-section" aria-labelledby="wrap_refs_title"><summary class="wrap-up-section__summary"><div><p class="eyebrow">Kept with this plan</p><h2 id="wrap_refs_title">Files, links and notes</h2></div><span>${planAttachments.length}</span></summary>${renderWrapUpAttachments()}</details>` : ""}

      ${renderPlanLessons()}

      ${pendingLifecycle ? renderLifecycleControl() : `<section class="wrap-up-next" id="plan_status" aria-labelledby="wrap_next_title"><div><p class="eyebrow">Keep going</p><h2 id="wrap_next_title">What would you like to do next?</h2><p>Share a read-only summary, begin something new, or reopen this plan if the outcome needs more work.</p></div><div class="wrap-up-next__actions"><button class="button" type="button" data-action="open-plan-share" data-share-context="plan">Share this summary</button><button class="button button--secondary" type="button" data-action="start-new-plan">Start another plan</button></div><form class="wrap-up-actual-form" data-plan-lifecycle data-record-actual><input type="hidden" name="status" value="completed"><label><span>${recordedActual ? "Change actual spend" : "Record actual spend"}</span><div class="plan-fact-input"><span aria-hidden="true">$</span><input name="actualSpend" type="number" inputmode="decimal" min="0" step="0.01" ${recordedActual?.actualSpendMinor !== undefined && recordedActual.actualSpendMinor !== null ? `value="${recordedActual.actualSpendMinor / 100}"` : ""} required></div></label><input type="hidden" name="reason" value="Actual spend recorded after completion."><button class="button button--secondary" type="submit">Save actual</button></form><details><summary>Reopen this plan</summary><form data-plan-lifecycle><input type="hidden" name="status" value="active"><label><span>Why are you reopening it?</span><textarea name="reason" required maxlength="1000" placeholder="What still needs work?"></textarea></label><button class="button" type="submit">Review reopening</button></form></details></section>`}
    </main>
    <footer><p>This summary comes from the plan you completed.</p><span>Finite plan · revision ${kernel.revision}</span></footer>
    ${renderPlanShareDialog()}
    ${renderKitchenResetDialog()}
    ${renderThemeSettingsDialog()}`;
};

const profileKindOptions = (selected: ProfileMemoryKind): string => ([
  ["preference", "Preference"],
  ["interest", "Interest"],
  ["constraint", "Constraint"],
  ["working_pattern", "Working pattern"],
  ["avoid", "Avoid next time"],
] as Array<[ProfileMemoryKind, string]>).map(([value, label]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`).join("");

const profileMemorySourceLabel = (memory: ProfileMemory): string => {
  if (memory.sourcePlanId === "profile") return "Added directly in About you";
  return `From ${planDisplayNames.get(memory.sourcePlanId) ?? "an earlier plan"}`;
};

const renderProfileMemoryEditor = (memory: ProfileMemory): string => {
  const proposed = memory.status === "proposed";
  return `<form class="about-memory-card ${proposed ? "is-proposed" : "is-accepted"}" data-profile-memory-change>
    <input type="hidden" name="memoryId" value="${escapeHtml(memory.memoryId)}">
    <input type="hidden" name="expectedUpdatedAt" value="${escapeHtml(memory.updatedAt)}">
    <header><span>${escapeHtml(profileMemoryKindLabel(memory.kind))}</span><em>${proposed ? `Suggested by ${escapeHtml(agenticName())}` : "Remembered"}</em></header>
    <label><span>${proposed ? "Review the wording" : "What Finite remembers"}</span><input name="statement" maxlength="500" value="${escapeHtml(memory.statement)}" required></label>
    <label class="about-memory-card__kind"><span>Type</span><select name="kind">${profileKindOptions(memory.kind)}</select></label>
    <div class="about-memory-card__evidence"><span>Why this exists</span><p>${escapeHtml(memory.evidence)}</p><small>${escapeHtml(profileMemorySourceLabel(memory))}</small></div>
    <footer>${proposed
      ? `<button class="button button--secondary" type="submit" name="action" value="accept">Remember this</button><button class="text-button" type="submit" name="action" value="reject">Don’t use this</button>`
      : `<button class="button button--secondary" type="submit" name="action" value="update">Save changes</button><button class="text-button" type="submit" name="action" value="retire">Stop using</button><button class="text-button about-memory-card__delete" type="submit" name="action" value="delete">Delete</button>`}</footer>
  </form>`;
};

const renderInactiveProfileMemory = (memory: ProfileMemory): string => `<form class="about-memory-row" data-profile-memory-change>
  <input type="hidden" name="memoryId" value="${escapeHtml(memory.memoryId)}">
  <input type="hidden" name="expectedUpdatedAt" value="${escapeHtml(memory.updatedAt)}">
  <input type="hidden" name="statement" value="${escapeHtml(memory.statement)}">
  <input type="hidden" name="kind" value="${escapeHtml(memory.kind)}">
  <div><span>${memory.status === "rejected" ? "Not used" : "Retired"} · ${escapeHtml(profileMemoryKindLabel(memory.kind))}</span><strong>${escapeHtml(memory.statement)}</strong><small>${escapeHtml(profileMemorySourceLabel(memory))}</small></div>
  <footer><button class="text-button" type="submit" name="action" value="restore">Use again</button><button class="text-button about-memory-card__delete" type="submit" name="action" value="delete">Delete</button></footer>
</form>`;

const aboutReturnPath = (): string => {
  const target = new URL(location.href);
  target.searchParams.delete("about");
  return `${target.pathname}${target.search}${target.hash}`;
};

function renderAboutYou(): void {
  const canPersist = authSession.kind === "account";
  const accepted = profileMemories.filter((memory) => memory.status === "accepted");
  const proposed = profileMemories.filter((memory) => memory.status === "proposed");
  const inactive = profileMemories.filter((memory) => memory.status === "rejected" || memory.status === "retired");
  surfaceRoot.dataset.profile = "about-you";
  surfaceRoot.setAttribute("aria-busy", String(profilePageBusy));
  surfaceRoot.innerHTML = `
    <div class="private-top-shell private-top-shell--settings">
      <header class="site-header settings-header">
        ${renderBrand()}
        <a class="settings-back" href="${escapeHtml(aboutReturnPath())}">← Back to plan</a>
        <div class="header-actions">${renderHeaderControls()}</div>
      </header>
    </div>
    <main id="main" class="about-main">
      <header class="about-hero"><div><p class="eyebrow">Your reusable context</p><h1>About you</h1><p>See and control what Finite may carry into later plans. Nothing here is hidden, permanent, or permission to act.</p></div><dl><div><dt>Remembered</dt><dd>${accepted.length}</dd></div><div><dt>To review</dt><dd>${proposed.length}</dd></div><div><dt>Not in use</dt><dd>${inactive.length}</dd></div></dl></header>
      ${profilePageError ? `<p class="settings-feedback is-error" role="alert">${escapeHtml(profilePageError)}</p>` : ""}
      ${profilePageMessage ? `<p class="settings-feedback is-success" role="status">${escapeHtml(profilePageMessage)}</p>` : ""}
      ${!profileContextReady ? `<section class="about-loading"><strong>Loading what Finite remembers…</strong></section>` : `
        ${proposed.length ? `<section class="about-section about-section--review" aria-labelledby="about_review_title"><header><div><p class="eyebrow">Your decision</p><h2 id="about_review_title">Suggestions to review</h2></div><p>${escapeHtml(agenticName())} noticed these in earlier plans. They do nothing until you accept or edit them.</p></header><div class="about-memory-grid">${proposed.map(renderProfileMemoryEditor).join("")}</div></section>` : ""}
        <section class="about-section" aria-labelledby="about_remembered_title"><header><div><p class="eyebrow">Available to later plans</p><h2 id="about_remembered_title">Remembered</h2></div><p>Each new plan shows these before using them. You can skip or rewrite one for that plan without changing it here.</p></header>${accepted.length ? `<div class="about-memory-grid">${accepted.map(renderProfileMemoryEditor).join("")}</div>` : `<div class="about-empty"><strong>Nothing is being carried forward yet.</strong><p>Add something below, or accept a suggestion after a completed plan.</p></div>`}</section>
        <section class="about-section about-add" aria-labelledby="about_add_title"><header><div><p class="eyebrow">In your own words</p><h2 id="about_add_title">Add something Finite should remember</h2></div><p>Your own entry is accepted immediately and remains editable.</p></header>${canPersist ? `<form data-profile-memory-add><label><span>What should Finite remember?</span><input name="statement" maxlength="500" required placeholder="e.g. I prefer a quieter first day when travelling"></label><label><span>Type</span><select name="kind">${profileKindOptions("preference")}</select></label><button class="button" type="submit" ${profilePageBusy ? "disabled" : ""}>Remember this</button></form>` : `<div class="about-add__signin"><strong>Sign in with ChatGPT to save reusable context.</strong><p>Demo plans remain isolated and do not build a lasting profile.</p></div>`}</section>
        ${inactive.length ? `<details class="about-inactive"><summary><div><p class="eyebrow">Your history</p><h2>Not in use</h2></div><span>${inactive.length}</span></summary><p>These do not shape plans. Keeping a rejected suggestion prevents the same evidence from being quietly proposed again.</p><div>${inactive.map(renderInactiveProfileMemory).join("")}</div></details>` : ""}
      `}
      <aside class="about-boundary"><strong>What this can—and cannot—do</strong><p>Remembered items are revisable context. They cannot confirm a current fact, approve a purchase, weaken a safety constraint, or override what you say in a plan.</p></aside>
    </main>
    <footer><p>You can inspect, change or remove every reusable item.</p><span>About you</span></footer>
    ${renderKitchenResetDialog()}
    ${renderThemeSettingsDialog()}`;
  enableNativeWritingAssistance();
  bindAboutYouInteractions();
}

const settingsReturnPath = (): string => {
  const target = new URL(location.href);
  target.searchParams.delete("settings");
  return `${target.pathname}${target.search}${target.hash}`;
};

function renderSettings(): void {
  const canPersist = authSession.kind === "account";
  surfaceRoot.dataset.profile = "settings";
  surfaceRoot.setAttribute("aria-busy", String(settingsBusy));
  surfaceRoot.innerHTML = `
    <div class="private-top-shell private-top-shell--settings">
      <header class="site-header settings-header">
        ${renderBrand()}
        <a class="settings-back" href="${escapeHtml(settingsReturnPath())}">← Back to plan</a>
        <div class="header-actions">${renderHeaderControls()}</div>
      </header>
    </div>
    <main id="main" class="settings-main">
      <header class="settings-hero"><p class="eyebrow">Your Finite account</p><h1>Settings</h1><p>Choose how Finite feels and speaks while the underlying safeguards stay the same.</p></header>
      <section class="settings-section" aria-labelledby="agentic_name_title">
        <div class="settings-section__intro"><p class="eyebrow">Agentic name</p><h2 id="agentic_name_title">What should Finite call your agent?</h2><p>This name appears throughout your private plan workspace. The default is Codex.</p></div>
        <form class="agentic-name-form" data-agentic-name-form>
          <label><span>Agentic name</span><input name="agenticName" type="text" required maxlength="40" value="${escapeHtml(agenticName())}" autocomplete="off" ${canPersist ? "" : "disabled"}></label>
          <p class="agentic-name-form__boundary">This changes the name Finite shows. It does not change the underlying agent, model, permissions, or approval boundaries.</p>
          ${settingsError ? `<p class="settings-feedback is-error" role="alert">${escapeHtml(settingsError)}</p>` : ""}
          ${settingsMessage ? `<p class="settings-feedback is-success" role="status">${escapeHtml(settingsMessage)}</p>` : ""}
          ${canPersist ? `<div class="agentic-name-form__actions"><button class="button" type="submit" ${settingsBusy ? "disabled" : ""}>Save name</button><button class="text-button" type="button" data-action="reset-agentic-name" ${settingsBusy || agenticName() === defaultAgenticName ? "disabled" : ""}>Reset to Codex</button></div>` : `<p class="settings-signin">Sign in with ChatGPT to save account settings across visits.</p>`}
        </form>
      </section>
    </main>
    <footer><p>Finite keeps your plans and your preferences separate.</p><span>Account settings</span></footer>
    ${renderKitchenResetDialog()}
    ${renderThemeSettingsDialog()}`;
  enableNativeWritingAssistance();
  bindSettingsInteractions();
}

const saveAgenticName = async (name: string): Promise<void> => {
  const validation = validateAgenticName(name);
  settingsError = validation.ok ? "" : validation.issues.join(" ");
  settingsMessage = "";
  if (!validation.ok || settingsBusy) { await render(); return; }
  settingsBusy = true;
  await render();
  try {
    const result = await settingsRepository.save({ agenticName: validation.name, idempotencyKey: `site-settings-${crypto.randomUUID()}`, sourceSurface: "site" });
    if (!result.ok) settingsError = result.issues?.join(" ") || result.message || "That name could not be saved.";
    else {
      accountSettings = result.settings;
      settingsMessage = `Saved. Finite will now call your agent ${accountSettings.agenticName}.`;
      announce(settingsMessage);
    }
  } catch { settingsError = "That name could not be saved. Your previous setting is unchanged."; }
  settingsBusy = false;
  await render();
};

function bindSettingsInteractions(): void {
  bindKitchenResetInteractions();
  bindThemeSettingsInteractions();
  root?.querySelector<HTMLFormElement>("[data-agentic-name-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    void saveAgenticName(String(new FormData(form).get("agenticName") ?? ""));
  });
  root?.querySelector<HTMLButtonElement>("[data-action='reset-agentic-name']")?.addEventListener("click", () => { void saveAgenticName(defaultAgenticName); });
  root?.querySelector<HTMLButtonElement>("[data-action='end-demo']")?.addEventListener("click", async () => {
    const response = await fetch("/api/auth/demo/end", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    if (response.ok) location.reload();
    else announce("The demo session could not be ended safely.");
  });
}

const addProfileMemoryFromAbout = async (form: HTMLFormElement): Promise<void> => {
  if (profilePageBusy) return;
  const data = new FormData(form);
  profilePageBusy = true;
  profilePageError = "";
  profilePageMessage = "";
  await render();
  try {
    const result = await planLearningRepository.addProfileMemory({
      kind: String(data.get("kind") ?? "preference"),
      statement: String(data.get("statement") ?? ""),
      evidence: "Added by you in About you.",
      idempotencyKey: `profile-memory-about-site-${crypto.randomUUID()}`,
      sourceSurface: "site",
    });
    if (result.ok) {
      profileMemories = result.memories;
      profilePageMessage = "Remembered. New plans will show this before using it.";
      announce(profilePageMessage);
    } else profilePageError = result.issues?.join(" ") || result.message || "That could not be remembered.";
  } catch { profilePageError = "That could not be remembered. Nothing changed."; }
  profilePageBusy = false;
  await render();
};

const changeProfileMemoryFromAbout = async (form: HTMLFormElement, submitter: HTMLButtonElement | null): Promise<void> => {
  if (profilePageBusy) return;
  const data = new FormData(form);
  const action = String(submitter?.value ?? "update") as ProfileMemoryAction;
  if (action === "delete" && !window.confirm("Delete this permanently from About you? This also removes its evidence history.")) return;
  profilePageBusy = true;
  profilePageError = "";
  profilePageMessage = "";
  await render();
  try {
    const result = await planLearningRepository.changeProfileMemory({
      memoryId: String(data.get("memoryId") ?? ""),
      expectedUpdatedAt: String(data.get("expectedUpdatedAt") ?? ""),
      action,
      statement: String(data.get("statement") ?? ""),
      kind: String(data.get("kind") ?? "preference"),
      idempotencyKey: `profile-memory-${action}-about-site-${crypto.randomUUID()}`,
      sourceSurface: "site",
    });
    if (result.ok) {
      profileMemories = result.memories;
      profilePageMessage = action === "delete" ? "Deleted." : action === "retire" || action === "reject" ? "This will not be used in later plans." : action === "accept" || action === "restore" ? "Remembered for later plans." : "Changes saved.";
      announce(profilePageMessage);
    } else {
      if (result.code === "PROFILE_MEMORY_CONFLICT") await refreshProfileContext();
      profilePageError = result.issues?.join(" ") || result.message || "That change could not be saved.";
    }
  } catch { profilePageError = "That change could not be saved. Nothing changed."; }
  profilePageBusy = false;
  await render();
};

function bindAboutYouInteractions(): void {
  bindKitchenResetInteractions();
  bindThemeSettingsInteractions();
  root?.querySelector<HTMLFormElement>("[data-profile-memory-add]")?.addEventListener("submit", (event) => { event.preventDefault(); void addProfileMemoryFromAbout(event.currentTarget as HTMLFormElement); });
  root?.querySelectorAll<HTMLFormElement>("[data-profile-memory-change]").forEach((form) => form.addEventListener("submit", (event) => { event.preventDefault(); void changeProfileMemoryFromAbout(event.currentTarget as HTMLFormElement, (event as SubmitEvent).submitter as HTMLButtonElement | null); }));
}

async function render(): Promise<SurfaceManifest> {
  const kernel = runtime.kernel;
  const reconciledMessage = reconcileScopedSurfaceMessage({ message, scope: messageScope }, currentMessageScope());
  if (message && !reconciledMessage.message) announcer!.textContent = "";
  message = reconciledMessage.message;
  messageScope = reconciledMessage.scope;
  const params = new URLSearchParams(location.search);
  const manifestPromise = compileSurfaceManifest(kernel.profile, kernel);
  if (params.get("about") === "1") {
    renderAboutYou();
    return manifestPromise;
  }
  if (params.get("settings") === "1") {
    renderSettings();
    return manifestPromise;
  }
  const manifest = await manifestPromise;
  const experienceSurface = forceArrivalSurface ? "arrival" : selectExperienceSurface({
    labMode,
    kitchenMode: params.get("plan") === "1" || params.get("kitchen") === "1",
    hasArrival: isWaitingArrivalStatus(currentArrival()?.status),
    hasActivatedPlan: runtime.hasActivationReceipt(),
  });
  if (experienceSurface === "arrival") {
    renderArrival(manifest);
    return manifest;
  }
  if (kernel.lifecycleStatus === "completed") {
    surfaceRoot.dataset.profile = kernel.profile.profileId;
    surfaceRoot.setAttribute("aria-busy", String(busy));
    surfaceRoot.innerHTML = renderWrapUpSurface(manifest);
    enableNativeWritingAssistance();
    bindInteractions();
    return manifest;
  }
  const managingZones = visibleManagingZones(manifest);
  surfaceRoot.dataset.profile = kernel.profile.profileId;
  surfaceRoot.setAttribute("aria-busy", String(busy));
  surfaceRoot.innerHTML = `
    <div class="private-top-shell">
      <header class="site-header">
        ${renderBrand()}
        ${renderPlanSwitcher("plan", manifest.title)}
        ${renderShareHeaderAction("plan")}
        <div class="header-actions">
          ${kernel.lifecycleStatus === "active" ? '<button type="button" class="header-action header-action--status" data-action="open-plan-status">Finish or pause</button>' : ""}
          ${renderCodexHandoffButton()}
          ${renderHeaderControls()}
        </div>
      </header>
      ${renderLifecycleRail(lifecycleStageForPlan(kernel.lifecycleStatus))}
    </div>
    <main id="main">
      ${kernel.lifecycleStatus === "active" ? "" : `<div class="plan-status-strip plan-status-strip--${escapeHtml(kernel.lifecycleStatus)}" role="status"><span>${escapeHtml(kernel.lifecycleStatus)}</span><strong>This plan is ${escapeHtml(kernel.lifecycleStatus)}. Ordinary changes are blocked.</strong>${kernel.lifecycleEvents.at(-1) ? `<small>${escapeHtml(kernel.lifecycleEvents.at(-1)!.reason)}</small>` : ""}</div>`}
      <section class="hero">
        <div class="hero__heading"><div class="hero__copy"><p class="eyebrow">Current plan ${pendingBadge("general")}</p><h1>${escapeHtml(manifest.title)}</h1><p class="hero__brief">${escapeHtml(manifest.brief)}</p></div><button type="button" class="hero__add" data-action="open-plan-input" data-plan-input-section="general">+ Add or change</button></div>
      </section>
      ${message ? `<div class="service-message" role="status">${escapeHtml(message)}</div>` : ""}
      ${renderPendingPlanPriority()}
      ${renderNextStep(manifest)}
      ${renderPlanWork()}
      ${renderPlanInputItems("general")}
      ${renderHumanRealityControl()}
      ${renderPlanDraft()}
      <div class="surface-grid">${managingZones.map((zone) => renderZone(manifest, zone)).join("")}</div>
      ${renderLifecycleControl()}
      ${labMode ? `<details class="protocol-lab" open><summary>Protocol lab</summary><p>This acceptance creates synthetic, receipted revision 3 changes in all three plans. The explicit click is the human test authority.</p><button class="button" data-action="run-handoff-acceptance" ${busy ? "disabled" : ""}>Run authenticated handoff acceptance</button><pre>${escapeHtml(JSON.stringify({ modelContext: typeof document.modelContext, crossOriginIsolated, profileId: kernel.profile.profileId, profileHash: kernel.profile.profileHash, revision: kernel.revision, manifestHash: manifest.manifestHash, tools: adapter?.inventory() ?? [], acceptance: labAcceptanceResult }, null, 2))}</pre></details>` : ""}
    </main>
    <footer><p>${escapeHtml(agenticName())} works through the plan. You choose and approve every consequential change.</p><span>Finite plan · revision ${kernel.revision}</span></footer>
    ${renderCodexHandoffDialog()}
    ${renderPlanShareDialog()}
    ${renderPlanInputDialog()}
    ${renderAttachmentDialog(manifest)}
    ${renderPlanFactDialog()}
    ${renderPlanStatusDialog()}
    ${renderKitchenResetDialog()}
    ${renderThemeSettingsDialog()}`;
  if (planInputDialogOpen) root?.querySelector<HTMLDialogElement>(".plan-input-dialog")?.showModal();
  if (attachmentDialogOpen) root?.querySelector<HTMLDialogElement>(".attachment-dialog")?.showModal();
  if (planFactDialogOpen) root?.querySelector<HTMLDialogElement>(".plan-fact-dialog")?.showModal();
  if (planStatusDialogOpen) root?.querySelector<HTMLDialogElement>(".plan-status-dialog")?.showModal();
  enableNativeWritingAssistance();
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

const openPlan = async (planId: string): Promise<void> => {
  if (!planId || busy) return;
  newPlanDraftMode = false;
  forceArrivalSurface = false;
  busy = true;
  announce("");
  await render();
  let targetInputs: PlanInputRecord[];
  let targetChecklist: ChecklistItem[];
  let targetAttachments: PlanAttachment[];
  try {
    const [inputsResult, workResult] = await Promise.all([planInputRepository.list({ planId }), planWorkRepository.list(planId)]);
    if (!inputsResult.ok || !workResult.ok || inputsResult.inputs.some((item) => item.planId !== planId) || workResult.checklist.some((item) => item.planId !== planId) || workResult.attachments.some((item) => item.planId !== planId)) throw new Error("PLAN_SCOPE_UNAVAILABLE");
    targetInputs = inputsResult.inputs;
    targetChecklist = workResult.checklist;
    targetAttachments = workResult.attachments;
  } catch {
    busy = false;
    announce("That plan could not be opened just now. Your current plan is unchanged.");
    await render();
    return;
  }
  const result = await runtime.switchPlanPersisted(planId, { expectedCurrentPlanId: runtime.kernel.profile.planId, expectedCurrentRevision: runtime.kernel.revision });
  if (!result.ok) {
    busy = false;
    announce("That plan could not be opened just now. Your current plan is unchanged.");
    await render();
    return;
  }
  planInputs = targetInputs;
  checklistItems = targetChecklist;
  planAttachments = targetAttachments;
  scopedStorage.setItem("finite-plan.surface.active-profile", runtime.kernel.profile.planId);
  if (result.code === "PLAN_SWITCHED") {
    await adapter?.refreshContextualTools();
    if (labMode) await seedDecision();
  }
  const target = new URL(location.href);
  target.searchParams.delete("kitchen");
  target.searchParams.set("plan", "1");
  target.searchParams.delete("lab");
  history.replaceState(null, "", `${target.pathname}${target.search}${target.hash}`);
  busy = false;
  await render();
  window.scrollTo({ top: 0, behavior: "smooth" });
  void (async () => {
    try {
      await syncAdaptiveChecklist();
      await refreshPlanWork();
      if (runtime.kernel.profile.planId === planId) await render();
    } catch { /* The verified target plan remains usable without a checklist refresh. */ }
  })();
};

const seedArrivalContinuity = async (progression: ArrivalProgression): Promise<boolean> => {
  const planId = runtime.kernel.profile.planId;
  const revision = runtime.kernel.revision;
  const sourceKey = progression.intake.sourceArrival?.orderId.replace(/[^a-zA-Z0-9_-]/g, "_") ?? "arrival";
  const continuityTasks = arrivalContinuityTasks(progression, runtime.kernel.profile.surface.stages.map((stage) => stage.label));
  const inputWrites = progression.inputs.map((input, index) => planInputRepository.add({
    planId,
    expectedRevision: revision,
    kind: "update",
    mode: "direct",
    section: input.section,
    contextId: null,
    contextLabel: null,
    message: input.message,
    idempotencyKey: `arrival-continuity-${sourceKey}-input-${index}`,
    sourceSurface: "site",
  }));
  const taskWrites = continuityTasks.map(async (task, index) => {
    const created = await planWorkRepository.addChecklist({
      planId,
      expectedRevision: revision,
      section: "general",
      contextId: null,
      contextLabel: null,
      label: task.label,
      origin: "human",
      sourceRef: `arrival:${sourceKey}:task:${index}`,
      position: index + 100,
      idempotencyKey: `arrival-continuity-${sourceKey}-task-${index}`,
      sourceSurface: "site",
    });
    if (!created.ok || !task.done || !created.item) return created.ok;
    const completed = await planWorkRepository.setChecklist({
      itemId: created.item.itemId,
      planId,
      expectedRevision: revision,
      section: "general",
      contextId: null,
      contextLabel: null,
      status: "done",
      idempotencyKey: `arrival-continuity-${sourceKey}-task-${index}-done`,
      sourceSurface: "site",
    });
    return completed.ok;
  });
  const writes = await Promise.allSettled([...inputWrites, ...taskWrites]);
  const durable = writes.every((result) => result.status === "fulfilled" && (typeof result.value === "boolean" ? result.value : result.value.ok));
  if (runtime.kernel.profile.planId !== planId) return durable;
  await Promise.all([refreshPlanInputs(), refreshPlanWork()]);
  await syncAdaptiveChecklist();
  await refreshPlanWork();
  return durable;
};

const progressArrivalPlan = async (): Promise<void> => {
  if (busy) return;
  busy = true;
  announce("Starting this plan…");
  await render();
  try {
    let opened = await arrivalRepository.open();
    if (!opened.ok || !opened.order) throw new Error("ARRIVAL_NOT_FOUND");
    if (opened.order.status !== "interpretation_confirmed") {
      opened = await arrivalRepository.reviewWorkspace({
        orderId: opened.order.orderId,
        expectedVersion: opened.order.version,
        expectedChecksum: opened.order.checksum,
        sourceSurface: "site",
      });
    }
    if (!opened.ok || !opened.order || opened.order.status !== "interpretation_confirmed") throw new Error(opened.code || "ARRIVAL_NOT_READY");
    arrivalResult = opened;
    const starter = starterPlanForArrival(opened.order);
    if (!starter) throw new Error("ARRIVAL_WORKSPACE_NOT_READY");
    const progression = arrivalProgressionFromStarter(opened.order, starter);
    const currentDraft = runtime.pendingPlanDraft;
    let draftId = currentDraft && currentDraft.sourceArrival?.orderId === opened.order.orderId
      && currentDraft.sourceArrival.orderVersion === opened.order.version
      && currentDraft.sourceArrival.orderChecksum === opened.order.checksum
      ? currentDraft.draftId
      : "";
    if (!draftId) {
      const assessed = await runtime.assessPlanIntake(progression.intake);
      if (!assessed.ok || !String(assessed.code).startsWith("INTAKE_FACTS_COMPLETE")) throw new Error(String(assessed.code || "INTAKE_NOT_READY"));
      const packet = assessed.constructionPacket as { packetId?: string; checksum?: string } | undefined;
      if (!packet?.packetId || !packet.checksum) throw new Error("CONSTRUCTION_PACKET_NOT_SAVED");
      const compiled = await runtime.compileIntakeToDraft({ packetId: packet.packetId, expectedChecksum: packet.checksum });
      if (!compiled.ok || !runtime.pendingPlanDraft) throw new Error(String(compiled.code || "PLAN_DRAFT_NOT_STAGED"));
      draftId = runtime.pendingPlanDraft.draftId;
    }
    busy = false;
    await confirmPlanDraft(draftId, progression);
  } catch (error) {
    busy = false;
    const code = error instanceof Error ? error.message : String(error);
    announce(code === "ARRIVAL_NOT_READY" || code === "ARRIVAL_WORKSPACE_NOT_READY"
      ? "This rough plan still needs its current interpretation completed before it can start."
      : code === "PLAN_DRAFT_INVALID"
        ? "One saved detail does not yet fit the managed plan. Your draft is safe; review the highlighted section or ask Codex to repair it, then try again."
        : "Finite could not start this plan. Your draft is safe—please try again.");
    await render();
  }
};

const confirmPlanDraft = async (draftId: string, continuity: ArrivalProgression | null = null): Promise<void> => {
  if (busy) return;
  const draft = runtime.pendingPlanDraft;
  if (!draft || draft.draftId !== draftId) return;
  busy = true;
  planActivationError = "";
  announce("Starting your plan…");
  await render();

  const latestArrival = await arrivalRepository.open();
  if (latestArrival.ok) arrivalResult = latestArrival;
  if ((draft.sourceArrival && !latestArrival.ok) || !pendingDraftMatchesArrival()) {
    busy = false;
    planActivationError = latestArrival.ok
      ? "This plan is out of date because something changed. Finite will keep you in Planning while a fresh version is prepared."
      : "Finite could not check your latest information. Nothing changed—please try again.";
    announce(planActivationError);
    await render();
    return;
  }

  const existingConfirmation = runtime.planActivationConfirmation?.draftId === draftId
    ? runtime.planActivationConfirmation
    : null;
  const confirmationResult = existingConfirmation ? null : runtime.humanConfirmPlanDraft({ draftId });
  const confirmation = runtime.planActivationConfirmation;
  if ((confirmationResult && !confirmationResult.ok) || !confirmation) {
    busy = false;
    planActivationError = "Finite could not record your approval. Nothing changed—please try again.";
    announce(planActivationError);
    await render();
    return;
  }

  const sourceArrival = draft.sourceArrival;
  const activation = await runtime.activateConfirmedPlanDraft({
    draftId,
    confirmationId: confirmation.confirmationId,
    expectedPlanId: draft.basePlanId,
    expectedRevision: draft.baseRevision,
    idempotencyKey: `human-plan-activation:${draftId}:${confirmation.confirmationId}`,
  });
  if (!activation.ok) {
    busy = false;
    planActivationError = activation.code === "PLAN_DRAFT_STALE" || activation.code === "PLAN_DRAFT_ARRIVAL_STALE"
      ? "This plan is out of date because something changed. Finite will keep you in Planning while a fresh version is prepared."
      : "Finite could not start the plan. Your approval is still here—please try again.";
    announce(planActivationError);
    await render();
    return;
  }

  persistedPlanIds.add(runtime.kernel.profile.planId);
  scopedStorage.setItem("finite-plan.surface.active-profile", runtime.kernel.profile.planId);
  planInputs = [];
  checklistItems = [];
  planAttachments = [];
  planRetrospective = emptyRetrospective(runtime.kernel.profile.planId, runtime.kernel.revision);
  const activatedPlanId = runtime.kernel.profile.planId;
  const activatedProfileHash = runtime.kernel.profile.profileHash;
  const activatedRevision = runtime.kernel.revision;
  const continuityWork = continuity ? seedArrivalContinuity(continuity).catch(() => false) : Promise.resolve(true);
  const postActivationSync = Promise.resolve().then(async () => {
    let arrivalClosed = true;
    if (sourceArrival) {
      const completion = await arrivalRepository.acceptPlan({
        orderId: sourceArrival.orderId,
        expectedVersion: sourceArrival.orderVersion,
        expectedChecksum: sourceArrival.orderChecksum,
        planId: activatedPlanId,
        profileHash: activatedProfileHash,
        planRevision: activatedRevision,
      });
      arrivalClosed = completion.ok;
    }
    const latestArrival = await arrivalRepository.open();
    if (runtime.kernel.profile.planId === activatedPlanId && latestArrival.ok) arrivalResult = latestArrival;
    await adapter?.refreshContextualTools();
    return arrivalClosed;
  }).catch(() => false);
  forceArrivalSurface = false;
  newPlanDraftMode = false;
  const target = new URL(location.href);
  target.searchParams.delete("arrival");
  target.searchParams.delete("kitchen");
  target.searchParams.delete("lab");
  target.searchParams.set("plan", "1");
  history.replaceState(null, "", `${target.pathname}${target.search}${target.hash}`);
  busy = false;
  planActivationError = "";
  message = "";
  messageScope = currentMessageScope();
  announcer.textContent = "Plan approved. Managing is ready.";
  await render();
  window.scrollTo({ top: 0, behavior: "smooth" });
  void Promise.all([continuityWork, postActivationSync]).then(async ([continuitySaved, arrivalClosed]) => {
    if (runtime.kernel.profile.planId !== activatedPlanId) return;
    if (!continuitySaved) announce("Your plan is active. Some editable planning notes need to be retried from the saved arrival history.");
    else if (!arrivalClosed) announce("Your plan is active. Finite is still syncing the completed starting request.");
    await render();
  });
};

const returnPlanDraft = async (form: HTMLFormElement): Promise<void> => {
  if (busy) return;
  const data = new FormData(form);
  const reasonCode = String(data.get("reasonCode") ?? "") as import("./types.js").ConstructionReturnReason;
  const reason = String(data.get("reason") ?? "").trim();
  if (!reasonCode || !reason) return;
  busy = true;
  announce("Returning the exact draft with your revision notes…");
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
  const reason = String(data.get("reason") ?? "").trim() || (status === "completed" ? "The planned outcome happened." : "");
  const actualSpendValue = String(data.get("actualSpend") ?? "").trim();
  const actualSpendMinor = actualSpendValue ? Math.round(Number(actualSpendValue) * 100) : undefined;
  if (!status || !reason) return;
  const recordActual = form.hasAttribute("data-record-actual") && status === "completed";
  const finishNow = (form.hasAttribute("data-plan-complete") || recordActual) && status === "completed";
  const revision = runtime.kernel.revision;
  if (finishNow) {
    busy = true;
    announce("Finishing this plan…");
    form.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("button,input,textarea,select").forEach((control) => { control.disabled = true; });
    const submit = form.querySelector<HTMLButtonElement>("button[type='submit']");
    if (submit) submit.textContent = recordActual ? "Saving…" : "Finishing…";
  }
  const result = await runtime.kernel.stagePlanLifecycle({ status, reason, ...(actualSpendMinor === undefined ? {} : { actualSpendMinor }), expectedRevision: runtime.kernel.revision });
  if (finishNow) {
    const pending = result.ok ? runtime.kernel.pendingLifecycleChange : null;
    const confirmed = pending ? runtime.kernel.humanConfirmPlanLifecycle({ lifecycleChangeId: pending.lifecycleChangeId }) : result;
    const confirmationId = confirmed.ok ? String((confirmed.confirmation as { confirmationId?: string } | undefined)?.confirmationId ?? "") : "";
    const applied = pending && confirmationId ? await runtime.kernel.applyConfirmedPlanLifecycle({ lifecycleChangeId: pending.lifecycleChangeId, confirmationId, expectedRevision: revision, idempotencyKey: `plan-lifecycle-site-${crypto.randomUUID()}` }) : confirmed;
    busy = false;
    announce(applied.ok ? (recordActual ? "Actual spend saved." : "Plan finished.") : (recordActual ? "The actual spend could not be saved." : "The plan could not be finished."));
    if (applied.ok) planStatusDialogOpen = false;
    await render();
    if (applied.ok) await adapter?.refreshContextualTools();
    return;
  }
  if (result.ok) planStatusDialogOpen = false;
  announce(result.ok ? "Review the exact plan status below. Nothing has changed yet." : `The plan status could not be prepared: ${result.code}`);
  await render();
  document.querySelector(".lifecycle-control")?.scrollIntoView({ behavior: "smooth", block: "center" });
};

const confirmLifecycle = async (lifecycleChangeId: string): Promise<void> => {
  const pending = runtime.kernel.pendingLifecycleChange;
  if (!pending || pending.lifecycleChangeId !== lifecycleChangeId) return;
  const revision = runtime.kernel.revision;
  busy = true;
  await render();
  const confirmed = runtime.kernel.humanConfirmPlanLifecycle({ lifecycleChangeId });
  const confirmationId = confirmed.ok ? String((confirmed.confirmation as { confirmationId?: string } | undefined)?.confirmationId ?? "") : "";
  const applied = confirmationId ? await runtime.kernel.applyConfirmedPlanLifecycle({ lifecycleChangeId, confirmationId, expectedRevision: revision, idempotencyKey: `plan-lifecycle-site-${crypto.randomUUID()}` }) : confirmed;
  busy = false;
  announce(applied.ok ? (pending.after === "completed" ? "Plan finished." : "Plan status updated.") : `The plan status was not saved: ${applied.code}`);
  if (applied.ok) await adapter?.refreshContextualTools();
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

const confirmPendingPlanFacts = async (planFactChangeId: string): Promise<void> => {
  const pending = runtime.kernel.pendingPlanFactChange;
  if (!pending || pending.planFactChangeId !== planFactChangeId) return;
  const revision = runtime.kernel.revision;
  busy = true;
  await render();
  const confirmed = runtime.kernel.humanConfirmPlanFactChanges({ planFactChangeId });
  const confirmationId = confirmed.ok ? String((confirmed.confirmation as { confirmationId?: string } | undefined)?.confirmationId ?? "") : "";
  const applied = confirmationId ? await runtime.kernel.applyConfirmedPlanFactChanges({ planFactChangeId, confirmationId, expectedRevision: revision, idempotencyKey: `plan-facts-site-${crypto.randomUUID()}` }) : confirmed;
  busy = false;
  announce(applied.ok ? "Plan details updated." : `Those values could not be saved: ${applied.code}`);
  if (applied.ok) await adapter?.refreshContextualTools();
  await render();
};

const openPlanInput = async (button: HTMLButtonElement): Promise<void> => {
  const section = button.dataset.planInputSection as PlanInputSection;
  planInputContext = {
    section: ["general", "timeline", "money", "boundaries"].includes(section) ? section : "general",
    contextId: button.dataset.planInputContext || null,
    contextLabel: button.dataset.planInputLabel || null,
  };
  planInputEditingId = null;
  planInputError = "";
  planInputDialogOpen = true;
  await render();
  root.querySelector<HTMLTextAreaElement>("[data-plan-input-form] textarea")?.focus();
};

const editPlanInput = async (inputId: string): Promise<void> => {
  const item = planInputs.find((candidate) => candidate.inputId === inputId);
  if (!item) return;
  planInputEditingId = item.inputId;
  planInputContext = { section: item.section, contextId: item.contextId, contextLabel: item.contextLabel };
  planInputError = "";
  planInputDialogOpen = true;
  await render();
  root.querySelector<HTMLTextAreaElement>("[data-plan-input-form] textarea")?.focus();
};

const savePlanInput = async (form: HTMLFormElement, mode: PlanInputMode): Promise<void> => {
  if (planInputBusy) return;
  const data = new FormData(form);
  const section = String(data.get("section") ?? "general") as PlanInputSection;
  planInputBusy = true;
  planInputError = "";
  await render();
  try {
    const input = {
      planId: runtime.kernel.profile.planId,
      expectedRevision: runtime.kernel.revision,
      kind: String(data.get("kind") ?? "decision") as PlanInputKind,
      mode,
      section,
      contextId: section === planInputContext.section ? planInputContext.contextId : null,
      contextLabel: section === planInputContext.section ? planInputContext.contextLabel : null,
      message: String(data.get("message") ?? ""),
      idempotencyKey: `plan-input-${planInputEditingId ? "update" : "add"}-site-${crypto.randomUUID()}`,
      sourceSurface: "site" as const,
    };
    const result = planInputEditingId
      ? await planInputRepository.update({ ...input, inputId: planInputEditingId })
      : await planInputRepository.add(input);
    if (!result.ok) planInputError = result.issues?.join(" ") || result.message || "That item could not be added. Nothing else changed.";
    else {
      planInputs = result.inputs;
      planInputDialogOpen = false;
      planInputEditingId = null;
      announce(mode === "codex" ? `${planInputSectionLabel(result.input?.section ?? "general")} is pending.` : "Plan updated.");
    }
  } catch { planInputError = "That item could not be added. Nothing else changed."; }
  planInputBusy = false;
  await render();
};

const handlePlanInput = async (inputId: string): Promise<void> => {
  if (planInputBusy || !inputId) return;
  planInputBusy = true;
  const controls = [...(root?.querySelectorAll<HTMLButtonElement>("[data-action='handle-plan-input']") ?? [])].filter((button) => button.dataset.planInputId === inputId);
  controls.forEach((button) => { button.disabled = true; button.textContent = "Marking…"; });
  try {
    const result = await planInputRepository.resolve({ inputId, planId: runtime.kernel.profile.planId, expectedRevision: runtime.kernel.revision, idempotencyKey: `plan-input-handle-site-${crypto.randomUUID()}`, sourceSurface: "site" });
    if (result.ok) { planInputs = result.inputs; announce("Marked handled."); }
    else announce(result.message || "That item could not be marked handled.");
  } catch { announce("That item could not be marked handled."); }
  planInputBusy = false;
  await render();
};

const addChecklistItem = async (form: HTMLFormElement): Promise<void> => {
  if (planWorkBusy) return;
  const label = String(new FormData(form).get("label") ?? "").trim();
  if (!label) return;
  planWorkBusy = true;
  try {
    const result = await planWorkRepository.addChecklist({ planId: runtime.kernel.profile.planId, expectedRevision: runtime.kernel.revision, section: "general", contextId: null, contextLabel: null, label, origin: "human", sourceRef: null, position: checklistItems.length + 100, idempotencyKey: `checklist-add-site-${crypto.randomUUID()}`, sourceSurface: "site" });
    if (result.ok) { checklistItems = result.checklist; planAttachments = result.attachments; announce("Added to your list."); }
    else announce(result.issues?.join(" ") || result.message || "That item could not be added.");
  } catch { announce("That item could not be added."); }
  planWorkBusy = false;
  await render();
};

const toggleChecklistItem = async (itemId: string, done: boolean): Promise<void> => {
  if (planWorkBusy) return;
  const item = checklistItems.find((candidate) => candidate.itemId === itemId);
  if (!item) return;
  const priorChecklist = checklistItems;
  checklistItems = checklistItems.map((candidate) => candidate.itemId === itemId ? { ...candidate, status: done ? "done" : "open" } : candidate);
  planWorkBusy = true;
  [...(root?.querySelectorAll<HTMLInputElement>("[data-action='toggle-checklist']") ?? [])]
    .filter((input) => input.dataset.checklistId === itemId)
    .forEach((input) => { input.disabled = true; });
  try {
    const result = await planWorkRepository.setChecklist({ itemId, planId: runtime.kernel.profile.planId, expectedRevision: runtime.kernel.revision, section: item.section, contextId: item.contextId, contextLabel: item.contextLabel, status: done ? "done" : "open", idempotencyKey: `checklist-${done ? "done" : "reopen"}-site-${crypto.randomUUID()}`, sourceSurface: "site" });
    if (result.ok) { checklistItems = result.checklist; planAttachments = result.attachments; announce(done ? "Ticked off." : "Put back on the list."); }
    else { checklistItems = priorChecklist; announce(result.message || "That item could not be updated."); }
  } catch { checklistItems = priorChecklist; announce("That item could not be updated."); }
  planWorkBusy = false;
  await render();
};

const openAttachmentDialog = async (button: HTMLButtonElement): Promise<void> => {
  attachmentContext = { section: (button.dataset.attachmentSection || "general") as PlanInputSection, contextId: button.dataset.attachmentContext || null, contextLabel: button.dataset.attachmentLabel || null };
  planWorkError = "";
  attachmentDialogOpen = true;
  await render();
};

const saveAttachments = async (form: HTMLFormElement): Promise<void> => {
  if (planWorkBusy) return;
  const data = new FormData(form);
  const location = String(data.get("location") ?? "general");
  const [rawSection, rawContext] = location.split(":", 2);
  const section = rawSection as PlanInputSection;
  const select = form.elements.namedItem("location") as HTMLSelectElement;
  const contextId = section === "timeline" ? rawContext || null : null;
  const contextLabel = section === "timeline" ? select.selectedOptions[0]?.textContent?.trim() || null : null;
  const attachmentRole = data.get("attachmentRole") === "output" ? "output" as const : "source" as const;
  const files = Array.from((form.elements.namedItem("files") as HTMLInputElement).files ?? []);
  const link = String(data.get("link") ?? "").trim();
  const linkLabel = String(data.get("linkLabel") ?? "").trim();
  const note = String(data.get("note") ?? "").trim();
  if (!files.length && !link && !note) { planWorkError = "Choose a file or add a link or note."; await render(); return; }
  planWorkBusy = true;
  planWorkError = "";
  await render();
  try {
    const common = { planId: runtime.kernel.profile.planId, expectedRevision: runtime.kernel.revision, section, contextId, contextLabel, attachmentRole, sourceSurface: "site" as const };
    const results: PlanWorkResult[] = [];
    for (const file of files) results.push(await planWorkRepository.uploadAttachment({ ...common, file, idempotencyKey: `attachment-upload-site-${crypto.randomUUID()}` }));
    if (link) results.push(await planWorkRepository.addTextAttachment({ ...common, kind: "link", label: linkLabel, value: link, idempotencyKey: `attachment-link-site-${crypto.randomUUID()}` }));
    if (note) results.push(await planWorkRepository.addTextAttachment({ ...common, kind: "note", label: contextLabel ? `${contextLabel} note` : "Note", value: note, idempotencyKey: `attachment-note-site-${crypto.randomUUID()}` }));
    const failure = results.find((result) => !result.ok);
    const latest = [...results].reverse().find((result) => result.ok);
    if (latest) { checklistItems = latest.checklist; planAttachments = latest.attachments; }
    if (failure) planWorkError = failure.issues?.join(" ") || failure.message || "One of those items could not be added.";
    else { attachmentDialogOpen = false; announce(results.length === 1 ? "Added to the plan." : `${results.length} items added to the plan.`); }
  } catch { planWorkError = "Those items could not be added."; }
  planWorkBusy = false;
  await render();
};

const removeAttachment = async (attachmentId: string): Promise<void> => {
  if (planWorkBusy || !attachmentId) return;
  planWorkBusy = true;
  try {
    const result = await planWorkRepository.removeAttachment({ attachmentId, planId: runtime.kernel.profile.planId, expectedRevision: runtime.kernel.revision, section: "general", contextId: null, contextLabel: null, idempotencyKey: `attachment-remove-site-${crypto.randomUUID()}`, sourceSurface: "site" });
    if (result.ok) { checklistItems = result.checklist; planAttachments = result.attachments; announce("Attachment removed."); }
    else announce(result.message || "That attachment could not be removed.");
  } catch { announce("That attachment could not be removed."); }
  planWorkBusy = false;
  await render();
};

const savePlanFacts = async (form: HTMLFormElement): Promise<void> => {
  if (planFactBusy) return;
  const facts = new Map(currentEditablePlanFacts().map((fact) => [fact.factId, fact]));
  const data = new FormData(form);
  const changes: PlanFactChange[] = [];
  for (const [factId, fact] of facts) {
    const raw = Number(data.get(factId));
    changes.push({ factId, value: fact.format === "money" ? Math.round(raw * 100) : raw });
  }
  planFactBusy = true;
  planFactError = "";
  await render();
  const revision = runtime.kernel.revision;
  const staged = await runtime.kernel.stagePlanFactChanges({ changes, expectedRevision: revision });
  if (!staged.ok) {
    planFactError = Array.isArray(staged.issues) ? staged.issues.map(String).join(" ") : "Those values do not fit this plan.";
  } else {
    const pending = runtime.kernel.pendingPlanFactChange!;
    const confirmed = runtime.kernel.humanConfirmPlanFactChanges({ planFactChangeId: pending.planFactChangeId });
    const confirmationId = confirmed.ok ? String((confirmed.confirmation as { confirmationId?: string } | undefined)?.confirmationId ?? "") : "";
    const applied = confirmationId ? await runtime.kernel.applyConfirmedPlanFactChanges({ planFactChangeId: pending.planFactChangeId, confirmationId, expectedRevision: revision, idempotencyKey: `plan-facts-site-${crypto.randomUUID()}` }) : confirmed;
    if (applied.ok) {
      planFactDialogOpen = false;
      planDisplayNames.set(runtime.kernel.profile.planId, projectAcceptedPlanCopy(runtime.kernel.profile.name, runtime.kernel));
      announce("Plan details updated.");
      await adapter?.refreshContextualTools();
    } else planFactError = Array.isArray(applied.issues) ? applied.issues.map(String).join(" ") : `Those values could not be saved: ${applied.code}`;
  }
  planFactBusy = false;
  await render();
};

const bindPlanFactCalculation = (): void => {
  const form = root?.querySelector<HTMLFormElement>("[data-plan-fact-form]");
  if (!form) return;
  const total = form.elements.namedItem("allocations.totalBudgetMinor") as HTMLInputElement | null;
  const output = form.querySelector<HTMLOutputElement>("[data-plan-fact-available]");
  if (!total || !output) return;
  const update = (): void => {
    const totalMinor = Math.round(Number(total.value) * 100);
    const assigned = runtime.kernel.accepted.spentMinor + runtime.kernel.accepted.committedMinor + runtime.kernel.accepted.forecastMinor;
    output.value = Number.isFinite(totalMinor) ? money(Math.max(0, totalMinor - assigned)) : "—";
  };
  total.addEventListener("input", update);
};

const savePlanRetrospective = async (form: HTMLFormElement): Promise<void> => {
  if (planLearningBusy) return;
  const data = new FormData(form);
  planLearningBusy = true;
  planLearningError = "";
  lessonsOpen = true;
  await render();
  const result = await planLearningRepository.saveRetrospective({
    planId: runtime.kernel.profile.planId,
    expectedRevision: runtime.kernel.revision,
    worked: String(data.get("worked") ?? ""),
    changed: String(data.get("changed") ?? ""),
    nextTime: String(data.get("nextTime") ?? ""),
    idempotencyKey: `retrospective-site-${crypto.randomUUID()}`,
    sourceSurface: "site",
  });
  if (result.ok) {
    planRetrospective = result.retrospective;
    profileMemories = result.memories;
    announce("Lessons saved with this plan.");
  } else planLearningError = result.issues?.join(" ") || "Those lessons could not be saved.";
  planLearningBusy = false;
  await render();
};

const addProfileMemory = async (form: HTMLFormElement): Promise<void> => {
  if (planLearningBusy) return;
  const data = new FormData(form);
  planLearningBusy = true;
  planLearningError = "";
  lessonsOpen = true;
  await render();
  const result = await planLearningRepository.addMemory({
    planId: runtime.kernel.profile.planId,
    expectedRevision: runtime.kernel.revision,
    kind: String(data.get("kind") ?? "preference"),
    statement: String(data.get("statement") ?? ""),
    evidence: String(data.get("evidence") ?? "Added by you after this plan."),
    idempotencyKey: `profile-memory-site-${crypto.randomUUID()}`,
    sourceSurface: "site",
  });
  if (result.ok) {
    planRetrospective = result.retrospective;
    profileMemories = result.memories;
    announce("Saved for future plans.");
  } else planLearningError = result.issues?.join(" ") || "That memory could not be saved.";
  planLearningBusy = false;
  await render();
};

const decideProfileMemory = async (form: HTMLFormElement, submitter: HTMLButtonElement | null): Promise<void> => {
  if (planLearningBusy) return;
  const data = new FormData(form);
  const status = submitter?.value === "rejected" ? "rejected" : "accepted";
  planLearningBusy = true;
  planLearningError = "";
  lessonsOpen = true;
  await render();
  const result = await planLearningRepository.decideMemory({
    memoryId: String(data.get("memoryId") ?? ""),
    planId: runtime.kernel.profile.planId,
    expectedRevision: runtime.kernel.revision,
    status,
    statement: String(data.get("statement") ?? ""),
    idempotencyKey: `profile-memory-${status}-site-${crypto.randomUUID()}`,
    sourceSurface: "site",
  });
  if (result.ok) {
    planRetrospective = result.retrospective;
    profileMemories = result.memories;
    announce(status === "accepted" ? "Saved for future plans." : "Finite will not use that suggestion.");
  } else planLearningError = result.issues?.join(" ") || "That choice could not be saved.";
  planLearningBusy = false;
  await render();
};

function bindInteractions(): void {
  bindCodexHandoffInteractions();
  bindFollowCodexInteractions();
  bindPlanShareInteractions();
  bindPlanSwitcherInteractions();
  root?.querySelector<HTMLButtonElement>("[data-action='start-new-plan']")?.addEventListener("click", () => { void startNewPlan(); });
  bindKitchenResetInteractions();
  bindThemeSettingsInteractions();
  const lessonDetails = root?.querySelector<HTMLDetailsElement>("[data-plan-lessons]");
  lessonDetails?.addEventListener("toggle", () => { lessonsOpen = lessonDetails.open; });
  root?.querySelector<HTMLFormElement>("[data-plan-retrospective]")?.addEventListener("submit", (event) => { event.preventDefault(); void savePlanRetrospective(event.currentTarget as HTMLFormElement); });
  root?.querySelector<HTMLFormElement>("[data-memory-add]")?.addEventListener("submit", (event) => { event.preventDefault(); void addProfileMemory(event.currentTarget as HTMLFormElement); });
  root?.querySelectorAll<HTMLFormElement>("[data-memory-decision]").forEach((form) => form.addEventListener("submit", (event) => { event.preventDefault(); void decideProfileMemory(event.currentTarget as HTMLFormElement, (event as SubmitEvent).submitter as HTMLButtonElement | null); }));
  root?.querySelectorAll<HTMLButtonElement>("[data-action='open-plan-input']").forEach((button) => button.addEventListener("click", () => { void openPlanInput(button); }));
  root?.querySelectorAll<HTMLButtonElement>("[data-action='edit-plan-input']").forEach((button) => button.addEventListener("click", () => { void editPlanInput(String(button.dataset.planInputId ?? "")); }));
  root?.querySelectorAll<HTMLButtonElement>("[data-action='close-plan-input']").forEach((button) => button.addEventListener("click", async () => { planInputDialogOpen = false; planInputEditingId = null; planInputError = ""; await render(); }));
  root?.querySelector<HTMLFormElement>("[data-plan-input-form]")?.addEventListener("submit", (event) => { event.preventDefault(); const submitter = (event as SubmitEvent).submitter as HTMLButtonElement | null; const mode: PlanInputMode = submitter?.value === "codex" ? "codex" : "direct"; void savePlanInput(event.currentTarget as HTMLFormElement, mode); });
  root?.querySelectorAll<HTMLButtonElement>("[data-action='handle-plan-input']").forEach((button) => button.addEventListener("click", () => { void handlePlanInput(String(button.dataset.planInputId ?? "")); }));
  root?.querySelector<HTMLFormElement>("[data-checklist-add]")?.addEventListener("submit", (event) => { event.preventDefault(); void addChecklistItem(event.currentTarget as HTMLFormElement); });
  root?.querySelectorAll<HTMLInputElement>("[data-action='toggle-checklist']").forEach((input) => input.addEventListener("change", () => { void toggleChecklistItem(String(input.dataset.checklistId ?? ""), input.checked); }));
  root?.querySelectorAll<HTMLButtonElement>("[data-action='reopen-stage']").forEach((button) => button.addEventListener("click", () => { void toggleChecklistItem(String(button.dataset.checklistId ?? ""), false); }));
  root?.querySelectorAll<HTMLButtonElement>("[data-action='open-attachment']").forEach((button) => button.addEventListener("click", () => { void openAttachmentDialog(button); }));
  root?.querySelectorAll<HTMLButtonElement>("[data-action='close-attachment']").forEach((button) => button.addEventListener("click", async () => { attachmentDialogOpen = false; planWorkError = ""; await render(); }));
  root?.querySelector<HTMLFormElement>("[data-attachment-form]")?.addEventListener("submit", (event) => { event.preventDefault(); void saveAttachments(event.currentTarget as HTMLFormElement); });
  root?.querySelectorAll<HTMLButtonElement>("[data-action='remove-attachment']").forEach((button) => button.addEventListener("click", () => { void removeAttachment(String(button.dataset.attachmentId ?? "")); }));
  root?.querySelectorAll<HTMLButtonElement>("[data-action='open-plan-facts']").forEach((button) => button.addEventListener("click", async () => { planFactError = ""; planFactDialogOpen = true; await render(); root.querySelector<HTMLInputElement>("[data-plan-fact-form] input")?.focus(); }));
  root?.querySelectorAll<HTMLButtonElement>("[data-action='close-plan-facts']").forEach((button) => button.addEventListener("click", async () => { planFactDialogOpen = false; planFactError = ""; await render(); }));
  root?.querySelector<HTMLFormElement>("[data-plan-fact-form]")?.addEventListener("submit", (event) => { event.preventDefault(); void savePlanFacts(event.currentTarget as HTMLFormElement); });
  bindPlanFactCalculation();
  root?.querySelectorAll<HTMLButtonElement>("[data-action='open-plan-status']").forEach((button) => button.addEventListener("click", async () => { planStatusDialogOpen = true; await render(); root.querySelector<HTMLTextAreaElement>(".plan-status-dialog textarea")?.focus(); }));
  root?.querySelectorAll<HTMLButtonElement>("[data-action='close-plan-status']").forEach((button) => button.addEventListener("click", async () => { planStatusDialogOpen = false; await render(); }));
  root?.querySelectorAll<HTMLDetailsElement>("[data-managing-zone]").forEach((details) => details.addEventListener("toggle", () => {
    const zoneId = String(details.dataset.zoneId ?? "");
    if (!zoneId) return;
    if (details.open) openManagingZones.add(zoneId); else openManagingZones.delete(zoneId);
    const label = details.querySelector<HTMLElement>(".zone__summary>span");
    if (label) label.textContent = details.open ? "Close section" : "Open section";
  }));
  root?.querySelectorAll<HTMLButtonElement>("[data-action='open-managing-zone']").forEach((button) => button.addEventListener("click", () => {
    const zoneId = String(button.dataset.zoneId ?? "");
    const section = zoneId ? document.getElementById(zoneId) : null;
    const details = section?.querySelector<HTMLDetailsElement>("[data-managing-zone]") ?? null;
    if (!details) return;
    openManagingZones.add(zoneId);
    details.open = true;
    section?.scrollIntoView({ behavior: "smooth", block: "start" });
  }));
  root?.querySelectorAll<HTMLButtonElement>("[data-action='choose']").forEach((button) => button.addEventListener("click", () => chooseCandidate(String(button.dataset.candidate))));
  root?.querySelector<HTMLButtonElement>("[data-action='approve']")?.addEventListener("click", () => approveCandidate());
  root?.querySelector<HTMLButtonElement>("[data-action='return']")?.addEventListener("click", async () => { runtime.kernel.rejectStagedOption({ reason: "Human returned the staged option from the consumption surface." }); announce("Returned to the three viable outcomes. Accepted truth is unchanged."); await render(); });
  root?.querySelector<HTMLButtonElement>("[data-action='confirm-plan']")?.addEventListener("click", (event) => { void confirmPlanDraft((event.currentTarget as HTMLButtonElement).dataset.draft ?? ""); });
  root?.querySelector<HTMLButtonElement>("[data-action='open-plan-return']")?.addEventListener("click", async () => { draftReturnFormOpen = true; announce(""); await render(); root.querySelector<HTMLTextAreaElement>("[data-plan-return] textarea")?.focus(); });
  root?.querySelector<HTMLButtonElement>("[data-action='cancel-plan-return']")?.addEventListener("click", async () => { draftReturnFormOpen = false; await render(); });
  root?.querySelector<HTMLFormElement>("[data-plan-return]")?.addEventListener("submit", (event) => { event.preventDefault(); void returnPlanDraft(event.currentTarget as HTMLFormElement); });
  root?.querySelector<HTMLButtonElement>("[data-action='discard-returned-draft']")?.addEventListener("click", (event) => { void discardReturnedDraft((event.currentTarget as HTMLButtonElement).dataset.packet ?? ""); });
  root?.querySelectorAll<HTMLFormElement>("[data-plan-lifecycle]").forEach((form) => form.addEventListener("submit", (event) => { event.preventDefault(); void stageLifecycle(event.currentTarget as HTMLFormElement); }));
  root?.querySelector<HTMLButtonElement>("[data-action='confirm-lifecycle']")?.addEventListener("click", (event) => { void confirmLifecycle((event.currentTarget as HTMLButtonElement).dataset.lifecycle ?? ""); });
  root?.querySelector<HTMLButtonElement>("[data-action='cancel-lifecycle']")?.addEventListener("click", async () => { runtime.kernel.pendingLifecycleChange = null; runtime.kernel.lifecycleConfirmation = null; announce("Plan status change cancelled. Accepted truth is unchanged."); await render(); });
  root?.querySelector<HTMLButtonElement>("[data-action='confirm-group-decision']")?.addEventListener("click", (event) => { void confirmGroupDecision((event.currentTarget as HTMLButtonElement).dataset.groupDecision ?? ""); });
  root?.querySelector<HTMLButtonElement>("[data-action='cancel-group-decision']")?.addEventListener("click", async () => { runtime.kernel.pendingGroupDecision = null; runtime.kernel.groupDecisionConfirmation = null; announce("Group decision returned. Accepted truth is unchanged."); await render(); });
  root?.querySelector<HTMLButtonElement>("[data-action='confirm-external-action']")?.addEventListener("click", (event) => { void confirmExternalAction((event.currentTarget as HTMLButtonElement).dataset.externalAction ?? ""); });
  root?.querySelector<HTMLButtonElement>("[data-action='cancel-external-action']")?.addEventListener("click", async () => { runtime.kernel.pendingExternalAction = null; runtime.kernel.externalActionConfirmation = null; announce("Real-world status returned. Accepted truth is unchanged."); await render(); });
  root?.querySelector<HTMLButtonElement>("[data-action='confirm-plan-facts']")?.addEventListener("click", (event) => { void confirmPendingPlanFacts((event.currentTarget as HTMLButtonElement).dataset.planFactChange ?? ""); });
  root?.querySelector<HTMLButtonElement>("[data-action='cancel-plan-facts']")?.addEventListener("click", async () => { runtime.kernel.pendingPlanFactChange = null; runtime.kernel.planFactConfirmation = null; announce("Plan detail changes cancelled."); await render(); });
  if (labMode) root?.querySelector<HTMLButtonElement>("[data-action='run-handoff-acceptance']")?.addEventListener("click", () => { void runAuthenticatedHandoffAcceptance(); });
  root?.querySelector<HTMLButtonElement>("[data-action='end-demo']")?.addEventListener("click", async () => {
    const response = await fetch("/api/auth/demo/end", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    if (response.ok) location.reload();
    else announce("The demo session could not be ended safely.");
  });
}

if (labMode) await seedDecision();
updateOpeningStatus("Opening your workspace…");
await render();
window.finitePlanCanary = { runtime, adapter, refresh: () => { void render(); } };
if (opensFreshArrival) void hydrateCanonicalRuntime();
if (opensProfileSurface) {
  void refreshProfileContext().then(() => render()).catch(() => { /* About you keeps its safe empty state if reusable context is unavailable. */ });
} else if (startupSurface === "arrival") {
  void Promise.all([refreshSecondaryPlanData(), refreshProfileContext()]).then(() => render()).catch(() => { /* The starting surface stays usable without reusable context. */ });
}
if (startupSurface === "plan") {
  void initialSecondaryPlanData.then(async () => {
    await render();
    await syncAdaptiveChecklist();
    await render();
  }).catch(() => { /* The core plan remains usable if secondary records cannot be loaded. */ });
} else {
  void syncAdaptiveChecklist().catch(() => { /* The plan remains usable if its suggested checklist cannot be synced yet. */ });
}
};
