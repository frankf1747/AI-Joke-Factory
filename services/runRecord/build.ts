/* Builds a run record from what the Debrief already fetched
   (docs/superpowers/specs/2026-11-12-experiment-records-design.md §3). Pure. */
import type { InstructorRound, LeanChartsResponse } from '../../types/api';
import type { LeaderboardRow } from '../classTotals';
import { boardRows } from '../liveBoard';
import { feesTotal, type FeeRates } from '../shownFees';
import {
  RUN_RECORD_FORMAT, RUN_RECORD_VERSION, SETTING_FIELDS,
  type PlayedBy, type RunBatch, type RunBot, type RunRecord, type RunRound, type RunTeam, type SettingValue,
} from './types';

export interface RunRoundInput {
  round: 1 | 2;
  /** GET /v1/instructor/rounds/:id/config → .round */
  config: InstructorRound;
  /** Already filtered to the teams that played. */
  stats: { leaderboard: LeaderboardRow[] };
  /** null in a Classic round. */
  charts: LeanChartsResponse | null;
  teamNames: Record<string, string>;
  /** That round's own rates (services/roundRates). */
  rates: FeeRates;
  /** team_id → bot fields. */
  bots?: ReadonlyMap<number, RunBot>;
  fits?: ReadonlyMap<number, Array<{ seq: number; fit: number | null }>>;
}

const count = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
const nullable = (v: unknown): number | null => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));

function settingsOf(config: InstructorRound): Record<string, SettingValue> {
  const src = config as unknown as Record<string, unknown>;
  const out: Record<string, SettingValue> = {};
  for (const [key] of SETTING_FIELDS) {
    const v = src[key];
    if (typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v))) out[key] = v;
  }
  return out;
}

export function buildRunRound(input: RunRoundInput): RunRound {
  const { round, config, stats, charts, teamNames, rates, bots, fits } = input;
  const board = boardRows(stats.leaderboard, teamNames, rates);
  const chartTeams = new Map((charts?.teams ?? []).map(t => [Number(t.team_id), t]));

  const teams = stats.leaderboard.map((row, i): RunTeam => {
    const b = board[i];
    const id = Number(row.team.id);
    const team: RunTeam = {
      team_id: id,
      team: b.team,
      profit: count(row.profit),
      sold: count(row.total_sales),
      released: count(row.published_jokes),
      made: count(row.total_jokes),
      never_sold: nullable(b.neverSold),
      discarded: count(row.discarded_jokes),
      fees: { ...b.fees, total: b.feesTotal ?? feesTotal(b.fees) },
      sent_to_released_s: nullable(b.sentToReleased),
      to_first_sale_s: nullable(b.toFirstSale),
    };
    if (charts) {
      team.batches = (chartTeams.get(id)?.batches ?? []).map((c): RunBatch => ({
        seq: count(c.seq), sent_s: count(c.sent_s), jokes: count(c.jokes),
        released: count(c.published), sold: count(c.sold), first_sale_s: nullable(c.first_sale_s),
      }));
    }
    const fit = fits?.get(id);
    if (fit) team.fit_by_batch = fit.map(f => ({ seq: f.seq, fit: nullable(f.fit) }));
    const bot = bots?.get(id);
    if (bot) team.bot = { ...bot };
    return team;
  });

  const out: RunRound = {
    round,
    round_id: config.id,
    status: String(config.status),
    started_at: config.started_at ?? null,
    ended_at: config.ended_at ?? null,
    settings: settingsOf(config),
    teams,
  };
  if (config.ideal_profile) out.ideal_profile = { ...config.ideal_profile };
  return out;
}

export function buildRunRecord(
  meta: { name: string; notes?: string; playedBy: PlayedBy; exportedAt: string },
  rounds: RunRound[],
): RunRecord {
  const record: RunRecord = {
    format: RUN_RECORD_FORMAT,
    version: RUN_RECORD_VERSION,
    name: meta.name,
    played_by: meta.playedBy,
    exported_at: meta.exportedAt,
    rounds: [...rounds].sort((a, b) => a.round - b.round),
  };
  const notes = meta.notes?.trim();
  if (notes) record.notes = notes;
  return record;
}

/** Bots when the bot panel created every playing team, mixed when some, students otherwise. */
export function defaultPlayedBy(teamIds: readonly number[], botTeamIds: ReadonlySet<number>): PlayedBy {
  const bots = teamIds.filter(id => botTeamIds.has(id)).length;
  if (bots === 0) return 'students';
  return bots === teamIds.length ? 'bots' : 'mixed';
}

/** "2026-11-20 class", from the local date. */
export function defaultRunName(now: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} class`;
}

/** A file name: letters, digits, space, dot, underscore and hyphen kept, the rest "-"; at most 80 characters. */
export function fileSafeName(name: string): string {
  const safe = name.replace(/[^A-Za-z0-9 ._-]/g, '-').trim().slice(0, 80).trim();
  return safe || 'run';
}
