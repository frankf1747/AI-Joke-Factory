import { describe, expect, it } from 'vitest';
import type { InstructorRound, LeanChartsResponse } from '../../types/api';
import type { LeaderboardRow } from '../classTotals';
import type { FeeRates } from '../shownFees';
import { collectRunRecord, roundInputs, savableRounds, savedFiles, type SaveRunDeps, type SaveRunInput } from './saveRun';
import { recordCsv } from './csv';

const rates: FeeRates = {
  costOfPublishing: 0.1, costOfDiscard: 0, shippingFeeSmall: 0, shippingFeeStandard: 0, shippingFeeLarge: 0,
  storageFeePerJokeMinute: 0, hostingFeePerJokeMinute: 0.05,
};
const rows: LeaderboardRow[] = [
  {
    rank: 1, team: { id: 1, name: 'Team A' }, points: 0, total_sales: 12, unsold_jokes: 2, discarded_jokes: 1,
    batches_processed: 3, profit: 4.5, total_jokes: 15, published_jokes: 9,
  },
];
const config = (id: number, batch: number) =>
  ({ id, round_number: id === 41 ? 1 : 2, status: 'ENDED', market_mode: 'LEAN', batch_size: batch, cost_of_publishing: 0.1 } as unknown as InstructorRound);
const charts = {
  round_id: 41, started_at: null, clock_end: '', sample_seconds: 10, wip_limit: 0, class_average: {},
  teams: [{ team_id: 1, team_name: 'Team A', waste: {}, idle: [], batches: [{ seq: 1, sent_s: 30, jokes: 5, published: 4, sold: 3, first_sale_s: 40 }] }],
} as unknown as LeanChartsResponse;

const deps = (over: Partial<SaveRunDeps> = {}): SaveRunDeps => ({
  getConfig: async id => ({ round: config(id, id === 41 ? 5 : 8) }),
  getCharts: async () => charts,
  ...over,
});
const input = (over: Partial<SaveRunInput> = {}): SaveRunInput => ({
  name: 'Pilot', notes: '', playedBy: 'students', now: new Date('2026-11-20T12:00:00Z'),
  rounds: [
    { round: 1, roundId: 41, stats: { leaderboard: rows }, rates },
    { round: 2, roundId: 42, stats: { leaderboard: rows }, rates },
  ],
  teamNames: {}, bots: new Map(), ...over,
});

describe('savableRounds', () => {
  it('includes Round 1 once it has ended, and Round 2 once it has ended too', () => {
    expect(savableRounds({ 1: 'ENDED', 2: null })).toEqual([1]);
    expect(savableRounds({ 1: 'ENDED', 2: 'ACTIVE' })).toEqual([1]);
    expect(savableRounds({ 1: 'ENDED', 2: 'ENDED' })).toEqual([1, 2]);
    expect(savableRounds({ 1: 'ACTIVE', 2: null })).toEqual([]);
  });
});

describe('collectRunRecord', () => {
  it('builds a record with each round\'s own settings', async () => {
    const rec = await collectRunRecord(input(), deps());
    expect(rec.name).toBe('Pilot');
    expect(rec.rounds.map(r => r.round)).toEqual([1, 2]);
    expect(rec.rounds[0].settings.batch_size).toBe(5);
    expect(rec.rounds[1].settings.batch_size).toBe(8);
    expect(rec.rounds[0].teams[0].batches).toHaveLength(1);
    expect(rec.exported_at).toBe('2026-11-20T12:00:00.000Z');
  });

  it('leaves out batches for a Classic round without failing', async () => {
    const notLean = Object.assign(new Error('409 NOT_LEAN_ROUND'), { status: 409 });
    const rec = await collectRunRecord(input(), deps({ getCharts: async () => { throw notLean; } }));
    expect(rec.rounds[0].teams[0].batches).toBeUndefined();
  });

  it('names the settings read that failed', async () => {
    await expect(collectRunRecord(input(), deps({ getConfig: async () => { throw new Error('boom'); } })))
      .rejects.toThrow('Could not read Round 1 settings');
  });

  it('names the batches read that failed', async () => {
    const getCharts = async (id: number) => { if (id === 42) throw new Error('boom'); return charts; };
    await expect(collectRunRecord(input(), deps({ getCharts }))).rejects.toThrow('Could not read Round 2 batches');
  });

  it.each(['bots', 'mixed'] as const)('puts a bot on its team when played by %s', async playedBy => {
    const rec = await collectRunRecord(input({ playedBy, bots: new Map([[1, { persona: 'steady' }]]) }), deps());
    expect(rec.rounds[0].teams[0].bot).toEqual({ persona: 'steady' });
  });

  it('prices each round with the fees its fetched config stored, not the rates passed in', async () => {
    const getConfig = async (id: number) => ({ round: { ...config(id, 5), cost_of_publishing: 0.25 } as InstructorRound });
    const rec = await collectRunRecord(input(), deps({ getConfig }));
    expect(rec.rounds[0].settings.cost_of_publishing).toBe(0.25);
    expect(rec.rounds[0].teams[0].fees.listing).toBeCloseTo(9 * 0.25, 10);
  });

  it('marks no team as a bot in a students record, even with bots registered', async () => {
    const rec = await collectRunRecord(input({ playedBy: 'students', bots: new Map([[1, { persona: 'steady' }]]) }), deps());
    expect(rec.rounds.flatMap(r => r.teams).some(t => 'bot' in t)).toBe(false);
  });
});

describe('roundInputs', () => {
  const stats = { leaderboard: rows };
  const other: FeeRates = { ...rates, costOfPublishing: 0.25 };

  it('pairs each savable round with its id, results and own rates', () => {
    expect(roundInputs([1, 2], { 1: 41, 2: 42 }, { 1: stats, 2: stats }, { 1: rates, 2: other })).toEqual([
      { round: 1, roundId: 41, stats, rates },
      { round: 2, roundId: 42, stats, rates: other },
    ]);
  });

  it('names the round whose results are missing', () => {
    expect(() => roundInputs([1, 2], { 1: 41, 2: 42 }, { 1: stats, 2: null }, { 1: rates, 2: rates }))
      .toThrow('Could not read Round 2 results');
  });

  it('names the round whose id is missing as a settings read', () => {
    expect(() => roundInputs([1], { 1: null, 2: null }, { 1: stats, 2: null }, { 1: rates, 2: rates }))
      .toThrow('Could not read Round 1 settings');
  });
});

describe('savedFiles', () => {
  it('gives the record and the spreadsheet under the file-safe name', async () => {
    const rec = await collectRunRecord(input({ name: 'Class #2' }), deps());
    const files = savedFiles('Class #2', rec);
    expect(files.json).toEqual({ fileName: 'Class -2.jfrun.json', text: JSON.stringify(rec, null, 2), mime: 'application/json' });
    expect(files.csv).toEqual({ fileName: 'Class -2.csv', text: recordCsv(rec), mime: 'text/csv' });
  });
});
