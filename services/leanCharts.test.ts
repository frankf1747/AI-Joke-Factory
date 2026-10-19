import { describe, expect, it } from 'vitest';
import {
  LEAN_CHART_COLORS, NO_BATCHES_TEXT, NO_RELEASES_TEXT,
  batchScatter, batchSellThrough, classSellThrough, cyclesForInstructor,
  hasWaste, integerTicks, isNotLeanRound,
  isTooRecentToJudge, leanChartsVisibility, leanJudgeTiming, leanRoundFlags, minuteTicks,
  resolveLeanChartsRound, wasteBars,
} from './leanCharts';
import { leanChartsFixture } from './leanCharts.testdata';
import type { LeanChartsResponse } from '../types/api';

const res = leanChartsFixture();
const avg = res.class_average;

describe('colours', () => {
  it('use the chart tokens from index.css', () => {
    expect(LEAN_CHART_COLORS).toEqual({
      shipping: 'var(--chart-shipping)', storage: 'var(--chart-storage)', hosting: 'var(--chart-hosting)',
      neverSold: 'var(--chart-never-sold)', discarded: 'var(--chart-discards)',
      round1: 'var(--chart-round-1)', round2: 'var(--chart-round-2)', classAverage: 'var(--ink-3)',
    });
  });
});

describe('isNotLeanRound', () => {
  it('is true only for a 409 whose message names NOT_LEAN_ROUND', () => {
    expect(isNotLeanRound({ status: 409, message: 'conflict: NOT_LEAN_ROUND: lean charts exist only for LEAN rounds' })).toBe(true);
    expect(isNotLeanRound({ status: 409, message: 'WIP_LIMIT_REACHED' })).toBe(false);
    expect(isNotLeanRound({ status: 500, message: 'NOT_LEAN_ROUND' })).toBe(false);
    expect(isNotLeanRound(null)).toBe(false);
  });
});

describe('leanRoundFlags', () => {
  it('follows the stats rows when there are any', () => {
    expect(leanRoundFlags([{ lean: {} }], [{ lean: undefined }], 1, 'CLASSIC')).toEqual({ 1: true, 2: false });
    // Rows without lean win over a config that says LEAN.
    expect(leanRoundFlags([{ lean: undefined }], [], 1, 'LEAN')).toEqual({ 1: false, 2: false });
  });
  it('falls back to the current round config before stats arrive', () => {
    expect(leanRoundFlags(undefined, [], 1, 'LEAN')).toEqual({ 1: true, 2: false });
    expect(leanRoundFlags([], null, 2, 'LEAN')).toEqual({ 1: false, 2: true });
    expect(leanRoundFlags([], [], 2, 'CLASSIC')).toEqual({ 1: false, 2: false });
  });
});

describe('wasteBars (chart 1)', () => {
  it('sorts by total waste, most first, and keeps teams with no waste', () => {
    const rows = wasteBars(res, { '1': 'Punchliners' });
    expect(rows.map(r => r.teamId)).toEqual([2, 1, 3]);
    expect(rows[1]).toEqual({ teamId: 1, team: 'Punchliners', setup: 4, waiting: 1, shelf: 2, neverSold: 0.5, discarded: 0.02, total: 7.52 });
    expect(rows[2].total).toBe(0);
    expect(hasWaste(rows)).toBe(true);
  });
  it('is empty without data, and an all-zero class has no waste to draw', () => {
    expect(wasteBars(null)).toEqual([]);
    expect(hasWaste(wasteBars(leanChartsFixture({ teams: [res.teams[2]] })))).toBe(false);
  });
});

