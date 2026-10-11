import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LeanDebrief, debriefRows, type DebriefStats } from './LeanDebrief';

const stats = (profit: number, lean: Record<string, unknown>): DebriefStats => ({
  leaderboard: [{
    team: { id: 3, name: 'Team 3' }, profit, total_sales: 12, published_jokes: 10, unsold_jokes: 0,
    lean: { batches_submitted: 4, avg_submit_to_publish_s: 60, avg_publish_to_first_sale_s: 30, batch_series: [], setup_cost: 0, carrying_cost: 0, ...lean },
  }],
});

describe('Round 1 vs Round 2 fees', () => {
  it('adds shipping, storage and hosting into one Fees figure per round', () => {
    const rows = debriefRows(
      stats(1, { shipping_cost: 8, storage_cost: 1.5, hosting_cost: 0.25, setup_cost: 8, carrying_cost: 1.75 }),
      stats(4, { shipping_cost: 5, storage_cost: 0.5, hosting_cost: 0.1, setup_cost: 5, carrying_cost: 0.6 }),
    );
    expect(rows[0].r1?.fees).toBeCloseTo(9.75);
    expect(rows[0].r2?.fees).toBeCloseTo(5.6);
  });

  it('reads an older backend\'s setup and carrying costs as the fees', () => {
    const rows = debriefRows(stats(1, { setup_cost: 4, carrying_cost: 2 }), null);
    expect(rows[0].r1?.fees).toBe(6);
  });

  it('heads the column Fees, never setup+carry', () => {
    const out = renderToStaticMarkup(createElement(LeanDebrief, {
      r1: stats(1, { shipping_cost: 8, storage_cost: 1.5, hosting_cost: 0.25 }),
      r2: stats(4, { shipping_cost: 5, storage_cost: 0.5, hosting_cost: 0.1 }),
    }));
    expect(out).toContain('R1 Fees');
    expect(out).toContain('R2 Fees');
    expect(out).toContain('$9.75');
    expect(out).toContain('$5.60');
    expect(out).not.toContain('setup+carry');
  });
});
