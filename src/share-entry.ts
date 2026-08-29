import { HttpPlanShareRepository, type PublicPlanProjection } from "./plan-share.js";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Finite host element is missing.");
const escapeHtml = (value: unknown): string => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const money = (minor: number): string => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(minor / 100);
const measure = (value: string | number, format: string): string => format === "money" && typeof value === "number" ? money(value) : format === "days" && typeof value === "number" ? `${value} day${value === 1 ? "" : "s"}` : format === "percent" && typeof value === "number" ? `${value}%` : String(value);
const brand = (): string => `<a class="brand" href="#main" aria-label="Finite home"><img src="/finite-wordmark.png" width="98" height="30" alt=""></a>`;

const projectionMarkup = (projection: PublicPlanProjection): string => {
  const { plan } = projection;
  return `<article class="published-plan" data-publication-mode="${escapeHtml(projection.mode)}"><header class="published-plan__hero"><p class="eyebrow">${escapeHtml(plan.eyebrow || `${plan.family} plan`)}</p><h1>${escapeHtml(plan.headline || plan.name)}</h1>${plan.brief ? `<p>${escapeHtml(plan.brief)}</p>` : ""}<dl class="published-plan__meta"><div><dt>Plan</dt><dd>${escapeHtml(plan.name)}</dd></div><div><dt>Revision</dt><dd>${plan.revision}</dd></div><div><dt>Status</dt><dd>${escapeHtml(plan.status)}</dd></div><div><dt>${projection.mode === "live" ? "Updated" : "Frozen"}</dt><dd>${escapeHtml(new Date(plan.updatedAt).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" }))}</dd></div></dl></header>
  ${plan.allocation ? `<section class="published-plan__allocation"><h2>The finite total</h2><dl><div><dt>Total</dt><dd>${money(plan.allocation.totalBudgetMinor)}</dd></div><div><dt>Spent</dt><dd>${money(plan.allocation.spentMinor)}</dd></div><div><dt>Committed</dt><dd>${money(plan.allocation.committedMinor)}</dd></div><div><dt>Forecast</dt><dd>${money(plan.allocation.forecastMinor)}</dd></div><div class="is-buffer"><dt>Remaining</dt><dd>${money(plan.allocation.bufferMinor)}</dd></div></dl></section>` : ""}
  ${plan.measures?.length ? `<section class="published-plan__measures"><h2>Key measures</h2><dl>${plan.measures.map((item) => `<div><dt>${escapeHtml(item.label)}</dt><dd>${escapeHtml(measure(item.value, item.format))}</dd></div>`).join("")}</dl></section>` : ""}
  ${plan.stages?.length ? `<section class="published-plan__stages"><h2>Plan stages</h2><ol>${plan.stages.map((stage) => `<li data-stage-status="${escapeHtml(stage.status)}"><span>${escapeHtml(stage.marker)}</span><div><strong>${escapeHtml(stage.label)}</strong><p>${escapeHtml(stage.detail)}</p></div><small>${escapeHtml(stage.status)}</small></li>`).join("")}</ol></section>` : ""}
  ${plan.changes?.length ? `<section class="published-plan__changes"><h2>Recent accepted changes</h2><ol>${plan.changes.map((change) => `<li><span>Revision ${change.revision}</span><strong>${escapeHtml(change.title)}</strong></li>`).join("")}</ol></section>` : ""}
  ${plan.outcome ? `<section class="published-plan__outcome"><h2>What happened</h2><blockquote>${escapeHtml(plan.outcome.note)}</blockquote><dl><div><dt>Completed</dt><dd>${plan.outcome.completedAt ? escapeHtml(new Date(plan.outcome.completedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })) : "Not recorded"}</dd></div><div><dt>Actual spend</dt><dd>${plan.outcome.actualSpendMinor === null ? "Not recorded" : money(plan.outcome.actualSpendMinor)}</dd></div></dl></section>` : ""}
  ${plan.progress ? `<section class="published-plan__progress"><h2>Progress · ${plan.progress.done} of ${plan.progress.total}</h2><ul>${plan.progress.items.map((item) => `<li><span aria-hidden="true">${item.status === "done" ? "✓" : "○"}</span><div><strong>${escapeHtml(item.label)}</strong>${item.contextLabel ? `<small>${escapeHtml(item.contextLabel)}</small>` : ""}</div></li>`).join("")}</ul></section>` : ""}
  ${plan.decisions?.length ? `<section class="published-plan__record"><h2>Decisions and updates</h2>${plan.decisions.map((item) => `<article><span>${escapeHtml(item.kind)}${item.contextLabel ? ` · ${escapeHtml(item.contextLabel)}` : ""}</span><p>${escapeHtml(item.message)}</p></article>`).join("")}</section>` : ""}
  ${plan.references?.length ? `<section class="published-plan__references"><h2>References</h2><ul>${plan.references.map((item) => `<li><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(item.kind)}${item.contextLabel ? ` · ${escapeHtml(item.contextLabel)}` : ""}</span>${item.value ? `<p>${escapeHtml(item.value)}</p>` : ""}</li>`).join("")}</ul></section>` : ""}</article>`;
};

export const renderShare = async (shareId: string): Promise<void> => {
  try {
    const shared = await new HttpPlanShareRepository().loadPublic(shareId);
    document.title = `${shared.publication.plan.name} — shared from Finite`;
    document.documentElement.dataset.skin = "quiet";
    root.setAttribute("aria-busy", "false");
    root.innerHTML = `<div class="publication-page"><header class="publication-header">${brand()}<div><span>${shared.publication.mode === "live" ? "Live view" : "Frozen snapshot"}</span><strong>View only</strong></div></header><main id="main" class="publication-main"><div class="publication-context"><p>Shared as</p><h2>${escapeHtml(shared.label)}</h2><span>Published ${escapeHtml(new Date(shared.publishedAt).toLocaleDateString(undefined, { dateStyle: "long" }))}</span></div>${projectionMarkup(shared.publication)}</main><footer class="publication-footer"><p>This is a read-only page selected and published by the plan owner.</p><span>No editing · no approval controls · no access to the full plan</span></footer></div>`;
  } catch (error) {
    document.title = "Shared page unavailable — Finite";
    root.setAttribute("aria-busy", "false");
    root.innerHTML = `<div class="publication-page"><header class="publication-header">${brand()}<div><strong>View only</strong></div></header><main id="main" class="publication-missing"><p class="eyebrow">Shared page unavailable</p><h1>This shared page is no longer available.</h1><p>${escapeHtml(error instanceof Error ? error.message : "This shared page is not available.")}</p></main></div>`;
  }
};
