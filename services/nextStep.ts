/* The "Next step" line on the two student screens: one sentence that tells
   the seat what to do now. Pure: the screen passes in what it already loads,
   time included (`now`), and the first rule that matches wins
   (docs/superpowers/specs/2026-10-11-lean-fees-next-step-design.md §6).
   An input the screen does not have yet is null, and the rule that needs it
   is skipped. */
import type { Batch } from '../types';
import type { FeedbackRow } from '../views/feedback';
import { summarizeFeedback } from './feedbackSummary';
import { fmtPerMinute } from './leanMode';

export type NextStepTone = 'info' | 'warn';
export interface NextStep { text: string; tone: NextStepTone }

export interface JokeMakerStepInput {
  now: number;
  roundActive: boolean;
  roundNumber: 1 | 2;
  /** Batches waiting on Marketing's desk (the team summary's unprocessed_batches); null = unknown. */
  marketingBacklog: number | null;
  /** ms epoch of the team's latest sent batch; null = none sent (or unknown). */
  lastSentAt: number | null;
  /** Joke count of the latest sent batch; null while it is unsplit (or unknown). */
  lastBatchJokes: number | null;
  /** The latest processed batch's note from Marketing, when it has one. */
  latestNote: { text: string; batchSentAt: number } | null;
}

export interface MarketingStepInput {
  now: number;
  roundActive: boolean;
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

/** A note counts as fresh while its batch was sent at most this long ago. */
export const NOTE_FRESH_MS = 120_000;
/** Round 2: a last batch of at least this many jokes earns the small-batch hint. */
export const BIG_BATCH_JOKES = 6;
/** The Joke Maker is idle once this long has passed since the last batch. */
export const JM_IDLE_MS = 90_000;
/** A batch on Marketing's desk this long (seconds) is waiting too long. */
export const DESK_WAIT_S = 45;
/** Discarding at least this share of a batch earns the empty-shelf warning. */
export const DISCARD_WARN_SHARE = 0.6;
/** Notes are quoted up to this many characters. */
export const NOTE_QUOTE_CHARS = 80;

const info = (text: string): NextStep => ({ text, tone: 'info' });
const warn = (text: string): NextStep => ({ text, tone: 'warn' });

/** Marketing's note on one line: whitespace runs collapsed, cut at 80 characters with "…". */
export function quoteNote(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const chars = Array.from(flat);
  return chars.length > NOTE_QUOTE_CHARS ? `${chars.slice(0, NOTE_QUOTE_CHARS).join('')}…` : flat;
}

export function jokeMakerNextStep(i: JokeMakerStepInput): NextStep {
  if (!i.roundActive) return info('Get your AI tool ready — the round starts soon.');
  const note = i.latestNote?.text.trim() ? i.latestNote : null;
  if (note && i.now - note.batchSentAt <= NOTE_FRESH_MS) {
    return info(`Marketing says: “${quoteNote(note.text)}” — use it in your next batch.`);
  }
  if (i.roundNumber === 2 && i.lastBatchJokes != null && i.lastBatchJokes >= BIG_BATCH_JOKES) {
    return warn('Big batches wait longer for feedback — try 2 or 3 jokes next.');
  }
  if (i.marketingBacklog === 0) {
    return info(i.roundNumber === 1
      ? "Marketing's desk is empty — send your next batch of 5."
      : "Marketing's desk is empty — send a small batch now.");
  }
  if (i.lastSentAt != null && i.now - i.lastSentAt >= JM_IDLE_MS) {
    return warn('No batch sent in 90 s — keep the line moving.');
  }
  return info('Keep writing — every batch is another chance to sell.');
}

export function marketingNextStep(i: MarketingStepInput): NextStep {
  if (!i.roundActive) return info("Watch the desk — your Joke Maker's first batch is coming.");
  if (i.deskBatchSentAt != null) {
    const waited = Math.floor((i.now - i.deskBatchSentAt) / 1000);
    if (waited >= DESK_WAIT_S) {
      return warn(`Batch waiting ${waited} s — release what's good enough. Storage costs ${fmtPerMinute(i.storageFeePerJokeMinute)}.`);
    }
  }
  if (i.lastDecision) {
    const { published, discarded } = i.lastDecision;
    const total = published + discarded;
    if (total > 0 && discarded / total >= DISCARD_WARN_SHARE) {
      return warn(`You discarded ${discarded} of ${total} last time — customers can only buy what's on the shelf.`);
    }
  }
  if (i.topFixNext) return info(`Tell your Joke Maker: fix ${i.topFixNext} next.`);
  if (i.deskEmpty === true) return info('Desk is clear — nudge your Joke Maker to send the next batch.');
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
  teamSummary: { unprocessed_batches?: number } | null;
  batches: readonly Batch[];
}): JokeMakerStepInput {
  const lastSent = latestBy(a.batches, b => b.submittedAt);
  const lastProcessed = latestBy(a.batches.filter(isProcessed), b => b.ratedAt ?? b.submittedAt);
  const noteText = lastProcessed?.marketing_note ?? null;
  return {
    now: a.now,
    roundActive: a.roundActive,
    roundNumber: a.round === 2 ? 2 : 1,
    marketingBacklog: finiteOrNull(a.teamSummary?.unprocessed_batches),
    lastSentAt: lastSent?.submittedAt ?? null,
    lastBatchJokes: lastSent && lastSent.jokes.length > 0 ? lastSent.jokes.length : null,
    latestNote: noteText && noteText.trim() && lastProcessed?.submittedAt != null
      ? { text: noteText, batchSentAt: lastProcessed.submittedAt }
      : null,
  };
}

/** Marketing's inputs: the desk (claimed batch), the team's batches, summary and feedback. */
export function marketingInputFrom(a: {
  now: number;
  roundActive: boolean;
  storageFeePerJokeMinute: number;
  teamSummary: { unprocessed_batches?: number } | null;
  qcQueue: { batch?: { submitted_at?: string } | null } | null;
  batches: readonly Batch[];
  feedbackRows: readonly FeedbackRow[];
}): MarketingStepInput {
  const desk = a.qcQueue?.batch ?? null;
  const sentAt = desk?.submitted_at ? Date.parse(desk.submitted_at) : NaN;
  const backlog = finiteOrNull(a.teamSummary?.unprocessed_batches);
  const decided = latestBy(a.batches.filter(b => isProcessed(b) && b.jokes.length > 0), b => b.ratedAt ?? b.submittedAt);
  const published = decided ? decided.jokes.filter(j => j.is_published === true).length : 0;
  return {
    now: a.now,
    roundActive: a.roundActive,
    storageFeePerJokeMinute: a.storageFeePerJokeMinute,
    deskBatchSentAt: Number.isFinite(sentAt) ? sentAt : null,
    deskEmpty: desk ? false : backlog == null ? null : backlog === 0,
    lastDecision: decided ? { published, discarded: decided.jokes.length - published } : null,
    topFixNext: summarizeFeedback(a.feedbackRows).fix[0]?.label ?? null,
  };
}
