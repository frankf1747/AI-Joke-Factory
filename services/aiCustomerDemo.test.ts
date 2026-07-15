import { describe, it, expect } from 'vitest';
import {
  simulateCustomer,
  scoreJoke,
  type DemoJoke,
  type EngineConfig,
} from './aiCustomerDemo';
import { IDEAL_PROFILE } from '../config/dimensions';

const CFG: EngineConfig = {
  ideal: IDEAL_PROFILE,
  threshold: 0.7,
  perDimBar: 0.6,
  budget: 3.0,
  price: 1.0,
};

/** A joke equal to the ideal except for the given overrides. */
function j(id: string, overrides: Record<string, string> = {}): DemoJoke {
  return { id, title: `Joke ${id}`, text: `text ${id}`, levels: { ...IDEAL_PROFILE, ...overrides } };
}

/** A joke that is maximally wrong on every dimension. */
function worst(id: string): DemoJoke {
  const levels: Record<string, string> = {};
  // length: ideal Short → furthest Long; topic: non-match; etc.
  levels.length = 'Long';
  levels.topic = 'Random';
  levels.humor_style = 'Anti-joke';
  levels.complexity = 'Expert';
  levels.edginess = 'Slightly edgy';
  levels.structure = 'List';
  levels.wordplay = 'None';
  levels.freshness = 'Time-sensitive';
  levels.setup_payoff = 'Very long build';
  levels.clarity = 'Reinterpretation';
  levels.energy = 'High-energy';
  return { id, title: `Joke ${id}`, text: `text ${id}`, levels };
}

describe('scoreJoke', () => {
  it('an ideal joke scores 1.0 and passes every dimension', () => {
    const s = scoreJoke(j('A'), CFG);
    expect(s.overall).toBeCloseTo(1, 6);
    expect(s.passedCount).toBe(s.dims.length);
    expect(s.failedCount).toBe(0);
  });

  it('tags length and topic as rule-based, the rest as LLM', () => {
    const s = scoreJoke(j('A'), CFG);
    const rule = s.dims.filter(d => d.source === 'rule').map(d => d.id).sort();
    expect(rule).toEqual(['length', 'topic']);
    expect(s.dims.filter(d => d.source === 'llm').length).toBe(s.dims.length - 2);
  });

  it('a maximally-wrong joke scores far below threshold', () => {
    const s = scoreJoke(worst('Z'), CFG);
    expect(s.overall).toBeLessThan(CFG.threshold);
  });
});

describe('simulateCustomer', () => {
  it('buys an above-threshold joke and debits the budget', () => {
    const [step] = simulateCustomer([j('A')], CFG);
    expect(step.verdict).toBe('BUY');
    expect(step.budgetAfter).toBeCloseTo(2, 6);
    expect(step.basket).toEqual(['A']);
  });

  it('skips a below-threshold joke without spending', () => {
    const [step] = simulateCustomer([worst('Z')], CFG);
    expect(step.verdict).toBe('SKIP_LOW');
    expect(step.budgetAfter).toBeCloseTo(3, 6);
    expect(step.basket).toEqual([]);
  });

  it('fills the budget then skips an equal-score joke (no strict improvement)', () => {
    const steps = simulateCustomer([j('A'), j('B'), j('C'), j('D')], CFG);
    expect(steps.map(s => s.verdict)).toEqual(['BUY', 'BUY', 'BUY', 'SKIP_FULL']);
    expect(steps[3].budgetAfter).toBeCloseTo(0, 6);
    expect(steps[3].basket).toEqual(['A', 'B', 'C']);
  });

  it('swaps out the weakest held joke when a better one arrives at full budget', () => {
    // First three clear the threshold but are imperfect; the fourth is ideal.
    const weak = { complexity: 'Moderate' }; // slightly off → < 1.0 but >= threshold
    const steps = simulateCustomer(
      [j('A', weak), j('B', weak), j('C', weak), j('D') /* ideal, 1.0 */],
      CFG,
    );
    const last = steps[3];
    expect(last.verdict).toBe('SWAP');
    expect(last.returnedJokeId).toBe('A'); // weakest (ties broken by first found)
    expect(last.basket).toContain('D');
    expect(last.basket).not.toContain('A');
    expect(last.basket.length).toBe(3);
    expect(last.budgetAfter).toBeCloseTo(0, 6); // +1 return then -1 buy
  });
});
