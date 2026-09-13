import { describe, it, expect } from 'vitest';
import {
  scoreJoke,
  simulateCustomer,
  simulateMarket,
  makeCustomers,
  buyFraction,
  DEMO_CONFIG,
  DEMO_JOKES,
  MAX_FIT,
  type DemoJoke,
  type EngineConfig,
} from './aiCustomerDemo';
import { DEFAULT_IDEAL_PROFILE, DIMENSIONS, trueFit } from '../config/dimensions';

const CFG: EngineConfig = { ...DEMO_CONFIG };

/** A joke that matches the ideal on all 11 ideal-bearing dims and nails its title. */
const mk = (id: string, overrides: Record<string, string> = {}): DemoJoke => ({
  id,
  title: `Joke ${id}`,
  text: '…',
  dims: { ...DEFAULT_IDEAL_PROFILE, TITLE_FIT: 'Perfect', ...overrides },
});

/** A joke that misses on nearly everything. */
const worst = () =>
  mk('W', {
    LENGTH: 'Long',
    TOPIC: 'Technology',
    HUMOR_STYLE: 'Absurdity',
    COMPLEXITY: 'Expert',
    EDGINESS: 'Slightly edgy',
    STRUCTURE: 'Short story',
    WORDPLAY: 'None',
    FRESHNESS: 'Time-sensitive',
    SETUP_PAYOFF: 'Very long build',
    CLARITY: 'Reinterpretation',
    ENERGY: 'High-energy',
    TITLE_FIT: 'Mismatch',
  });

describe('scoreJoke — true_fit is a SUM over all 12 dims', () => {
  it('the ideal joke scores the maximum', () => {
    const s = scoreJoke(mk('ideal'), CFG);
    expect(s.trueFit).toBeCloseTo(MAX_FIT, 6);
    expect(s.maxFit).toBe(12); // every dimension is scored — no placeholders
  });

  it('the worst joke scores near zero and lands far below τ', () => {
    const f = scoreJoke(worst(), CFG).trueFit;
    // Only LENGTH (Long↔Medium) and WORDPLAY (None↔Light) are one step away, so
    // they keep half credit each. Everything else is two-plus steps off, or a
    // categorical miss, and the 3-tier rule pays those exactly 0.
    expect(f).toBeCloseTo(1, 6);
    expect(f).toBeLessThan(CFG.tau - CFG.jitter);
  });

  it('lists all 12 dims and counts every one of them in the sum', () => {
    const s = scoreJoke(mk('x'), CFG);
    expect(s.dims).toHaveLength(12);
    expect(s.dims.reduce((a, d) => a + d.fit, 0)).toBeCloseTo(s.trueFit, 6);
    expect(s.passedCount + s.failedCount).toBe(12);
  });

  it('only Length is rule-scored; the other 11 need the LLM', () => {
    const s = scoreJoke(mk('x'), CFG);
    expect(s.dims.filter(d => d.source === 'rule').map(d => d.id)).toEqual(['LENGTH']);
    expect(s.dims.filter(d => d.source === 'llm')).toHaveLength(11);
  });
});

describe('Title Fit — intrinsic and graded, never compared to an ideal', () => {
  const fitFor = (level: string) =>
    scoreJoke(mk('t', { TITLE_FIT: level }), CFG).dims.find(d => d.id === 'TITLE_FIT')!.fit;

  it('grades Perfect→Mismatch as 1 / .75 / .5 / .25 / 0', () => {
    expect(fitFor('Perfect')).toBeCloseTo(1, 6);
    expect(fitFor('Strong')).toBeCloseTo(0.75, 6);
    expect(fitFor('Moderate')).toBeCloseTo(0.5, 6);
    expect(fitFor('Weak')).toBeCloseTo(0.25, 6);
    expect(fitFor('Mismatch')).toBeCloseTo(0, 6);
  });

  it('shows no ideal of its own', () => {
    const row = scoreJoke(mk('t'), CFG).dims.find(d => d.id === 'TITLE_FIT')!;
    expect(row.ideal).toBeNull();
  });

  it('costs exactly its grade off the total', () => {
    expect(scoreJoke(mk('t', { TITLE_FIT: 'Weak' }), CFG).trueFit).toBeCloseTo(MAX_FIT - 0.75, 6);
  });
});

