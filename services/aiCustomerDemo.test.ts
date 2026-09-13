import { describe, it, expect } from 'vitest';
import {
  scoreJoke,
  simulateCustomer,
  simulateMarket,
  makeCustomers,
  DEMO_CONFIG,
  DEMO_JOKES,
  MAX_FIT,
  type DemoJoke,
  type EngineConfig,
} from './aiCustomerDemo';
import { IDEAL_PROFILE } from '../config/dimensions';

const CFG: EngineConfig = { ...DEMO_CONFIG };

const mk = (id: string, overrides: Record<string, string> = {}): DemoJoke => ({
  id,
  title: `Joke ${id}`,
  text: '…',
  levels: { ...IDEAL_PROFILE, ...overrides },
});

/** A joke that misses on nearly everything. */
const worst = () =>
  mk('W', {
    length: 'Long',
    topic: 'AI',
    humor_style: 'Observational',
    complexity: 'Expert',
    edginess: 'Slightly edgy',
    wordplay: 'None',
    freshness: 'Time-sensitive',
    setup_payoff: 'Very long build',
    clarity: 'Reinterpretation',
    energy: 'High-energy',
    title_fit: 'Mismatch',
  });

describe('scoreJoke — true_fit is a SUM over 11 scored dims', () => {
  it('the ideal joke scores the maximum', () => {
    const s = scoreJoke(mk('ideal'), CFG);
    expect(s.trueFit).toBeCloseTo(MAX_FIT, 6);
    expect(s.maxFit).toBe(11); // 12 dims minus the Structure placeholder
  });

  it('the worst joke scores near zero and lands far below τ', () => {
    const f = scoreJoke(worst(), CFG).trueFit;
    expect(f).toBeCloseTo(1, 6); // only complexity/setup_payoff/energy retain any partial credit
    expect(f).toBeLessThan(CFG.tau - CFG.jitter);
  });

  it('lists all 12 dims but excludes the Structure placeholder from the sum', () => {
    const s = scoreJoke(mk('x'), CFG);
    expect(s.dims).toHaveLength(12);
    const structure = s.dims.find(d => d.id === 'structure')!;
    expect(structure.placeholder).toBe(true);
    expect(structure.fit).toBe(0);
    expect(s.dims.filter(d => !d.placeholder)).toHaveLength(11);
  });

  it('only Length is rule-scored; the other 11 need the LLM', () => {
    const s = scoreJoke(mk('x'), CFG);
    expect(s.dims.filter(d => d.source === 'rule').map(d => d.id)).toEqual(['length']);
    expect(s.dims.filter(d => d.source === 'llm')).toHaveLength(11);
  });
});

describe('Title Fit — intrinsic and graded, never compared to an ideal', () => {
  const fitFor = (level: string) =>
    scoreJoke(mk('t', { title_fit: level }), CFG).dims.find(d => d.id === 'title_fit')!.fit;

  it('grades Perfect→Mismatch as 1 / .75 / .5 / .25 / 0', () => {
    expect(fitFor('Perfect')).toBeCloseTo(1, 6);
    expect(fitFor('Strong')).toBeCloseTo(0.75, 6);
    expect(fitFor('Moderate')).toBeCloseTo(0.5, 6);
    expect(fitFor('Weak')).toBeCloseTo(0.25, 6);
    expect(fitFor('Mismatch')).toBeCloseTo(0, 6);
  });

  it('costs exactly its grade off the total', () => {
    expect(scoreJoke(mk('t', { title_fit: 'Weak' }), CFG).trueFit).toBeCloseTo(MAX_FIT - 0.75, 6);
  });
});

describe('makeCustomers — thresholds ~ normal(τ, jitter)', () => {
  it('is reproducible for the same seed', () => {
    const a = makeCustomers(CFG, 42).map(c => c.threshold);
    const b = makeCustomers(CFG, 42).map(c => c.threshold);
    expect(a).toEqual(b);
  });

  it('creates customerCount customers centered on τ with sd ≈ jitter', () => {
    const th = makeCustomers(CFG, 1).map(c => c.threshold);
    expect(th).toHaveLength(CFG.customerCount);
    const mean = th.reduce((a, b) => a + b, 0) / th.length;
    const sd = Math.sqrt(th.reduce((a, b) => a + (b - mean) ** 2, 0) / th.length);
    expect(mean).toBeCloseTo(CFG.tau, 1);
    expect(sd).toBeGreaterThan(CFG.jitter * 0.6);
    expect(sd).toBeLessThan(CFG.jitter * 1.5);
  });

  it('has tails beyond ±jitter (normal, not a hard uniform band)', () => {
    const th = makeCustomers(CFG, 1).map(c => c.threshold);
    expect(th.some(t => t < CFG.tau - CFG.jitter)).toBe(true);
    expect(th.some(t => t > CFG.tau + CFG.jitter)).toBe(true);
    // …but most customers still sit within one sd of τ.
    const within = th.filter(t => Math.abs(t - CFG.tau) <= CFG.jitter).length;
    expect(within).toBeGreaterThan(CFG.customerCount * 0.5);
  });
});

