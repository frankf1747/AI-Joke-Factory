import { describe, expect, it } from 'vitest';
import type { LeaderboardRow } from './classTotals';
import {
  DEFAULT_BOARD_SORT, INITIAL_BOARD_RANKS, bestSellers, boardColumns, boardRanksFor, boardRows, buyersText,
  nextBoardRanks, nextBoardSort, sortBoard,
} from './liveBoard';

const row = (id: number, rank: number, profit: number, over: Partial<LeaderboardRow> = {}): LeaderboardRow => ({
  rank, team: { id, name: `Team ${id}` }, points: 0, total_sales: 10, unsold_jokes: 0, discarded_jokes: 1,
  batches_processed: 3, profit, total_jokes: 9, published_jokes: 8, ...over,
});

describe('boardColumns', () => {
  it('lists the Lean columns in order, and drops the four Lean-only ones in a Classic round', () => {
    expect(boardColumns(true).map(c => c.label)).toEqual(
      ['#', 'Team', 'Profit', 'Sales', 'Released', 'Discarded', 'Never sold', 'Fees', 'Sent to released', 'To first sale']);
    expect(boardColumns(false).map(c => c.label)).toEqual(['#', 'Team', 'Profit', 'Sales', 'Released', 'Discarded']);
  });
});

describe('boardRows', () => {
  it('keeps the backend rank, prefers the renamed team, and reads the Lean fields', () => {
    const [r] = boardRows([row(3, 2, 1.5, {
      lean: {
        batches_submitted: 1, setup_cost: 0, carrying_cost: 0, shipping_cost: 2, storage_cost: 0.5, hosting_cost: 0.25,
        avg_submit_to_publish_s: 72, avg_publish_to_first_sale_s: 0,
        batch_series: [{ seq: 1, submitted_at: '', jokes: 5, published: 4, sold: 1 }],
      },
    })], { '3': 'Zebras' });
    expect(r).toMatchObject({ teamId: '3', team: 'Zebras', rank: 2, neverSold: 3, feesTotal: 2.75, sentToReleased: 72, toFirstSale: null });
    expect(r.fees).toEqual({ shipping: 2, storage: 0.5, hosting: 0.25 });
  });

  it('keeps never sold and fees empty for a row the backend sent without lean', () => {
    const [r] = boardRows([row(1, 1, 5)], {});
    expect(r.neverSold).toBeNull();
    expect(r.feesTotal).toBeNull();
  });

  it('falls back to the row position when the backend sends no rank', () => {
    expect(boardRows([row(1, 0, 5), row(2, 0, 4)], {}).map(r => r.rank)).toEqual([1, 2]);
  });
});

describe('sorting the board', () => {
  const rows = boardRows([row(1, 2, 3, { total_sales: 9 }), row(2, 1, 5, { total_sales: 4 }), row(3, 3, 1, { total_sales: 12 })], {});

  it('sorts by profit, highest first, by default', () => {
    expect(sortBoard(rows, DEFAULT_BOARD_SORT).map(r => r.teamId)).toEqual(['2', '1', '3']);
  });

  it('flips the direction on a second click and starts costs and times lowest first', () => {
    const bySales = nextBoardSort(DEFAULT_BOARD_SORT, 'sales');
    expect(bySales).toEqual({ key: 'sales', dir: 'desc' });
    expect(sortBoard(rows, bySales).map(r => r.teamId)).toEqual(['3', '1', '2']);
    expect(nextBoardSort(bySales, 'sales')).toEqual({ key: 'sales', dir: 'asc' });
    expect(nextBoardSort(DEFAULT_BOARD_SORT, 'fees').dir).toBe('asc');
    expect(nextBoardSort(DEFAULT_BOARD_SORT, 'team').dir).toBe('asc');
  });

  it('keeps teams with no time yet at the bottom whichever way it sorts', () => {
    const timed = boardRows([
      row(1, 1, 1, { lean: { batches_submitted: 0, setup_cost: 0, carrying_cost: 0, avg_submit_to_publish_s: 0, avg_publish_to_first_sale_s: 0, batch_series: [] } }),
      row(2, 2, 1, { lean: { batches_submitted: 0, setup_cost: 0, carrying_cost: 0, avg_submit_to_publish_s: 40, avg_publish_to_first_sale_s: 0, batch_series: [] } }),
    ], {});
    expect(sortBoard(timed, { key: 'sentToReleased', dir: 'asc' }).map(r => r.teamId)).toEqual(['2', '1']);
    expect(sortBoard(timed, { key: 'sentToReleased', dir: 'desc' }).map(r => r.teamId)).toEqual(['2', '1']);
  });
});

describe('nextBoardRanks', () => {
  const at = (ranks: Record<string, number>) => Object.entries(ranks).map(([teamId, rank]) => ({ teamId, rank }));

  it('shows no move on the first poll of a round', () => {
    const s = nextBoardRanks(INITIAL_BOARD_RANKS, at({ 1: 1, 2: 2 }), 1);
    expect(s.teams['1'].move).toBeNull();
    expect(s.teams['2'].changed).toBe(false);
  });

  it('tags a team that moved, holds the tag until its rank changes again, and flashes only on the change', () => {
    let s = nextBoardRanks(INITIAL_BOARD_RANKS, at({ 1: 1, 2: 2, 3: 3 }), 1);
    s = nextBoardRanks(s, at({ 1: 3, 2: 2, 3: 1 }), 1);
    expect(s.teams['3']).toMatchObject({ move: { kind: 'up', by: 2 }, changed: true, seq: 1 });
    expect(s.teams['1']).toMatchObject({ move: { kind: 'down', by: 2 }, changed: true });
    expect(s.teams['2']).toMatchObject({ move: null, changed: false });
    s = nextBoardRanks(s, at({ 1: 3, 2: 2, 3: 1 }), 1);
    expect(s.teams['3']).toMatchObject({ move: { kind: 'up', by: 2 }, changed: false, seq: 1 });
  });

  it('starts over in a new round', () => {
    let s = nextBoardRanks(INITIAL_BOARD_RANKS, at({ 1: 2 }), 1);
    s = nextBoardRanks(s, at({ 1: 1 }), 1);
    expect(s.teams['1'].move).toEqual({ kind: 'up', by: 1 });
    s = nextBoardRanks(s, at({ 1: 1 }), 2);
    expect(s.teams['1'].move).toBeNull();
  });
});

describe('boardRanksFor', () => {
  it('passes the rank tags only while they belong to the round on the board', () => {
    const ranks = nextBoardRanks(INITIAL_BOARD_RANKS, [{ teamId: '1', rank: 1 }], 7);
    expect(boardRanksFor(ranks, 7)).toBe(ranks);
    expect(boardRanksFor(ranks, 8)).toBeUndefined();
    expect(boardRanksFor(ranks, null)).toBeUndefined();
  });
});

describe('the live market', () => {
  const item = (id: number, sold: number) => ({ joke_id: id, joke_text: '', joke_title: '', team_id: 1, team_name: '', sold_count: sold });

  it('puts best sellers first and keeps release order among ties', () => {
    expect(bestSellers([item(1, 0), item(2, 3), item(3, 1), item(4, 3)]).map(i => i.joke_id)).toEqual([2, 4, 3, 1]);
  });

  it('counts buyers', () => {
    expect(buyersText(1)).toBe('1 buyer');
    expect(buyersText(0)).toBe('0 buyers');
    expect(buyersText(4)).toBe('4 buyers');
  });
});
