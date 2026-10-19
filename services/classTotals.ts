/* The class totals above the Instructor's leaderboard (spec 6b, 7.4): sums over
   the rows of GET /v1/instructor/rounds/:id/stats for the round in view. */
import type { ApiInstructorStatsResponse } from '../types';
import { leanFeesOf, neverSold } from './leanMode';

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
  /** Shipping + storage + hosting; null in a Classic round. */
  fees: number | null;
}

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function classTotals(rows: LeaderboardRow[], lean: boolean): ClassTotals {
  let sales = 0, profit = 0, released = 0, never = 0, fees = 0;
  let best: number | null = null, worst: number | null = null;
  for (const r of rows) {
    const p = num(r.profit);
    sales += num(r.total_sales);
    profit += p;
    released += num(r.published_jokes);
    best = best == null ? p : Math.max(best, p);
    worst = worst == null ? p : Math.min(worst, p);
    never += neverSold(r.lean) ?? 0;
    const f = leanFeesOf(r.lean);
    fees += f.shipping + f.storage + f.hosting;
  }
  return { sales, profit, best, worst, released, neverSold: lean ? never : null, fees: lean ? fees : null };
}
