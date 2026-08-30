import type { ActivationTiming } from "./accepted-truth.js";

export type ActivationSequencePhase =
  | "transitionRender"
  | "arrivalFreshness"
  | "draftPreparation"
  | "confirmationRender"
  | "localConfirmation"
  | "guardedActivation"
  | "localActivation"
  | "finalRender";

export interface GuardedActivationTiming {
  measurementVersion: "finite-plan-activation-sequence-timing.v1";
  challenge: ActivationTiming | null;
  initialize: ActivationTiming | null;
}

export interface ClickActivationTiming {
  measurementVersion: "finite-click-activation-timing.v1";
  outcome: "ready" | "failed";
  totalMs: number;
  phaseTotalMs: number;
  unattributedMs: number;
  phases: Partial<Record<ActivationSequencePhase, number>>;
  guarded: GuardedActivationTiming | null;
}

const rounded = (value: number): number => Math.max(0, Math.round(value * 10) / 10);
const defaultNow = (): number => typeof performance === "undefined" ? Date.now() : performance.now();

export class ClickActivationTimer {
  private readonly startedAt: number;
  private readonly phases: Partial<Record<ActivationSequencePhase, number>> = {};

  constructor(private readonly now: () => number = defaultNow) {
    this.startedAt = now();
  }

  async measure<T>(phase: ActivationSequencePhase, operation: () => Promise<T>): Promise<T> {
    const startedAt = this.now();
    try { return await operation(); }
    finally { this.record(phase, this.now() - startedAt); }
  }

  measureSync<T>(phase: ActivationSequencePhase, operation: () => T): T {
    const startedAt = this.now();
    try { return operation(); }
    finally { this.record(phase, this.now() - startedAt); }
  }

  finish(outcome: "ready" | "failed", guarded: GuardedActivationTiming | null = null): ClickActivationTiming {
    const totalMs = rounded(this.now() - this.startedAt);
    const phaseTotalMs = rounded(Object.values(this.phases).reduce((sum, value) => sum + (value ?? 0), 0));
    return {
      measurementVersion: "finite-click-activation-timing.v1",
      outcome,
      totalMs,
      phaseTotalMs,
      unattributedMs: rounded(totalMs - phaseTotalMs),
      phases: { ...this.phases },
      guarded,
    };
  }

  private record(phase: ActivationSequencePhase, durationMs: number): void {
    this.phases[phase] = rounded((this.phases[phase] ?? 0) + durationMs);
  }
}
