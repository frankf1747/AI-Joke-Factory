import { describe, expect, it } from 'vitest';
import { feeRatesFromRound, ratesFor } from './roundRates';
import { debriefRows } from '../components/LeanDebrief';
import { boardRows } from './liveBoard';
import { classTotals, type LeaderboardRow } from './classTotals';
import { TWO_COST_CONFIG } from '../views/testing/renderWithGame';

describe('feeRatesFromRound', () => {
  it('reads every fee the stored round carries, and leaves out what it lacks', () => {
    expect(feeRatesFromRound({
      cost_of_publishing: 0.25, cost_of_discard: 0, hosting_fee_per_joke_minute: 0.1,
      shipping_fee_small: 0, shipping_fee_standard: 0, shipping_fee_large: 0, storage_fee_per_joke_minute: 0,
    })).toEqual({
      costOfPublishing: 0.25, costOfDiscard: 0, hostingFeePerJokeMinute: 0.1,
      shippingFeeSmall: 0, shippingFeeStandard: 0, shippingFeeLarge: 0, storageFeePerJokeMinute: 0,
    });
    expect(feeRatesFromRound({ cost_of_publishing: 0.25, cost_of_discard: null, hosting_fee_per_joke_minute: 'x' }))
      .toEqual({ costOfPublishing: 0.25 });
    expect(feeRatesFromRound(null)).toEqual({});
  });

  it('falls back to the selected config for anything the round has not given', () => {
    expect(ratesFor({ costOfPublishing: 0.5 }, TWO_COST_CONFIG)).toMatchObject({
      costOfPublishing: 0.5, hostingFeePerJokeMinute: TWO_COST_CONFIG.hostingFeePerJokeMinute, costOfDiscard: 0,
    });
    expect(ratesFor(null, TWO_COST_CONFIG).costOfPublishing).toBe(TWO_COST_CONFIG.costOfPublishing);
  });
});

/* The backend computes each round's profit with that round's stored listing:
   profit = sales × price − listing × released − hosting. The Fees column must
   match it per round, so revenue − fees = profit on both sides of the debrief. */
describe('Fees identity per round (revenue − fees = profit)', () => {
  const price = 1;
  const row = (sales: number, released: number, hosting: number, listing: number): LeaderboardRow => ({
    rank: 1, team: { id: 1, name: 'Team 1' } as any, points: 0, total_sales: sales, unsold_jokes: 0, discarded_jokes: 0,
    batches_processed: 1, total_jokes: released, published_jokes: released,
    profit: sales * price - released * listing - hosting,
    lean: { shipping_cost: 0, storage_cost: 0, hosting_cost: hosting } as any,
  });
  // Round 1 played at listing $0.10; Round 2 at $0.25 (the selected config).
  const r1Rates = ratesFor({ costOfPublishing: 0.1 }, TWO_COST_CONFIG);
  const r2Rates = ratesFor({ costOfPublishing: 0.25 }, TWO_COST_CONFIG);
  const r1 = { leaderboard: [row(12, 20, 1.5, 0.1)] };
  const r2 = { leaderboard: [row(15, 18, 0.75, 0.25)] };

  it('holds for both rounds when each is priced from its own stored config', () => {
    const [d] = debriefRows(r1, r2, {}, { r1: r1Rates, r2: r2Rates });
    expect(12 * price - d.r1!.fees!).toBeCloseTo(d.r1!.profit, 10);
    expect(15 * price - d.r2!.fees!).toBeCloseTo(d.r2!.profit, 10);
  });

  it('holds on the Live board and the class totals for the round in view', () => {
    for (const [stats, rates, sales] of [[r1, r1Rates, 12], [r2, r2Rates, 15]] as const) {
      const [b] = boardRows(stats.leaderboard, {}, rates);
      expect(sales * price - b.feesTotal!).toBeCloseTo(b.profit, 10);
      const t = classTotals(stats.leaderboard, true, rates);
      expect(t.sales * price - t.fees!).toBeCloseTo(t.profit, 10);
    }
  });

  it('would not hold for Round 1 priced at the selected round\'s listing (the old behaviour)', () => {
    const [d] = debriefRows(r1, r2, {}, r2Rates);
    expect(12 * price - d.r1!.fees!).not.toBeCloseTo(d.r1!.profit, 2);
  });
});
