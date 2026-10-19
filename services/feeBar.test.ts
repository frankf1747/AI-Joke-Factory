import { describe, expect, it } from 'vitest';
import { feeBar } from './feeBar';

const base = {
  marketPrice: 1, totalSales: 23, costOfPublishing: 0.1, costOfDiscard: 0.01,
  publishedJokes: 8, discardedJokes: 2, shipping: 6, storage: 1.95, hosting: 1.65, profit: 12.58,
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
    const bar = feeBar({ ...base, shipping: 30, profit: -11.42 });
    expect(bar.loss).toBe(11.42);
    expect(bar.segments.map(s => s.key)).toEqual(['shipping', 'storage', 'hosting', 'listing']);
    expect(bar.scaleTo).toBe(34.42);
  });

  it('no sales and no fees is an empty bar, not NaN', () => {
    const bar = feeBar({ ...base, totalSales: 0, publishedJokes: 0, discardedJokes: 0, shipping: 0, storage: 0, hosting: 0, profit: 0 });
    expect(bar.revenue).toBe(0);
    expect(bar.loss).toBeNull();
    expect(bar.scaleTo).toBe(0);
    expect(bar.segments.every(s => s.amount === 0)).toBe(true);
  });

  it("takes profit from the summary, so it matches the Scoreboard to the cent", () => {
    // Each fee rounds down by 0.004, so profit from the rounded fees would read 7.00.
    const odd = { ...base, marketPrice: 1, totalSales: 10, publishedJokes: 0, discardedJokes: 0, shipping: 1.004, storage: 1.004, hosting: 1.004 };
    const bar = feeBar({ ...odd, profit: 6.988 });
    expect(bar.segments.find(s => s.key === 'profit')?.amount).toBe(6.99);
    expect(bar.segments.find(s => s.key === 'shipping')?.amount).toBe(1);
    const loss = feeBar({ ...odd, totalSales: 2, profit: -1.012 });
    expect(loss.loss).toBe(1.01);
  });
});
