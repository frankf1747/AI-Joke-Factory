import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LeanDebrief, debriefRows, type DebriefStats } from './LeanDebrief';

type Row = DebriefStats['leaderboard'][number];
const team = (id: number, profit: number, lean?: Record<string, unknown> | null): Row => ({
  rank: 1, team: { id, name: `Team ${id}` }, points: 0, profit, total_sales: 12, published_jokes: 10,
  unsold_jokes: 0, discarded_jokes: 0, batches_processed: 4, total_jokes: 10,
  lean: lean === null ? undefined : ({
    batches_submitted: 4, avg_submit_to_publish_s: 60, avg_publish_to_first_sale_s: 30, batch_series: [],
    setup_cost: 0, carrying_cost: 0, ...lean,
  } as Row['lean']),
});
const stats = (...leaderboard: Row[]): DebriefStats => ({ leaderboard });
const render = (r1: DebriefStats | null, r2: DebriefStats | null, round2Started = true) =>
  renderToStaticMarkup(createElement(LeanDebrief, { r1, r2, round2Started }));
/** The rendered table's body rows, as their cell texts. */
const bodyRows = (html: string): string[][] =>
  [...html.split('<tbody>')[1].matchAll(/<tr[^>]*>(.*?)<\/tr>/g)].map(m =>
    [...m[1].matchAll(/<td[^>]*>(.*?)<\/td>/g)].map(c => c[1]));

describe('Round 1 vs Round 2 fees', () => {
  it('adds shipping, storage and hosting into one Fees figure per round', () => {
    const rows = debriefRows(
      stats(team(3, 1, { shipping_cost: 8, storage_cost: 1.5, hosting_cost: 0.25, setup_cost: 8, carrying_cost: 1.75 })),
      stats(team(3, 4, { shipping_cost: 5, storage_cost: 0.5, hosting_cost: 0.1, setup_cost: 5, carrying_cost: 0.6 })),
    );
    expect(rows[0].r1?.fees).toBeCloseTo(9.75);
    expect(rows[0].r2?.fees).toBeCloseTo(5.6);
  });

  it('reads an older backend\'s setup and carrying costs as the fees', () => {
    const rows = debriefRows(stats(team(3, 1, { setup_cost: 4, carrying_cost: 2 })), null);
    expect(rows[0].r1?.fees).toBe(6);
  });

  it('groups the columns under Profit, Never sold, Fees and Sent to released', () => {
    const out = render(
      stats(team(3, 1, { shipping_cost: 8, storage_cost: 1.5, hosting_cost: 0.25 })),
      stats(team(3, 4, { shipping_cost: 5, storage_cost: 0.5, hosting_cost: 0.1 })),
    );
    for (const head of ['Profit', 'Never sold', 'Fees', 'Sent to released', 'Change']) expect(out).toContain(head);
    expect(out).toContain('$9.75');
    expect(out).toContain('$5.60');
    expect(out).not.toContain('setup+carry');
  });
});

describe('Round 1 vs Round 2 table', () => {
  it('sorts the rows by Round 2 profit', () => {
    const out = render(
      stats(team(1, 50), team(2, 1), team(3, 9)),
      stats(team(1, 2), team(2, 30), team(3, 10)),
    );
    expect(bodyRows(out).map(r => r[0])).toEqual(['Team 2', 'Team 3', 'Team 1']);
  });

  it('puts a team missing from Round 2 at the bottom, with "–" for that round', () => {
    const out = render(stats(team(1, 90), team(2, 1)), stats(team(2, 5)));
    const rows = bodyRows(out);
    expect(rows.map(r => r[0])).toEqual(['Team 2', 'Team 1']);
    expect(rows[1].slice(2)).toEqual(['–', '–', '0', '–', '$0.00', '–', '1:00', '–']);
  });

  it('shows a gain as "+$10.99" in green and a loss in warn', () => {
    const out = render(stats(team(1, 1), team(2, 20)), stats(team(1, 11.99), team(2, 15)));
    expect(out).toMatch(/<td[^>]*color:var\(--selling\)[^>]*>\+\$10\.99<\/td>/);
    expect(out).toMatch(/<td[^>]*color:var\(--warn\)[^>]*>−\$5\.00<\/td>/);
  });

  it('shows no colour or sign for no change', () => {
    const out = render(stats(team(1, 3)), stats(team(1, 3)));
    expect(bodyRows(out)[0][3]).toBe('$0.00');
    expect(out).not.toContain('var(--selling)');
    expect(out).not.toContain('var(--warn)');
  });

  it('shows "–" in a Classic round\'s lean columns', () => {
    const out = render(stats(team(1, 4, null)), stats(team(1, 6, { shipping_cost: 2, avg_submit_to_publish_s: 72 })));
    expect(bodyRows(out)[0]).toEqual(['Team 1', '$4.00', '$6.00', '+$2.00', '–', '0', '–', '$2.00', '–', '1:12']);
  });

  it('says it is available once Round 2 has started, before then', () => {
    const out = render(stats(team(1, 4)), null, false);
    expect(out).toContain('Available once Round 2 has started');
    expect(out).not.toContain('<table');
  });
});
