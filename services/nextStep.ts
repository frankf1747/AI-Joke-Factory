/* The "Next step" line on the two student screens: one sentence that tells
   the seat what to do now. Pure: the screen passes in what it already loads,
   time included (`now`), and the first rule that matches wins
   (docs/superpowers/specs/2026-10-11-lean-fees-next-step-design.md §6).
   An input the screen does not have yet is null, and the rule that needs it
   is skipped. */
import type { Batch } from '../types';
import type { FeedbackRow } from '../views/feedback';
import { summarizeFeedback } from './feedbackSummary';
import { fmtDuration } from './format';
import { fmtPerMinute } from './leanMode';

export type NextStepTone = 'info' | 'warn';
export interface NextStep { text: string; tone: NextStepTone }

export interface JokeMakerStepInput {
  now: number;
  roundActive: boolean;
  /** The final round has ended: the class is over and the debrief follows. */
  classOver: boolean;
  roundNumber: 1 | 2;
  /** Batches waiting on Marketing's desk (the team summary's unprocessed_batches); null = unknown. */
  marketingBacklog: number | null;
  /** ms epoch of the team's latest sent batch; null = none sent (or unknown). */
  lastSentAt: number | null;
  /** Joke count of the latest sent batch; null while it is unsplit (or unknown). */
  lastBatchJokes: number | null;
  /* No Marketing note here on purpose: students find the note inside the batch
     in the Value stream, so the Next step line never quotes it. */
}

export interface MarketingStepInput {
  now: number;
  roundActive: boolean;
  /** The final round has ended: the class is over and the debrief follows. */
  classOver: boolean;
  /** The round's storage fee, per joke per minute. */
  storageFeePerJokeMinute: number;
  /** ms epoch the batch on the desk was sent; null = no batch on the desk (or unknown). */
  deskBatchSentAt: number | null;
  /** True when no batch is waiting at all; null = unknown. */
  deskEmpty: boolean | null;
  /** The last released or discarded batch: how many jokes went out and how many were dropped. */
  lastDecision: { published: number; discarded: number } | null;
  /** The top "Fix next" criterion of the customer feedback (summarizeFeedback). */
  topFixNext: string | null;
}

/** Round 2: a last batch of at least this many jokes earns the small-batch hint. */
export const BIG_BATCH_JOKES = 6;
/** The Joke Maker is idle once this long has passed since the last batch. */
export const JM_IDLE_MS = 90_000;
/** A batch on Marketing's desk this long (seconds) is waiting too long. */
export const DESK_WAIT_S = 45;
/** Discarding at least this share of a batch earns the empty-shelf warning. */
export const DISCARD_WARN_SHARE = 0.6;

/** The game has two rounds; once this one has ended the class moves to the debrief. */
export const FINAL_ROUND = 2;
/** Both seats, after the final round has ended (before rule 1). */
export const CLASS_OVER_TEXT = 'Round over. Join the debrief.';

type RoundStatusOf = 'CONFIGURED' | 'ACTIVE' | 'ENDED' | null;
/** True once the final round has ENDED; between rounds (Round 1 ended, Round 2 not started) it is false. */
function classOverFrom(roundActive: boolean, statuses: Readonly<Record<1 | 2, RoundStatusOf>> | undefined): boolean {
  return !roundActive && statuses?.[FINAL_ROUND] === 'ENDED';
}

const info = (text: string): NextStep => ({ text, tone: 'info' });
const warn = (text: string): NextStep => ({ text, tone: 'warn' });

export function jokeMakerNextStep(i: JokeMakerStepInput): NextStep {
  if (i.classOver) return info(CLASS_OVER_TEXT);
  if (!i.roundActive) return info('Get your AI tool ready. The round starts soon.');
  if (i.roundNumber === 2 && i.lastBatchJokes != null && i.lastBatchJokes >= BIG_BATCH_JOKES) {
    return warn('Big batches wait longer for feedback. Try 2 or 3 jokes next.');
  }
  if (i.marketingBacklog === 0) {
    return info(i.roundNumber === 1
      ? "Marketing's desk is empty. Send your next batch of 5."
      : "Marketing's desk is empty. Send a small batch now.");
  }
  if (i.lastSentAt != null && i.now - i.lastSentAt >= JM_IDLE_MS) {
    return warn('No batch sent in 90 s. Keep the line moving.');
  }
  return info('Keep writing. Every batch is another chance to sell.');
}