describe('batchScatter (chart 3)', () => {
  it('puts unsold batches in the band above the axis, hollow', () => {
    const s = batchScatter({ 1: res, 2: null }, null);
    expect(s.r1).toHaveLength(3);
    expect(s.r2).toHaveLength(0);
    expect(s.yMax).toBe(2); // 95 s = 1.58 min, rounded up
    expect(s.yTicks).toEqual([0, 1, 2]);
    const unsold = s.r1.find(p => p.noSale)!;
    expect(unsold.teamId).toBe(1);
    expect(unsold.minutes).toBeNull();
    expect(unsold.y).toBeGreaterThan(s.bandFrom);
    expect(unsold.y).toBeLessThan(s.bandTo);
    expect(s.bandFrom).toBeGreaterThan(s.yMax);
  });
  it('jitters points with the same batch size apart, and leaves a lone one centred', () => {
    const s = batchScatter({ 1: res, 2: null }, null);
    const fives = s.r1.filter(p => p.jokes === 5).sort((a, b) => a.x - b.x);
    expect(fives.map(p => p.teamId)).toEqual([1, 2]);
    expect(fives[0].x).toBeCloseTo(4.7);
    expect(fives[1].x).toBeCloseTo(5.3);
    expect(s.r1.find(p => p.jokes === 3)!.x).toBe(3);
    expect(fives[0].y).toBeCloseTo(95 / 60);
    expect(s.xMax).toBe(5);
  });
  it('narrows to one team and overlays Round 2', () => {
    expect(batchScatter({ 1: res, 2: null }, 2, {}).r1).toHaveLength(1);
    const both = batchScatter({ 1: res, 2: leanChartsFixture({ round_id: 8 }) }, null, { '1': 'Punchliners' });
    expect(both.r2).toHaveLength(3);
    expect(both.r2.every(p => p.round === 2)).toBe(true);
    expect(both.r1.find(p => p.teamId === 1)!.team).toBe('Punchliners');
  });
  it('is empty without data', () => {
    const s = batchScatter({ 1: null, 2: null }, null);
    expect(s.r1.length + s.r2.length).toBe(0);
    expect(s.yMax).toBe(1);
  });
});

describe('integerTicks', () => {
  it('counts by one up to five, then by about a fifth', () => {
    expect(integerTicks(2)).toEqual([0, 1, 2]);
    expect(integerTicks(12)).toEqual([0, 3, 6, 9, 12]);
  });
});

describe('sell-through (chart 4)', () => {
  it('skips batches with nothing published', () => {
    expect(batchSellThrough(res.teams[0], leanJudgeTiming(res))).toEqual([
      { minute: 10 / 60, rate: 0.5, label: 'Batch 1: 2 of 4 sold', pending: false },
    ]);
    expect(batchSellThrough(null)).toEqual([]);
  });
  it('drops class samples with no value', () => {
    const pts = classSellThrough(avg, leanJudgeTiming(res));
    expect(pts).toHaveLength(1);
    expect(pts[0].minute).toBe(0);
    expect(pts[0].rate).toBeCloseTo(7 / 9);
  });
});

describe('cyclesForInstructor', () => {
  it('shows the class line per round by default', () => {
    const m = cyclesForInstructor(res, null, null);
    expect(m.series.map(s => s.key)).toEqual(['r1-class']);
    expect(m.series[0].name).toBe('Round 1');
    expect(m.series[0].color).toBe(LEAN_CHART_COLORS.round1);
    expect(m.series[0].dashed).toBe(false);
    expect(m.emptyText).toBeNull();
  });
  it("shows a picked team's batches in both rounds", () => {
    const m = cyclesForInstructor(res, leanChartsFixture({ round_id: 8 }), 2, { '2': 'Zebras' });
    expect(m.series.map(s => s.key)).toEqual(['r1-team', 'r2-team']);
    expect(m.series[1].name).toBe('Round 2 · Zebras');
    expect(m.series[1].color).toBe(LEAN_CHART_COLORS.round2);
    expect(m.series[1].round).toBe(2);
    expect(m.series[0].points).toHaveLength(1);
  });
  it('says why it is empty', () => {
    const noBatches: LeanChartsResponse = leanChartsFixture({
      teams: res.teams.map(t => ({ ...t, batches: [] })),
      class_average: { ...avg, sell_through: avg.sell_through.map(s => ({ ...s, value: null })) },
    });
    expect(cyclesForInstructor(noBatches, null, null).emptyText).toBe(NO_BATCHES_TEXT);
    const unreleased: LeanChartsResponse = leanChartsFixture({
      teams: [{ ...res.teams[0], batches: [res.teams[0].batches[1]] }],
      class_average: { ...avg, sell_through: avg.sell_through.map(s => ({ ...s, value: null })) },
    });
    expect(cyclesForInstructor(unreleased, null, null).emptyText).toBe(NO_RELEASES_TEXT);
    expect(cyclesForInstructor(null, null, null).emptyText).toBe(NO_BATCHES_TEXT);
  });
});

