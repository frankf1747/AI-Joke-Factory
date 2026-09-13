/* ============================================================================
   AI Customer Engine — illustration model (instructor-facing demo).

   This is NOT the production engine. It is a faithful, self-contained mirror of
   the Go backend, so the instructor can SEE how the AI customers decide — and
   so it doubles as a visual spec for that backend.

   What it mirrors:
   1. Every published joke is classified on 12 dimensions. Length is computed by
      rule; the other 11 come from one LLM call per batch. All 12 are scored, so
      true_fit lands in [0, 12].
   2. dim_fit vs the round's hidden ideal profile — see config/dimensions.ts,
      which is the single source of truth for the rubric:
        - ordinal     → 1 exact, 0.5 one step away, 0 beyond (a cliff, not a ramp)
        - categorical → 1 on an exact match, else 0
        - Title Fit   → intrinsic, graded 1 / .75 / .5 / .25 / 0
      true_fit = the SUM of those dim fits (not an average).
   3. Every customer shares that one ideal, but gets a personal bar drawn
      UNIFORMLY from [τ − jitter, τ + jitter], matching the backend's
      `jitter := (rng.Float64()*2 - 1) * round.Jitter`. Same taste, evenly
      spread standards — which is why a joke near τ sells to some and not others.
   4. Buy when true_fit ≥ that customer's bar and budget remains.
   5. Out of budget → swap only if the new joke beats the weakest held joke by
      more than the swap margin M. The threshold always applies.
============================================================================ */

import {
  DIMENSIONS,
  MAX_FIT,
  dimFit,
  DEFAULT_IDEAL_PROFILE,
  type Classification,
  type IdealProfile,
} from '../config/dimensions';

export { MAX_FIT };

/** Dims the backend scores with code instead of an LLM. */
export const RULE_DIMS = new Set<string>(['LENGTH']);

export interface DemoJoke {
  id: string;
  text: string;
  title: string;
  /** Classified category per dimension, keyed by backend dimension id. */
  dims: Classification;
}

export interface EngineConfig {
  /** τ — base true_fit bar to buy (0..MAX_FIT). */
  tau: number;
  /** Half-width of the uniform threshold band. */
  jitter: number;
  /** M — how far a new joke must beat the weakest held joke to trigger a swap. */
  swapMargin: number;
  customerCount: number;
  /** Per-dimension fit bar for the Good/Improve feedback split. */
  perDimBar: number;
  budget: number;
  marketPrice: number;
  ideal: IdealProfile;
}

export interface DimScore {
  id: string;
  label: string;
  /** Keep this name — views/Customer.tsx renders a Rule/LLM badge from it. */
  source: 'rule' | 'llm';
  level: string;
  ideal: string;
  fit: number;
  pass: boolean;
}

export interface JokeScore {
  joke: DemoJoke;
  dims: DimScore[];
  /** Sum of dim fits, 0..maxFit. */
  trueFit: number;
  maxFit: number;
  passedCount: number;
  failedCount: number;
}

export type Verdict = 'BUY' | 'SKIP_LOW' | 'SWAP' | 'SKIP_FULL';

export interface DecisionStep {
  joke: DemoJoke;
  score: JokeScore;
  verdict: Verdict;
  /** Joke id returned to make room (SWAP only). */
  returnedJokeId?: string;
  budgetBefore: number;
  budgetAfter: number;
  /** Held joke ids after this step. */
  basket: string[];
  /** Plain-English narration of the decision. */
  note: string;
}

export interface AiCustomer {
  id: number;
  /** Drawn uniformly from [τ − jitter, τ + jitter], fixed for the whole round. */
  threshold: number;
  budget: number;
}

/**
 * Deterministic 0..1 from an integer. Seeded on purpose: Math.random() would
 * reshuffle every customer's bar on each React re-render (and make tests flaky).
 * Same trick as the seeded reveal in QualityControl.
 */
export function rand01(seed: number): number {
  const x = Math.sin(seed * 99.13) * 10000;
  return x - Math.floor(x);
}

/**
 * Build the round's customers. Each personal bar is drawn UNIFORMLY from
 * [τ − jitter, τ + jitter] — the backend's model:
 *   jitter := (rng.Float64()*2 - 1) * round.Jitter
 * Same taste, evenly spread standards.
 */
export function makeCustomers(cfg: EngineConfig, seed = 1): AiCustomer[] {
  return Array.from({ length: cfg.customerCount }, (_, i) => ({
    id: i + 1,
    threshold: cfg.tau + (rand01(seed + i * 7.7) * 2 - 1) * cfg.jitter,
    budget: cfg.budget,
  }));
}

/**
 * Share of a uniform threshold band that a given true_fit clears — i.e. the
 * fraction of customers interested, before budget. Used to draw the band.
 */
