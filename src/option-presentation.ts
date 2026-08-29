import type { Candidate } from "./types.js";

type PresentedCandidate = Pick<Candidate, "selectedMoves" | "valid">;

export const candidateTradeoffLines = (candidate: PresentedCandidate): string[] => {
  if (candidate.selectedMoves.length) return candidate.selectedMoves.map((move) => move.tradeoff);
  return [candidate.valid
    ? "No additional compromise is required."
    : "No available adjustment resolves all current limits."];
};