describe('resolveLeanChartsRound / leanChartsVisibility', () => {
  const both = { 1: true, 2: true };
  it('after a reset into a Lean R1, a stale R2 pick falls back to the live round', () => {
    expect(resolveLeanChartsRound(2, { 1: true, 2: false }, 1, false)).toBe(1);
    expect(resolveLeanChartsRound(2, { 1: true, 2: false }, 1, true)).toBe(1);
  });
  it('after a reset into a Classic R1 not yet started, shows the live round', () => {
    expect(resolveLeanChartsRound(2, { 1: false, 2: false }, 1, false)).toBe(1);
  });
  it('keeps a pick while both rounds are Lean', () => {
    expect(resolveLeanChartsRound(1, both, 2, true)).toBe(1);
    expect(resolveLeanChartsRound(1, both, 2, false)).toBe(1);
  });
  it('between a Lean R1 and a Classic R2 not yet started, keeps R1 for the debrief', () => {
    const flags = { 1: true, 2: false };
    expect(resolveLeanChartsRound(1, flags, 2, false)).toBe(1);
    // The dashboard follows the live round (pick 2) when R2 is configured: R1 still shows.
    expect(resolveLeanChartsRound(2, flags, 2, false)).toBe(1);
    expect(leanChartsVisibility(1, flags, { 1: false, 2: false })).toBe(true);
  });
  it('a Lean R1 followed by a Classic live R2 shows the live round (Classic cards)', () => {
    const r = resolveLeanChartsRound(1, { 1: true, 2: false }, 2, true);
    expect(r).toBe(2);
    expect(leanChartsVisibility(r, { 1: true, 2: false }, { 1: false, 2: false })).toBe(false);
  });
  it('a Classic-only game shows no panel', () => {
    const flags = { 1: false, 2: false };
    const r = resolveLeanChartsRound(1, flags, 1, false);
    expect(leanChartsVisibility(r, flags, { 1: false, 2: false })).toBe(false);
  });
  it('notLean hides the panel for that round only', () => {
    expect(leanChartsVisibility(2, both, { 1: false, 2: true })).toBe(false);
    expect(leanChartsVisibility(1, both, { 1: false, 2: true })).toBe(true);
  });
});

