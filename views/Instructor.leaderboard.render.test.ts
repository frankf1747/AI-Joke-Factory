import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import Instructor, { type ScreenTab } from './Instructor';
import { renderWithGame, testUser, TEST_CONFIG } from './testing/renderWithGame';
import { Role, type ApiInstructorStatsResponse, type ApiMarketItem, type InstructorLobby } from '../types';
import type { LeanTeamStats } from '../types/api';
import { LeaderboardTable, PresentBoard } from '../components/instructor/LiveBoard';
import { LiveMarket } from '../components/instructor/LiveMarket';
import { DEFAULT_BOARD_SORT, INITIAL_BOARD_RANKS, boardRows, nextBoardRanks } from '../services/liveBoard';

// Instructor reads window.location.search while rendering (the bot panel switch).
vi.stubGlobal('window', { location: { search: '' } });

const instructor = testUser(Role.INSTRUCTOR, null);
const onTab = (initialTab: ScreenTab) => () => createElement(Instructor, { initialTab });

const row = (id: number, lean: Partial<LeanTeamStats>): ApiInstructorStatsResponse['leaderboard'][number] => ({
  rank: id, team: { id, name: `Team ${id}` }, points: 0, total_sales: 10, unsold_jokes: 0, discarded_jokes: 1,
  batches_processed: 3, profit: 2.5, total_jokes: 9, published_jokes: 8,
  lean: {
    batches_submitted: 3, setup_cost: 0, carrying_cost: 0, avg_submit_to_publish_s: 42, avg_publish_to_first_sale_s: 90,
    batch_series: [], ...lean,
  },
});
const classic = (id: number, rank: number, profit: number): ApiInstructorStatsResponse['leaderboard'][number] => ({
  rank, team: { id, name: `Team ${id}` }, points: 0, total_sales: 10, unsold_jokes: 0, discarded_jokes: 1,
  batches_processed: 3, profit, total_jokes: 9, published_jokes: 8,
});

/** The board's column headers, in order. */
const headers = (out: string) => {
  const head = out.slice(out.indexOf('<thead'), out.indexOf('</thead>'));
  return [...head.matchAll(/<th[^>]*>(?:<button[^>]*>)?([^<]+)/g)].map(m => m[1]);
};
const LEAN_HEADERS = ['#', 'Team', 'Profit', 'Sales', 'Released', 'Discarded', 'Never sold', 'Fees', 'Sent to released', 'To first sale'];

