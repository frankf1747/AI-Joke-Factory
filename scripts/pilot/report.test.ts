import { describe, expect, it } from 'vitest';
import { groupKey, markdown, summarise, verdict, type RunResult } from './report';

const run = (
  mode: 'CLASSIC' | 'LEAN', round: 1 | 2, rows: Array<[string, number]>, rep = 1,
): RunResult => ({
  mode, rep, round, durationS: 100, calls: 0,
  rows: rows.map(([persona, profit], i) => ({
    teamId: i + 1, persona, profit, sales: 0, published: 0, unsold: 0,
    setup: 0, carrying: 0, leadTimeS: 0, saleTimeS: 0, rank: i + 1,
  })),
});

describe('pilot report', () => {
  it('averages profit per persona, grouped by mode and round', () => {
    const s = summarise([
      run('LEAN', 1, [['SPRAY', 10], ['SPRAY', 20], ['CAREFUL', 30]]),
      run('LEAN', 2, [['SPRAY', 2], ['CAREFUL', 4]]),
      run('CLASSIC', 1, [['SPRAY', 7]]),
    ]);
    expect(groupKey('LEAN', 1)).toBe('LEAN R1');
    expect(s['LEAN R1'].SPRAY.meanProfit).toBe(15);
    expect(s['LEAN R1'].SPRAY.n).toBe(2);
    expect(s['LEAN R1'].CAREFUL.meanProfit).toBe(30);
    expect(s['LEAN R2'].SPRAY.meanProfit).toBe(2);
    expect(s['CLASSIC R1'].SPRAY.meanProfit).toBe(7);
    expect(s['CLASSIC R2']).toEqual({});
  });

  it('passes when Learner and Careful out-earn Spray in Lean round 2 and Spray wins no Lean round-2 class', () => {
    const runs = [
      run('LEAN', 2, [['LEARNER', 30], ['CAREFUL', 25], ['SPRAY', 10]], 1),
      run('LEAN', 2, [['LEARNER', 28], ['CAREFUL', 26], ['SPRAY', 12]], 2),
    ];
    expect(verdict(runs)).toMatchObject({ pass: true, reasons: [] });
  });

  it('ignores Lean round 1 and Classic rows for pass/fail', () => {
    const runs = [
      run('LEAN', 1, [['SPRAY', 90], ['LEARNER', 1], ['CAREFUL', 1]]),
      run('CLASSIC', 2, [['SPRAY', 90], ['LEARNER', 1], ['CAREFUL', 1]]),
      run('LEAN', 2, [['LEARNER', 30], ['CAREFUL', 25], ['SPRAY', 10]]),
    ];
    expect(verdict(runs).pass).toBe(true);
  });

  it('fails when Spray tops a Lean round-2 class even if the means favour the others', () => {
    const runs = [
      run('LEAN', 2, [['SPRAY', 50], ['LEARNER', 30], ['CAREFUL', 25]], 1),
      run('LEAN', 2, [['LEARNER', 90], ['CAREFUL', 90], ['SPRAY', 0]], 2),
    ];
    const v = verdict(runs);
    expect(v.pass).toBe(false);
    expect(v.reasons).toEqual(['Spray won Lean class rep 1 round 2']);
  });

  it('fails when Careful does not out-earn Spray', () => {
    const v = verdict([run('LEAN', 2, [['LEARNER', 30], ['CAREFUL', 5], ['SPRAY', 10]])]);
    expect(v.pass).toBe(false);
    expect(v.reasons).toContain('Careful does not out-earn Spray');
  });

  it('fails when there are no Lean round-2 rows', () => {
    expect(verdict([run('LEAN', 1, [['LEARNER', 30], ['CAREFUL', 25], ['SPRAY', 10]])]).pass).toBe(false);
  });

  it('compares Lean round 2 with round 1 across all teams, outside pass/fail', () => {
    const v = verdict([
      run('LEAN', 1, [['LEARNER', 10], ['CAREFUL', 10], ['SPRAY', 4]]),
      run('LEAN', 2, [['LEARNER', 30], ['CAREFUL', 25], ['SPRAY', 5]]),
    ]);
    expect(v.leanR1Mean).toBe(8);
    expect(v.leanR2Mean).toBe(20);
    expect(v.leanImproved).toBe(true);
  });

  it('prints a table per mode and round, the class winners and the R2 vs R1 line', () => {
    const md = markdown([
      run('LEAN', 1, [['LEARNER', 10], ['SPRAY', 4]]),
      run('LEAN', 2, [['LEARNER', 30], ['SPRAY', 5]]),
    ], '2026-10-06');
    expect(md).toContain('## LEAN R1');
    expect(md).toContain('## LEAN R2');
    expect(md).not.toContain('## CLASSIC R1');
    expect(md).toContain('Lean R2 vs Lean R1 mean profit: $17.50 vs $7.00 (improved)');
    expect(md).toContain('| LEAN | 1 | 2 | LEARNER | $30.00 |');
    expect(md).not.toContain('## Settings');
  });

  it('prints the settings section when given one', () => {
    const md = markdown([run('LEAN', 2, [['LEARNER', 1]])], '2026-10-06', ['carrying scaled x10 to match bot speed']);
    expect(md).toContain('## Settings\n\n- carrying scaled x10 to match bot speed');
  });
});