describe('minuteTicks', () => {
  it('uses half minutes under three minutes', () => {
    expect(minuteTicks(0)).toEqual([0]);
    expect(minuteTicks(0.8)).toEqual([0, 0.5, 1]);
    expect(minuteTicks(2.2)).toEqual([0, 0.5, 1, 1.5, 2, 2.5]);
  });
  it('uses whole minutes with at most eight ticks, ending at or after the max', () => {
    expect(minuteTicks(3)).toEqual([0, 1, 2, 3]);
    expect(minuteTicks(7)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(minuteTicks(7.5)).toEqual([0, 2, 4, 6, 8]);
    expect(minuteTicks(15)).toEqual([0, 3, 6, 9, 12, 15]);
    expect(minuteTicks(30)).toEqual([0, 5, 10, 15, 20, 25, 30]);
    for (const max of [3.1, 9, 14, 21, 44, 59, 61, 200]) {
      const ticks = minuteTicks(max);
      expect(ticks[0]).toBe(0);
      expect(ticks.length).toBeLessThanOrEqual(8);
      expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(max);
      expect(ticks.every(Number.isInteger)).toBe(true);
    }
  });
});

describe('too recent to judge (chart 4)', () => {
  // Fixture: sample 60 s, so the arrival window is 900 s and a batch is judged
  // only when at least 120 s old and sent before 840 s.
  const at = (clockEnd: string, over: Partial<LeanChartsResponse> = {}) =>
    leanChartsFixture({ clock_end: clockEnd, ...over });
  const batch = (sent_s: number) => ({ seq: 1, sent_s, jokes: 4, published: 4, sold: 1, first_sale_s: null });
  const team = (sent_s: number) => ({ ...res.teams[0], batches: [batch(sent_s)] });

  it('times from the response: elapsed from started_at to clock_end, and sample_seconds', () => {
    expect(leanJudgeTiming(res)).toEqual({ elapsed: 180, sample: 60 });
    expect(leanJudgeTiming(leanChartsFixture({ started_at: null }))).toBeNull();
    expect(leanJudgeTiming(null)).toBeNull();
  });
  it('a batch sent less than two samples ago is pending', () => {
    const t = { elapsed: 180, sample: 60 };
    expect(isTooRecentToJudge(61, t)).toBe(true);
    expect(isTooRecentToJudge(60, t)).toBe(false);
    expect(batchSellThrough(team(100), t)).toEqual([
      { minute: 100 / 60, rate: 0.25, label: 'Batch 1: 1 of 4 sold', pending: true },
    ]);
  });
  it('a batch sent in the last sample of the arrival window or after it is pending', () => {
    const t = { elapsed: 1200, sample: 60 };
    expect(isTooRecentToJudge(840, t)).toBe(true);
    expect(isTooRecentToJudge(1000, t)).toBe(true);
    expect(isTooRecentToJudge(839, t)).toBe(false);
    expect(batchSellThrough(team(850), t)[0].pending).toBe(true);
  });
  it('an old batch inside the window stays solid', () => {
    expect(batchSellThrough(team(800), { elapsed: 1200, sample: 60 })[0].pending).toBe(false);
  });
  it('without timing nothing is pending', () => {
    expect(batchSellThrough(team(100))[0].pending).toBe(false);
    expect(batchSellThrough(team(100), null)[0].pending).toBe(false);
  });
  it('running round (clock_end = now) vs ended round', () => {
    const running = at('2026-10-06T10:03:00Z', { teams: [team(100)] });
    const ended = at('2026-10-06T10:10:00Z', { teams: [team(100)] });
    expect(cyclesForInstructor(running, null, 1).series[0].points[0].pending).toBe(true);
    expect(cyclesForInstructor(ended, null, 1).series[0].points[0].pending).toBe(false);
  });
  it('drops class samples whose bucket starts at or after the cut', () => {
    const full = { ...avg, sell_through: [0, 60, 120, 180].map(t => ({ t, value: 0.5 })) };
    // Running: cut = min(180 - 120, 900 - 60) = 60.
    expect(classSellThrough(full, { elapsed: 180, sample: 60 }).map(p => p.minute * 60)).toEqual([0]);
    // Ended long ago: cut = min(600 - 120, 840) = 480, so all four stay.
    expect(classSellThrough(full, { elapsed: 600, sample: 60 })).toHaveLength(4);
    // Window: sample 10 s, cut = min(600 - 20, 150 - 10) = 140.
    expect(classSellThrough(full, { elapsed: 600, sample: 10 }).map(p => p.minute * 60)).toEqual([0, 60, 120]);
    expect(classSellThrough(full).every(p => p.pending === false)).toBe(true);
    const running = at('2026-10-06T10:03:00Z', { class_average: full });
    expect(cyclesForInstructor(running, null, null).series[0].points).toHaveLength(1);
    expect(cyclesForInstructor(at('2026-10-06T10:10:00Z', { class_average: full }), null, null).series[0].points).toHaveLength(4);
  });
});
