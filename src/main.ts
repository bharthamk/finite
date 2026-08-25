import { compileBuiltInProfiles } from "./profiles.js";
import { PlanSnapshotStore } from "./persistence.js";
import { FinitePlanRuntime } from "./runtime.js";
import { compileSurfaceManifest, resolveSurfaceBinding } from "./surface.js";
import type { Candidate, ProfileId, Receipt, SurfaceManifest, SurfaceZone } from "./types.js";
import { FinitePlanWebMCPAdapter } from "./webmcp.js";

const root = document.querySelector<HTMLElement>("#app");
const announcer = document.querySelector<HTMLElement>("#announcer");
if (!root || !announcer) throw new Error("Finite host elements are missing.");

const profiles = await compileBuiltInProfiles();
const store = new PlanSnapshotStore(localStorage);
const savedProfile = localStorage.getItem("finite-plan.surface.active-profile");
const initialProfile: ProfileId = savedProfile === "renovation" || savedProfile === "event" ? savedProfile : "travel";
const runtime = new FinitePlanRuntime(profiles, store, initialProfile);
const modelContext = document.modelContext;
const adapter = modelContext ? new FinitePlanWebMCPAdapter(modelContext, runtime) : null;
if (adapter) await adapter.register();

let busy = false;
let message = "";
const labMode = new URLSearchParams(location.search).get("lab") === "1";

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
  .filter((candidate) => candidate.baseRevision === runtime.kernel.revision)
  .sort((a, b) => Number(b.valid) - Number(a.valid) || b.preferenceScore - a.preferenceScore);

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
  if (!candidates.length) return `<p class="quiet">No decision is waiting. The accepted plan is currently settled.</p>`;
  return `<div class="option-grid">
    ${candidates.map((candidate, index) => `
      <article class="option-card ${candidate.candidateId === runtime.kernel.stagedCandidate?.candidateId ? "is-staged" : ""}">
        <div class="option-card__top"><span>Route ${index + 1}</span><span>${candidate.valid ? "Viable" : "Blocked"}</span></div>
        <h3>${escapeHtml(objectiveLabel(candidate.objective))}</h3>
        <div class="option-card__number">${money(candidate.resultingBufferMinor)}</div>
        <p>left as ${escapeHtml(runtime.kernel.profile.surface.nouns.buffer)}</p>
        <ul>${candidate.selectedMoves.map((move) => `<li>${escapeHtml(move.tradeoff)}</li>`).join("")}</ul>
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

const renderZone = (manifest: SurfaceManifest, zone: SurfaceZone): string => {
  if (zone.collapsed) return "";
  const kernel = runtime.kernel;
  const actualsState = kernel.getState(["actuals"]).state as { actuals?: Array<{ label: string; currentAmountMinor: number }> };
  const latestEvent = [...kernel.events].reverse().find((event) => event.baseRevision === kernel.revision);
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

const render = async (): Promise<void> => {
  const kernel = runtime.kernel;
  const manifest = await compileSurfaceManifest(kernel.profile, kernel);
  const receipt = kernel.receipts.at(-1);
  const spentPercent = Math.round(((kernel.accepted.spentMinor + kernel.accepted.committedMinor) / kernel.accepted.totalBudgetMinor) * 100);
  root.dataset.profile = kernel.profile.profileId;
  root.setAttribute("aria-busy", String(busy));
  root.innerHTML = `
    <header class="site-header">
      <a class="brand" href="#main" aria-label="Finite home"><span>finite</span><i></i></a>
      <nav class="profile-nav" aria-label="Demonstration plan">
        ${(["travel", "renovation", "event"] as ProfileId[]).map((profileId) => `<button data-action="profile" data-profile="${profileId}" aria-pressed="${kernel.profile.profileId === profileId}">${profileId === "event" ? "Launch event" : profileId}</button>`).join("")}
      </nav>
      <div class="operator-status"><span></span>${modelContext ? "Codex kitchen connected" : "Local kitchen"}</div>
    </header>
    <main id="main">
      <section class="hero">
        <div class="hero__copy"><p class="eyebrow">${escapeHtml(kernel.profile.surface.hero.eyebrow)}</p><h1>${escapeHtml(manifest.title)}</h1><p class="hero__brief">${escapeHtml(manifest.brief)}</p><div class="brief-card"><span>You ordered</span><p>${escapeHtml(manifest.decisionFocus ?? kernel.profile.surface.hero.brief)}</p></div></div>
        <aside class="plan-orbit" aria-label="Current finite plan summary"><div class="orbit-number"><span>Total plan</span><strong>${money(kernel.accepted.totalBudgetMinor)}</strong></div><div class="orbit-ring" style="--used:${spentPercent}%"><div><strong>${money(kernel.accepted.bufferMinor)}</strong><span>${escapeHtml(kernel.profile.surface.nouns.buffer)} left</span></div></div><p>${spentPercent}% spent or committed. Every option below keeps the same finite total.</p></aside>
      </section>
      ${message ? `<div class="service-message" role="status">${escapeHtml(message)}</div>` : ""}
      ${receipt ? renderReceipt(receipt) : ""}
      <div class="surface-grid">${manifest.zones.map((zone) => renderZone(manifest, zone)).join("")}</div>
      ${labMode ? `<details class="protocol-lab"><summary>Protocol lab</summary><pre>${escapeHtml(JSON.stringify({ modelContext: typeof document.modelContext, crossOriginIsolated, profileId: kernel.profile.profileId, profileHash: kernel.profile.profileHash, revision: kernel.revision, manifestHash: manifest.manifestHash, tools: adapter?.inventory() ?? [] }, null, 2))}</pre></details>` : ""}
    </main>
    <footer><p>Codex operates the kitchen. You choose, approve and consume the result.</p><span>Finite plan · revision ${kernel.revision}</span></footer>`;
  bindInteractions();
};

const chooseCandidate = async (candidateId: string): Promise<void> => {
  const result = runtime.kernel.stageOption({ candidateId, expectedRevision: runtime.kernel.revision });
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
  const approval = kernel.humanApprove({ candidateId: candidate.candidateId, warningsAcknowledged: candidate.warnings.map((warning) => String(warning.code)) });
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
  busy = true; announce(""); runtime.switchProfile(profileId); localStorage.setItem("finite-plan.surface.active-profile", profileId); await adapter?.refreshContextualTools(); await seedDecision(); busy = false; await render(); window.scrollTo({ top: 0, behavior: "smooth" });
};

function bindInteractions(): void {
  root?.querySelectorAll<HTMLButtonElement>("[data-action='profile']").forEach((button) => button.addEventListener("click", () => switchProfile(button.dataset.profile as ProfileId)));
  root?.querySelectorAll<HTMLButtonElement>("[data-action='choose']").forEach((button) => button.addEventListener("click", () => chooseCandidate(String(button.dataset.candidate))));
  root?.querySelector<HTMLButtonElement>("[data-action='approve']")?.addEventListener("click", () => approveAndApply());
  root?.querySelector<HTMLButtonElement>("[data-action='return']")?.addEventListener("click", async () => { runtime.kernel.stagedCandidate = null; runtime.kernel.approval = null; announce("Returned to the three viable outcomes. Accepted truth is unchanged."); await render(); });
}

await seedDecision();
await render();
window.finitePlanCanary = { runtime, adapter, refresh: () => { void render(); } };
