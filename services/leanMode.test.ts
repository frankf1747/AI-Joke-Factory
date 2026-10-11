// services/leanMode.test.ts
import { describe, expect, it } from 'vitest';
import {
  LEAN_LEADERBOARD_COLUMNS, MARKET_MODE_LOCKED_MESSAGE, WIP_LIMIT_MESSAGE,
  fmtCents, fmtFee, fmtMoney, fmtPerMinute, isLeanRound, isMarketModeLocked, isWipLimitReached,
  leanConfigFromRound, leanConfigToBody, leanFeesOf, learningCurvePoints, neverSold, shippingFeeFor, wipStatus,
} from './leanMode';

const classic = { market_mode: 'CLASSIC', arrival_window_seconds: 900, setup_cost_per_batch: 0, carrying_cost_per_joke_minute: 0, wip_limit: 0 };
const lean = {
  ...classic, market_mode: 'LEAN', setup_cost_per_batch: 3, carrying_cost_per_joke_minute: 0.02, wip_limit: 0,
  shipping_fee_small: 1, shipping_fee_standard: 2, shipping_fee_large: 3,
  storage_fee_per_joke_minute: 0.1, hosting_fee_per_joke_minute: 0.05,
};
const fees = { shippingFeeSmall: 1, shippingFeeStandard: 2, shippingFeeLarge: 3 };

