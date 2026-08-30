import { HttpPlanCollaborationRepository, PlanCollaborationRepositoryError, type PlanCollaborationRole, type PlanCollaborationView } from "./plan-collaboration.js";
import { projectionMarkup } from "./share-entry.js";
import { localDemoModeEnabled } from "./local-demo.js";

const root = document.querySelector<HTMLElement>("#app");
const announcer = document.querySelector<HTMLElement>("#announcer");
if (!root || !announcer) throw new Error("Finite host elements are missing.");

const escapeHtml = (value: unknown): string => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const brand = (): string => '<a class="brand" href="/" aria-label="Finite home"><img src="/finite-wordmark.png" width="98" height="30" alt=""></a>';
const roleCopy: Record<PlanCollaborationRole, { label: string; detail: string }> = {
  view: { label: "Can view", detail: "You can see the selected live plan. You cannot change it." },
  suggest: { label: "Can suggest", detail: "You can send suggestions. The owner decides whether they become part of the plan." },
  edit: { label: "Can edit the draft", detail: "You can add working-draft edits. Accepted plan truth and real-world actions remain owner-only." },
};
const repository = new HttpPlanCollaborationRepository();

const shell = (content: string): void => {
  document.documentElement.dataset.skin = "quiet";
  root.innerHTML = `<div class="collaboration-page"><header class="collaboration-header">${brand()}<a href="/">Open my Finite</a></header><main id="main" class="collaboration-main">${content}</main></div>`;
  root.setAttribute("aria-busy", "false");
};

const renderFailure = (title: string, message: string, signInPath?: string): void => {
  document.title = `${title} — Finite`;
  shell(`<section class="collaboration-card collaboration-card--message"><p class="eyebrow">Plan invitation</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>${signInPath ? `<a class="button" href="${escapeHtml(signInPath)}">Continue with ChatGPT</a>` : '<a class="button button--secondary" href="/">Return to Finite</a>'}</section>`);
};

const contributionList = (view: PlanCollaborationView): string => {
  const contributions = view.contributions ?? [];
  if (!contributions.length) return '<p class="collaboration-empty">You have not added anything yet.</p>';
  return `<ol class="collaboration-updates">${contributions.map((item) => `<li><div><span>${item.kind === "draft_edit" ? "Draft edit" : "Suggestion"} · ${escapeHtml(item.section)}</span><p>${escapeHtml(item.message)}</p></div><strong data-status="${escapeHtml(item.status)}">${escapeHtml(item.status)}</strong></li>`).join("")}</ol>`;
};

const renderActive = (token: string, view: PlanCollaborationView): void => {
  const invitation = view.invitation;
  const role = roleCopy[invitation.role];
  document.title = `${view.projection?.plan.name ?? "Plan invitation"} — Finite`;
  shell(`<section class="collaboration-intro"><div><p class="eyebrow">${escapeHtml(invitation.label)}</p><h1>You’ve been invited into this plan.</h1><p>${escapeHtml(role.detail)}</p></div><div class="collaboration-role"><span>Your access</span><strong>${escapeHtml(role.label)}</strong><small>Expires ${escapeHtml(new Date(invitation.expiresAt).toLocaleDateString(undefined, { dateStyle: "long" }))}</small></div></section>
    ${view.projection ? projectionMarkup(view.projection) : ""}
    ${invitation.role === "view" ? '<section class="collaboration-boundary"><strong>View only</strong><p>The owner can change or revoke this access at any time.</p></section>' : `<section class="collaboration-work"><header><p class="eyebrow">Work together</p><h2>${invitation.role === "edit" ? "Add to the working draft." : "Suggest a change."}</h2><p>Contributions stay visible as collaboration work. Only the owner can incorporate them into accepted plan truth.</p></header>
      <form data-collaboration-form>
        <label><span>Plan area</span><select name="section"><option value="general">Whole plan</option><option value="overview">Overview</option><option value="allocation">Budget or allocation</option><option value="stages">Timeline or stages</option><option value="progress">Progress</option><option value="references">References</option></select></label>
        ${invitation.role === "edit" ? '<fieldset><legend>Contribution type</legend><label><input type="radio" name="kind" value="draft_edit" checked> Edit the working draft</label><label><input type="radio" name="kind" value="suggestion"> Suggest a change</label></fieldset>' : '<input type="hidden" name="kind" value="suggestion">'}
        <label><span>${invitation.role === "edit" ? "Your draft change" : "Your suggestion"}</span><textarea name="message" minlength="1" maxlength="2000" required placeholder="Write the exact change and why it helps."></textarea></label>
        <button class="button" type="submit">${invitation.role === "edit" ? "Add draft change" : "Send suggestion"}</button><p class="collaboration-form-status" data-collaboration-status aria-live="polite"></p>
      </form>
      <section><h3>Your contributions</h3>${contributionList(view)}</section>
    </section>`}`);
  const form = root.querySelector<HTMLFormElement>("[data-collaboration-form]");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector<HTMLButtonElement>("button[type='submit']");
    const status = root.querySelector<HTMLElement>("[data-collaboration-status]");
    const data = new FormData(form);
    if (button) button.disabled = true;
    if (status) status.textContent = "Saving…";
    try {
      await repository.contribute(token, { kind: data.get("kind") === "draft_edit" ? "draft_edit" : "suggestion", section: String(data.get("section") ?? "general"), message: String(data.get("message") ?? "") });
      announcer.textContent = "Contribution saved for the plan owner.";
      await loadAndRender(token);
    } catch (error) {
      if (status) status.textContent = error instanceof Error ? error.message : "That contribution could not be saved.";
      if (button) button.disabled = false;
    }
  });
};

