/**
 * Convergence, not completion.
 *
 * WHY THIS FILE IS THE CENTREPIECE. MarketingService.Publish commits the
 * publish/discard decisions, calls `dispatcher.Enqueue(ctx, batchID)` and
 * returns 200. Everything the round is actually about happens AFTER that
 * response, on a worker goroutine (infra/worker/dispatcher.go, a 2-worker pool
 * over a buffered channel): ClassificationService.ProcessBatch claims the job,
 * calls the Azure LLM once per batch of jokes, validates and persists a
 * 12-dimension fit per joke, marks the job done, and only THEN runs
 * EvaluatePurchases, which is what writes the `purchases` rows the market board
 * and the leaderboard are computed from.
 *
 * So the publish response proves nothing. Worse than nothing: an Enqueue
 * failure is logged and swallowed (marketing.go), and a ProcessBatch failure is
 * recorded on the job row and never surfaces on any route. A test that asserts
 * on the publish body passes against a backend whose worker is dead, whose LLM
 * credentials are missing, or whose ideal_profile is invalid. The only honest
 * assertion is: poll an endpoint that reflects the worker's output until it
 * settles, and fail with a diagnosis when it does not.
 *
 * TIMING IS EVIDENCE, NOT LOGGING. How LONG convergence takes is itself a test
 * signal. The offline StubClassifier (infra/llm/stub_classifier.go) returns the
 * first non-catch-all category for every dimension, synchronously, with no
 * network call — a published batch converges in milliseconds and every joke
 * gets an IDENTICAL fit. The AzureClassifier does a structured-output chat
 * completion with retries and backoff. A run that converges implausibly fast,
 * or where every joke's feedback dimensions match, is a run against the stub
 * with APP_LLM_* unset — green, and worthless. Every waiter therefore records
 * its elapsed time as data the caller can assert on, and `judgeClassifier`
 * turns that into a verdict.
 *
 * Zero dependencies, Node 20+ built-ins only, same as client.ts.
 */

import type { FeedbackJoke, MarketItem } from '../../../types/api';
import { ApiError, type JokeFactoryClient, type QueueEnvelope } from './client';

/* ===========================================================================
   The generic poller
=========================================================================== */

/**
 * What one poll saw. `observed` is REQUIRED on both branches and is not
 * optional prose: it is the "last observed value" the timeout diagnostic
 * prints, and it is the difference between "timed out" and "still 0 of 5 jokes
 * scored after 41 polls". Write it as a fact, not as a status.
 */
export type WaitVerdict<T> =
  | { done: true; value: T; observed: string }
  | { done: false; observed: string };

export function settled<T>(value: T, observed: string): WaitVerdict<T> {
  return { done: true, value, observed };
}

export function pending<T>(observed: string): WaitVerdict<T> {
  return { done: false, observed };
}

export interface WaitOptions {
  /** What is being waited on, phrased so it reads in a failure message:
   *  "classification of batch 42 (5 published jokes)". */
  label: string;
  /** First gap between polls. Default 400ms. */
  intervalMs?: number;
  /** Ceiling for the backed-off gap. Default 4000ms. */
  maxIntervalMs?: number;
  /** Multiplier applied to the gap after each poll. Default 1.4 — fast enough
   *  to measure a stub's millisecond convergence, slow enough not to hammer a
   *  live container for two minutes. */
  backoff?: number;
  /** Total budget across all polls. Default 120_000ms. Sized for a real LLM
   *  round trip plus Azure Container Apps cold start, not for a stub. */
  budgetMs?: number;
  /**
   * Causes to print on timeout, MOST LIKELY FIRST. Each specific waiter below
   * supplies its own; DEFAULT_CAUSES is the fallback. A generic "it timed out"
   * sends whoever is on the other end of it reading backend source at 2am,
   * which is exactly the cost this list exists to avoid.
   */
  causes?: string[];
  /** Replace the whole timeout message. Receives everything the default
   *  formatter has. */
  onTimeout?: (ctx: WaitTimeoutContext) => string;
  /** Called after every poll — wire it to a progress line if you want one. */
  onPoll?: (poll: PollRecord) => void;
  /** Cancels the wait early; surfaces as a WaitTimeoutError with the elapsed
   *  time so far. */
  signal?: AbortSignal;
  /** Where to record this wait's timing. Defaults to the module-level
   *  registry, so p95 works without any wiring. */
  timings?: WaitTimings;
}

