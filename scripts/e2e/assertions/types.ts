/**
 * The oracle's vocabulary: what an assertion is handed, and what it hands back.
 *
 * EVERY ASSERTION IS A PURE FUNCTION OF `Evidence`. Not one of them makes a
 * request. The orchestrator gathers the whole round's observations once, and
 * the assertions only read them. That split is deliberate and it is the thing
 * that makes this layer trustworthy:
 *
 *   - An assertion cannot change what it is measuring. A check that re-reads
 *     the market board is a check whose result depends on when it ran relative
 *     to the other checks, and the async pipeline this suite exists to test
 *     makes that difference real.
 *   - A failing run can be re-judged without touching the backend. report.json
 *     carries the Evidence, so "why did assertion 6 fail" is answerable from the
 *     artifact at 9am rather than only from a second destructive run at 2am.
 *   - Adding a claim never adds a request, so the oracle cannot become the
 *     reason a round times out.
 *
 * A FAILURE MUST NAME A CAUSE. `summary` says what was observed; `diagnosis`
 * says what is most likely wrong and where to look. "expected 12, got 11" is
 * not a diagnosis — it is the thing the reader already knows by the time they
 * are reading it.
 */

import type {
  FeedbackJoke,
  InstructorRound,
  MarketItem,
  RoundStatus,
} from '../../../types/api';
import type { TeamOutcome, TeamRoster } from '../harness/class';
import type { TeamBatchesBody, TeamSummaryBody } from '../harness/client';
import type { WaitTimings } from '../harness/wait';

/* ===========================================================================
   Evidence
=========================================================================== */

/** One observed round status, in the order the run saw it. Recorded rather
 *  than re-read, because CONFIGURED is gone the moment start succeeds. */
export interface LifecycleEvent {
  status: RoundStatus;
  /** ISO timestamp — the artifact is read by humans, not only by code. */
  at: string;
  /** Which call produced this observation, e.g. `POST .../start`. */
  source: string;
}

/**
 * What one team's feedback panel settled to, and how long it took.
 *
 * `classificationMs` is the elapsed time of the wait, which is the closest
 * thing to classification latency any endpoint exposes — joke_fit is never
 * served and the classification job row is internal, so the feedback panel
 * filling is the only external evidence the worker ran at all.
 */
export interface TeamConvergence {
  teamNumber: number;
  teamId: number;
  jokes: FeedbackJoke[];
  classificationMs: number;
  polls: number;
  timedOut: boolean;
  /** The waiter's last `observed` line — already phrased as a fact. */
  observed: string;
  error: string | null;
}

export interface SalesWait {
  elapsedMs: number;
  timedOut: boolean;
  observed: string;
  /** Set when the wait was deliberately shortened because classification
   *  latency already looked like the stub. */
  shortenedBecause: string | null;
}

export interface TeamSummaryRecord {
  teamNumber: number;
  teamId: number;
  summary: TeamSummaryBody | null;
  error: string | null;
}

export interface TeamBatchesRecord {
  teamNumber: number;
  teamId: number;
  body: TeamBatchesBody | null;
  error: string | null;
}

/** Everything one run observed. Assembled once by run.ts, read by every
 *  assertion, and serialised whole into report.json. */
export interface Evidence {
  roundId: number;
  /** The instructor projection, read after start — it is the only one that
   *  carries batch_size, the costs and feedback_joke_count together. */
  round: InstructorRound;
  lifecycle: LifecycleEvent[];
  teamCount: number;
  perTeam: number;
  roster: TeamRoster[];
  outcomes: TeamOutcome[];
  /** Spread between the first and last team's first request, in ms. The proof
   *  the concurrent phase really was concurrent. */
  startSpreadMs: number;
  convergence: TeamConvergence[];
  market: MarketItem[];
  marketError: string | null;
  salesWait: SalesWait | null;
  summaries: TeamSummaryRecord[];
  batches: TeamBatchesRecord[];
  timings: WaitTimings;
}

/* ===========================================================================
   Results
=========================================================================== */

/** Grouping for the terminal report. One layer per kind of claim. */
export type AssertionLayer =
  | 'lifecycle'
  | 'ingest'
  | 'concurrency'
  | 'async pipeline'
  | 'economics'
  | 'classifier';

/**
 * `check` is a claim with a right answer. `judgment` is a claim whose answer is
 * a reading of several numbers at once — it still passes or fails, but the
 * numbers are the point and the report prints them either way.
 */
export type AssertionKind = 'check' | 'judgment';

export interface AssertionResult {
  /** Stable claim number, so a failing run can be discussed by number. */
  id: number;
  name: string;
  layer: AssertionLayer;
  kind: AssertionKind;
  ok: boolean;
  /** One line: what was observed. */
  summary: string;
  /** Required when `ok` is false: the likely cause, named, with somewhere to
   *  look next. */
  diagnosis?: string;
  /** Lines worth printing even on a pass — caveats, coverage gaps, readings. */
  notes?: string[];
  /** The numbers behind the verdict. Written to report.json verbatim. */
  data?: Record<string, unknown>;
}

export type Assertion = (evidence: Evidence) => AssertionResult;

/* ===========================================================================
   Construction helpers
=========================================================================== */

export interface ResultSpec {
  id: number;
  name: string;
  layer: AssertionLayer;
  kind?: AssertionKind;
  summary: string;
  notes?: string[];
  data?: Record<string, unknown>;
}

export function pass(spec: ResultSpec): AssertionResult {
  return { kind: 'check', ...spec, ok: true };
}

export function fail(spec: ResultSpec & { diagnosis: string }): AssertionResult {
  return { kind: 'check', ...spec, ok: false };
}

/* ===========================================================================
   Small shared arithmetic

   Kept here rather than duplicated in three assertion files, and kept dumb:
   population statistics over a handful of values, with no interpolation and no
   library. A figure in this report must be traceable to a value that actually
   occurred.
=========================================================================== */

export interface Spread {
  n: number;
  min: number;
  max: number;
  mean: number;
  /** Population standard deviation — the whole class is the population here,
   *  not a sample of one. */
  stdev: number;
  /** How many DIFFERENT values occurred. The blunt instrument that catches a
   *  classifier returning a constant, which a stdev near zero also catches but
   *  less legibly. */
  distinct: number;
}

export function spreadOf(values: readonly number[]): Spread {
  const n = values.length;
  if (n === 0) return { n: 0, min: NaN, max: NaN, mean: NaN, stdev: NaN, distinct: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  return {
    n,
    min: Math.min(...values),
    max: Math.max(...values),
    mean,
    stdev: Math.sqrt(variance),
    distinct: new Set(values).size,
  };
}

export function describeSpread(s: Spread): string {
  if (s.n === 0) return 'no values';
  return (
    `n=${s.n} min=${s.min} max=${s.max} mean=${s.mean.toFixed(2)} ` +
    `stdev=${s.stdev.toFixed(2)} distinct=${s.distinct}`
  );
}

/** Teams that got far enough to be worth judging. A team that died at `submit`
 *  has nothing to say about classification, and counting it as a failure in
 *  every downstream assertion would turn one fault into six. */
export function completedTeams(evidence: Evidence): TeamOutcome[] {
  return evidence.outcomes.filter((o) => o.ok);
}

/** Money comes back as a JSON number and is compared in cents, not in floats.
 *  Half a cent of tolerance is below anything the pricing can express and well
 *  above IEEE-754 noise on sums of 0.10 and 0.01. */
export const MONEY_EPSILON = 0.005;

export function money(n: number): string {
  return `$${n.toFixed(2)}`;
}
