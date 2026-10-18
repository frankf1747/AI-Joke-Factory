import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { INITIAL_RANK_STATE, foundABuyer, formatProfit, nextRankState, rankInputOf, rankMovement, type RankState } from './scoreboard';
import { Scoreboard } from '../components/Scoreboard';
import type { Batch, Joke } from '../types';

describe('rankMovement', () => {
  it('up when the rank number fell', () => expect(rankMovement(3, 2)).toEqual({ kind: 'up', by: 1 }));
  it('down when the rank number rose', () => expect(rankMovement(1, 3)).toEqual({ kind: 'down', by: 2 }));
  it('same when it did not move', () => expect(rankMovement(2, 2)).toEqual({ kind: 'same', by: 0 }));
  it('lead on reaching first', () => expect(rankMovement(2, 1)).toEqual({ kind: 'lead', by: 0 }));
  it('lead when first with nothing to compare', () => expect(rankMovement(null, 1)).toEqual({ kind: 'lead', by: 0 }));
  it('no previous rank reads as no change', () => expect(rankMovement(null, 2)).toEqual({ kind: 'same', by: 0 }));
  it('no current rank reads as none', () => {
    expect(rankMovement(2, null)).toEqual({ kind: 'none', by: 0 });
    expect(rankMovement(null, null)).toEqual({ kind: 'none', by: 0 });
  });
});

const joke = (over: Partial<Joke>): Joke => ({ joke_id: 1, joke_text: 't', id: '1', content: 't', ...over });
const batch = (jokes: Joke[]): Batch => ({
  batch_id: 1, round_id: 1, team_id: 1, status: 'PROCESSED', jokes, id: '1', team: '1', round: 1,
} as Batch);

describe('foundABuyer', () => {
  it('counts published jokes that ever sold, swapped out or not', () => {
    const b = batch([
      joke({ publish_status: 'PUBLISHED', first_sold_at: '2026-10-18T10:00:00Z', sold_count: 2 }),
      joke({ publish_status: 'PUBLISHED', first_sold_at: '2026-10-18T10:01:00Z', sold_count: 0 }),
      joke({ publish_status: 'PUBLISHED', first_sold_at: null }),
      joke({ publish_status: 'DISCARDED', first_sold_at: null }),
      joke({ publish_status: 'PENDING' }),
    ]);
    expect(foundABuyer([b])).toBe(2);
  });
  it('adds up across batches and is 0 for none', () => {
    const sold = joke({ publish_status: 'PUBLISHED', first_sold_at: '2026-10-18T10:00:00Z' });
    expect(foundABuyer([batch([sold]), batch([sold])])).toBe(2);
    expect(foundABuyer([])).toBe(0);
  });
});

describe('formatProfit', () => {
  it('uses the true minus sign for a loss', () => expect(formatProfit(-6.55)).toBe('−$6.55'));
  it('plain dollars otherwise', () => {
    expect(formatProfit(10.18)).toBe('$10.18');
    expect(formatProfit(0)).toBe('$0.00');
  });
  it('a dash with no figure', () => {
    expect(formatProfit(null)).toBe('—');
    expect(formatProfit(undefined)).toBe('—');
  });
});

const board = (over: Partial<React.ComponentProps<typeof Scoreboard>> = {}) => renderToStaticMarkup(
  <Scoreboard rank={2} round={1} profit={4.5} totalSales={9} publishedJokes={6} foundBuyer={4} tourId="jm-stats" {...over} />,
);

const run = (inputs: Array<[number | null, number | null]>): RankState[] => {
  const out: RankState[] = [];
  let st = INITIAL_RANK_STATE;
  for (const [rank, round] of inputs) { st = nextRankState(st, { rank, round }); out.push(st); }
  return out;
};