export function buyFraction(fit: number, tau: number, jitter: number): number {
  if (jitter <= 0) return fit >= tau ? 1 : 0;
  const lo = tau - jitter;
  return Math.max(0, Math.min(1, (fit - lo) / (2 * jitter)));
}

/** Score one joke against the ideal profile. true_fit = sum of all 12 dim fits. */
export function scoreJoke(joke: DemoJoke, cfg: EngineConfig): JokeScore {
  const dims: DimScore[] = DIMENSIONS.map(d => {
    const level = joke.dims[d.id] ?? '';
    const ideal = d.hasIdeal ? (cfg.ideal[d.id] ?? '') : '';
    const fit = dimFit(d.id, ideal, level);
    return {
      id: d.id,
      label: d.label,
      source: d.classifiedBy === 'code' ? 'rule' : 'llm',
      level,
      ideal: d.hasIdeal ? ideal : '—',
      fit,
      pass: fit >= cfg.perDimBar,
    };
  });

  const sum = dims.reduce((acc, d) => acc + d.fit, 0);

  return {
    joke,
    dims,
    trueFit: Math.round(sum * 100) / 100,
    maxFit: MAX_FIT,
    passedCount: dims.filter(d => d.pass).length,
    failedCount: dims.filter(d => !d.pass).length,
  };
}

const f2 = (n: number) => n.toFixed(2);

/**
 * Run ONE customer over a batch of jokes, returning the ordered decision steps.
 * Pure: same inputs → same output.
 */
export function simulateCustomer(
  jokes: DemoJoke[],
  cfg: EngineConfig,
  customerThreshold: number = cfg.tau,
): DecisionStep[] {
  const steps: DecisionStep[] = [];
  // Held jokes: id + fit, so we can find the weakest for a swap.
  const held: Array<{ id: string; fit: number }> = [];
  let budget = cfg.budget;

  for (const joke of jokes) {
    const score = scoreJoke(joke, cfg);
    const budgetBefore = budget;
    let verdict: Verdict;
    let returnedJokeId: string | undefined;
    let note: string;

    if (score.trueFit < customerThreshold) {
      verdict = 'SKIP_LOW';
      note = `Fit ${f2(score.trueFit)} is below this customer's bar of ${f2(customerThreshold)} — not interested.`;
    } else if (budget >= cfg.marketPrice) {
      verdict = 'BUY';
      held.push({ id: joke.id, fit: score.trueFit });
      budget -= cfg.marketPrice;
      note = `Fit ${f2(score.trueFit)} clears the bar of ${f2(customerThreshold)} and budget remains — buy. Budget $${f2(budgetBefore)}→$${f2(budget)}.`;
    } else {
      // Out of budget: swap only if it beats the weakest held joke by MORE than M.
      let weakestIdx = 0;
      for (let i = 1; i < held.length; i++) {
        if (held[i].fit < held[weakestIdx].fit) weakestIdx = i;
      }
      const weakest = held[weakestIdx];
      if (weakest && score.trueFit > weakest.fit + cfg.swapMargin) {
        verdict = 'SWAP';
        returnedJokeId = weakest.id;
        budget += cfg.marketPrice; // return the weaker joke
        held.splice(weakestIdx, 1);
        held.push({ id: joke.id, fit: score.trueFit });
        budget -= cfg.marketPrice; // buy this one
        note = `Budget full, but ${f2(score.trueFit)} beats held joke #${weakest.id} (${f2(weakest.fit)}) by more than the ${cfg.swapMargin} margin — return #${weakest.id}, buy this.`;
      } else {
        verdict = 'SKIP_FULL';
        const gap = weakest ? ` It only beats the weakest held (${f2(weakest.fit)}) by ${f2(score.trueFit - weakest.fit)}, within the ${cfg.swapMargin} margin.` : '';
        note = `Fit ${f2(score.trueFit)} clears the bar, but budget is full.${gap} Hold.`;
      }
    }

    steps.push({
      joke,
      score,
      verdict,
      returnedJokeId,
      budgetBefore,
      budgetAfter: budget,
      basket: held.map(h => h.id),
      note,
    });
  }

  return steps;
}

export interface JokeMarketResult {
  jokeId: string;
  trueFit: number;
  /** Customers who purchased it at any point (a sale happened) — BUY or swap-in. */
  bought: number;
  /** Customers still holding it at the end of the batch (bought minus swapped out). */
  held: number;
  counts: Record<Verdict, number>;
}

/**
 * Run every customer over the batch. This is what makes jitter visible: a joke
 * sitting near τ is bought by part of the market, not all-or-nothing.
 *
 * `bought` and `held` differ on purpose — a joke can sell to everyone and then be
 * swapped back out when a better one arrives later in the batch.
 */
