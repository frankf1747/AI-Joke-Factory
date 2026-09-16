/**
 * CLAIM 4 — every published joke reached a fit score, within budget.
 *
 * THE ONLY ASSERTION THAT PROVES THE WORKER RAN. `POST .../publish` commits the
 * editorial decisions, calls `dispatcher.Enqueue` and returns 200 — and an
 * Enqueue failure is LOGGED AND SWALLOWED. A 200 publish therefore does not
 * prove the batch was queued, let alone classified. Everything upstream of this
 * claim would pass, green and fast, against a backend whose classification
 * worker is dead, whose Azure credentials expired last Tuesday, or whose
 * ideal_profile ProcessBatch revalidates and rejects.
 *
 * WHAT IT WATCHES AND WHY THAT IS THE BEST AVAILABLE. joke_fit is never served
 * on any route and the classification job row is internal, so there is no
 * endpoint that says "this joke has been scored". The feedback panel is the
 * nearest honest proxy: FeedbackService derives each joke's good/improve arrays
 * from its persisted dim_fits, so a joke with no fit yet comes back with BOTH
 * arrays empty rather than absent. Non-empty arrays mean a fit exists. That is
 * an inference, and it is stated here rather than buried.
 *
 * COVERAGE CAVEAT — read before trusting a pass. The panel carries only the
 * round's latest `feedback_joke_count` published jokes. If that number is lower
 * than the number of jokes a team published, this claim covers the jokes the
 * panel reaches and SAYS SO in its notes; it does not quietly redefine "every
 * published joke" to mean "the three the panel happened to show".
 *
 * THIS IS NOT THE SALES CHECK. EvaluatePurchases runs after fits persist and
 * its failure is logged and swallowed separately, so classification completing
 * says nothing about sales. CLAIM 5 is a different question and lives in its
 * own file for exactly that reason.
 */

import { fail, pass, type Assertion } from './types';

export const asyncPipeline: Assertion = (evidence) => {
  const panelSize = evidence.round.feedback_joke_count;
  const byTeam = new Map(evidence.convergence.map((c) => [c.teamNumber, c]));

  const rows: Array<Record<string, unknown>> = [];
  const problems: string[] = [];
  const latencies: number[] = [];
  let coveredJokes = 0;
  let scoredJokes = 0;
  let uncoveredJokes = 0;

  for (const o of evidence.outcomes) {
    if (!o.ok) continue; // a team that never published has nothing to converge on
    const published = o.publishedJokeIds;
    // The panel shows the LATEST N published jokes. Highest joke_id is latest —
    // jokes are inserted in split order within one batch, so this is the same
    // ordering the backend applies and does not depend on a timestamp the
    // harness cannot see.
    const expected = [...published].sort((a, b) => b - a).slice(0, panelSize);
    uncoveredJokes += published.length - expected.length;

    const conv = byTeam.get(o.teamNumber);
    const panel = conv?.jokes ?? [];
    const scoredIds = new Set(
      panel.filter((j) => j.good_dimensions.length + j.improve_dimensions.length > 0).map((j) => j.joke_id),
    );
    const missing = expected.filter((id) => !scoredIds.has(id));

    coveredJokes += expected.length;
    scoredJokes += expected.length - missing.length;
    if (conv && !conv.timedOut) latencies.push(conv.classificationMs);

    rows.push({
      teamNumber: o.teamNumber,
      corpus: o.corpus,
      publishedJokeIds: published,
      coveredByPanel: expected,
      scoredJokeIds: [...scoredIds],
      unscoredJokeIds: missing,
      classificationMs: conv ? Math.round(conv.classificationMs) : null,
      polls: conv?.polls ?? null,
      timedOut: conv?.timedOut ?? true,
      observed: conv?.observed ?? 'no convergence record — the wait never ran',
    });

    if (!conv) {
      problems.push(`team ${o.teamNumber}: no convergence was recorded at all`);
    } else if (conv.timedOut) {
      problems.push(
        `team ${o.teamNumber}: gave up after ${Math.round(conv.classificationMs)}ms — ${conv.observed}`,
      );
    } else if (missing.length) {
      problems.push(
        `team ${o.teamNumber}: joke(s) ${missing.join(', ')} are on the panel with BOTH dimension ` +
          'arrays empty, i.e. published but never scored',
      );
    }
  }

  // Nearest-rank, same rule WaitTimings uses: with a dozen samples an
  // interpolated percentile invents a latency no batch ever took.
  const sorted = [...latencies].sort((a, b) => a - b);
  const at = (p: number): number | null => {
    if (!sorted.length) return null;
    const rank = Math.min(Math.max(Math.ceil((p / 100) * sorted.length), 1), sorted.length);
    return Math.round(sorted[rank - 1]);
  };

  const data = {
    feedbackJokeCount: panelSize,
    jokesCoveredByPanel: coveredJokes,
    jokesScored: scoredJokes,
    jokesBeyondPanel: uncoveredJokes,
    classificationMs: { p50: at(50), p95: at(95), min: at(0), max: at(100), n: sorted.length },
    teams: rows,
  };

  const notes: string[] = [];
  if (uncoveredJokes > 0) {
    notes.push(
      `COVERAGE GAP: ${uncoveredJokes} published joke(s) are beyond the panel's ` +
        `feedback_joke_count of ${panelSize} and were NOT checked. Raise feedback_joke_count to at ` +
        'least the number of jokes a team publishes if you want this claim to cover all of them.',
    );
  }
  if (sorted.length) {
    notes.push(
      `classification latency across ${sorted.length} team(s): p50 ${at(50)}ms, p95 ${at(95)}ms, ` +
        `max ${at(100)}ms — judged as a classifier signal in claim 8, not here`,
    );
  }

  if (problems.length === 0 && coveredJokes > 0) {
    return pass({
      id: 4,
      name: 'async pipeline — every published joke reaches a fit score',
      layer: 'async pipeline',
      summary: `${scoredJokes}/${coveredJokes} published joke(s) carry dimensions derived from a persisted fit`,
      notes,
      data,
    });
  }

  return fail({
    id: 4,
    name: 'async pipeline — every published joke reaches a fit score',
    layer: 'async pipeline',
    summary:
      coveredJokes === 0
        ? 'no team published anything, so nothing could be classified'
        : `${scoredJokes}/${coveredJokes} published joke(s) scored; ${problems.length} team(s) affected`,
    diagnosis:
      'A published joke with no fit means the work after the 200 did not happen. In order of how ' +
      'often each one is the answer:\n' +
      '  1. the classification worker never picked the job up — MarketingService.Publish logs and ' +
      'SWALLOWS an Enqueue failure, so the 200 this run got proves nothing about queueing;\n' +
      '  2. the Azure LLM rejected the call or never answered — ProcessBatch marks the job FAILED and ' +
      'no route reports it. Grep the container logs for "classification failed" with the batch ids in ' +
      'report.json;\n' +
      '  3. APP_LLM_* is unset, the deployment name is wrong, or the key expired — same symptom, and ' +
      'the backend log is the only external evidence;\n' +
      '  4. the round has no valid ideal_profile — ProcessBatch revalidates it and aborts before ' +
      'writing any fit, even though start already accepted the round;\n' +
      '  5. the 2-worker dispatcher pool is simply slower than the budget for a class this size, in ' +
      'which case the failures cluster in the teams that published LAST — check the order in ' +
      `report.json.\nAffected: ${problems.join(' | ')}`,
    notes,
    data,
  });
};
