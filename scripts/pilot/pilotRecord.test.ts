import { describe, expect, it } from 'vitest';
import type { InstructorRound } from '../../types/api';
import type { LeaderboardRow } from '../../services/classTotals';
import type { FeeRates } from '../../services/shownFees';
import { buildRunRecord, buildRunRound } from '../../services/runRecord/build';
import { parseRunRecord } from '../../services/runRecord/parse';
import type { BatchFit } from './feedbackReport';
import { botOf, fitsOf, pilotRates, recordFileName } from './pilotRecord';

const rates: FeeRates = {
  costOfPublishing: 0.1, costOfDiscard: 0, shippingFeeSmall: 0, shippingFeeStandard: 0, shippingFeeLarge: 0,
  storageFeePerJokeMinute: 0, hostingFeePerJokeMinute: 0.05,
};

const rows: LeaderboardRow[] = [1, 2].map(id => ({
  rank: id, team: { id, name: `Team ${id}` }, points: 0, total_sales: 6, unsold_jokes: 1, discarded_jokes: 0,
  batches_processed: 2, profit: 2, total_jokes: 9, published_jokes: 9,
})) as LeaderboardRow[];

const config = {
  id: 7, round_number: 2, status: 'ENDED', started_at: '2026-11-20T10:00:00Z', ended_at: '2026-11-20T10:03:00Z',
  market_mode: 'LEAN', batch_size: 10, market_price: 1, cost_of_publishing: 0.1, hosting_fee_per_joke_minute: 0.05,
} as unknown as InstructorRound;

describe('botOf', () => {
  it('names what the pilot created the team with and leaves release_all out when unset', () => {
    const bot = botOf({ persona: 'BALANCED', useFeedback: true, round2BatchSize: 3 }, 's#1');
    expect(bot).toEqual({ persona: 'BALANCED', use_feedback: true, round2_batch_size: 3, seed: 's#1' });
    expect('release_all' in bot).toBe(false);
  });

  it('carries release_all when set', () => {
    expect(botOf({ persona: 'BALANCED', useFeedback: false, round2BatchSize: 10, releaseAll: true }, 's#2').release_all).toBe(true);
  });
});

describe('fitsOf', () => {
  it('maps each batch fit to seq and fit, keeping null', () => {
    const fits: BatchFit[] = [
      { seq: 1, released: 3, meanFit: 4.5, aboveBar: 1, cleared: true },
      { seq: 2, released: 0, meanFit: null, aboveBar: 0, cleared: false },
    ];
    expect(fitsOf(fits)).toEqual([{ seq: 1, fit: 4.5 }, { seq: 2, fit: null }]);
  });
});

describe('pilotRates', () => {
  it('reads the stored fees and uses 0 for one the config lacks', () => {
    const r = pilotRates(config);
    expect(r.costOfPublishing).toBe(0.1);
    expect(r.hostingFeePerJokeMinute).toBe(0.05);
    expect(r.shippingFeeLarge).toBe(0);
  });
});

describe('recordFileName', () => {
  it('is the safe class name plus .jfrun.json', () => {
    expect(recordFileName('listing $0.10 hosting $0.05', 2)).toBe('listing -0.10 hosting -0.05 class 2.jfrun.json');
  });
});

describe('a pilot record', () => {
  it('parses and keeps the bot and the fit per batch', () => {
    const round = buildRunRound({
      round: 2, config, stats: { leaderboard: rows }, charts: null, teamNames: {}, rates,
      bots: new Map([[1, botOf({ persona: 'BALANCED', useFeedback: true, round2BatchSize: 3 }, 's#1')]]),
      fits: new Map([[1, fitsOf([{ seq: 1, released: 3, meanFit: 4.5, aboveBar: 1, cleared: true }])]]),
    });
    const record = buildRunRecord(
      { name: 'listing $0.10 hosting $0.05 class 1', notes: 's', playedBy: 'bots', exportedAt: '2026-11-20T11:00:00Z' }, [round],
    );
    const parsed = parseRunRecord(JSON.stringify(record));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const team1 = parsed.record.rounds[0].teams.find(t => t.team_id === 1);
    expect(team1?.bot?.use_feedback).toBe(true);
    expect(team1?.fit_by_batch).toEqual([{ seq: 1, fit: 4.5 }]);
    expect(parsed.record.rounds[0].teams.find(t => t.team_id === 2)?.bot).toBeUndefined();
  });
});
