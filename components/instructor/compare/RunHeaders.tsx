/* The Compare tab's run columns: name, who played · date · teams, Remove, and the
   run's teams behind a "Teams" disclosure (the Debrief columns, stacked to fit a column). */
import React from 'react';
import { formatProfit } from '../../../services/scoreboard';
import { runMeta } from '../../../services/runRecord/compare';
import type { LoadedRun } from '../../../services/runRecord/parse';
import type { RunRecord, RunTeam } from '../../../services/runRecord/types';
import { DASH, RUN_COLORS, RunColumns, TABLE } from './layout';

interface TeamLine { id: number; team: string; r1?: RunTeam; r2?: RunTeam }

/** Every team in either round, Round 1 order first, paired by team_id. */
function teamLines(record: RunRecord): TeamLine[] {
  const lines = new Map<number, TeamLine>();
  for (const n of [1, 2] as const) {
    const round = record.rounds.find(r => r.round === n);
    for (const t of round?.teams ?? []) {
      const line = lines.get(t.team_id) ?? { id: t.team_id, team: t.team };
      lines.set(t.team_id, { ...line, [n === 1 ? 'r1' : 'r2']: t });
    }
  }
  return [...lines.values()];
}

/** "a · b" for both rounds, or the one round's value. */
const pair = (line: TeamLine, pick: (t: RunTeam) => string): string =>
  [line.r1, line.r2].map(t => (t ? pick(t) : DASH)).join(' · ');

const signedProfit = (n: number) => (n > 0 ? `+${formatProfit(n)}` : formatProfit(n));

const TeamsList: React.FC<{ record: RunRecord }> = ({ record }) => {
  const lines = teamLines(record);
  return (
    <details className="mt-1.5 text-[12px]">
      <summary className="cursor-pointer select-none font-medium" style={{ color: 'var(--navy)' }}>Teams</summary>
      <ul className="mt-1 space-y-1.5">
        {lines.map(l => (
          <li key={l.id} className="pt-1.5" style={{ borderTop: '1px solid var(--rule)' }}>
            <div className="font-semibold" style={{ color: 'var(--ink)' }}>{l.team}</div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-2 font-normal" style={{ color: 'var(--ink-2)' }}>
              <dt>R1 profit</dt><dd className="text-right font-mono">{l.r1 ? formatProfit(l.r1.profit) : DASH}</dd>
              <dt>R2 profit</dt><dd className="text-right font-mono">{l.r2 ? formatProfit(l.r2.profit) : DASH}</dd>
              <dt>Change</dt>
              <dd className="text-right font-mono">{l.r1 && l.r2 ? signedProfit(l.r2.profit - l.r1.profit) : DASH}</dd>
              <dt>Never sold</dt>
              <dd className="text-right font-mono">{pair(l, t => (t.never_sold === null ? DASH : String(t.never_sold)))}</dd>
              <dt>Fees</dt><dd className="text-right font-mono">{pair(l, t => formatProfit(t.fees.total))}</dd>
            </dl>
          </li>
        ))}
        {lines.length === 0 && <li style={{ color: 'var(--ink-3)' }}>No teams in this record.</li>}
      </ul>
    </details>
  );
};

export const RunHeaders: React.FC<{ runs: readonly LoadedRun[]; onRemove: (index: number) => void }> = ({ runs, onRemove }) => (
  <table className={TABLE} aria-label="Loaded runs">
    <RunColumns count={runs.length} />
    <thead>
      <tr>
        <th scope="col" className="px-2 py-2 text-left align-top text-[12px] font-medium" style={{ color: 'var(--ink-3)' }}>Run</th>
        {runs.map(({ fileName, record }, i) => (
          <th key={`${i}-${fileName}`} scope="col" className="px-2 py-2 text-left align-top font-normal">
            <div className="flex items-start justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="inline-block h-2 w-2 shrink-0 rounded-sm" style={{ background: RUN_COLORS[i % RUN_COLORS.length] }} aria-hidden="true" />
                <span className="truncate text-[14px] font-semibold" style={{ color: 'var(--ink)' }} title={fileName}>{record.name}</span>
              </span>
              <button
                type="button" onClick={() => onRemove(i)}
                className="shrink-0 text-[12px] underline-offset-2 hover:underline" style={{ color: 'var(--ink-3)' }}
                aria-label={`Remove ${record.name}`}
              >Remove</button>
            </div>
            <div className="mt-0.5 text-[12px]" style={{ color: 'var(--ink-3)' }}>{runMeta(record)}</div>
            <TeamsList record={record} />
          </th>
        ))}
      </tr>
    </thead>
  </table>
);
