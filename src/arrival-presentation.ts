import type { ArrivalClarification, ArrivalInput, ArrivalOrder } from "./arrival.js";

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

const presentText = (value: unknown): string | null => {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
};

export const hasInterpretationDetail = (value: Record<string, unknown>): boolean => Object.values(value).some((entry) => {
  if (Array.isArray(entry)) return entry.length > 0;
  if (entry !== null && typeof entry === "object") return hasInterpretationDetail(entry as Record<string, unknown>);
  return presentText(entry) !== null;
});

export const interpretationSourcesForDisplay = (
  order: Pick<ArrivalOrder, "rawOutcome" | "structured">,
  known: Record<string, unknown>,
): Record<string, unknown> => {
  if (hasInterpretationDetail(known)) return known;
  return Object.fromEntries([
    ["outcome", presentText(order.rawOutcome)],
    ["when", presentText(order.structured.deadline)],
    ["whatIsLimited", presentText(order.structured.finiteLimit)],
    ["mustNotChange", presentText(order.structured.hardConstraint)],
  ].filter((entry): entry is [string, string] => Boolean(entry[1])));
};

export const interpretationNeedsForDisplay = (
  missing: string[],
  question: ArrivalClarification | null,
): string[] => missing.length ? missing : question?.prompt ? [question.prompt] : [];

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

export interface StarterPlanStage {
  label: string;
  detail: string;
}

export interface StarterPlanPresentation {
  family: "travel" | "renovation" | "event" | "general";
  familyLabel: string;
  title: string;
  brief: string;
  stages: StarterPlanStage[];
  openItems: string[];
  laterHumanInputs: ArrivalInput[];
  interpretationIsCurrent: boolean;
}

const starterFamily = (value: string | null | undefined): StarterPlanPresentation["family"] => {
  const normalized = String(value ?? "").toLowerCase();
  if (normalized.includes("travel") || normalized.includes("trip") || normalized.includes("calendar")) return "travel";
  if (normalized.includes("renovation") || normalized.includes("build") || normalized.includes("phase")) return "renovation";
  if (normalized.includes("event") || normalized.includes("run_of_show") || normalized.includes("dinner")) return "event";
  return "general";
};

const starterStages: Record<StarterPlanPresentation["family"], StarterPlanStage[]> = {
  travel: [
    { label: "Protect the fixed parts", detail: "Keep confirmed dates, people, bookings, limits, and non-negotiables visible before choosing the route." },
    { label: "Shape the route", detail: "Arrange the main stops and leave optional parts movable until their timing and value are clearer." },
    { label: "Price the working plan", detail: "Add known costs first, keep unknown costs open, and show what remains available as choices change." },
    { label: "Choose what to commit", detail: "Review the next useful decisions before anything is booked, bought, or promised." },
    { label: "Keep it current", detail: "Record changes against the plan so the route, timing, and remaining limit stay coherent." },
  ],
  renovation: [
    { label: "Protect the fixed brief", detail: "Keep the outcome, design priorities, committed work, deadline, and hard limits visible." },
    { label: "Lay out the phases", detail: "Put the work in a useful order without pretending every dependency or date is settled." },
    { label: "Price what is known", detail: "Record quotes and commitments, leave unknown costs open, and show the remaining room to move." },
    { label: "Resolve the next dependency", detail: "Make the next choice or evidence need clear before later work becomes expensive to change." },
    { label: "Track changes to handover", detail: "Keep decisions, scope movement, costs, and completion work aligned as reality changes." },
  ],
  event: [
    { label: "Protect the outcome and limits", detail: "Keep the purpose, people, date, capacity, budget, and non-negotiables visible." },
    { label: "Shape the run of show", detail: "Lay out the major moments and leave details open where an early decision would add false certainty." },
    { label: "Plan people and suppliers", detail: "Show the next coordination, availability, and evidence needs without marking them as confirmed." },
    { label: "Price commitments", detail: "Add known costs, keep estimates separate, and show the remaining room as choices change." },
    { label: "Run and adapt", detail: "Keep the live plan, updates, and final outcome together through delivery and wrap-up." },
  ],
  general: [
    { label: "Protect what must stay true", detail: "Keep the outcome, hard limits, existing commitments, and important preferences visible." },
    { label: "Break the work into useful parts", detail: "Create a small working sequence without deciding details that are still genuinely open." },
    { label: "Show the finite picture", detail: "Record what is already used or committed and what remains available to plan." },
    { label: "Make the next decision clear", detail: "Keep open choices and evidence needs visible before consequential action." },
    { label: "Keep the plan current", detail: "Add changes as they happen so the working order remains useful." },
  ],
};

const inputVersion = (input: ArrivalInput): number => {
  const match = input.inputId.match(/_(\d+)$/);
  return match ? Number(match[1]) : 0;
};

export const starterPlanForArrival = (order: ArrivalOrder): StarterPlanPresentation | null => {
  const interpretation = order.interpretation;
  if (!interpretation?.complete) return null;
  const family = starterFamily(interpretation.inferredFamily);
  const basedOnVersion = interpretation.basedOnVersion ?? order.version;
  const laterHumanInputs = order.inputs.filter((input) => inputVersion(input) > basedOnVersion);
  const openItems = [...new Set([
    ...interpretation.dependencies.filter((dependency) => dependency.status === "open").map((dependency) => dependency.detail?.trim() || dependency.title.trim()),
    ...interpretation.missing.map((item) => item.trim()),
  ].filter(Boolean))];
  return {
    family,
    familyLabel: ({ travel: "Travel", renovation: "Renovation", event: "Event", general: "Adaptive" } as const)[family],
    title: `${({ travel: "Travel", renovation: "Renovation", event: "Event", general: "Adaptive" } as const)[family]} starter plan`,
    brief: interpretation.summary,
    stages: starterStages[family].map((stage) => ({ ...stage })),
    openItems,
    laterHumanInputs,
    interpretationIsCurrent: laterHumanInputs.length === 0,
  };
};
