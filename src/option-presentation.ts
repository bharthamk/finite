import type { Candidate, ProfileId } from "./types.js";

type PresentedCandidate = Pick<Candidate, "selectedMoves" | "valid">;

export const candidateTradeoffLines = (candidate: PresentedCandidate): string[] => {
  if (candidate.selectedMoves.length) return candidate.selectedMoves.map((move) => move.tradeoff);
  return [candidate.valid
    ? "No additional compromise is required."
    : "No available adjustment resolves all current limits."];
};

export const objectiveLabelForProfile = (objective: string, profileId: ProfileId): string => {
  const shared: Record<string, string> = {
    preserve_comfort: "Protect comfort",
    preserve_buffer: "Protect breathing room",
    preserve_contingency: "Protect contingency",
    balanced: "Smallest balanced change",
    custom: "Custom route",
  };
  const domain: Partial<Record<ProfileId, Record<string, string>>> = {
    travel: { preserve_experience: "Protect the experience", preserve_schedule: "Protect the route" },
    event: { preserve_experience: "Protect the guest experience", preserve_schedule: "Protect the schedule" },
    renovation: { preserve_experience: "Protect the finish", preserve_schedule: "Protect the handover" },
    general: { preserve_experience: "Protect the outcome", preserve_schedule: "Protect the schedule" },
  };
  return domain[profileId]?.[objective] ?? shared[objective] ?? objective.replaceAll("_", " ");
};

export const floorRelationship = (value: number, floor: number): "below" | "meets" | "above" => value < floor ? "below" : value === floor ? "meets" : "above";
