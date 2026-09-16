/**
 * CLAIM 3 — THE HEADLINE. Twelve marketers claimed twelve batches: none claimed
 * twice, none left orphaned.
 *
 * WHY THIS IS THE ONE THAT MATTERS. `GET /v1/marketing/queue/next` is not a
 * read. ClaimNextBatch takes a LOCK: it either re-serves the batch this
 * marketer already holds (`... AND locked_by = $3`) or claims a fresh one and
 * writes `locked_by` on the way out. Twelve students press the same button in
 * the same second, every round, in every class. If that lock is not atomic, two
 * marketers split and publish the same batch and the second one's publish
 * either 403s in front of a room of students or silently overwrites the first's
 * editorial decisions. Neither failure produces an error anywhere a person
 * would look.
 *
 * HOW A DOUBLE CLAIM IS ACTUALLY DETECTED. Three independent signals, because
 * any one of them alone can be explained away:
 *
 *   1. DUPLICATE BATCH ID ACROSS TEAMS. Each marketer records the batch_id
 *      queue/next handed it. The same id appearing in two teams' claims is a
 *      double claim, full stop — it means two lock acquisitions succeeded
 *      against one row.
 *
 *   2. locked_by IS NOT THE CLAIMANT. This is the subtle one, and it is why the
 *      harness records the backend's own `locked_by` rather than trusting that
 *      a 200 means "mine". If marketer A's claim response carries marketer B's
 *      user id, then B won the race and A is holding a batch it does not own —
 *      A's next split/publish will 403 NOT_ASSIGNED_TO_THIS_MARKETER. Signal 1
 *      cannot see this when B's own claim landed on a different batch, so the
 *      two are genuinely independent.
 *
 *   3. CROSS-TEAM CLAIM. The queue is per-team by construction
 *      (CountSubmittedBatchesForTeam), so a marketer must be handed its OWN
 *      team's batch. Being handed another team's is a tenancy leak: the row
 *      filter is wrong, not just the lock.
 *
 * AND ORPHANS, which are the mirror image: a batch that was submitted and never
 * claimed by anyone. A lock that is taken and not released — or a claim that
 * errored after writing locked_by — hides a batch from the only queue that can
 * reach it, and the team simply never gets to publish. Nothing 500s. The
 * students just sit there.
 *
 * COVERAGE CAVEAT, stated rather than hidden: this assertion proves the twelve
 * claims that HAPPENED were disjoint. It cannot prove the lock is atomic under
 * a load this run did not produce. What it can do — and does — is report the
 * start spread, because twelve claims spread over thirty seconds is not a race
 * and a pass from it means much less.
 */

import { fail, pass, type Assertion } from './types';

/** Above this, the teams did not really run at once and the result says less
 *  than it looks like it says. Half a second is already generous: the whole
 *  concurrent phase fires from one Promise.all. */
const CONCURRENCY_SPREAD_WARN_MS = 500;

