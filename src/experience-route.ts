export type FiniteExperienceSurface = "arrival" | "plan";

export const isWaitingArrivalStatus = (status: unknown): boolean => (
  typeof status === "string" && status.length > 0 && status !== "accepted" && status !== "closed"
);

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
