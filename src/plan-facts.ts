import { clone } from "./crypto.js";
import type { Allocation, CompiledProfile, EntityDefinition, SurfaceFieldBinding } from "./types.js";

export type EditablePlanFactFormat = "money" | "number" | "days";

export interface EditablePlanFact {
  factId: string;
  label: string;
  selector: "allocations" | "entities";
  path: string[];
  format: EditablePlanFactFormat;
  value: number;
  minimum: number;
  maximum: number | null;
  step: number;
}

export interface PlanFactChange {
  factId: string;
  value: number;
}

export interface PlanFactProjection {
  accepted: Allocation;
  entities: Record<string, EntityDefinition>;
  changes: Array<PlanFactChange & { label: string; format: EditablePlanFactFormat; before: number; after: number }>;
}

export class PlanFactValidationError extends Error {
  constructor(readonly code: string, readonly issues: string[]) {
    super(issues.join(" "));
    this.name = "PlanFactValidationError";
  }
}

const boundedMaximum = Number.MAX_SAFE_INTEGER;

const entityFact = (
  binding: SurfaceFieldBinding,
  entities: Record<string, EntityDefinition>,
): EditablePlanFact | null => {
  if (binding.selector !== "entities" || !["number", "days"].includes(binding.format) || binding.path.length !== 3 || binding.path[1] !== "values") return null;
  const [entityId, , field] = binding.path;
  if (!entityId || !field) return null;
  const value = entities[entityId]?.values[field];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return null;
  return {
    factId: `entities.${entityId}.${field}`,
    label: binding.label,
    selector: "entities",
    path: [entityId, "values", field],
    format: binding.format as EditablePlanFactFormat,
    value,
    minimum: 0,
    maximum: boundedMaximum,
    step: 1,
  };
};

export const editablePlanFacts = (
  profile: CompiledProfile,
  accepted: Allocation,
  entities: Record<string, EntityDefinition>,
): EditablePlanFact[] => {
  const facts: EditablePlanFact[] = [{
    factId: "allocations.totalBudgetMinor",
    label: "Total limit",
    selector: "allocations",
    path: ["totalBudgetMinor"],
    format: "money",
    value: accepted.totalBudgetMinor,
    minimum: accepted.spentMinor + accepted.committedMinor + accepted.forecastMinor,
    maximum: boundedMaximum,
    step: 100,
  }];
  for (const binding of profile.surface.primaryMeasures) {
    const fact = entityFact(binding, entities);
    if (fact && !facts.some((candidate) => candidate.factId === fact.factId)) facts.push(fact);
  }
  return facts;
};

const relationshipIssues = (profile: CompiledProfile, entities: Record<string, EntityDefinition>): string[] => {
  const issues: string[] = [];
  for (const relationship of profile.relationships) {
    const left = entities[relationship.left.entityId]?.values[relationship.left.field];
    const right = entities[relationship.right.entityId]?.values[relationship.right.field];
    if (typeof left !== "number" || typeof right !== "number" || !Number.isSafeInteger(left) || !Number.isSafeInteger(right)) {
      issues.push(`${relationship.relationshipId} is missing a numeric value.`);
      continue;
    }
    const valid = relationship.type === "lte" ? left <= right : left === right;
    if (!valid) issues.push(relationship.type === "lte"
      ? `${relationship.left.entityId.replaceAll("_", " ")} cannot be greater than ${relationship.right.entityId.replaceAll("_", " ")}.`
      : `${relationship.left.entityId.replaceAll("_", " ")} must match ${relationship.right.entityId.replaceAll("_", " ")}.`);
  }
  return issues;
};

export const projectPlanFactChanges = (
  profile: CompiledProfile,
  accepted: Allocation,
  entities: Record<string, EntityDefinition>,
  requested: PlanFactChange[],
): PlanFactProjection => {
  if (!Array.isArray(requested) || requested.length < 1 || requested.length > 20) throw new PlanFactValidationError("PLAN_FACT_CHANGES_INVALID", ["Change between one and twenty plan values at a time."]);
  const known = new Map(editablePlanFacts(profile, accepted, entities).map((fact) => [fact.factId, fact]));
  const seen = new Set<string>();
  const afterAccepted = clone(accepted);
  const afterEntities = clone(entities);
  const changes: PlanFactProjection["changes"] = [];
  const issues: string[] = [];

  for (const requestedChange of requested) {
    const fact = known.get(requestedChange.factId);
    if (!fact) { issues.push(`${requestedChange.factId || "That value"} is not editable in this plan.`); continue; }
    if (seen.has(fact.factId)) { issues.push(`${fact.label} was supplied more than once.`); continue; }
    seen.add(fact.factId);
    const value = requestedChange.value;
    if (!Number.isSafeInteger(value) || value < fact.minimum || (fact.maximum !== null && value > fact.maximum)) {
      issues.push(`${fact.label} must be a whole ${fact.format === "money" ? "minor-unit amount" : "number"} of at least ${fact.minimum}.`);
      continue;
    }
    if (value === fact.value) continue;
    if (fact.selector === "allocations") afterAccepted.totalBudgetMinor = value;
    else {
      const [entityId, , field] = fact.path;
      if (entityId && field && afterEntities[entityId]) afterEntities[entityId]!.values[field] = value;
    }
    changes.push({ factId: fact.factId, label: fact.label, format: fact.format, value, before: fact.value, after: value });
  }
  if (issues.length) throw new PlanFactValidationError("PLAN_FACT_CHANGES_INVALID", issues);
  if (!changes.length) throw new PlanFactValidationError("PLAN_FACTS_UNCHANGED", ["None of those values changed."]);

  const assigned = afterAccepted.spentMinor + afterAccepted.committedMinor + afterAccepted.forecastMinor;
  if (afterAccepted.totalBudgetMinor < assigned) throw new PlanFactValidationError("PLAN_BUDGET_BELOW_ASSIGNED", ["The total limit cannot be lower than money already spent, committed, or forecast."]);
  afterAccepted.bufferMinor = afterAccepted.totalBudgetMinor - assigned;
  const relationshipProblems = relationshipIssues(profile, afterEntities);
  if (relationshipProblems.length) throw new PlanFactValidationError("PLAN_FACT_RELATIONSHIP_INVALID", relationshipProblems);

  return { accepted: afterAccepted, entities: afterEntities, changes };
};
