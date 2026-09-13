/* ============================================================================
   AI Customer Engine — illustration model (instructor-facing demo).

   This is NOT the production engine. It is a faithful, self-contained mirror of
   the backend spec in REFACTOR_PLAN.md, so the instructor can SEE how the AI
   customers decide — and so it doubles as a visual spec for the real backend.

   What it mirrors (REFACTOR_PLAN §1–§3):
   1. Every published joke is classified on 12 dimensions. Length is computed by
      rule; the other 11 come from one LLM call per batch. Structure is an
      undefined placeholder that contributes 0, so true_fit lands in [0, 11].
   2. dim_fit vs the round's hidden ideal profile:
        - ordinal dims  → 1 − |joke_pos − ideal_pos|
        - categorical   → 1 on an exact match, else 0
        - Title Fit     → intrinsic, graded 1 / .75 / .5 / .25 / 0
      true_fit = the SUM of those dim fits (not an average).
   3. Every customer shares that one ideal, but gets a personal bar drawn from a
      NORMAL distribution centered on τ (jitter = standard deviation). Most bars
      sit near τ; the tails are rare. Same taste, spread standards — which is why
      a joke near τ sells to some customers and not others.
   4. Buy when true_fit ≥ that customer's bar and budget remains.
   5. Out of budget → swap only if the new joke beats the weakest held joke by
      more than the swap margin M. The threshold always applies.
============================================================================ */

import {
  SCORED_DIMENSIONS,
  DIMENSIONS,
  PLACEHOLDER_DIMS,
  IDEAL_PROFILE,
  dimProx,
} from '../config/dimensions';

/** Dims the backend scores with code instead of an LLM (REFACTOR_PLAN §1). */
export const RULE_DIMS = new Set<string>(['length']);

/** Highest reachable true_fit — one point per scored dim. */
export const MAX_FIT = SCORED_DIMENSIONS.length;

export interface DemoJoke {
  id: string;
  title: string;
  text: string;
  /** Assigned level per dimension id (must cover all dims). */
  levels: Record<string, string>;
}

export interface EngineConfig {
  ideal: Record<string, string>;
  /** τ — base true_fit bar to buy (0..MAX_FIT). */
  tau: number;
  /** Standard deviation of the per-customer threshold, which is normal(τ, jitter). */
  jitter: number;
  /** M — how far a new joke must beat the weakest held joke to trigger a swap. */
  swapMargin: number;
  /** How many AI customers are in the market. */
  customerCount: number;
  /** Per-dimension fit bar for the Good/Improve feedback split. */
  perDimBar: number;
  /** Customer budget in dollars. */
  budget: number;
  /** Price per joke in dollars. */
  price: number;
}

export interface DimScore {
  id: string;
  label: string;
  source: 'rule' | 'llm';
  level: string;
  ideal: string;
  fit: number;
  pass: boolean;
  /** Structure: defined but unscored — contributes 0 and is excluded from true_fit. */
  placeholder: boolean;
}

