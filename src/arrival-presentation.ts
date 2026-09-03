import type { ArrivalClarification, ArrivalInput, ArrivalInterpretation, ArrivalOrder } from "./arrival.js";
import { resolvePlanTitle } from "./plan-title.js";

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
    const suppliedCurrency = typeof parent.currencyCode === "string" ? parent.currencyCode.toUpperCase() : "";
    try {
      return new Intl.NumberFormat("en-AU", { style: "currency", currency: suppliedCurrency || "AUD", currencyDisplay: "code", maximumFractionDigits: 0 }).format(value / 100);
    } catch {
      return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", currencyDisplay: "code", maximumFractionDigits: 0 }).format(value / 100);
    }
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
  inputType: "text" | "url" | "date" | "time" | "number" | "textarea" | "select";
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
}

export interface StarterPlanItem {
  itemId: string;
  label: string;
  fields: Record<string, string | boolean>;
  source: StarterPlanItemSource;
  parentRecordId?: string;
}

export interface StarterPlanSection {
  sectionId: string;
  label: string;
  description: string;
  emptyLabel: string;
  variant: "calendar" | "people" | "stays" | "transport" | "money" | "requirements" | "checklist" | "cards";
  fields: StarterPlanField[];
  items: StarterPlanItem[];
  options: StarterPlanItem[];
  comments: Array<{ commentId: string; text: string; forCodex: boolean }>;
  openQuestions: Array<{ questionId: string; prompt: string }>;
  answers: Array<{ questionId: string; prompt: string; answer: string }>;
  custom?: boolean;
  customSource?: "human" | "working" | "starter";
}

export interface StarterPlanOverview {
  start: string;
  end: string;
  datesProvisional: boolean;
  singleDay: boolean;
  includeTime: boolean;
  startTime: string;
  endTime: string;
  timeZone: string;
  totalBudget: string;
  currency: string;
  moneyState: "not_applicable" | "unknown" | "zero" | "positive";
  budgetProvisional: boolean;
  categories: StarterPlanItem[];
  categoryAllocated: number;
  categoryPercent: number;
}

export interface StarterPlanPresentation {
  family: "travel" | "renovation" | "event" | "general";
  familyLabel: string;
  title: string;
  brief: string;
  overview: StarterPlanOverview;
  sections: StarterPlanSection[];
  laterHumanInputs: ArrivalInput[];
  interpretationIsCurrent: boolean;
}

const starterFamily = (value: string | null | undefined): StarterPlanPresentation["family"] => {
  const normalized = String(value ?? "").toLowerCase();
  if (normalized.includes("travel") || normalized.includes("trip") || normalized.includes("calendar")) return "travel";
  if (normalized.includes("renovat") || normalized.includes("makeover") || normalized.includes("remodel") || normalized.includes("refurbish") || normalized.includes("phase")) return "renovation";
  if (normalized.includes("event") || normalized.includes("run_of_show") || normalized.includes("dinner")) return "event";
  return "general";
};

const isInterviewPlan = (value: string): boolean => /\binterview\b/i.test(value);
const isRecurringPracticePlan = (value: string): boolean =>
  /\b(?:learn|study|practise|practice|training|course|conversational|language|vocabulary)\b/i.test(value)
  && /\b(?:day|week|month|session|evening|lesson|practice|study|listening|speaking)\b/i.test(value);
