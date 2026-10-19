/* The top of the Instructor's Live tab (spec 6b): the class totals, the
   leaderboard table and its full-screen Present copy. Presentational: the rows,
   the sort and the rank moves come from views/Instructor.tsx. */
import React, { useEffect, useRef } from 'react';
import { Minimize2 } from 'lucide-react';
import type { ClassTotals } from '../../services/classTotals';
import { boardColumns, sortBoard, type BoardRanks, type BoardRow, type BoardSort, type BoardSortKey } from '../../services/liveBoard';
import { fmtMoney } from '../../services/leanMode';
import { fmtMinSec } from '../../services/format';
import { formatProfit } from '../../services/scoreboard';

export const QUIET_BUTTON =
  'inline-flex items-center gap-[7px] rounded-[var(--r-md)] px-3.5 py-[9px] text-sm font-medium transition-colors hover:bg-[color:var(--paper)]';
export const QUIET_BUTTON_STYLE: React.CSSProperties = { background: 'var(--sheet)', color: 'var(--ink)', border: '1px solid var(--rule-2)' };

const SHEET: React.CSSProperties = { background: 'var(--sheet)', border: '1px solid var(--rule)', borderRadius: 'var(--r-3)' };

const Kpi: React.FC<{ label: string; value: string; sub?: string }> = ({ label, value, sub }) => (
  <div className="px-4 py-3.5" style={SHEET}>
    <span className="text-[13px]" style={{ color: 'var(--ink-3)' }}>{label}</span>
    <b className="mt-0.5 block font-mono text-[26px] font-medium tracking-[-0.02em] tabular-nums" style={{ color: 'var(--ink)' }}>{value}</b>
    {sub && <small className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>{sub}</small>}
  </div>
);

/** Sales, profit with best and worst, and in a Lean round never sold and fees. */
export const ClassTotalsRow: React.FC<{ totals: ClassTotals }> = ({ totals: t }) => {
  const lean = t.neverSold != null && t.fees != null;
  return (
    <div className={`grid grid-cols-2 gap-3 ${lean ? 'lg:grid-cols-4' : ''}`}>
      <Kpi label="Sales, all teams" value={String(t.sales)} sub={`${t.released} ${t.released === 1 ? 'joke' : 'jokes'} released`} />
      <Kpi
        label="Profit, all teams"
        value={formatProfit(t.profit)}
        sub={t.best != null && t.worst != null ? `best ${formatProfit(t.best)}, worst ${formatProfit(t.worst)}` : undefined}
      />
      {lean && (
        <>
          <Kpi
            label="Released, never sold"
            value={String(t.neverSold)}
            sub={t.neverSoldShare != null ? `${Math.round(t.neverSoldShare * 100)}% of released jokes` : undefined}
          />
          <Kpi label="Fees paid" value={fmtMoney(t.fees!)} sub="shipping, storage and hosting" />
        </>
      )}
    </div>
  );
};

const FeeBar: React.FC<{ row: BoardRow; max: number }> = ({ row, max }) => {
  const w = (v: number) => `${(Math.max(0, v) / max) * 70}px`;
  const { shipping, storage, hosting } = row.fees;
  return (
    <span
      className="mr-2 inline-flex h-[7px] w-[70px] gap-px align-middle"
      title={`Shipping ${fmtMoney(shipping)}, storage ${fmtMoney(storage)}, hosting ${fmtMoney(hosting)}`}
    >
      <i className="block h-full rounded-[1px]" style={{ width: w(shipping), background: 'var(--chart-shipping)' }} />
      <i className="block h-full rounded-[1px]" style={{ width: w(storage), background: 'var(--chart-storage)' }} />
      <i className="block h-full rounded-[1px]" style={{ width: w(hosting), background: 'var(--chart-hosting)' }} />
    </span>
  );
};

const MoveTag: React.FC<{ kind: 'up' | 'down'; by: number }> = ({ kind, by }) => (
  <span
    className="ml-2 inline-flex items-center rounded-full px-[7px] py-0.5 align-[1px] text-[12.5px] font-semibold"
    style={kind === 'up'
      ? { color: 'var(--selling)', background: 'var(--selling-bg)' }
      : { color: 'var(--warn)', background: 'var(--warn-bg)' }}
    title={`${kind === 'up' ? 'Up' : 'Down'} ${by} ${by === 1 ? 'place' : 'places'} since the last update`}
  >
    {kind === 'up' ? '↑' : '↓'}{by}
  </span>
);

export interface LeaderboardTableProps {
  rows: BoardRow[];
  lean: boolean;
  sort: BoardSort;
  /** Omitted on the Present copy, whose headers are plain text. */
  onSort?: (key: BoardSortKey) => void;
  ranks?: BoardRanks;
  /** Large type for projecting. */
  big?: boolean;
}

