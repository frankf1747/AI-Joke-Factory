/* Shared pieces of the four lean charts: the round markers (hollow for "no
   sale yet"), the small legend drawn under each plot, the tooltip box and the
   notices, in the quiet factory tokens (index.css). */
import React from 'react';

export type MarkerShape = 'circle' | 'triangle';

export const Marker: React.FC<{
  cx?: number;
  cy?: number;
  shape: MarkerShape;
  color: string;
  hollow?: boolean;
  opacity?: number;
  size?: number;
}> = ({ cx, cy, shape, color, hollow = false, opacity = 1, size = 5 }) => {
  if (cx == null || cy == null || !Number.isFinite(cx) || !Number.isFinite(cy)) return <g />;
  const fill = hollow ? 'var(--sheet)' : color;
  if (shape === 'triangle') {
    const d = `M${cx},${cy - size * 1.15} L${cx + size},${cy + size * 0.85} L${cx - size},${cy + size * 0.85} Z`;
    return <path d={d} fill={fill} stroke={color} strokeWidth={1.5} opacity={opacity} />;
  }
  return <circle cx={cx} cy={cy} r={size} fill={fill} stroke={color} strokeWidth={1.5} opacity={opacity} />;
};

export interface LegendItem {
  label: string;
  color: string;
  kind: 'square' | 'circle' | 'triangle' | 'line' | 'dashed';
  hollow?: boolean;
  faded?: boolean;
}

export const ChartLegend: React.FC<{ items: ReadonlyArray<LegendItem> }> = ({ items }) => (
  <div className="mt-2 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[12.5px]" style={{ color: 'var(--ink-2)' }}>
    {items.map(item => (
      <span key={item.label} className="inline-flex items-center gap-1">
        <svg width="14" height="10" aria-hidden="true" opacity={item.faded ? 0.4 : 1}>
          {item.kind === 'square' && <rect x="2" y="1" width="10" height="8" rx="1.5" fill={item.color} />}
          {item.kind === 'circle' && (
            <circle cx="7" cy="5" r="3.5" fill={item.hollow ? 'var(--sheet)' : item.color} stroke={item.color} strokeWidth="1.5" />
          )}
          {item.kind === 'triangle' && (
            <path d="M7,1 L11,9 L3,9 Z" fill={item.hollow ? 'var(--sheet)' : item.color} stroke={item.color} strokeWidth="1.2" />
          )}
          {item.kind === 'line' && <line x1="1" y1="5" x2="13" y2="5" stroke={item.color} strokeWidth="2" />}
          {item.kind === 'dashed' && (
            <line x1="1" y1="5" x2="13" y2="5" stroke={item.color} strokeWidth="2" strokeDasharray="3 2" />
          )}
        </svg>
        {item.label}
      </span>
    ))}
  </div>
);

export const ChartTooltipBox: React.FC<{
  title: string;
  rows: ReadonlyArray<{ label: string; value: string; color?: string }>;
}> = ({ title, rows }) => (
  <div className="rounded-[var(--r-md)] px-3 py-2 shadow-sm" style={{ background: 'var(--sheet)', border: '1px solid var(--rule)' }}>
    <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{title}</div>
    <div className="mt-1 space-y-0.5 text-sm" style={{ color: 'var(--ink-2)' }}>
      {rows.map(r => (
        <div key={r.label} className="flex justify-between gap-4">
          <span className="flex items-center gap-1.5 font-medium">
            {r.color && <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: r.color }} />}
            {r.label}
          </span>
          <span className="font-mono font-medium">{r.value}</span>
        </div>
      ))}
    </div>
  </div>
);

/** "muted": an empty state in place of the plot. "warn": a line above the plot. */
export const ChartNotice: React.FC<{ text: string; tone?: 'muted' | 'warn' }> = ({ text, tone = 'muted' }) => (
  <p
    className={tone === 'warn' ? 'mb-2 text-[13px] font-medium' : 'py-6 text-center text-sm'}
    style={{ color: tone === 'warn' ? 'var(--warn)' : 'var(--ink-3)' }}
  >
    {text}
  </p>
);

/** Plot height in pixels: 180 on the compact student cards, 288 (h-72) on the instructor grid. */
export const chartHeight = (compact: boolean): number => (compact ? 180 : 288);
