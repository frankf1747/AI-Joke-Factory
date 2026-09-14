import { describe, it, expect } from 'vitest';
import { mapBatchFromTeamList } from './context';

/* Captured from GET /v1/rounds/1/teams/1/batches against the live backend.
   The backend sends processed_at (not rated_at), PROCESSED (not RATED), and
   publish_status (not is_published). */
const realBatch = {
  batch_id: 1,
  status: 'PROCESSED' as const,
  submitted_at: '2026-09-13T21:33:10.000000-07:00',
  processed_at: '2026-09-13T21:33:19.011937-07:00',
  jokes: [
    {
      joke_id: 1, joke_text: 'a', joke_title: 'Crossing Over',
      publish_status: 'PUBLISHED', sold_count: 5,
      published_at: '2026-09-13T21:33:19.011937-07:00',
      first_sold_at: '2026-09-13T21:33:19.028595-07:00',
    },
    {
      joke_id: 2, joke_text: 'b', joke_title: null,
      publish_status: 'DISCARDED', sold_count: 0,
      published_at: null, first_sold_at: null,
    },
  ],
};

describe('mapBatchFromTeamList', () => {
  it('reads the publish timestamp from processed_at', () => {
    const b = mapBatchFromTeamList(1, 1 as never, realBatch as never);
    expect(b.ratedAt).toBe(Date.parse(realBatch.processed_at));
    // computeAvgCreatedToPublishSeconds (services/economics.ts:103) reads the raw string,
    // not the parsed number, so the "Created to Publish" tile needs this one too.
    expect(b.rated_at).toBe(realBatch.processed_at);
  });

  it('derives is_published from publish_status', () => {
    const b = mapBatchFromTeamList(1, 1 as never, realBatch as never);
    expect((b.jokes[0] as never as { is_published: boolean }).is_published).toBe(true);
    expect((b.jokes[1] as never as { is_published: boolean }).is_published).toBe(false);
  });

  it('keeps the real sales figures', () => {
    const b = mapBatchFromTeamList(1, 1 as never, realBatch as never);
    expect((b.jokes[0] as never as { sold_count: number }).sold_count).toBe(5);
  });

  it('survives a null jokes array', () => {
    // handler/batch.go declares `var jokes []gin.H`, so an empty batch sends null, not [].
    const b = mapBatchFromTeamList(1, 1 as never, { ...realBatch, jokes: null } as never);
    expect(b.jokes).toEqual([]);
  });
});
