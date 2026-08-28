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

export type StarterPlanItemSource = "request" | "known" | "working" | "human" | "open";

export interface StarterPlanItem {
  itemId: string;
  label: string;
  value?: unknown;
  valueKey?: string;
  valueParent?: Record<string, unknown>;
  source: StarterPlanItemSource;
}

export interface StarterPlanSection {
  sectionId: string;
  label: string;
  emptyLabel: string;
  items: StarterPlanItem[];
}

export interface StarterPlanPresentation {
  family: "travel" | "renovation" | "event" | "general";
  familyLabel: string;
  title: string;
  brief: string;
  sections: StarterPlanSection[];
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

type StarterSectionDefinition = Omit<StarterPlanSection, "items"> & { keywords: string[] };

const starterSections: Record<StarterPlanPresentation["family"], StarterSectionDefinition[]> = {
  travel: [
    { sectionId: "destinations", label: "Destinations", emptyLabel: "No destinations added yet.", keywords: ["destination", "place", "city", "country", "region", "stop", "visit", "route", "itinerary", "location"] },
    { sectionId: "travel", label: "Flights & travel", emptyLabel: "No flights or transport added yet.", keywords: ["flight", "airline", "airport", "booking", "transport", "train", "ferry", "car", "connection"] },
    { sectionId: "dates", label: "Dates & duration", emptyLabel: "No dates or duration added yet.", keywords: ["date", "day", "month", "year", "duration", "night", "week", "time", "window", "deadline", "when"] },
    { sectionId: "money", label: "Money", emptyLabel: "No budget or costs added yet.", keywords: ["budget", "cost", "price", "amount", "spend", "limit", "maximum", "minimum", "currency", "money", "cap"] },
    { sectionId: "commitments", label: "Commitments & fixed items", emptyLabel: "No fixed commitments added yet.", keywords: ["commitment", "fixed", "booked", "confirmed", "must", "constraint", "nonnegotiable", "hard"] },
    { sectionId: "open", label: "Open ideas & decisions", emptyLabel: "No open ideas or decisions added yet.", keywords: ["open", "optional", "preference", "idea", "possible", "flexible", "missing", "decision", "dependency"] },
  ],
  renovation: [
    { sectionId: "scope", label: "Spaces & scope", emptyLabel: "No spaces or scope items added yet.", keywords: ["space", "room", "scope", "design", "finish", "outcome", "area"] },
    { sectionId: "schedule", label: "Phases & dates", emptyLabel: "No phases or dates added yet.", keywords: ["phase", "date", "day", "month", "year", "duration", "schedule", "deadline", "when"] },
    { sectionId: "money", label: "Budget & costs", emptyLabel: "No budget or costs added yet.", keywords: ["budget", "cost", "quote", "price", "amount", "spend", "limit", "maximum", "minimum", "currency", "cap"] },
    { sectionId: "commitments", label: "Contractors, materials & commitments", emptyLabel: "No contractors, materials or commitments added yet.", keywords: ["contractor", "builder", "supplier", "material", "commitment", "fixed", "booked", "confirmed", "must", "constraint", "hard"] },
    { sectionId: "open", label: "Open decisions", emptyLabel: "No open decisions added yet.", keywords: ["open", "optional", "preference", "idea", "possible", "missing", "decision", "dependency"] },
  ],
  event: [
    { sectionId: "programme", label: "Programme", emptyLabel: "No programme items added yet.", keywords: ["programme", "program", "agenda", "schedule", "moment", "activity", "runofshow", "run_of_show"] },
    { sectionId: "people", label: "Guests & venue", emptyLabel: "No guests or venue details added yet.", keywords: ["guest", "people", "attendee", "capacity", "venue", "location", "place"] },
    { sectionId: "dates", label: "Dates & timing", emptyLabel: "No dates or timing added yet.", keywords: ["date", "day", "month", "year", "duration", "time", "window", "deadline", "when"] },
    { sectionId: "money", label: "Budget & costs", emptyLabel: "No budget or costs added yet.", keywords: ["budget", "cost", "quote", "price", "amount", "spend", "limit", "maximum", "minimum", "currency", "cap"] },
    { sectionId: "commitments", label: "Suppliers & commitments", emptyLabel: "No suppliers or commitments added yet.", keywords: ["supplier", "cater", "vendor", "commitment", "fixed", "booked", "confirmed", "must", "constraint", "hard"] },
    { sectionId: "open", label: "Open decisions", emptyLabel: "No open decisions added yet.", keywords: ["open", "optional", "preference", "idea", "possible", "missing", "decision", "dependency"] },
  ],
  general: [
    { sectionId: "items", label: "Plan items", emptyLabel: "No plan items added yet.", keywords: ["outcome", "item", "task", "step", "scope", "deliverable"] },
    { sectionId: "schedule", label: "Schedule", emptyLabel: "No schedule details added yet.", keywords: ["date", "day", "month", "year", "duration", "time", "window", "schedule", "deadline", "when"] },
    { sectionId: "money", label: "Resources & costs", emptyLabel: "No resources or costs added yet.", keywords: ["resource", "budget", "cost", "price", "amount", "spend", "limit", "maximum", "minimum", "currency", "cap"] },
    { sectionId: "commitments", label: "Commitments & limits", emptyLabel: "No commitments or limits added yet.", keywords: ["commitment", "fixed", "booked", "confirmed", "must", "constraint", "nonnegotiable", "hard"] },
    { sectionId: "open", label: "Open decisions", emptyLabel: "No open decisions added yet.", keywords: ["open", "optional", "preference", "idea", "possible", "missing", "decision", "dependency"] },
  ],
};

type FlatPlanFact = { path: string[]; label: string; value: unknown; valueKey: string; valueParent: Record<string, unknown> };

const flattenPlanFacts = (value: Record<string, unknown>, path: string[] = []): FlatPlanFact[] => Object.entries(value).flatMap(([key, child]) => {
  if (/^(?:source|questionId|internal.*|.*Path|.*Paths)$/i.test(key) || child === null || child === undefined || child === "") return [];
  const childPath = [...path, key];
  if (Array.isArray(child) || typeof child !== "object") return [{ path: childPath, label: humanLabel(key), value: child, valueKey: key, valueParent: value }];
  const nested = flattenPlanFacts(child as Record<string, unknown>, childPath);
  return nested.length ? nested : [];
});

const normalizedPath = (path: string[]): string => path.join(" ").replace(/[^a-z0-9]+/gi, "").toLowerCase();

const sectionForFact = (definitions: StarterSectionDefinition[], path: string[]): string => {
  const searchable = normalizedPath(path);
  return definitions.find((definition) => definition.keywords.some((keyword) => searchable.includes(keyword.replace(/[^a-z0-9]+/gi, "").toLowerCase())))?.sectionId
    ?? definitions[0]!.sectionId;
};

const safePayloadText = (payload: Record<string, unknown>, key: string): string => typeof payload[key] === "string" ? payload[key].trim() : "";

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
  const definitions = starterSections[family];
  const sectionItems = new Map(definitions.map((definition) => [definition.sectionId, [] as StarterPlanItem[]]));
  const addItem = (sectionId: string, item: StarterPlanItem): void => {
    const items = sectionItems.get(sectionId) ?? sectionItems.get(definitions[0]!.sectionId)!;
    const fingerprint = `${item.label.toLowerCase()}|${JSON.stringify(item.value)}`;
    if (!items.some((existing) => `${existing.label.toLowerCase()}|${JSON.stringify(existing.value)}` === fingerprint)) items.push(item);
  };
  const requestFacts = flattenPlanFacts(Object.fromEntries([
    ["when", order.structured.deadline],
    ["whatIsLimited", order.structured.finiteLimit],
    ["mustNotChange", order.structured.hardConstraint],
  ].filter((entry) => entry[1] !== null && entry[1] !== undefined && entry[1] !== "")));
  const addFacts = (facts: FlatPlanFact[], source: StarterPlanItemSource, prefix: string): void => facts.forEach((fact, index) => addItem(sectionForFact(definitions, fact.path), {
    itemId: `${prefix}_${index}`,
    label: fact.label,
    value: fact.value,
    valueKey: fact.valueKey,
    valueParent: fact.valueParent,
    source,
  }));
  addFacts(requestFacts, "request", "request");
  addFacts(flattenPlanFacts(interpretation.known), "known", "known");
  addFacts(flattenPlanFacts(interpretation.inferred), "working", "working");
  openItems.forEach((item, index) => addItem("open", { itemId: `open_${index}`, label: item, source: "open" }));
  laterHumanInputs.forEach((input, index) => {
    const requestedSection = safePayloadText(input.payload, "draftSection");
    const label = safePayloadText(input.payload, "label") || humanLabel(input.kind);
    const detail = safePayloadText(input.payload, "detail") || safePayloadText(input.payload, "text") || safePayloadText(input.payload, "value");
    const sectionId = definitions.some((definition) => definition.sectionId === requestedSection)
      ? requestedSection
      : sectionForFact(definitions, [label, detail, input.kind]);
    addItem(sectionId, { itemId: `human_${index}`, label, ...(detail ? { value: detail } : {}), source: "human" });
  });
  return {
    family,
    familyLabel: ({ travel: "Travel", renovation: "Renovation", event: "Event", general: "Adaptive" } as const)[family],
    title: `${({ travel: "Travel", renovation: "Renovation", event: "Event", general: "Adaptive" } as const)[family]} starter plan`,
    brief: interpretation.summary,
    sections: definitions.map(({ sectionId, label, emptyLabel }) => ({ sectionId, label, emptyLabel, items: sectionItems.get(sectionId) ?? [] })),
    laterHumanInputs,
    interpretationIsCurrent: laterHumanInputs.length === 0,
  };
};
