import { describe, expect, it } from 'vitest';
import {
  CRITERIA_KEY, bestRuns, comparisonCsv, criterionKey, defaultCriterion, everyRunHasFit, loadCriteria, meetsTarget, runMeta,
  saveCriteria, settingRows, targetsSummary, type Criterion,
} from './compare';
import { MEASURES } from './measures';
import { fixtureRecord, fixtureRound, IDEAL, listingPair, SETTINGS } from './compare.testdata';

const measure = (id: string) => MEASURES.find(m => m.id === id)!;

describe('settingRows', () => {
  it('puts the one differing setting first and marks every other row the same', () => {
    const rows = settingRows(listingPair());
    expect(rows[0]).toMatchObject({ round: 1, key: 'cost_of_publishing', label: 'Listing', values: [0.1, 0.25], differs: true });
    expect(rows.slice(1).every(r => !r.differs)).toBe(true);
  });

  it('has a row per setting key present, per round, plus the ideal joke, in SETTING_FIELDS order then Round 1 before Round 2', () => {
    const rows = settingRows([fixtureRecord('A'), fixtureRecord('B')]);
    const keys = Object.keys(SETTINGS);
    expect(rows).toHaveLength((keys.length + 1) * 2);
    expect(rows.map(r => `${r.round}:${r.key}`).slice(0, 4)).toEqual(['1:market_mode', '2:market_mode', '1:batch_size', '2:batch_size']);
    expect(rows.map(r => r.key)).not.toContain('wip_limit');
  });

  it('gives null for a run without Round 2, and those rows differ', () => {
    const rows = settingRows([fixtureRecord('A'), fixtureRecord('B', { rounds: [fixtureRound(1)] })]);
    const r2 = rows.filter(r => r.round === 2);
    expect(r2.length).toBeGreaterThan(0);
    for (const r of r2) {
      expect(r.values[1]).toBeNull();
      expect(r.differs).toBe(true);
    }
    expect(rows.filter(r => r.round === 1).every(r => !r.differs)).toBe(true);
  });

  it('the ideal joke reads Same when identical (in any key order) and differs otherwise', () => {
    const same = settingRows([
      fixtureRecord('A'),
      fixtureRecord('B', { rounds: [fixtureRound(1, { ideal_profile: { TONE: 'Dry', TOPIC: 'Animals' } }), fixtureRound(2)] }),
    ]);
    const ideal1 = same.find(r => r.key === 'ideal_profile' && r.round === 1)!;
    expect(ideal1).toMatchObject({ label: 'Ideal joke', values: ['Same', 'Same'], differs: false });

    const diff = settingRows([
      fixtureRecord('A'),
      fixtureRecord('B', { rounds: [fixtureRound(1, { ideal_profile: { ...IDEAL, TOPIC: 'Work' } }), fixtureRound(2)] }),
    ]);
    const row = diff.find(r => r.key === 'ideal_profile' && r.round === 1)!;
    expect(row).toMatchObject({ values: ['Same', 'Different'], differs: true });
    expect(diff[0]).toBe(row);
  });

  it('is empty with no runs', () => {
    expect(settingRows([])).toEqual([]);
  });
});

describe('criteria', () => {
  it('criterionKey carries the round only for round-scoped measures', () => {
    expect(criterionKey(measure('mean_profit'), 2)).toBe('mean_profit:2');
    expect(criterionKey(measure('profit_change'), 2)).toBe('profit_change');
    expect(criterionKey(measure('fit_gain'), 1)).toBe('fit_gain');
  });

  it('defaultCriterion is unused, with the measure direction and no target', () => {
    expect(defaultCriterion(measure('fees_total'))).toEqual({ use: false, better: 'lower', target: null });
  });

  it('bestRuns marks every tie and ignores nulls', () => {
    expect(bestRuns([1, null, 3, 3], 'higher')).toEqual([2, 3]);
    expect(bestRuns([1, null, 3, 3], 'lower')).toEqual([0]);
    expect(bestRuns([null, null], 'higher')).toEqual([]);
  });

  it('meetsTarget: higher is at least, lower is at most, null without a target or value', () => {
    expect(meetsTarget(50, { use: true, better: 'higher', target: 50 })).toBe(true);
    expect(meetsTarget(10, { use: true, better: 'lower', target: 5 })).toBe(false);
    expect(meetsTarget(5, { use: true, better: 'lower', target: 5 })).toBe(true);
    expect(meetsTarget(10, { use: true, better: 'higher', target: null })).toBeNull();
    expect(meetsTarget(null, { use: true, better: 'higher', target: 1 })).toBeNull();
  });

  it('targetsSummary counts a null value in "of" but not in "met"', () => {
    const criteria: Criterion[] = [
      { use: true, better: 'higher', target: 50 },
      { use: true, better: 'lower', target: 10 },
    ];
    expect(targetsSummary([[60, 40], [null, 5]], criteria)).toEqual([{ met: 1, of: 2 }, { met: 1, of: 2 }]);
  });

  it('targetsSummary skips unused criteria and criteria without a target', () => {
    const criteria: Criterion[] = [
      { use: false, better: 'higher', target: 1 },
      { use: true, better: 'higher', target: null },
      { use: true, better: 'higher', target: 1 },
    ];
    expect(targetsSummary([[5], [5], [5]], criteria)).toEqual([{ met: 1, of: 1 }]);
  });
});

