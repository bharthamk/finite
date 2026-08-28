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

export type StarterPlanItemSource = "request" | "known" | "working" | "starter" | "human" | "open";

export interface StarterPlanField {
  fieldId: string;
  label: string;
  inputType: "text" | "date" | "number" | "textarea" | "select";
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
}

export interface StarterPlanItem {
  itemId: string;
  label: string;
  fields: Record<string, string | boolean>;
  source: StarterPlanItemSource;
}

export interface StarterPlanSection {
  sectionId: string;
  label: string;
  description: string;
  emptyLabel: string;
  variant: "calendar" | "stays" | "transport" | "money" | "requirements" | "checklist" | "cards";
  fields: StarterPlanField[];
  items: StarterPlanItem[];
  comments: Array<{ commentId: string; text: string; forCodex: boolean }>;
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

type StarterSectionDefinition = Omit<StarterPlanSection, "items" | "comments"> & { keywords: string[] };

const field = (fieldId: string, label: string, inputType: StarterPlanField["inputType"] = "text", placeholder = "", options?: StarterPlanField["options"]): StarterPlanField => ({ fieldId, label, inputType, ...(placeholder ? { placeholder } : {}), ...(options ? { options } : {}) });
const statusOptions = [{ value: "open", label: "Not started" }, { value: "in_progress", label: "In progress" }, { value: "ready", label: "Ready" }];
const moneyRoleOptions = [{ value: "limit", label: "Overall limit" }, { value: "daily", label: "Daily budget" }, { value: "cost", label: "Planned cost" }];
const scheduleFields = [field("title", "Stop or item", "text", "Name this part of the plan"), field("location", "Location", "text", "City, venue, room, or place"), field("start", "Start", "date"), field("end", "End", "date"), field("notes", "Notes", "textarea", "What is fixed, flexible, or still unknown?")];
const travelScheduleFields = [field("title", "Stop", "text", "City, region, visit, or event"), field("location", "Location", "text", "City or area"), field("start", "Arrive", "date"), field("end", "Leave", "date"), field("dailyBudget", "Daily spend", "number", "0"), field("currency", "Currency", "text", "AUD"), field("notes", "Notes", "textarea", "What is fixed, flexible, or still unknown?")];
const moneyFields = [field("title", "Budget item", "text", "Total budget, daily spend, known cost…"), field("amount", "Amount", "number", "0"), field("currency", "Currency", "text", "AUD"), field("moneyRole", "Counts as", "select", "", moneyRoleOptions), field("notes", "Notes", "textarea")];
const requirementFields = [field("title", "Requirement", "text", "Visa, insurance, permit, approval…"), field("status", "Status", "select", "", statusOptions), field("due", "Due", "date"), field("notes", "Notes", "textarea")];
const taskFields = [field("title", "To-do", "text", "What needs to happen?"), field("due", "Due", "date"), field("notes", "Notes", "textarea")];

const starterSections: Record<StarterPlanPresentation["family"], StarterSectionDefinition[]> = {
  travel: [
    { sectionId: "itinerary", label: "Route & calendar", description: "Put places in order, add dates and daily spend, and drag stops when the route changes.", emptyLabel: "No route stops added yet.", variant: "calendar", fields: travelScheduleFields, keywords: ["destination", "place", "city", "country", "region", "stop", "visit", "route", "itinerary", "location", "date", "day", "month", "year", "duration", "week", "window", "deadline", "when"] },
    { sectionId: "stays", label: "Where you’re staying", description: "Track each stay, its dates, and the nightly amount you want to allow.", emptyLabel: "No accommodation added yet.", variant: "stays", fields: [field("title", "Stay", "text", "Hotel, hostel, apartment, friend…"), field("location", "Location", "text", "City or area"), field("start", "Check-in", "date"), field("end", "Check-out", "date"), field("nightlyBudget", "Nightly budget", "number", "0"), field("currency", "Currency", "text", "AUD"), field("notes", "Notes", "textarea")], keywords: ["accommodation", "hotel", "hostel", "lodging", "stay", "nightly", "checkin", "checkout"] },
    { sectionId: "transport", label: "Flights & transport", description: "Keep options and confirmed legs together without pretending an option is booked.", emptyLabel: "No flights or transport added yet.", variant: "transport", fields: [field("title", "Flight or transport", "text", "Flight, train, bus, ferry…"), field("from", "From", "text"), field("to", "To", "text"), field("start", "Departure", "date"), field("provider", "Provider / flight", "text", "Airline, train, flight number…"), field("cost", "Planned cost", "number", "0"), field("currency", "Currency", "text", "AUD"), field("reference", "Booking or option link", "text", "Optional"), field("notes", "Notes", "textarea")], keywords: ["flight", "airline", "airport", "booking", "transport", "train", "ferry", "bus", "car", "connection"] },
    { sectionId: "money", label: "Money", description: "See the overall limit, daily target, planned costs, and what remains unallocated.", emptyLabel: "No budget or costs added yet.", variant: "money", fields: moneyFields, keywords: ["budget", "cost", "price", "amount", "spend", "limit", "maximum", "minimum", "currency", "money", "cap", "daily"] },
    { sectionId: "requirements", label: "Visa, insurance & fixed items", description: "Keep travel requirements and non-negotiable commitments visible.", emptyLabel: "No requirements or fixed items added yet.", variant: "requirements", fields: requirementFields, keywords: ["visa", "insurance", "passport", "requirement", "commitment", "fixed", "booked", "confirmed", "must", "constraint", "nonnegotiable", "hard"] },
    { sectionId: "tasks", label: "To-do list", description: "Tick off work you can do yourself and reopen it whenever reality changes.", emptyLabel: "Nothing on the to-do list yet.", variant: "checklist", fields: taskFields, keywords: ["open", "optional", "preference", "idea", "possible", "flexible", "missing", "decision", "dependency", "todo", "task"] },
  ],
  renovation: [
    { sectionId: "schedule", label: "Phases & calendar", description: "Arrange the work and move phases as dependencies change.", emptyLabel: "No phases added yet.", variant: "calendar", fields: scheduleFields, keywords: ["phase", "date", "day", "month", "year", "duration", "schedule", "deadline", "when"] },
    { sectionId: "scope", label: "Spaces & scope", description: "Keep rooms, work packages and finish choices editable.", emptyLabel: "No spaces or scope items added yet.", variant: "cards", fields: [field("title", "Space or work item"), field("location", "Area"), field("cost", "Planned cost", "number"), field("notes", "Scope and finish notes", "textarea")], keywords: ["space", "room", "scope", "design", "finish", "outcome", "area"] },
    { sectionId: "resources", label: "Contractors & materials", description: "Track people, quotes, suppliers and materials.", emptyLabel: "No contractors or materials added yet.", variant: "cards", fields: [field("title", "Contractor or material"), field("provider", "Supplier"), field("start", "Needed by", "date"), field("cost", "Planned cost", "number"), field("notes", "Notes", "textarea")], keywords: ["contractor", "builder", "supplier", "material", "quote"] },
    { sectionId: "money", label: "Budget & costs", description: "Track the limit, allowances and planned costs.", emptyLabel: "No budget or costs added yet.", variant: "money", fields: moneyFields, keywords: ["budget", "cost", "price", "amount", "spend", "limit", "maximum", "minimum", "currency", "cap"] },
    { sectionId: "requirements", label: "Approvals & fixed items", description: "Keep permits, approvals and non-negotiables visible.", emptyLabel: "No approvals or fixed items added yet.", variant: "requirements", fields: requirementFields, keywords: ["approval", "permit", "commitment", "fixed", "booked", "confirmed", "must", "constraint", "hard"] },
    { sectionId: "tasks", label: "To-do list", description: "Track practical work without waiting for Codex.", emptyLabel: "Nothing on the to-do list yet.", variant: "checklist", fields: taskFields, keywords: ["open", "optional", "preference", "idea", "possible", "missing", "decision", "dependency", "todo", "task"] },
  ],
  event: [
    { sectionId: "schedule", label: "Programme & calendar", description: "Arrange the run of show and change timing directly.", emptyLabel: "No programme items added yet.", variant: "calendar", fields: scheduleFields, keywords: ["programme", "program", "agenda", "schedule", "moment", "activity", "runofshow", "date", "time", "deadline", "when"] },
    { sectionId: "scope", label: "Guests & venue", description: "Track people, capacity, rooms and venue choices.", emptyLabel: "No guests or venue details added yet.", variant: "cards", fields: [field("title", "Guest group or venue"), field("location", "Location"), field("start", "Date", "date"), field("cost", "Planned cost", "number"), field("notes", "Notes", "textarea")], keywords: ["guest", "people", "attendee", "capacity", "venue", "location", "place"] },
    { sectionId: "resources", label: "Suppliers & logistics", description: "Track suppliers, travel, equipment and delivery details.", emptyLabel: "No suppliers or logistics added yet.", variant: "cards", fields: [field("title", "Supplier or logistic item"), field("provider", "Provider"), field("start", "Due", "date"), field("cost", "Planned cost", "number"), field("notes", "Notes", "textarea")], keywords: ["supplier", "cater", "vendor", "transport", "equipment", "logistic"] },
    { sectionId: "money", label: "Budget & costs", description: "Track the limit, allowances and planned costs.", emptyLabel: "No budget or costs added yet.", variant: "money", fields: moneyFields, keywords: ["budget", "cost", "quote", "price", "amount", "spend", "limit", "maximum", "minimum", "currency", "cap"] },
    { sectionId: "requirements", label: "Requirements & commitments", description: "Keep approvals, bookings and fixed commitments visible.", emptyLabel: "No requirements or commitments added yet.", variant: "requirements", fields: requirementFields, keywords: ["approval", "requirement", "commitment", "fixed", "booked", "confirmed", "must", "constraint", "hard"] },
    { sectionId: "tasks", label: "To-do list", description: "Track practical work without waiting for Codex.", emptyLabel: "Nothing on the to-do list yet.", variant: "checklist", fields: taskFields, keywords: ["open", "optional", "preference", "idea", "possible", "missing", "decision", "dependency", "todo", "task"] },
  ],
  general: [
    { sectionId: "schedule", label: "Schedule", description: "Arrange dated work and move it when the plan changes.", emptyLabel: "No schedule items added yet.", variant: "calendar", fields: scheduleFields, keywords: ["date", "day", "month", "year", "duration", "time", "window", "schedule", "deadline", "when"] },
    { sectionId: "scope", label: "Plan items", description: "Keep the plan’s concrete parts editable.", emptyLabel: "No plan items added yet.", variant: "cards", fields: [field("title", "Plan item"), field("location", "Where or who"), field("start", "When", "date"), field("cost", "Planned cost", "number"), field("notes", "Notes", "textarea")], keywords: ["outcome", "item", "step", "scope", "deliverable"] },
    { sectionId: "resources", label: "People & resources", description: "Track capacity, providers and resources.", emptyLabel: "No people or resources added yet.", variant: "cards", fields: [field("title", "Person or resource"), field("provider", "Provider or owner"), field("cost", "Planned cost", "number"), field("notes", "Notes", "textarea")], keywords: ["person", "people", "resource", "provider", "supplier"] },
    { sectionId: "money", label: "Money", description: "Track the limit, allowances and planned costs.", emptyLabel: "No budget or costs added yet.", variant: "money", fields: moneyFields, keywords: ["budget", "cost", "price", "amount", "spend", "limit", "maximum", "minimum", "currency", "cap"] },
    { sectionId: "requirements", label: "Requirements & limits", description: "Keep approvals, commitments and hard limits visible.", emptyLabel: "No requirements or limits added yet.", variant: "requirements", fields: requirementFields, keywords: ["approval", "requirement", "commitment", "fixed", "confirmed", "must", "constraint", "nonnegotiable", "hard"] },
    { sectionId: "tasks", label: "To-do list", description: "Track practical work without waiting for Codex.", emptyLabel: "Nothing on the to-do list yet.", variant: "checklist", fields: taskFields, keywords: ["open", "optional", "preference", "idea", "possible", "missing", "decision", "dependency", "todo", "task"] },
  ],
};

type FlatPlanFact = { path: string[]; label: string; value: unknown; valueKey: string; valueParent: Record<string, unknown> };

const flattenPlanFacts = (value: Record<string, unknown>, path: string[] = []): FlatPlanFact[] => Object.entries(value).flatMap(([key, child]) => {
  if (/^(?:source|currencyCode|questionId|internal.*|.*Path|.*Paths)$/i.test(key) || child === null || child === undefined || child === "") return [];
  const childPath = [...path, key];
  if (Array.isArray(child) || typeof child !== "object") return [{ path: childPath, label: humanLabel(key), value: child, valueKey: key, valueParent: value }];
  const nested = flattenPlanFacts(child as Record<string, unknown>, childPath);
  return nested.length ? nested : [];
});

const normalizedPath = (path: string[]): string => path.join(" ").replace(/[^a-z0-9]+/gi, "").toLowerCase();

const sectionForFact = (definitions: StarterSectionDefinition[], path: string[]): string => {
  const searchable = normalizedPath(path);
  const qualifier = /^(?:open|optional|preference|idea|possible|flexible|missing|decision|dependency|fixed|confirmed|must|hard)$/;
  return definitions.map((definition) => ({ definition, score: Math.max(0, ...definition.keywords.filter((keyword) => searchable.includes(keyword.replace(/[^a-z0-9]+/gi, "").toLowerCase())).map((keyword) => qualifier.test(keyword) ? 1 : keyword.length)) }))
    .sort((a, b) => b.score - a.score)[0]?.definition.sectionId ?? definitions[0]!.sectionId;
};

const safePayloadText = (payload: Record<string, unknown>, key: string): string => typeof payload[key] === "string" ? payload[key].trim() : "";
const plainValue = (value: unknown, key = "", parent: Record<string, unknown> = {}): string => Array.isArray(value)
  ? value.map((item) => plainValue(item, key, parent)).filter(Boolean).join(", ")
  : value !== null && typeof value === "object"
    ? Object.entries(value as Record<string, unknown>).filter(([childKey]) => !/^(?:source|questionId|internal.*|.*Path|.*Paths)$/i.test(childKey)).map(([childKey, child]) => `${humanLabel(childKey)}: ${plainValue(child, childKey, value as Record<string, unknown>)}`).join(" · ")
    : humanScalar(value, key, parent);
const safeFields = (value: unknown): Record<string, string | boolean> => value !== null && typeof value === "object" && !Array.isArray(value)
  ? Object.entries(value as Record<string, unknown>).reduce<Record<string, string | boolean>>((fields, [key, child]) => {
    if (typeof child === "string" || typeof child === "boolean") fields[key] = child;
    if (typeof child === "number") fields[key] = String(child);
    return fields;
  }, {})
  : {};
const sectionAliases: Record<string, string> = { destinations: "itinerary", dates: "itinerary", travel: "transport", commitments: "requirements", open: "tasks", programme: "schedule", people: "scope", items: "scope" };

const fieldsForFact = (sectionId: string, fact: FlatPlanFact, value = fact.value): Record<string, string | boolean> => {
  const text = plainValue(value, fact.valueKey, fact.valueParent);
  const path = normalizedPath(fact.path);
  if (sectionId === "money") return { title: fact.label, amount: text.replace(/[^0-9.-]/g, ""), currency: typeof fact.valueParent.currencyCode === "string" ? fact.valueParent.currencyCode : /a\$/i.test(text) ? "AUD" : "", moneyRole: /daily|perday/.test(path) ? "daily" : /limit|budget|maximum|cap/.test(path) ? "limit" : "cost", notes: text };
  if (sectionId === "tasks") return { title: text === "Not supplied yet" ? fact.label : text, notes: text === fact.label ? "" : fact.label, done: false };
  if (sectionId === "requirements") return { title: /mustnotchange|constraint|commitment/.test(path) ? text : fact.label, status: "open", notes: text };
  if (sectionId === "itinerary" || sectionId === "schedule") return /date|day|month|year|when|deadline|window/.test(path) ? { title: fact.label, start: text, notes: text } : { title: text, location: text, notes: fact.label };
  if (sectionId === "transport") return { title: text, notes: fact.label };
  if (sectionId === "stays") return { title: fact.label, location: /location|city|place/.test(path) ? text : "", nightlyBudget: /cost|budget|price|nightly/.test(path) ? text.replace(/[^0-9.-]/g, "") : "", notes: text };
  return { title: fact.label, notes: text };
};

const dateIso = (value: string, fallbackYear: number): string => {
  const text = value.trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const timestamp = Date.parse(`${/\b20\d{2}\b/.test(text) ? text : `${text} ${fallbackYear}`} UTC`);
  if (!Number.isFinite(timestamp)) return "";
  return new Date(timestamp).toISOString().slice(0, 10);
};

const addDays = (value: string, days: number): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const travelAllowance = (location: string): { daily: number; nightly: number } => {
  const normalized = location.toLowerCase();
  const rates: Array<[RegExp, number, number]> = [
    [/london/, 150, 170], [/paris/, 140, 160], [/munich/, 130, 150], [/berlin/, 120, 135], [/helsinki|finland/, 135, 145],
    [/tallinn|estonia/, 95, 105], [/budapest|hungary/, 85, 90], [/krak|warsaw|poland/, 80, 85], [/tirana|albania/, 75, 75],
    [/prague/, 90, 100], [/vienna/, 115, 125],
  ];
  const match = rates.find(([pattern]) => pattern.test(normalized));
  return match ? { daily: match[1], nightly: match[2] } : { daily: 110, nightly: 120 };
};

const seedRoughPlan = (
  family: StarterPlanPresentation["family"],
  order: ArrivalOrder,
  sectionItems: Map<string, StarterPlanItem[]>,
  addItem: (sectionId: string, item: StarterPlanItem) => void,
): void => {
  const seed = (sectionId: string, itemId: string, label: string, fields: Record<string, string | boolean>): void => addItem(sectionId, { itemId: `starter_${itemId}`, label, fields, source: "starter" });
  const tasks = sectionItems.get("tasks") ?? [];
  const requirements = sectionItems.get("requirements") ?? [];
  if (family === "travel") {
    const itinerary = sectionItems.get("itinerary") ?? [];
    const year = Number(`${order.rawOutcome} ${order.interpretation?.summary ?? ""}`.match(/\b(20\d{2})\b/)?.[1] ?? new Date().getUTCFullYear());
    const dateOnly = itinerary.filter((item) => !String(item.fields.location ?? "").trim() && String(item.fields.start ?? "").trim());
    const firstDate = dateIso(String(dateOnly[0]?.fields.start ?? ""), year);
    dateOnly.forEach((item) => itinerary.splice(itinerary.indexOf(item), 1));
    let locations = itinerary.filter((item) => String(item.fields.location ?? "").trim() && !/leaving from|origin/i.test(item.label));
    const sourceText = `${order.rawOutcome} ${JSON.stringify(order.structured)} ${order.interpretation?.summary ?? ""} ${JSON.stringify(order.interpretation?.known ?? {})} ${JSON.stringify(order.interpretation?.inferred ?? {})}`;
    if (!locations.length) {
      const hints: Array<[RegExp, string]> = [[/oktoberfest/i, "Munich"], [/budapest|hungary/i, "Budapest"], [/poland/i, "Kraków"], [/estonia/i, "Tallinn"], [/finland/i, "Helsinki"], [/albania/i, "Tirana"], [/germany/i, "Berlin"], [/france/i, "Paris"], [/italy/i, "Milan"]];
      const inferredStops = hints.filter(([pattern]) => pattern.test(sourceText)).map(([, location]) => location);
      const fallbackStops = inferredStops.length ? inferredStops : /europe/i.test(sourceText) ? ["Berlin", "Prague", "Vienna"] : ["First destination"];
      fallbackStops.forEach((location, index) => seed("itinerary", `route_${index}`, location, { title: location, location, notes: "Rough first-pass stop — change or remove it." }));
      locations = sectionItems.get("itinerary")!.filter((item) => String(item.fields.location ?? "").trim());
    }
    locations.forEach((item, index) => {
      const location = String(item.fields.location || item.fields.title);
      const allowance = travelAllowance(location);
      if (!item.fields.start && firstDate) item.fields.start = addDays(firstDate, index * 4);
      if (!item.fields.end && item.fields.start) item.fields.end = addDays(String(item.fields.start), 3);
      if (!item.fields.dailyBudget) item.fields.dailyBudget = String(allowance.daily);
      if (!item.fields.currency) item.fields.currency = "AUD";
      item.fields.notes = `${String(item.fields.notes ?? "").trim()}${item.fields.notes ? " · " : ""}Rough timing and daily allowance; not live checked.`;
      if (item.source !== "human") item.source = "starter";
      seed("stays", `stay_${index}`, `Flexible mid-range stay · ${location}`, { title: "Flexible mid-range stay", location, start: String(item.fields.start ?? ""), end: String(item.fields.end ?? ""), nightlyBudget: String(allowance.nightly), currency: "AUD", notes: "Indicative planning allowance; no availability has been checked." });
    });
    const routeLocations = locations.map((item) => String(item.fields.location || item.fields.title));
    const origin = itinerary.find((item) => /leaving from|origin/i.test(item.label))?.fields.location;
    if (routeLocations.length && !(sectionItems.get("transport") ?? []).length) {
      seed("transport", "arrival_flight", `Flight to ${routeLocations[0]}`, { title: "Long-haul flight option", from: String(origin || "Home airport"), to: routeLocations[0]!, start: firstDate, provider: "To compare", cost: String(/australia|gold coast|brisbane|sydney|melbourne/i.test(String(origin)) ? 1500 : 900), currency: "AUD", notes: "Rough one-way allowance; no fare or seat has been checked." });
    }
    routeLocations.slice(0, -1).forEach((location, index) => seed("transport", `leg_${index}`, `${location} → ${routeLocations[index + 1]}`, { title: "Intercity transport", from: location, to: routeLocations[index + 1]!, start: String(locations[index]?.fields.end ?? ""), provider: "Rail / coach / low-cost flight", cost: "80", currency: "AUD", notes: "Rough allowance; mode, timetable and availability are open." }));
    const allowances = locations.map((item) => travelAllowance(String(item.fields.location || item.fields.title)));
    if (!(sectionItems.get("money") ?? []).some((item) => item.fields.moneyRole === "daily")) seed("money", "daily_spend", "Daily spending allowance", { title: "Daily spending allowance", amount: String(Math.round(allowances.reduce((sum, item) => sum + item.daily, 0) / Math.max(1, allowances.length))), currency: "AUD", moneyRole: "daily", notes: "Average first-pass allowance across the rough route." });
    seed("money", "stay_allowance", "Accommodation allowance", { title: "Accommodation allowance", amount: String(allowances.reduce((sum, item) => sum + item.nightly * 4, 0)), currency: "AUD", moneyRole: "cost", notes: "Four rough nights per stop; edit dates or stays to replace this centering estimate." });
    (["passport:Passport validity check", "visa:Visa and entry-requirement check", "insurance:Travel insurance"] as const).forEach((entry) => { const [id, title] = entry.split(":") as [string, string]; if (!requirements.some((item) => String(item.fields.title).toLowerCase().includes(id))) seed("requirements", id, title, { title, status: "open", notes: "Required check; not legal or live entry advice." }); });
    (["live_fares:Compare live flight and transport prices", "entry_rules:Verify current entry requirements", "stay_options:Compare flexible accommodation", "fixed_dates:Confirm fixed dates, people and events"] as const).forEach((entry) => { const [id, title] = entry.split(":") as [string, string]; if (!tasks.some((item) => String(item.fields.title).toLowerCase() === title.toLowerCase())) seed("tasks", id, title, { title, done: false, notes: "Useful next check before committing." }); });
    return;
  }
  const schedule = sectionItems.get("schedule") ?? [];
  if (!schedule.length) {
    const labels = family === "renovation" ? ["Confirm scope", "Design and quotes", "Order and prepare", "Build", "Handover"] : family === "event" ? ["Confirm venue and people", "Book key suppliers", "Prepare programme", "Run the event", "Close out"] : ["Confirm the outcome", "Prepare", "Deliver", "Review"];
    labels.forEach((label, index) => seed("schedule", `phase_${index}`, label, { title: label, notes: "Rough first-pass stage — change or reorder it." }));
  }
  if (!requirements.length) seed("requirements", "key_requirement", family === "renovation" ? "Permits and approvals check" : family === "event" ? "Venue and supplier commitments" : "Hard limits and approvals", { title: family === "renovation" ? "Permits and approvals check" : family === "event" ? "Venue and supplier commitments" : "Hard limits and approvals", status: "open", notes: "First-pass requirement; verify before committing." });
  ["Confirm the rough sequence", "Add known costs and dates", "Check the next external dependency"].forEach((title, index) => { if (!tasks.some((item) => String(item.fields.title).toLowerCase() === title.toLowerCase())) seed("tasks", `general_${index}`, title, { title, done: false, notes: "Useful next step." }); });
};

const inputVersion = (input: ArrivalInput): number => {
  const match = input.inputId.match(/_(\d+)$/);
  return match ? Number(match[1]) : 0;
};

export const starterPlanForArrival = (order: ArrivalOrder): StarterPlanPresentation | null => {
  const interpretation = order.interpretation;
  const manual = order.structured.planningMode === "manual";
  if (!interpretation?.complete && !manual) return null;
  const family = starterFamily(interpretation?.inferredFamily ?? order.rawOutcome);
  const basedOnVersion = interpretation?.basedOnVersion ?? 1;
  const laterHumanInputs = order.inputs.filter((input) => inputVersion(input) > basedOnVersion);
  const openItems = [...new Set([
    ...(interpretation?.dependencies ?? []).filter((dependency) => dependency.status === "open").map((dependency) => dependency.detail?.trim() || dependency.title.trim()),
    ...(interpretation?.missing ?? []).map((item) => item.trim()),
  ].filter(Boolean))];
  const definitions = starterSections[family];
  const sectionItems = new Map(definitions.map((definition) => [definition.sectionId, [] as StarterPlanItem[]]));
  const sectionComments = new Map(definitions.map((definition) => [definition.sectionId, [] as Array<{ commentId: string; text: string; forCodex: boolean }>]));
  const addItem = (sectionId: string, item: StarterPlanItem): void => {
    const resolved = sectionItems.has(sectionId) ? sectionId : sectionAliases[sectionId] && sectionItems.has(sectionAliases[sectionId]!) ? sectionAliases[sectionId]! : definitions[0]!.sectionId;
    const items = sectionItems.get(resolved)!;
    const fingerprint = `${item.label.toLowerCase()}|${JSON.stringify(item.fields)}`;
    if (!items.some((existing) => `${existing.label.toLowerCase()}|${JSON.stringify(existing.fields)}` === fingerprint)) items.push(item);
  };
  const requestFacts = flattenPlanFacts(Object.fromEntries([
    ["when", order.structured.deadline],
    ["whatIsLimited", order.structured.finiteLimit],
    ["mustNotChange", order.structured.hardConstraint],
  ].filter((entry) => entry[1] !== null && entry[1] !== undefined && entry[1] !== "")));
  const addFacts = (facts: FlatPlanFact[], source: StarterPlanItemSource, prefix: string): void => facts.forEach((fact, index) => {
    const sectionId = sectionForFact(definitions, fact.path);
    const values = Array.isArray(fact.value) && fact.value.every((value) => value === null || typeof value !== "object") && ["itinerary", "schedule", "tasks"].includes(sectionId) ? fact.value : [fact.value];
    values.forEach((value, valueIndex) => addItem(sectionId, { itemId: `${prefix}_${index}_${valueIndex}`, label: fact.label, fields: fieldsForFact(sectionId, fact, value), source }));
  });
  addFacts(requestFacts, "request", "request");
  addFacts(flattenPlanFacts(interpretation?.known ?? {}), "known", "known");
  addFacts(flattenPlanFacts(interpretation?.inferred ?? {}), "working", "working");
  openItems.forEach((item, index) => addItem("tasks", { itemId: `open_${index}`, label: item, fields: { title: item, done: false }, source: "open" }));
  if (interpretation?.complete) seedRoughPlan(family, order, sectionItems, addItem);
  const workspaceInputs = order.inputs.filter((input) => safePayloadText(input.payload, "workspaceOperation"));
  const presentationInputs = [...workspaceInputs, ...laterHumanInputs.filter((input) => !safePayloadText(input.payload, "workspaceOperation"))];
  presentationInputs.forEach((input, index) => {
    const operation = safePayloadText(input.payload, "workspaceOperation");
    if (operation) {
      const rawSection = safePayloadText(input.payload, "moduleId");
      const sectionId = sectionItems.has(rawSection) ? rawSection : sectionAliases[rawSection] ?? rawSection;
      const recordId = safePayloadText(input.payload, "recordId");
      const items = sectionItems.get(sectionId);
      if (!items) return;
      if (operation === "note") {
        const text = safePayloadText(input.payload, "comment");
        if (text) sectionComments.get(sectionId)?.push({ commentId: recordId || `comment_${index}`, text, forCodex: input.payload.forCodex === true });
        return;
      }
      if (operation === "add") addItem(sectionId, { itemId: recordId || `human_${index}`, label: safePayloadText(input.payload, "label") || "Plan item", fields: safeFields(input.payload.fields), source: "human" });
      if (operation === "update") {
        const item = items.find((candidate) => candidate.itemId === recordId);
        if (item) { item.fields = { ...item.fields, ...safeFields(input.payload.fields) }; item.label = String(item.fields.title || item.label); item.source = "human"; }
      }
      if (operation === "delete") sectionItems.set(sectionId, items.filter((candidate) => candidate.itemId !== recordId));
      if (operation === "toggle") {
        const item = items.find((candidate) => candidate.itemId === recordId);
        if (item) { item.fields.done = input.payload.done === true; item.source = "human"; }
      }
      if (operation === "reorder" && Array.isArray(input.payload.recordOrder)) {
        const orderIndex = new Map(input.payload.recordOrder.map((id, position) => [String(id), position]));
        items.sort((a, b) => (orderIndex.get(a.itemId) ?? Number.MAX_SAFE_INTEGER) - (orderIndex.get(b.itemId) ?? Number.MAX_SAFE_INTEGER));
      }
      return;
    }
    const requestedSection = safePayloadText(input.payload, "draftSection");
    const label = safePayloadText(input.payload, "label") || humanLabel(input.kind);
    const detail = safePayloadText(input.payload, "detail") || safePayloadText(input.payload, "text") || safePayloadText(input.payload, "value");
    const aliasedSection = sectionAliases[requestedSection] ?? requestedSection;
    const sectionId = definitions.some((definition) => definition.sectionId === aliasedSection)
      ? aliasedSection
      : sectionForFact(definitions, [label, detail, input.kind]);
    addItem(sectionId, { itemId: `human_${index}`, label, fields: { title: label, ...(detail ? { notes: detail } : {}) }, source: "human" });
  });
  return {
    family,
    familyLabel: ({ travel: "Travel", renovation: "Renovation", event: "Event", general: "Adaptive" } as const)[family],
    title: `${({ travel: "Travel", renovation: "Renovation", event: "Event", general: "Adaptive" } as const)[family]} rough plan`,
    brief: interpretation?.summary ?? order.rawOutcome,
    sections: definitions.map(({ keywords: _keywords, ...definition }) => ({ ...definition, items: sectionItems.get(definition.sectionId) ?? [], comments: sectionComments.get(definition.sectionId) ?? [] })),
    laterHumanInputs,
    interpretationIsCurrent: laterHumanInputs.length === 0,
  };
};