export interface PollRecord {
  index: number;
  atMs: number;
  /** How long the probe itself took, separate from the gap between probes. */
  probeMs: number;
  done: boolean;
  observed: string;
}

export interface WaitResult<T> {
  value: T;
  label: string;
  /** Wall time from the first probe starting to the settling probe returning.
   *  THIS is the number to judge the classifier by. */
  elapsedMs: number;
  polls: number;
  /** The settling poll's own `observed`. */
  observed: string;
  /** Every poll, for a timeline in a report. */
  timeline: PollRecord[];
}

export interface WaitTimeoutContext {
  label: string;
  elapsedMs: number;
  budgetMs: number;
  polls: number;
  lastObserved: string;
  causes: string[];
  timeline: PollRecord[];
  /** Set when the last probe threw rather than returning a verdict. */
  lastError?: Error;
}

const DEFAULT_CAUSES = [
  'the classification worker is not running or not draining its queue — MarketingService.Publish ' +
    'logs and SWALLOWS an Enqueue failure, so a 200 publish does not prove the job was even queued',
  'the Azure LLM is unreachable or its credentials are missing/invalid (APP_LLM_*) — ProcessBatch ' +
    'marks the job failed and no route ever reports it; look for "classification failed" in the ' +
    'container logs, keyed by batch_id',
  'the round is not ACTIVE — most student routes 409 with ROUND_NOT_ACTIVE, but a round ENDED ' +
    'mid-wait simply stops producing new data',
  'the round has no valid ideal_profile — ProcessBatch revalidates it and aborts the whole batch ' +
    'before any fit is written, even though start already accepted it',
  'nothing was published — an all-discard batch classifies to zero jokes and marks done immediately, ' +
    'so there is nothing to converge on',
];

/** Thrown when a wait exhausts its budget. Carries the timeline, so a reporter
 *  can show convergence stalling rather than just failing. */
export class WaitTimeoutError extends Error {
  readonly label: string;
  readonly elapsedMs: number;
  readonly budgetMs: number;
  readonly polls: number;
  readonly lastObserved: string;
  readonly timeline: PollRecord[];
  readonly lastError?: Error;

  constructor(ctx: WaitTimeoutContext, message: string) {
    super(message);
    this.name = 'WaitTimeoutError';
    this.label = ctx.label;
    this.elapsedMs = ctx.elapsedMs;
    this.budgetMs = ctx.budgetMs;
    this.polls = ctx.polls;
    this.lastObserved = ctx.lastObserved;
    this.timeline = ctx.timeline;
    this.lastError = ctx.lastError;
  }
}

function defaultTimeoutMessage(ctx: WaitTimeoutContext): string {
  const lines = [
    `gave up waiting for ${ctx.label}`,
    `  waited     ${fmtMs(ctx.elapsedMs)} of a ${fmtMs(ctx.budgetMs)} budget, over ${ctx.polls} poll(s)`,
    `  last saw   ${ctx.lastObserved}`,
  ];
  if (ctx.lastError) lines.push(`  last error ${indent(ctx.lastError.message)}`);
  lines.push('  likely cause, most specific first:');
  ctx.causes.forEach((c, i) => lines.push(`    ${i + 1}. ${indent(c, 7)}`));
  return lines.join('\n');
}

/**
 * Poll `predicate` until it reports done, or the budget runs out.
 *
 * A predicate that THROWS is not automatically fatal — a live deployment
 * behind Azure Container Apps will hand back the odd 5xx or reset a connection
 * during a cold start, and failing the whole run on one of those would make the
 * test flakier than the system it measures. Transport-level faults are
 * absorbed, recorded in the timeline and retried; a 4xx is a deliberate answer
 * from the backend and is rethrown immediately, because polling harder will not
 * turn a 403 into a 200.
 */
