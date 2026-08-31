export interface FiniteChangeSummary {
  title: string;
  detail: string;
  impacts: string[];
}

export interface WorkspaceChangeContext {
  message: string;
  sectionLabel?: string;
  currency?: string;
  previousCurrency?: string;
  moneyState?: "not_applicable" | "unknown" | "zero" | "positive";
  totalBudget?: number;
  allocated?: number;
  start?: string;
  end?: string;
}

const validCurrency = (value: string | undefined): string => /^[A-Z]{3}$/.test(value ?? "") ? value! : "AUD";
const money = (value: number, currency: string | undefined): string => new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: validCurrency(currency),
  currencyDisplay: "code",
  maximumFractionDigits: 0,
}).format(value);

const dateLabel = (value: string | undefined): string => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return value || "Not set";
  const parsed = new Date(`${value}T12:00:00Z`);
  const [year, month, day] = value.split("-").map(Number);
  if (Number.isNaN(parsed.getTime()) || parsed.getUTCFullYear() !== year || parsed.getUTCMonth() + 1 !== month || parsed.getUTCDate() !== day) return "Not set";
  return new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(parsed);
};

export const workspaceChangeSummary = (payload: Record<string, unknown>, context: WorkspaceChangeContext): FiniteChangeSummary => {
  const operation = String(payload.workspaceOperation ?? "update");
  const fields = payload.fields && typeof payload.fields === "object" ? payload.fields as Record<string, unknown> : {};
  if (operation === "overview" && Object.prototype.hasOwnProperty.call(fields, "totalBudget")) {
    const state = context.moneyState ?? (Number(context.totalBudget ?? fields.totalBudget) > 0 ? "positive" : "unknown");
    const total = Number(context.totalBudget ?? fields.totalBudget ?? 0);
    const allocated = Number(context.allocated ?? 0);
    const available = total - allocated;
    const currencyChanged = Boolean(context.previousCurrency && context.previousCurrency !== context.currency);
    if (state === "unknown" || state === "not_applicable") return {
      title: state === "unknown" ? "Budget left open." : "No paid budget needed.",
      detail: state === "unknown" ? "No total has been decided yet." : "This plan is marked as not needing a paid budget.",
      impacts: [
        allocated > 0 ? `${money(allocated, context.currency)} remains allocated across editable categories.` : "Budget categories remain editable.",
        currencyChanged ? `Amounts now use ${validCurrency(context.currency)} as their base label; Finite did not perform an exchange conversion.` : "No exchange conversion was performed.",
        "No booking, payment, or external action was made.",
      ],
    };
    return {
      title: state === "zero" ? "Budget set to zero." : "Budget updated across this plan.",
      detail: state === "zero" ? "Plan at a glance now shows an explicit zero budget." : `Plan at a glance now uses ${money(total, context.currency)} as the total.`,
      impacts: [
        `${money(allocated, context.currency)} is allocated · ${money(Math.abs(available), context.currency)} is ${available < 0 ? "over the total" : "still available"}.`,
        currencyChanged
          ? `Existing amounts were relabelled from ${validCurrency(context.previousCurrency)} to ${validCurrency(context.currency)}; Finite did not perform an exchange conversion.`
          : `Existing categories keep their saved values in ${validCurrency(context.currency)}.`,
        "No booking, payment, or external action was made.",
      ],
    };
  }
  if (operation === "overview" && Object.prototype.hasOwnProperty.call(fields, "start")) {
    const start = context.start ?? String(fields.start ?? "");
    const end = context.end ?? String(fields.end ?? start);
    return {
      title: "Plan dates updated.",
      detail: start === end ? `Plan at a glance now shows ${dateLabel(start)}.` : `Plan at a glance now runs from ${dateLabel(start)} to ${dateLabel(end)}.`,
      impacts: ["Calendar items keep their own saved dates until you change them.", "Budget and people details were not changed."],
    };
  }
  const section = context.sectionLabel?.trim() || "this part of the plan";
  return {
    title: context.message,
    detail: `The change is now saved in ${section}.`,
    impacts: ["The rest of the plan remains editable.", "No booking, payment, confirmation, or external action was made."],
  };
};

export const planInputChangeSummary = (input: {
  editing: boolean;
  sectionLabel: string;
  contextLabel?: string | null;
  kind: string;
}): FiniteChangeSummary => ({
  title: input.editing ? `${input.kind} updated.` : `${input.kind} added to the plan.`,
  detail: `It now appears in ${input.contextLabel ? `${input.sectionLabel} · ${input.contextLabel}` : input.sectionLabel}.`,
  impacts: ["The saved update is visible wherever that part of the plan is shown.", "Budget, dates, people, and real-world status were not changed."],
});

export const planFactChangeSummary = (input: {
  changes: Array<{ label: string; before: string | number; after: string | number; format: string }>;
  currency: string;
  availableMinor: number;
}): FiniteChangeSummary => ({
  title: "Plan numbers updated.",
  detail: input.changes.map((change) => `${change.label}: ${change.format === "money" ? `${money(Number(change.before) / 100, input.currency)} → ${money(Number(change.after) / 100, input.currency)}` : `${change.before} → ${change.after}`}`).join(" · "),
  impacts: [`Available after assigned costs: ${money(input.availableMinor / 100, input.currency)}.`, "No external action was taken."],
});
