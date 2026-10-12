/* The guided tour's control bar and keyboard, as pure functions of the step
   machine's state (services/tour/tourMachine.ts). */
import { tourProgress, type TourAction, type TourState, type TourStep } from '../../services/tour/tourMachine';

export const SKIP_LABEL = 'Skip tour';
/** Spec §3.3: shown, styled as primary, once the student's round goes ACTIVE mid-tour. */
export const ROUND_STARTED_LABEL = 'Round started — go to the game';

export interface TourControls {
  stepText: string;
  progress: number;
  backDisabled: boolean;
  pauseLabel: 'Pause' | 'Play';
  nextLabel: string;
  skipLabel: string;
  skipPrimary: boolean;
}

export function tourControls(
  state: TourState,
  steps: ReadonlyArray<Pick<TourStep, 'durationMs' | 'finishLabel'>>,
  roundActive: boolean,
): TourControls {
  const last = state.index >= steps.length - 1;
  return {
    stepText: `Step ${Math.min(state.index + 1, steps.length)} of ${steps.length}`,
    progress: tourProgress(state, steps),
    backDisabled: state.index === 0,
    pauseLabel: state.paused ? 'Play' : 'Pause',
    nextLabel: last ? steps[steps.length - 1]?.finishLabel ?? 'Done' : 'Next',
    skipLabel: roundActive ? ROUND_STARTED_LABEL : SKIP_LABEL,
    skipPrimary: roundActive,
  };
}

export interface TourKeyEvent {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  /** The focused element's tag, e.g. 'BUTTON'. */
  targetTag?: string;
}

/**
 * Esc skips, ← goes back, → goes next, Space pauses or plays. Shortcuts with
 * Ctrl, Cmd or Alt are left to the browser, and Space on a focused button or
 * link presses that control as usual.
 */
export function keyAction(e: TourKeyEvent): TourAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  switch (e.key) {
    case 'Escape':
    case 'Esc':
      return { type: 'skip' };
    case 'ArrowLeft':
      return { type: 'back' };
    case 'ArrowRight':
      return { type: 'next' };
    case ' ':
    case 'Spacebar':
      return e.targetTag === 'BUTTON' || e.targetTag === 'A' ? null : { type: 'togglePause' };
    default:
      return null;
  }
}
