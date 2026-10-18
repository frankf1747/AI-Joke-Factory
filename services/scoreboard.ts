/* Pure helpers for the Scoreboard (spec 4.3). */
import type { Batch } from '../types';

export interface RankMovement {
  kind: 'up' | 'down' | 'same' | 'lead' | 'none';
  /** Places moved; 0 unless kind is 'up' or 'down'. */
  by: number;
}

/**
 * How the rank moved between two successful polls. Rank 1 is "lead" whatever
 * came before; no previous rank (first poll, or after a reload) is "same";
 * no current rank (round not started) is "none". A lower number is better.
 */
export function rankMovement(prev: number | null, now: number | null): RankMovement {
  if (now == null) return { kind: 'none', by: 0 };
  if (now === 1) return { kind: 'lead', by: 0 };
  if (prev == null || prev === now) return { kind: 'same', by: 0 };
  return now < prev ? { kind: 'up', by: prev - now } : { kind: 'down', by: now - prev };
}

export interface RankState {
  /** The rank from the last summary that carried one, within `round`. */
  prevRank: number | null;
  round: number | null;
  /** The tag on show; an up or down tag is held until the rank changes again. */
  move: RankMovement;
}

export const INITIAL_RANK_STATE: RankState = { prevRank: null, round: null, move: { kind: 'none', by: 0 } };

/**
 * One step of the movement tag. A new round clears the previous rank, so the
 * first rank of a round reads "same" (or "lead" at 1); a rank that did not
 * change holds the tag; a missing rank (no summary) shows none but keeps the
 * previous rank for the next summary.
 */
export function nextRankState(state: RankState, input: { rank: number | null; round: number | null }): RankState {
  const { rank, round } = input;
  if (round !== state.round) {
    return { prevRank: rank, round, move: rankMovement(null, rank) };
  }
  if (rank == null) return { ...state, move: { kind: 'none', by: 0 } };
  if (rank === state.prevRank) {
    return state.move.kind === 'none' ? { ...state, move: rankMovement(null, rank) } : state;
  }
  return { prevRank: rank, round, move: rankMovement(state.prevRank, rank) };
}

/**
 * The reducer's input for a team summary. Rank and round come from the same
 * object so they always change together: config.round flips before the new
 * round's summary arrives and would pair a new round with the old rank.
 */
export function rankInputOf(
  summary: { rank: number; round_id: number } | null | undefined,
): { rank: number | null; round: number | null } {
  return { rank: summary?.rank ?? null, round: summary?.round_id ?? null };
}

/**
 * Jokes that found a buyer: PUBLISHED with first_sold_at set. A joke whose
 * buyer swapped it out (sold_count back to 0) still counts. This is not the
 * summary's sold_jokes_count, which is LEAST(published_jokes, total_sales).
 */
export function foundABuyer(batches: Batch[]): number {
  let n = 0;
  for (const b of batches) {
    for (const j of b.jokes) if (j.publish_status === 'PUBLISHED' && j.first_sold_at) n += 1;
  }
  return n;
}

/** "$4.50", "−$6.55" (U+2212), or "—" when there is no figure yet. */
export function formatProfit(profit: number | null | undefined): string {
  if (profit == null) return '—';
  const amount = `$${Math.abs(profit).toFixed(2)}`;
  return profit < 0 ? `−${amount}` : amount;
}
