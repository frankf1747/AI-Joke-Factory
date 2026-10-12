/* Has this browser's student seen the guided tour for their role, and should
   it start on its own?

   The flag is `jf_tour_seen_v1:<ROLE>` in localStorage — a new key, so every
   student sees the new tour once even if they dismissed the old tutorial
   (jf_tutorial_seen_v1, kept for the instructor's modal). It is written when
   the tour ends (finished or skipped) or when the mid-round prompt is
   dismissed, never on mount, so React StrictMode's double mount cannot
   suppress it. Storage that throws or is missing reads as "unknown", which
   never auto-plays (the "?" button still works). */

export const TOUR_SEEN_PREFIX = 'jf_tour_seen_v1:';

/** The roles that have a guided tour. The UI enum calls Marketing QUALITY_CONTROL. */
export type TourRole = 'JOKE_MAKER' | 'QUALITY_CONTROL';

export function isTourRole(role: unknown): role is TourRole {
  return role === 'JOKE_MAKER' || role === 'QUALITY_CONTROL';
}

export type SeenStore = Pick<Storage, 'getItem' | 'setItem'>;

function sharedStore(): SeenStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** true / false, or null when storage cannot be read. */
export function readTourSeen(role: TourRole, store: SeenStore | null = sharedStore()): boolean | null {
  if (!store) return null;
  try {
    return store.getItem(`${TOUR_SEEN_PREFIX}${role}`) !== null;
  } catch {
    return null;
  }
}

export function markTourSeen(role: TourRole, store: SeenStore | null = sharedStore()): void {
  if (!store) return;
  try {
    store.setItem(`${TOUR_SEEN_PREFIX}${role}`, '1');
  } catch {
    // ignore — worst case the tour starts again next time
  }
}

/** How a tour ended. 'error' is the stage's error boundary: nothing is recorded. */
export type TourOutcome = 'finished' | 'skipped' | 'error';

export function recordTourEnd(role: TourRole, outcome: TourOutcome, store: SeenStore | null = sharedStore()): void {
  if (outcome === 'error') return;
  markTourSeen(role, store);
}

export interface LaunchInput {
  role: unknown;
  /** An instructor's watch tab (services/watchMode.ts isWatchMode). */
  watch: boolean;
  /** readTourSeen: null when storage is unavailable. */
  seen: boolean | null;
  /** The student's round is ACTIVE (config.isActive). */
  roundActive: boolean;
}

/** 'tour' auto-plays, 'prompt' shows "New here? Watch the 1-minute tour", 'none' does neither. */
export type LaunchMode = 'tour' | 'prompt' | 'none';

export function launchMode({ role, watch, seen, roundActive }: LaunchInput): LaunchMode {
  if (!isTourRole(role) || watch || seen !== false) return 'none';
  return roundActive ? 'prompt' : 'tour';
}

/** Spec §3.3: a tour role, not watch mode, flag unset, round not ACTIVE. */
export function shouldAutoPlay(input: LaunchInput): boolean {
  return launchMode(input) === 'tour';
}
