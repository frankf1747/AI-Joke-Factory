/* Chart 1 — "Where the money leaked" (instructor only). One horizontal bar per
   team, most waste first, split into the five kinds of waste in dollars, with
   the total at the end of each bar. Setup + Waiting + Unsold equals the
   leaderboard's Setup + Carrying for that team. */
import React from 'react';
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '../ui';
import type { LeanChartsResponse } from '../../types/api';
import { fmtMoney } from '../../services/leanMode';
import {
  LEAN_CHARTS_UNAVAILABLE_TEXT, NO_BATCHES_TEXT, WASTE_SEGMENTS, hasWaste, wasteBars, type WasteBarRow,
} from '../../services/leanCharts';
import { ChartLegend, ChartNotice, ChartTooltipBox } from './chartParts';

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
  const height = Math.max(180, rows.length * 34 + 48);
  return (
    <Card title="Where the money leaked" subtitle="Cost of waste per team, by kind. Shorter bars = leaner." className={className}>
      {unavailable && <ChartNotice text={LEAN_CHARTS_UNAVAILABLE_TEXT} tone="warn" />}
      <ChartLegend items={WASTE_SEGMENTS.map(s => ({ label: s.label, color: s.color, kind: 'square' as const }))} />
      {!hasWaste(rows) ? (
        <ChartNotice text={NO_BATCHES_TEXT} />
      ) : (
        <div className="w-full" style={{ height }}>
          <ResponsiveContainer>
            <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 64, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tickFormatter={(v) => fmtMoney(Number(v))} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="team" width={104} tick={{ fontSize: 12 }} />
              <Tooltip
                cursor={{ fill: 'rgba(148, 163, 184, 0.12)' }}
                content={(props: any) => {
                  const row = props?.active ? (props?.payload?.[0]?.payload as WasteBarRow | undefined) : undefined;
                  if (!row) return null;
                  return (
                    <ChartTooltipBox
                      title={row.team}
                      rows={[
                        ...WASTE_SEGMENTS.map(s => ({ label: s.label, value: fmtMoney(row[s.key]), color: s.color })),
                        { label: 'Total', value: fmtMoney(row.total) },
                      ]}
                    />
                  );
                }}
              />
              {WASTE_SEGMENTS.map((s, i) => (
                <Bar key={s.key} dataKey={s.key} name={s.label} stackId="waste" fill={s.color} isAnimationActive={false}>
                  {i === WASTE_SEGMENTS.length - 1 && (
                    <LabelList dataKey="total" position="right" formatter={(v) => fmtMoney(Number(v))} fill="#334155" fontSize={12} />
                  )}
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
};

export default WasteBreakdownChart;
