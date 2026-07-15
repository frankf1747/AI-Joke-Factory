/* ============================================================================
   AI Customer Engine — illustration model (instructor-facing demo).

   This is NOT the production engine. It's a faithful, self-contained simulation
   of the backend behaviour so the instructor can SEE how an AI customer decides,
   and so it can serve as a visual spec for the real backend (Hussain).

   The behaviour it illustrates:
   1. Customers process jokes in batches of 5.
   2. Each joke is scored per dimension:
        - rule-based dims (length, topic) — deterministic / QC-classifiable
        - LLM-inferred dims (everything else)
      Each dim yields a 0..1 fit vs the hidden ideal profile; the overall score
      is the weighted average of dim fits.
   3. Buy if overall score >= threshold AND budget remains.
   4. If out of budget but this joke beats the weakest held joke, RETURN the
      weaker one and buy this one (a swap).
   5. Per joke, the engine knows the overall score + which dims passed/failed.
      (Marketing never sees this detail — only obscured class-level trends.)
============================================================================ */

import { DIMENSIONS, CATEGORICAL_DIMS, IDEAL_PROFILE, type DimensionDef } from '../config/dimensions';

/** Dims the backend can score with rules instead of an LLM. */
export const RULE_DIMS = new Set<string>(['length', 'topic']);

export interface DemoJoke {
  id: string;
  title: string;
  text: string;
  /** Assigned level per dimension id (must cover all dims). */
  levels: Record<string, string>;
}

export interface EngineConfig {
  ideal: Record<string, string>;
  /** Overall-score bar to buy at all. */
  threshold: number;
  /** Per-dimension fit bar for the pass/fail check (display + spec). */
  perDimBar: number;
  /** Customer budget in dollars. */
  budget: number;
  /** Price per joke in dollars. */
  price: number;
  /** Optional per-dim weights (defaults to equal). */
  weights?: Record<string, number>;
}

export interface DimScore {
  id: string;
  label: string;
  source: 'rule' | 'llm';
  level: string;
  ideal: string;
  fit: number;
  pass: boolean;
}

export interface JokeScore {
  overall: number;
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

/** Proximity of `level` to `idealLevel` on a dimension. 1 = exact, 0 = furthest. */
export function prox(dim: DimensionDef, level: string, idealLevel: string): number {
  const lv = dim.levels.indexOf(level);
  const il = dim.levels.indexOf(idealLevel);
  if (lv < 0 || il < 0) return 0;
  if (CATEGORICAL_DIMS.has(dim.id)) return lv === il ? 1 : 0;
  return 1 - Math.abs(lv - il) / Math.max(1, dim.levels.length - 1);
}

/** Score one joke against the ideal profile. */
export function scoreJoke(joke: DemoJoke, cfg: EngineConfig): JokeScore {
  const dims: DimScore[] = DIMENSIONS.map(dim => {
    const level = joke.levels[dim.id] ?? '';
    const ideal = cfg.ideal[dim.id] ?? '';
    const fit = prox(dim, level, ideal);
    return {
      id: dim.id,
      label: dim.label,
      source: RULE_DIMS.has(dim.id) ? 'rule' : 'llm',
      level,
      ideal,
      fit,
      pass: fit >= cfg.perDimBar,
    };
  });

  let wsum = 0;
  let wtot = 0;
  for (const d of dims) {
    const w = cfg.weights?.[d.id] ?? 1;
    wsum += d.fit * w;
    wtot += w;
  }
  const overall = wtot > 0 ? wsum / wtot : 0;

  return {
    overall,
    dims,
    passedCount: dims.filter(d => d.pass).length,
    failedCount: dims.filter(d => !d.pass).length,
  };
}

/**
 * Run one customer over a batch of jokes, returning the ordered decision steps.
 * Pure: same inputs → same output. The UI animates over these steps.
 */
export function simulateCustomer(jokes: DemoJoke[], cfg: EngineConfig): DecisionStep[] {
  const steps: DecisionStep[] = [];
  // Held jokes: id + score, so we can find the weakest for a swap.
  const held: Array<{ id: string; score: number }> = [];
  let budget = cfg.budget;

  for (const joke of jokes) {
    const score = scoreJoke(joke, cfg);
    const budgetBefore = budget;
    let verdict: Verdict;
    let returnedJokeId: string | undefined;
    let note: string;

    const pct = (n: number) => `${Math.round(n * 100)}%`;

    if (score.overall < cfg.threshold) {
      verdict = 'SKIP_LOW';
      note = `Score ${pct(score.overall)} is below the ${pct(cfg.threshold)} threshold — skip.`;
    } else if (budget >= cfg.price) {
      verdict = 'BUY';
      held.push({ id: joke.id, score: score.overall });
      budget -= cfg.price;
      note = `Score ${pct(score.overall)} ≥ ${pct(cfg.threshold)} and budget available — buy. Budget $${budgetBefore.toFixed(2)}→$${budget.toFixed(2)}.`;
    } else {
      // Out of budget: swap only if strictly better than the weakest held joke.
      let weakestIdx = 0;
      for (let i = 1; i < held.length; i++) {
        if (held[i].score < held[weakestIdx].score) weakestIdx = i;
      }
      const weakest = held[weakestIdx];
      if (weakest && score.overall > weakest.score) {
        verdict = 'SWAP';
        returnedJokeId = weakest.id;
        budget += cfg.price; // return the weaker joke
        held.splice(weakestIdx, 1);
        held.push({ id: joke.id, score: score.overall });
        budget -= cfg.price; // buy this one
        note = `Budget full, but ${pct(score.overall)} beats held joke #${weakest.id} (${pct(weakest.score)}) — return #${weakest.id}, buy this.`;
      } else {
        verdict = 'SKIP_FULL';
        note = `Score ${pct(score.overall)} clears the threshold, but budget is full and it doesn't beat any held joke — skip.`;
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

/* ---- Demo data: one batch of 5 sample jokes with assigned dim levels ---- */

export const DEMO_CONFIG: EngineConfig = {
  ideal: IDEAL_PROFILE,
  threshold: 0.7,
  perDimBar: 0.6,
  budget: 3.0,
  price: 1.0,
};

/** Build a joke whose levels default to the ideal, with a few dims overridden. */
function joke(id: string, title: string, text: string, overrides: Record<string, string>): DemoJoke {
  return { id, title, text, levels: { ...IDEAL_PROFILE, ...overrides } };
}

export const DEMO_JOKES: DemoJoke[] = [
  joke('1', 'Perfect office pun', 'Why did the spreadsheet go to therapy? It had too many unresolved cells.', {
    // identical to ideal → ~100%
  }),
  joke('2', 'Anti-gravity book', "I'm reading a book about anti-gravity. It's impossible to put down.", {
    topic: 'Everyday',
    wordplay: 'Light',
    setup_payoff: 'Immediate',
  }),
  joke('3', 'Scarecrow award', 'Why did the scarecrow win an award? Because he was outstanding in his field.', {
    complexity: 'Moderate',
    energy: 'Animated',
  }),
  joke('4', 'Rambling AI rant', "So I asked an AI to write me a joke and it gave me a 600-word essay on the socioeconomic implications of humor in late-stage capitalism, which, honestly, was not funny at all.", {
    length: 'Long',
    topic: 'AI',
    humor_style: 'Observational',
    complexity: 'Expert',
    structure: 'Short story',
    wordplay: 'None',
    setup_payoff: 'Very long build',
    clarity: 'Ambiguous',
    energy: 'High-energy',
  }),
  joke('5', 'Math book blues', 'Why did the math book look sad? Because it had too many problems.', {
    complexity: 'Very simple',
  }),
];
