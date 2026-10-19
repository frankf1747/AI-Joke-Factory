import { describe, expect, it } from 'vitest';
import { classTotals, type LeaderboardRow } from './classTotals';

const row = (id: number, over: Partial<LeaderboardRow> = {}): LeaderboardRow => ({
  rank: id, team: { id, name: `Team ${id}` }, points: 0, total_sales: 10, unsold_jokes: 0, discarded_jokes: 1,
  batches_processed: 3, profit: 2.5, total_jokes: 9, published_jokes: 8, ...over,
});

const lean = (fees: { shipping_cost: number; storage_cost: number; hosting_cost: number }, series: Array<{ published: number; sold: number }>) => ({
  batches_submitted: series.length, setup_cost: 0, carrying_cost: 0, avg_submit_to_publish_s: 60, avg_publish_to_first_sale_s: 30,
  ...fees,
  batch_series: series.map((b, i) => ({ seq: i + 1, submitted_at: '', jokes: 5, ...b })),
});

describe('classTotals', () => {
  it('sums sales, profit, released and fees over Lean rows, and counts never-sold jokes per batch', () => {
    const rows = [
      row(1, { total_sales: 12, profit: 4.5, published_jokes: 9, lean: lean({ shipping_cost: 6, storage_cost: 1.5, hosting_cost: 0.5 }, [{ published: 5, sold: 3 }, { published: 4, sold: 4 }]) }),
      row(2, { total_sales: 3, profit: -1.25, published_jokes: 6, lean: lean({ shipping_cost: 4, storage_cost: 0.25, hosting_cost: 0.75 }, [{ published: 6, sold: 1 }]) }),
    ];
    expect(classTotals(rows, true)).toEqual({
      sales: 15, profit: 3.25, best: 4.5, worst: -1.25, released: 15, neverSold: 7, fees: 13,
    });
  });

  it('gives no never-sold or fee totals for a Classic round', () => {
    const t = classTotals([row(1, { profit: 2 }), row(2, { profit: 5 })], false);
    expect(t.neverSold).toBeNull();
    expect(t.fees).toBeNull();
    expect(t.sales).toBe(20);
    expect(t.profit).toBe(7);
    expect(t.best).toBe(5);
    expect(t.worst).toBe(2);
  });

  it('has no best or worst before any team is on the board', () => {
    expect(classTotals([], true)).toEqual({ sales: 0, profit: 0, best: null, worst: null, released: 0, neverSold: 0, fees: 0 });
  });
});
