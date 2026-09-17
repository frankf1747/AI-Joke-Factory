/**
 * CLAIM 8 — IS THERE A REAL CLASSIFIER BEHIND THIS ROUND, OR IS IT THE STUB?
 *
 * THE FAILURE THIS EXISTS TO CATCH IS A GREEN RUN. With APP_LLM_* unset the
 * backend falls back to infra/llm/stub_classifier.go, which returns the first
 * non-catch-all category of every dimension for EVERY joke, synchronously, with
 * no network call. Every other claim in this suite passes: batches are created,
 * the claim race is clean, feedback panels fill, the shape is right, the money
 * adds up. The round is a working shell around a scoring engine that is not
 * scoring anything, and the class spends an hour learning that their writing
 * does not affect their score. No error is logged. No endpoint reports it.
 *
 * THIS IS A JUDGMENT, NOT A THRESHOLD. Any single number here can be explained
 * away — a warm cache makes latency look stubby, a hard round makes sales look
 * flat — so the verdict is a reading of three independent signals together, and
 * the report prints all three whichever way it lands. A bare PASS/FAIL on one
 * of them would be worse than nothing, because it would be believed.
 *
 *   SIGNAL A — SPREAD ACROSS THE VARIED CORPUS. 55 jokes deliberately scattered
 *     over the 12 dimensions should produce a range of outcomes: some sell
 *     well, some not at all.
 *   SIGNAL B — THE BLAND CONTROL. One team is dealt ten near-identical jokes
 *     (see the SET B block in fixtures/jokes.ts — it is an instrument, not
 *     filler). It SHOULD cluster. A control that clusters while the varied
 *     corpus spreads is the signature of a classifier that is reading the
 *     jokes. Both flat means the classifier is reading nothing.
 *   SIGNAL C — LATENCY. `judgeClassifier` turns convergence time into a
 *     verdict: a real Azure structured-output completion cannot finish in the
 *     time the stub takes, and the 1.5s floor sits well clear of both.
 *
 * WHAT "SPREAD" IS MEASURED OVER, AND WHY IT IS A PROXY — stated plainly
 * because it limits what this claim can conclude. joke_fit is never served on
 * any route, so the harness CANNOT read the scores directly. Two observable
 * consequences of the score stand in for it:
 *
 *   sold_count per joke   the direct downstream of true_fit ≥ buy_threshold,
 *                         evaluated once per AI customer. Different fits
 *                         produce different sale counts.
 *   feedback signature    the good|improve dimension pair per joke. The stub
 *                         gives every joke identical dim_fits, so every joke
 *                         gets an identical signature — `looksLikeStubFeedback`
 *                         is exactly this test, and it is the stronger of the
 *                         two because it survives a round where nothing sells.
 *
 * Under the stub the first proxy is degenerate in a specific way worth knowing:
 * the constant stub fit works out to 6.5 or 6.0 against a default buy_threshold
 * of 7, so EVERY sold_count is 0 and the sales spread collapses to a single
 * value. That is why the signature test carries the verdict when sales are
 * silent, and why claim 5 failing with zero sales is corroboration rather than
 * a second independent fault.
 */

import {
  judgeClassifier,
  looksLikeStubFeedback,
  type ClassifierJudgement,
} from '../harness/wait';
import type { FeedbackJoke } from '../../../types/api';
import {
  describeSpread,
  fail,
  pass,
  spreadOf,
  type Assertion,
  type Spread,
} from './types';

interface CorpusSample {
  label: string;
  jokes: FeedbackJoke[];
  soldCounts: number[];
  soldSpread: Spread;
  /** How many DIFFERENT good|improve signatures the jokes produced. 1 means
   *  the classifier gave them all the same answer. */
  distinctSignatures: number;
  /** wait.ts's own identical-feedback test, on this corpus alone. */
  identicalFeedback: boolean;
}

function signature(j: FeedbackJoke): string {
  return `${[...j.good_dimensions].sort().join(',')}|${[...j.improve_dimensions].sort().join(',')}`;
}

