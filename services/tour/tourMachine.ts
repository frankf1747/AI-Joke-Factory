/* The guided tour's step machine — pure, no timers, no React.

   GuidedTour (components/tour/GuidedTour.tsx) owns one interval that sends
   `tick` with the milliseconds that passed; everything else is a user action.
   A step auto-advances once its time is up, except the last step, which waits
   for "Start" (`next`) or Skip. Back always restarts the previous step from its
   beginning: elapsedMs drops to 0, and the demo state for a step is rebuilt
   from scratch from (index, elapsedMs) by services/tour/demoScript.ts, so going
   back is deterministic and replays any typing. */

/** How long a step stays up when it does not say (spec §3.2). */
export const TOUR_STEP_MS = 6000;

/**
 * One step of a tour. Generic over the demo state the step's script changes
 * (S) and over what its caption is filled from (C, the round's money), so the
 * machine knows nothing about the game.
 */
export interface TourStep<S = unknown, C = unknown> {
  /** Stable id, for tests and logs. */
  id: string;
  /** The `data-tour` id of the element to spotlight; null shows a centred card. */
  target: string | null;
  title: string;
  /** Caption. A function when it quotes the round's money (filled by services/tour/tourSteps.ts stepsFor). */
  body: string | ((c: C) => string);
  /** Auto-advance after this long; TOUR_STEP_MS when absent. */
  durationMs?: number;
  /** Sets the demo state for this moment, applied when the step starts. */
  onEnter?: (s: S) => S;
  /** Later changes within the step, applied once `atMs` has passed. */
  beats?: ReadonlyArray<{ atMs: number; apply: (s: S) => S }>;
  /** A text field that types itself in during this step (whole at once with reduced motion). */
  typing?: TypingField;
  /** Label of the button that ends the tour on the last step. */
  finishLabel?: string;
}

/** DemoUi text fields a step can type in; 'mkTitle' is the first selected joke's title. */
export type TypingField = 'jmDraft' | 'mkNote' | 'mkTitle';

export type TourEnd = 'finished' | 'skipped';

export interface TourState {
  /** The step on screen. */
  index: number;
  /** Time spent on this step while playing. */
  elapsedMs: number;
  paused: boolean;
  /** Set once the tour is over; the component then unmounts it. */
  ended: TourEnd | null;
}

export type TourAction =
  | { type: 'next' }
  | { type: 'back' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'togglePause' }
  | { type: 'tick'; dtMs: number }
  | { type: 'skip' }
  | { type: 'finish' };

export const INITIAL_TOUR_STATE: TourState = { index: 0, elapsedMs: 0, paused: false, ended: null };

export function stepDuration(step: Pick<TourStep, 'durationMs'> | undefined): number {
  const d = step?.durationMs;
  return typeof d === 'number' && Number.isFinite(d) && d > 0 ? d : TOUR_STEP_MS;
}

const enter = (s: TourState, index: number): TourState => ({ ...s, index, elapsedMs: 0 });

export function tourReducer(
  state: TourState,
  action: TourAction,
  steps: ReadonlyArray<Pick<TourStep, 'durationMs'>>,
): TourState {
  if (state.ended) return state;
  const last = steps.length - 1;
  switch (action.type) {
    case 'next':
      return state.index >= last ? { ...state, ended: 'finished' } : enter(state, state.index + 1);
    case 'back':
      return enter(state, Math.max(0, state.index - 1));
    case 'pause':
      return state.paused ? state : { ...state, paused: true };
    case 'resume':
      return state.paused ? { ...state, paused: false } : state;
    case 'togglePause':
      return { ...state, paused: !state.paused };
    case 'tick': {
      if (state.paused || !(action.dtMs > 0) || steps.length === 0) return state;
      const duration = stepDuration(steps[state.index]);
      const elapsedMs = state.elapsedMs + action.dtMs;
      if (elapsedMs < duration) return { ...state, elapsedMs };
      // The last step holds at its end and waits for Start.
      if (state.index >= last) return state.elapsedMs === duration ? state : { ...state, elapsedMs: duration };
      return enter(state, state.index + 1);
    }
    case 'skip':
      return { ...state, ended: 'skipped' };
    case 'finish':
      return { ...state, ended: 'finished' };
    default:
      return state;
  }
}

/** Overall progress, 0..1, for the control bar. */
export function tourProgress(state: TourState, steps: ReadonlyArray<Pick<TourStep, 'durationMs'>>): number {
  if (steps.length === 0) return 1;
  const within = Math.min(1, state.elapsedMs / stepDuration(steps[state.index]));
  return Math.min(1, (state.index + within) / steps.length);
}
