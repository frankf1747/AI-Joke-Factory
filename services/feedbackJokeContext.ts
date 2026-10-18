/* Where each joke in Marketing's customer feedback came from, for the pop-out
   matrix: its batch, its place in that batch, its text, when it went to market
   and how many customers hold it now.

   The feedback (views/feedback.ts) names a joke by id and title only; the team
   batch list carries the rest. Both are polled for Marketing, feedback first,
   so a joke released a moment ago can be in the feedback before it is in the
   batch list. Such a joke keeps its title and gets nulls until the next poll. */
import type { Batch } from '../types';
import type { FeedbackRow } from '../views/feedback';

export type FeedbackJoke = FeedbackRow & {
  batchId: number | null;
  /** 1-based index in the batch's `jokes`. */
  position: number | null;
  text: string | null;
  /** Epoch ms: the joke's `published_at`, or its batch's processed time when that is missing. */
  releasedAt: number | null;
  /** Customers who hold the joke right now (`sold_count`). */
  soldCount: number | null;
};

const NONE = { batchId: null, position: null, text: null, releasedAt: null, soldCount: null } as const;

export function feedbackJokeContext(rows: readonly FeedbackRow[], batches: readonly Batch[]): FeedbackJoke[] {
  const byJoke = new Map<number, Omit<FeedbackJoke, keyof FeedbackRow>>();
  for (const b of batches) {
    b.jokes.forEach((j, i) => {
      const published = j.published_at ? Date.parse(j.published_at) : NaN;
      const processed = b.ratedAt ?? NaN;
      const releasedAt = Number.isFinite(published) ? published : Number.isFinite(processed) ? processed : null;
      byJoke.set(j.joke_id, {
        batchId: b.batch_id,
        position: i + 1,
        text: j.joke_text,
        releasedAt,
        soldCount: j.sold_count ?? null,
      });
    });
  }
  return rows.map(r => ({ ...r, ...(byJoke.get(r.joke_id) ?? NONE) }));
}
