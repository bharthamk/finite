import { compileBuiltInProfiles } from "./profiles.js";
import { MemoryStorage, PlanCatalogStore, PlanSnapshotStore } from "./persistence.js";
import { compileCatalogEntries, FinitePlanRuntime } from "./runtime.js";
import { compileSurfaceManifest, resolveSurfaceBinding } from "./surface.js";
import type { Candidate, ProfileId, Receipt, SurfaceManifest, SurfaceZone } from "./types.js";
import { FinitePlanWebMCPAdapter } from "./webmcp.js";
import { HttpAcceptedTruthRepository } from "./accepted-truth.js";
import { HttpArrivalRepository, type ArrivalOrder, type ArrivalResult } from "./arrival.js";
import { createCodexHandoff } from "./codex-handoff.js";

const root = document.querySelector<HTMLElement>("#app");
const announcer = document.querySelector<HTMLElement>("#announcer");
if (!root || !announcer) throw new Error("Finite host elements are missing.");
const surfaceRoot = root;

interface FiniteAuthSession {
  kind: "account" | "demo";
  provider: "chatgpt" | "demo";
  displayName: string;
  email: string | null;
  expiresAt: string | null;
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
        <p>Travel · Renovation · Event / operated through WebMCP</p>
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
      <footer class="public-footer"><p>Plans that survive contact with reality.</p><span>Finite / adaptive planning through WebMCP</span></footer>
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
const store = new PlanSnapshotStore(localStorage);
const catalogStore = new PlanCatalogStore(localStorage);
const catalogEntries = await compileCatalogEntries(catalogStore.load(), catalogStore.loadActivationReceipts());
const savedProfile = localStorage.getItem("finite-plan.surface.active-profile");
const savedBuiltIn = savedProfile === "renovation" || savedProfile === "event" || savedProfile === "travel" ? savedProfile : null;
const savedPlan = catalogEntries.some(({ profile }) => profile.planId === savedProfile) ? savedProfile : null;
const initialProfile = savedPlan ?? savedBuiltIn ?? "travel";
const acceptedRepository = new HttpAcceptedTruthRepository();
const arrivalRepository = new HttpArrivalRepository();
let arrivalResult: ArrivalResult = await arrivalRepository.open();
const runtime = new FinitePlanRuntime(profiles, store, initialProfile, catalogStore, catalogEntries, () => new Date(), acceptedRepository);
await runtime.hydrateAcceptedTruth();
await runtime.resumeConstructionPacket();
const modelContext = document.modelContext;
const adapter = modelContext ? new FinitePlanWebMCPAdapter(modelContext, runtime, async ({ toolName, result }) => {
  if (["PLAN_ACTIVATED", "PLAN_AMENDMENT_ACTIVATED", "PLAN_SWITCHED", "PROFILE_SWITCHED"].includes(result.code)) localStorage.setItem("finite-plan.surface.active-profile", runtime.kernel.profile.planId);
  if (toolName.includes("arrival") || result.code.startsWith("ARRIVAL_") || result.code === "ORDER_VERSION_CONFLICT") arrivalResult = await arrivalRepository.open();
  const manifest = await render();
  return {
    toolName,
    resultCode: result.code,
    planRevision: runtime.kernel.revision,
    profileId: runtime.kernel.profile.profileId,
    activeEventId: runtime.kernel.activeEventId,
    manifestHash: manifest.manifestHash,
  };
}, arrivalRepository) : null;
if (adapter) await adapter.register();

let busy = false;
let message = "";
const labMode = new URLSearchParams(location.search).get("lab") === "1";
let labAcceptanceResult: unknown = null;

const escapeHtml = (value: unknown): string => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#039;");

const money = (minor: number): string => new Intl.NumberFormat("en-AU", {
  style: "currency", currency: "AUD", maximumFractionDigits: 0,
}).format(minor / 100);

const announce = (value: string): void => {
  message = value;
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

const currentCodexHandoff = () => createCodexHandoff({
  siteOrigin: location.origin,
  inline: Boolean(modelContext),
  order: currentArrival(),
  plan: {
    planId: runtime.kernel.profile.planId,
    profileId: runtime.kernel.profile.profileId,
    revision: runtime.kernel.revision,
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
  const trigger = root.querySelector<HTMLButtonElement>("[data-action='open-codex-handoff']");
  trigger?.addEventListener("click", () => dialog?.showModal());
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
      <p class="arrival-header__mode">New finite plan / human order</p>
      <div class="identity-cluster">
        ${renderCodexHandoffButton()}
        <div class="operator-status"><span></span>${modelContext ? "Codex browser present" : "Saved kitchen"}</div>
        <div class="identity-pill"><span>${escapeHtml(authSession.displayName)}</span>${authSession.kind === "demo" ? `<button data-action="end-demo">End demo</button>` : `<a href="/signout-with-chatgpt?return_to=/">Sign out</a>`}</div>
      </div>
    </header>
    <main id="main" class="arrival-main">
      ${!order ? `
        <section class="arrival-intro" aria-labelledby="arrival_title">
          <p class="eyebrow">Place the order. The kitchen adapts.</p>
          <h1 id="arrival_title">What are we making <em>happen?</em></h1>
          <p>Describe the outcome in your own language. You do not need to choose a template, build a dashboard, or know what the plan should contain. Codex will interpret the order later; Finite preserves what you actually said now.</p>
        </section>
        ${message ? `<div class="service-message" role="status">${escapeHtml(message)}</div>` : ""}
        <form class="arrival-order" data-arrival-form="create">
          <label class="arrival-order__outcome"><span>The outcome</span><textarea name="rawOutcome" required maxlength="4000" placeholder="I need to…"></textarea><small>Write it like an order, not a form submission.</small></label>
          <div class="arrival-fields">
            <label><span>When does it need to happen?</span><input name="deadline" maxlength="200" placeholder="A date, window, or ‘not sure’"></label>
            <label><span>What is finite?</span><input name="finiteLimit" maxlength="300" placeholder="Money, time, capacity, energy—or none yet"></label>
            <label><span>What must not move?</span><input name="hardConstraint" maxlength="500" placeholder="One known commitment or hard edge"></label>
            <label><span>Evidence or useful links</span><input name="evidence" maxlength="1000" placeholder="Receipts, booking refs, documents, URLs"></label>
          </div>
          <div class="arrival-examples" aria-label="Example outcomes">
            <span>Examples, not templates</span>
            <button type="button" data-arrival-example="Plan a three-week Europe trip around my fixed flights, with room to change as prices and ideas move.">A trip</button>
            <button type="button" data-arrival-example="Get my renovation to handover without losing the parts of the design I care about.">A renovation</button>
            <button type="button" data-arrival-example="Deliver an event that can absorb guest, supplier and programme changes without falling apart.">An event</button>
            <button type="button" data-arrival-example="Help me turn a messy outcome with limited time and resources into a plan that can keep adapting.">Something else</button>
          </div>
          <button class="button arrival-order__submit" type="submit" ${busy ? "disabled" : ""}>Save my order</button>
        </form>` : `
        <section class="arrival-order-head" aria-labelledby="arrival_order_title">
          <div>
            <p class="eyebrow">Human order / version ${order.version}</p>
            <h1 id="arrival_order_title">${escapeHtml(order.rawOutcome)}</h1>
          </div>
          <aside class="arrival-state"><span>${escapeHtml(status?.label)}</span><h2>${escapeHtml(status?.title)}</h2><p>${escapeHtml(status?.detail)}</p><small>Order proof ${escapeHtml(order.checksum.slice(0, 16))}…</small></aside>
        </section>
        ${message ? `<div class="service-message" role="status">${escapeHtml(message)}</div>` : ""}
        ${question ? `<section class="arrival-question"><p class="eyebrow">One question from Codex</p><h2>${escapeHtml(question.prompt)}</h2><form data-arrival-form="answer"><label><span>Your answer</span><input name="answer" required maxlength="1000" ${question.answerKind === "date" ? "type=\"date\"" : ""}></label><button class="button" type="submit" ${busy ? "disabled" : ""}>Save my answer</button></form><small>Question ${escapeHtml(question.questionId)} · staged against an exact order version</small></section>` : ""}
        ${interpretation ? `<section class="arrival-interpretation">
          <div class="arrival-interpretation__head"><p class="eyebrow">Codex interpretation / not human fact</p><h2>${escapeHtml(interpretation.summary)}</h2><span>${interpretation.complete ? "Complete proposal" : "Work in progress"}</span></div>
          <div class="arrival-interpretation__grid">
            <article><span>Plan family</span><strong>${escapeHtml(interpretation.inferredFamily ?? "Still being inferred")}</strong></article>
            <article><span>Known</span><pre>${escapeHtml(JSON.stringify(interpretation.known, null, 2))}</pre></article>
            <article><span>Inferred</span><pre>${escapeHtml(JSON.stringify(interpretation.inferred, null, 2))}</pre></article>
            <article><span>Still missing</span><p>${interpretation.missing.length ? interpretation.missing.map((item) => escapeHtml(item)).join(" · ") : "Nothing currently blocking"}</p></article>
            ${interpretation.contradictions.length ? `<article class="is-warning"><span>Contradictions</span><p>${interpretation.contradictions.map((item) => escapeHtml(item)).join(" · ")}</p></article>` : ""}
          </div>
        </section>` : ""}
        ${renderPlanDraft()}
        <section class="arrival-continuity">
          <div><p class="eyebrow">Keep shaping the order</p><h2>Add something Codex must know.</h2><p>New facts are append-only. If Codex is already working, this creates a fresh version and invalidates stale staging automatically.</p></div>
          <form data-arrival-form="append">
            <label><span>Kind</span><select name="kind"><option value="detail">Detail</option><option value="constraint">Hard constraint</option><option value="preference">Preference</option><option value="commitment">Commitment</option><option value="correction">Correction</option><option value="evidence_reference">Evidence reference</option></select></label>
            <label><span>What changed or was missing?</span><textarea name="detail" required maxlength="2000" placeholder="Add the fact in your own words"></textarea></label>
            <button class="button" type="submit" ${busy ? "disabled" : ""}>Append to order</button>
          </form>
        </section>
        ${inputTrail.length ? `<details class="arrival-history"><summary>Recent human-supplied updates</summary><ol>${inputTrail.map((input) => `<li><span>${escapeHtml(input.kind)} · ${escapeHtml(input.sourceSurface)}</span><p>${escapeHtml(JSON.stringify(input.payload))}</p></li>`).join("")}</ol></details>` : ""}
      `}
      ${labMode ? `<details class="protocol-lab"><summary>Protocol lab</summary><pre>${escapeHtml(JSON.stringify({ modelContext: typeof document.modelContext, arrival: order, manifestHash: manifest.manifestHash, tools: adapter?.inventory() ?? [] }, null, 2))}</pre></details>` : ""}
    </main>
    <footer><p>The human orders. Codex operates. Finite keeps the work exact.</p><span>${order ? `Arrival · version ${order.version}` : "No plan yet"}</span></footer>
    ${renderCodexHandoffDialog()}`;
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

function bindArrivalInteractions(): void {
  bindCodexHandoffInteractions();
  root?.querySelector<HTMLFormElement>("[data-arrival-form='create']")?.addEventListener("submit", (event) => { event.preventDefault(); void submitArrivalOrder(event.currentTarget as HTMLFormElement); });
  root?.querySelector<HTMLFormElement>("[data-arrival-form='append']")?.addEventListener("submit", (event) => { event.preventDefault(); void appendArrivalDetail(event.currentTarget as HTMLFormElement); });
  root?.querySelector<HTMLFormElement>("[data-arrival-form='answer']")?.addEventListener("submit", (event) => { event.preventDefault(); void appendArrivalDetail(event.currentTarget as HTMLFormElement, true); });
  root?.querySelectorAll<HTMLButtonElement>("[data-arrival-example]").forEach((button) => button.addEventListener("click", () => {
    const textarea = root.querySelector<HTMLTextAreaElement>("textarea[name='rawOutcome']");
    if (textarea) { textarea.value = button.dataset.arrivalExample ?? ""; textarea.focus(); }
  }));
  root?.querySelector<HTMLButtonElement>("[data-action='confirm-plan']")?.addEventListener("click", (event) => { void confirmPlanDraft((event.currentTarget as HTMLButtonElement).dataset.draft ?? ""); });
  root?.querySelector<HTMLButtonElement>("[data-action='reject-plan']")?.addEventListener("click", (event) => { void rejectPlanDraft((event.currentTarget as HTMLButtonElement).dataset.draft ?? ""); });
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
  if (kernel.receipts.length || activeCandidates().length) return;
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
          : `<p class="refusal">${escapeHtml(candidate.violations.map((violation) => violation.code).join(", "))}</p>`}
      </article>`).join("")}
  </div>`;
};

const renderReceipt = (receipt: Receipt): string => {
  const after = receipt.payload.after as { bufferMinor?: number } | undefined;
  return `<div class="receipt">
    <div><span class="receipt__tick" aria-hidden="true">✓</span><p class="eyebrow">Served and receipted</p><h2>The accepted plan is now revision ${receipt.toRevision}.</h2></div>
    <dl>
      <div><dt>${escapeHtml(runtime.kernel.profile.surface.nouns.buffer)}</dt><dd>${typeof after?.bufferMinor === "number" ? money(after.bufferMinor) : money(runtime.kernel.accepted.bufferMinor)}</dd></div>
      <div><dt>Receipt</dt><dd>${escapeHtml(receipt.receiptId)}</dd></div>
      <div><dt>Replay proof</dt><dd>${escapeHtml(receipt.replayChecksum.slice(0, 12))}…</dd></div>
    </dl>
  </div>`;
};

const renderPlanDraft = (): string => {
  const draft = runtime.pendingPlanDraft;
  if (!draft) return "";
  const confirmation = runtime.planActivationConfirmation;
  const confirmed = confirmation?.draftId === draft.draftId;
  const amendment = draft.amendment;
  return `<section class="zone zone--approval_panel plan-intake" aria-label="New plan activation">
    <div class="zone__heading"><p class="eyebrow">New finite kitchen</p><h2>${escapeHtml(draft.profile.name)}</h2></div>
    <div class="approval-copy">
      <p>Codex compiled a complete <strong>${escapeHtml(draft.profile.profileId)}</strong> operating profile${amendment ? ` that supersedes <strong>${escapeHtml(amendment.supersedesPlanId)}</strong>` : ""}. Confirming authorizes only this exact packet; it does not activate the plan.</p>
      <div><span>Profile proof</span><strong>${escapeHtml(draft.profile.profileHash.slice(0, 16))}…</strong></div>
      <div><span>Draft proof</span><strong>${escapeHtml(draft.contentHash.slice(0, 16))}…</strong></div>
      ${amendment ? `<div><span>Amendment proof</span><strong>${escapeHtml(amendment.diffHash.slice(0, 16))}…</strong></div><p class="quiet">Changed: ${escapeHtml(amendment.diff.changedSections.join(", "))}</p>` : ""}
      ${confirmed
        ? `<p class="quiet">Human confirmation recorded. Codex can now activate this exact draft through WebMCP.</p>`
        : `<button class="button button--approve" data-action="confirm-plan" data-draft="${escapeHtml(draft.draftId)}">Confirm this exact kitchen</button>`}
      <button class="text-button" data-action="reject-plan" data-draft="${escapeHtml(draft.draftId)}">Not this kitchen</button>
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
    body = staged ? `<div class="approval-copy"><p>This commits exactly <strong>${escapeHtml(objectiveLabel(staged.objective))}</strong> against revision ${kernel.revision}. It changes no booking, purchase, or payment outside this demonstration.</p><div><span>Forecast change</span><strong>${staged.netForecastDeltaMinor >= 0 ? "+" : "−"}${money(Math.abs(staged.netForecastDeltaMinor))}</strong></div><div><span>${escapeHtml(kernel.profile.surface.nouns.buffer)} after</span><strong>${money(staged.resultingBufferMinor)}</strong></div><button class="button button--approve" data-action="approve">Approve this exact plan</button><button class="text-button" data-action="return">Not this one</button></div>` : `<p class="quiet">Choose an outcome before approval.</p>`;
  }
  return `<section class="zone zone--${escapeHtml(zone.component)}" id="${escapeHtml(zone.zoneId)}"><div class="zone__heading"><p class="eyebrow">${escapeHtml(manifest.nouns.plan)}</p><h2>${escapeHtml(zone.title)}</h2></div>${body}</section>`;
};

async function render(): Promise<SurfaceManifest> {
  const kernel = runtime.kernel;
  const manifest = await compileSurfaceManifest(kernel.profile, kernel);
  const params = new URLSearchParams(location.search);
  if (params.get("lab") !== "1" && params.get("kitchen") !== "1") {
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
        <div class="identity-pill"><span>${escapeHtml(authSession.displayName)}</span>${authSession.kind === "demo" ? `<button data-action="end-demo">End demo</button>` : `<a href="/signout-with-chatgpt?return_to=/">Sign out</a>`}</div>
      </div>
    </header>
    <main id="main">
      <section class="hero">
        <div class="hero__copy"><p class="eyebrow">${escapeHtml(kernel.profile.surface.hero.eyebrow)}</p><h1>${escapeHtml(manifest.title)}</h1><p class="hero__brief">${escapeHtml(manifest.brief)}</p><div class="brief-card"><span>You ordered</span><p>${escapeHtml(manifest.decisionFocus ?? kernel.profile.surface.hero.brief)}</p></div></div>
        <aside class="plan-orbit" aria-label="Current finite plan summary"><div class="orbit-number"><span>Total plan</span><strong>${money(kernel.accepted.totalBudgetMinor)}</strong></div><div class="orbit-ring" style="--used:${spentPercent}%"><div><strong>${money(kernel.accepted.bufferMinor)}</strong><span>${escapeHtml(kernel.profile.surface.nouns.buffer)} left</span></div></div><p>${spentPercent}% spent or committed. Every option below keeps the same finite total.</p></aside>
      </section>
      ${message ? `<div class="service-message" role="status">${escapeHtml(message)}</div>` : ""}
      ${renderPlanDraft()}
      ${receipt ? renderReceipt(receipt) : ""}
      <div class="surface-grid">${manifest.zones.map((zone) => renderZone(manifest, zone)).join("")}</div>
      ${labMode ? `<details class="protocol-lab" open><summary>Protocol lab</summary><p>This acceptance creates synthetic, receipted revision 3 changes in all three kitchens. The explicit click is the human test authority.</p><button class="button" data-action="run-handoff-acceptance" ${busy ? "disabled" : ""}>Run authenticated handoff acceptance</button><pre>${escapeHtml(JSON.stringify({ modelContext: typeof document.modelContext, crossOriginIsolated, profileId: kernel.profile.profileId, profileHash: kernel.profile.profileHash, revision: kernel.revision, manifestHash: manifest.manifestHash, tools: adapter?.inventory() ?? [], acceptance: labAcceptanceResult }, null, 2))}</pre></details>` : ""}
    </main>
    <footer><p>Codex operates the kitchen. You choose, approve and consume the result.</p><span>Finite plan · revision ${kernel.revision}</span></footer>
    ${renderCodexHandoffDialog()}`;
  bindInteractions();
  return manifest;
}

const chooseCandidate = async (candidateId: string): Promise<void> => {
  const result = await runtime.kernel.stageOption({ candidateId, expectedRevision: runtime.kernel.revision });
  announce(result.ok ? "Your chosen outcome is ready for exact approval." : `That outcome could not be staged: ${result.code}`);
  await render();
  document.querySelector("#approval_panel")?.scrollIntoView({ behavior: "smooth", block: "center" });
};

const approveAndApply = async (): Promise<void> => {
  const kernel = runtime.kernel;
  const candidate = kernel.stagedCandidate;
  if (!candidate) return;
  busy = true;
  await render();
  const approval = await kernel.humanApprove({ candidateId: candidate.candidateId, warningsAcknowledged: candidate.warnings.map((warning) => String(warning.code)) });
  const approvalId = (approval.approval as { approvalId?: string } | undefined)?.approvalId;
  if (!approvalId) { busy = false; announce(`Approval was not recorded: ${approval.code}`); await render(); return; }
  const applied = await kernel.applyApprovedOption({ candidateId: candidate.candidateId, approvalId, expectedRevision: kernel.revision, idempotencyKey: `surface-${kernel.profile.profileId}-${kernel.revision}-${candidate.contentHash.slice(0, 12)}` });
  busy = false;
  announce(applied.ok ? "Approved plan applied. Your revised plan and receipt are ready." : `The plan was not applied: ${applied.code}`);
  await render();
  document.querySelector(".receipt")?.scrollIntoView({ behavior: "smooth", block: "center" });
};

const switchProfile = async (profileId: ProfileId): Promise<void> => {
  if (profileId === runtime.kernel.profile.profileId || busy) return;
  busy = true;
  announce("");
  const result = await runtime.switchProfilePersisted(profileId);
  if (!result.ok) {
    busy = false;
    announce(`That plan could not be opened safely: ${result.code}`);
    await render();
    return;
  }
  localStorage.setItem("finite-plan.surface.active-profile", runtime.kernel.profile.planId);
  await adapter?.refreshContextualTools();
  await seedDecision();
  busy = false;
  await render();
  window.scrollTo({ top: 0, behavior: "smooth" });
};

const confirmPlanDraft = async (draftId: string): Promise<void> => {
  const result = runtime.humanConfirmPlanDraft({ draftId });
  announce(result.ok ? "Exact plan draft confirmed. Codex may now activate it through the guarded WebMCP tool." : `The plan draft was not confirmed: ${result.code}`);
  await render();
};

const rejectPlanDraft = async (draftId: string): Promise<void> => {
  const result = runtime.humanRejectPlanDraft({ draftId, reason: "Human returned the compiled plan from the consumption surface." });
  announce(result.ok ? "Plan draft returned. The active plan is unchanged." : `The plan draft was not returned: ${result.code}`);
  await render();
};

function bindInteractions(): void {
  bindCodexHandoffInteractions();
  root?.querySelectorAll<HTMLButtonElement>("[data-action='profile']").forEach((button) => button.addEventListener("click", () => switchProfile(button.dataset.profile as ProfileId)));
  root?.querySelectorAll<HTMLButtonElement>("[data-action='choose']").forEach((button) => button.addEventListener("click", () => chooseCandidate(String(button.dataset.candidate))));
  root?.querySelector<HTMLButtonElement>("[data-action='approve']")?.addEventListener("click", () => approveAndApply());
  root?.querySelector<HTMLButtonElement>("[data-action='return']")?.addEventListener("click", async () => { runtime.kernel.rejectStagedOption({ reason: "Human returned the staged option from the consumption surface." }); announce("Returned to the three viable outcomes. Accepted truth is unchanged."); await render(); });
  root?.querySelector<HTMLButtonElement>("[data-action='confirm-plan']")?.addEventListener("click", (event) => { void confirmPlanDraft((event.currentTarget as HTMLButtonElement).dataset.draft ?? ""); });
  root?.querySelector<HTMLButtonElement>("[data-action='reject-plan']")?.addEventListener("click", (event) => { void rejectPlanDraft((event.currentTarget as HTMLButtonElement).dataset.draft ?? ""); });
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
if (authStatus.session) await startKitchen(authStatus.session);
else renderAuthGate(authStatus.signInPath);
