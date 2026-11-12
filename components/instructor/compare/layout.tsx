/* Shared column layout for the Compare tab: every table has one label column and one
   column per run at the same widths, so the run columns line up from table to table. */
import React from 'react';

export const LABEL_WIDTH = 280;
export const RUN_MIN_WIDTH = 168;

/** Fixed-layout table columns: the label column, then the runs sharing the rest. */
export const RunColumns: React.FC<{ count: number }> = ({ count }) => (
  <colgroup>
    <col style={{ width: LABEL_WIDTH }} />
    {Array.from({ length: count }, (_, i) => <col key={i} />)}
  </colgroup>
);

export const TABLE = 'w-full table-fixed border-collapse text-[13.5px] tabular-nums';
export const ROW_BORDER: React.CSSProperties = { borderTop: '1px solid var(--rule)' };
export const DASH = '–';

export const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 className="mb-2 mt-6 text-[14px] font-semibold" style={{ color: 'var(--ink)' }}>{children}</h3>
);

export const CONTROL =
  'rounded-[4px] border bg-[color:var(--paper)] px-1.5 py-1 text-[12.5px] focus:border-[color:var(--navy)] focus:bg-[color:var(--sheet)] focus:outline-none';
export const CONTROL_STYLE: React.CSSProperties = { borderColor: 'var(--rule)', color: 'var(--ink)' };

/** One colour per run, in load order (at most six runs). */
export const RUN_COLORS = [
  'var(--chart-round-2)', 'var(--chart-storage)', 'var(--chart-shipping)',
  'var(--chart-hosting)', 'var(--chart-never-sold)', 'var(--chart-round-1)',
];
