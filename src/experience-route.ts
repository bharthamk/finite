export type FiniteExperienceSurface = "arrival" | "plan";

const localDemoStartModes = new Set(["live-demo", "demo-active", "spotlight-active"]);

export const shouldBootstrapLocalDemo = ({
  pathname,
  startMode,
  collaborationToken,
  localDemoResume,
}: {
  pathname: string;
  startMode: string | null;
  collaborationToken: string | null;
  localDemoResume: boolean;
}): boolean => {
  if (localDemoStartModes.has(startMode ?? "")) return true;
  return localDemoResume && pathname === "/" && startMode === null && !collaborationToken;
};

export const shouldLoadDurablePlanData = ({
  localDemoMode,
  planId,
  persistedPlanIds,
}: {
  localDemoMode: boolean;
  planId: string;
  persistedPlanIds: ReadonlySet<string>;
}): boolean => localDemoMode || persistedPlanIds.has(planId);

export const isWaitingArrivalStatus = (status: unknown): boolean => (
  typeof status === "string" && status.length > 0 && status !== "accepted" && status !== "closed"
);

export const shouldOpenEntryGateway = ({
  entryGatewayOpen,
  hasExplicitWorkingSurface,
}: {
  entryGatewayOpen: boolean;
  hasExplicitWorkingSurface: boolean;
}): boolean => entryGatewayOpen || !hasExplicitWorkingSurface;

export const selectExperienceSurface = ({
  labMode,
  kitchenMode,
  hasArrival,
  hasActivatedPlan,
}: {
  labMode: boolean;
  kitchenMode: boolean;
  hasArrival: boolean;
  hasActivatedPlan: boolean;
}): FiniteExperienceSurface => (
  labMode || kitchenMode || (!hasArrival && hasActivatedPlan) ? "plan" : "arrival"
);
