/* The Compare tab's measures, by group, with the instructor's own criteria per row:
   Use, a direction and an optional target. Used rows mark the best run and each
   target met; the instructor decides what worked, so there is no pass or fail. */
import React from 'react';
import {
  bestRuns, criterionKey, defaultCriterion, meetsTarget, targetsSummary,
  type Criterion, type CriterionKey,
} from '../../../services/runRecord/compare';
import { MEASURES, formatMeasure, measureValue, type MeasureDef } from '../../../services/runRecord/measures';
import type { RunRecord } from '../../../services/runRecord/types';
import { CONTROL, CONTROL_STYLE, ROW_BORDER, RunColumns, TABLE } from './layout';

interface MeasureRow { m: MeasureDef; round: 1 | 2; key: CriterionKey; label: string }

/** Round measures get a row per round any run has; Round 1 → 2 rows need a Round 2; Bots only needs fit data. */
function measureRows(records: readonly RunRecord[], showBots: boolean): MeasureRow[] {
  const rounds = ([1, 2] as const).filter(n => records.some(r => r.rounds.some(x => x.round === n)));
  return MEASURES.flatMap(m => {
    if (m.scope === 'round') {
      return rounds.map(round => ({ m, round, key: criterionKey(m, round), label: `Round ${round}` }));
    }
    if (m.scope === 'change' && !rounds.includes(2)) return [];
    if (m.scope === 'bots' && !showBots) return [];
    const round = m.scope === 'bots' ? 2 : 1;
    return [{ m, round, key: criterionKey(m, round), label: '' }];
  });
}

const parseTarget = (text: string): number | null => {
  if (text.trim() === '') return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
};

const Controls: React.FC<{ row: MeasureRow; c: Criterion; onChange: (c: Criterion) => void }> = ({ row, c, onChange }) => {
  const name = `${row.m.label}${row.label ? `, ${row.label}` : ''}`;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12.5px]" style={{ color: 'var(--ink-2)' }}>
      <label className="inline-flex items-center gap-1">
        <input type="checkbox" checked={c.use} onChange={e => onChange({ ...c, use: e.target.checked })} aria-label={`Use ${name}`} />
        Use
      </label>
      <select
        value={c.better} onChange={e => onChange({ ...c, better: e.target.value === 'lower' ? 'lower' : 'higher' })}
        className={CONTROL} style={CONTROL_STYLE} aria-label={`Direction for ${name}`}
      >
        <option value="higher">Higher is better</option>
        <option value="lower">Lower is better</option>
      </select>
      <input
        type="number" step="any" placeholder="Target" value={c.target ?? ''}
        onChange={e => onChange({ ...c, target: parseTarget(e.target.value) })}
        className={`${CONTROL} w-[72px]`} style={CONTROL_STYLE} aria-label={`Target for ${name}`}
      />
    </div>
  );
};

export interface MeasuresTableProps {
  records: readonly RunRecord[];
  showBots: boolean;
  criteria: Record<CriterionKey, Criterion>;
  onCriterion: (key: CriterionKey, c: Criterion) => void;
}

export const MeasuresTable: React.FC<MeasuresTableProps> = ({ records, showBots, criteria, onCriterion }) => {
  const rows = measureRows(records, showBots).map(row => ({
    ...row,
    c: criteria[row.key] ?? defaultCriterion(row.m),
    values: records.map(r => measureValue(r, row.m.id, row.round)),
  }));
  const targeted = rows.filter(r => r.c.use && r.c.target !== null);
  const summary = targetsSummary(targeted.map(r => r.values), targeted.map(r => r.c));
  return (
    <div>
      {/* Above the table, so the verdict on the instructor's own targets is read first. */}
      {targeted.length > 0 && (
        <ul className="mb-3 space-y-0.5 text-[13px]" style={{ color: 'var(--ink-2)' }} aria-label="Targets met">
          {summary.map((s, i) => (
            <li key={i}><span className="font-semibold" style={{ color: 'var(--ink)' }}>{records[i].name}</span>{`: ${s.met} of ${s.of} targets met`}</li>
          ))}
        </ul>
      )}
      <table className={TABLE} aria-label="Measures">
        <RunColumns count={records.length} />
        <thead>
          <tr>
            <th scope="col" className="px-2 py-1 text-left text-[12px] font-medium" style={{ color: 'var(--ink-3)' }}>Measure</th>
            {records.map((r, i) => (
              <th key={i} scope="col" className="truncate px-2 py-1 text-right text-[12px] font-medium" style={{ color: 'var(--ink-3)' }}>{r.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => {
            const groupStart = r === 0 || rows[r - 1].m.group !== row.m.group;
            const best = row.c.use && records.length > 1 ? bestRuns(row.values, row.c.better) : [];
            return (
              <React.Fragment key={row.key}>
                {groupStart && (
                  <tr>
                    <th colSpan={records.length + 1} scope="colgroup" className="px-2 pb-1 pt-4 text-left text-[12px] font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-3)' }}>
                      {row.m.group}
                    </th>
                  </tr>
                )}
                <tr style={{ ...ROW_BORDER, ...(row.c.use ? { background: 'var(--navy-tint)' } : {}) }}>
                  <th scope="row" className="px-2 py-1.5 text-left align-top font-normal">
                    <div style={{ color: 'var(--ink)' }}>
                      <span className="font-medium">{row.m.label}</span>
                      {row.label && <span style={{ color: 'var(--ink-3)' }}>{` · ${row.label}`}</span>}
                    </div>
                    <Controls row={row} c={row.c} onChange={c => onCriterion(row.key, c)} />
                  </th>
                  {row.values.map((v, i) => {
                    const met = row.c.use && meetsTarget(v, row.c) === true;
                    return (
                      <td key={i} className="px-2 py-1.5 text-right align-top">
                        <div className="font-mono" style={{ color: 'var(--ink)' }}>{formatMeasure(v, row.m.unit)}</div>
                        {(best.includes(i) || met) && (
                          <div className="text-[11.5px] font-semibold" style={{ color: 'var(--selling)' }}>
                            {[best.includes(i) ? 'Best' : null, met ? '✓ target' : null].filter(Boolean).join(' · ')}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
