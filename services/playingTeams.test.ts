import { describe, expect, it } from 'vitest';
import { memberedTeamIds, playingChartTeams, playingStats } from './playingTeams';
import type { ApiInstructorStatsResponse, InstructorLobby } from '../types';
import type { LeanChartsResponse, LeanChartsTeam } from '../types/api';

/* The real /stats and /lean-charts list every team the round has, so a team with
   no members comes back as an all-zero row. Keep a team only if it has members in
   the instructor lobby or has done something. */

const lobby = (teams: Array<[number, number]>): InstructorLobby => ({
  round_id: null,
  summary: { waiting: 0, assigned: 0, dropped: 0, team_count: teams.length },
  teams: teams.map(([id, members]) => ({
    team: { id, name: `Team ${id}` },
    members: Array.from({ length: members }, (_, i) => ({ user_id: id * 10 + i, display_name: `P${i}`, role: 'JM' })),
  })),
  customers: [],
  unassigned: [],
} as unknown as InstructorLobby);

type Row = ApiInstructorStatsResponse['leaderboard'][number];
const row = (id: number, over: Partial<Row> = {}): Row => ({
  rank: id, team: { id, name: `Team ${id}` } as Row['team'], points: 0, total_sales: 0, unsold_jokes: 0,
  discarded_jokes: 0, batches_processed: 0, profit: 0, total_jokes: 0, published_jokes: 0, ...over,
});
const stats = (rows: Row[]): ApiInstructorStatsResponse => ({ round_id: 1 as ApiInstructorStatsResponse['round_id'], leaderboard: rows });

const team = (id: number, over: Partial<LeanChartsTeam> = {}): LeanChartsTeam => ({
  team_id: id, team_name: `Team ${id}`,
  waste: { setup: 0, waiting: 0, shelf: 0, never_sold: 0, discarded: 0, total: 0 },
  idle: [{ t: 0, waiting: 0, shelf: 0 }], batches: [], ...over,
});
const charts = (teams: LeanChartsTeam[]): LeanChartsResponse => ({
  round_id: 1, started_at: null, clock_end: '', sample_seconds: 30, wip_limit: 0, teams,
  class_average: { waste: team(0).waste, idle: [], sell_through: [] },
});

describe('playing teams', () => {
  it('reads the teams with members from the lobby; null without a lobby', () => {
    expect([...(memberedTeamIds(lobby([[1, 2], [2, 0], [3, 1]])) ?? [])]).toEqual([1, 3]);
    expect(memberedTeamIds(null)).toBeNull();
  });

  it('drops a stats row with no members and no activity, keeps members or activity', () => {
    const membered = memberedTeamIds(lobby([[1, 2], [2, 0], [3, 0], [4, 0], [5, 0]]));
    const out = playingStats(stats([
      row(1), row(2),
      row(3, { batches_processed: 1 }), row(4, { published_jokes: 2 }), row(5, { total_sales: 1 }),
    ]), membered);
    expect(out?.leaderboard.map(r => r.team.id)).toEqual([1, 3, 4, 5]);
  });

  it('counts a Lean row with batches submitted as activity', () => {
    const lean = { batches_submitted: 1 } as Row['lean'];
    const out = playingStats(stats([row(2, { lean })]), memberedTeamIds(lobby([[2, 0]])));
    expect(out?.leaderboard).toHaveLength(1);
  });

  it('keeps everything while the lobby is not loaded, and passes null through', () => {
    expect(playingStats(stats([row(1), row(2)]), null)?.leaderboard).toHaveLength(2);
    expect(playingStats(null, new Set())).toBeNull();
  });

  it('drops a lean charts team with no members and nothing sent', () => {
    const membered = memberedTeamIds(lobby([[1, 2], [2, 0], [3, 0]]));
    const batch = { seq: 1, sent_s: 10, jokes: 5, published: 0, sold: 0, first_sale_s: null };
    const out = playingChartTeams(charts([team(1), team(2), team(3, { batches: [batch] })]), membered);
    expect(out?.teams.map(t => t.team_id)).toEqual([1, 3]);
    expect(playingChartTeams(null, membered)).toBeNull();
  });
});
