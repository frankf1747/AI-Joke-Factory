/* Marketing desk decisions, pure and JSX-free so the rules are testable
   (services/desk.test.ts). Consumed by views/QualityControl.tsx. */
import type { Batch } from '../types';
import { marketingNoteOf } from '../components/MarketingNote';

/** Batches waiting behind the one on the desk, or null while queue/count is unknown.
    queue_size counts every SUBMITTED batch of the team, the desk batch included. */
export function moreWaiting(queueSize: number | null, hasDeskBatch: boolean): number | null {
  if (queueSize === null) return null;
  return Math.max(0, queueSize - (hasDeskBatch ? 1 : 0));
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
    or null when none has been released yet. */
export function latestRelease(batches: Batch[]): LatestRelease | null {
  let best: Batch | null = null;
  for (const b of batches) {
    if (b.ratedAt === undefined || Number.isNaN(b.ratedAt)) continue;
    if (best === null || b.ratedAt > (best.ratedAt as number)) best = b;
  }
  if (best === null) return null;
  return {
    batchId: best.batch_id,
    published: best.jokes.filter(j => j.publish_status === 'PUBLISHED').length,
    discarded: best.jokes.filter(j => j.publish_status === 'DISCARDED').length,
    noteSent: marketingNoteOf(best) !== null,
  };
}
