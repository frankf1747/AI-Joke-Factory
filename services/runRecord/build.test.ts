import { describe, expect, it } from 'vitest';
import type { InstructorRound, LeanChartsResponse } from '../../types/api';
import type { LeaderboardRow } from '../classTotals';
import { boardRows } from '../liveBoard';
import type { FeeRates } from '../shownFees';
import { buildRunRecord, buildRunRound, defaultPlayedBy, defaultRunName, fileSafeName, type RunRoundInput } from './build';
import { SETTING_FIELDS } from './types';

const rates: FeeRates = {
  costOfPublishing: 0.1, costOfDiscard: 0, shippingFeeSmall: 0, shippingFeeStandard: 0, shippingFeeLarge: 0,
  storageFeePerJokeMinute: 0, hostingFeePerJokeMinute: 0.05,
};

const rows: LeaderboardRow[] = [
  {
    rank: 1, team: { id: 1, name: 'Team A' }, points: 0, total_sales: 12, unsold_jokes: 2, discarded_jokes: 1,
    batches_processed: 3, profit: 4.5, total_jokes: 15, published_jokes: 9,
    lean: {
      batches_submitted: 1, setup_cost: 0, carrying_cost: 0, hosting_cost: 0.5, avg_submit_to_publish_s: 20, avg_publish_to_first_sale_s: 12,
      batch_series: [{ seq: 1, submitted_at: '', jokes: 5, published: 5, sold: 3 }],
    },
  },
  {
    rank: 2, team: { id: 2, name: 'Team B' }, points: 0, total_sales: 0, unsold_jokes: 0, discarded_jokes: 0,
    batches_processed: 0, profit: -1.25, total_jokes: 0, published_jokes: 0,
  },
];

const config = {
  id: 41, round_number: 1, status: 'ENDED', started_at: '2026-11-20T10:00:00Z', ended_at: '2026-11-20T10:10:00Z',
  market_mode: 'LEAN', batch_size: 5, max_batch_size: 8, market_price: 1, customer_budget: 3,
  cost_of_publishing: 0.1, cost_of_discard: 0, customer_count: 20, feedback_joke_count: 3, is_popped_active: false,
  hosting_fee_per_joke_minute: 0.05, shipping_fee_small: 0,
  buy_threshold: 4, jitter: 0.5, swap_margin: 1, feedback_pass_threshold: 6,
  ideal_profile: { topic: 'animals', style: 'pun' },
} as unknown as InstructorRound;

const charts = {
  round_id: 41, started_at: null, clock_end: '', sample_seconds: 10, wip_limit: 0, class_average: {},
  teams: [
    { team_id: 1, team_name: 'Team A', waste: {}, idle: [], batches: [{ seq: 1, sent_s: 30, jokes: 5, published: 4, sold: 3, first_sale_s: 40 }] },
    { team_id: 9, team_name: 'Gone', waste: {}, idle: [], batches: [{ seq: 1, sent_s: 1, jokes: 1, published: 1, sold: 1, first_sale_s: 1 }] },
  ],
} as unknown as LeanChartsResponse;

const input = (over: Partial<RunRoundInput> = {}): RunRoundInput => ({
  round: 1, config, stats: { leaderboard: rows }, charts: null, teamNames: {}, rates, ...over,
});

