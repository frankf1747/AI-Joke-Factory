/* Marketing desk decisions, pure and JSX-free so the rules are testable
   (services/desk.test.ts). Consumed by views/QualityControl.tsx. */
import type { Batch } from '../types';
import { marketingNoteOf } from '../components/MarketingNote';
import { isProcessed, jokeState } from './jokeState';

/** Batches waiting behind the one on the desk, or null while queue/count is unknown.
    queue_size counts every SUBMITTED batch of the team, the desk batch included. */
export function moreWaiting(queueSize: number | null, hasDeskBatch: boolean): number | null {
  if (queueSize === null) return null;
  return Math.max(0, queueSize - (hasDeskBatch ? 1 : 0));
}

/** The desk header's count: "2 more waiting", "nothing else waiting", or null while unknown. */
export function moreWaitingLabel(n: number | null): string | null {
  if (n === null) return null;
  return n === 0 ? 'nothing else waiting' : `${n} more waiting`;
}

export interface SplitStatusInput {
  /** Pieces already cut. The uncut remainder is not a joke yet. */
  cuts: number;
  remainder: string;
  round: 1 | 2;
  batchSize: number;
  /** Round 2 batch limit. */
  limit: number;
}

export interface SplitStatus {
  /** Jokes the split will produce: the cut pieces. */
  count: number;
  valid: boolean;
  message: string;
}

export function splitStatus(a: SplitStatusInput): SplitStatus {
  const count = a.cuts;
  if (a.remainder.trim() !== '') {
    return {
      count, valid: false,
      message: count === 0 ? 'Split at least one joke first.' : 'Split the remaining text to finish.',
    };
  }
  if (count === 0) return { count, valid: false, message: 'Split at least one joke first.' };
  if (a.round === 1) {
    return count === a.batchSize
      ? { count, valid: true, message: 'All split. Check the jokes, then confirm.' }
      : { count, valid: false, message: `Round 1 needs exactly ${a.batchSize} jokes; you have ${count}.` };
  }
  return count <= a.limit
    ? { count, valid: true, message: 'All split. Check the jokes, then confirm.' }
    : { count, valid: false, message: `Round 2 allows up to ${a.limit}; you have ${count}.` };
}

export interface LatestRelease {
  batchId: number;
  published: number;
  discarded: number;
  noteSent: boolean;
}

/** This team's most recently processed batch (largest ratedAt; the list is sorted by id),
    or null when none has been released yet. Published and discarded are read through
    jokeState, so legacy jokes without publish_status fall back to is_published. */
export function latestRelease(batches: Batch[]): LatestRelease | null {
  let best: Batch | null = null;
  for (const b of batches) {
    if (!isProcessed(b) || b.ratedAt === undefined || Number.isNaN(b.ratedAt)) continue;
    if (best === null || b.ratedAt > (best.ratedAt as number)) best = b;
  }
  if (best === null) return null;
  const states = best.jokes.map(j => jokeState(j, best as Batch));
  return {
    batchId: best.batch_id,
    published: states.filter(st => st === 'selling' || st === 'lost-buyers' || st === 'no-buyer').length,
    discarded: states.filter(st => st === 'not-released').length,
    noteSent: marketingNoteOf(best) !== null,
  };
}
