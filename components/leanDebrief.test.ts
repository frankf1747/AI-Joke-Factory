// components/leanDebrief.test.ts
import { describe, expect, it } from 'vitest';
import { debriefRows } from './LeanDebrief';

const r1 = { round_id: 1, leaderboard: [
  { rank: 1, team: { id: 7, name: 'Team 7' }, batches_processed: 8, total_sales: 60, published_jokes: 40, discarded_jokes: 0, total_jokes: 40, unsold_jokes: 20, profit: 23.2,
    lean: { batches_submitted: 8, setup_cost: 24, carrying_cost: 8.8, avg_submit_to_publish_s: 360, avg_publish_to_first_sale_s: 200, batch_series: [] } },
] };
const r2 = { round_id: 2, leaderboard: [
  { rank: 1, team: { id: 7, name: 'Team 7' }, batches_processed: 4, total_sales: 45, published_jokes: 10, discarded_jokes: 2, total_jokes: 12, unsold_jokes: 2, profit: 30.8,
    lean: { batches_submitted: 4, setup_cost: 4, carrying_cost: 1.2, avg_submit_to_publish_s: 120, avg_publish_to_first_sale_s: 90, batch_series: [] } },
] };

describe('debriefRows', () => {
  it('pairs each team across rounds and computes the deltas', () => {
    const rows = debriefRows(r1 as any, r2 as any);
    expect(rows).toHaveLength(1);
    expect(rows[0].team).toBe('Team 7');
    expect(rows[0].r1?.profit).toBe(23.2);
    expect(rows[0].r2?.profit).toBe(30.8);
    expect(rows[0].delta.profit).toBeCloseTo(7.6);
    expect(rows[0].delta.leadTimeS).toBe(-240);
  });
  it('tolerates a team present in one round only', () => {
    const rows = debriefRows(r1 as any, { round_id: 2, leaderboard: [] } as any);
    expect(rows[0].r2).toBeNull();
  });
  it('shows the instructor\'s renamed team name, as the leaderboard does', () => {
    const rows = debriefRows(r1 as any, r2 as any, { '7': 'The Punchliners' });
    expect(rows[0].team).toBe('The Punchliners');
    expect(debriefRows(r1 as any, r2 as any, { '8': 'Someone else' })[0].team).toBe('Team 7');
  });
  it('shows never-sold only for lean rows, never the classic unsold figure', () => {
    const classicR1 = { round_id: 1, leaderboard: [{ ...r1.leaderboard[0], lean: undefined }] };
    const series = [{ seq: 1, submitted_at: '', jokes: 5, published: 4, sold: 1 }];
    const leanR2 = { round_id: 2, leaderboard: [{ ...r2.leaderboard[0], lean: { ...r2.leaderboard[0].lean, batch_series: series } }] };
    const rows = debriefRows(classicR1 as any, leanR2 as any);
    expect(rows[0].r1?.unsold).toBeNull();
    expect(rows[0].r2?.unsold).toBe(3);
    expect(rows[0].delta.unsold).toBeNull();
  });
});