export async function waitFor<T>(
  predicate: () => Promise<WaitVerdict<T>>,
  opts: WaitOptions,
): Promise<WaitResult<T>> {
  const intervalMs = opts.intervalMs ?? 400;
  const maxIntervalMs = opts.maxIntervalMs ?? 4_000;
  const backoff = opts.backoff ?? 1.4;
  const budgetMs = opts.budgetMs ?? 120_000;
  const timings = opts.timings ?? globalTimings;

  const timeline: PollRecord[] = [];
  const started = performance.now();
  let gap = intervalMs;
  let lastObserved = 'nothing yet — the first poll has not returned';
  let lastError: Error | undefined;

  for (let index = 0; ; index++) {
    if (opts.signal?.aborted) break;

    const probeStarted = performance.now();
    let verdict: WaitVerdict<T> | undefined;
    try {
      verdict = await predicate();
      lastError = undefined;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      // A 4xx is the backend answering, not failing to answer. Let it out.
      if (err instanceof ApiError && err.status >= 400 && err.status < 500) throw err;
      lastError = e;
      lastObserved = `poll ${index} failed: ${firstLine(e.message)}`;
    }
    const probeMs = performance.now() - probeStarted;
    const atMs = performance.now() - started;

    if (verdict) lastObserved = verdict.observed;
    const record: PollRecord = { index, atMs, probeMs, done: verdict?.done ?? false, observed: lastObserved };
    timeline.push(record);
    opts.onPoll?.(record);

    if (verdict?.done) {
      const result: WaitResult<T> = {
        value: verdict.value,
        label: opts.label,
        elapsedMs: atMs,
        polls: timeline.length,
        observed: verdict.observed,
        timeline,
      };
      timings.record(result);
      return result;
    }

    const remaining = budgetMs - (performance.now() - started);
    if (remaining <= 0) break;
    await sleep(Math.min(gap, remaining), opts.signal);
    gap = Math.min(gap * backoff, maxIntervalMs);
  }

  const ctx: WaitTimeoutContext = {
    label: opts.label,
    elapsedMs: performance.now() - started,
    budgetMs,
    polls: timeline.length,
    lastObserved,
    causes: opts.causes ?? DEFAULT_CAUSES,
    timeline,
    lastError,
  };
  timings.record({ label: opts.label, elapsedMs: ctx.elapsedMs, polls: ctx.polls, timedOut: true });
  throw new WaitTimeoutError(ctx, (opts.onTimeout ?? defaultTimeoutMessage)(ctx));
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
  });
}

/* ===========================================================================
   Timings — first-class data, not logs
=========================================================================== */

export interface TimingSample {
  label: string;
  elapsedMs: number;
  polls: number;
  timedOut?: boolean;
}

/**
 * Every wait lands here. Samples keep their label, so p95 can be asked over one
 * kind of wait ("classification of batch *") or over the whole run.
 */
export class WaitTimings {
  private readonly samples: TimingSample[] = [];

  record(s: TimingSample | WaitResult<unknown>): void {
    this.samples.push({
      label: s.label,
      elapsedMs: s.elapsedMs,
      polls: s.polls,
      timedOut: 'timedOut' in s ? s.timedOut : false,
    });
  }

  /** `match` is a substring of the label, or a predicate. Omitted = everything. */
  all(match?: string | ((s: TimingSample) => boolean)): TimingSample[] {
    if (match === undefined) return [...this.samples];
    const fn = typeof match === 'string' ? (s: TimingSample) => s.label.includes(match) : match;
    return this.samples.filter(fn);
  }

  count(match?: string | ((s: TimingSample) => boolean)): number {
    return this.all(match).length;
  }

  /**
   * Nearest-rank percentile over elapsed times. Nearest-rank rather than
   * interpolated on purpose: with the handful of samples a 12-team round
   * produces, an interpolated p95 invents a number no batch ever took, and the
   * point of these figures is to be attributable to a real wait.
   */
  percentile(p: number, match?: string | ((s: TimingSample) => boolean)): number {
    const xs = this.all(match).map((s) => s.elapsedMs).sort((a, b) => a - b);
    if (xs.length === 0) return NaN;
    const rank = Math.ceil((p / 100) * xs.length);
    return xs[Math.min(Math.max(rank, 1), xs.length) - 1];
  }

  p50(match?: string | ((s: TimingSample) => boolean)): number { return this.percentile(50, match); }
  p95(match?: string | ((s: TimingSample) => boolean)): number { return this.percentile(95, match); }

