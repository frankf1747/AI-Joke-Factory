/* What the Compare tab shows, from the loaded run records
   (docs/superpowers/specs/2026-11-12-experiment-records-design.md §5). Pure: no DOM, no I/O.
   The instructor decides what "worked": criteria mark best runs and targets, never a pass or fail. */
import { csvCell } from './csv';
import { MEASURES, measureValue, type MeasureDef, type MeasureUnit } from './measures';
import { SETTING_FIELDS, type RunRecord, type SettingValue } from './types';

export interface SettingRow { round: 1 | 2; key: string; label: string; values: Array<SettingValue | null>; differs: boolean }

const ROUNDS = [1, 2] as const;
const IDEAL_KEY = 'ideal_profile';

/** JSON with sorted keys, so key order never makes two ideals differ. */
const stableJson = (o: Record<string, string>): string =>
  JSON.stringify(Object.keys(o).sort().map(k => [k, o[k]]));

const allSame = (values: ReadonlyArray<SettingValue | null>): boolean => values.every(v => v === values[0]);

/** One row per SETTING_FIELDS key per round present in any run, plus key 'ideal_profile' label "Ideal joke" whose values are 'Same'|'Different' strings compared as JSON. Differing rows first, then SETTING_FIELDS order, Round 1 before Round 2. A run missing the round/key gives null (null vs a value differs). */
export function settingRows(records: readonly RunRecord[]): SettingRow[] {
  const rows: Array<SettingRow & { order: number }> = [];
  const fields = [...SETTING_FIELDS, [IDEAL_KEY, 'Ideal joke'] as const];
  fields.forEach(([key, label], fieldIndex) => {
    for (const round of ROUNDS) {
      const rounds = records.map(r => r.rounds.find(x => x.round === round));
      let values: Array<SettingValue | null>;
      if (key === IDEAL_KEY) {
        const ideals = rounds.map(r => (r?.ideal_profile ? stableJson(r.ideal_profile) : null));
        if (ideals.every(i => i === null)) continue;
        const reference = ideals.find(i => i !== null);
        values = ideals.map(i => (i === null ? null : i === reference ? 'Same' : 'Different'));
      } else {
        values = rounds.map(r => (r && key in r.settings ? r.settings[key] : null));
        if (values.every(v => v === null)) continue;
      }
      rows.push({ round, key, label, values, differs: !allSame(values), order: fieldIndex * 2 + round });
    }
  });
  return rows
    .sort((a, b) => Number(b.differs) - Number(a.differs) || a.order - b.order)
    .map(({ order: _order, ...row }) => row);
}

/** The 'Bots only' row and the fit chart need fit data in every run: a Round 2 team with fit_by_batch. */
export function everyRunHasFit(records: readonly RunRecord[]): boolean {
  return records.length > 0 && records.every(r =>
    r.rounds.some(x => x.round === 2 && x.teams.some(t => (t.fit_by_batch?.length ?? 0) > 0)));
}

export interface Criterion { use: boolean; better: 'higher' | 'lower'; target: number | null }
/** `${MeasureId}:${1|2}` for scope 'round', `${MeasureId}` otherwise. */
export type CriterionKey = string;

export function criterionKey(m: MeasureDef, round: 1 | 2): CriterionKey {
  return m.scope === 'round' ? `${m.id}:${round}` : m.id;
}

export function defaultCriterion(m: MeasureDef): Criterion {
  return { use: false, better: m.better, target: null };
}

/** Indexes of the best non-null values (ties all marked); [] when every value is null. */
export function bestRuns(values: ReadonlyArray<number | null>, better: 'higher' | 'lower'): number[] {
  const known = values.filter((v): v is number => v !== null);
  if (known.length === 0) return [];
  const best = better === 'higher' ? Math.max(...known) : Math.min(...known);
  return values.flatMap((v, i) => (v === best ? [i] : []));
}

/** null when there is no target or no value; higher: at least the target, lower: at most. */
export function meetsTarget(value: number | null, c: Criterion): boolean | null {
  if (value === null || c.target === null) return null;
  return c.better === 'higher' ? value >= c.target : value <= c.target;
}