describe('Instructor Live tab, the leaderboard', () => {
  it('heads a Lean board with the ten columns, sorted by profit', () => {
    const out = renderWithGame(Instructor, {
      user: instructor,
      instructorStatsRound1: { round_id: 1, leaderboard: [row(1, { shipping_cost: 8, storage_cost: 1.5, hosting_cost: 0.2 })] },
    });
    expect(out).toContain('Leaderboard, Round 1');
    expect(headers(out)).toEqual(LEAN_HEADERS);
    expect(out).toMatch(/<th[^>]*aria-sort="descending"[^>]*><button[^>]*>Profit/);
    expect(out).toContain('title="Shipping $8.00, storage $1.50, hosting $0.20"');
    expect(out).toContain('$9.70');
    // Sent to released and to first sale read m:ss.
    expect(out).toContain('0:42');
    expect(out).toContain('1:30');
  });

  it('leaves out a team with no members and no activity, from the board and the class totals', () => {
    const empty: ApiInstructorStatsResponse['leaderboard'][number] = {
      rank: 2, team: { id: 2, name: 'Team 2' }, points: 0, total_sales: 0, unsold_jokes: 0, discarded_jokes: 0,
      batches_processed: 0, profit: 0, total_jokes: 0, published_jokes: 0,
    };
    const instructorLobby = {
      round_id: null, summary: { waiting: 0, assigned: 2, dropped: 0, team_count: 2 },
      teams: [
        { team: { id: 1, name: 'Team 1' }, members: [{ user_id: 11, display_name: 'Ana', role: 'JM' }] },
        { team: { id: 2, name: 'Team 2' }, members: [] },
      ],
      customers: [], unassigned: [],
    } as unknown as InstructorLobby;
    const out = renderWithGame(Instructor, {
      user: instructor, config: { ...TEST_CONFIG, marketMode: 'CLASSIC' }, instructorLobby,
      instructorStatsRound1: { round_id: 1, leaderboard: [classic(1, 1, 5), empty] },
    });
    expect(out).toContain('Team 1');
    expect(out).not.toContain('Team 2');
    // Worst profit is Team 1's $5.00, not the empty team's $0.00.
    expect(out).not.toContain('$0.00');
  });

  it('drops never sold, fees and the two waits in a Classic round', () => {
    const out = renderWithGame(Instructor, {
      user: instructor, config: { ...TEST_CONFIG, marketMode: 'CLASSIC' },
      instructorStatsRound1: { round_id: 1, leaderboard: [classic(1, 1, 5)] },
    });
    expect(headers(out)).toEqual(LEAN_HEADERS.slice(0, 6));
    // The Classic chart cards are gone: the charts area is one notice.
    expect(out).toContain('Lean charts appear in Lean rounds.');
    for (const gone of ['Cumulative Sales', 'Batch Sequence', 'Wasted Jokes', 'Scatter Plots', 'Unrated Jokes']) {
      expect(out).not.toContain(gone);
    }
  });

  it('shows a dash, not 0 and $0.00, for a team the backend sent without lean figures', () => {
    const out = renderToStaticMarkup(createElement(LeaderboardTable, {
      rows: boardRows([classic(1, 1, 5)], {}), lean: true, sort: DEFAULT_BOARD_SORT,
    }));
    expect(out).not.toContain('$0.00');
    const body = out.slice(out.indexOf('<tbody'));
    expect(body.match(/>–</g)).toHaveLength(4);
  });

  it('reads an older backend\'s setup and carrying costs without showing NaN', () => {
    const out = renderWithGame(Instructor, {
      user: instructor,
      instructorStatsRound1: { round_id: 1, leaderboard: [row(1, { setup_cost: 4, carrying_cost: 2.5 })] },
    });
    expect(out).toContain('title="Shipping $4.00, storage $2.50, hosting $0.00"');
    expect(out).toContain('$6.50');
    expect(out).not.toContain('NaN');
  });

  it('has no round buttons of its own: the control bar picks the round', () => {
    const out = renderWithGame(Instructor, {
      user: instructor,
      instructorStatsRound1: { round_id: 1, leaderboard: [row(1, {})] },
    });
    expect(out).not.toMatch(/>R1</);
    expect(out).not.toMatch(/>R2</);
  });

  it('keeps the header (and the "How this works" dialog inside it) above the page: nothing on Live is sticky', () => {
    const out = renderWithGame(Instructor, { user: instructor, instructorStatsRound1: { round_id: 1, leaderboard: [row(1, {})] } });
    expect(out).toMatch(/<header class="sticky top-0 z-30 /);
    expect(out.match(/sticky/g)).toHaveLength(1);
  });

  it('offers Present', () => {
    const out = renderWithGame(Instructor, { user: instructor, instructorStatsRound1: { round_id: 1, leaderboard: [row(1, {})] } });
    expect(out).toMatch(/<button[^>]*>(?:(?!<\/button>).)*Present<\/button>/s);
  });

  it('subtitles the Round 1 vs Round 2 table for one rule set (Debrief tab)', () => {
    const lean = { shipping_cost: 8, storage_cost: 1.5, hosting_cost: 0.2 };
    const out = renderWithGame(() => createElement(Instructor, { initialTab: 'debrief' }), {
      user: instructor,
      instructorStatsRound1: { round_id: 1, leaderboard: [row(1, lean)] },
      instructorStatsRound2: { round_id: 2, leaderboard: [row(1, lean)] },
    });
    expect(out).toContain('Same rules and fees in both rounds, per team');
    expect(out).not.toContain('Push rules vs lean rules');
  });
});

describe('Instructor Live tab, class totals', () => {
  it('shows sales, profit with best and worst, released but never sold with its share, and fees', () => {
    const series = [{ seq: 1, submitted_at: '', jokes: 5, published: 4, sold: 1 }];
    const out = renderWithGame(Instructor, {
      user: instructor,
      instructorStatsRound1: {
        round_id: 1,
        leaderboard: [
          { ...row(1, { shipping_cost: 2, storage_cost: 0, hosting_cost: 0, batch_series: series }), profit: 4 },
          { ...row(2, { shipping_cost: 1, storage_cost: 0, hosting_cost: 0, batch_series: series }), profit: -1.5 },
        ],
      },
    });
    for (const text of ['Sales, all teams', 'Profit, all teams', 'Released, never sold', 'Fees paid']) expect(out).toContain(text);
    expect(out).toContain('16 jokes released');
    expect(out).toContain('best $4.00, worst −$1.50');
    // 6 of the 8 jokes the batches released never sold (published_jokes says 16).
    expect(out).toContain('75% of released jokes');
    expect(out).toContain('shipping, storage and hosting');
  });

  it('shows only sales and profit in a Classic round', () => {
    const out = renderWithGame(Instructor, {
      user: instructor, config: { ...TEST_CONFIG, marketMode: 'CLASSIC' },
      instructorStatsRound1: { round_id: 1, leaderboard: [classic(1, 1, 5)] },
    });
    expect(out).toContain('Sales, all teams');
    expect(out).not.toContain('Released, never sold');
    expect(out).not.toContain('Fees paid');
  });
});

/* Go ranks the leaderboard with DENSE_RANK() OVER (ORDER BY profit DESC), so
   tied teams share a rank. The # column shows that rank, not the row index. */
describe('Instructor leaderboard, rank', () => {
  const rankCells = (out: string) => [...out.matchAll(/<td class="jf-board-rank[^"]*"[^>]*>(\d+)<\/td>/g)].map(m => Number(m[1]));

  it('shows the backend rank, so tied teams share it', () => {
    const out = renderWithGame(Instructor, {
      user: instructor,
      instructorStatsRound1: { round_id: 1, leaderboard: [classic(1, 1, 5), classic(2, 1, 5), classic(3, 2, 3)] },
    });
    expect(rankCells(out)).toEqual([1, 1, 2]);
  });

  it('falls back to the row position when the backend sends no rank', () => {
    const out = renderWithGame(Instructor, {
      user: instructor,
      instructorStatsRound1: { round_id: 1, leaderboard: [classic(1, 0, 5), classic(2, 0, 4), classic(3, 0, 3)] },
    });
    expect(rankCells(out)).toEqual([1, 2, 3]);
  });

  it('tags a team that moved up and fades its row from gold once', () => {
    const before = boardRows([classic(1, 1, 5), classic(2, 2, 3)], {});
    const after = boardRows([classic(1, 2, 5), classic(2, 1, 9)], {});
    let ranks = nextBoardRanks(INITIAL_BOARD_RANKS, before, 1);
    ranks = nextBoardRanks(ranks, after, 1);
    const out = renderToStaticMarkup(createElement(LeaderboardTable, { rows: after, lean: false, sort: DEFAULT_BOARD_SORT, ranks }));
    expect(out).toContain('↑1');
    expect(out).toContain('↓1');
    expect(out.match(/jf-board-rankup/g)).toHaveLength(2);
  });
});

describe('Instructor leaderboard, Present', () => {
  it('opens a full-screen copy of the board with a Close button', () => {
    const rows = boardRows([classic(1, 1, 5)], {});
    const out = renderToStaticMarkup(createElement(PresentBoard, {
      round: 2, rows, lean: false, sort: DEFAULT_BOARD_SORT, onClose: () => {},
    }));
    expect(out).toMatch(/role="dialog"[^>]*aria-modal="true"/);
    expect(out).toContain('fixed inset-0');
    expect(out).toContain('Leaderboard, Round 2');
    expect(out).toContain('Team 1');
    expect(out).toMatch(/<button[^>]*>(?:(?!<\/button>).)*Close<\/button>/s);
  });
});

describe('Instructor Live tab, the live market', () => {
  const item = (id: number, sold: number, text = `Joke ${id}`): ApiMarketItem => ({
    joke_id: id, joke_text: text, joke_title: `Title ${id}`, team_id: 1, team_name: 'Team 1', sold_count: sold,
  });

  it('puts best sellers first, shows the top 5 and offers the rest', () => {
    const items = [item(1, 0), item(2, 4), item(3, 1), item(4, 9), item(5, 2), item(6, 3), item(7, 0)];
    const out = renderWithGame(Instructor, { user: instructor, marketItems: items });
    expect(out).toContain('Live market');
    expect(out).toContain('Released jokes, best sellers first.');
    const shown = [...out.matchAll(/>Title (\d+)</g)].map(m => Number(m[1]));
    expect(shown).toEqual([4, 2, 6, 5, 3]);
    expect(out).toContain('9 buyers');
    expect(out).toContain('1 buyer<');
    expect(out).toContain('Show all 7');
    expect(out).toContain('7 jokes on the market');
  });

  it('says the market opens when the round starts', () => {
    const out = renderWithGame(onTab('live'), {
      user: instructor, config: { ...TEST_CONFIG, isActive: false }, roundStatuses: { 1: 'CONFIGURED', 2: 'CONFIGURED' },
    });
    expect(out).toContain('Market opens when the round starts.');
  });

  it('pages 20 jokes at a time once opened in full, and offers Show more past 180 characters', () => {
    const items = [item(1, 5, 'x'.repeat(181)), ...Array.from({ length: 20 }, (_, i) => item(i + 2, 0))];
    const out = renderToStaticMarkup(createElement(LiveMarket, { items, open: true, teamNames: {}, initialShowAll: true }));
    expect(out).toContain('Page 1 of 2');
    expect(out).toContain('Title 20<');
    expect(out).not.toContain('Title 21<');
    expect(out).toContain('Show more');
    expect(out).toContain('Show top 5');
  });
});