  min(match?: string | ((s: TimingSample) => boolean)): number {
    const xs = this.all(match).map((s) => s.elapsedMs);
    return xs.length ? Math.min(...xs) : NaN;
  }

  max(match?: string | ((s: TimingSample) => boolean)): number {
    const xs = this.all(match).map((s) => s.elapsedMs);
    return xs.length ? Math.max(...xs) : NaN;
  }

  /** A block for the end of a run: one row per distinct label prefix. */
  summary(match?: string | ((s: TimingSample) => boolean)): string {
    const rows = this.all(match);
    if (rows.length === 0) return 'no waits recorded';
    const byKind = new Map<string, TimingSample[]>();
    for (const s of rows) {
      const kind = s.label.replace(/\d+/g, '#');
      const bucket = byKind.get(kind);
      if (bucket) bucket.push(s); else byKind.set(kind, [s]);
    }
    const lines: string[] = [];
    for (const [kind, bucket] of byKind) {
      const xs = bucket.map((b) => b.elapsedMs).sort((a, b) => a - b);
      const at = (p: number) => xs[Math.min(Math.ceil((p / 100) * xs.length), xs.length) - 1];
      const failed = bucket.filter((b) => b.timedOut).length;
      lines.push(
        `  n=${String(bucket.length).padStart(3)}  min ${fmtMs(xs[0]).padStart(8)}` +
        `  p50 ${fmtMs(at(50)).padStart(8)}  p95 ${fmtMs(at(95)).padStart(8)}` +
        `  max ${fmtMs(xs[xs.length - 1]).padStart(8)}` +
        `${failed ? `  TIMED OUT ${failed}` : ''}   ${kind}`,
      );
    }
    return lines.join('\n');
  }
}

/** The default sink, so `waitFor` needs no wiring to produce a p95. */
export const globalTimings = new WaitTimings();

/** p95 over a bare array, for callers holding their own numbers. */
export function p95(samples: number[]): number {
  if (samples.length === 0) return NaN;
  const xs = [...samples].sort((a, b) => a - b);
  return xs[Math.min(Math.ceil(0.95 * xs.length), xs.length) - 1];
}

/* ===========================================================================
   Is that a real LLM behind the round?
=========================================================================== */

export type ClassifierVerdict = 'LIKELY_STUB' | 'PLAUSIBLE_LLM' | 'SLOW_LLM';

export interface ClassifierJudgement {
  verdict: ClassifierVerdict;
  elapsedMs: number;
  jokeCount: number;
  msPerJoke: number;
  explanation: string;
}

/**
 * Classification latency is a test signal, so it gets a verdict rather than a
 * log line.
 *
 * The StubClassifier does no I/O — it fills every LLM dimension with the first
 * non-catch-all category from the spec and returns. End to end, a published
 * batch converges in roughly the time of one poll. A real AzureClassifier does
 * a structured-output chat completion, with up to MaxRetries and backoff on
 * top. A sub-second convergence therefore does not mean the deployment is fast;
 * it means APP_LLM_* is unset and the run proved nothing about scoring.
 *
 * The 1.5s floor is deliberately generous: it is below any plausible Azure
 * round trip and well above the stub's, so the two do not overlap. Corroborate
 * with `looksLikeStubFeedback` before acting on it — latency alone can be
 * fooled by a warm cache.
 */
export function judgeClassifier(elapsedMs: number, jokeCount: number): ClassifierJudgement {
  const msPerJoke = jokeCount > 0 ? elapsedMs / jokeCount : elapsedMs;
  if (elapsedMs < 1_500) {
    return {
      verdict: 'LIKELY_STUB', elapsedMs, jokeCount, msPerJoke,
      explanation:
        `classification of ${jokeCount} joke(s) converged in ${fmtMs(elapsedMs)}, which is far too fast ` +
        'for an Azure chat completion — this is almost certainly infra/llm/stub_classifier.go with ' +
        'APP_LLM_* unset. Scoring behaviour was NOT exercised; only response shapes were.',
    };
  }
  if (elapsedMs > 60_000) {
    return {
      verdict: 'SLOW_LLM', elapsedMs, jokeCount, msPerJoke,
      explanation:
        `classification of ${jokeCount} joke(s) took ${fmtMs(elapsedMs)} (${fmtMs(msPerJoke)}/joke). Real, ` +
        'but slow enough to matter in a classroom: check for AzureClassifier retries (a 429 costs a full ' +
        'backoff each time) and for the 2-worker dispatcher pool queueing behind other teams.',
    };
  }
  return {
    verdict: 'PLAUSIBLE_LLM', elapsedMs, jokeCount, msPerJoke,
    explanation:
      `classification of ${jokeCount} joke(s) took ${fmtMs(elapsedMs)} (${fmtMs(msPerJoke)}/joke), ` +
      'consistent with a real Azure round trip.',
  };
}

