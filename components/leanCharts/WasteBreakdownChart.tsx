/* Chart 1, "Where the money leaked" (instructor only). One bar per team, most
   fees first, split into the five kinds of waste in dollars, with the total at
   the end of each bar. Shipping + Storage + Hosting equals the leaderboard's
   fees for that team. Plain rounded segments, like the fee bars elsewhere. */
import React from 'react';
import { Card } from '../ui';
import type { LeanChartsResponse } from '../../types/api';
import { fmtMoney } from '../../services/leanMode';
import { LEAN_CHARTS_UNAVAILABLE_TEXT, NO_BATCHES_TEXT, WASTE_SEGMENTS, hasWaste, wasteBars } from '../../services/leanCharts';
import { ChartLegend, ChartNotice } from './chartParts';

export interface WasteBreakdownChartProps {
  data: LeanChartsResponse | null;
  teamNames: Record<string, string>;
  unavailable?: boolean;
  className?: string;
}

export const WasteBreakdownChart: React.FC<WasteBreakdownChartProps> = ({
  data, teamNames, unavailable = false, className = '',
}) => {
  const rows = wasteBars(data, teamNames);
  const max = Math.max(0.01, ...rows.map(r => r.total));
  return (
    <Card title="Where the money leaked" subtitle="Fees per team, most first. Shorter is leaner." className={className}>
      {unavailable && <ChartNotice text={LEAN_CHARTS_UNAVAILABLE_TEXT} tone="warn" />}
      {!hasWaste(rows) ? (
        <ChartNotice text={NO_BATCHES_TEXT} />
      ) : (
        <div className="space-y-[9px]">
          {rows.map(r => (
            <div key={r.teamId} className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-2.5">
              <span className="truncate text-right text-[12.5px]" style={{ color: 'var(--ink-3)' }} title={r.team}>{r.team}</span>
              <span className="flex items-center gap-1.5">
                <span className="flex h-4 gap-0.5" style={{ width: `calc((100% - 64px) * ${r.total / max})` }}>
                  {WASTE_SEGMENTS.filter(s => r[s.key] > 0).map(s => (
                    <i
                      key={s.key}
                      className="block h-full min-w-[4px] rounded-[2px] first:rounded-l-[4px] last:rounded-r-[4px]"
                      style={{ flexGrow: r[s.key], flexBasis: 0, background: s.color }}
                      title={`${r.team}: ${s.label} ${fmtMoney(r[s.key])}`}
                    />
                  ))}
                </span>
                <span className="font-mono text-[12.5px] tabular-nums" style={{ color: 'var(--ink-2)' }}>{fmtMoney(r.total)}</span>
              </span>
            </div>
          ))}
        </div>
      )}
      <ChartLegend items={WASTE_SEGMENTS.map(s => ({ label: s.label, color: s.color, kind: 'square' as const }))} />
    </Card>
  );
};

export default WasteBreakdownChart;