export function simulateMarket(
  jokes: DemoJoke[],
  cfg: EngineConfig,
  seed = 1,
): Record<string, JokeMarketResult> {
  const customers = makeCustomers(cfg, seed);
  const out: Record<string, JokeMarketResult> = {};
  for (const j of jokes) {
    out[j.id] = {
      jokeId: j.id,
      trueFit: scoreJoke(j, cfg).trueFit,
      bought: 0,
      held: 0,
      counts: { BUY: 0, SKIP_LOW: 0, SWAP: 0, SKIP_FULL: 0 },
    };
  }

  for (const c of customers) {
    const steps = simulateCustomer(jokes, cfg, c.threshold);
    for (const s of steps) {
      out[s.joke.id].counts[s.verdict] += 1;
      if (s.verdict === 'BUY' || s.verdict === 'SWAP') out[s.joke.id].bought += 1;
    }
    const finalBasket = steps.length ? steps[steps.length - 1].basket : [];
    for (const id of finalBasket) out[id].held += 1;
  }

  return out;
}

/* ---- Demo data: one batch of 5 sample jokes with assigned categories ---- */

export const DEMO_CONFIG: EngineConfig = {
  tau: 7,
  jitter: 0.3,
  swapMargin: 0.5,
  customerCount: 100,
  perDimBar: 0.75,
  budget: 3,
  marketPrice: 1,
  ideal: DEFAULT_IDEAL_PROFILE,
};

/* The batch is tuned to show the whole range under the 3-tier rule:
   #1 a flawless 12, #2 a borderline 7.25 (the jitter story), #3 a strong 11,
   #4 a 0.75 that nobody touches, #5 strong-but-blocked-by-budget. */
export const DEMO_JOKES: DemoJoke[] = [
  {
    id: 'j1',
    title: 'The Self-Starter',
    text: 'I told my boss I needed a raise because three companies were after me. He asked which ones. I said the electric company, the gas company, and the water company.',
    dims: { ...DEFAULT_IDEAL_PROFILE, TITLE_FIT: 'Perfect' },
  },
  {
    id: 'j2',
    // 1 + 1 + 0 + 0.5 + 1 + 0 + 0.5 + 0.5 + 0.5 + 0.5 + 1 + 0.75 = 7.25
    title: 'Anti-Gravity',
    text: "I'm reading a book about anti-gravity at my desk. It's impossible to put down, which is why the quarterly report is late.",
    dims: {
      LENGTH: 'Medium',
      TOPIC: 'Work',
      HUMOR_STYLE: 'Pun',
      COMPLEXITY: 'Simple',
      EDGINESS: 'Clean',
      STRUCTURE: 'One-liner',
      WORDPLAY: 'Moderate',
      FRESHNESS: 'Slightly current',
      SETUP_PAYOFF: 'Quick',
      CLARITY: 'Mostly clear',
      ENERGY: 'Conversational',
      TITLE_FIT: 'Strong',
    },
  },
  {
    id: 'j3',
    // 12 − 0.5 (Complexity) − 0.5 (Title Fit) = 11
    title: 'Scarecrow of the Year',
    text: 'My colleague won an award for being outstanding in his field. He is a scarecrow, and frankly the competition was thin.',
    dims: { ...DEFAULT_IDEAL_PROFILE, COMPLEXITY: 'Thoughtful', TITLE_FIT: 'Moderate' },
  },
  {
    id: 'j4',
    // 0.5 (Length adjacent) + 0.25 (Title Fit Weak) = 0.75
    title: 'Thoughts',
    text: 'Consider, if you will, the profound and frankly upsetting possibility that every single spreadsheet ever opened in the history of this company has been quietly judging us all, row by row, column by column, waiting patiently for the day it finally decides to speak, and when it does, it will simply say: recalculate.',
    dims: {
      LENGTH: 'Long',
      TOPIC: 'Technology',
      HUMOR_STYLE: 'Absurdity',
      COMPLEXITY: 'Expert',
      EDGINESS: 'Slightly edgy',
      STRUCTURE: 'Short story',
      WORDPLAY: 'Heavy',
      FRESHNESS: 'Time-sensitive',
      SETUP_PAYOFF: 'Very long build',
      CLARITY: 'Ambiguous',
      ENERGY: 'High-energy',
      TITLE_FIT: 'Weak',
    },
  },
  {
    id: 'j5',
    // 12 − 0.5 (Wordplay) − 0.5 (Clarity) − 0.25 (Title Fit) = 10.75
    title: 'Math Book Blues',
    text: 'The new hire asked why the math book looked so sad. I said it had too many problems, and then I gave it a project plan.',
    dims: {
      ...DEFAULT_IDEAL_PROFILE,
      WORDPLAY: 'Moderate',
      CLARITY: 'Mostly clear',
      TITLE_FIT: 'Strong',
    },
  },
];
