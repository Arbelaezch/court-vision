import type { MotionOutput } from '../app';

export const REDUCE_MOTION_CLASS = 'cv-reduce-motion';

/** Applies the reduce-motion setting as a class on the root element, which the CSS keys off. */
export function createReduceMotionOutput(doc: Document): MotionOutput {
  return {
    setReduceMotion(on) {
      doc.documentElement.classList.toggle(REDUCE_MOTION_CLASS, on);
    },
  };
}
