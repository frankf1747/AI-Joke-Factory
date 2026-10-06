import { describe, expect, it } from 'vitest';
import { checkKeys } from './smoke-keys';

const required = ['id', 'status', 'is_popped_active'];
const lean = ['market_mode', 'arrival_window_seconds', 'setup_cost_per_batch', 'carrying_cost_per_joke_minute', 'wip_limit'];
const preLeanRound = { id: 1, status: 'ACTIVE', is_popped_active: false };
const leanRound = {
  ...preLeanRound,
  market_mode: 'LEAN', arrival_window_seconds: 900, setup_cost_per_batch: 1,
  carrying_cost_per_joke_minute: 0.02, wip_limit: 2,
};

describe('smoke key check', () => {
  it('accepts a round from a backend that predates lean mode', () => {
    expect(checkKeys('rounds[0]', preLeanRound, required, lean)).toEqual({ missing: [], extra: [] });
  });

  it('accepts a round that carries the lean keys without calling them extra', () => {
    expect(checkKeys('rounds[0]', leanRound, required, lean)).toEqual({ missing: [], extra: [] });
  });

  it('still reports missing required keys and undeclared extras', () => {
    const { is_popped_active: _drop, ...partial } = { ...leanRound, surprise: true };
    expect(checkKeys('rounds[0]', partial, required, lean)).toEqual({ missing: ['is_popped_active'], extra: ['surprise'] });
  });
});