const renderClaim = (token: string, view: PlanCollaborationView): void => {
  const role = roleCopy[view.invitation.role];
  document.title = "Join a Finite plan";
  shell(`<section class="collaboration-card collaboration-card--claim"><p class="eyebrow">${escapeHtml(view.invitation.label)}</p><h1>Join this Finite plan.</h1><div class="collaboration-role"><span>Access offered</span><strong>${escapeHtml(role.label)}</strong><small>${escapeHtml(role.detail)}</small></div><p>This invitation becomes tied to this signed-in account. It cannot be passed to another account after you join.</p><button type="button" class="button" data-action="claim-collaboration">Join plan</button><p data-claim-status aria-live="polite"></p></section>`);
  root.querySelector<HTMLButtonElement>("[data-action='claim-collaboration']")?.addEventListener("click", async (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    const status = root.querySelector<HTMLElement>("[data-claim-status]");
    button.disabled = true;
    if (status) status.textContent = "Joining…";
    try { await repository.claim(token); await loadAndRender(token); }
    catch (error) { button.disabled = false; if (status) status.textContent = error instanceof Error ? error.message : "The invitation could not be claimed."; }
  });
};

const loadAndRender = async (token: string): Promise<void> => {
  try {
    const view = await repository.load(token);
    if (view.claimRequired) renderClaim(token, view); else renderActive(token, view);
  } catch (error) {
    const message = error instanceof Error ? error.message : "This invitation is not available.";
    renderFailure(error instanceof PlanCollaborationRepositoryError && error.status === 401 ? "Sign in to open this invitation" : "Invitation unavailable", message);
  }
};

export const renderCollaboration = async (token: string, session: { kind: "account" | "demo" } | null, signInPath?: string): Promise<void> => {
  if (!session) {
    const returnTo = `${location.pathname}${location.search}`;
    const signIn = new URL(signInPath ?? "/signin-with-chatgpt", location.origin);
    signIn.searchParams.set("return_to", returnTo);
    renderFailure("Sign in to open this invitation", "Finite ties collaboration access to one account so the link cannot become anonymous editing access.", `${signIn.pathname}${signIn.search}`);
    return;
  }
  if (session.kind !== "account") {
    renderFailure("Use a signed-in account", "Temporary demos stay isolated and cannot claim another person’s plan invitation.");
    return;
  }
  if (localDemoModeEnabled(localStorage)) {
    renderFailure("Demo mode is local only", "Turn off Demo mode in Finite settings before opening an invitation. Local work is never uploaded or mixed into another person’s plan.");
    return;
  }
  await loadAndRender(token);
};
