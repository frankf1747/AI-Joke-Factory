import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { FeesAndWaits } from './FeesAndWaits';
import { TEST_CONFIG } from '../views/testing/renderWithGame';
import type { ApiTeamSummaryResponse } from '../types';
import type { LeanTeamStats } from '../types/api';

const summary = (lean: Partial<LeanTeamStats> = {}, over: Partial<ApiTeamSummaryResponse> = {}): ApiTeamSummaryResponse => ({
  team: { id: 1, name: 'Team 1' }, round_id: 1, rank: 1, points: 0, total_sales: 23, profit: 12.58,
  batches_created: 4, batches_processed: 4, published_jokes: 8, unprocessed_batches: 0, discarded_jokes: 2,
  lean: {
    batches_submitted: 4, shipping_cost: 6, storage_cost: 1.95, hosting_cost: 1.65, setup_cost: 6, carrying_cost: 3.6,
    avg_submit_to_publish_s: 161, avg_publish_to_first_sale_s: 52, batch_series: [], ...lean,
  },
  ...over,
});

const render = (s: ApiTeamSummaryResponse | null, extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(<FeesAndWaits summary={s} config={TEST_CONFIG} storageKey="k" initialOpen {...extra} />);
const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'");

describe('FeesAndWaits', () => {
  it('is collapsed by default: a "Fees and wait times" button, no charts', () => {
    const out = renderToStaticMarkup(<FeesAndWaits summary={summary()} config={TEST_CONFIG} storageKey="k" />);
    expect(out).toContain('Fees and wait times');
    expect(out).toContain('aria-expanded="false"');
    expect(out).not.toContain('Where your sales went');
  });

  it('carries the tour id on the disclosure', () => {
    expect(render(summary(), { tourId: 'mk-more' })).toContain('data-tour="mk-more"');
  });

  it('chart 1 gives each amount in the legend and a hover title per segment', () => {
    const out = render(summary());
    const t = text(out);
    expect(t).toContain('Where your sales went');
    for (const l of ['Shipping', '4 batches sent', 'Storage', "while on Marketing's desk", 'Hosting', 'while no one has bought', 'Listing and discard fees', 'Profit', 'what you kept']) {
      expect(t).toContain(l);
    }
    for (const a of ['$23.00', '$6.00', '$1.95', '$1.65', '$0.82', '$12.58']) expect(t).toContain(a);
    expect(out).toContain('title="Shipping $6.00, 26% of sales"');
    expect(out).toContain('title="Profit $12.58, 55% of sales"');
    for (const c of ['--chart-shipping', '--chart-storage', '--chart-hosting', '--chart-discards', '--selling']) expect(out).toContain(`var(${c})`);
  });

  it('leaves the batches line out when the count is unknown', () => {
    const out = render(summary({}, { batches_created: undefined as unknown as number }));
    expect(text(out)).not.toContain('batches sent');
  });

  it('a loss shows "Loss −$x" in the warn colour and no profit segment', () => {
    const out = render(summary({ shipping_cost: 30 }, { profit: -11.42 }));
    expect(text(out)).toContain('Loss −$11.42');
    expect(out).toContain('color:var(--warn)');
    expect(out).not.toContain('title="Profit');
    expect(out).not.toContain('what you kept');
  });

  it('chart 2 shows the wait timeline and its total', () => {
    const t = text(render(summary()));
    expect(t).toContain('How long a joke waits, on average');
    expect(t).toContain('With Marketing 2:41');
    expect(t).toContain('storage is charged');
    expect(t).toContain('On market, waiting for a buyer 0:52');
    expect(t).toContain('hosting is charged');
    expect(t).toContain('about 3:33');
    for (const tick of ['Sent', 'Released', 'First sale']) expect(t).toContain(tick);
  });

  it('chart 2 is hidden when both averages are 0', () => {
    const t = text(render(summary({ avg_submit_to_publish_s: 0, avg_publish_to_first_sale_s: 0 })));
    expect(t).not.toContain('How long a joke waits');
    expect(t).toContain('Where your sales went');
  });

  it('lists the extra numbers below the charts so none disappears', () => {
    const out = render(summary(), { extras: [{ label: 'Batches', value: 4 }, { label: 'Content Waste', value: 2 }] });
    const t = text(out);
    expect(t).toContain('Batches');
    expect(t).toContain('Content Waste');
    expect(t.indexOf('Content Waste')).toBeGreaterThan(t.indexOf('about 3:33'));
  });

  it('before the round has a summary it says so and still lists the extras', () => {
    const t = text(render(null, { extras: [{ label: 'Batches', value: 0 }] }));
    expect(t).not.toContain('NaN');
    expect(t).toContain('Batches');
    expect(t).not.toContain('Where your sales went');
  });
});