export interface JokeScore {
  /** Sum of dim fits, 0..maxFit. */
  trueFit: number;
  maxFit: number;
  dims: DimScore[];
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
  /** τ ± jitter, fixed for the whole round. */
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

/** Seeded standard normal (mean 0, sd 1) via Box–Muller. Deterministic. */
export function gaussian(seed: number): number {
  const u1 = Math.min(1 - 1e-9, Math.max(1e-9, rand01(seed)));
  const u2 = rand01(seed + 0.5);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Normal PDF — used by the Customer page to draw the threshold bell curve. */
export function normalPdf(x: number, mean: number, sd: number): number {
  const z = (x - mean) / sd;
  return Math.exp(-0.5 * z * z) / (sd * Math.sqrt(2 * Math.PI));
}

/**
 * Build the round's customers. Each personal bar is drawn from a NORMAL
 * distribution centered on τ, with `jitter` as the standard deviation — so most
 * customers sit near τ and the tails are rare. Same taste, spread standards.
 */
export function makeCustomers(cfg: EngineConfig, seed = 1): AiCustomer[] {
  return Array.from({ length: cfg.customerCount }, (_, i) => ({
    id: i + 1,
    threshold: cfg.tau + gaussian(seed + i * 7.7) * cfg.jitter,
    budget: cfg.budget,
  }));
}

/** Score one joke against the ideal profile. true_fit = sum of dim fits. */
export function scoreJoke(joke: DemoJoke, cfg: EngineConfig): JokeScore {
  const dims: DimScore[] = DIMENSIONS.map(dim => {
    const level = joke.levels[dim.id] ?? '';
    const placeholder = PLACEHOLDER_DIMS.has(dim.id);
    // dimProx handles the intrinsic (Title Fit) and categorical cases itself.
    const fit = placeholder ? 0 : dimProx(dim, level);
    return {
      id: dim.id,
      label: dim.label,
      source: RULE_DIMS.has(dim.id) ? 'rule' : 'llm',
      level,
      ideal: placeholder ? '—' : (cfg.ideal[dim.id] ?? ''),
      fit,
      pass: !placeholder && fit >= cfg.perDimBar,
      placeholder,
    };
  });

  // Placeholders are listed for display but never counted.
  const scored = dims.filter(d => !d.placeholder);
  const trueFit = scored.reduce((sum, d) => sum + d.fit, 0);

  return {
    trueFit,
    maxFit: MAX_FIT,
    dims,
    passedCount: scored.filter(d => d.pass).length,
    failedCount: scored.filter(d => !d.pass).length,
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
    } else if (budget >= cfg.price) {
      verdict = 'BUY';
      held.push({ id: joke.id, fit: score.trueFit });
      budget -= cfg.price;
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
        budget += cfg.price; // return the weaker joke
        held.splice(weakestIdx, 1);
        held.push({ id: joke.id, fit: score.trueFit });
        budget -= cfg.price; // buy this one
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
 * sitting near τ is bought by roughly two thirds of the market, not all-or-nothing.
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

/* ---- Demo data: one batch of 5 sample jokes with assigned dim levels ---- */

export const DEMO_CONFIG: EngineConfig = {
  ideal: IDEAL_PROFILE,
  tau: 7,
  jitter: 0.3,
  swapMargin: 0.5,
  customerCount: 100,
  perDimBar: 0.75,
  budget: 3.0,
  price: 1.0,
};

/** Build a joke whose levels default to the ideal, with a few dims overridden. */
function joke(id: string, title: string, text: string, overrides: Record<string, string>): DemoJoke {
  return { id, title, text, levels: { ...IDEAL_PROFILE, ...overrides } };
}

/* The batch is tuned so the demo shows the whole range:
   #1 a perfect 11, #2 a borderline ~7 (the jitter story), #3 strong,
   #4 far below τ, #5 strong-but-blocked-by-budget. */
export const DEMO_JOKES: DemoJoke[] = [
  joke('1', 'Perfect office pun', 'Why did the spreadsheet go to therapy? It had too many unresolved cells.', {
    // identical to ideal → the maximum fit
  }),
  joke('2', 'Anti-gravity book', "I'm reading a book about anti-gravity. It's impossible to put down.", {
    // Tuned to land just above τ=7 so the ±0.3 jitter band decides the sale.
    topic: 'Everyday',          // categorical miss  −1
    humor_style: 'Observational', // categorical miss −1
    wordplay: 'Light',          // −0.67
    setup_payoff: 'Immediate',  // −0.25
    clarity: 'Mostly clear',    // −0.25
    title_fit: 'Strong',        // −0.25
    complexity: 'Moderate',     // −0.25
    energy: 'Animated',         // −0.25
  }),
  joke('3', 'Scarecrow award', 'Why did the scarecrow win an award? Because he was outstanding in his field.', {
    complexity: 'Moderate',
    energy: 'Animated',
    title_fit: 'Strong',
  }),
  joke('4', 'Rambling AI rant', "So I asked an AI to write me a joke and it gave me a 600-word essay on the socioeconomic implications of humor in late-stage capitalism, which, honestly, was not funny at all.", {
    length: 'Long',
    topic: 'AI',
    humor_style: 'Observational',
    complexity: 'Expert',
    wordplay: 'None',
    setup_payoff: 'Very long build',
    clarity: 'Ambiguous',
    energy: 'High-energy',
    title_fit: 'Weak',
  }),
  joke('5', 'Math book blues', 'Why did the math book look sad? Because it had too many problems.', {
    complexity: 'Very simple',
    title_fit: 'Moderate',
  }),
];
