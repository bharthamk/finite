import { compileBuiltInProfiles } from "./profiles.js";
import { MemoryStorage, PlanCatalogStore, PlanSnapshotStore } from "./persistence.js";
import { compileCatalogEntries, FinitePlanRuntime } from "./runtime.js";
import { compileSurfaceManifest, resolveSurfaceBinding } from "./surface.js";
import type { Candidate, ProfileId, Receipt, SurfaceManifest, SurfaceZone } from "./types.js";
import { FinitePlanWebMCPAdapter } from "./webmcp.js";
import { HttpAcceptedTruthRepository } from "./accepted-truth.js";

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
  document.title = "Finite — choose your kitchen";
  root.innerHTML = `
    <main class="entry-shell" id="main">
      <section class="entry-card" aria-labelledby="entry_title">
        <a class="brand" href="#main" aria-label="Finite home"><span>finite</span><i></i></a>
        <p class="eyebrow">One finite plan. Your private kitchen.</p>
        <h1 id="entry_title">Choose how you want to be served.</h1>
        <p class="entry-lede">Sign in to keep a private kitchen across visits, or try the complete service in an isolated demo that disappears after 24 hours.</p>
        <div class="entry-actions">
          <a class="button button--entry" href="${signInPath}">Continue with ChatGPT</a>
          <button class="button button--demo" data-action="start-demo">Try the demo</button>
        </div>
        <dl class="entry-promises">
          <div><dt>No Finite password</dt><dd>ChatGPT handles identity. Finite stores no credential.</dd></div>
          <div><dt>No registration form</dt><dd>Your private kitchen is created on first use.</dd></div>
          <div><dt>Demo means demo</dt><dd>It receives an isolated namespace, never a real user’s plan history.</dd></div>
        </dl>
        <p class="entry-footnote">Self-hosting? Your deployment can supply its own verified identity provider.</p>
      </section>
    </main>`;
  root.querySelector<HTMLButtonElement>("[data-action='start-demo']")?.addEventListener("click", async (event) => {
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
  });
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
const runtime = new FinitePlanRuntime(profiles, store, initialProfile, catalogStore, catalogEntries, () => new Date(), acceptedRepository);
await runtime.hydrateAcceptedTruth();
await runtime.resumeConstructionPacket();
const modelContext = document.modelContext;
const adapter = modelContext ? new FinitePlanWebMCPAdapter(modelContext, runtime, async ({ toolName, result }) => {
  if (["PLAN_ACTIVATED", "PLAN_AMENDMENT_ACTIVATED", "PLAN_SWITCHED", "PROFILE_SWITCHED"].includes(result.code)) localStorage.setItem("finite-plan.surface.active-profile", runtime.kernel.profile.planId);
  const manifest = await render();
  return {
    toolName,
    resultCode: result.code,
    planRevision: runtime.kernel.revision,
    profileId: runtime.kernel.profile.profileId,
    activeEventId: runtime.kernel.activeEventId,
    manifestHash: manifest.manifestHash,
  };
}) : null;
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
        <div class="operator-status"><span></span>${modelContext ? "Codex kitchen connected" : "Local kitchen"}</div>
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
    <footer><p>Codex operates the kitchen. You choose, approve and consume the result.</p><span>Finite plan · revision ${kernel.revision}</span></footer>`;
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

await seedDecision();
await render();
window.finitePlanCanary = { runtime, adapter, refresh: () => { void render(); } };
};

const authStatus = await loadAuthStatus();
if (authStatus.session) await startKitchen(authStatus.session);
else renderAuthGate(authStatus.signInPath);
