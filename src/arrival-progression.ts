import type { ArrivalOrder } from "./arrival.js";
import type { StarterPlanItem, StarterPlanPresentation, StarterPlanSection } from "./arrival-presentation.js";
import type { PlanInputSection } from "./plan-input.js";
import type { PlanIntakeInput, ProfileId } from "./types.js";

export interface ArrivalContinuityInput {
  section: PlanInputSection;
  message: string;
}

export interface ArrivalContinuityTask {
  label: string;
  done: boolean;
}

export interface ArrivalProgression {
  intake: PlanIntakeInput;
  inputs: ArrivalContinuityInput[];
  tasks: ArrivalContinuityTask[];
}

const boundedSlug = (value: string): string => value.toLowerCase()
  .normalize("NFKD")
  .replace(/[^a-z0-9]+/g, "_")
  .replace(/^_+|_+$/g, "")
  .slice(0, 38) || "plan";

const amountMinor = (value: unknown): number => {
  const amount = Number(String(value ?? "").replaceAll(",", ""));
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : 0;
};

const firstPositiveInteger = (...values: unknown[]): number | null => {
  for (const value of values) {
    const direct = Number(value);
    if (Number.isSafeInteger(direct) && direct > 0) return direct;
    const match = String(value ?? "").match(/\b(\d{1,5})\b/);
    if (match && Number(match[1]) > 0) return Number(match[1]);
  }
  return null;
};

const itemTitle = (item: StarterPlanItem): string => String(item.fields.title || item.label).trim();
const itemNotes = (item: StarterPlanItem): string => String(item.fields.notes || "").trim();
const provisionalItem = (item: StarterPlanItem): boolean => ["starter", "working", "open"].includes(item.source);

const profileFor = (starter: StarterPlanPresentation): ProfileId => starter.family === "travel"
  ? "travel"
  : starter.family === "renovation"
    ? "renovation"
    : starter.family === "event" ? "event" : "general";

const sectionSummary = (section: StarterPlanSection): string => {
  const entries = section.items.map((item) => {
    const title = itemTitle(item);
    const details = section.fields
      .filter((field) => field.fieldId !== "title")
      .flatMap((field) => {
        const value = item.fields[field.fieldId];
        return value === "" || value === undefined || value === false ? [] : [`${field.label}: ${value === true ? "Yes" : String(value)}`];
      });
    return `${provisionalItem(item) ? "Working: " : ""}${title}${details.length ? ` — ${details.join(" · ")}` : ""}`;
  });
  const answers = section.answers.map((answer) => `Answered: ${answer.prompt} — ${answer.answer}`);
  return [`${section.label}:`, ...entries, ...answers].join("\n");
};

const chunkContinuity = (sections: StarterPlanSection[]): ArrivalContinuityInput[] => {
  const groups: Array<{ section: PlanInputSection; message: string }> = [];
  for (const source of sections.filter((section) => section.sectionId !== "tasks")) {
    const section: PlanInputSection = source.sectionId === "money" ? "money"
      : source.sectionId === "requirements" ? "boundaries"
        : source.variant === "calendar" ? "timeline" : "general";
    const summary = sectionSummary(source);
    const prior = groups.at(-1);
    if (prior && prior.section === section && Array.from(`${prior.message}\n\n${summary}`).length <= 1_950) prior.message += `\n\n${summary}`;
    else if (Array.from(summary).length <= 1_950) groups.push({ section, message: summary });
    else {
      const lines = summary.split("\n");
      let chunk = "";
      for (const line of lines) {
        const boundedLine = Array.from(line).slice(0, 1_850).join("");
        if (chunk && Array.from(`${chunk}\n${boundedLine}`).length > 1_950) { groups.push({ section, message: chunk }); chunk = boundedLine; }
        else chunk = chunk ? `${chunk}\n${boundedLine}` : boundedLine;
      }
      if (chunk) groups.push({ section, message: chunk });
    }
  }
  return groups;
};

