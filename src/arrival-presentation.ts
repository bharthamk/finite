import type { ArrivalInput } from "./arrival.js";

const escapeHtml = (value: unknown): string => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#039;");

export const humanLabel = (value: string): string => {
  const labels: Record<string, string> = {
    maximumMinor: "Maximum",
    minimumMinor: "Minimum",
    currencyCode: "Currency",
    dayOfMonthApproximate: "Approximate day",
    originCountry: "Leaving from",
    optionalRegions: "Optional regions",
    planningShape: "Shape of the plan",
    budgetPressure: "Budget pressure",
  };
  if (labels[value]) return labels[value]!;
  const spaced = value.replaceAll("_", " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").trim();
  return spaced ? `${spaced.charAt(0).toUpperCase()}${spaced.slice(1)}` : "Detail";
};

const sourceLabel = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  if (value.startsWith("human_order")) return "From your original order";
  if (value.startsWith("arrival_input")) return "From your later answer";
  return "Source recorded";
};

const humanScalar = (value: unknown, key = "", parent: Record<string, unknown> = {}): string => {
  if (value === null || value === undefined || value === "") return "Not supplied yet";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number" && key.toLowerCase().endsWith("minor")) {
    const currency = typeof parent.currencyCode === "string" ? parent.currencyCode : "AUD";
    return new Intl.NumberFormat("en-AU", { style: "currency", currency, maximumFractionDigits: 0 }).format(value / 100);
  }
  if (typeof value === "number") return new Intl.NumberFormat("en-AU").format(value);
  const text = String(value);
  return /^[a-z0-9]+(?:_[a-z0-9]+)+$/.test(text) ? humanLabel(text).toLowerCase() : text;
};

export const renderHumanValue = (value: unknown, key = "", parent: Record<string, unknown> = {}, depth = 0): string => {
  if (depth > 4) return `<span class="interpretation-value">Additional structured detail saved</span>`;
  if (Array.isArray(value)) {
    if (!value.length) return `<span class="interpretation-value is-muted">None supplied</span>`;
    if (value.every((item) => item === null || typeof item !== "object")) {
      return `<ul class="interpretation-chips">${value.map((item) => `<li>${escapeHtml(humanScalar(item, key, parent))}</li>`).join("")}</ul>`;
    }
    return `<ol class="interpretation-records">${value.map((item) => `<li>${renderHumanValue(item, key, parent, depth + 1)}</li>`).join("")}</ol>`;
  }
  if (value !== null && typeof value === "object") {
    const fact = value as Record<string, unknown>;
    const entries = Object.entries(fact).filter(([entryKey]) => !/^(?:source|questionId|internal.*|.*Path|.*Paths)$/i.test(entryKey));
    const provenance = sourceLabel(fact.source);
    return `${entries.length ? `<dl class="interpretation-facts">${entries.map(([entryKey, entryValue]) => `<div><dt>${escapeHtml(humanLabel(entryKey))}</dt><dd>${renderHumanValue(entryValue, entryKey, fact, depth + 1)}</dd></div>`).join("")}</dl>` : `<span class="interpretation-value is-muted">No additional detail</span>`}${provenance ? `<small class="interpretation-provenance">${escapeHtml(provenance)}</small>` : ""}`;
  }
  return `<span class="interpretation-value${value === null || value === undefined || value === "" ? " is-muted" : ""}">${escapeHtml(humanScalar(value, key, parent))}</span>`;
};

export const renderTextList = (items: string[], empty: string): string => items.length
  ? `<ul class="interpretation-list">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
  : `<p class="interpretation-empty">${escapeHtml(empty)}</p>`;

export const inputKindLabel = (kind: ArrivalInput["kind"]): string => ({
  detail: "Detail",
  constraint: "Hard constraint",
  preference: "Preference",
  commitment: "Commitment",
  answer: "Answer",
  evidence_reference: "Evidence reference",
  correction: "Correction",
})[kind];

export const inputSurfaceLabel = (surface: ArrivalInput["sourceSurface"]): string => surface === "codex" ? "added with Codex" : "added on this page";
