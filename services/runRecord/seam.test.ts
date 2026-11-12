/* End to end through the record's seams: Debrief-shaped inputs → buildRunRound/buildRunRecord →
   the JSON file → parseRunRecord → the measures and settings Compare shows. */
import { describe, expect, it } from 'vitest';
import type { InstructorRound, LeanChartsResponse } from '../../types/api';
import type { LeaderboardRow } from '../classTotals';
import type { FeeRates } from '../shownFees';
import { buildRunRecord, buildRunRound } from './build';
import { settingRows } from './compare';
import { measureValue } from './measures';
import { parseRunRecord } from './parse';
import type { RunRecord } from './types';

const rates = (listing: number): FeeRates => ({
  costOfPublishing: listing, costOfDiscard: 0, shippingFeeSmall: 0, shippingFeeStandard: 0, shippingFeeLarge: 0,
  storageFeePerJokeMinute: 0, hostingFeePerJokeMinute: 0.05,
});

const leaderboard: LeaderboardRow[] = [
  {
    rank: 1, team: { id: 1, name: 'Team A' }, points: 0, total_sales: 12, unsold_jokes: 2, discarded_jokes: 1,
    batches_processed: 2, profit: 4.5, total_jokes: 15, published_jokes: 9,
    lean: {
      batches_submitted: 2, setup_cost: 0, carrying_cost: 0, hosting_cost: 0.5, avg_submit_to_publish_s: 20, avg_publish_to_first_sale_s: 12,
      batch_series: [
        { seq: 1, submitted_at: '', jokes: 5, published: 5, sold: 3 },
        { seq: 2, submitted_at: '', jokes: 5, published: 4, sold: 2 },
      ],
    },
  },
  {
    rank: 2, team: { id: 2, name: 'Team B' }, points: 0, total_sales: 0, unsold_jokes: 0, discarded_jokes: 0,
    batches_processed: 0, profit: -1.25, total_jokes: 0, published_jokes: 0,
  },
];

const config = (round: 1 | 2, listing: number) => ({
  id: 40 + round, round_number: round, status: 'ENDED', started_at: '2026-11-20T10:00:00Z', ended_at: '2026-11-20T10:10:00Z',
  market_mode: 'LEAN', batch_size: 5, market_price: 1, cost_of_publishing: listing, hosting_fee_per_joke_minute: 0.05,
  ideal_profile: { topic: 'animals', style: 'pun' },
} as unknown as InstructorRound);

const charts = {
  round_id: 41, started_at: null, clock_end: '', sample_seconds: 10, wip_limit: 0, class_average: {},
  teams: [{
    team_id: 1, team_name: 'Team A', waste: {}, idle: [],
    batches: [{ seq: 1, sent_s: 30, jokes: 5, published: 5, sold: 3, first_sale_s: 40 }, { seq: 2, sent_s: 90, jokes: 5, published: 4, sold: 2, first_sale_s: 120 }],
  }],
} as unknown as LeanChartsResponse;

/** A saved file, as the Debrief would write it, with this Round 1 listing fee. */
function savedText(name: string, listing: number): string {
  const rounds = ([1, 2] as const).map(round => buildRunRound({
    round, config: config(round, round === 1 ? listing : 0.1), stats: { leaderboard }, charts,
    teamNames: { 1: 'Team A', 2: 'Team B' }, rates: rates(round === 1 ? listing : 0.1),
  }));
  return JSON.stringify(buildRunRecord({ name, playedBy: 'students', exportedAt: '2026-11-20T11:00:00Z' }, rounds), null, 2);
}

function loaded(text: string): RunRecord {
  const parsed = parseRunRecord(text);
  if (!parsed.ok) throw new Error(parsed.reason);
  return parsed.record;
}

describe('a saved record, read back by Compare', () => {
  it('parses and gives the hand-worked mean profit', () => {
    const rec = loaded(savedText('Run A', 0.1));
    expect(measureValue(rec, 'mean_profit', 1)).toBeCloseTo((4.5 + -1.25) / 2, 10);
    expect(rec.rounds[0].teams[0].batches).toHaveLength(2);
  });

  it('puts the listing fee first, marked as differing, when two runs differ only in it', () => {
    const rows = settingRows([loaded(savedText('Run A', 0.1)), loaded(savedText('Run B', 0.25))]);
    expect(rows[0]).toMatchObject({ round: 1, key: 'cost_of_publishing', label: 'Listing', values: [0.1, 0.25], differs: true });
    expect(rows.filter(r => r.differs)).toHaveLength(1);
  });
});