describe('lean mode helpers', () => {
  it('detects the mode, defaulting to classic', () => {
    expect(isLeanRound(lean)).toBe(true);
    expect(isLeanRound(classic)).toBe(false);
    expect(isLeanRound(undefined)).toBe(false);
    expect(isLeanRound({})).toBe(false);
  });

  it('maps round fields onto GameConfig keys, fees included, with defaults for old backends', () => {
    expect(leanConfigFromRound(lean)).toEqual({
      marketMode: 'LEAN', arrivalWindowSeconds: 900, setupCostPerBatch: 3, carryingCostPerJokeMinute: 0.02, wipLimit: 0,
      shippingFeeSmall: 1, shippingFeeStandard: 2, shippingFeeLarge: 3, storageFeePerJokeMinute: 0.1, hostingFeePerJokeMinute: 0.05,
    });
    expect(leanConfigFromRound({})).toEqual({
      marketMode: 'CLASSIC', arrivalWindowSeconds: 900, setupCostPerBatch: 0, carryingCostPerJokeMinute: 0, wipLimit: 0,
      shippingFeeSmall: 0, shippingFeeStandard: 0, shippingFeeLarge: 0, storageFeePerJokeMinute: 0, hostingFeePerJokeMinute: 0,
    });
  });

  it('describes the WIP state for the Joke Maker', () => {
    expect(wipStatus(0, 0)).toEqual({ blocked: false, label: null });
    expect(wipStatus(1, 2)).toEqual({ blocked: false, label: 'Marketing has 1 of 2 batches waiting' });
    expect(wipStatus(2, 2)).toEqual({ blocked: true, label: 'Marketing has 2 of 2 batches waiting — wait, or go help' });
  });

  it('prices a batch by its size, an unsplit batch as the standard 5', () => {
    expect(shippingFeeFor(1, fees)).toBe(1);
    expect(shippingFeeFor(4, fees)).toBe(1);
    expect(shippingFeeFor(5, fees)).toBe(2);
    expect(shippingFeeFor(6, fees)).toBe(3);
    expect(shippingFeeFor(10, fees)).toBe(3);
    for (const unknown of [0, -2, Number.NaN]) expect(shippingFeeFor(unknown, fees)).toBe(2);
  });

  it('formats money with sign and cents', () => {
    expect(fmtMoney(3)).toBe('$3.00');
    expect(fmtMoney(-1.085)).toBe('-$1.09');
    expect(fmtMoney(1.005)).toBe('$1.01');
  });

  it('formats fees for copy: whole dollars bare, per-minute rates in cents', () => {
    expect(fmtFee(2)).toBe('$2');
    expect(fmtFee(1)).toBe('$1');
    expect(fmtFee(0.5)).toBe('$0.50');
    expect(fmtFee(1.25)).toBe('$1.25');
    expect(fmtCents(0.1)).toBe('10¢');
    expect(fmtCents(0.05)).toBe('5¢');
    expect(fmtCents(0.025)).toBe('2.5¢');
    expect(fmtCents(1)).toBe('$1.00');
    expect(fmtPerMinute(0.1)).toBe('10¢ a joke each minute');
    expect(fmtPerMinute(0.05)).toBe('5¢ a joke each minute');
    expect(fmtPerMinute(1.5)).toBe('$1.50 a joke each minute');
  });

  it('maps lean config keys, the five fees included, onto the snake_case request body', () => {
    expect(leanConfigToBody({
      shippingFeeSmall: 1, shippingFeeStandard: 2, shippingFeeLarge: 3, storageFeePerJokeMinute: 0.1, hostingFeePerJokeMinute: 0.05,
    })).toEqual({
      shipping_fee_small: 1, shipping_fee_standard: 2, shipping_fee_large: 3,
      storage_fee_per_joke_minute: 0.1, hosting_fee_per_joke_minute: 0.05,
    });
    expect(leanConfigToBody({ marketMode: 'LEAN', preferenceBase: 3, customerCount: 150 })).toEqual({
      market_mode: 'LEAN', preference_base: 3, customer_count: 150,
    });
    expect(leanConfigToBody({ arrivalWindowSeconds: 600, storageFeePerJokeMinute: 0 })).toEqual({
      arrival_window_seconds: 600, storage_fee_per_joke_minute: 0,
    });
    expect(leanConfigToBody({})).toEqual({});
  });

  it('reads the three fees off a lean block, falling back to the old aliases without NaN', () => {
    expect(leanFeesOf({ shipping_cost: 8, storage_cost: 1.5, hosting_cost: 0.2, setup_cost: 8, carrying_cost: 1.7 }))
      .toEqual({ shipping: 8, storage: 1.5, hosting: 0.2 });
    // An older backend: only setup_cost and carrying_cost.
    expect(leanFeesOf({ setup_cost: 4, carrying_cost: 2.5 })).toEqual({ shipping: 4, storage: 2.5, hosting: 0 });
    expect(leanFeesOf({ setup_cost: 'x', carrying_cost: undefined })).toEqual({ shipping: 0, storage: 0, hosting: 0 });
    expect(leanFeesOf(null)).toEqual({ shipping: 0, storage: 0, hosting: 0 });
    expect(leanFeesOf(undefined)).toEqual({ shipping: 0, storage: 0, hosting: 0 });
  });

  it('names the leaderboard Lean columns after the fees', () => {
    expect(LEAN_LEADERBOARD_COLUMNS.map(c => c.label)).toEqual(['Shipping', 'Storage', 'Hosting', 'Lead', 'Sale']);
  });

  it('counts never-sold jokes per batch, even when total sales exceed published', () => {
    const series = [
      { seq: 1, submitted_at: '', jokes: 5, published: 4, sold: 1 },
      { seq: 2, submitted_at: '', jokes: 5, published: 3, sold: 3 },
      { seq: 3, submitted_at: '', jokes: 5, published: 2, sold: 0 },
    ];
    // 9 published, 4 sold at least once; total sales could be 20 (repeat buys),
    // which the classic max(published - sales, 0) formula would report as 0 unsold.
    expect(neverSold({ batch_series: series })).toBe(5);
    expect(neverSold({ batch_series: [{ published: 1, sold: 3 }] })).toBe(0);
    expect(neverSold({ batch_series: [] })).toBe(0);
    expect(neverSold(undefined)).toBeNull();
  });

  it('recognises the locked-settings refusal', () => {
    expect(isMarketModeLocked({ status: 409, message: `${MARKET_MODE_LOCKED_MESSAGE}: round started` })).toBe(true);
    expect(isMarketModeLocked({ status: 409, message: 'WIP_LIMIT_REACHED' })).toBe(false);
    expect(isMarketModeLocked({ status: 500, message: MARKET_MODE_LOCKED_MESSAGE })).toBe(false);
    expect(isMarketModeLocked(null)).toBe(false);
  });

  it('recognises the WIP-limit refusal', () => {
    expect(isWipLimitReached({ status: 409, message: `${WIP_LIMIT_MESSAGE}: 2 batches waiting` })).toBe(true);
    expect(isWipLimitReached({ status: 409, message: MARKET_MODE_LOCKED_MESSAGE })).toBe(false);
    expect(isWipLimitReached({ status: 400, message: WIP_LIMIT_MESSAGE })).toBe(false);
    expect(isWipLimitReached(undefined)).toBe(false);
  });

  it('turns the batch series into sell-through points', () => {
    const at = '2026-10-06T00:00:00Z';
    const series = [
      { seq: 3, submitted_at: at, jokes: 5, published: 4, sold: 3 },
      { seq: 1, submitted_at: at, jokes: 5, published: 2, sold: 0 },
      { seq: 2, submitted_at: at, jokes: 5, published: 0, sold: 0 },
      { seq: 4, submitted_at: at, jokes: 5, published: 1, sold: 2 },
    ];
    expect(learningCurvePoints(series)).toEqual([{ seq: 1, rate: 0 }, { seq: 3, rate: 0.75 }, { seq: 4, rate: 1 }]);
    expect(learningCurvePoints([])).toEqual([]);
    expect(learningCurvePoints(undefined)).toEqual([]);
  });
});
