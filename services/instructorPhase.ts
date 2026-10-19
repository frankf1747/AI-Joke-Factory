/* Where the class is, from the two round statuses on GET /v1/rounds/active, and
   what the Instructor's control bar offers in each phase (spec 6b). */

import type { RoundStatus } from '../types';

export type PhaseStatuses = { 1: RoundStatus | null; 2: RoundStatus | null };

export type InstructorPhase = 'lobby' | 'r1-running' | 'between' | 'r2-running' | 'over';
export type InstructorTab = 'teams' | 'live' | 'debrief';
export type PhaseAction = 'start-r1' | 'end-r1' | 'start-r2' | 'end-r2' | 'debrief';

/** An unknown status (null) reads as not started. */
export function instructorPhase(statuses: PhaseStatuses): InstructorPhase {
  if (statuses[2] === 'ACTIVE') return 'r2-running';
  if (statuses[1] === 'ACTIVE') return 'r1-running';
  if (statuses[2] === 'ENDED') return 'over';
  if (statuses[1] === 'ENDED') return 'between';
  return 'lobby';
}

/** The tab the screen opens on: Teams in the lobby, Live during and between rounds, Debrief after Round 2. */
export function defaultTab(phase: InstructorPhase): InstructorTab {
  if (phase === 'lobby') return 'teams';
  if (phase === 'over') return 'debrief';
  return 'live';
}

/** The one action the control bar offers. */
export function phaseAction(phase: InstructorPhase): PhaseAction {
  switch (phase) {
    case 'lobby': return 'start-r1';
    case 'r1-running': return 'end-r1';
    case 'between': return 'start-r2';
    case 'r2-running': return 'end-r2';
    case 'over': return 'debrief';
  }
}

/** The round the leaderboard, charts and debrief show by default: Round 2 once it has started. */
export function defaultViewRound(phase: InstructorPhase): 1 | 2 {
  return phase === 'r2-running' || phase === 'over' ? 2 : 1;
}

/** The phase, or null while neither status is known (after a reload, before the first poll lands). */
export function knownPhase(statuses: PhaseStatuses): InstructorPhase | null {
  return statuses[1] == null && statuses[2] == null ? null : instructorPhase(statuses);
}

/** The open tab and the phase it was last moved for. tab null: nothing committed yet. */
export interface TabFollow<T extends string> { tab: T | null; phase: InstructorPhase | null }

/**
 * The open tab follows the phase (defaultTab). Nothing moves while the phase is
 * unknown, so a reload mid-round never opens Teams for one poll. When the phase
 * first becomes known, a tab the instructor already picked stays; after that,
 * each phase change opens that phase's default tab.
 */
export function followPhase<T extends string>(s: TabFollow<T>, phase: InstructorPhase | null): TabFollow<T | InstructorTab> {
  if (phase == null || phase === s.phase) return s;
  if (s.phase == null && s.tab != null) return { tab: s.tab, phase };
  return { tab: defaultTab(phase), phase };
}
