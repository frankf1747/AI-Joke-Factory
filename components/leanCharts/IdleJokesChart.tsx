/* Chart 2 — "Jokes standing still". For one team: jokes waiting for Marketing
   (bottom band) and unsold on the shelf (top band) at each sample of the round,
   with the class-average total as a dashed line. The WIP limit counts batches
   and the chart counts jokes, so the limit is stated in the subtitle, not drawn. */
import React from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '../ui';
import type { LeanChartsClassAverage, LeanChartsTeam } from '../../types/api';
import {
  LEAN_CHART_COLORS, LEAN_CHARTS_UNAVAILABLE_TEXT, NO_BATCHES_TEXT,
  fmtMinuteTick, hasIdle, idleRows, idleSubtitle, type IdleRow,
} from '../../services/leanCharts';
import { ChartLegend, ChartNotice, ChartTooltipBox, chartHeight } from './chartParts';

export interface IdleJokesChartProps {
  team: LeanChartsTeam | null;
  classAverage: LeanChartsClassAverage | null;
  wipLimit: number;
  /** Student side panel: 180 px plot, no axis title. */
  compact?: boolean;
  /** Instructor: which team the chart shows. */
  teamLabel?: string | null;
  unavailable?: boolean;
  className?: string;
}

const fmtCount = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

export const IdleJokesChart: React.FC<IdleJokesChartProps> = ({
  team, classAverage, wipLimit, compact = false, teamLabel = null, unavailable = false, className = '',
}) => {
  const rows = idleRows(team, classAverage);
  return (
    <Card title="Jokes standing still" subtitle={idleSubtitle(wipLimit)} className={className}>
      {unavailable && <ChartNotice text={LEAN_CHARTS_UNAVAILABLE_TEXT} tone="warn" />}
      {teamLabel && <div className="mb-1 text-xs font-semibold text-gray-600">Showing {teamLabel}</div>}
      <ChartLegend
        items={[
          { label: 'Waiting at Marketing', color: LEAN_CHART_COLORS.waiting, kind: 'square' },
          { label: 'Unsold on shelf', color: LEAN_CHART_COLORS.shelf, kind: 'square' },
          { label: 'Class average', color: LEAN_CHART_COLORS.classAverage, kind: 'dashed' },
        ]}
      />
      {!hasIdle(rows) ? (
        <ChartNotice text={NO_BATCHES_TEXT} />
      ) : (
        <div className="w-full" style={{ height: chartHeight(compact) }}>
          <ResponsiveContainer>
            <ComposedChart data={rows} margin={{ top: 4, right: 12, left: 0, bottom: compact ? 0 : 12 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="minute"
                type="number"
                domain={[0, 'dataMax'] as const}
                tickFormatter={(v) => fmtMinuteTick(Number(v))}
                tick={{ fontSize: 11 }}
                label={compact ? undefined : { value: 'Minute of the round', position: 'insideBottom', offset: -6, style: { fontSize: 11 } }}
              />
              <YAxis allowDecimals={false} width={32} tick={{ fontSize: 11 }} />
              <Tooltip
                content={(props: any) => {
                  const row = props?.active ? (props?.payload?.[0]?.payload as IdleRow | undefined) : undefined;
                  if (!row) return null;
                  return (
                    <ChartTooltipBox
                      title={`Minute ${fmtMinuteTick(row.minute)}`}
                      rows={[
                        { label: 'Waiting at Marketing', value: fmtCount(row.waiting), color: LEAN_CHART_COLORS.waiting },
                        { label: 'Unsold on shelf', value: fmtCount(row.shelf), color: LEAN_CHART_COLORS.shelf },
                        { label: 'Class average', value: fmtCount(row.classAverage), color: LEAN_CHART_COLORS.classAverage },
                      ]}
                    />
                  );
                }}
              />
              <Area
                type="linear" dataKey="waiting" name="Waiting at Marketing" stackId="idle"
                stroke={LEAN_CHART_COLORS.waiting} fill={LEAN_CHART_COLORS.waiting} fillOpacity={0.35} isAnimationActive={false}
              />
              <Area
                type="linear" dataKey="shelf" name="Unsold on shelf" stackId="idle"
                stroke={LEAN_CHART_COLORS.shelf} fill={LEAN_CHART_COLORS.shelf} fillOpacity={0.35} isAnimationActive={false}
              />
              <Line
                type="linear" dataKey="classAverage" name="Class average" stroke={LEAN_CHART_COLORS.classAverage}
                strokeDasharray="5 4" strokeWidth={1.5} dot={false} isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
};

export default IdleJokesChart;