describe('buildRunRound', () => {
  it('keeps every setting the config has, fees at 0 included, and omits one it lacks', () => {
    const { settings } = buildRunRound(input());
    expect(settings.shipping_fee_small).toBe(0);
    expect(settings.cost_of_discard).toBe(0);
    expect(settings.cost_of_publishing).toBe(0.1);
    expect(settings.market_mode).toBe('LEAN');
    expect(settings.batch_size).toBe(5);
    expect('preference_base' in settings).toBe(false);
    for (const key of Object.keys(settings)) expect(SETTING_FIELDS.some(([k]) => k === key)).toBe(true);
  });

  it('copies the ideal profile and the round facts from the config', () => {
    const r = buildRunRound(input());
    expect(r.ideal_profile).toEqual({ topic: 'animals', style: 'pun' });
    expect(r).toMatchObject({ round: 1, round_id: 41, status: 'ENDED', started_at: '2026-11-20T10:00:00Z', ended_at: '2026-11-20T10:10:00Z' });
  });

  it('has no ideal profile when the config has none', () => {
    const { ideal_profile: _drop, ...rest } = config as InstructorRound;
    expect('ideal_profile' in buildRunRound(input({ config: rest as InstructorRound }))).toBe(false);
  });

  it('takes team figures from the leaderboard and fees from boardRows', () => {
    const [a, b] = buildRunRound(input({ teamNames: { '1': 'Owls' } })).teams;
    const board = boardRows(rows, {}, rates);
    expect(a).toMatchObject({ team_id: 1, team: 'Owls', profit: 4.5, sold: 12, released: 9, made: 15, never_sold: 2, discarded: 1 });
    expect(a.fees.listing).toBeCloseTo(0.9);
    expect(a.fees.total).toBe(board[0].feesTotal);
    expect(a.sent_to_released_s).toBe(20);
    expect(a.to_first_sale_s).toBe(12);
    expect(b).toMatchObject({ team_id: 2, team: 'Team B', profit: -1.25, sold: 0, never_sold: null, sent_to_released_s: null, to_first_sale_s: null });
  });

  it('adds each team\'s batches from the charts and ignores a chart team that did not play', () => {
    const { teams } = buildRunRound(input({ charts }));
    expect(teams).toHaveLength(2);
    expect(teams[0].batches).toEqual([{ seq: 1, sent_s: 30, jokes: 5, released: 4, sold: 3, first_sale_s: 40 }]);
    expect(teams[1].batches).toEqual([]);
  });

  it('has no batches key at all without charts', () => {
    for (const t of buildRunRound(input({ charts: null })).teams) expect('batches' in t).toBe(false);
  });

  it('attaches bot fields and fits only to the teams that have them', () => {
    const [a, b] = buildRunRound(input({
      bots: new Map([[1, { persona: 'BALANCED', use_feedback: true }]]),
      fits: new Map([[1, [{ seq: 1, fit: 3.5 }]]]),
    })).teams;
    expect(a.bot).toEqual({ persona: 'BALANCED', use_feedback: true });
    expect(a.fit_by_batch).toEqual([{ seq: 1, fit: 3.5 }]);
    expect('bot' in b).toBe(false);
    expect('fit_by_batch' in b).toBe(false);
  });
});

describe('buildRunRecord', () => {
  const r1 = buildRunRound(input());
  const r2 = { ...r1, round: 2 as const };
  it('stamps the format, sorts the rounds and omits empty notes', () => {
    const rec = buildRunRecord({ name: 'Run', notes: '  ', playedBy: 'bots', exportedAt: '2026-11-20T15:04:05Z' }, [r2, r1]);
    expect(rec).toMatchObject({ format: 'jf-run-record', version: 1, name: 'Run', played_by: 'bots', exported_at: '2026-11-20T15:04:05Z' });
    expect(rec.rounds.map(r => r.round)).toEqual([1, 2]);
    expect('notes' in rec).toBe(false);
  });
  it('keeps notes when given', () => {
    expect(buildRunRecord({ name: 'Run', notes: 'Section B', playedBy: 'students', exportedAt: 'x' }, [r1]).notes).toBe('Section B');
  });
});

describe('defaultPlayedBy', () => {
  it('reads who played from the bot panel\'s teams', () => {
    expect(defaultPlayedBy([1, 2], new Set([1, 2]))).toBe('bots');
    expect(defaultPlayedBy([1, 2], new Set([1]))).toBe('mixed');
    expect(defaultPlayedBy([1, 2], new Set())).toBe('students');
    expect(defaultPlayedBy([], new Set())).toBe('students');
  });
});

describe('names', () => {
  it('defaults the run name to the local date', () => {
    expect(defaultRunName(new Date(2026, 10, 20, 9))).toBe('2026-11-20 class');
  });
  it('makes a name safe for a file', () => {
    expect(fileSafeName('Week 3: listing/25¢')).toBe('Week 3- listing-25-');
    expect(fileSafeName('   ')).toBe('run');
    expect(fileSafeName('a'.repeat(200))).toHaveLength(80);
  });
});
