/* Which teams the bot panel created, so a saved record can mark them
   (docs/superpowers/specs/2026-11-12-experiment-records-design.md §4). Module state: the bot
   panel writes it, the Save run record dialog reads it. */
import { PERSONAS, type PersonaId } from '../bots/personas';
import type { RunBot } from './types';

let teams: ReadonlyMap<number, RunBot> = new Map();

/** Replaces the map with these teams (those without an id yet are skipped). An empty list leaves it as it is. */
export function recordBotTeams(list: ReadonlyArray<{ teamId: number | null; persona: string }>): void {
  if (list.length === 0) return;
  const next = new Map<number, RunBot>();
  for (const t of list) {
    if (t.teamId == null) continue;
    // A "Uses feedback" team says so in the record, as a pilot team does.
    const usesFeedback = PERSONAS[t.persona as PersonaId]?.usesFeedback === true;
    next.set(t.teamId, usesFeedback ? { persona: t.persona, use_feedback: true } : { persona: t.persona });
  }
  teams = next;
}

export function botTeams(): ReadonlyMap<number, RunBot> {
  return teams;
}

/** Forgets every bot team: on a successful Reset Game (context.tsx) and in tests. */
export function clearBotTeams(): void {
  teams = new Map();
}
