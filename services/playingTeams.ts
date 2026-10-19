/* The teams the Instructor's Live board, class totals, Debrief and lean charts show.
   The real /stats and /lean-charts list every team the round has, so a team with no
   members comes back as an all-zero row. A team stays when it has members in the
   instructor lobby or has done something (sent a batch, released or sold a joke).
   Without a lobby yet, every team stays. */
import type { ApiInstructorStatsResponse, InstructorLobby } from '../types';
import type { LeanChartsResponse, LeanChartsTeam } from '../types/api';

type StatsRow = ApiInstructorStatsResponse['leaderboard'][number];

/** The ids of the lobby's teams that have members; null while the lobby is not loaded. */
export function memberedTeamIds(lobby: InstructorLobby | null | undefined): Set<number> | null {
  if (!lobby) return null;
  return new Set(lobby.teams.filter(t => t.members.length > 0).map(t => Number(t.team.id)));
}

const positive = (v: unknown): boolean => Number(v) > 0;

const rowActive = (r: StatsRow): boolean =>
  positive(r.total_sales) || positive(r.published_jokes) || positive(r.batches_processed)
  || positive(r.total_jokes) || positive(r.lean?.batches_submitted);

const chartTeamActive = (t: LeanChartsTeam): boolean =>
  t.batches.length > 0 || positive(t.waste?.total) || t.idle.some(s => s.waiting > 0 || s.shelf > 0);

const keep = (id: number, membered: Set<number> | null, active: boolean): boolean =>
  membered == null || membered.has(Number(id)) || active;

export function playingStats(stats: ApiInstructorStatsResponse | null, membered: Set<number> | null): ApiInstructorStatsResponse | null {
  if (!stats) return null;
  return { ...stats, leaderboard: stats.leaderboard.filter(r => keep(Number(r.team.id), membered, rowActive(r))) };
}

export function playingChartTeams(charts: LeanChartsResponse | null, membered: Set<number> | null): LeanChartsResponse | null {
  if (!charts) return null;
  return { ...charts, teams: charts.teams.filter(t => keep(t.team_id, membered, chartTeamActive(t))) };
}
