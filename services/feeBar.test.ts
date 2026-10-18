import { describe, expect, it } from 'vitest';
import { feeBar } from './feeBar';

const base = {
  marketPrice: 1, totalSales: 23, costOfPublishing: 0.1, costOfDiscard: 0.01,
  publishedJokes: 8, discardedJokes: 2, shipping: 6, storage: 1.95, hosting: 1.65,
};

describe('feeBar', () => {
  it('splits revenue into the lean profit terms, summing to revenue', () => {
    const bar = feeBar(base);
    expect(bar.revenue).toBe(23);
    expect(bar.segments).toEqual([
      { key: 'shipping', amount: 6 },
      { key: 'storage', amount: 1.95 },
      { key: 'hosting', amount: 1.65 },
      { key: 'listing', amount: 0.82 },
      { key: 'profit', amount: 12.58 },
    ]);
    expect(bar.loss).toBeNull();
    expect(bar.scaleTo).toBe(23);
    const sum = bar.segments.reduce((s, x) => s + x.amount, 0);
    expect(Math.round(sum * 100) / 100).toBe(23);
  });

  it('a loss drops the profit segment and scales the bar to total costs', () => {
    const bar = feeBar({ ...base, shipping: 30 });
    expect(bar.loss).toBe(11.42);
    expect(bar.segments.map(s => s.key)).toEqual(['shipping', 'storage', 'hosting', 'listing']);
    expect(bar.scaleTo).toBe(34.42);
  });

  it('no sales and no fees is an empty bar, not NaN', () => {
    const bar = feeBar({ ...base, totalSales: 0, publishedJokes: 0, discardedJokes: 0, shipping: 0, storage: 0, hosting: 0 });
    expect(bar.revenue).toBe(0);
    expect(bar.loss).toBeNull();
    expect(bar.scaleTo).toBe(0);
    expect(bar.segments.every(s => s.amount === 0)).toBe(true);
  });
});