const hasExplicitZeroSpendIntent = (value: string): boolean =>
  /\b(?:no|zero)\s+(?:paid\s+)?budget\b|\bbudget\s*(?:(?:is|of)\s*|:)\s*(?:aud|a\$|\$)?\s*0\b|\b(?:do not|don['’]t)\s+(?:want\s+)?to\s+buy\s+anything\b|\bwithout\s+spending\b/i.test(value);
const isDinnerPlan = (value: string): boolean => /\b(?:dinner party|dinner at home|host(?:ing)? (?:a )?dinner)\b|\bdinner\s+for\s+(?:\d{1,4}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\s+(?:people|friends|guests|attendees)\b/i.test(value);

type WeightedPlanItem = readonly [id: string, title: string, weight: number];

export const allocateWholePlanUnits = (total: number, items: readonly WeightedPlanItem[]): Array<[string, string, number, number]> => {
  const safeTotal = Number.isFinite(total) ? Math.max(0, Math.round(total)) : 0;
  const safeWeights = items.map(([, , weight]) => Number.isFinite(weight) ? Math.max(0, weight) : 0);
  const weightTotal = safeWeights.reduce((sum, weight) => sum + weight, 0);
  if (!items.length) return [];
  if (weightTotal === 0) return items.map(([id, title, weight]) => [id, title, weight, 0]);
  const exact = safeWeights.map((weight) => safeTotal * weight / weightTotal);
  const allocated = exact.map(Math.floor);
  let remaining = safeTotal - allocated.reduce((sum, amount) => sum + amount, 0);
  const remainderOrder = exact
    .map((amount, index) => ({ index, remainder: amount - allocated[index]! }))
    .sort((left, right) => right.remainder - left.remainder || left.index - right.index);
  for (let index = 0; index < remaining; index += 1) allocated[remainderOrder[index % remainderOrder.length]!.index]! += 1;
  return items.map(([id, title, weight], index) => [id, title, weight, allocated[index]!]);
};

type StarterSectionDefinition = Omit<StarterPlanSection, "items" | "options" | "comments" | "openQuestions" | "answers"> & { keywords: string[] };

const field = (fieldId: string, label: string, inputType: StarterPlanField["inputType"] = "text", placeholder = "", options?: StarterPlanField["options"]): StarterPlanField => ({ fieldId, label, inputType, ...(placeholder ? { placeholder } : {}), ...(options ? { options } : {}) });
const statusOptions = [{ value: "open", label: "Not started" }, { value: "in_progress", label: "In progress" }, { value: "ready", label: "Ready" }];
const bookingStatusOptions = [{ value: "idea", label: "Idea" }, { value: "shortlisted", label: "Shortlisted" }, { value: "booked", label: "Booked" }];
const priceStateOptions = [{ value: "allowance", label: "Planning allowance" }, { value: "quote", label: "Live quote" }, { value: "booked", label: "Booked price" }, { value: "paid", label: "Paid" }];
const companionStatusOptions = [{ value: "tentative", label: "Tentative" }, { value: "asked", label: "Asked / awaiting reply" }, { value: "confirmed", label: "Confirmed" }, { value: "unavailable", label: "Unavailable" }];
const calendarKindOptions = [{ value: "location", label: "Location" }, { value: "activity", label: "Activity" }, { value: "event", label: "Event" }, { value: "travel", label: "Travel day" }, { value: "milestone", label: "Milestone" }];
const moneyRoleOptions = [{ value: "limit", label: "Overall limit" }, { value: "daily", label: "Daily budget" }, { value: "cost", label: "Planned cost" }];
const scheduleFields = [field("title", "Item", "text", "Name this event, activity, phase, or milestone"), field("kind", "Type", "select", "", calendarKindOptions), field("location", "Location", "text", "Place, room, owner, or context"), field("start", "Start date", "date"), field("startTime", "Start time", "time"), field("end", "End date", "date"), field("endTime", "End time", "time"), field("reference", "Website or reference", "url", "https://"), field("notes", "Notes", "textarea", "What is fixed, flexible, or still unknown?")];
const travelScheduleFields = [field("title", "Location or activity", "text", "City, region, visit, event, or activity"), field("kind", "Type", "select", "", calendarKindOptions), field("location", "Location", "text", "City or area"), field("start", "Start date", "date"), field("startTime", "Start time", "time"), field("end", "End date", "date"), field("endTime", "End time", "time"), field("timeZone", "Time zone", "text", "e.g. Europe/Berlin"), field("dailyBudget", "Daily spend", "number", "0"), field("currency", "Currency", "text", "AUD"), field("reference", "Website or reference", "url", "https://"), field("notes", "Notes", "textarea", "What is fixed, flexible, or still unknown?")];
const moneyFields = [field("title", "Budget item", "text", "Total budget, daily spend, known cost…"), field("amount", "Amount", "number", "0"), field("currency", "Currency", "text", "AUD"), field("moneyRole", "Counts as", "select", "", moneyRoleOptions), field("notes", "Notes", "textarea")];
const requirementFields = [field("title", "Requirement", "text", "Visa, insurance, permit, approval…"), field("status", "Status", "select", "", statusOptions), field("due", "Due", "date"), field("notes", "Notes", "textarea")];
const taskFields = [field("title", "To-do", "text", "What needs to happen?"), field("due", "Due", "date"), field("notes", "Notes", "textarea")];

const starterSections: Record<StarterPlanPresentation["family"], StarterSectionDefinition[]> = {
  travel: [
    { sectionId: "itinerary", label: "Calendar", description: "See locations and activities across the plan, then select one to change it.", emptyLabel: "No locations or activities added yet.", variant: "calendar", fields: travelScheduleFields, keywords: ["destination", "place", "city", "country", "region", "stop", "visit", "route", "itinerary", "location", "activity", "date", "day", "month", "year", "duration", "week", "window", "deadline", "when"] },
    { sectionId: "people", label: "People & commitments", description: "Keep companion dates, roles and the parts of the plan that depend on them explicit.", emptyLabel: "No people or companion-dependent commitments added yet.", variant: "people", fields: [field("title", "Person or commitment", "text", "Friend, family member, host, appointment…"), field("role", "Role", "text", "Who they are in this plan"), field("status", "Status", "select", "", companionStatusOptions), field("location", "Location", "text", "City or area"), field("start", "From", "date"), field("end", "To", "date"), field("relatedTo", "Plan dependency", "text", "What route, stay, booking or decision depends on this?"), field("notes", "Notes", "textarea")], keywords: ["friend", "brother", "sister", "family", "companion", "person", "people", "host", "meet", "together", "availability"] },
    { sectionId: "stays", label: "Where you’re staying", description: "Compare compact stay options, their dates, booking state, website and price confidence.", emptyLabel: "No accommodation added yet.", variant: "stays", fields: [field("title", "Stay", "text", "Hotel, hostel, apartment, friend…"), field("location", "Location", "text", "City, area, or neighbourhood"), field("bookingStatus", "Booking state", "select", "", bookingStatusOptions), field("start", "Check-in", "date"), field("end", "Check-out", "date"), field("website", "Website", "url", "https://"), field("nightlyBudget", "Nightly budget", "number", "0"), field("totalBudget", "Base-currency total", "number", "0"), field("currency", "Base currency", "text", "AUD"), field("priceState", "Price state", "select", "", priceStateOptions), field("quoteDate", "Price checked", "date"), field("localTotal", "Local-currency total", "number", "0"), field("localCurrency", "Local currency", "text", "EUR"), field("baseRate", "1 local = base", "number", "e.g. 1.68"), field("notes", "Notes", "textarea")], keywords: ["accommodation", "hotel", "hostel", "lodging", "stay", "nightly", "checkin", "checkout"] },
    { sectionId: "transport", label: "Flights & transport", description: "Keep connected legs, timing and price confidence together without pretending an option is booked.", emptyLabel: "No flights or transport added yet.", variant: "transport", fields: [field("title", "Flight or transport", "text", "Flight, train, bus, ferry…"), field("bookingStatus", "Booking state", "select", "", bookingStatusOptions), field("from", "From", "text"), field("to", "To", "text"), field("start", "Departure date", "date"), field("startTime", "Departure time", "time"), field("departureTimeZone", "Departure time zone", "text", "e.g. Europe/Berlin"), field("end", "Arrival date", "date"), field("endTime", "Arrival time", "time"), field("arrivalTimeZone", "Arrival time zone", "text", "e.g. Europe/Budapest"), field("provider", "Provider / service", "text", "Airline, train, flight number…"), field("cost", "Base-currency cost", "number", "0"), field("currency", "Base currency", "text", "AUD"), field("priceState", "Price state", "select", "", priceStateOptions), field("quoteDate", "Price checked", "date"), field("localAmount", "Local-currency cost", "number", "0"), field("localCurrency", "Local currency", "text", "EUR"), field("baseRate", "1 local = base", "number", "e.g. 1.68"), field("reference", "Booking or option link", "url", "https://"), field("notes", "Notes", "textarea")], keywords: ["flight", "airline", "airport", "booking", "transport", "train", "ferry", "bus", "car", "connection"] },
    { sectionId: "money", label: "Money", description: "See the overall limit, daily target, planned costs, and what remains unallocated.", emptyLabel: "No budget or costs added yet.", variant: "money", fields: moneyFields, keywords: ["budget", "cost", "price", "amount", "spend", "limit", "maximum", "minimum", "currency", "money", "cap", "daily"] },
    { sectionId: "requirements", label: "Visa, insurance & fixed items", description: "Keep travel requirements and non-negotiable commitments visible.", emptyLabel: "No requirements or fixed items added yet.", variant: "requirements", fields: requirementFields, keywords: ["visa", "insurance", "passport", "requirement", "commitment", "fixed", "booked", "confirmed", "must", "constraint", "nonnegotiable", "hard"] },
    { sectionId: "tasks", label: "To-do list", description: "Tick off work you can do yourself and reopen it whenever reality changes.", emptyLabel: "Nothing on the to-do list yet.", variant: "checklist", fields: taskFields, keywords: ["open", "optional", "preference", "idea", "possible", "flexible", "missing", "decision", "dependency", "todo", "task"] },
  ],
  renovation: [
    { sectionId: "schedule", label: "Calendar", description: "See phases and work across the plan, then select one to change it.", emptyLabel: "No phases or work added yet.", variant: "calendar", fields: scheduleFields, keywords: ["phase", "work", "date", "day", "month", "year", "duration", "schedule", "deadline", "when"] },
    { sectionId: "scope", label: "Spaces & scope", description: "Keep rooms, work packages and finish choices editable.", emptyLabel: "No spaces or scope items added yet.", variant: "cards", fields: [field("title", "Space or work item"), field("location", "Area"), field("cost", "Planned cost", "number"), field("notes", "Scope and finish notes", "textarea")], keywords: ["space", "room", "scope", "design", "finish", "outcome", "area"] },
    { sectionId: "resources", label: "Contractors & materials", description: "Track people, quotes, suppliers and materials.", emptyLabel: "No contractors or materials added yet.", variant: "cards", fields: [field("title", "Contractor or material"), field("provider", "Supplier"), field("quantity", "Quantity", "number"), field("bookingStatus", "Decision state", "select", "", bookingStatusOptions), field("website", "Website or product", "url", "https://"), field("start", "Needed by", "date"), field("cost", "Planned cost", "number"), field("notes", "Notes", "textarea")], keywords: ["contractor", "builder", "supplier", "material", "quote"] },
    { sectionId: "money", label: "Budget & costs", description: "Track the limit, allowances and planned costs.", emptyLabel: "No budget or costs added yet.", variant: "money", fields: moneyFields, keywords: ["budget", "cost", "price", "amount", "spend", "limit", "maximum", "minimum", "currency", "cap"] },
    { sectionId: "requirements", label: "Approvals & fixed items", description: "Keep permits, approvals and non-negotiables visible.", emptyLabel: "No approvals or fixed items added yet.", variant: "requirements", fields: requirementFields, keywords: ["approval", "permit", "commitment", "fixed", "booked", "confirmed", "must", "constraint", "hard"] },
    { sectionId: "tasks", label: "To-do list", description: "Track practical work without waiting for Codex.", emptyLabel: "Nothing on the to-do list yet.", variant: "checklist", fields: taskFields, keywords: ["open", "optional", "preference", "idea", "possible", "missing", "decision", "dependency", "todo", "task"] },
  ],
  event: [
    { sectionId: "schedule", label: "Calendar", description: "See events and activities across the plan, then select one to change it.", emptyLabel: "No events or activities added yet.", variant: "calendar", fields: scheduleFields, keywords: ["programme", "program", "agenda", "schedule", "event", "moment", "activity", "runofshow", "date", "time", "deadline", "when"] },
    { sectionId: "scope", label: "Guests & venue", description: "Track people, capacity, rooms and venue choices.", emptyLabel: "No guests or venue details added yet.", variant: "cards", fields: [field("title", "Guest group or venue"), field("headcount", "People / capacity", "number"), field("contact", "Contact"), field("bookingStatus", "Decision state", "select", "", bookingStatusOptions), field("location", "Location"), field("start", "Date", "date"), field("website", "Website or reference", "url", "https://"), field("cost", "Planned cost", "number"), field("notes", "Notes", "textarea")], keywords: ["guest", "people", "attendee", "capacity", "venue", "location", "place"] },
    { sectionId: "resources", label: "Suppliers & logistics", description: "Track suppliers, travel, equipment and delivery details.", emptyLabel: "No suppliers or logistics added yet.", variant: "cards", fields: [field("title", "Supplier or logistic item"), field("provider", "Provider"), field("bookingStatus", "Decision state", "select", "", bookingStatusOptions), field("website", "Website or reference", "url", "https://"), field("start", "Due", "date"), field("cost", "Planned cost", "number"), field("notes", "Notes", "textarea")], keywords: ["supplier", "cater", "vendor", "transport", "equipment", "logistic"] },
    { sectionId: "money", label: "Budget & costs", description: "Track the limit, allowances and planned costs.", emptyLabel: "No budget or costs added yet.", variant: "money", fields: moneyFields, keywords: ["budget", "cost", "quote", "price", "amount", "spend", "limit", "maximum", "minimum", "currency", "cap"] },
    { sectionId: "requirements", label: "Requirements & commitments", description: "Keep approvals, bookings and fixed commitments visible.", emptyLabel: "No requirements or commitments added yet.", variant: "requirements", fields: requirementFields, keywords: ["approval", "requirement", "commitment", "fixed", "booked", "confirmed", "must", "constraint", "hard"] },
    { sectionId: "tasks", label: "To-do list", description: "Track practical work without waiting for Codex.", emptyLabel: "Nothing on the to-do list yet.", variant: "checklist", fields: taskFields, keywords: ["open", "optional", "preference", "idea", "possible", "missing", "decision", "dependency", "todo", "task"] },
  ],
  general: [
    { sectionId: "schedule", label: "Calendar", description: "See dated items across the plan, then select one to change it.", emptyLabel: "No scheduled items added yet.", variant: "calendar", fields: scheduleFields, keywords: ["date", "day", "month", "year", "duration", "time", "window", "schedule", "deadline", "when"] },
    { sectionId: "scope", label: "Plan items", description: "Keep the plan’s concrete parts editable.", emptyLabel: "No plan items added yet.", variant: "cards", fields: [field("title", "Plan item"), field("status", "Status", "select", "", statusOptions), field("location", "Where or who"), field("start", "When", "date"), field("reference", "Website or reference", "url", "https://"), field("cost", "Planned cost", "number"), field("notes", "Notes", "textarea")], keywords: ["outcome", "item", "step", "scope", "deliverable"] },
    { sectionId: "resources", label: "People & resources", description: "Track capacity, providers and resources.", emptyLabel: "No people or resources added yet.", variant: "cards", fields: [field("title", "Person or resource"), field("headcount", "People / capacity", "number"), field("provider", "Provider or owner"), field("status", "Status", "select", "", statusOptions), field("start", "Needed by", "date"), field("reference", "Website or reference", "url", "https://"), field("cost", "Planned cost", "number"), field("notes", "Notes", "textarea")], keywords: ["person", "people", "participant", "attendee", "capacity", "resource", "provider", "supplier"] },
    { sectionId: "money", label: "Money", description: "Track the limit, allowances and planned costs.", emptyLabel: "No budget or costs added yet.", variant: "money", fields: moneyFields, keywords: ["budget", "cost", "price", "amount", "spend", "limit", "maximum", "minimum", "currency", "cap"] },
    { sectionId: "requirements", label: "Requirements & limits", description: "Keep approvals, commitments and hard limits visible.", emptyLabel: "No requirements or limits added yet.", variant: "requirements", fields: requirementFields, keywords: ["approval", "requirement", "commitment", "fixed", "confirmed", "must", "constraint", "nonnegotiable", "hard"] },
    { sectionId: "tasks", label: "To-do list", description: "Track practical work without waiting for Codex.", emptyLabel: "Nothing on the to-do list yet.", variant: "checklist", fields: taskFields, keywords: ["open", "optional", "preference", "idea", "possible", "missing", "decision", "dependency", "todo", "task"] },
  ],
};

const dinnerMenuFields = [
  field("title", "Dish or menu item"),
  field("course", "Course"),
  field("vegetarian", "Vegetarian", "select", "", [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]),
  field("nutSafe", "Nut-allergy plan", "text", "Ingredients and cross-contact controls"),
  field("prepAhead", "Prep ahead", "text", "What can be completed before guests arrive?"),
  field("notes", "Notes", "textarea"),
];

const interviewEvidenceFields = [
  field("title", "Competency"),
  field("situation", "Situation", "textarea", "What was happening, and why did it matter?"),
  field("action", "Action", "textarea", "What did you personally do?"),
  field("result", "Result", "textarea", "What changed, preferably with a measure?"),
  field("proof", "Proof", "textarea", "What detail makes this credible?"),
  field("confidence", "Readiness", "select", "", [
    { value: "needs_evidence", label: "Needs evidence" },
    { value: "draft", label: "Draft" },
    { value: "rehearsed", label: "Rehearsed" },
  ]),
];

const practiceLogFields = [
  field("title", "Session or checkpoint"),
  field("date", "Date", "date"),
  field("focus", "Focus", "text", "Skill, topic, drill, or conversation"),
  field("durationMinutes", "Minutes", "number", "30"),
  field("confidence", "Confidence", "select", "", [
    { value: "new", label: "New" },
    { value: "developing", label: "Developing" },
    { value: "comfortable", label: "Comfortable" },
  ]),
  field("evidence", "What changed", "textarea", "A phrase used, recording made, score, reflection, or other evidence"),
  field("notes", "Notes", "textarea"),
];

const statedEventHeadcount = (value: string): number | null => {
  const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20 };
  const match = value.match(/\b(?:for|with|hosting)\s+(\d{1,4}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\s+(?:people|friends|guests|attendees)\b/i)
    ?? value.match(/\b(\d{1,4}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\s+(?:people|friends|guests|attendees)\b/i);
  if (!match) return null;
  const count = Number(match[1]) || words[match[1]!.toLowerCase()] || 0;
  return count > 0 ? count : null;
};

const domesticAustralianTravel = (value: string): boolean => {
  const places = "sydney|melbourne|brisbane|gold coast|adelaide|perth|canberra|darwin|hobart|tasmania";
  const matches = value.toLowerCase().match(new RegExp(`\\b(?:${places})\\b`, "g")) ?? [];
  return new Set(matches).size >= 2 || (/\bhobart|tasmania\b/i.test(value) && !/\binternational|overseas|europe|asia|america|africa\b/i.test(value));
};

const sectionQuestionTemplates = (family: StarterPlanPresentation["family"], order: ArrivalOrder): Record<string, string[]> => {
  const dinner = isDinnerPlan(order.rawOutcome);
  const eventSource = `${order.rawOutcome} ${JSON.stringify(order.structured)} ${order.interpretation?.summary ?? ""}`;
  const headcount = statedEventHeadcount(eventSource) ?? 10;
  const eventBudget = moneyAmount(eventSource);
  const eventCurrency = moneyCurrency(eventSource, order.structured as Record<string, unknown>);
  if (family === "event" && dinner) return {
    schedule: ["What time should guests arrive, and roughly when should the evening finish?"],
    scope: [`Which guests are confirmed, and does the table and seating comfortably fit all ${headcount} people?`],
    custom_menu_dietary: ["Do the vegetarian guests eat dairy and eggs, and are there any dislikes the menu should avoid?"],
    resources: ["Will you cook everything yourself, buy any prepared dishes, or have someone help?"],
    money: [eventBudget ? `Should the ${eventCurrency} ${Number(eventBudget).toLocaleString("en-AU")} budget include alcohol, or only food and non-alcoholic drinks?` : "Should the budget include alcohol, or only food and non-alcoholic drinks?"],
    requirements: ["How severe is the nut allergy, including whether trace cross-contact or ‘may contain’ ingredients must be avoided?"],
    tasks: ["Who, if anyone, can help with setup, serving, or cleanup on the day?"],
  };
  if (family === "travel") return {
    itinerary: ["Which dates or locations are fixed, and which can move?"],
    people: ["Whose dates or commitments must this plan fit around?"],
    stays: ["What accommodation style and minimum standard should the plan use?"],
    transport: ["Which departure point, baggage needs, and comfort trade-offs should guide transport choices?"],
    money: ["Where should the budget flex first if researched prices run high?"],
    requirements: [domesticAustralianTravel(eventSource) ? "Which identification, insurance, accessibility, health, or local travel requirements need checking?" : "Which passport, visa, insurance, accessibility, or health requirements need checking?"],
    tasks: ["Which planning tasks do you want to handle yourself?"],
  };
  if (family === "renovation") return {
    schedule: ["Is there a hard completion date or any period when work cannot happen?"],
    scope: ["Which finish, function, or room outcome is non-negotiable?"],
    resources: ["Which trades or materials are already chosen, quoted, or unavailable?"],
    money: ["How much contingency should remain untouched?"],
    requirements: ["Which approvals, access limits, or household constraints still need checking?"],
    tasks: ["Which work will you do yourself?"],
  };
  if (family === "general" && /\binterview\b/i.test(order.rawOutcome)) return {
    schedule: ["What time and time zone is the interview, and which three preparation evenings are actually available?"],
    scope: ["Do you have the role description or any guidance about what the COO wants to assess?"],
    custom_interview_evidence: ["Which two or three achievements are strongest enough to anchor your interview stories?"],
    resources: ["Which company, interviewer, product, or market sources should the preparation rely on?"],
    money: [],
    requirements: ["Which video platform, format, or interview instructions are already confirmed?"],
    tasks: ["Which preparation work do you want to do yourself, and where should Codex help?"],
  };
  const practiceSource = `${order.rawOutcome} ${JSON.stringify(order.structured)} ${order.interpretation?.summary ?? ""}`;
  if (family === "general" && isRecurringPracticePlan(practiceSource)) return {
    schedule: ["Which three weekly study times are most realistic, and may they move from week to week?"],
    scope: ["What can you already do, and what would count as useful conversational progress after six weeks?"],
    custom_practice_log: ["How would you like to notice progress: a short recording, self-rating, phrase check, or real conversation?"],
    resources: ["Which free learning resources or formats do you already enjoy using?"],
    money: [],
    requirements: ["Are the 30-minute sessions and 90-minute weekly cap fixed or flexible?"],
    tasks: ["Do you want to choose the exact session days yourself or use the provisional weekly rhythm?"],
  };
  const moneySource = `${order.rawOutcome} ${JSON.stringify(order.structured)} ${JSON.stringify(order.interpretation?.known ?? {})}`;
  const noPaidBudget = hasExplicitZeroSpendIntent(moneySource);
  const moneyLimitKnown = noPaidBudget || moneyAmount(moneySource) !== "";
  return {
    schedule: ["Which date or sequence is fixed, and what can move?"],
    scope: ["What would make this plan complete enough to use?"],
    resources: ["Which people, tools, or providers are already available?"],
    money: moneyLimitKnown ? [] : ["Is money relevant to this plan, and if so what limit should it respect?"],
    requirements: ["Which requirement or approval still needs a human decision?"],
    tasks: ["Which next action do you want to own yourself?"],
  };
};

export const inspectArrivalWorkspaceRecord = (order: ArrivalOrder, moduleId: string, recordId: string): {
  moduleExists: boolean;
  recordExists: boolean;
  operatorEditable: boolean;
  allowedFieldIds: string[];
} => {
  const starter = starterPlanForArrival(order);
  const section = starter?.sections.find((candidate) => candidate.sectionId === moduleId);
  const item = section?.items.find((candidate) => candidate.itemId === recordId);
  return {
    moduleExists: Boolean(section),
    recordExists: Boolean(item),
    operatorEditable: Boolean(item && ["starter", "working"].includes(item.source) && starterItemIsProvisional(item)),
    allowedFieldIds: section?.fields.map((field) => field.fieldId) ?? [],
  };
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
  const ranked = definitions.map((definition) => ({ definition, score: Math.max(0, ...definition.keywords.filter((keyword) => searchable.includes(keyword.replace(/[^a-z0-9]+/gi, "").toLowerCase())).map((keyword) => qualifier.test(keyword) ? 1 : keyword.length)) }))
    .sort((a, b) => b.score - a.score);
  if ((ranked[0]?.score ?? 0) > 0) return ranked[0]!.definition.sectionId;
  return definitions.find((definition) => definition.sectionId === "scope")?.sectionId ?? definitions[0]!.sectionId;
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
const customFieldTypes = new Set<StarterPlanField["inputType"]>(["text", "url", "date", "time", "number", "textarea", "select"]);
const customModuleDefinition = (payload: Record<string, unknown>, sourceSurface: ArrivalInput["sourceSurface"]): StarterSectionDefinition | null => {
  const sectionId = safePayloadText(payload, "moduleId");
  const label = safePayloadText(payload, "label").slice(0, 100);
  const description = safePayloadText(payload, "description").slice(0, 300);
  const variant = safePayloadText(payload, "variant") as StarterPlanSection["variant"];
  if (!/^custom_[a-z0-9_]{3,80}$/.test(sectionId) || !label || !["cards", "checklist", "calendar"].includes(variant) || !Array.isArray(payload.fields)) return null;
  const seen = new Set<string>();
  const fields = payload.fields.slice(0, 12).flatMap((candidate): StarterPlanField[] => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
    const input = candidate as Record<string, unknown>;
    const fieldId = safePayloadText(input, "fieldId");
    const fieldLabel = safePayloadText(input, "label").slice(0, 80);
    const inputType = safePayloadText(input, "inputType") as StarterPlanField["inputType"];
    if (!/^[a-z][a-zA-Z0-9_]{0,39}$/.test(fieldId) || seen.has(fieldId) || !fieldLabel || !customFieldTypes.has(inputType)) return [];
    seen.add(fieldId);
    const rawOptions = Array.isArray(input.options) ? input.options : [];
    const options = rawOptions.slice(0, 20).flatMap((option): NonNullable<StarterPlanField["options"]> => {
      if (!option || typeof option !== "object" || Array.isArray(option)) return [];
      const value = safePayloadText(option as Record<string, unknown>, "value").slice(0, 60);
      const optionLabel = safePayloadText(option as Record<string, unknown>, "label").slice(0, 80);
      return value && optionLabel ? [{ value, label: optionLabel }] : [];
    });
    if (inputType === "select" && !options.length) return [];
    return [{ fieldId, label: fieldLabel, inputType, ...(safePayloadText(input, "placeholder") ? { placeholder: safePayloadText(input, "placeholder").slice(0, 140) } : {}), ...(options.length ? { options } : {}) }];
  });
  if (!fields.length || fields[0]?.fieldId !== "title") return null;
  return {
    sectionId,
    label,
    description: description || `A specialist section for ${label.toLowerCase()}.`,
    emptyLabel: `No ${label.toLowerCase()} added yet.`,
    variant,
    fields,
    keywords: [label, description, ...fields.map((entry) => entry.label)].filter(Boolean),
    custom: true,
    customSource: payload.moduleSource === "codex" || sourceSurface === "codex" ? "working" : "human",
  };
};
const sectionAliases: Record<string, string> = { destinations: "itinerary", dates: "itinerary", travel: "transport", commitments: "requirements", open: "tasks", programme: "schedule", people: "scope", items: "scope" };

const moneyAmount = (text: string): string => {
  if (hasExplicitZeroSpendIntent(text)) return "0";
  const value = "(-?\\d+(?:,\\d{3})*(?:\\.\\d+)?)\\s*([kmb])?";
  const currency = "(?:a\\$|aud|nz\\$|nzd|us\\$|usd|ca\\$|cad|sg\\$|sgd|hk\\$|hkd|€|eur|£|gbp|cny|chf|inr|\\$)";
  const matches = [
    ...text.matchAll(new RegExp(`${currency}\\s*${value}\\b`, "gi")),
    ...text.matchAll(new RegExp(`\\b(?:budget|cost|price|spend|financial limit|money|cap)(?:(?:\\s+(?:is|of|at|under|up to|no more than|around|about|roughly))|\\s*:)?\\s*${currency}?\\s*${value}\\b`, "gi")),
    ...text.matchAll(new RegExp(`\\b${value}\\s*(?:aud|nzd|usd|cad|sgd|hkd|eur|gbp|cny|chf|inr|dollars?|bucks?)\\b`, "gi")),
  ];
  const candidates = matches.map((match) => {
    const base = Number(match[1]!.replaceAll(",", ""));
    const multiplier = ({ k: 1_000, m: 1_000_000, b: 1_000_000_000 } as const)[String(match[2] ?? "").toLowerCase() as "k" | "m" | "b"] ?? 1;
    return base * multiplier;
  }).filter(Number.isFinite);
  if (!candidates.length) return "";
  const amount = candidates.reduce((largest, candidate) => Math.abs(candidate) > Math.abs(largest) ? candidate : largest);
  return String(Number(amount.toFixed(2)));
};

const moneyCurrency = (text: string, parent: Record<string, unknown>): string => {
  if (typeof parent.currencyCode === "string" && parent.currencyCode.trim()) return parent.currencyCode.trim().toUpperCase();
  if (/a\$|\baud\b/i.test(text)) return "AUD";
  if (/nz\$|\bnzd\b/i.test(text)) return "NZD";
  if (/us\$|\busd\b/i.test(text)) return "USD";
  if (/ca\$|\bcad\b/i.test(text)) return "CAD";
  if (/sg\$|\bsgd\b/i.test(text)) return "SGD";
  if (/hk\$|\bhkd\b/i.test(text)) return "HKD";
  if (/€|\beur\b/i.test(text)) return "EUR";
  if (/£|\bgbp\b/i.test(text)) return "GBP";
  if (/\bcny\b/i.test(text)) return "CNY";
  if (/\bchf\b/i.test(text)) return "CHF";
  if (/\binr\b/i.test(text)) return "INR";
  return "";
};

const fieldsForFact = (sectionId: string, fact: FlatPlanFact, value = fact.value): Record<string, string | boolean> => {
  const text = plainValue(value, fact.valueKey, fact.valueParent);
  const path = normalizedPath(fact.path);
  if (sectionId === "money") return { title: fact.label, amount: moneyAmount(`${fact.label}: ${text}`), currency: moneyCurrency(text, fact.valueParent), moneyRole: /daily|perday/.test(path) ? "daily" : /limit|budget|maximum|cap/.test(path) ? "limit" : "cost", notes: text };
  if (sectionId === "tasks") return { title: text === "Not supplied yet" ? fact.label : text, notes: text === fact.label ? "" : fact.label, done: false };
  if (sectionId === "requirements") return { title: /mustnotchange|whatislimited|constraint|commitment/.test(path) ? text : fact.label, status: "open", notes: text };
  if (sectionId === "itinerary" || sectionId === "schedule") return /date|day|month|year|when|deadline|window/.test(path) ? { title: fact.label, start: text, notes: text } : { title: text, location: text, notes: fact.label };
  if (sectionId === "transport") return { title: text, notes: fact.label };
  if (sectionId === "stays") return { title: fact.label, location: /location|city|place/.test(path) ? text : "", nightlyBudget: /cost|budget|price|nightly/.test(path) ? text.replace(/[^0-9.-]/g, "") : "", notes: text };
  return { title: fact.label, notes: text };
};

const dateIso = (value: string, fallbackYear: number): string => {
  const text = value.trim().replace(/[~≈]/g, " ").replace(/\b(\d{1,2})(?:st|nd|rd|th)\b/gi, "$1").replace(/\b(?:about|around|approximately|approx|roughly|circa)\b/gi, " ").replace(/\s+/g, " ").trim();
  if (!text) return "";
  const iso = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1];
  if (iso) return iso;
  const month = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
  const dayFirst = text.match(new RegExp(`\\b(\\d{1,2})\\s+(?:of\\s+)?(${month})(?:\\s+(20\\d{2}))?\\b`, "i"));
  const monthFirst = text.match(new RegExp(`\\b(${month})\\s+(\\d{1,2})(?:,?\\s+(20\\d{2}))?\\b`, "i"));
  const candidate = dayFirst
    ? `${dayFirst[1]} ${dayFirst[2]} ${dayFirst[3] || fallbackYear}`
    : monthFirst ? `${monthFirst[2]} ${monthFirst[1]} ${monthFirst[3] || fallbackYear}` : "";
  if (!candidate) return "";
  const timestamp = Date.parse(`${candidate} UTC`);
  if (!Number.isFinite(timestamp)) return "";
  return new Date(timestamp).toISOString().slice(0, 10);
};

const dateRangeIso = (value: string, fallbackYear: number): { start: string; end: string } => {
  const month = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
  const weekday = "(?:mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)";
  const dateToken = `(?:(?:${weekday})\\s+)?(?:\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${month})(?:\\s+20\\d{2})?|(?:${month})\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+20\\d{2})?)`;
  const range = value.match(new RegExp(`\\b(${dateToken})\\s+(?:to|until|through|thru|–|—|-)\\s+(${dateToken})\\b`, "i"));
  if (!range) {
    // Natural briefs commonly share the month and year across both days:
    // "20 to 22 November 2026". Preserve both boundaries instead of treating
    // the last date as the start and deriving a different duration.
    const sharedMonth = value.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:to|until|through|thru|–|—|-)\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s+(${month})(?:\\s+(20\\d{2}))?\\b`, "i"));
    if (!sharedMonth) return { start: "", end: "" };
    const year = Number(sharedMonth[4] ?? fallbackYear);
    return {
      start: dateIso(`${sharedMonth[1]} ${sharedMonth[3]}`, year),
      end: dateIso(`${sharedMonth[2]} ${sharedMonth[3]}`, year),
    };
  }
  const explicitYear = Number(`${range[1]} ${range[2]}`.match(/\b(20\d{2})\b/)?.[1] ?? fallbackYear);
  return { start: dateIso(range[1]!, explicitYear), end: dateIso(range[2]!, explicitYear) };
};

const addDays = (value: string, days: number): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const addMonths = (value: string, months: number): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
};

const validIsoDate = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

export const isValidPlanDateRange = (start: string, end: string, singleDay = false): boolean => {
  if (!start && !end) return true;
  if (!validIsoDate(start)) return false;
  if (singleDay) return true;
  return validIsoDate(end) && end >= start;
};

const requestedDurationEnd = (order: ArrivalOrder, start: string): { end: string; provisional: boolean } => {
  if (!start) return { end: "", provisional: false };
  const text = `${order.rawOutcome} ${JSON.stringify(order.structured)} ${order.inputs.map((input) => JSON.stringify(input.payload)).join(" ")} ${JSON.stringify(order.interpretation?.known ?? {})} ${JSON.stringify(order.interpretation?.inferred ?? {})}`.toLowerCase();
  const approximate = /\b(?:about|around|approximately|approx|roughly|rough|or so|thinking|flexible|open[- ]ended)\b/.test(text);
  const words: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
  const months = text.match(/\b(\d+|a|an|one|two|three|four|five|six)\s+months?\b/);
  if (months) return { end: addMonths(start, Number(months[1]) || words[months[1]!] || 1), provisional: approximate };
  const weeks = text.match(/\b(\d+|one|two|three|four|five|six)\s+weeks?\b/);
  if (weeks) return { end: addDays(start, (Number(weeks[1]) || words[weeks[1]!] || 1) * 7), provisional: approximate };
  const nights = text.match(/\b(\d+|one|two|three|four|five|six)[ -]+nights?\b/);
  if (nights) return { end: addDays(start, Number(nights[1]) || words[nights[1]!] || 1), provisional: approximate };
  if (/\bweekend\b/.test(text)) return { end: addDays(start, 2), provisional: approximate };
  const days = text.match(/\b(\d+)\s+days?\b/);
  if (days) return { end: addDays(start, Number(days[1])), provisional: approximate };
  return { end: "", provisional: false };
};

const starterItemIsProvisional = (item: StarterPlanItem | undefined): boolean => typeof item?.fields.provisional === "boolean"
  ? item.fields.provisional
  : item ? item.source === "working" || item.source === "starter" || item.source === "open" : true;

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
  const currencySourceText = `${order.rawOutcome} ${JSON.stringify(order.structured)} ${order.inputs.map((input) => JSON.stringify(input.payload)).join(" ")} ${order.interpretation?.summary ?? ""} ${JSON.stringify(order.interpretation?.known ?? {})}`;
  const seededLimit = (sectionItems.get("money") ?? []).filter((item) => item.fields.moneyRole === "limit").at(-1);
  const seedCurrency = String(seededLimit?.fields.currency || moneyCurrency(currencySourceText, {}) || "AUD").toUpperCase();
  if (family === "travel") {
    const itinerary = sectionItems.get("itinerary") ?? [];
    const yearSource = `${order.rawOutcome} ${JSON.stringify(order.structured)} ${order.inputs.map((input) => JSON.stringify(input.payload)).join(" ")} ${order.interpretation?.summary ?? ""} ${JSON.stringify(order.interpretation?.known ?? {})}`;
    const year = Number(yearSource.match(/\b(20\d{2})\b/)?.[1] ?? new Date().getUTCFullYear());
    const dateOnly = itinerary.filter((item) => !String(item.fields.location ?? "").trim() && String(item.fields.start ?? "").trim());
    const firstDate = dateIso(String(dateOnly[0]?.fields.start ?? ""), year);
    dateOnly.forEach((item) => itinerary.splice(itinerary.indexOf(item), 1));
    let locations = itinerary.filter((item) => String(item.fields.location ?? "").trim() && !/leaving from|origin/i.test(item.label));
    const sourceText = `${order.rawOutcome} ${JSON.stringify(order.structured)} ${order.interpretation?.summary ?? ""} ${JSON.stringify(order.interpretation?.known ?? {})} ${JSON.stringify(order.interpretation?.inferred ?? {})}`;
    if (!locations.length) {
      const hints: Array<[RegExp, string]> = [[/hobart|tasmania/i, "Hobart"], [/oktoberfest/i, "Munich"], [/budapest|hungary/i, "Budapest"], [/poland/i, "Kraków"], [/estonia/i, "Tallinn"], [/finland/i, "Helsinki"], [/albania/i, "Tirana"], [/germany/i, "Berlin"], [/france/i, "Paris"], [/italy/i, "Milan"]];
      const inferredStops = hints.filter(([pattern]) => pattern.test(sourceText)).map(([, location]) => location);
      const fallbackStops = inferredStops.length ? inferredStops : /europe/i.test(sourceText) ? ["Berlin", "Prague", "Vienna"] : ["First destination"];
      fallbackStops.forEach((location, index) => seed("itinerary", `route_${index}`, location, { title: location, location, notes: "Rough first-pass stop — change or remove it." }));
      locations = sectionItems.get("itinerary")!.filter((item) => String(item.fields.location ?? "").trim());
    }
    const domestic = domesticAustralianTravel(sourceText);
    const travellerCount = statedEventHeadcount(sourceText) ?? 1;
    if (travellerCount > 1 && !(sectionItems.get("people") ?? []).some((item) => /traveller group/i.test(item.label))) {
      seed("people", "traveller_group", `Traveller group · ${travellerCount} people`, { title: `Traveller group · ${travellerCount} people`, role: `${travellerCount} travellers`, status: "confirmed", notes: "Party size supplied in the starting brief." });
    }
    locations.forEach((item, index) => {
      const location = String(item.fields.location || item.fields.title);
      const allowance = travelAllowance(location);
      if (!item.fields.start && firstDate) item.fields.start = addDays(firstDate, index * 4);
      if (!item.fields.end && item.fields.start) item.fields.end = addDays(String(item.fields.start), /\bweekend\b/i.test(sourceText) ? 2 : 3);
      if (!item.fields.dailyBudget) item.fields.dailyBudget = String(allowance.daily);
      if (!item.fields.currency) item.fields.currency = seedCurrency;
      item.fields.notes = `${String(item.fields.notes ?? "").trim()}${item.fields.notes ? " · " : ""}Rough timing and daily allowance; not live checked.`;
      if (item.source !== "human") item.source = "starter";
      seed("stays", `stay_${index}`, `Flexible mid-range stay · ${location}`, { title: "Flexible mid-range stay", location, start: String(item.fields.start ?? ""), end: String(item.fields.end ?? ""), nightlyBudget: String(allowance.nightly), currency: seedCurrency, notes: "Indicative planning allowance; no availability has been checked." });
    });
    const routeLocations = locations.map((item) => String(item.fields.location || item.fields.title));
    const origin = itinerary.find((item) => /leaving from|origin/i.test(item.label))?.fields.location;
    if (routeLocations.length && !(sectionItems.get("transport") ?? []).length) {
      const perPersonAllowance = domestic ? 250 : /australia|gold coast|brisbane|sydney|melbourne/i.test(String(origin)) ? 1500 : 900;
      seed("transport", "arrival_flight", `Flight to ${routeLocations[0]}`, { title: domestic ? "Domestic return flight option" : "Long-haul flight option", from: String(origin || "Home airport"), to: routeLocations[0]!, start: firstDate, provider: "To compare", cost: String(perPersonAllowance * travellerCount), currency: seedCurrency, notes: `${domestic ? "Rough return" : "Rough one-way"} allowance for ${travellerCount} traveller${travellerCount === 1 ? "" : "s"}; no fare or seat has been checked.` });
    }
    routeLocations.slice(0, -1).forEach((location, index) => seed("transport", `leg_${index}`, `${location} → ${routeLocations[index + 1]}`, { title: "Intercity transport", from: location, to: routeLocations[index + 1]!, start: String(locations[index]?.fields.end ?? ""), provider: "Rail / coach / low-cost flight", cost: "80", currency: seedCurrency, notes: "Rough allowance; mode, timetable and availability are open." }));
    const allowances = locations.map((item) => travelAllowance(String(item.fields.location || item.fields.title)));
    if (!(sectionItems.get("money") ?? []).some((item) => item.fields.moneyRole === "daily")) seed("money", "daily_spend", "Daily spending allowance", { title: "Daily spending allowance", amount: String(Math.round(allowances.reduce((sum, item) => sum + item.daily, 0) / Math.max(1, allowances.length))), currency: seedCurrency, moneyRole: "daily", notes: "Average first-pass allowance across the rough route." });
    const transportAllowance = (sectionItems.get("transport") ?? []).reduce((sum, item) => sum + Number(item.fields.cost || 0), 0);
    const weekendTrip = /\bweekend\b/i.test(sourceText);
    const routeNights = locations.map((item) => {
      const start = String(item.fields.start ?? "");
      const end = String(item.fields.end ?? "");
      const difference = validIsoDate(start) && validIsoDate(end) ? Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) : 0;
      return weekendTrip ? Math.max(1, difference || 2) : 4;
    });
    const stayAllowance = allowances.reduce((sum, item, index) => sum + item.nightly * routeNights[index]!, 0);
    const dayAllowance = allowances.reduce((sum, item, index) => sum + item.daily * (weekendTrip ? routeNights[index]! + 1 : 4) * travellerCount, 0);
    const categorySeeds: Array<[string, string, number, string]> = [
      ["transport_allowance", "Flights & transport", transportAllowance, "Rough transport allocation from the current route; no fares have been checked."],
      ["stay_allowance", "Accommodation", stayAllowance, "Four rough nights per stop; edit dates or stays to replace this centering estimate."],
      ["day_allowance", "Food & daily spending", dayAllowance, "Daily allowance multiplied across the rough route."],
      ["admin_allowance", domestic ? "Insurance & trip admin" : "Insurance, visas & admin", domestic ? 100 : 300, "Starter allowance only; live requirements and quotes are not checked."],
    ];
    const knownLimit = Number((sectionItems.get("money") ?? []).filter((item) => item.fields.moneyRole === "limit").at(-1)?.fields.amount || 0);
    const remaining = knownLimit - categorySeeds.reduce((sum, item) => sum + item[2], 0);
    categorySeeds.push(["flexible_allowance", "Experiences & flexible buffer", Math.max(0, remaining), "Uncommitted space for experiences, price movement, or route changes."]);
    categorySeeds.forEach(([id, title, amount, notes]) => seed("money", id, title, { title, amount: String(Math.round(amount)), currency: seedCurrency, moneyRole: "cost", notes }));
    const requirementSeeds = domestic
      ? ["photo_id:Confirm carrier photo-ID requirements", "insurance:Decide whether travel insurance is needed"]
      : ["passport:Passport validity check", "visa:Visa and entry-requirement check", "insurance:Travel insurance"];
    requirementSeeds.forEach((entry) => { const [id, title] = entry.split(":") as [string, string]; if (!requirements.some((item) => String(item.fields.title).toLowerCase().includes(id))) seed("requirements", id, title, { title, status: "open", notes: "Required trip check; current provider information has not been verified." }); });
    const taskSeeds = domestic
      ? ["live_fares:Compare live flight and transport prices", "local_conditions:Check current local travel conditions", "stay_options:Compare flexible accommodation", "fixed_dates:Confirm fixed dates and traveller availability"]
      : ["live_fares:Compare live flight and transport prices", "entry_rules:Verify current entry requirements", "stay_options:Compare flexible accommodation", "fixed_dates:Confirm fixed dates, people and events"];
    taskSeeds.forEach((entry) => { const [id, title] = entry.split(":") as [string, string]; if (!tasks.some((item) => String(item.fields.title).toLowerCase() === title.toLowerCase())) seed("tasks", id, title, { title, done: false, notes: "Useful next check before committing." }); });
    return;
  }
  const sourceText = `${order.rawOutcome} ${JSON.stringify(order.structured)} ${order.inputs.map((input) => JSON.stringify(input.payload)).join(" ")} ${order.interpretation?.summary ?? ""}`;
  if (family === "general" && /\binterview\b/i.test(sourceText)) {
    const year = Number(sourceText.match(/\b(20\d{2})\b/)?.[1] ?? new Date().getUTCFullYear());
    const interviewDate = dateIso(sourceText, year);
    const role = sourceText.match(/\b(?:for|as)\s+(?:a|an|the|fictional)\s+(.+?)\s+(?:role|position)\s+at\s+([^,.;]+?)(?=\s+(?:it|on|with|for)\b|[,.;]|$)/i);
    const employer = role?.[2]?.trim() || sourceText.match(/\b(?:role|position)\s+at\s+([^,.;]+?)(?=\s+(?:it|on|with|for)\b|[,.;]|$)/i)?.[1]?.trim() || "the organisation";
    const roleName = role?.[1]?.trim() || "Target role";
    const interviewer = sourceText.match(/\bwith\s+(?:the\s+)?([^,.;]+?)(?=\s+(?:on|for|about)\b|[,.;]|$)/i)?.[1]?.trim() || "Interviewer to confirm";
    const durationMinutes = Number(sourceText.match(/\b(\d{1,3})\s*[- ]minute\b/i)?.[1] ?? 0);
    const prepWords: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };
    const prepMatch = sourceText.match(/\b(\d+|one|two|three|four|five)\s+evenings?\b/i);
    const prepEvenings = Math.max(1, Math.min(5, Number(prepMatch?.[1]) || prepWords[String(prepMatch?.[1] ?? "").toLowerCase()] || 3));

    const retainedSchedule = (sectionItems.get("schedule") ?? []).filter((item) => item.source === "human" || item.source === "request");
    sectionItems.set("schedule", retainedSchedule);
    Array.from({ length: prepEvenings }, (_, index) => {
      const date = interviewDate ? addDays(interviewDate, index - prepEvenings) : "";
      const prep = [
        ["Company and role research", `Research ${employer}, the role, the market and the COO; record the strongest role-relevant signals.`],
        ["Evidence stories and likely questions", "Map the role to concise examples, draft likely answers and identify evidence gaps."],
        ["Rehearsal and technology check", "Rehearse aloud, tighten the questions to ask and test the full video setup."],
      ][Math.min(index, 2)]!;
      seed("schedule", `interview_prep_${index + 1}`, `Preparation evening ${index + 1} · ${prep[0]}`, { title: `Preparation evening ${index + 1} · ${prep[0]}`, kind: "activity", start: date, notes: `${prep[1]} Rough allocation across the available evenings; move or combine it freely.` });
    });
    addItem("schedule", {
      itemId: "request_interview",
      label: `Interview with ${interviewer}`,
      fields: { title: `Interview with ${interviewer}`, kind: "event", start: interviewDate, notes: `${durationMinutes ? `${durationMinutes}-minute ` : ""}video interview for ${roleName} at ${employer}. Time and platform remain open unless added.` },
      source: "request",
    });
    seed("schedule", "interview_follow_up", "Send follow-up note", { title: "Send follow-up note", kind: "milestone", start: interviewDate, notes: "Draft and send a concise thank-you while the conversation is fresh." });

    addItem("scope", { itemId: "request_target_role", label: `${roleName} at ${employer}`, fields: { title: `${roleName} at ${employer}`, status: "in_progress", notes: "Target role and organisation from the starting brief." }, source: "request" });
    addItem("scope", { itemId: "request_interview_format", label: "Interview format", fields: { title: "Interview format", status: "in_progress", start: interviewDate, notes: `${durationMinutes ? `${durationMinutes}-minute ` : ""}video interview with ${interviewer}.` }, source: "request" });
    seed("resources", "company_sources", `${employer} research sources`, { title: `${employer} research sources`, provider: employer, status: "open", start: interviewDate ? addDays(interviewDate, -prepEvenings) : "", notes: "Company site, product material, leadership profile, credible market context and the supplied role description." });
    seed("resources", "video_setup", "Video interview setup", { title: "Video interview setup", provider: "Platform to confirm", status: "open", start: interviewDate ? addDays(interviewDate, -1) : "", notes: "Computer, camera, microphone, connection, lighting, quiet room, joining link and backup contact." });
    addItem("requirements", { itemId: "request_interview_commitment", label: "Interview date and format", fields: { title: "Interview date and format", status: "ready", due: interviewDate, notes: `${interviewDate || "Date supplied"}${durationMinutes ? ` · ${durationMinutes} minutes` : ""} · video · ${interviewer}. Confirm the exact time, time zone and platform.` }, source: "request" });

    [
      ["research", `Research ${employer}, the COO, product and market context`, interviewDate ? addDays(interviewDate, -prepEvenings) : "", "Capture only the signals most likely to affect this role and conversation."],
      ["role_map", "Map the role requirements to your evidence", interviewDate ? addDays(interviewDate, -Math.max(2, prepEvenings - 1)) : "", "Turn the role description into a short competency and proof checklist."],
      ["stories", "Draft and tighten four to five evidence stories", interviewDate ? addDays(interviewDate, -2) : "", "Use situation, action, result and proof; keep each story adaptable to several questions."],
      ["likely_questions", "Rehearse likely questions and concise answers", interviewDate ? addDays(interviewDate, -1) : "", "Practise aloud and improve weak or overlong answers."],
      ["questions_to_ask", `Prepare useful questions for ${interviewer}`, interviewDate ? addDays(interviewDate, -1) : "", "Prioritise questions about outcomes, operating constraints, team interfaces and success measures."],
      ["technology", "Test the video setup and backup path", interviewDate ? addDays(interviewDate, -1) : "", "Run the real device, browser, audio, camera, link, room and fallback contact."],
      ["follow_up", "Send a tailored follow-up note", interviewDate, "Thank the interviewer, reference one useful discussion point and confirm continued interest."],
    ].forEach(([id, title, due, notes]) => seed("tasks", String(id), String(title), { title: String(title), due: String(due), done: false, notes: String(notes) }));

    const evidenceAlreadySupplied = order.inputs.some((input) => {
      const operation = safePayloadText(input.payload, "workspaceOperation");
      return safePayloadText(input.payload, "moduleId") === "custom_interview_evidence" && ["add", "record_add"].includes(operation);
    });
    if (!evidenceAlreadySupplied) ["Strategic judgement", "Cross-functional delivery", "Operating through ambiguity", "Executive communication"].forEach((competency, index) => seed("custom_interview_evidence", `evidence_${index + 1}`, competency, { title: competency, situation: "", action: "", result: "", proof: "", confidence: "needs_evidence" }));
    return;
  }
  if (family === "general" && isRecurringPracticePlan(sourceText) && !isInterviewPlan(sourceText)) {
    const year = Number(sourceText.match(/\b(20\d{2})\b/)?.[1] ?? new Date().getUTCFullYear());
    const startDate = dateIso(`${order.rawOutcome} ${String(order.structured.deadline ?? "")}`, year);
    const weekWords: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12 };
    const weekMatch = sourceText.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve)\s+weeks?\b/i);
    const weeks = Math.max(1, Math.min(12, Number(weekMatch?.[1]) || weekWords[String(weekMatch?.[1] ?? "").toLowerCase()] || 6));
    const sessionWords: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };
    const sessionMatch = sourceText.match(/\b(\d+|one|two|three|four|five|six|seven)\s+(?:evenings?|sessions?|times?)\s+(?:a|per)\s+week\b/i);
    const sessionsPerWeek = Math.max(1, Math.min(7, Number(sessionMatch?.[1]) || sessionWords[String(sessionMatch?.[1] ?? "").toLowerCase()] || 3));
    const durationMinutes = Math.max(5, Math.min(180, Number(sourceText.match(/\b(\d{1,3})\s*[- ]?minutes?\b/i)?.[1] ?? 30)));
    const languagePractice = /\b(?:italian|language|conversational|vocabulary|greetings?|ordering food|directions?|listening)\b/i.test(sourceText);
    const weeklyFocus = languagePractice
      ? [
        ["Foundations and greetings", "Build a small useful phrase set, practise pronunciation and record a short baseline introduction."],
        ["Ordering food and drink", "Practise a complete café or restaurant exchange, including quantities, preferences and payment."],
        ["Directions and getting around", "Ask for, understand and repeat simple route instructions using landmarks and transport words."],
        ["Listening for meaning", "Use short beginner audio to catch key words, numbers, times and the overall intention without translating every word."],
        ["Mixed short conversations", "Combine the focus areas in two- to three-minute exchanges and repair gaps without abandoning the conversation."],
        ["Review and final recording", "Repeat the baseline prompt, compare it with week one and choose what to continue next."],
      ]
      : [
        ["Baseline and foundations", "Record the starting point, choose the core material and define one observable success measure."],
        ["Core skill one", "Practise the first essential component in short repeated sessions."],
        ["Core skill two", "Add the next component while retaining the first."],
        ["Combination practice", "Use the main components together in a realistic exercise."],
        ["Weak-point practice", "Use evidence from the log to target the least comfortable part."],
        ["Review and continuation", "Repeat the baseline, note the change and choose the next cycle."],
      ];
    const scheduleItems = (sectionItems.get("schedule") ?? []).filter((item) => !(item.source === "request" && /^when$/i.test(item.label)));
    sectionItems.set("schedule", scheduleItems);
    if (!scheduleItems.some((item) => /^Week \d+/i.test(item.label))) Array.from({ length: weeks }, (_, index) => {
      const focus = weeklyFocus[Math.min(index, weeklyFocus.length - 1)]!;
      const weekStart = startDate ? addDays(startDate, index * 7) : "";
      seed("schedule", `practice_week_${index + 1}`, `Week ${index + 1} · ${focus[0]}`, { title: `Week ${index + 1} · ${focus[0]}`, kind: "milestone", start: weekStart, end: weekStart ? addDays(weekStart, 6) : "", notes: `${sessionsPerWeek} × ${durationMinutes}-minute sessions. ${focus[1]} Provisional rhythm; move the sessions freely.` });
    });
    const focusItems: string[] = languagePractice
      ? ["Greetings and introductions", "Ordering food and drink", "Directions and transport", "Listening for key words and intent"]
      : weeklyFocus.slice(0, 4).map((focus) => String(focus[0]));
    const scope = sectionItems.get("scope") ?? [];
    focusItems.forEach((title, index) => { if (!scope.some((item) => item.label === title)) seed("scope", `practice_focus_${index + 1}`, title, { title, status: "in_progress", start: startDate, notes: "Starter focus from the request; rename, remove or reorder it." }); });
    const resources = sectionItems.get("resources") ?? [];
    const practiceResources: Array<[string, string, string]> = [
      ["reference", "Core phrase and reference source", "Choose one free, reliable beginner reference rather than collecting several overlapping sources."],
      ["audio", "Short beginner listening source", "Choose free audio with a transcript and replayable clips suitable for 30-minute sessions."],
      ["recording", "Voice recording and playback", "Use the existing phone or computer recorder for baseline, pronunciation and final comparison."],
    ];
    practiceResources.forEach(([id, title, notes]) => { if (!resources.some((item) => item.label === title)) seed("resources", `practice_${id}`, title, { title, provider: "Free resource to choose", status: "open", start: startDate, notes }); });
    if (!requirements.some((item) => /sessions? per week|weekly practice|minutes? per week/i.test(`${item.label} ${String(item.fields.notes ?? "")}`))) seed("requirements", "practice_time", `${sessionsPerWeek} × ${durationMinutes}-minute sessions per week`, { title: `${sessionsPerWeek} × ${durationMinutes}-minute sessions per week`, status: "in_progress", due: startDate, notes: `${sessionsPerWeek * durationMinutes} minutes per week across ${weeks} weeks. The exact evenings remain editable.` });
    if (hasExplicitZeroSpendIntent(sourceText) && !requirements.some((item) => /paid budget/i.test(item.label))) seed("requirements", "practice_budget", "Use a zero paid budget", { title: "Use a zero paid budget", status: "ready", due: startDate, notes: "Use existing tools and free resources unless the person changes this limit." });
    [
      ["slots", "Choose the three repeatable weekly study evenings", startDate, "Place the real sessions on the calendar; keep them movable when a week changes."],
      ["resources", "Choose one free reference and one free listening source", startDate, "Avoid collecting more material than the weekly rhythm can use."],
      ["baseline", "Record a short baseline introduction", startDate, "Keep it as the comparison point for the final week."],
      ["greetings", "Practise greetings and introductions in complete exchanges", startDate ? addDays(startDate, 6) : "", "Move beyond isolated words into short usable turns."],
      ["ordering", "Practise a complete food-ordering exchange", startDate ? addDays(startDate, 13) : "", "Include preferences, quantities, a clarification and payment."],
      ["directions_listening", "Practise directions and complete a listening checkpoint", startDate ? addDays(startDate, 27) : "", "Log what was understood and what still needs repetition."],
      ["final", "Record a final mixed conversation and choose the next cycle", startDate ? addDays(startDate, Math.max(0, weeks * 7 - 1)) : "", "Compare it with the baseline and retain only the next useful focus."],
    ].forEach(([id, title, due, notes]) => { if (!tasks.some((item) => item.label === title)) seed("tasks", `practice_${id}`, String(title), { title: String(title), due: String(due), done: false, notes: String(notes) }); });
    return;
  }
  if (family === "renovation") {
    const year = Number(sourceText.match(/\b(20\d{2})\b/)?.[1] ?? new Date().getUTCFullYear());
    const range = dateRangeIso(sourceText, year);
    const startDate = range.start || dateIso(sourceText, year);
    const endDate = range.end || requestedDurationEnd(order, startDate).end || startDate;
    const homeOffice = /\bhome office\b/i.test(sourceText);
    const area = homeOffice ? "Home office" : "Project area";
    const budget = Number(moneyAmount(sourceText)) || 0;
    const scope = sectionItems.get("scope") ?? [];
    const resources = sectionItems.get("resources") ?? [];

    const scopeSeeds: Array<[string, string, string]> = [];
    if (/\bpaint(?:ing|ed)?\b/i.test(sourceText)) scopeSeeds.push(["painting", "Prepare and paint the room", "Wall preparation, primer and finish coats; colour and exact paint system remain editable."]);
    if (/\b(?:light|lighting|electrical|electrician)\b/i.test(sourceText)) scopeSeeds.push(["lighting", "Improve lighting and electrical fit", "Confirm task, ambient and natural-light needs before a licensed electrician changes fixed wiring."]);
    if (/\bstorage\b/i.test(sourceText)) scopeSeeds.push(["storage", "Add useful storage", "Measure files, equipment and clearances before choosing shelves, cabinets or wall storage."]);
    if (/\b(?:standing\s+desk|sit[- ]stand\s+desk|desk)\b/i.test(sourceText)) scopeSeeds.push(["desk", /\bstanding\s+desk\b/i.test(sourceText) ? "Add a standing desk" : "Confirm the desk setup", "Check width, depth, height range, cable routing and chair clearance before purchase."]);
    if (!scopeSeeds.length) scopeSeeds.push(["scope", "Confirm the renovation scope", "List each room, finish, fixture and item that belongs inside this project."]);
    scopeSeeds.forEach(([id, title, notes]) => { if (!scope.some((item) => item.label === title)) seed("scope", id, title, { title, location: area, cost: "", notes }); });

    const schedule = sectionItems.get("schedule") ?? [];
    if (!schedule.length) {
      const paintStart = startDate ? addDays(startDate, 5) : "";
      [
        ["measure", "Measure, photograph and confirm the room scope", startDate, startDate, "Record dimensions, outlets, natural light, storage needs and the desk working zone."],
        ["electrical_plan", "Get the lighting plan and electrician quote", startDate, startDate ? addDays(startDate, 2) : "", "Confirm the licensed electrical scope before paint and installation decisions are locked."],
        ["source", "Choose and source paint, storage and desk", startDate ? addDays(startDate, 3) : "", startDate ? addDays(startDate, 4) : "", "Compare fit, lead time, returns and the current budget before buying."],
        ["paint", "Prepare and paint over the weekend", paintStart, paintStart ? addDays(paintStart, 1) : "", "DIY work from the brief; protect the room, repair surfaces and allow drying time."],
        ["install", "Install lighting, storage and desk", startDate ? addDays(startDate, 7) : "", endDate ? addDays(endDate, -1) : "", "Sequence the licensed electrical work before final furniture, storage and cable setup."],
        ["handover", "Set up, test and close the room", endDate, endDate, "Test lighting and desk ergonomics, put equipment away and retain receipts and warranties."],
      ].forEach(([id, title, start, end, notes]) => seed("schedule", String(id), String(title), { title: String(title), kind: "milestone", location: area, start: String(start), end: String(end), notes: String(notes) }));
    }

    if (!resources.length) {
      if (/\b(?:light|lighting|electrical|electrician)\b/i.test(sourceText)) seed("resources", "electrician", "Licensed electrician", { title: "Licensed electrician", provider: "Quote and availability to confirm", quantity: "1", bookingStatus: "idea", start: startDate ? addDays(startDate, 1) : "", cost: budget ? String(Math.round(budget * 0.2)) : "", notes: "Required for fixed electrical work; no booking has been made." });
      if (/\bpaint(?:ing|ed)?\b/i.test(sourceText)) seed("resources", "paint", "Paint and preparation supplies", { title: "Paint and preparation supplies", provider: "Supplier to compare", quantity: "1", bookingStatus: "idea", start: startDate ? addDays(startDate, 4) : "", cost: budget ? String(Math.round(budget * 0.1)) : "", notes: "Include cleaner, filler, sanding, protection, primer and finish paint as needed." });
      if (/\bstorage\b/i.test(sourceText)) seed("resources", "storage", "Storage system", { title: "Storage system", provider: "Option to shortlist", quantity: "1", bookingStatus: "idea", start: startDate ? addDays(startDate, 4) : "", cost: budget ? String(Math.round(budget * 0.2)) : "", notes: "Measure first; compare freestanding and wall-mounted options." });
      if (/\b(?:standing\s+desk|sit[- ]stand\s+desk)\b/i.test(sourceText)) seed("resources", "desk", "Standing desk", { title: "Standing desk", provider: "Option to shortlist", quantity: "1", bookingStatus: "idea", start: startDate ? addDays(startDate, 4) : "", cost: budget ? String(Math.round(budget * 0.25)) : "", notes: "Check fit, stability, load, height range, warranty and delivery timing before purchase." });
    }

    if (!requirements.length) {
      if (/\blicensed electrician\b/i.test(sourceText)) addItem("requirements", { itemId: "request_licensed_electrician", label: "Use a licensed electrician for electrical work", fields: { title: "Use a licensed electrician for electrical work", status: "open", due: startDate ? addDays(startDate, 2) : "", notes: "Human-supplied hard requirement; do not convert fixed electrical work into DIY scope." }, source: "request" });
      if (/\bpaint(?:ing)?\b.*\bmyself\b|\bi will do painting myself\b/i.test(sourceText)) addItem("requirements", { itemId: "request_diy_paint", label: "Keep painting as weekend DIY work", fields: { title: "Keep painting as weekend DIY work", status: "in_progress", due: startDate ? addDays(startDate, 5) : "", notes: "Human-supplied working commitment; timing may move but the current responsibility split is visible." }, source: "request" });
    }

    if (!tasks.length) {
      [
        ["measure", "Measure the room, desk zone, storage needs and outlet positions", startDate],
        ["lighting", "Define the lighting outcome and get a licensed electrician quote", startDate ? addDays(startDate, 2) : ""],
        ["shortlist", "Shortlist paint, storage and standing desk options against fit and budget", startDate ? addDays(startDate, 3) : ""],
        ["protect", "Clear and protect the room before painting", startDate ? addDays(startDate, 4) : ""],
        ["paint", "Complete surface preparation and weekend painting", startDate ? addDays(startDate, 6) : ""],
        ["install", "Coordinate electrical, storage and desk installation", endDate ? addDays(endDate, -1) : ""],
        ["setup", "Test the finished workspace and store receipts and warranties", endDate],
      ].forEach(([id, title, due]) => seed("tasks", String(id), String(title), { title: String(title), due: String(due), done: false, notes: "Open until completed." }));
    }

    const moneyItems = sectionItems.get("money") ?? [];
    if (!moneyItems.some((item) => item.fields.moneyRole === "cost")) {
      allocateWholePlanUnits(budget, [["trades", "Licensed trades & lighting", 25], ["furniture", "Desk & storage", 45], ["paint", "Paint & preparation", 15], ["contingency", "Contingency", 15]])
        .forEach(([id, title, percent, amount]) => seed("money", `category_${id}`, title, { title, amount: String(amount), currency: seedCurrency, moneyRole: "cost", notes: `${percent}% first-pass allocation; change it freely.` }));
    }
  }
  if (family === "event" && isDinnerPlan(sourceText)) {
    const year = Number(sourceText.match(/\b(20\d{2})\b/)?.[1] ?? new Date().getUTCFullYear());
    const dinnerDate = dateIso(sourceText, year);
    const budgetText = sourceText.match(/(?:\baud|\ba\$|\$)\s*(\d[\d,]*(?:\.\d+)?)\s+budget\b/i)?.[1]
      ?? sourceText.match(/\bbudget(?:\s+is|\s+of|\s*:)?\s*(?:aud|a\$|\$)?\s*(\d[\d,]*(?:\.\d+)?)\b/i)?.[1]
      ?? sourceText.match(/\b(?:aud|a\$)\s*(\d[\d,]*(?:\.\d+)?)\b/i)?.[1]
      ?? "";
    const budget = Number(budgetText.replaceAll(",", "")) || 0;
    const headcount = statedEventHeadcount(sourceText) ?? 10;
    const schedule = sectionItems.get("schedule") ?? [];
    if (!schedule.length) {
      [
        ["guest_check", "Confirm guests and dietary detail", addDays(dinnerDate, -7), "", "Close the guest list and resolve allergy and vegetarian details before finalising the menu."],
        ["menu_lock", "Lock menu and shopping list", addDays(dinnerDate, -4), "", "Choose the courses, quantities and ingredient substitutions."],
        ["shop_prep", "Main shop and make-ahead prep", addDays(dinnerDate, -1), "16:00", "Complete shopping, dessert, sauces and other safe make-ahead work."],
        ["day_setup", "Finish prep and set the room", dinnerDate, "14:00", "Set the table, chill drinks and complete most preparation before guests arrive."],
        ["guest_arrival", "Guests arrive", dinnerDate, "18:30", "Working time only; confirm it in Open questions."],
        ["serve_dinner", "Serve dinner", dinnerDate, "19:00", "Working service time with a calm buffer after arrival."],
        ["close_out", "Dessert, coffee and cleanup", dinnerDate, "21:00", "Leave only light clearing and storage for after the meal."],
      ].forEach(([id, title, start, startTime, notes]) => seed("schedule", String(id), String(title), { title: String(title), kind: "event", location: "Home", start: String(start), startTime: String(startTime), end: String(start), notes: String(notes) }));
    }
    const scope = sectionItems.get("scope") ?? [];
    if (!scope.length) {
      seed("scope", "guest_group", "Dinner guests", { title: "Dinner guests", headcount: String(headcount), bookingStatus: "idea", location: "Home", start: dinnerDate, notes: `${headcount} people stated in the starting brief. Keep dietary and accessibility details attached to the people they affect.` });
      seed("scope", "home_setup", "Dining and seating setup", { title: "Dining and seating setup", headcount: String(headcount), bookingStatus: "idea", location: "Home", start: dinnerDate, notes: "Check table space, chairs, serving flow and any food-safety preparation zones." });
    }
    const menu = sectionItems.get("custom_menu_dietary") ?? [];
    if (!menu.length) {
      seed("custom_menu_dietary", "starter", "Roasted tomato and red pepper soup", { title: "Roasted tomato and red pepper soup", course: "Starter", vegetarian: "yes", nutSafe: "Use verified nut-free stock; protect against cross-contact.", prepAhead: "Make the day before; reheat before serving.", notes: "Working menu choice — replace freely." });
      seed("custom_menu_dietary", "main", "Mushroom and spinach lasagne with green salad", { title: "Mushroom and spinach lasagne with green salad", course: "Main", vegetarian: "yes", nutSafe: "Check pasta, cheese and dressing labels; use separate clean utensils.", prepAhead: "Assemble lasagne and salad components before guests arrive; bake and dress at service.", notes: "One main for everyone keeps the vegetarian requirement simple." });
      seed("custom_menu_dietary", "dessert", "Lemon posset with berries", { title: "Lemon posset with berries", course: "Dessert", vegetarian: "yes", nutSafe: "Use label-checked ingredients and no nut garnish.", prepAhead: "Prepare and chill the day before.", notes: "Working make-ahead dessert." });
    }
    const resources = sectionItems.get("resources") ?? [];
    if (!resources.length) {
      seed("resources", "groceries", "Groceries and fresh ingredients", { title: "Groceries and fresh ingredients", provider: "Local supermarket / grocer", bookingStatus: "idea", start: addDays(dinnerDate, -1), cost: String(Math.round(budget * 0.5)), notes: "Planning allowance; check allergy-safe labels during the shop." });
      seed("resources", "drinks", "Drinks and ice", { title: "Drinks and ice", provider: "Bottle shop / supermarket", bookingStatus: "idea", start: addDays(dinnerDate, -1), cost: budget ? String(Math.round(budget * 0.24)) : "", notes: budget ? `Allowance assumes drinks are inside the ${seedCurrency} ${budget.toLocaleString("en-AU")} cap until answered otherwise.` : "Keep this allowance open until a total budget is set." });
      seed("resources", "table", "Table, serving and storage check", { title: "Table, serving and storage check", provider: "At home", bookingStatus: "idea", start: addDays(dinnerDate, -3), cost: String(Math.round(budget * 0.08)), notes: "Check chairs, platters, fridge space, serving utensils and food-storage containers." });
    }
    const moneyItems = sectionItems.get("money") ?? [];
    if (budget && !moneyItems.some((item) => item.fields.moneyRole === "limit")) seed("money", "limit", "Total budget", { title: "Total budget", amount: String(budget), currency: seedCurrency, moneyRole: "limit", notes: "Human-supplied event budget." });
    if (!moneyItems.some((item) => item.fields.moneyRole === "cost")) {
      allocateWholePlanUnits(budget, [["food", "Food and ingredients", 50], ["drinks", "Drinks and ice", 24], ["table", "Table and atmosphere", 8], ["buffer", "Contingency", 18]])
        .forEach(([id, title, percent, amount]) => seed("money", `category_${id}`, title, { title, amount: String(amount), currency: seedCurrency, moneyRole: "cost", notes: `${percent}% first-pass allocation; change it freely.` }));
    }
    if (!requirements.length) {
      seed("requirements", "nut_safety", "Nut-allergy safety", { title: "Nut-allergy safety", status: "open", due: addDays(dinnerDate, -4), notes: "Confirm severity and cross-contact threshold; check every packaged ingredient and keep preparation surfaces and utensils safe." });
      seed("requirements", "vegetarian", "Vegetarian coverage", { title: "Vegetarian coverage", status: "open", due: addDays(dinnerDate, -4), notes: "The working menu is vegetarian for everyone; confirm dairy, egg and other preferences." });
      seed("requirements", "prep_ahead", "Most preparation finished before arrival", { title: "Most preparation finished before arrival", status: "in_progress", due: dinnerDate, notes: "Choose make-ahead dishes and leave only reheating, baking, salad dressing and plating near service." });
    }
    [
      ["guest_details", "Confirm guest list, vegetarian preferences and allergy severity", addDays(dinnerDate, -7)],
      ["menu", "Confirm the menu and quantities", addDays(dinnerDate, -4)],
      ["equipment", "Check seating, serving dishes, fridge and oven capacity", addDays(dinnerDate, -3)],
      ["shop", "Buy groceries, drinks and ice", addDays(dinnerDate, -1)],
      ["make_ahead", "Complete make-ahead cooking and prep", addDays(dinnerDate, -1)],
      ["setup", "Set the table and finish the room", dinnerDate],
      ["service_plan", "Write the final cooking and serving run sheet", addDays(dinnerDate, -1)],
    ].forEach(([id, title, due]) => { if (!tasks.some((item) => String(item.fields.title).toLowerCase() === String(title).toLowerCase())) seed("tasks", String(id), String(title), { title: String(title), due: String(due), done: false, notes: "Open until completed." }); });
    return;
  }
  const schedule = sectionItems.get("schedule") ?? [];
  if (!schedule.length) {
    const labels = family === "renovation" ? ["Confirm scope", "Design and quotes", "Order and prepare", "Build", "Handover"] : family === "event" ? ["Confirm venue and people", "Book key suppliers", "Prepare programme", "Run the event", "Close out"] : ["Confirm the outcome", "Prepare", "Deliver", "Review"];
    labels.forEach((label, index) => seed("schedule", `phase_${index}`, label, { title: label, notes: "Rough first-pass stage — change or reorder it." }));
  }
  const statedHeadcount = statedEventHeadcount(sourceText);
  const resources = sectionItems.get("resources") ?? [];
  if (family === "general" && statedHeadcount && !resources.some((item) => Number(item.fields.headcount) === statedHeadcount)) {
    seed("resources", "participants", "Participants", { title: "Participants", headcount: String(statedHeadcount), status: "in_progress", notes: `${statedHeadcount} people stated in the starting brief. Keep roles, access needs and attendance changes attached here.` });
  }
  if (!requirements.length) seed("requirements", "key_requirement", family === "renovation" ? "Permits and approvals check" : family === "event" ? "Venue and supplier commitments" : "Hard limits and approvals", { title: family === "renovation" ? "Permits and approvals check" : family === "event" ? "Venue and supplier commitments" : "Hard limits and approvals", status: "open", notes: "First-pass requirement; verify before committing." });
  if (!tasks.length) {
    const noPaidBudget = hasExplicitZeroSpendIntent(sourceText);
    const starterTasks = noPaidBudget
      ? ["Confirm the rough sequence", "Confirm key dates and timing", "Check the next external dependency"]
      : ["Confirm the rough sequence", "Add known costs and dates", "Check the next external dependency"];
    starterTasks.forEach((title, index) => seed("tasks", `general_${index}`, title, { title, done: false, notes: "Useful next step." }));
  }
  const moneyItems = sectionItems.get("money") ?? [];
  if (!moneyItems.some((item) => item.fields.moneyRole === "cost")) {
    const limitItem = moneyItems.filter((item) => item.fields.moneyRole === "limit").at(-1);
    const limit = Number(limitItem?.fields.amount || 0);
    const currency = String(limitItem?.fields.currency || "AUD");
    const splits: WeightedPlanItem[] = family === "renovation"
      ? [["labour", "Labour & trades", 40], ["materials", "Materials & fixtures", 35], ["professional", "Approvals & professional fees", 10], ["contingency", "Contingency", 15]]
      : family === "event"
        ? [["venue", "Venue", 25], ["food", "Food & drink", 35], ["production", "Suppliers & production", 25], ["contingency", "Contingency", 15]]
        : [["delivery", "Core delivery", 50], ["people", "People & resources", 25], ["tools", "Tools & logistics", 15], ["buffer", "Flexible buffer", 10]];
    if (family !== "general" || limit > 0) allocateWholePlanUnits(limit, splits)
      .forEach(([id, title, percent, amount]) => seed("money", `category_${id}`, title, { title, amount: String(amount), currency, moneyRole: "cost", notes: `${percent}% first-pass allocation; change the category or amount freely.` }));
  }
};

const inputVersion = (input: ArrivalInput): number => {
  const match = input.inputId.match(/_(\d+)$/);
  return match ? Number(match[1]) : 0;
};

export const arrivalUsesManualWorkspace = (order: ArrivalOrder): boolean => order.structured.planningMode === "manual"
  || order.inputs.some((input) => input.payload.workspaceOperation === "manual_takeover");

export const arrivalUsesCodexWaitingWorkspace = (order: ArrivalOrder): boolean => order.inputs.some((input) => input.payload.workspaceOperation === "codex_handoff_workspace");

export const arrivalInputIsWorkflowOnly = (input: ArrivalInput): boolean => ["manual_takeover", "codex_handoff_workspace"].includes(String(input.payload.workspaceOperation ?? ""));

export const starterFamilyForArrival = (order: ArrivalOrder): StarterPlanPresentation["family"] => {
  const requestSource = `${order.rawOutcome} ${JSON.stringify(order.structured)} ${order.interpretation?.summary ?? ""}`;
  if (isInterviewPlan(requestSource) || isRecurringPracticePlan(requestSource)) return "general";
  const inferredFamily = starterFamily(order.interpretation?.inferredFamily);
  const briefFamily = starterFamily(order.rawOutcome);
  return inferredFamily === "general" && briefFamily !== "general" ? briefFamily : inferredFamily;
};

export const starterPlanForArrival = (order: ArrivalOrder): StarterPlanPresentation | null => {
  const interpretation = order.interpretation;
  const manual = arrivalUsesManualWorkspace(order);
  const editableWorkspace = manual || arrivalUsesCodexWaitingWorkspace(order) || order.structured.planningMode === "codex";
  if (!interpretation?.complete && !editableWorkspace) return null;
  const requestSource = `${order.rawOutcome} ${JSON.stringify(order.structured)} ${interpretation?.summary ?? ""}`;
  const explicitlyComposableOutcome = isInterviewPlan(requestSource) || isRecurringPracticePlan(requestSource);
  const family = starterFamilyForArrival(order);
  const basedOnVersion = interpretation?.basedOnVersion ?? 1;
  const laterHumanInputs = order.inputs.filter((input) => inputVersion(input) > basedOnVersion && !arrivalInputIsWorkflowOnly(input));
  const openItems = [...new Set([
    ...(interpretation?.dependencies ?? []).filter((dependency) => dependency.status === "open" && !dependency.sourcePaths.some((path) => path.includes(".openQuestions."))).map((dependency) => dependency.detail?.trim() || dependency.title.trim()),
    ...(interpretation?.missing ?? []).map((item) => item.trim()),
  ].filter(Boolean))];
  const definitions: StarterSectionDefinition[] = starterSections[family].map((definition) => ({ ...definition, fields: definition.fields.map((entry) => ({ ...entry })) }));
  if (family === "event" && /\b(?:dinner party|dinner at home|host(?:ing)? dinner)\b/i.test(order.rawOutcome)) {
    definitions.splice(2, 0, {
      sectionId: "custom_menu_dietary",
      label: "Menu & dietary fit",
      description: "Shape the courses, prep-ahead work and dietary safety in one editable place.",
      emptyLabel: "No menu items added yet.",
      variant: "cards",
      fields: dinnerMenuFields.map((entry) => ({ ...entry })),
      keywords: ["menu", "dish", "course", "vegetarian", "allergy", "nut", "food", "prep"],
      custom: true,
      customSource: "starter",
    });
  }
  if (family === "general" && isInterviewPlan(requestSource)) {
    definitions.splice(2, 0, {
      sectionId: "custom_interview_evidence",
      label: "Interview evidence bank",
      description: "Connect the role’s likely competencies to concise examples, actions, results and proof.",
      emptyLabel: "No interview stories added yet.",
      variant: "cards",
      fields: interviewEvidenceFields.map((entry) => ({ ...entry })),
      keywords: ["interview", "competency", "story", "stories", "achievement", "evidence", "result", "proof"],
      custom: true,
      customSource: "starter",
    });
  }
  if (family === "general" && isRecurringPracticePlan(requestSource) && !isInterviewPlan(requestSource)) {
    definitions.splice(2, 0, {
      sectionId: "custom_practice_log",
      label: "Practice log",
      description: "Record each session, its focus and a small piece of progress evidence without needing Codex.",
      emptyLabel: "No practice sessions recorded yet.",
      variant: "cards",
      fields: practiceLogFields.map((entry) => ({ ...entry })),
      keywords: ["practice", "study", "session", "lesson", "progress", "confidence", "evidence", "reflection"],
      custom: true,
      customSource: "starter",
    });
  }
  order.inputs.forEach((input) => {
    const operation = safePayloadText(input.payload, "workspaceOperation");
    if (!operation.startsWith("module_")) return;
    const moduleId = safePayloadText(input.payload, "moduleId");
    const existingIndex = definitions.findIndex((definition) => definition.sectionId === moduleId && definition.custom);
    if (operation === "module_delete") {
      if (existingIndex >= 0) definitions.splice(existingIndex, 1);
      return;
    }
    if (operation !== "module_add" && operation !== "module_update") return;
    const definition = customModuleDefinition(input.payload, input.sourceSurface);
    if (!definition) return;
    if (existingIndex >= 0) definitions.splice(existingIndex, 1, definition);
    else definitions.push(definition);
  });
  const sectionItems = new Map(definitions.map((definition) => [definition.sectionId, [] as StarterPlanItem[]]));
  const sectionOptions = new Map(definitions.map((definition) => [definition.sectionId, [] as StarterPlanItem[]]));
  const sectionComments = new Map(definitions.map((definition) => [definition.sectionId, [] as Array<{ commentId: string; text: string; forCodex: boolean }>]));
  const sectionAnswers = new Map(definitions.map((definition) => [definition.sectionId, [] as Array<{ questionId: string; prompt: string; answer: string }>]));
  const overviewOverrides: Record<string, string | boolean> = {};
  const addItem = (sectionId: string, item: StarterPlanItem): void => {
    const resolved = sectionItems.has(sectionId) ? sectionId : sectionAliases[sectionId] && sectionItems.has(sectionAliases[sectionId]!) ? sectionAliases[sectionId]! : definitions[0]!.sectionId;
    const items = sectionItems.get(resolved)!;
    const fingerprint = `${item.label.toLowerCase()}|${JSON.stringify(item.fields)}`;
    if (!items.some((existing) => `${existing.label.toLowerCase()}|${JSON.stringify(existing.fields)}` === fingerprint)) items.push(item);
  };
  const addOption = (sectionId: string, item: StarterPlanItem): void => {
    const resolved = sectionOptions.has(sectionId) ? sectionId : sectionAliases[sectionId] && sectionOptions.has(sectionAliases[sectionId]!) ? sectionAliases[sectionId]! : definitions[0]!.sectionId;
    const options = sectionOptions.get(resolved)!;
    const fingerprint = `${item.label.toLowerCase()}|${JSON.stringify(item.fields)}`;
    if (!options.some((existing) => `${existing.label.toLowerCase()}|${JSON.stringify(existing.fields)}` === fingerprint)) options.push(item);
  };
  const requestFacts = flattenPlanFacts(Object.fromEntries([
    ["when", order.structured.deadline],
    ["whatIsLimited", order.structured.finiteLimit],
    ["mustNotChange", order.structured.hardConstraint],
  ].filter((entry) => entry[1] !== null && entry[1] !== undefined && entry[1] !== "")));
  const addFacts = (facts: FlatPlanFact[], source: StarterPlanItemSource, prefix: string): void => facts.forEach((fact, index) => {
    const factText = plainValue(fact.value, fact.valueKey, fact.valueParent);
    const temporalLimit = /whatislimited/.test(normalizedPath(fact.path))
      && /\b(?:minutes?|hours?|days?|weeks?|months?|sessions?|evenings?)\b/i.test(factText)
      && !(Number(moneyAmount(factText)) > 0);
    const sectionId = temporalLimit && sectionItems.has("requirements") ? "requirements" : sectionForFact(definitions, fact.path);
    const values = Array.isArray(fact.value) && fact.value.every((value) => value === null || typeof value !== "object") && ["itinerary", "schedule", "tasks"].includes(sectionId) ? fact.value : [fact.value];
    values.forEach((value, valueIndex) => addItem(sectionId, { itemId: `${prefix}_${index}_${valueIndex}`, label: fact.label, fields: fieldsForFact(sectionId, fact, value), source }));
  });
  const knownRecord = interpretation?.known && typeof interpretation.known === "object" && !Array.isArray(interpretation.known) ? interpretation.known : {};
  const inferredRecord = interpretation?.inferred && typeof interpretation.inferred === "object" && !Array.isArray(interpretation.inferred) ? interpretation.inferred : {};
  const reviewedOverview = knownRecord.overview;
  const reviewedKnownSections = knownRecord.sections;
  const reviewedInferredSections = inferredRecord.sections;
  const hasReviewedWorkspaceSnapshot = reviewedOverview !== null && typeof reviewedOverview === "object" && !Array.isArray(reviewedOverview)
    && Array.isArray(reviewedKnownSections) && Array.isArray(reviewedInferredSections);
  const restoreReviewedSections = (value: unknown, fallbackSource: StarterPlanItemSource): void => {
    if (!Array.isArray(value)) return;
    value.forEach((candidate) => {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return;
      const section = candidate as Record<string, unknown>;
      const sectionId = typeof section.sectionId === "string" ? section.sectionId : "";
      if (!sectionItems.has(sectionId)) return;
      if (Array.isArray(section.items)) section.items.forEach((rawItem) => {
        if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) return;
        const item = rawItem as Record<string, unknown>;
        const itemId = typeof item.itemId === "string" ? item.itemId.slice(0, 200) : "";
        const label = typeof item.label === "string" ? item.label.slice(0, 500) : "";
        const source = typeof item.source === "string" && (["request", "known", "working", "starter", "human", "open"] as string[]).includes(item.source)
          ? item.source as StarterPlanItemSource : fallbackSource;
        if (itemId && label) addItem(sectionId, { itemId, label, fields: safeFields(item.fields), source });
      });
      if (Array.isArray(section.answers)) section.answers.forEach((rawAnswer) => {
        if (!rawAnswer || typeof rawAnswer !== "object" || Array.isArray(rawAnswer)) return;
        const answer = rawAnswer as Record<string, unknown>;
        const questionId = typeof answer.questionId === "string" ? answer.questionId.slice(0, 200) : "";
        const prompt = typeof answer.prompt === "string" ? answer.prompt.slice(0, 500) : "";
        const text = typeof answer.answer === "string" ? answer.answer.slice(0, 2_000) : "";
        if (questionId && prompt && text && !sectionAnswers.get(sectionId)?.some((entry) => entry.questionId === questionId)) sectionAnswers.get(sectionId)?.push({ questionId, prompt, answer: text });
      });
    });
  };
  addFacts(requestFacts, "request", "request");
  if (hasReviewedWorkspaceSnapshot) {
    Object.assign(overviewOverrides, safeFields(reviewedOverview));
    restoreReviewedSections(reviewedKnownSections, "known");
    restoreReviewedSections(reviewedInferredSections, "working");
  } else {
    addFacts(flattenPlanFacts(interpretation?.known ?? {}), "known", "known");
    addFacts(flattenPlanFacts(interpretation?.inferred ?? {}), "working", "working");
  }
  const requestBudget = moneyAmount(requestSource);
  if (Number(requestBudget) > 0 && !(sectionItems.get("money") ?? []).some((item) => item.fields.moneyRole === "limit")) {
    addItem("money", { itemId: "request_overall_budget", label: "Total budget", fields: { title: "Total budget", amount: requestBudget, currency: moneyCurrency(requestSource, {}) || "AUD", moneyRole: "limit", notes: "Budget supplied in the starting brief." }, source: "request" });
  }
  openItems.forEach((item, index) => addItem("tasks", { itemId: `open_${index}`, label: item, fields: { title: item, done: false }, source: "open" }));
  if (!hasReviewedWorkspaceSnapshot && (interpretation?.complete || editableWorkspace)) seedRoughPlan(family, order, sectionItems, addItem);
  const operatorWorkspaceInput = (input: ArrivalInput): boolean => input.sourceSurface === "codex" && ["record_", "option_", "module_"].some((prefix) => safePayloadText(input.payload, "workspaceOperation").startsWith(prefix));
  const humanInputsAfterInterpretation = laterHumanInputs.filter((input) => !operatorWorkspaceInput(input));
  const workspaceInputs = order.inputs.filter((input) => safePayloadText(input.payload, "workspaceOperation"));
  const presentationInputs = [...workspaceInputs, ...humanInputsAfterInterpretation.filter((input) => !safePayloadText(input.payload, "workspaceOperation"))];
  presentationInputs.forEach((input, index) => {
    const operation = safePayloadText(input.payload, "workspaceOperation");
    if (operation) {
      if (operation.startsWith("module_")) return;
      if (operation === "overview") {
        const overviewFields = safeFields(input.payload.fields);
        const carriesDates = ["start", "end", "singleDay"].some((key) => Object.prototype.hasOwnProperty.call(overviewFields, key));
        if (carriesDates) {
          const nextStart = String(overviewFields.start ?? overviewOverrides.start ?? "");
          const nextSingleDay = typeof overviewFields.singleDay === "boolean" ? overviewFields.singleDay : overviewOverrides.singleDay === true;
          const nextEnd = nextSingleDay ? nextStart : String(overviewFields.end ?? overviewOverrides.end ?? "");
          if (!isValidPlanDateRange(nextStart, nextEnd, nextSingleDay)) {
            delete overviewFields.start;
            delete overviewFields.end;
            delete overviewFields.singleDay;
          }
        }
        Object.assign(overviewOverrides, overviewFields);
        const totalBudget = typeof overviewFields.totalBudget === "string" ? overviewFields.totalBudget.trim() : "";
        const currency = typeof overviewFields.currency === "string" ? overviewFields.currency.trim().toUpperCase() : "";
        const moneyItems = sectionItems.get("money") ?? [];
        const limitItems = moneyItems.filter((item) => item.fields.moneyRole === "limit");
        if (totalBudget) {
          if (limitItems.length) {
            limitItems.forEach((limitItem) => {
              limitItem.fields.amount = totalBudget;
              limitItem.fields.currency = currency || String(limitItem.fields.currency || "AUD");
              limitItem.source = "human";
            });
          } else addItem("money", { itemId: "human_overall_budget", label: "Total budget", fields: { title: "Total budget", amount: totalBudget, currency: currency || "AUD", moneyRole: "limit", notes: "Plan-wide budget set in Plan at a glance." }, source: "human" });
        }
        if (currency) sectionItems.forEach((items) => items.forEach((item) => {
          if (Object.prototype.hasOwnProperty.call(item.fields, "currency")) item.fields.currency = currency;
        }));
        return;
      }
      const rawSection = safePayloadText(input.payload, "moduleId");
      const sectionId = sectionItems.has(rawSection) ? rawSection : sectionAliases[rawSection] ?? rawSection;
      const recordId = safePayloadText(input.payload, "recordId");
      const items = sectionItems.get(sectionId);
      const options = sectionOptions.get(sectionId);
      if (!items) return;
      if (operation === "question_answer") {
        const questionId = safePayloadText(input.payload, "questionId");
        const prompt = safePayloadText(input.payload, "question");
        const answer = safePayloadText(input.payload, "answer");
        const answers = sectionAnswers.get(sectionId);
        if (questionId && prompt && answer && answers) {
          const existing = answers.find((candidate) => candidate.questionId === questionId);
          if (existing) Object.assign(existing, { prompt, answer });
          else answers.push({ questionId, prompt, answer });
        }
        return;
      }
      if (operation === "note") {
        const text = safePayloadText(input.payload, "comment");
        if (text) sectionComments.get(sectionId)?.push({ commentId: recordId || `comment_${index}`, text, forCodex: input.payload.forCodex === true });
        return;
      }
      if (operation === "add") addItem(sectionId, { itemId: recordId || `human_${index}`, label: safePayloadText(input.payload, "label") || "Plan item", fields: safeFields(input.payload.fields), source: "human" });
      if (operation === "record_add") addItem(sectionId, { itemId: recordId || `working_${index}`, label: safePayloadText(input.payload, "label") || "Plan item", fields: { ...safeFields(input.payload.fields), provisional: true }, source: "working" });
      if (operation === "option_add") addOption(sectionId, { itemId: recordId || `option_${index}`, label: safePayloadText(input.payload, "label") || "Option", fields: safeFields(input.payload.fields), source: input.payload.optionSource === "codex" ? "working" : "human", ...(safePayloadText(input.payload, "parentRecordId") ? { parentRecordId: safePayloadText(input.payload, "parentRecordId") } : {}) });
      if (operation === "option_update") {
        const option = options?.find((candidate) => candidate.itemId === recordId);
        if (option) {
          option.fields = { ...option.fields, ...safeFields(input.payload.fields) };
          option.label = String(option.fields.title || option.label);
          option.source = input.payload.optionSource === "codex" ? "working" : "human";
          if (safePayloadText(input.payload, "parentRecordId")) option.parentRecordId = safePayloadText(input.payload, "parentRecordId");
        }
      }
      if (operation === "option_delete") sectionOptions.set(sectionId, (options ?? []).filter((candidate) => candidate.itemId !== recordId));
      if (operation === "option_promote") {
        const option = options?.find((candidate) => candidate.itemId === recordId);
        if (option) {
          addItem(sectionId, { ...option, itemId: safePayloadText(input.payload, "targetRecordId") || `selected_${index}`, source: "human" });
          sectionOptions.set(sectionId, (options ?? []).filter((candidate) => candidate.itemId !== recordId));
        }
      }
      if (operation === "update") {
        const item = items.find((candidate) => candidate.itemId === recordId);
        if (item) { item.fields = { ...item.fields, ...safeFields(input.payload.fields) }; item.label = String(item.fields.title || item.label); item.source = "human"; }
      }
      if (operation === "record_update") {
        const item = items.find((candidate) => candidate.itemId === recordId);
        if (item && ["starter", "working"].includes(item.source) && starterItemIsProvisional(item)) {
          item.fields = { ...item.fields, ...safeFields(input.payload.fields), provisional: true };
          item.label = String(item.fields.title || item.label);
          item.source = "working";
        }
      }
      if (operation === "record_delete") {
        const item = items.find((candidate) => candidate.itemId === recordId);
        if (item && ["starter", "working"].includes(item.source) && starterItemIsProvisional(item)) sectionItems.set(sectionId, items.filter((candidate) => candidate.itemId !== recordId));
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
  if (family === "general" && explicitlyComposableOutcome) {
    const requirements = sectionItems.get("requirements") ?? [];
    sectionItems.set("requirements", requirements.filter((item) => item.source === "human" || !/^(?:venue and supplier commitments)$/i.test(item.label.trim())));
  }
  if (family === "travel") {
    (sectionItems.get("stays") ?? []).forEach((item) => { if (!item.fields.priceState) item.fields.priceState = "allowance"; });
    (sectionItems.get("transport") ?? []).forEach((item) => { if (!item.fields.priceState) item.fields.priceState = "allowance"; });
    (sectionItems.get("people") ?? []).forEach((item) => { if (!item.fields.status) item.fields.status = "tentative"; });
  }
  const allItems = [...sectionItems.values()].flat();
  const dateEntries = allItems.flatMap((item) => [item.fields.start, item.fields.end]
    .map((value) => ({ value: String(value ?? ""), item })))
    .filter((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry.value))
    .sort((a, b) => a.value.localeCompare(b.value));
  const moneyItems = sectionItems.get("money") ?? [];
  const limitItems = moneyItems.filter((item) => item.fields.moneyRole === "limit");
  const canonicalLimit = limitItems.find((item) => item.source === "human") ?? limitItems.at(-1);
  const limit = Number(canonicalLimit?.fields.amount || 0);
  const totalBudget = overviewOverrides.totalBudget !== undefined ? String(overviewOverrides.totalBudget) : (canonicalLimit ? String(canonicalLimit.fields.amount ?? "") : "");
  const budgetNumber = Number(totalBudget || 0);
  const explicitNoBudget = hasExplicitZeroSpendIntent(`${order.rawOutcome} ${JSON.stringify(order.structured)} ${JSON.stringify(interpretation?.known ?? {})}`);
  const overrideMoneyState = String(overviewOverrides.moneyState ?? "");
  const moneyState = (["not_applicable", "unknown", "zero", "positive"] as const).includes(overrideMoneyState as "not_applicable" | "unknown" | "zero" | "positive")
    ? overrideMoneyState as "not_applicable" | "unknown" | "zero" | "positive"
    : totalBudget.trim() === ""
      ? explicitNoBudget ? "zero" as const : "unknown" as const
      : budgetNumber > 0
        ? "positive" as const
        : explicitNoBudget ? "zero" as const : "not_applicable" as const;
  const visibleMoneyItems = moneyState === "positive"
    ? moneyItems
    : moneyItems.filter((item) => item.fields.moneyRole !== "cost" || item.source === "human" || Number(item.fields.amount || 0) > 0);
  if (visibleMoneyItems.length !== moneyItems.length) sectionItems.set("money", visibleMoneyItems);
  const categories = visibleMoneyItems.filter((item) => item.fields.moneyRole === "cost");
  const categoryAllocated = categories.reduce((sum, item) => sum + Number(item.fields.amount || 0), 0);
  const eventSourceText = `${order.rawOutcome} ${JSON.stringify(order.structured)} ${order.interpretation?.summary ?? ""}`;
  const anchoredEventDate = family === "event" && isDinnerPlan(eventSourceText)
    ? dateIso(eventSourceText, Number(eventSourceText.match(/\b(20\d{2})\b/)?.[1] ?? new Date().getUTCFullYear()))
    : "";
  const requestDateText = `${order.rawOutcome} ${String(order.structured.deadline ?? "")}`;
  const requestYear = Number(requestDateText.match(/\b(20\d{2})\b/)?.[1] ?? new Date().getUTCFullYear());
  const explicitRequestRange = dateRangeIso(requestDateText, requestYear);
  const anchoredRequestStart = explicitRequestRange.start || dateIso(requestDateText, requestYear);
  const singleDay = typeof overviewOverrides.singleDay === "boolean" ? overviewOverrides.singleDay : Boolean(anchoredEventDate);
  const start = String(overviewOverrides.start || anchoredEventDate || anchoredRequestStart || dateEntries[0]?.value || "");
  const requestedDuration = requestedDurationEnd(order, start);
  const explicitEnd = dateEntries.filter((entry) => entry.value !== start && ["request", "known", "human"].includes(entry.item.source)).at(-1)?.value ?? "";
  const candidateEnd = singleDay ? start : String(overviewOverrides.end || explicitRequestRange.end || explicitEnd || requestedDuration.end || dateEntries.at(-1)?.value || start);
  const dateRangeAccepted = isValidPlanDateRange(start, candidateEnd, singleDay);
  const end = dateRangeAccepted ? candidateEnd : start;
  const datesProvisional = !dateRangeAccepted ? true : typeof overviewOverrides.datesProvisional === "boolean"
    ? overviewOverrides.datesProvisional
    : Boolean(requestedDuration.end ? requestedDuration.provisional || !dateEntries.some((entry) => entry.value === requestedDuration.end && !starterItemIsProvisional(entry.item)) : dateEntries.some((entry) => starterItemIsProvisional(entry.item)));
  const currency = String(overviewOverrides.currency || moneyItems.find((item) => item.fields.currency)?.fields.currency || "AUD").toUpperCase();
  const budgetProvisional = typeof overviewOverrides.budgetProvisional === "boolean" ? overviewOverrides.budgetProvisional : starterItemIsProvisional(canonicalLimit);
  const questionTemplates = sectionQuestionTemplates(family, order);
  const genericTitle = `${({ travel: "Travel", renovation: "Renovation", event: "Event", general: "Adaptive" } as const)[family]} rough plan`;
  return {
    family,
    familyLabel: ({ travel: "Travel", renovation: "Renovation", event: "Event", general: "Adaptive" } as const)[family],
    title: resolvePlanTitle({ proposed: genericTitle, brief: `${order.rawOutcome} ${interpretation?.summary ?? ""}`.trim(), start }),
    brief: interpretation?.summary ?? order.rawOutcome,
    overview: {
      start,
      end,
      datesProvisional,
      singleDay,
      includeTime: overviewOverrides.includeTime === true,
      startTime: String(overviewOverrides.startTime || ""),
      endTime: String(overviewOverrides.endTime || ""),
      timeZone: String(overviewOverrides.timeZone || ""),
      totalBudget,
      currency,
      moneyState,
      budgetProvisional,
      categories,
      categoryAllocated,
      categoryPercent: budgetNumber > 0 ? (categoryAllocated / budgetNumber) * 100 : 0,
    },
    sections: definitions.map(({ keywords: _keywords, ...definition }) => {
      const answers = sectionAnswers.get(definition.sectionId) ?? [];
      const answered = new Set(answers.map((entry) => entry.questionId));
      const openQuestions = (questionTemplates[definition.sectionId] ?? []).map((prompt, index) => ({ questionId: `${definition.sectionId}_question_${index + 1}`, prompt })).filter((question) => !answered.has(question.questionId));
      return { ...definition, items: sectionItems.get(definition.sectionId) ?? [], options: sectionOptions.get(definition.sectionId) ?? [], comments: sectionComments.get(definition.sectionId) ?? [], openQuestions, answers };
    }),
    laterHumanInputs: humanInputsAfterInterpretation,
    interpretationIsCurrent: humanInputsAfterInterpretation.length === 0,
  };
};

export const workspaceInterpretationForConstruction = (order: ArrivalOrder, basedOnVersion: number, stagedAt: string): ArrivalInterpretation | null => {
  const starter = starterPlanForArrival(order);
  if (!starter || order.pendingClarification) return null;
  const sectionSnapshot = (provisional: boolean) => starter.sections.flatMap((section) => {
    const items = section.items.filter((item) => ["starter", "working", "open"].includes(item.source) === provisional);
    const answers = provisional ? [] : section.answers;
    if (!items.length && !answers.length) return [];
    return [{ sectionId: section.sectionId, label: section.label, items: items.map((item) => ({ itemId: item.itemId, label: item.label, fields: item.fields, source: item.source })), answers }];
  });
  const dependencies = starter.sections.flatMap((section) => section.openQuestions.map((question, index) => ({
    dependencyId: `workspace_question_${section.sectionId}_${index + 1}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 200),
    kind: "human_decision" as const,
    title: question.prompt.slice(0, 500),
    status: "open" as const,
    blocking: false,
    sourcePaths: [`workspace.${section.sectionId}.openQuestions.${index}`],
  }))).slice(0, 50);
  return {
    basedOnVersion,
    inferredFamily: starter.family,
    summary: starter.brief.slice(0, 2_000),
    known: { outcome: order.rawOutcome, overview: starter.overview, sections: sectionSnapshot(false) },
    inferred: { sections: sectionSnapshot(true) },
    missing: [],
    contradictions: [],
    dependencies,
    savedOperatorWork: {
      ...(order.interpretation?.savedOperatorWork ?? {}),
      workspaceOptions: starter.sections.flatMap((section) => section.options.length ? [{ sectionId: section.sectionId, options: section.options }] : []),
      workspaceComments: starter.sections.flatMap((section) => section.comments.length ? [{ sectionId: section.sectionId, comments: section.comments }] : []),
    },
    nextHumanBoundary: null,
    complete: true,
    stagedAt,
  };
};
