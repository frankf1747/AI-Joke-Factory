/**
 * CLAIM 1 — the round went CONFIGURED → ACTIVE → ENDED.
 *
 * WHY THIS IS AN OBSERVATION LOG AND NOT A READ. By the time anything else in
 * this suite has run, CONFIGURED is gone: `start` overwrites the status in
 * place and there is no history table to query. The only honest way to assert a
 * transition is to record each status AT THE MOMENT the call that caused it
 * returned, which is what run.ts does into `evidence.lifecycle`. A check that
 * read the round at the end could only ever say "it is ENDED now", which is
 * also true of a round somebody ended by hand an hour ago.
 *
 * ORDER, NOT MEMBERSHIP. The three statuses appearing somewhere in the log is
 * not the claim; they have to appear in that sequence. A round observed
 * ACTIVE → CONFIGURED → ENDED means something reset it mid-run, which is the
 * single most destructive thing that can happen to a live classroom and the one
 * a bare membership check would wave through.
 */

import type { RoundStatus } from '../../../types/api';
import { fail, pass, type Assertion } from './types';

const EXPECTED: readonly RoundStatus[] = ['CONFIGURED', 'ACTIVE', 'ENDED'];

export const roundLifecycle: Assertion = (evidence) => {
  const observed = evidence.lifecycle;
  const path = observed.map((e) => e.status);
  const data = {
    expected: EXPECTED,
    observed: observed.map((e) => ({ status: e.status, at: e.at, source: e.source })),
  };

  // Subsequence rather than equality: a run may legitimately read the round
  // more than once (start returns it, the config read returns it again), so
  // CONFIGURED, CONFIGURED, ACTIVE, ENDED is the same story. What must not
  // happen is a status arriving out of order or never arriving at all.
  const reached: RoundStatus[] = [];
  let want = 0;
  for (const status of path) {
    if (want < EXPECTED.length && status === EXPECTED[want]) {
      reached.push(status);
      want++;
    }
  }

  if (reached.length === EXPECTED.length) {
    return pass({
      id: 1,
      name: 'round lifecycle CONFIGURED → ACTIVE → ENDED',
      layer: 'lifecycle',
      summary: `observed ${path.join(' → ')} across ${observed.length} observation(s)`,
      data,
    });
  }

  const missing = EXPECTED.slice(reached.length);
  const stuckAt = missing[0];

  // The distinction the doc comment above is about: a status that IS in the log
  // but arrived in the wrong place is a different (and worse) story from one
  // that never arrived. Diagnose the reordering, not the absence.
  const outOfOrder = missing.filter((s) => path.includes(s));

  const why = outOfOrder.length
    ? `the round passed through ${outOfOrder.join(' and ')} but NOT IN ORDER — the sequence observed ` +
      `was ${path.join(' → ')}. A round seen ACTIVE and then CONFIGURED again has been RESET ` +
      'UNDERNEATH THIS RUN: either a second copy of this suite is running against the same backend, ' +
      'or someone pressed reset in the instructor UI. Everything measured after that point describes ' +
      'a different round from everything measured before it, so treat the other claims in this ' +
      'report as unreliable rather than as findings.'
    : stuckAt === 'CONFIGURED'
      ? 'the round was never seen CONFIGURED, so the reset did not restore it — POST /v1/admin/reset ' +
        'sets every round back to CONFIGURED with DEFAULT config, and a round that is already ACTIVE ' +
        'when this run starts means the reset failed or another session is using this backend RIGHT NOW'
      : stuckAt === 'ACTIVE'
        ? 'the round never reached ACTIVE, so start failed. The usual cause is 409 CONFLICT — StartRound ' +
          'revalidates ideal_profile unconditionally and refuses without one, and unlike the config path ' +
          'that failure carries NO `field` key, so branch on the status. Check the start call in run.ts ' +
          'and the config POST immediately before it'
        : 'the round never reached ENDED, so the end call failed or never ran. POST .../end is 409 if the ' +
          'round is not ACTIVE — most often because it was already ended, by a parallel run or by an ' +
          'instructor in the browser. The round is likely still ACTIVE on the live backend right now';

  return fail({
    id: 1,
    name: 'round lifecycle CONFIGURED → ACTIVE → ENDED',
    layer: 'lifecycle',
    summary: outOfOrder.length
      ? `observed ${path.join(' → ')} — every status appeared, but not in the required order`
      : `observed ${path.join(' → ') || '(nothing)'}; never reached ${missing.join(', ')}`,
    diagnosis: why,
    data,
  });
};
