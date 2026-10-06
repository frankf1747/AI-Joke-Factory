// services/leanMode.test.ts
import { describe, expect, it } from 'vitest';
import { fmtMoney, isLeanRound, leanConfigFromRound, wipStatus } from './leanMode';

const classic = { market_mode: 'CLASSIC', arrival_window_seconds: 900, setup_cost_per_batch: 0, carrying_cost_per_joke_minute: 0, wip_limit: 0 };
const lean = { ...classic, market_mode: 'LEAN', setup_cost_per_batch: 3, carrying_cost_per_joke_minute: 0.02, wip_limit: 2 };

describe('lean mode helpers', () => {
  it('detects the mode, defaulting to classic', () => {
    expect(isLeanRound(lean)).toBe(true);
    expect(isLeanRound(classic)).toBe(false);
    expect(isLeanRound(undefined)).toBe(false);
    expect(isLeanRound({})).toBe(false);
  });

  it('maps round fields onto GameConfig keys with defaults for old backends', () => {
    expect(leanConfigFromRound(lean)).toEqual({
      marketMode: 'LEAN', arrivalWindowSeconds: 900, setupCostPerBatch: 3, carryingCostPerJokeMinute: 0.02, wipLimit: 2,
    });
    expect(leanConfigFromRound({})).toEqual({
      marketMode: 'CLASSIC', arrivalWindowSeconds: 900, setupCostPerBatch: 0, carryingCostPerJokeMinute: 0, wipLimit: 0,
    });
  });

  it('describes the WIP state for the Joke Maker', () => {
    expect(wipStatus(0, 0)).toEqual({ blocked: false, label: null });
    expect(wipStatus(1, 2)).toEqual({ blocked: false, label: 'Marketing has 1 of 2 batches waiting' });
    expect(wipStatus(2, 2)).toEqual({ blocked: true, label: 'Marketing has 2 of 2 batches waiting — wait, or go help' });
  });

  it('formats money with sign and cents', () => {
    expect(fmtMoney(3)).toBe('$3.00');
    expect(fmtMoney(-1.085)).toBe('-$1.09');
  });
});