export function marketingNextStep(i: MarketingStepInput): NextStep {
  if (i.classOver) return info(CLASS_OVER_TEXT);
  if (!i.roundActive) return info("Watch the desk. Your Joke Maker's first batch is coming.");
  if (i.deskBatchSentAt != null) {
    const waited = Math.floor((i.now - i.deskBatchSentAt) / 1000);
    if (waited >= DESK_WAIT_S) {
      const storage = i.storageFeePerJokeMinute > 0 ? ` Storage costs ${fmtPerMinute(i.storageFeePerJokeMinute)}.` : '';
      return warn(`Batch waiting ${fmtDuration(waited)}. Release what's good enough.${storage}`);
    }
  }
  if (i.lastDecision) {
    const { published, discarded } = i.lastDecision;
    const total = published + discarded;
    if (total > 0 && discarded / total >= DISCARD_WARN_SHARE) {
      return warn(`You discarded ${discarded} of ${total} last time. Customers can only buy what's on the shelf.`);
    }
  }
  if (i.topFixNext) return info(`Tell your Joke Maker: fix ${i.topFixNext} next.`);
  if (i.deskEmpty === true) return info('Desk is clear. Nudge your Joke Maker to send the next batch.');
  return info("Release what's good enough, then tell your Joke Maker what to change.");
}

/* ---- Inputs from what the screens already load ------------------------- */

const isProcessed = (b: Batch) => b.status === 'PROCESSED' || b.status === 'RATED';

/** The batch with the latest value of `at`; batches without it are skipped, ties go to the higher id. */
function latestBy(batches: readonly Batch[], at: (b: Batch) => number | undefined): Batch | null {
  let best: Batch | null = null;
  let bestAt = -Infinity;
  for (const b of batches) {
    const t = at(b);
    if (t == null || !Number.isFinite(t)) continue;
    if (t > bestAt || (t === bestAt && best != null && b.batch_id > best.batch_id)) {
      best = b;
      bestAt = t;
    }
  }
  return best;
}

const finiteOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** The Joke Maker's inputs: its own team's batches and team summary. */
export function jokeMakerInputFrom(a: {
  now: number;
  roundActive: boolean;
  round: number;
  /** Round 1 and Round 2 statuses, when the screen knows them. */
  roundStatuses?: Readonly<Record<1 | 2, RoundStatusOf>>;
  teamSummary: { unprocessed_batches?: number } | null;
  batches: readonly Batch[];
}): JokeMakerStepInput {
  const lastSent = latestBy(a.batches, b => b.submittedAt);
  return {
    now: a.now,
    roundActive: a.roundActive,
    classOver: classOverFrom(a.roundActive, a.roundStatuses),
    roundNumber: a.round === 2 ? 2 : 1,
    marketingBacklog: finiteOrNull(a.teamSummary?.unprocessed_batches),
    lastSentAt: lastSent?.submittedAt ?? null,
    lastBatchJokes: lastSent && lastSent.jokes.length > 0 ? lastSent.jokes.length : null,
  };
}

/**
 * Marketing's inputs: the desk (claimed batch), the team's batches, summary and
 * feedback. The batch list can include the browser's stored rated history,
 * which may hold earlier rounds (or an earlier class), so the last decision
 * reads only the current round's batches: by round id when both sides know
 * it, else by round number.
 */
export function marketingInputFrom(a: {
  now: number;
  roundActive: boolean;
  /** The current round's number. */
  round: number;
  /** The current round's id, when known. */
  roundId?: number | null;
  /** Round 1 and Round 2 statuses, when the screen knows them. */
  roundStatuses?: Readonly<Record<1 | 2, RoundStatusOf>>;
  storageFeePerJokeMinute: number;
  teamSummary: { unprocessed_batches?: number } | null;
  qcQueue: { batch?: { submitted_at?: string } | null } | null;
  batches: readonly Batch[];
  feedbackRows: readonly FeedbackRow[];
}): MarketingStepInput {
  const desk = a.qcQueue?.batch ?? null;
  const sentAt = desk?.submitted_at ? Date.parse(desk.submitted_at) : NaN;
  const backlog = finiteOrNull(a.teamSummary?.unprocessed_batches);
  // List-mapped batches carry round_id 0 (the team list has no round id), so a
  // 0 or missing round_id is unknown and the round number decides.
  const thisRound = (b: Batch) => (a.roundId != null && b.round_id ? b.round_id === a.roundId : b.round === a.round);
  const decided = latestBy(
    a.batches.filter(b => thisRound(b) && isProcessed(b) && b.jokes.length > 0), b => b.ratedAt ?? b.submittedAt,
  );
  const published = decided ? decided.jokes.filter(j => j.is_published === true).length : 0;
  return {
    now: a.now,
    roundActive: a.roundActive,
    classOver: classOverFrom(a.roundActive, a.roundStatuses),
    storageFeePerJokeMinute: a.storageFeePerJokeMinute,
    deskBatchSentAt: Number.isFinite(sentAt) ? sentAt : null,
    deskEmpty: desk ? false : backlog == null ? null : backlog === 0,
    lastDecision: decided ? { published, discarded: decided.jokes.length - published } : null,
    topFixNext: summarizeFeedback(a.feedbackRows).fix[0]?.label ?? null,
  };
}