/**
 * The second stub tell, and the stronger one. StubClassifier gives EVERY joke
 * the same categories, so every joke's dim_fits are identical and
 * SelectFeedbackDimensions returns identical good/improve arrays across the
 * whole team. Distinct jokes scoring identically is not something a real
 * classifier does more than once by accident.
 */
export function looksLikeStubFeedback(jokes: FeedbackJoke[]): boolean {
  if (jokes.length < 2) return false;
  const shape = (j: FeedbackJoke) => `${j.good_dimensions.join(',')}|${j.improve_dimensions.join(',')}`;
  const first = shape(jokes[0]);
  return jokes.every((j) => shape(j) === first);
}

/* ===========================================================================
   The specific waiters

   Each one names the endpoint it watches and why that endpoint is the one that
   reflects the worker. They take a client that is already bound to the right
   actor — role checks live in the usecases, and a waiter polling as the wrong
   actor gets a 403, which waitFor rethrows immediately rather than grinding
   through the whole budget.
=========================================================================== */

/**
 * Wait for a batch to be claimable from the marketing queue.
 *
 * Watches GET /v1/marketing/queue/next, which is NOT a pure read: it CLAIMS the
 * batch (ClaimNextBatch sets locked_by), so this waiter both waits and takes
 * the lock, and only the team's one marketer may run it. Pass `batchId` to
 * insist on a specific batch — a team can have several submitted, and
 * ClaimNextBatch hands back whichever is next.
 *
 * This wait is NOT worker-dependent: CreateBatch is synchronous, so anything
 * beyond a second or two here is a submission that never landed, not a slow
 * classifier.
 */
export function waitForBatchInMarketingQueue(
  marketing: JokeFactoryClient,
  roundId: number,
  opts: { batchId?: number } & Partial<WaitOptions> = {},
): Promise<WaitResult<QueueEnvelope>> {
  const want = opts.batchId;
  return waitFor<QueueEnvelope>(
    async () => {
      const q = await marketing.marketingQueueNext(roundId);
      if (!q.batch) return pending(`queue empty (queue_size ${q.queue_size})`);
      if (want !== undefined && q.batch.batch_id !== want) {
        return pending(`claimed batch ${q.batch.batch_id}, still waiting for ${want} (queue_size ${q.queue_size})`);
      }
      const state = q.batch.raw_text === null ? `split, ${q.jokes.length} joke(s)` : 'unsplit raw blob';
      return settled(q, `batch ${q.batch.batch_id} claimed — ${state} (queue_size ${q.queue_size})`);
    },
    {
      label: want === undefined
        ? `a claimable batch in round ${roundId}'s marketing queue`
        : `batch ${want} to reach round ${roundId}'s marketing queue`,
      budgetMs: 30_000,
      causes: [
        'the JM never submitted — POST /v1/rounds/{rid}/batches 400s if neither jokes nor raw_text is ' +
          'supplied, or if both are, and the harness may have swallowed that',
        'the JM and this marketer are on DIFFERENT teams — the queue is per-team ' +
          '(CountSubmittedBatchesForTeam), not global, so a cross-team wait never resolves',
        'another marketer on this team already holds the lock — ClaimNextBatch only re-serves a batch ' +
          'to the marketer who holds it',
        'the batch was already processed — publish sets status PROCESSED and it leaves the queue for good',
      ],
      ...opts,
    },
  );
}

