/**
 * "Where your sales went" (spec 4.4): the round's revenue split into the
 * backend's lean profit terms (spec 7.4):
 *   profit = market_price x total_sales - cost_of_publishing x published_jokes
 *            - cost_of_discard x discarded_jokes - shipping - storage - hosting
 * so the segments always sum to revenue. In a loss there is no profit segment
 * and the bar is scaled to the total costs instead.
 */
export type FeeSegmentKey = 'shipping' | 'storage' | 'hosting' | 'listing' | 'profit';

export interface FeeBarInput {
  marketPrice: number;
  totalSales: number;
  costOfPublishing: number;
  costOfDiscard: number;
  publishedJokes: number;
  discardedJokes: number;
  shipping: number;
  storage: number;
  hosting: number;
}

export interface FeeBar {
  revenue: number;
  segments: Array<{ key: FeeSegmentKey; amount: number }>;
  /** Dollars lost (costs beyond revenue); null when the round is not in a loss. */
  loss: number | null;
  /** What the full bar width stands for: revenue, or total costs in a loss. */
  scaleTo: number;
}

/** Cents, so float noise (0.1 x 8) never leaks into a legend. */
const cents = (n: number): number => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;

export function feeBar(a: FeeBarInput): FeeBar {
  const revenue = cents(a.marketPrice * a.totalSales);
  const shipping = cents(a.shipping);
  const storage = cents(a.storage);
  const hosting = cents(a.hosting);
  const listing = cents(a.costOfPublishing * a.publishedJokes + a.costOfDiscard * a.discardedJokes);
  const costs = cents(shipping + storage + hosting + listing);
  const profit = cents(revenue - costs);
  const segments: FeeBar['segments'] = [
    { key: 'shipping', amount: shipping },
    { key: 'storage', amount: storage },
    { key: 'hosting', amount: hosting },
    { key: 'listing', amount: listing },
  ];
  if (profit < 0) return { revenue, segments, loss: -profit, scaleTo: costs };
  if (profit > 0) segments.push({ key: 'profit', amount: profit });
  return { revenue, segments, loss: null, scaleTo: revenue };
}
