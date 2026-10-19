import { describe, expect, it } from 'vitest';
import { idleAverageNow, idlePeak, idleRows } from './idleRows';
import { leanChartsFixture } from './leanCharts.testdata';

describe('idleRows (Jokes standing still)', () => {
  it('ranks every team by the jokes standing still at the latest sample, most first', () => {
    // Latest sample: Team 1 0 + 2, Team 2 5 + 1, Team 3 nothing; class average 5/3 + 1.
    const rows = idleRows(leanChartsFixture());
    expect(rows.map(r => r.teamId)).toEqual([2, 1, 3]);
    expect(rows[0]).toMatchObject({ teamName: 'Team 2', waiting: 5, shelf: 1, total: 6, aboveAverage: true });
    expect(rows[1]).toMatchObject({ waiting: 0, shelf: 2, total: 2, aboveAverage: false });
    expect(rows[2]).toMatchObject({ total: 0, aboveAverage: false });
  });

  it('keeps each team\'s series and the class average over the round', () => {
    const [top] = idleRows(leanChartsFixture());
    expect(top.series).toEqual([
      { t: 0, waiting: 0, shelf: 0 }, { t: 60, waiting: 0, shelf: 0 },
      { t: 120, waiting: 2, shelf: 4 }, { t: 180, waiting: 5, shelf: 1 },
    ]);
    expect(top.avgSeries.map(p => p.t)).toEqual([0, 60, 120, 180]);
    expect(top.avgSeries[2].total).toBeCloseTo(3);
  });

  it('gives a team with no samples zeros and sorts it last; ties go by team name', () => {
    const res = leanChartsFixture();
    res.teams[0].idle = [];
    res.teams[2].idle = [{ t: 180, waiting: 0, shelf: 1 }];
    const rows = idleRows(res);
    expect(rows.map(r => r.teamId)).toEqual([2, 3, 1]);
    expect(rows[2]).toMatchObject({ waiting: 0, shelf: 0, total: 0, series: [] });

    const tied = leanChartsFixture();
    tied.teams[1].idle = [];
    expect(idleRows(tied, { '3': 'Acrobats' }).slice(1).map(r => r.teamName)).toEqual(['Acrobats', 'Team 2']);
  });

  it('applies the instructor\'s renames and is empty without data', () => {
    expect(idleRows(leanChartsFixture(), { '2': 'Zebras' })[0].teamName).toBe('Zebras');
    expect(idleRows(null)).toEqual([]);
  });
});

describe('idlePeak and idleAverageNow', () => {
  it('finds the highest pile and when it was, and the class average now', () => {
    const rows = idleRows(leanChartsFixture());
    expect(idlePeak(rows[0].series)).toEqual({ jokes: 6, t: 120 });
    expect(idlePeak([])).toBeNull();
    expect(idleAverageNow(rows)).toBeCloseTo(8 / 3);
    expect(idleAverageNow([])).toBe(0);
  });
});
