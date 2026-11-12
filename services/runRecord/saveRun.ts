/* Collects a run record for the Save run record dialog: fetches each round's settings and
   batches, then builds the record. Pure apart from the injected reads. */
import type { InstructorRound, LeanChartsResponse } from '../../types/api';
import type { LeaderboardRow } from '../classTotals';
import { isNotLeanRound } from '../leanCharts';
import type { FeeRates } from '../shownFees';
import { buildRunRecord, buildRunRound, fileSafeName } from './build';
import { recordCsv } from './csv';
import type { PlayedBy, RunBot, RunRecord, RunRound } from './types';

export interface SaveRunDeps {
  getConfig: (roundId: number) => Promise<{ round: InstructorRound }>;
  getCharts: (roundId: number) => Promise<LeanChartsResponse>;
}

export interface SaveRunInput {
  name: string;
  notes: string;
  playedBy: PlayedBy;
  now: Date;
  rounds: Array<{ round: 1 | 2; roundId: number; stats: { leaderboard: LeaderboardRow[] }; rates: FeeRates }>;
  teamNames: Record<string, string>;
  bots: ReadonlyMap<number, RunBot>;
}

/** Fetches each round's config and charts and builds the record. Throws Error("Could not read Round N settings") / ("… batches") naming the failed read. */
export async function collectRunRecord(input: SaveRunInput, deps: SaveRunDeps): Promise<RunRecord> {
  // A students record marks no bots, whatever the bot panel registered.
  const bots = input.playedBy === 'students' ? new Map<number, RunBot>() : input.bots;
  const rounds: RunRound[] = [];
  for (const r of input.rounds) {
    let config: InstructorRound;
    try {
      config = (await deps.getConfig(r.roundId)).round;
    } catch {
      throw new Error(`Could not read Round ${r.round} settings`);
    }
    let charts: LeanChartsResponse | null;
    try {
      charts = await deps.getCharts(r.roundId);
    } catch (e) {
      if (!isNotLeanRound(e)) throw new Error(`Could not read Round ${r.round} batches`);
      charts = null;
    }
    rounds.push(buildRunRound({
      round: r.round, config, stats: r.stats, charts, teamNames: input.teamNames, rates: r.rates, bots,
    }));
  }
  return buildRunRecord(
    { name: input.name.trim(), notes: input.notes, playedBy: input.playedBy, exportedAt: input.now.toISOString() },
    rounds,
  );
}

/** Which rounds a save includes: Round 1 when ENDED; Round 2 too when ENDED. [] = button disabled. */
export function savableRounds(statuses: Readonly<Record<1 | 2, string | null>>): Array<1 | 2> {
  if (statuses[1] !== 'ENDED') return [];
  return statuses[2] === 'ENDED' ? [1, 2] : [1];
}

type ByRound<T> = Readonly<Record<1 | 2, T>>;

/** The rounds a save sends to collectRunRecord. Throws "Could not read Round N settings" when a
    round has no id and "Could not read Round N results" when its results were not loaded. */
export function roundInputs(
  rounds: ReadonlyArray<1 | 2>,
  roundIds: ByRound<number | null>,
  stats: ByRound<{ leaderboard: LeaderboardRow[] } | null>,
  rates: ByRound<FeeRates>,
): SaveRunInput['rounds'] {
  return rounds.map(round => {
    const roundId = roundIds[round];
    if (roundId == null) throw new Error(`Could not read Round ${round} settings`);
    const s = stats[round];
    if (!s) throw new Error(`Could not read Round ${round} results`);
    return { round, roundId, stats: s, rates: rates[round] };
  });
}

export interface SavedFile { fileName: string; text: string; mime: string }
export interface SavedRun { json: SavedFile; csv: SavedFile }

/** The two files a save downloads, kept so the dialog can offer them again. */
export function savedFiles(name: string, record: RunRecord): SavedRun {
  const file = fileSafeName(name);
  return {
    json: { fileName: `${file}.jfrun.json`, text: JSON.stringify(record, null, 2), mime: 'application/json' },
    csv: { fileName: `${file}.csv`, text: recordCsv(record), mime: 'text/csv' },
  };
}
