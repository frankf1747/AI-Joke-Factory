import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import Instructor from './Instructor';
import { renderWithGame, testUser } from './testing/renderWithGame';
import { Role, type ApiInstructorStatsResponse } from '../types';
import type { LeanTeamStats } from '../types/api';

// Instructor reads window.location.search while rendering (the bot panel switch).
vi.stubGlobal('window', { location: { search: '' } });

const instructor = testUser(Role.INSTRUCTOR, null);

const row = (id: number, lean: Partial<LeanTeamStats>): ApiInstructorStatsResponse['leaderboard'][number] => ({
  rank: id, team: { id, name: `Team ${id}` }, points: 0, total_sales: 10, unsold_jokes: 0, discarded_jokes: 1,
  batches_processed: 3, profit: 2.5, total_jokes: 9, published_jokes: 8,
  lean: {
    batches_submitted: 3, setup_cost: 0, carrying_cost: 0, avg_submit_to_publish_s: 42, avg_publish_to_first_sale_s: 90,
    batch_series: [], ...lean,
  },
});

describe('Instructor leaderboard, Lean columns', () => {
  it('heads the Lean leaderboard columns Shipping, Storage, Hosting, Lead and Sale', () => {
    const out = renderWithGame(Instructor, {
      user: instructor,
      instructorStatsRound1: {
        round_id: 1,
        leaderboard: [row(1, { shipping_cost: 8, storage_cost: 1.5, hosting_cost: 0.2, setup_cost: 8, carrying_cost: 1.7 })],
      },
    });
    const head = out.slice(out.indexOf('<thead'), out.indexOf('</thead>'));
    const labels = ['Profit', 'Shipping', 'Storage', 'Hosting', 'Lead', 'Sale'].map(l => head.indexOf(`<span>${l}</span>`));
    expect(labels.every(i => i > 0)).toBe(true);
    expect([...labels].sort((a, b) => a - b)).toEqual(labels);
    expect(head).not.toContain('<span>Setup</span>');
    expect(head).not.toContain('<span>Carrying</span>');
    expect(out).toContain('$8.00');
    expect(out).toContain('$1.50');
    expect(out).toContain('$0.20');
  });

  it('reads an older backend\'s setup and carrying costs without showing NaN', () => {
    const out = renderWithGame(Instructor, {
      user: instructor,
      instructorStatsRound1: { round_id: 1, leaderboard: [row(1, { setup_cost: 4, carrying_cost: 2.5 })] },
    });
    expect(out).toContain('$4.00');
    expect(out).toContain('$2.50');
    expect(out).not.toContain('NaN');
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

/* Go ranks the leaderboard with DENSE_RANK() OVER (ORDER BY profit DESC), so
   tied teams share a rank. The # column shows that rank, not the row index. */
describe('Instructor leaderboard, rank', () => {
  const classic = (id: number, rank: number, profit: number): ApiInstructorStatsResponse['leaderboard'][number] => ({
    rank, team: { id, name: `Team ${id}` }, points: 0, total_sales: 10, unsold_jokes: 0, discarded_jokes: 1,
    batches_processed: 3, profit, total_jokes: 9, published_jokes: 8,
  });
  const rankCells = (out: string) =>
    [...out.matchAll(/<td class="px-3 py-2 font-mono text-gray-700">(\d+)<\/td>/g)].map(m => Number(m[1]));

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
});
