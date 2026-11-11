import { describe, expect, it } from 'vitest';
import { ALL_FEES_SHOWN, feeNames, feesTotal, shownFees, teamFees } from './shownFees';
import { TEST_CONFIG, TWO_COST_CONFIG } from '../views/testing/renderWithGame';

describe('shownFees', () => {
  it('shows only listing and hosting at the two-cost defaults', () => {
    expect(shownFees(TWO_COST_CONFIG)).toEqual({ listing: true, hosting: true, shipping: false, storage: false, discard: false });
  });

  it('still shows shipping, storage and discard in a round that charges them', () => {
    expect(shownFees(TEST_CONFIG)).toEqual(ALL_FEES_SHOWN);
    expect(shownFees({ ...TWO_COST_CONFIG, shippingFeeLarge: 3 }).shipping).toBe(true);
    expect(shownFees({ ...TWO_COST_CONFIG, storageFeePerJokeMinute: 0.01 }).storage).toBe(true);
  });

  it('hides a fee that is 0, missing or not a number', () => {
    expect(shownFees({ costOfPublishing: 0, hostingFeePerJokeMinute: Number.NaN })).toEqual(
      { listing: false, hosting: false, shipping: false, storage: false, discard: false });
    expect(shownFees(null).listing).toBe(false);
  });
});

describe('teamFees', () => {
  it('adds listing and discard at the round prices to the Lean fees', () => {
    const f = teamFees({
      published_jokes: 8, discarded_jokes: 2,
      lean: { shipping_cost: 0, storage_cost: 0, hosting_cost: 1.25 },
    }, TWO_COST_CONFIG);
    expect(f).toEqual({ listing: 0.8, hosting: 1.25, shipping: 0, storage: 0, discard: 0 });
    expect(feesTotal(f)).toBeCloseTo(2.05);
  });

  it('reads 0, never NaN, for missing counts or prices', () => {
    const f = teamFees({ published_jokes: undefined, lean: undefined }, null);
    expect(feesTotal(f)).toBe(0);
  });
});

describe('feeNames', () => {
  it('names the shown fees in order', () => {
    expect(feeNames(shownFees(TWO_COST_CONFIG))).toBe('listing and hosting');
    expect(feeNames(ALL_FEES_SHOWN)).toBe('listing, hosting, shipping, storage and discard');
    expect(feeNames({ ...shownFees(null), hosting: true })).toBe('hosting');
    expect(feeNames(shownFees(null))).toBe('no fees');
  });
});