describe('nextRankState', () => {
  it('3 to 2 is up 1, held on 2 again, then 4 is down 2', () => {
    const [first, up, held, down] = run([[3, 1], [2, 1], [2, 1], [4, 1]]);
    expect(first.move).toEqual({ kind: 'same', by: 0 });
    expect(up.move).toEqual({ kind: 'up', by: 1 });
    expect(held.move).toEqual({ kind: 'up', by: 1 });
    expect(down.move).toEqual({ kind: 'down', by: 2 });
  });
  it('a round change resets to same, whatever the old tag', () => {
    const [, , r2] = run([[3, 1], [5, 1], [2, 2]]);
    expect(r2.move).toEqual({ kind: 'same', by: 0 });
    expect(r2.prevRank).toBe(2);
    const [, , , next] = run([[3, 1], [5, 1], [2, 2], [1, 2]]);
    expect(next.move).toEqual({ kind: 'lead', by: 0 });
  });
  it('the first rank of a new round at 1 still leads', () => {
    expect(run([[3, 1], [1, 2]])[1].move).toEqual({ kind: 'lead', by: 0 });
  });
  it('reaching rank 1 is lead, and holds while it stays 1', () => {
    const [, lead, still] = run([[2, 1], [1, 1], [1, 1]]);
    expect(lead.move).toEqual({ kind: 'lead', by: 0 });
    expect(still.move).toEqual({ kind: 'lead', by: 0 });
  });
  it('a null rank shows none, keeps the previous rank, and the next rank compares to it', () => {
    const [, gone, back, moved] = run([[3, 1], [null, 1], [3, 1], [2, 1]]);
    expect(gone.move).toEqual({ kind: 'none', by: 0 });
    expect(gone.prevRank).toBe(3);
    expect(back.move).toEqual({ kind: 'same', by: 0 });
    expect(moved.move).toEqual({ kind: 'up', by: 1 });
  });
  it('before any summary, with no round yet: none', () => {
    expect(run([[null, null]])[0].move).toEqual({ kind: 'none', by: 0 });
  });
  it('is idempotent for repeated identical input', () => {
    const [a, b] = run([[2, 1], [2, 1]]);
    expect(b).toEqual(a);
  });
});

describe('rankInputOf and the round change', () => {
  const sum = (round_id: number, rank: number) => ({ round_id, rank });
  it('reads rank and round from the same summary; none without one', () => {
    expect(rankInputOf(sum(2, 5))).toEqual({ rank: 5, round: 2 });
    expect(rankInputOf(null)).toEqual({ rank: null, round: null });
    expect(rankInputOf(undefined)).toEqual({ rank: null, round: null });
  });
  it('the summaries the views pass: up 1, then no change in Round 2, then up 1', () => {
    let st = INITIAL_RANK_STATE;
    const step = (s: ReturnType<typeof sum> | null) => (st = nextRankState(st, rankInputOf(s))).move;
    expect(step(sum(1, 3))).toEqual({ kind: 'same', by: 0 });
    expect(step(sum(1, 2))).toEqual({ kind: 'up', by: 1 });
    // Round 2 is configured but its summary has not arrived: the Round 1 summary is still the latest.
    expect(step(sum(1, 2))).toEqual({ kind: 'up', by: 1 });
    expect(step(sum(2, 5))).toEqual({ kind: 'same', by: 0 });
    expect(step(sum(2, 4))).toEqual({ kind: 'up', by: 1 });
  });
});

describe('Scoreboard', () => {
  it('rank 1: the ordinal with its suffix, and In the lead', () => {
    const out = board({ rank: 1 });
    expect(out).toContain('>1<');
    expect(out).toContain('>st<');
    expect(out).toContain('In the lead');
    expect(out).toContain('Team rank, by profit');
  });
  it('rank 2 for the first time: 2nd and no change', () => {
    const out = board();
    expect(out).toContain('>2<');
    expect(out).toContain('>nd<');
    expect(out).toContain('no change');
    expect(out).not.toContain('In the lead');
  });
  it('a loss shows the true minus in the warn colour', () => {
    const out = board({ profit: -6.55 });
    expect(out).toMatch(/color:var\(--warn\)[^>]*>−\$6\.55</);
  });
  it('a profit is not warn coloured', () => {
    expect(board()).not.toMatch(/color:var\(--warn\)[^>]*>\$4\.50</);
  });
  it('found a buyer and sales', () => {
    const out = board();
    expect(out).toContain('Found a buyer');
    expect(out).toContain('>4<');
    expect(out).toContain('of 6 on market');
    expect(out).toContain('Sales');
    expect(out).toContain('>9<');
  });
  it('carries the tour id', () => {
    expect(board({ tourId: 'mk-stats' })).toContain('data-tour="mk-stats"');
  });
  it('no summary: every value is a dash', () => {
    const out = board({ rank: null, round: null, profit: null, totalSales: null, publishedJokes: null, foundBuyer: null });
    expect(out.match(/—/g)?.length).toBe(4);
    expect(out).not.toContain('no change');
    expect(out).not.toContain('In the lead');
    expect(out).not.toContain('on market');
  });
});
