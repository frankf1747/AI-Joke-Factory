/* The class totals above the Instructor's leaderboard (spec 6b, 7.4): sums over
   the rows of GET /v1/instructor/rounds/:id/stats for the round in view. */
import type { ApiInstructorStatsResponse } from '../types';
import { neverSold } from './leanMode';
import { feesTotal, teamFees, type FeeRates } from './shownFees';

/** One team's row on the stats leaderboard. */
export type LeaderboardRow = ApiInstructorStatsResponse['leaderboard'][number];

export interface ClassTotals {
  sales: number;
  profit: number;
  /** The best and worst team profit; null before any team is on the board. */
  best: number | null;
  worst: number | null;
  /** Jokes released (published_jokes). */
  released: number;
  /** Released jokes that never sold (neverSold per row); null in a Classic round. */
  neverSold: number | null;
  /** neverSold over the jokes the same batch series released (at most 1); null in a
      Classic round or before any batch released a joke. published_jokes comes from
      another count and can disagree with the series, so it is not the denominator. */
  neverSoldShare: number | null;
  /** Every fee the teams paid (listing + hosting at the two-cost defaults); null in a Classic round. */
  fees: number | null;
}

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** `rates` are the round's listing and discard prices (GameConfig); without them those two read 0. */
export function classTotals(
  rows: LeaderboardRow[], lean: boolean, rates?: Pick<FeeRates, 'costOfPublishing' | 'costOfDiscard'> | null,
): ClassTotals {
  let sales = 0, profit = 0, released = 0, never = 0, seriesReleased = 0, fees = 0;
  let best: number | null = null, worst: number | null = null;
  for (const r of rows) {
    const p = num(r.profit);
    sales += num(r.total_sales);
    profit += p;
    released += num(r.published_jokes);
    best = best == null ? p : Math.max(best, p);
    worst = worst == null ? p : Math.min(worst, p);
    never += neverSold(r.lean) ?? 0;
    for (const b of r.lean?.batch_series ?? []) seriesReleased += Math.max(0, num(b.published));
    fees += feesTotal(teamFees(r, rates));
  }
  const neverSoldShare = lean && seriesReleased > 0 ? Math.min(1, never / seriesReleased) : null;
  return { sales, profit, best, worst, released, neverSold: lean ? never : null, neverSoldShare, fees: lean ? fees : null };
}
