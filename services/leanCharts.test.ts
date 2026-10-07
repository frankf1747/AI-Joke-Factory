import { describe, expect, it } from 'vitest';
import {
  LEAN_CHART_COLORS, NO_BATCHES_TEXT, NO_RELEASES_TEXT,
  batchScatter, batchSellThrough, classSellThrough, cyclesForInstructor, cyclesForStudent,
  defaultIdleTeamId, hasIdle, hasWaste, idleRows, idleSubtitle, integerTicks, isNotLeanRound,
  leanRound1Id, leanRoundFlags, teamOptions, wasteBars,
} from './leanCharts';
import { leanChartsFixture } from './leanCharts.testdata';
import type { LeanChartsResponse } from '../types/api';

const res = leanChartsFixture();
const avg = res.class_average;

describe('colours', () => {
  it('match the spec table exactly', () => {
    expect(LEAN_CHART_COLORS).toEqual({
      setup: '#2563eb', waiting: '#7c3aed', shelf: '#d97706', neverSold: '#e11d48', discarded: '#94a3b8',
      round1: '#3B82F6', round2: '#F97316', classAverage: '#64748b',
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

describe('leanRound1Id', () => {
  it('finds Round 1 only when it was Lean', () => {
    expect(leanRound1Id([{ id: 4, round_number: 1, market_mode: 'LEAN' }, { id: 5, round_number: 2, market_mode: 'LEAN' }])).toBe(4);
    expect(leanRound1Id([{ id: 4, round_number: 1, market_mode: 'CLASSIC' }])).toBeNull();
    expect(leanRound1Id([{ id: 4, round_number: 1 }])).toBeNull();
    expect(leanRound1Id(undefined)).toBeNull();
  });
});

describe('teamOptions', () => {
  it('unions both rounds by id, applies renames, sorts by id', () => {
    const r2 = leanChartsFixture({ teams: [...res.teams, { ...res.teams[2], team_id: 4, team_name: 'Team 4' }] });
    expect(teamOptions(res, r2, { '2': 'Zebras' })).toEqual([
      { id: 1, name: 'Team 1' }, { id: 2, name: 'Zebras' }, { id: 3, name: 'Team 3' }, { id: 4, name: 'Team 4' },
    ]);
    expect(teamOptions(null, null)).toEqual([]);
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

describe('idleRows (chart 2)', () => {
  it('pairs the team with the class-average total, per minute', () => {
    const rows = idleRows(res.teams[0], avg);
    expect(rows.map(r => r.minute)).toEqual([0, 1, 2, 3]);
    expect(rows[1]).toEqual({ minute: 1, waiting: 5, shelf: 0, classAverage: 5 / 3 });
    expect(rows[2].classAverage).toBeCloseTo(3);
    expect(hasIdle(rows)).toBe(true);
  });
  it('draws the class average alone when no team is picked', () => {
    const rows = idleRows(null, avg);
    expect(rows[1].waiting).toBe(0);
    expect(rows[1].classAverage).toBeCloseTo(5 / 3);
  });
  it('has nothing to draw before the round starts', () => {
    expect(hasIdle(idleRows(null, { ...avg, idle: [] }))).toBe(false);
  });
});

describe('defaultIdleTeamId', () => {
  it('picks the team with the most idle jokes at the latest sample', () => {
    expect(defaultIdleTeamId(res)).toBe(2); // team 1: 0 + 2, team 2: 5 + 1
  });
  it('breaks ties by the lowest team id', () => {
    const tied = leanChartsFixture();
    tied.teams[0].idle[3] = { t: 180, waiting: 6, shelf: 0 };
    expect(defaultIdleTeamId(tied)).toBe(1);
  });
  it('handles no teams and no samples', () => {
    expect(defaultIdleTeamId(null)).toBeNull();
    expect(defaultIdleTeamId(leanChartsFixture({ teams: [] }))).toBeNull();
    const notStarted = leanChartsFixture();
    notStarted.teams.forEach(t => { t.idle = []; });
    expect(defaultIdleTeamId(notStarted)).toBe(1);
  });
});

describe('idleSubtitle', () => {
  const base = 'Jokes waiting for Marketing or unsold on the shelf. A growing pile is waste.';
  it('states the WIP limit only when there is one', () => {
    expect(idleSubtitle(0)).toBe(base);
    expect(idleSubtitle(2)).toBe(`${base} WIP limit: 2 batches`);
    expect(idleSubtitle(1)).toBe(`${base} WIP limit: 1 batch`);
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
    expect(batchSellThrough(res.teams[0])).toEqual([{ minute: 10 / 60, rate: 0.5, label: 'Batch 1: 2 of 4 sold' }]);
    expect(batchSellThrough(null)).toEqual([]);
  });
  it('drops class samples with no value', () => {
    const pts = classSellThrough(avg);
    expect(pts).toHaveLength(1);
    expect(pts[0].minute).toBe(0);
    expect(pts[0].rate).toBeCloseTo(7 / 9);
  });
});

describe('cyclesForInstructor', () => {
  it('shows the class line per round by default', () => {
    const m = cyclesForInstructor(res, null, null);
    expect(m.series.map(s => s.key)).toEqual(['r1-class']);
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

describe('cyclesForStudent', () => {
  const current = leanChartsFixture({ round_id: 8, teams: [res.teams[0]] });
  const earlier = leanChartsFixture({ teams: [res.teams[1]] });
  it('in Round 2: faded Round 1 batches, own batches in orange, dashed class average', () => {
    const m = cyclesForStudent(current, 2, earlier);
    expect(m.series.map(s => s.key)).toEqual(['earlier', 'mine', 'class']);
    expect(m.series[0]).toMatchObject({ faded: true, color: LEAN_CHART_COLORS.round1, round: 1 });
    expect(m.series[1]).toMatchObject({ faded: false, color: LEAN_CHART_COLORS.round2, round: 2, markers: true });
    expect(m.series[2]).toMatchObject({ dashed: true, markers: false, color: LEAN_CHART_COLORS.classAverage });
  });
  it('in Round 1: no earlier round, own batches in blue', () => {
    const m = cyclesForStudent(current, 1, earlier);
    expect(m.series.map(s => s.key)).toEqual(['mine', 'class']);
    expect(m.series[0].color).toBe(LEAN_CHART_COLORS.round1);
  });
});