export const arrivalProgressionFromStarter = (order: ArrivalOrder, starter: StarterPlanPresentation): ArrivalProgression => {
  const profileId = profileFor(starter);
  const totalBudgetMinor = amountMinor(starter.overview.totalBudget);
  const categoryForecastMinor = starter.overview.categories
    .filter((item) => item.fields.moneyRole === "cost")
    .reduce((total, item) => total + amountMinor(item.fields.amount), 0);
  const forecastMinor = Math.min(totalBudgetMinor, categoryForecastMinor);
  const schedule = starter.sections.find((section) => section.variant === "calendar")?.items ?? [];
  const stageSource = schedule.length ? schedule : starter.sections.find((section) => section.sectionId === "tasks")?.items ?? [];
  const stages = stageSource.slice(0, 12).map((item, index) => ({
    stageId: item.itemId || `stage_${index + 1}`,
    label: itemTitle(item) || `Stage ${index + 1}`,
    detail: itemNotes(item) || "Continue this part of the accepted plan.",
    marker: provisionalItem(item) ? "Working" : "Set",
    status: item.fields.done === true ? "complete" as const : index === 0 ? "current" as const : "planned" as const,
  }));
  if (!stages.length) stages.push({ stageId: "begin", label: "Begin the plan", detail: "Choose the first practical action.", marker: "Up next", status: "current" });

  const requirementItems = starter.sections.find((section) => section.sectionId === "requirements")?.items ?? [];
  const locks = requirementItems.map((item) => boundedSlug(itemTitle(item)).slice(0, 64)).filter(Boolean).slice(0, 30);
  if (!locks.length) locks.push("preserve_the_accepted_scope");
  const openQuestions = starter.sections.flatMap((section) => section.openQuestions.map((question) => ({ section, question })));
  const dependencies = openQuestions.slice(0, categoryForecastMinor > totalBudgetMinor ? 49 : 50).map(({ section, question }, index) => ({
    dependencyId: `human_question_${index + 1}`,
    kind: "human_decision" as const,
    title: question.prompt,
    status: "open" as const,
    blocking: false,
    sourcePaths: [`workspace.${section.sectionId}.openQuestions.${question.questionId}`],
  }));
  if (categoryForecastMinor > totalBudgetMinor) dependencies.push({
    dependencyId: "budget_overallocated",
    kind: "human_decision",
    title: `Current category budgets exceed the total by ${((categoryForecastMinor - totalBudgetMinor) / 100).toFixed(2)} ${starter.overview.currency}.`,
    status: "open",
    blocking: false,
    sourcePaths: ["workspace.money.categories", "workspace.overview.totalBudget"],
  });

  const scopeItems = starter.sections.find((section) => section.sectionId === "scope")?.items ?? [];
  const guestCount = firstPositiveInteger(
    order.interpretation?.known.guestCount,
    order.rawOutcome,
    ...scopeItems.map((item) => item.fields.headcount),
  ) ?? 1;
  const venueCapacity = Math.max(guestCount, firstPositiveInteger(...scopeItems.map((item) => item.fields.capacity), ...scopeItems.map((item) => item.fields.headcount)) ?? guestCount);
  const entityValues: Record<string, Record<string, number>> = profileId === "travel"
    ? {
      trip_days: { days: Math.max(1, Math.round((Date.parse(starter.overview.end) - Date.parse(starter.overview.start)) / 86_400_000) || 1) },
      booked_segment_days: { days: 0 },
    }
    : profileId === "renovation"
      ? { completion_day: { day: Math.max(1, stages.length) }, committed_completion_day: { day: Math.max(1, stages.length) } }
      : profileId === "event"
        ? { guest_headcount: { count: guestCount }, venue: { capacity: venueCapacity } }
        : { plan_items: { count: stages.length }, open_dependencies: { count: dependencies.filter((dependency) => dependency.status === "open").length } };

  const suffix = order.orderId.toLowerCase().replace(/[^a-z0-9]/g, "").slice(-10) || String(order.version);
  const planSlug = boundedSlug(starter.title).slice(0, Math.max(3, 58 - suffix.length));
  const intake: PlanIntakeInput = {
    sourceArrival: { orderId: order.orderId, orderVersion: order.version, orderChecksum: order.checksum },
    constructionMode: "adaptive_shell",
    profileId,
    planId: `plan_${planSlug}_${suffix}`,
    name: starter.title.slice(0, 120),
    brief: starter.brief.slice(0, 500),
    planningDimensions: {
      money: starter.overview.moneyState ?? (totalBudgetMinor > 0 ? "positive" : "zero"),
      location: starter.sections.some((section) => section.items.some((item) => String(item.fields.location ?? "").trim())) ? "positive" : "unknown",
      capacity: profileId === "event" ? "positive" : "not_applicable",
    },
    allocation: { totalBudgetMinor, spentMinor: 0, committedMinor: 0, forecastMinor, bufferMinor: totalBudgetMinor - forecastMinor },
    actuals: [],
    locks,
    preferenceLabels: ["preserve_human_set_details", "keep_working_assumptions_visible"],
    dependencies,
    stages,
    entityValues,
  };
  const tasks = (starter.sections.find((section) => section.sectionId === "tasks")?.items ?? [])
    .map((item) => ({ label: itemTitle(item), done: item.fields.done === true }))
    .filter((item) => item.label);
  return { intake, inputs: chunkContinuity(starter.sections), tasks };
};