export const claimRace: Assertion = (evidence) => {
  const { teamCount, outcomes, startSpreadMs } = evidence;

  const submittedIds = new Set(
    outcomes.map((o) => o.submittedBatchId).filter((id): id is number => id !== null),
  );

  const claims = outcomes
    .filter((o) => o.claimedBatchId !== null)
    .map((o) => ({
      teamNumber: o.teamNumber,
      teamId: o.teamId,
      marketerUserId: o.marketing.userId,
      marketerName: o.marketing.displayName,
      batchId: o.claimedBatchId as number,
      lockedBy: o.claimedLockedBy,
      ownBatchId: o.submittedBatchId,
      queueSize: o.claimQueueSize,
    }));

  // ---- Signal 1: the same batch claimed by more than one team --------------
  const byBatch = new Map<number, typeof claims>();
  for (const c of claims) {
    const bucket = byBatch.get(c.batchId);
    if (bucket) bucket.push(c);
    else byBatch.set(c.batchId, [c]);
  }
  const doubleClaimed = [...byBatch.entries()].filter(([, cs]) => cs.length > 1);

  // ---- Signal 2: the backend says someone else holds the lock --------------
  const stolen = claims.filter((c) => c.lockedBy !== null && c.lockedBy !== c.marketerUserId);
  // A null locked_by is its own anomaly: ClaimNextBatch always writes it on the
  // way out, so a claimed batch with no holder means the lock was not taken.
  const unlocked = claims.filter((c) => c.lockedBy === null);

  // ---- Signal 3: a marketer handed another team's batch --------------------
  const crossTeam = claims.filter((c) => c.ownBatchId !== null && c.batchId !== c.ownBatchId);

  // ---- Orphans -------------------------------------------------------------
  const claimedIds = new Set(claims.map((c) => c.batchId));
  const orphans = [...submittedIds].filter((id) => !claimedIds.has(id));

  const data = {
    teamCount,
    submitted: submittedIds.size,
    claimed: claims.length,
    distinctClaims: claimedIds.size,
    startSpreadMs: Math.round(startSpreadMs),
    claims,
    doubleClaimed: doubleClaimed.map(([batchId, cs]) => ({
      batchId,
      byTeams: cs.map((c) => c.teamNumber),
      byMarketers: cs.map((c) => c.marketerUserId),
    })),
    stolen: stolen.map((c) => ({ ...c })),
    unlocked: unlocked.map((c) => ({ ...c })),
    crossTeam: crossTeam.map((c) => ({ ...c })),
    orphanBatchIds: orphans,
  };

  const notes: string[] = [];
  if (startSpreadMs > CONCURRENCY_SPREAD_WARN_MS) {
    notes.push(
      `the ${teamCount} teams started ${Math.round(startSpreadMs)}ms apart, not simultaneously — ` +
        'this run did not actually put the claim lock under contention, so a pass here is weaker ' +
        'than it reads',
    );
  } else {
    notes.push(
      `all ${teamCount} teams issued their first request within ${Math.round(startSpreadMs)}ms of ` +
        'each other, so the lock genuinely was contended',
    );
  }
  if (claims.length) {
    // Per-team, not global (CountSubmittedBatchesForTeam). A queue_size above 1
    // means a team submitted more than once, which this harness never does.
    notes.push(`queue_size at claim time, per team: ${claims.map((c) => c.queueSize ?? '?').join(', ')}`);
  }

  const clean =
    doubleClaimed.length === 0 &&
    stolen.length === 0 &&
    unlocked.length === 0 &&
    crossTeam.length === 0 &&
    orphans.length === 0 &&
    claimedIds.size === teamCount &&
    claims.length === teamCount;

  if (clean) {
    return pass({
      id: 3,
      name: 'claim race — distinct claims, no double claim, no orphan',
      layer: 'concurrency',
      summary:
        `${claimedIds.size}/${teamCount} distinct batches claimed by ${claims.length} marketers; ` +
        'every locked_by matched its claimant and every submitted batch was claimed exactly once',
      notes,
      data,
    });
  }

  const diagnoses: string[] = [];

  if (doubleClaimed.length) {
    diagnoses.push(
      `*** DOUBLE CLAIM *** batch(es) ${doubleClaimed
        .map(([id, cs]) => `${id} (teams ${cs.map((c) => c.teamNumber).join(' and ')})`)
        .join(', ')} were handed to more than one marketer. Two lock acquisitions succeeded against ` +
        'one row, so ClaimNextBatch is not atomic under contention — look for a SELECT-then-UPDATE ' +
        'without FOR UPDATE, or an UPDATE whose WHERE does not re-check locked_by, in ' +
        'infra/repo/postgres/marketing_repo.go. In a classroom this is two students editing the same ' +
        "batch and the second publish either 403ing or overwriting the first's decisions.",
    );
  }
  if (stolen.length) {
    diagnoses.push(
      `*** LOCK HELD BY SOMEONE ELSE *** ${stolen
        .map((c) => `team ${c.teamNumber}'s marketer u${c.marketerUserId} was served batch ${c.batchId}, ` +
          `but the backend says locked_by=u${c.lockedBy}`)
        .join('; ')}. The claim returned 200 to a marketer who does not hold the batch; its split and ` +
        'publish will 403 NOT_ASSIGNED_TO_THIS_MARKETER. Same root cause as a double claim, caught ' +
        'from the losing side.',
    );
  }
  if (unlocked.length) {
    diagnoses.push(
      `${unlocked.length} claim(s) came back with locked_by=null (teams ` +
        `${unlocked.map((c) => c.teamNumber).join(', ')}). ClaimNextBatch writes locked_by whenever it ` +
        'serves a batch, so a null here means the row was returned WITHOUT being locked — every other ' +
        'marketer can still claim it.',
    );
  }
  if (crossTeam.length) {
    diagnoses.push(
      `*** TENANCY LEAK *** ${crossTeam
        .map((c) => `team ${c.teamNumber} submitted batch ${c.ownBatchId} but was served ${c.batchId}`)
        .join('; ')}. The marketing queue is supposed to be per-team; this marketer can see, edit and ` +
        "publish another team's work.",
    );
  }
  if (orphans.length) {
    diagnoses.push(
      `*** ORPHANED *** batch(es) ${orphans.join(', ')} were submitted and never claimed by anyone. ` +
        'A batch invisible to the only queue that can reach it is a team that silently never gets to ' +
        'publish — no error, no 500, the students just wait. Check whether a stale locked_by survived ' +
        'the reset, and whether those teams\' marketers errored at claim (see their outcome in ' +
        'report.json).',
    );
  }
  if (!diagnoses.length) {
    diagnoses.push(
      `${claims.length} of ${teamCount} teams reached the claim step at all. The claims that happened ` +
        'were disjoint, so this is not a locking fault — it is upstream. Read the failed teams\' ' +
        'failedPhase and error in report.json.',
    );
  }

  return fail({
    id: 3,
    name: 'claim race — distinct claims, no double claim, no orphan',
    layer: 'concurrency',
    summary:
      `${claimedIds.size} distinct batch(es) claimed by ${claims.length} marketer(s) across ` +
      `${teamCount} team(s); ${doubleClaimed.length} double-claimed, ${stolen.length} lock-stolen, ` +
      `${crossTeam.length} cross-team, ${orphans.length} orphaned`,
    diagnosis: diagnoses.join('\n'),
    notes,
    data,
  });
};