describe('makeCustomers — uniform thresholds', () => {
  it('is reproducible for the same seed', () => {
    const a = makeCustomers(CFG, 42).map(c => c.threshold);
    const b = makeCustomers(CFG, 42).map(c => c.threshold);
    expect(a).toEqual(b);
  });

  it('creates customerCount customers centered on τ', () => {
    const th = makeCustomers(CFG, 1).map(c => c.threshold);
    expect(th).toHaveLength(CFG.customerCount);
    const mean = th.reduce((a, b) => a + b, 0) / th.length;
    expect(mean).toBeCloseTo(CFG.tau, 1);
  });

  it('keeps every threshold inside the uniform band', () => {
    for (const c of makeCustomers(DEMO_CONFIG, 1)) {
      expect(c.threshold).toBeGreaterThanOrEqual(DEMO_CONFIG.tau - DEMO_CONFIG.jitter);
      expect(c.threshold).toBeLessThanOrEqual(DEMO_CONFIG.tau + DEMO_CONFIG.jitter);
    }
  });

  it('spreads thresholds evenly rather than clustering at the centre', () => {
    // The band test above is the real guard against a normal draw — a bell
    // curve puts samples outside [τ−jitter, τ+jitter] and fails it outright.
    // This one rules out a centre-heavy draw that still respects the bounds.
    // The 0.28 threshold is deliberate: at >0.20 a gaussian with sd = jitter
    // passes, so a looser bar here would be decorative.
    const thirds = [0, 0, 0];
    for (const c of makeCustomers(DEMO_CONFIG, 1)) {
      const pos = (c.threshold - (DEMO_CONFIG.tau - DEMO_CONFIG.jitter)) / (2 * DEMO_CONFIG.jitter);
      thirds[Math.min(2, Math.max(0, Math.floor(pos * 3)))] += 1;
    }
    for (const count of thirds) {
      expect(count).toBeGreaterThan(DEMO_CONFIG.customerCount * 0.28);
    }
  });
});

describe('buyFraction — share of a uniform band a fit clears', () => {
  it('is 0 below the band and 1 above it', () => {
    expect(buyFraction(6.5, 7, 0.3)).toBe(0);
    expect(buyFraction(7.5, 7, 0.3)).toBe(1);
  });

  it('is 0.5 exactly at tau', () => {
    expect(buyFraction(7, 7, 0.3)).toBeCloseTo(0.5, 6);
  });

  it('grows linearly across the band', () => {
    expect(buyFraction(6.85, 7, 0.3)).toBeCloseTo(0.25, 6);
    expect(buyFraction(7.15, 7, 0.3)).toBeCloseTo(0.75, 6);
  });

  it('is all-or-nothing when there is no jitter', () => {
    expect(buyFraction(7, 7, 0)).toBe(1);
    expect(buyFraction(6.99, 7, 0)).toBe(0);
  });
});

describe('scoreJoke against the new rubric', () => {
  it('scores a flawless joke the full 12 out of 12', () => {
    const s = scoreJoke(DEMO_JOKES[0], DEMO_CONFIG);
    expect(s.trueFit).toBe(12);
    expect(s.maxFit).toBe(12);
  });

  it('reports one row per dimension, all 12', () => {
    expect(scoreJoke(DEMO_JOKES[0], DEMO_CONFIG).dims).toHaveLength(12);
  });

  it('counts Structure as a real scored dimension', () => {
    const off = {
      ...DEMO_JOKES[0],
      dims: { ...DEMO_JOKES[0].dims, STRUCTURE: 'Short story' },
    };
    expect(scoreJoke(off, DEMO_CONFIG).trueFit).toBe(11);
  });
});

