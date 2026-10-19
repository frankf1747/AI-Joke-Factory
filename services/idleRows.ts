/* "Jokes standing still" on the Instructor's Live tab (spec 6b): one row per
   team, the biggest pile first. A row's "Right now" is the team's latest idle
   sample (waiting on Marketing, then unsold on the market); its "Over the round"
   is every sample, drawn against the class average from class_average.idle. */
import type { LeanChartsResponse } from '../types/api';
import { teamLabel } from './leanCharts';

export interface IdleRowPoint { t: number; waiting: number; shelf: number }
export interface IdleAvgPoint { t: number; total: number }

export interface IdleTeamRow {
  teamId: number;
  teamName: string;
  waiting: number;
  shelf: number;
  total: number;
  /** More jokes standing still now than the class average now. */
  aboveAverage: boolean;
  series: IdleRowPoint[];
  avgSeries: IdleAvgPoint[];
}

/** Every team, most jokes standing still now first; ties go by team name. */
export function idleRows(charts: LeanChartsResponse | null, teamNames: Record<string, string> = {}): IdleTeamRow[] {
  if (!charts) return [];
  const avgSeries = (charts.class_average?.idle ?? []).map(s => ({ t: s.t, total: s.waiting + s.shelf }));
  const avgNow = avgSeries[avgSeries.length - 1]?.total ?? 0;
  return charts.teams
    .map(t => {
      const series = t.idle.map(s => ({ t: s.t, waiting: s.waiting, shelf: s.shelf }));
      const last = series[series.length - 1];
      const waiting = last?.waiting ?? 0;
      const shelf = last?.shelf ?? 0;
      const total = waiting + shelf;
      return {
        teamId: t.team_id,
        teamName: teamLabel(t.team_id, t.team_name, teamNames),
        waiting, shelf, total,
        aboveAverage: total > avgNow,
        series,
        avgSeries,
      };
    })
    .sort((a, b) => b.total - a.total || a.teamName.localeCompare(b.teamName, undefined, { numeric: true }));
}

/** The class average now: the last sample of class_average.idle. */
export function idleAverageNow(rows: ReadonlyArray<IdleTeamRow>): number {
  const avg = rows[0]?.avgSeries ?? [];
  return avg[avg.length - 1]?.total ?? 0;
}

/** The row's highest pile over the round, for the trend's hover text. */
export function idlePeak(series: ReadonlyArray<IdleRowPoint>): { jokes: number; t: number } | null {
  let peak: { jokes: number; t: number } | null = null;
  for (const p of series) {
    const jokes = p.waiting + p.shelf;
    if (!peak || jokes > peak.jokes) peak = { jokes, t: p.t };
  }
  return peak;
}
