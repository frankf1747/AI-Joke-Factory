/* Small run records for the Compare tests (compare.test.ts, CompareTab.render.test.ts). */
import { RUN_RECORD_FORMAT, type RunRecord, type RunRound, type RunTeam } from './types';

export const SETTINGS = { market_mode: 'lean', batch_size: 5, market_price: 1, cost_of_publishing: 0.1 };
export const IDEAL = { TOPIC: 'Animals', TONE: 'Dry' };

export const fixtureTeam = (id: number, over: Partial<RunTeam> = {}): RunTeam => ({
  team_id: id, team: `Team ${id}`, profit: id, sold: 4, released: 8, made: 10, never_sold: 2, discarded: 0,
  fees: { listing: 0.8, hosting: 0.2, shipping: 0, storage: 0, discard: 0, total: 1 },
  sent_to_released_s: 20, to_first_sale_s: 10,
  batches: [{ seq: 1, sent_s: 10, jokes: 5, released: 4, sold: 2, first_sale_s: 5 }, { seq: 2, sent_s: 60, jokes: 5, released: 4, sold: 2, first_sale_s: 8 }],
  ...over,
});

export const fixtureRound = (n: 1 | 2, over: Partial<RunRound> = {}): RunRound => ({
  round: n, round_id: n, status: 'ENDED', started_at: null, ended_at: null,
  settings: { ...SETTINGS }, ideal_profile: { ...IDEAL }, teams: [fixtureTeam(1), fixtureTeam(2)],
  ...over,
});

export const fixtureRecord = (name: string, over: Partial<RunRecord> = {}): RunRecord => ({
  format: RUN_RECORD_FORMAT, version: 1, name, played_by: 'students', exported_at: '2026-11-20T12:00:00Z',
  rounds: [fixtureRound(1), fixtureRound(2)],
  ...over,
});

/** Two runs that differ only in the Round 1 listing fee (0.1 vs 0.25). */
export const listingPair = (): [RunRecord, RunRecord] => [
  fixtureRecord('Run A'),
  fixtureRecord('Run B', {
    exported_at: '2026-11-21T12:00:00Z',
    rounds: [fixtureRound(1, { settings: { ...SETTINGS, cost_of_publishing: 0.25 } }), fixtureRound(2)],
  }),
];