describe('simulateCustomer — buy / skip / swap', () => {
  it('buys an above-threshold joke and debits the budget', () => {
    const [step] = simulateCustomer([mk('A')], CFG, CFG.tau);
    expect(step.verdict).toBe('BUY');
    expect(step.budgetAfter).toBeCloseTo(CFG.budget - CFG.marketPrice, 6);
    expect(step.basket).toEqual(['A']);
  });

  it('skips a joke below the customer’s personal bar', () => {
    const [step] = simulateCustomer([worst()], CFG, CFG.tau);
    expect(step.verdict).toBe('SKIP_LOW');
    expect(step.budgetAfter).toBeCloseTo(CFG.budget, 6);
    expect(step.basket).toEqual([]);
  });

  it('respects the personal bar — the same joke sells to a lenient customer but not a strict one', () => {
    const borderline = [DEMO_JOKES[1]]; // 7.25
    expect(simulateCustomer(borderline, CFG, 6.8)[0].verdict).toBe('BUY');
    expect(simulateCustomer(borderline, CFG, 7.3)[0].verdict).toBe('SKIP_LOW');
  });

  it('fills the budget then holds when the gain is inside the swap margin', () => {
    // Held jokes are all max fit; the 4th only loses 0.25 (< M = 0.5) → no swap.
    const jokes = [mk('A'), mk('B'), mk('C'), mk('D', { TITLE_FIT: 'Strong' })];
    const steps = simulateCustomer(jokes, CFG, CFG.tau);
    expect(steps.map(s => s.verdict)).toEqual(['BUY', 'BUY', 'BUY', 'SKIP_FULL']);
    expect(steps[3].budgetAfter).toBeCloseTo(0, 6);
    expect(steps[3].basket).toEqual(['A', 'B', 'C']);
  });

  it('swaps out the weakest held joke when the gain exceeds the margin', () => {
    // 'A' is the weakest (loses 0.75 on Title Fit); D is a perfect 12, so the
    // gain is 0.75 > M = 0.5 → swap.
    const jokes = [mk('A', { TITLE_FIT: 'Weak' }), mk('B'), mk('C'), mk('D')];
    const steps = simulateCustomer(jokes, CFG, CFG.tau);
    expect(steps.map(s => s.verdict)).toEqual(['BUY', 'BUY', 'BUY', 'SWAP']);
    expect(steps[3].returnedJokeId).toBe('A');
    expect([...steps[3].basket].sort()).toEqual(['B', 'C', 'D']);
    expect(steps[3].budgetAfter).toBeCloseTo(0, 6);
  });

  it('never holds more jokes than the budget allows', () => {
    const many = ['A', 'B', 'C', 'D', 'E'].map(id => mk(id));
    const steps = simulateCustomer(many, CFG, CFG.tau);
    expect(steps[steps.length - 1].basket).toHaveLength(CFG.budget / CFG.marketPrice);
  });
});

describe('DEMO_JOKES — fits are tuned on purpose (guards against silent drift)', () => {
  it('spans flawless, borderline and far-below-threshold', () => {
    const fits = DEMO_JOKES.map(j => scoreJoke(j, CFG).trueFit);
    expect(fits).toEqual([12, 7.25, 11, 0.75, 10.75]);
  });

  it('agrees with the shared trueFit() — the demo must not drift from the rubric', () => {
    // scoreJoke sums its own per-dimension rows so the table and the total can
    // never disagree; this pins that sum to config/dimensions' canonical one.
    for (const j of DEMO_JOKES) {
      expect(scoreJoke(j, CFG).trueFit, j.id).toBeCloseTo(trueFit(j.dims, CFG.ideal), 6);
    }
  });

  it('joke #2 sits inside the jitter band so the band decides the sale', () => {
    const f = scoreJoke(DEMO_JOKES[1], CFG).trueFit;
    expect(f).toBeGreaterThan(CFG.tau - CFG.jitter);
    expect(f).toBeLessThan(CFG.tau + CFG.jitter);
  });
});

describe('demo fixtures use real backend categories', () => {
  it('classifies every joke on all 12 dimensions with valid categories', () => {
    for (const joke of DEMO_JOKES) {
      for (const dim of DIMENSIONS) {
        const level = joke.dims[dim.id];
        expect(level, `${joke.id} is missing ${dim.id}`).toBeTruthy();
        expect(dim.categories, `${joke.id}.${dim.id} = ${level}`).toContain(level);
      }
    }
  });
});

describe('simulateMarket — jitter produces a partial market, not all-or-nothing', () => {
  const market = simulateMarket(DEMO_JOKES, CFG, 1);

  it('sells the flawless joke to every customer', () => {
    expect(market['j1'].bought).toBe(CFG.customerCount);
  });

  it('sells the borderline joke to some but not all', () => {
    const b = market['j2'].bought;
    expect(b).toBeGreaterThan(20);
    expect(b).toBeLessThan(CFG.customerCount);
  });

  it('sells the far-below-threshold joke to nobody', () => {
    expect(market['j4'].bought).toBe(0);
    expect(market['j4'].counts.SKIP_LOW).toBe(CFG.customerCount);
  });

  it('distinguishes bought from still-held (the borderline joke gets swapped out)', () => {
    expect(market['j2'].bought).toBeGreaterThan(market['j2'].held);
  });
});