function sample(label: string, jokes: FeedbackJoke[], soldCounts: number[]): CorpusSample {
  return {
    label,
    jokes,
    soldCounts,
    soldSpread: spreadOf(soldCounts),
    distinctSignatures: new Set(jokes.map(signature)).size,
    identicalFeedback: looksLikeStubFeedback(jokes),
  };
}

/**
 * "Flat" means the classifier did not distinguish the jokes from one another.
 *
 * THAT IS MEASURED ON FEEDBACK SIGNATURES ALONE, and sales are deliberately NOT
 * part of the judgement. Two earlier versions got this wrong in the same way, so
 * the reasoning is worth recording.
 *
 * A feedback signature is the set of dimensions the backend reports per joke —
 * a DIRECT observation of what the classifier produced. Sold counts are three
 * steps downstream: fit, then the buy threshold, then per-customer jitter
 * (`jitter := (rng.Float64()*2 - 1) * round.Jitter`, usecase/aicustomer.go:39,
 * ±0.3 by default). Crucially that noise is not constant — it scales with how
 * near the threshold a joke lands. A joke well below τ sells 0 every time; a
 * joke sitting exactly ON τ has each of 100 customers flip a weighted coin.
 *
 * Both failures came from the bland control, which by construction clusters at a
 * single fit value — so wherever that value lands relative to τ, all four jokes
 * land there together and jitter does the rest:
 *   run 1: sold [1, 0, 0, 1]   — just under τ, a couple of stray buys
 *   run 2: sold [24 … 37]      — right on τ, a third of the pool buying
 * Both runs reported ONE distinct feedback signature across the control and 17
 * across the varied corpus. The classifier behaved identically and correctly in
 * both; only the sales proxy moved, and no fixed tolerance can cover a range
 * that swings from 1 to 13 for the same underlying verdict.
 *
 * Dropping sales from the gate does not weaken stub detection, which was the
 * original reason for the AND. StubClassifier hands every joke the same
 * categories, so under the stub the VARIED corpus goes flat too — and varied-flat
 * is the signal that fires. It also still protects a legitimately hard round
 * where nothing sells but the dimensions genuinely differ per joke: those
 * signatures differ, so it is correctly not flat.
 *
 * Sales remain in the reported evidence as corroboration — a varied corpus
 * ranging 0..100 is a satisfying second opinion — but they no longer decide.
 */
function isFlat(s: CorpusSample): boolean {
  return s.jokes.length < 2 ? true : s.distinctSignatures <= 1;
}


