// Fixed-timestep stepper. The sim always advances in steps of FIXED_DT seconds; the speed
// multiplier changes how many steps run per real millisecond, never the step size.
//
// The stepper mutates its own state. Time comes only from the deltas passed in (no clock reads).
// It derives the step target from total real elapsed time, so the step count does not depend on how
// that time was split into frames. The guarantee holds for frames <= MAX_FRAME_DELTA_MS; longer
// frames are clamped to avoid a "spiral of death" after a stall.

export const SIM_HZ = 60;
export const FIXED_DT = 1 / SIM_HZ;
export const MAX_FRAME_DELTA_MS = 250;

// Absorbs float drift from fractional frame deltas.
const STEP_EPSILON = 1e-6;

export interface StepperState {
  speed: number;
  realElapsedMs: number;
  stepsTaken: number;
}

export function createStepper(speed = 1): StepperState {
  if (!Number.isFinite(speed) || speed <= 0) {
    throw new Error(`Court Vision: stepper speed must be a finite number > 0, got ${speed}`);
  }
  return { speed, realElapsedMs: 0, stepsTaken: 0 };
}

/** Adds a real frame delta (ms) and returns how many fixed steps are due this frame. */
export function advanceStepper(stepper: StepperState, frameDeltaMs: number): number {
  if (!Number.isFinite(frameDeltaMs) || frameDeltaMs < 0) {
    throw new Error(`Court Vision: frame delta must be a finite number >= 0, got ${frameDeltaMs}`);
  }
  const clamped = Math.min(frameDeltaMs, MAX_FRAME_DELTA_MS);
  stepper.realElapsedMs += clamped;
  const target = Math.floor((stepper.realElapsedMs * stepper.speed * SIM_HZ) / 1000 + STEP_EPSILON);
  const due = target - stepper.stepsTaken;
  stepper.stepsTaken = target;
  return due;
}

/** Fraction of a step elapsed since the last one, in [0, 1), for render interpolation. */
export function stepperAlpha(stepper: StepperState): number {
  const x = (stepper.realElapsedMs * stepper.speed * SIM_HZ) / 1000 - stepper.stepsTaken;
  return Math.min(Math.max(x, 0), 1 - Number.EPSILON);
}

export function stepperSimSeconds(stepper: StepperState): number {
  return stepper.stepsTaken / SIM_HZ;
}