describe('simulateCustomer — buy / skip / swap', () => {
  it('buys an above-threshold joke and debits the budget', () => {
    const [step] = simulateCustomer([mk('A')], CFG, CFG.tau);
    expect(step.verdict).toBe('BUY');
    expect(step.budgetAfter).toBeCloseTo(CFG.budget - CFG.price, 6);
    expect(step.basket).toEqual(['A']);
  });

  it('skips a joke below the customer’s personal bar', () => {
    const [step] = simulateCustomer([worst()], CFG, CFG.tau);
    expect(step.verdict).toBe('SKIP_LOW');
    expect(step.budgetAfter).toBeCloseTo(CFG.budget, 6);
    expect(step.basket).toEqual([]);
  });

  it('respects the personal bar — the same joke sells to a lenient customer but not a strict one', () => {
    const borderline = [DEMO_JOKES[1]]; // ≈7.08
    expect(simulateCustomer(borderline, CFG, 6.8)[0].verdict).toBe('BUY');
    expect(simulateCustomer(borderline, CFG, 7.3)[0].verdict).toBe('SKIP_LOW');
  });

  it('fills the budget then holds when the gain is inside the swap margin', () => {
    // Held jokes are all max fit; the 4th only loses 0.25 (< M = 0.5) → no swap.
    const jokes = [mk('A'), mk('B'), mk('C'), mk('D', { complexity: 'Moderate' })];
    const steps = simulateCustomer(jokes, CFG, CFG.tau);
    expect(steps.map(s => s.verdict)).toEqual(['BUY', 'BUY', 'BUY', 'SKIP_FULL']);
    expect(steps[3].budgetAfter).toBeCloseTo(0, 6);
    expect(steps[3].basket).toEqual(['A', 'B', 'C']);
  });

  it('swaps out the weakest held joke when the gain exceeds the margin', () => {
    // 'A' is the weakest (loses 0.75 on Title Fit); D is a perfect 11, so the
    // gain is 0.75 > M = 0.5 → swap.
    const jokes = [mk('A', { title_fit: 'Weak' }), mk('B'), mk('C'), mk('D')];
    const steps = simulateCustomer(jokes, CFG, CFG.tau);
    expect(steps.map(s => s.verdict)).toEqual(['BUY', 'BUY', 'BUY', 'SWAP']);
    expect(steps[3].returnedJokeId).toBe('A');
    expect([...steps[3].basket].sort()).toEqual(['B', 'C', 'D']);
    expect(steps[3].budgetAfter).toBeCloseTo(0, 6);
  });

  it('never holds more jokes than the budget allows', () => {
    const many = ['A', 'B', 'C', 'D', 'E'].map(id => mk(id));
    const steps = simulateCustomer(many, CFG, CFG.tau);
    expect(steps[steps.length - 1].basket).toHaveLength(CFG.budget / CFG.price);
  });
});

describe('DEMO_JOKES — fits are tuned on purpose (guards against silent drift)', () => {
  it('spans perfect, borderline and far-below-threshold', () => {
    const fits = DEMO_JOKES.map(j => Number(scoreJoke(j, CFG).trueFit.toFixed(2)));
    expect(fits).toEqual([11, 7.08, 10.25, 3.5, 10.25]);
  });

  it('joke #2 sits inside the jitter band so the band decides the sale', () => {
    const f = scoreJoke(DEMO_JOKES[1], CFG).trueFit;
    expect(f).toBeGreaterThan(CFG.tau - CFG.jitter);
    expect(f).toBeLessThan(CFG.tau + CFG.jitter);
  });
});

describe('simulateMarket — jitter produces a partial market, not all-or-nothing', () => {
  const market = simulateMarket(DEMO_JOKES, CFG, 1);

  it('sells the perfect joke to every customer', () => {
    expect(market['1'].bought).toBe(CFG.customerCount);
  });

  it('sells the borderline joke to some but not all', () => {
    const b = market['2'].bought;
    expect(b).toBeGreaterThan(20);
    expect(b).toBeLessThan(CFG.customerCount);
  });

  it('sells the far-below-threshold joke to nobody', () => {
    expect(market['4'].bought).toBe(0);
    expect(market['4'].counts.SKIP_LOW).toBe(CFG.customerCount);
  });

  it('distinguishes bought from still-held (the borderline joke gets swapped out)', () => {
    expect(market['2'].bought).toBeGreaterThan(market['2'].held);
  });
});