/**
 * Wait for the published jokes of a batch to be classified and scored.
 *
 * WHAT IT WATCHES AND WHY. No route exposes joke_fit or a classification job
 * status — the fit table is deliberately never served, and the job row is
 * internal. The feedback endpoint is the nearest honest proxy:
 * FeedbackService.Get reads each joke's persisted dim_fits and derives good /
 * improve from them, so a joke with no fit yet comes back with BOTH arrays
 * EMPTY rather than absent. Non-empty arrays for a joke mean its fit exists.
 *
 * Caveat the caller must respect: feedback returns only the round's latest
 * `feedback_joke_count` published jokes for the team (default 3), so this is a
 * check on the jokes the panel covers, not proof that every joke in a large
 * batch was scored. Pass `expectJokes` to require a minimum count.
 *
 * THE ELAPSED TIME OF THIS WAIT IS THE CLASSIFICATION LATENCY. Feed it to
 * judgeClassifier.
 */
export function waitForClassification(
  teamMember: JokeFactoryClient,
  roundId: number,
  teamId: number,
  opts: { expectJokes?: number } & Partial<WaitOptions> = {},
): Promise<WaitResult<FeedbackJoke[]>> {
  const expect = opts.expectJokes ?? 1;
  return waitFor<FeedbackJoke[]>(
    async () => {
      const res = await teamMember.teamFeedback(roundId, teamId);
      const scored = res.jokes.filter((j) => j.good_dimensions.length + j.improve_dimensions.length > 0);
      const observed =
        `${scored.length}/${res.jokes.length} joke(s) scored` +
        (res.jokes.length ? ` [${res.jokes.map((j) => `${j.joke_id}:${scored.includes(j) ? 'fit' : '—'}`).join(' ')}]` : '');
      if (res.jokes.length === 0) return pending('feedback panel is empty — no published joke visible yet');
      if (scored.length < Math.min(expect, res.jokes.length)) return pending(observed);
      if (scored.length < res.jokes.length) return pending(observed);
      return settled(scored, observed);
    },
    {
      label: `classification of round ${roundId} team ${teamId}'s published jokes`,
      budgetMs: 180_000,
      causes: [
        'the classification worker never picked the job up — Publish logs and SWALLOWS an Enqueue ' +
          'failure, so a 200 publish does not prove the batch was queued at all',
        'the Azure LLM rejected or never answered the call — ProcessBatch marks the job FAILED and no ' +
          'endpoint reports it; grep the container logs for "classification failed" with this batch_id',
        'APP_LLM_* is unset, the deployment name is wrong, or the key expired — same symptom, and the ' +
          'only external evidence is the backend log',
        'the round has no valid ideal_profile — ProcessBatch revalidates it and aborts before writing ' +
          'any fit, even though start already accepted the round',
        'every joke in the batch was DISCARDED — ProcessBatch classifies published jokes only, marks ' +
          'the job done immediately, and no fit is ever written',
        'this actor is on another team, or the round is neither ACTIVE nor ENDED — both are 4xx, which ' +
          'would have been rethrown, so rule them out only if no 4xx was seen',
      ],
      ...opts,
    },
  );
}

/**
 * Wait for sales to materialise on the market board.
 *
 * ONE STEP FURTHER DOWNSTREAM than classification: EvaluatePurchases runs only
 * after PersistJokeFits and MarkClassificationDone succeed, and its own failure
 * is logged and swallowed by ProcessBatch ("Fit is already persisted; purchases
 * can be retried"). So feedback can populate while sales never arrive, and the
 * two waits are genuinely separate assertions.
 *
 * GET /v1/rounds/{rid}/market is the ONLY endpoint with a real sold_count — it
 * aggregates the `purchases` table live. The sold_count on
 * /teams/{tid}/batches is structurally always 0; a waiter pointed at it would
 * burn the whole budget for nothing.
 *
 * Note that zero sales can be a legitimate outcome: AI customers buy on fit
 * against buy_threshold and budget. `minSold` defaults to 1 because a round
 * where nothing at all sold is usually a broken round, but a test asserting a
 * deliberately terrible batch should pass `minSold: 0` and instead wait on
 * classification.
 */
