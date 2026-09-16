/**
 * The oracle, assembled.
 *
 * ORDER IS EDITORIAL, NOT MECHANICAL. The assertions are pure functions of the
 * same Evidence, so nothing forces a sequence — but a reader scanning a failed
 * run reads top to bottom and stops at the first thing that explains the rest.
 * So the list runs in causal order: could the round even start, did the work
 * arrive, did the concurrency hold, did the async half complete, does the money
 * follow, and finally — with everything else established — is the scoring
 * engine real. Claim 8 last on purpose: its verdict is only meaningful once you
 * know the pipeline underneath it worked.
 *
 * ONE CLAIM PER FILE. Each file carries the reasoning for its own claim, which
 * is why they are separate files rather than a switch in here. This module only
 * decides what order they are read in.
 *
 * EVERY ASSERTION RUNS, EVEN AFTER ONE FAILS. A run against a live deployment
 * is expensive and destructive; stopping at the first failure would throw away
 * the seven answers that were already paid for, and the interesting diagnoses
 * are usually the CORRELATIONS — claim 5 finding zero sales means one thing on
 * its own and something quite different next to claim 8 reporting the stub.
 */

import { asyncPipeline } from './asyncPipeline';
import { batchesCreated } from './batchesCreated';
import { claimRace } from './claimRace';
import { classifierVerdict } from './classifierVerdict';
import { economics } from './economics';
import { feedbackShape } from './feedbackShape';
import { roundLifecycle } from './roundLifecycle';
import { sales } from './sales';
import type { Assertion, AssertionResult, Evidence } from './types';

export * from './types';
export {
  asyncPipeline,
  batchesCreated,
  claimRace,
  classifierVerdict,
  economics,
  feedbackShape,
  roundLifecycle,
  sales,
};

/**
 * Claims 2 through 8 — everything judgeable while the round is still ACTIVE.
 *
 * Claim 1 is NOT here, and that is a sequencing fact rather than an oversight:
 * the round has not been ENDED yet when these run, so the lifecycle it asserts
 * is still incomplete. run.ts evaluates `roundLifecycle` separately after the
 * end call and sorts it back into first place for the report.
 */
export const ACTIVE_ROUND_ASSERTIONS: readonly Assertion[] = Object.freeze([
  batchesCreated,
  claimRace,
  asyncPipeline,
  sales,
  feedbackShape,
  economics,
  classifierVerdict,
]);

/**
 * Run a list of assertions over one Evidence bundle.
 *
 * An assertion that THROWS is reported as a failed claim rather than crashing
 * the run, and its detail says so explicitly: a bug in the oracle must never be
 * mistakable for a finding about the deployment, and it must never cost the
 * other seven claims their answers. This mirrors what preflight.ts does with
 * `timed`, for the same reason.
 */
export function runAssertions(
  assertions: readonly Assertion[],
  evidence: Evidence,
): AssertionResult[] {
  return assertions.map((assertion, i) => {
    try {
      return assertion(evidence);
    } catch (err) {
      const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
      return {
        id: 100 + i,
        name: `assertion #${i + 1} (${assertion.name || 'anonymous'})`,
        layer: 'lifecycle' as const,
        kind: 'check' as const,
        ok: false,
        summary: 'the assertion itself threw',
        diagnosis:
          'This is a fault in the oracle — a file under scripts/e2e/assertions/ — NOT a verdict on ' +
          `the deployment. The round's evidence is still in report.json and can be re-judged once ` +
          `this is fixed, without another destructive run.\n${message}`,
      } satisfies AssertionResult;
    }
  });
}

/** Sorted by claim number, so the report reads 1..8 whichever order they were
 *  evaluated in. */
export function inClaimOrder(results: readonly AssertionResult[]): AssertionResult[] {
  return [...results].sort((a, b) => a.id - b.id);
}