export const LeaderboardTable: React.FC<LeaderboardTableProps> = ({ rows, lean, sort, onSort, ranks, big = false }) => {
  const columns = boardColumns(lean);
  const sorted = sortBoard(rows, sort);
  const maxFees = Math.max(...rows.map(r => r.feesTotal ?? 0), 0.01);
  const pad = big ? 'px-4 py-3.5' : 'px-3 py-2.5';
  const border = { borderBottom: '1px solid var(--rule)' };
  return (
    <div className="overflow-x-auto">
      <table className={`w-full border-collapse tabular-nums ${big ? 'text-[22px]' : 'text-[15px]'}`}>
        <thead>
          <tr>
            {columns.map(c => {
              const active = sort.key === c.key;
              const arrow = active ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : '';
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={active ? (sort.dir === 'desc' ? 'descending' : 'ascending') : undefined}
                  className={`whitespace-nowrap px-3 py-2 font-medium ${big ? 'text-base' : 'text-[12.5px]'} ${c.align === 'left' ? 'text-left' : 'text-right'}`}
                  style={{ ...border, color: active ? 'var(--ink)' : 'var(--ink-3)' }}
                >
                  {onSort ? (
                    <button type="button" onClick={() => onSort(c.key)} className={`w-full whitespace-nowrap font-medium hover:text-[color:var(--ink)] ${c.align === 'left' ? 'text-left' : 'text-right'}`}>
                      {c.label}<span aria-hidden="true">{arrow}</span>
                    </button>
                  ) : (
                    <>{c.label}<span aria-hidden="true">{arrow}</span></>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-3 py-6 text-center text-sm" style={{ color: 'var(--ink-3)' }}>
                No teams on the board yet.
              </td>
            </tr>
          )}
          {sorted.map((r, i) => {
            const rank = ranks?.teams[r.teamId];
            const last = i === sorted.length - 1;
            const td = { ...(last ? {} : border) };
            return (
              <tr key={`${r.teamId}:${rank?.seq ?? 0}`} className={rank?.changed ? 'jf-board-rankup' : undefined}>
                <td className={`jf-board-rank ${pad} text-left ${big ? 'text-2xl' : ''}`} style={{ ...td, color: 'var(--ink-3)', width: 44 }}>{r.rank}</td>
                <td className={`${pad} whitespace-nowrap text-left font-semibold`} style={{ ...td, color: 'var(--ink)' }}>
                  {r.team}
                  {!big && rank?.move && <MoveTag kind={rank.move.kind} by={rank.move.by} />}
                </td>
                <td
                  className={`${pad} text-right font-mono font-semibold ${big ? 'text-2xl' : 'text-base'}`}
                  style={{ ...td, color: r.profit < 0 ? 'var(--warn)' : 'var(--ink)' }}
                >
                  {formatProfit(r.profit)}
                </td>
                <td className={`${pad} text-right`} style={td}>{r.sales}</td>
                <td className={`${pad} text-right`} style={td}>{r.released}</td>
                <td className={`${pad} text-right`} style={td}>{r.discarded}</td>
                {lean && (
                  <>
                    <td className={`${pad} text-right`} style={td}>{r.neverSold ?? '–'}</td>
                    <td className={`${pad} whitespace-nowrap text-right`} style={td}>
                      {r.feesTotal != null ? (
                        <>
                          <FeeBar row={r} max={maxFees} />
                          <span className="font-mono">{fmtMoney(r.feesTotal)}</span>
                        </>
                      ) : '–'}
                    </td>
                    <td className={`${pad} text-right font-mono`} style={td}>{r.sentToReleased != null ? fmtMinSec(r.sentToReleased) : '–'}</td>
                    <td className={`${pad} text-right font-mono`} style={td}>{r.toFirstSale != null ? fmtMinSec(r.toFirstSale) : '–'}</td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export interface PresentBoardProps {
  round: 1 | 2;
  rows: BoardRow[];
  lean: boolean;
  sort: BoardSort;
  onClose: () => void;
}

/** The full-screen, large-type copy of the board for the projector. Esc or Close exits. */
export const PresentBoard: React.FC<PresentBoardProps> = ({ round, rows, lean, sort, onClose }) => {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="present-board-title"
      className="fixed inset-0 z-50 overflow-auto px-6 py-8 sm:px-12"
      style={{ background: 'var(--paper)' }}
    >
      <div className="mb-[18px] flex items-center justify-between gap-4">
        <h2 id="present-board-title" className="text-[30px] font-semibold" style={{ color: 'var(--ink)' }}>{`Leaderboard, Round ${round}`}</h2>
        <button ref={closeRef} type="button" onClick={onClose} className={QUIET_BUTTON} style={QUIET_BUTTON_STYLE}>
          <Minimize2 size={16} aria-hidden="true" />
          Close
        </button>
      </div>
      <div style={SHEET}>
        <LeaderboardTable rows={rows} lean={lean} sort={sort} big />
      </div>
    </div>
  );
};