export function waitForSalesOnMarket(
  actor: JokeFactoryClient,
  roundId: number,
  opts: { jokeIds?: number[]; minSold?: number } & Partial<WaitOptions> = {},
): Promise<WaitResult<MarketItem[]>> {
  const minSold = opts.minSold ?? 1;
  const only = opts.jokeIds;
  return waitFor<MarketItem[]>(
    async () => {
      const res = await actor.market(roundId);
      const items = only ? res.items.filter((i) => only.includes(i.joke_id)) : res.items;
      const total = items.reduce((n, i) => n + i.sold_count, 0);
      const observed =
        `${items.length} joke(s) on the board, ${total} sale(s) total` +
        (items.length ? ` [${items.map((i) => `${i.joke_id}:${i.sold_count}`).join(' ')}]` : '');
      if (only && items.length < only.length) {
        return pending(`${observed} — ${only.length - items.length} expected joke(s) not published yet`);
      }
      if (items.length === 0) return pending('market board is empty — nothing published yet');
      return total >= minSold ? settled(items, observed) : pending(observed);
    },
    {
      label: `sales on round ${roundId}'s market board`,
      budgetMs: 180_000,
      causes: [
        'classification has not finished — purchases are only evaluated after fits are persisted, so ' +
          'wait on classification FIRST and treat this wait as the step after it',
        'EvaluatePurchases failed — ProcessBatch logs it and swallows it precisely because the fits are ' +
          'already saved, so feedback can populate while sales never arrive',
        'the round was started before the customers existed, or has no AI customers — GenerateCustomers ' +
          'runs inside StartRound, so a round started by another path has nobody to buy',
        'nothing cleared the bar — customers buy on fit against buy_threshold within customer_budget; ' +
          'a genuinely poor batch legitimately sells nothing, so pass minSold: 0 if that is the case ' +
          'under test',
      ],
      ...opts,
    },
  );
}

/**
 * Wait for a team's feedback panel to be fully populated — the student-facing
 * end state, rather than the classification proxy above.
 *
 * The difference from waitForClassification is the acceptance bar: this one
 * requires the panel to carry the round's configured `feedback_joke_count`
 * jokes (pass `expectCount`, or let it read the round to find out), each with
 * dimensions on it. That is what a student actually sees, and it is the thing
 * worth asserting at the end of a round.
 */
export function waitForFeedbackPanel(
  teamMember: JokeFactoryClient,
  roundId: number,
  teamId: number,
  opts: { expectCount?: number } & Partial<WaitOptions> = {},
): Promise<WaitResult<FeedbackJoke[]>> {
  let want = opts.expectCount;
  return waitFor<FeedbackJoke[]>(
    async () => {
      if (want === undefined) {
        // Read it from the round rather than assuming the default of 3 — an
        // instructor may have configured any count, and a hard-coded 3 would
        // make this waiter wrong in exactly the class it is meant to protect.
        const rounds = await teamMember.roundsActive();
        want = rounds.rounds.find((r) => r.id === roundId)?.feedback_joke_count ?? 3;
      }
      const res = await teamMember.teamFeedback(roundId, teamId);
      const scored = res.jokes.filter((j) => j.good_dimensions.length + j.improve_dimensions.length > 0);
      const observed = `panel has ${res.jokes.length}/${want} joke(s), ${scored.length} with dimensions`;
      if (scored.length >= want && res.jokes.length >= want) return settled(scored, observed);
      return pending(observed);
    },
    {
      label: `round ${roundId} team ${teamId}'s feedback panel to fill`,
      budgetMs: 180_000,
      causes: [
        'fewer jokes have been PUBLISHED than feedback_joke_count — the panel lists the latest N ' +
          'published jokes, so it can never fill past what Marketing chose to publish',
        'classification is incomplete for some of them — an unscored joke appears with both dimension ' +
          'arrays EMPTY rather than being absent, so the panel can look full and still be unfinished',
        'the Azure LLM or the classification worker is down — see the causes on waitForClassification; ' +
          'this waiter sits downstream of all of them',
      ],
      ...opts,
    },
  );
}

/* ===========================================================================
   Formatting
=========================================================================== */

function fmtMs(ms: number): string {
  if (!Number.isFinite(ms)) return 'n/a';
  if (ms < 1_000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m${String(Math.round((ms % 60_000) / 1_000)).padStart(2, '0')}s`;
}

function firstLine(s: string): string {
  const i = s.indexOf('\n');
  return i === -1 ? s : `${s.slice(0, i)} …`;
}

function indent(s: string, pad = 13): string {
  return s.split('\n').join(`\n${' '.repeat(pad)}`);
}