describe('loadCriteria and saveCriteria', () => {
  const memory = () => {
    const data = new Map<string, string>();
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
  };

  it('is {} when getItem throws, the JSON is bad, or there is no storage', () => {
    expect(loadCriteria({ getItem: () => { throw new Error('blocked'); } })).toEqual({});
    expect(loadCriteria({ getItem: () => '{not json' })).toEqual({});
    expect(loadCriteria({ getItem: () => '[1,2]' })).toEqual({});
    expect(loadCriteria(null)).toEqual({});
  });

  it('round-trips through saveCriteria under jf_compare_criteria', () => {
    const s = memory();
    const c = { 'mean_profit:1': { use: true, better: 'higher' as const, target: 2 }, fit_gain: { use: false, better: 'lower' as const, target: null } };
    saveCriteria(s, c);
    expect(s.data.has(CRITERIA_KEY)).toBe(true);
    expect(loadCriteria(s)).toEqual(c);
  });

  it('drops malformed entries', () => {
    const text = JSON.stringify({ ok: { use: true, better: 'higher', target: null }, bad: { use: 'yes', better: 'up', target: 'x' } });
    expect(loadCriteria({ getItem: () => text })).toEqual({ ok: { use: true, better: 'higher', target: null } });
  });

  it('saveCriteria swallows a throwing setItem and a null storage', () => {
    expect(() => saveCriteria({ setItem: () => { throw new Error('quota'); } }, {})).not.toThrow();
    expect(() => saveCriteria(null, {})).not.toThrow();
  });
});

describe('comparisonCsv', () => {
  it('has a column per run, neutralises a formula-like run name, and a row per measure and round', () => {
    const csv = comparisonCsv([fixtureRecord('Run 1'), fixtureRecord('=evil')]);
    const lines = csv.trimEnd().split('\r\n');
    expect(lines[0]).toBe("group,measure,round,Run 1,'=evil");
    expect(lines).toContain('Money,Mean profit per team ($),1,1.5,1.5');
    expect(lines).toContain('Money,Mean profit per team ($),2,1.5,1.5');
    expect(lines.some(l => l.startsWith('Round 1 → 2,Mean profit change ($),,'))).toBe(true);
    const roundRows = MEASURES.filter(m => m.scope === 'round').length;
    expect(lines).toHaveLength(1 + roundRows * 2 + MEASURES.filter(m => m.scope !== 'round').length);
  });

  it('leaves a value that cannot be computed empty', () => {
    const csv = comparisonCsv([fixtureRecord('A', { rounds: [fixtureRound(1)] })]);
    expect(csv).toContain('Money,Mean profit per team ($),2,\r\n');
  });
});

describe('runMeta', () => {
  it('reads who played, the local date and the Round 1 team count', () => {
    expect(runMeta(fixtureRecord('A', { exported_at: '2026-11-20T12:00:00Z' }))).toBe('Students · 2026-11-20 · 2 teams');
    expect(runMeta(fixtureRecord('B', { played_by: 'bots', rounds: [fixtureRound(1, { teams: [] })] }))).toBe('Bots · 2026-11-20 · 0 teams');
  });
});

describe('everyRunHasFit', () => {
  const withFit = (name: string) => fixtureRecord(name, {
    rounds: [fixtureRound(1), fixtureRound(2, { teams: [fixtureRecord('x').rounds[1].teams[0], { ...fixtureRecord('x').rounds[1].teams[1], fit_by_batch: [{ seq: 1, fit: 2 }] }] })],
  });

  it('is true only when every run has a Round 2 team with fit_by_batch', () => {
    expect(everyRunHasFit([withFit('A'), withFit('B')])).toBe(true);
    expect(everyRunHasFit([withFit('A'), fixtureRecord('B')])).toBe(false);
    expect(everyRunHasFit([fixtureRecord('A', { rounds: [fixtureRound(1, { teams: [{ ...fixtureRecord('x').rounds[0].teams[0], fit_by_batch: [{ seq: 1, fit: 2 }] }] })] })])).toBe(false);
    expect(everyRunHasFit([])).toBe(false);
  });
});
