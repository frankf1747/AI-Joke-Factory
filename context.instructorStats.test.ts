import { describe, it, expect } from 'vitest';
import { normalizeInstructorStats } from './context';

/* The instructor leaderboard, the Round 1 vs Round 2 table and the learning
   curve all decide a round is Lean from the `lean` block the backend nests on
   each leaderboard row. The normalizer rebuilds rows field by field, so it must
   carry that block through, and must not invent one for a Classic row. */
describe('normalizeInstructorStats', () => {
  const lean = {
    batches_submitted: 8, setup_cost: 4, carrying_cost: 24.37,
    avg_submit_to_publish_s: 3.7, avg_publish_to_first_sale_s: 3.7,
    batch_series: [{ seq: 1, submitted_at: '2026-10-07T03:27:49Z', jokes: 5, published: 5, sold: 3 }],
  };
  const row = (extra: object) => ({
    rank: 1, team: { id: 3, name: 'Team 3' }, batches_processed: 8, total_sales: 201,
    published_jokes: 40, discarded_jokes: 0, total_jokes: 40, unsold_jokes: 0, profit: 168.63, ...extra,
  });

  it('keeps the lean block on Lean rows', () => {
    const out = normalizeInstructorStats({ data: { round_id: 2, leaderboard: [row({ lean })] } });
    expect(out.leaderboard[0].lean).toEqual(lean);
  });

  it('leaves Classic rows without a lean block', () => {
    const out = normalizeInstructorStats({ data: { round_id: 1, leaderboard: [row({})] } });
    expect(out.leaderboard[0]).not.toHaveProperty('lean');
  });
});