export const classifierVerdict: Assertion = (evidence) => {
  const board = new Map(evidence.market.map((i) => [i.joke_id, i]));
  const corpusOf = new Map(evidence.outcomes.map((o) => [o.teamNumber, o.corpus]));

  const variedJokes: FeedbackJoke[] = [];
  const blandJokes: FeedbackJoke[] = [];
  const variedSold: number[] = [];
  const blandSold: number[] = [];

  for (const conv of evidence.convergence) {
    const corpus = corpusOf.get(conv.teamNumber);
    const jokeSink = corpus === 'bland' ? blandJokes : variedJokes;
    const soldSink = corpus === 'bland' ? blandSold : variedSold;
    for (const j of conv.jokes) {
      if (j.good_dimensions.length + j.improve_dimensions.length === 0) continue; // unscored
      jokeSink.push(j);
      const item = board.get(j.joke_id);
      if (item) soldSink.push(item.sold_count);
    }
  }

  const varied = sample('varied corpus', variedJokes, variedSold);
  const bland = sample('bland control', blandJokes, blandSold);

  // Latency: the p50 over teams, against the jokes one batch actually carries.
  // Per batch is the right unit — the worker classifies a batch, not a joke.
  const latencies = evidence.convergence.filter((c) => !c.timedOut).map((c) => c.classificationMs);
  const sortedLat = [...latencies].sort((a, b) => a - b);
  const p50 = sortedLat.length
    ? sortedLat[Math.min(Math.max(Math.ceil(0.5 * sortedLat.length), 1), sortedLat.length) - 1]
    : NaN;
  const jokesPerBatch = Math.max(
    1,
    Math.round(
      evidence.convergence.reduce((n, c) => n + c.jokes.length, 0) /
        Math.max(1, evidence.convergence.length),
    ),
  );
  const latency: ClassifierJudgement | null = Number.isFinite(p50)
    ? judgeClassifier(p50, jokesPerBatch)
    : null;

  const customerCount = evidence.round.customer_count;
  const variedFlat = isFlat(varied);
  const blandFlat = isFlat(bland);
  const looksStubByLatency = latency?.verdict === 'LIKELY_STUB';

  const data = {
    varied: {
      jokes: varied.jokes.length,
      soldSpread: varied.soldSpread,
      distinctSignatures: varied.distinctSignatures,
      identicalFeedback: varied.identicalFeedback,
      flat: variedFlat,
      soldCounts: varied.soldCounts,
    },
    bland: {
      jokes: bland.jokes.length,
      soldSpread: bland.soldSpread,
      distinctSignatures: bland.distinctSignatures,
      identicalFeedback: bland.identicalFeedback,
      flat: blandFlat,
      soldCounts: bland.soldCounts,
    },
    latency: latency
      ? { p50Ms: Math.round(p50), jokesPerBatch, verdict: latency.verdict, msPerJoke: Math.round(latency.msPerJoke) }
      : null,
    buyThreshold: evidence.round.buy_threshold,
    customerCount,
  };

  // The numbers, printed on every branch. This is the part that makes the
  // verdict arguable instead of merely delivered.
  const notes = [
    `SIGNAL A  varied corpus  ${varied.jokes.length} scored joke(s); sold_count ` +
      `${describeSpread(varied.soldSpread)}; ${varied.distinctSignatures} distinct feedback ` +
      `signature(s) -> ${variedFlat ? 'FLAT' : 'spread'}`,
    `SIGNAL B  bland control  ${bland.jokes.length} scored joke(s); sold_count ` +
      `${describeSpread(bland.soldSpread)}; ${bland.distinctSignatures} distinct feedback ` +
      `signature(s) -> ${blandFlat ? 'clustered (expected)' : 'SPREAD (unexpected)'}`,
    latency
      ? `SIGNAL C  latency       ${latency.verdict} — ${latency.explanation}`
      : 'SIGNAL C  latency       no team converged, so latency says nothing',
    'spread is measured over sold_count and feedback signatures because joke_fit is never served — ' +
      'both are proxies for the score, not the score',
  ];

  const spec = {
    id: 8,
    name: 'classifier verdict — real LLM or silent StubClassifier?',
    layer: 'classifier' as const,
    kind: 'judgment' as const,
    notes,
    data,
  };

  // `pass`/`fail` default kind to 'check'; the spread of `spec` above them
  // overrides it, so every branch below reports as a judgment.
  if (varied.jokes.length === 0) {
    return fail({
        ...spec,
        summary: 'no scored joke from the varied corpus reached a feedback panel — nothing to judge',
        diagnosis:
          'This claim is UNVERIFIED rather than false: with no scored jokes there is no spread to ' +
          'measure and no latency to judge. Fix claim 4 first — the classifier cannot be assessed ' +
          'until something gets classified.',
    });
  }

  // ---- The reading ---------------------------------------------------------

  if (variedFlat && blandFlat) {
    return fail({
        ...spec,
        summary:
          `BOTH corpora are flat (${varied.distinctSignatures} signature across ` +
          `${varied.jokes.length} varied joke(s), ${bland.distinctSignatures} across ` +
          `${bland.jokes.length} control joke(s))` +
          (looksStubByLatency ? ` and convergence took only ${Math.round(p50)}ms` : ''),
        diagnosis: looksStubByLatency
          ? '*** PRODUCTION IS SILENTLY RUNNING StubClassifier. *** Two independent signals agree and ' +
            'neither has an innocent explanation: 55 deliberately varied jokes produced ONE distinct ' +
            'feedback signature — meaning every joke received identical dim_fits — and the batches ' +
            `converged in ${Math.round(p50)}ms, which is below any possible Azure round trip and is ` +
            'what a synchronous in-process fallback looks like. Set APP_LLM_* (endpoint, key, ' +
            'deployment name) on the Container App and redeploy. Until then this round teaches ' +
            'students that their writing does not affect their score: under the stub every joke gets ' +
            `the same constant fit, which against buy_threshold ${evidence.round.buy_threshold} means ` +
            'nothing can ever sell. EVERY OTHER CLAIM IN THIS RUN PASSING IS NOT REASSURANCE — it is ' +
            'exactly the symptom.'
          : 'Both corpora are flat, but convergence was TOO SLOW to be the in-process stub ' +
            `(p50 ${Math.round(p50)}ms). That points at a real Azure call that is failing OPEN: the ` +
            'request is being made and something — a schema rejection, an exhausted retry, a ' +
            'content filter — is producing the same fallback classification every time. Check the ' +
            'container logs for classification errors, and check whether AzureClassifier has a ' +
            'default-on-error path. A slow constant is worse than a fast one: it looks alive.',
    });
  }

  if (!blandFlat) {
    return fail({
        ...spec,
        summary:
          `the BLAND CONTROL spread (${bland.distinctSignatures} distinct signature(s), sold_count ` +
          `${describeSpread(bland.soldSpread)}) — the control is supposed to cluster`,
        diagnosis:
          'The control is ten near-identical jokes: same structure, same topic, same word count, one ' +
          'swapped noun each. It spreading means one of two things, and neither lets you trust the ' +
          'varied corpus reading above it:\n' +
          '  1. THE FIXTURE WAS EDITED. Someone "improved" blandControl in scripts/e2e/fixtures/' +
          'jokes.ts. Read the SET B block at the top of that file — the flatness IS the measurement — ' +
          'and run assertFixtureIntegrity, which pins the control to one length bucket, one topic and ' +
          'one word count.\n' +
          '  2. THE CLASSIFIER IS RETURNING NOISE. If the fixture is intact, interchangeable jokes are ' +
          'being scored differently, which means the scores are not a function of the joke. A ' +
          'temperature that is not zero, or a prompt that leaks the joke id, would both do this.\n' +
          'Fix the control before drawing any conclusion from claim 8 at all.',
    });
  }

  if (variedFlat) {
    return fail({
        ...spec,
        summary:
          `the varied corpus is FLAT while the control clusters as expected — ${varied.distinctSignatures} ` +
          `distinct signature(s) across ${varied.jokes.length} deliberately varied joke(s)`,
        diagnosis:
          '55 jokes scattered across all 12 dimensions — one-liners and 40-word stories, puns and ' +
          'anti-jokes, 15 topics — came back indistinguishable. The classifier is answering, but not ' +
          'from the joke. Most likely the prompt is not carrying the joke text (infra/llm/prompt.go ' +
          'sends the joke and the Marketing title and nothing else, so a truncation there is silent), ' +
          'or the response is being parsed into a default when validation fails.',
    });
  }

  return pass({
      ...spec,
      summary:
        `the varied corpus spreads (${varied.distinctSignatures} distinct signature(s) over ` +
        `${varied.jokes.length} joke(s), sold_count ${describeSpread(varied.soldSpread)}) while the ` +
        `bland control clusters (${bland.distinctSignatures} over ${bland.jokes.length})` +
        (latency ? `; latency ${latency.verdict}` : ''),
      notes: [
        ...notes,
        'READING: a classifier that separates varied jokes and cannot separate interchangeable ones is ' +
          'reading the jokes. This is the expected result, and it is the only branch where the other ' +
          'seven claims mean what they appear to mean.',
      ],
  });
};