export const CRITERIA_KEY = 'jf_compare_criteria';

const isCriterion = (v: unknown): v is Criterion => {
  if (typeof v !== 'object' || v === null) return false;
  const c = v as Record<string, unknown>;
  return typeof c.use === 'boolean' && (c.better === 'higher' || c.better === 'lower')
    && (c.target === null || (typeof c.target === 'number' && Number.isFinite(c.target)));
};

/** {} on any failure or bad JSON; malformed entries are dropped. */
export function loadCriteria(storage: Pick<Storage, 'getItem'> | null): Record<CriterionKey, Criterion> {
  try {
    const text = storage?.getItem(CRITERIA_KEY);
    if (!text) return {};
    const data: unknown = JSON.parse(text);
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return {};
    const out: Record<CriterionKey, Criterion> = {};
    for (const [k, v] of Object.entries(data)) {
      if (isCriterion(v)) out[k] = { use: v.use, better: v.better, target: v.target };
    }
    return out;
  } catch {
    return {};
  }
}

/** Swallows failures: a full or blocked storage just means the defaults next time. */
export function saveCriteria(storage: Pick<Storage, 'setItem'> | null, c: Record<CriterionKey, Criterion>): void {
  try {
    storage?.setItem(CRITERIA_KEY, JSON.stringify(c));
  } catch {
    /* ignored */
  }
}

/** Per run, how many used measures with a target met it, of how many: e.g. "4 of 5 targets met".
 *  `values[criterion][run]`; a null value counts in `of` but never in `met`. */
export function targetsSummary(
  values: ReadonlyArray<ReadonlyArray<number | null>>,
  criteria: readonly Criterion[],
): Array<{ met: number; of: number }> {
  const runCount = Math.max(0, ...values.map(v => v.length));
  return Array.from({ length: runCount }, (_, run) => {
    let met = 0;
    let of = 0;
    criteria.forEach((c, i) => {
      if (!c.use || c.target === null) return;
      of += 1;
      if (meetsTarget(values[i]?.[run] ?? null, c) === true) met += 1;
    });
    return { met, of };
  });
}

const UNIT_SUFFIX: Record<MeasureUnit, string> = {
  money: ' ($)', percent: ' (%)', points: ' (pts)', count: '', seconds: ' (s)', number: '',
};

/** Rounded to two decimals for a spreadsheet; empty when it cannot be computed. */
const csvNumber = (v: number | null): string => (v === null ? '' : String(Math.round(v * 100) / 100));

/** The measures table, runs as columns. Rows: group, measure (with its unit), round (blank for Round 1 → 2). */
export function comparisonCsv(runs: readonly RunRecord[]): string {
  const lines = [['group', 'measure', 'round', ...runs.map(r => r.name)].map(csvCell).join(',')];
  for (const m of MEASURES) {
    const rounds: Array<1 | 2 | null> = m.scope === 'round' ? [1, 2] : m.scope === 'bots' ? [2] : [null];
    for (const round of rounds) {
      const values = runs.map(r => csvNumber(measureValue(r, m.id, round ?? 1)));
      lines.push([csvCell(m.group), csvCell(`${m.label}${UNIT_SUFFIX[m.unit]}`), round ?? '', ...values].join(','));
    }
  }
  return `${lines.join('\r\n')}\r\n`;
}

const PLAYED_BY = { students: 'Students', bots: 'Bots', mixed: 'Mixed' } as const;

/** The date a record was saved, in local time; the raw prefix when it does not parse. */
function localDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The small line under a run's name: "Students · 2026-11-20 · 12 teams" (Round 1 teams). */
export function runMeta(record: RunRecord): string {
  const first = record.rounds.find(r => r.round === 1) ?? record.rounds[0];
  const teams = first?.teams.length ?? 0;
  const who = PLAYED_BY[record.played_by] ?? String(record.played_by);
  return `${who} · ${localDate(record.exported_at)} · ${teams} ${teams === 1 ? 'team' : 'teams'}`;
}
