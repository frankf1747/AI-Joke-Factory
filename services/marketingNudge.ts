/* ============================================================================
   Marketing decision-timer state machine.

   Ranking used to force Rank 1 onto the market so the game always moved. That
   removed the only interesting decision Marketing makes — which joke is worth
   the publishing cost. Time pressure replaces it: the team chooses freely, and
   two nudges push them to ship before the round drains away.

       idle ──BATCH_READY──▶ waiting ──TIMEOUT──▶ nudge1
                                                    │ DISMISS
                                                    ▼
                              silent ◀──DISMISS── nudge2 ◀──TIMEOUT── settling

   RELEASED short-circuits to `silent` from anywhere, so a pending popup never
   ambushes a team that has already published. `silent` is terminal per batch:
   once they've said "not yet", we leave them alone.

   Pure on purpose — no timers, no React. The view owns exactly one setTimeout,
   driven by `dueInMs`, which makes every transition above testable directly.
   See docs/superpowers/specs/2026-09-12-marketing-decision-timer-design.md.
============================================================================ */

export type NudgePhase =
  | 'idle'      // no split batch on screen — nothing to nudge about
  | 'waiting'   // batch is ready, first nudge armed
  | 'nudge1'    // first popup showing
  | 'settling'  // first popup dismissed, second nudge armed
  | 'nudge2'    // second popup showing
  | 'silent';   // done with this batch, whatever happened

export interface NudgeState {
  phase: NudgePhase;
  /** Delay for the view's timer, or null when nothing is pending. */
  dueInMs: number | null;
}

export interface NudgeConfig {
  nudge1Seconds: number;
  nudge2Seconds: number;
}

export type NudgeEvent =
  /** The selection view just appeared for a batch (or a new batch replaced it). */
  | { type: 'BATCH_READY' }
  /** No batch to decide on any more — back to splitting, or the queue emptied. */
  | { type: 'BATCH_CLEARED' }
  /** The pending `dueInMs` timer elapsed. */
  | { type: 'TIMEOUT' }
  /** The open popup was closed by the user. */
  | { type: 'DISMISS' }
  /** The batch was published. */
  | { type: 'RELEASED' };

export const INITIAL_NUDGE_STATE: NudgeState = { phase: 'idle', dueInMs: null };

const SILENT: NudgeState = { phase: 'silent', dueInMs: null };

/** True while a popup should be on screen. */
export function isNudgeOpen(phase: NudgePhase): boolean {
  return phase === 'nudge1' || phase === 'nudge2';
}

export function nudgeReducer(
  state: NudgeState,
  event: NudgeEvent,
  cfg: NudgeConfig,
): NudgeState {
  // These two apply in every phase, so they're handled before the phase switch.
  switch (event.type) {
    case 'BATCH_READY':
      return { phase: 'waiting', dueInMs: cfg.nudge1Seconds * 1000 };
    case 'BATCH_CLEARED':
      return INITIAL_NUDGE_STATE;
    case 'RELEASED':
      return SILENT;
  }

  switch (state.phase) {
    case 'waiting':
      return event.type === 'TIMEOUT' ? { phase: 'nudge1', dueInMs: null } : state;
    case 'nudge1':
      return event.type === 'DISMISS'
        ? { phase: 'settling', dueInMs: cfg.nudge2Seconds * 1000 }
        : state;
    case 'settling':
      return event.type === 'TIMEOUT' ? { phase: 'nudge2', dueInMs: null } : state;
    case 'nudge2':
      return event.type === 'DISMISS' ? SILENT : state;
    default:
      // idle and silent ignore stray timeouts and dismissals.
      return state;
  }
}
