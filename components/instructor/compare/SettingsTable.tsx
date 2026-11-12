/* The Compare tab's settings: rows that differ between runs first and highlighted,
   the rest folded behind "Same in every run (n)". */
import React from 'react';
import { settingRows, type SettingRow } from '../../../services/runRecord/compare';
import type { RunRecord } from '../../../services/runRecord/types';
import { DASH, ROW_BORDER, RunColumns, TABLE } from './layout';

/** The ideal joke's cell: Same or Different, expanding to the profile itself. */
const IdealCell: React.FC<{ value: string; profile?: Record<string, string> }> = ({ value, profile }) => (
  <details>
    <summary className="cursor-pointer select-none">{value}</summary>
    <ul className="mt-1 text-[12px]" style={{ color: 'var(--ink-2)' }}>
      {Object.entries(profile ?? {}).map(([k, v]) => <li key={k}>{k.toLowerCase()}: {v}</li>)}
    </ul>
  </details>
);

const Rows: React.FC<{ rows: readonly SettingRow[]; records: readonly RunRecord[] }> = ({ rows, records }) => (
  <tbody>
    {rows.map((row, r) => (
      <tr
        key={`${row.round}:${row.key}`}
        style={{ ...(r > 0 ? ROW_BORDER : {}), ...(row.differs ? { background: 'var(--gold-tint)' } : {}) }}
      >
        <th scope="row" className="px-2 py-1.5 text-left font-normal" style={{ color: 'var(--ink-2)' }}>
          {`Round ${row.round} · ${row.label}`}
        </th>
        {row.values.map((v, i) => (
          <td key={i} className="px-2 py-1.5 text-left font-mono" style={{ color: 'var(--ink)' }}>
            {v === null ? DASH : row.key === 'ideal_profile'
              ? <IdealCell value={String(v)} profile={records[i].rounds.find(x => x.round === row.round)?.ideal_profile} />
              : String(v)}
          </td>
        ))}
      </tr>
    ))}
  </tbody>
);

export const SettingsTable: React.FC<{ records: readonly RunRecord[] }> = ({ records }) => {
  const rows = settingRows(records);
  const differ = rows.filter(r => r.differs);
  const same = rows.filter(r => !r.differs);
  return (
    <div>
      {differ.length > 0 ? (
        <table className={TABLE} aria-label="Settings that differ">
          <RunColumns count={records.length} />
          <Rows rows={differ} records={records} />
        </table>
      ) : records.length > 1 && (
        <p className="px-2 py-1.5 text-[13px]" style={{ color: 'var(--ink-3)' }}>Every setting is the same in these runs.</p>
      )}
      {same.length > 0 && (
        <details className="mt-1">
          <summary className="cursor-pointer select-none px-2 py-1.5 text-[13px] font-medium" style={{ color: 'var(--navy)' }}>{`Same in every run (${same.length})`}</summary>
          <table className={TABLE} aria-label="Settings that are the same">
            <RunColumns count={records.length} />
            <Rows rows={same} records={records} />
          </table>
        </details>
      )}
    </div>
  );
};
