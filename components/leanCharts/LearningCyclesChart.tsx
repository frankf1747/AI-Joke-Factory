/* Chart 4 — "More cycles, more learning". Sell-through (share of released
   jokes that sold, 0–100 %) against the minute of the round. Each series is
   drawn as connected markers (Round 1 circles, Round 2 triangles) or, for the
   class average, a dashed line; a faded series is an earlier round behind.
   Series come from services/leanCharts.ts cyclesForInstructor / cyclesForStudent. */
import React from 'react';
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '../ui';
import {
  LEAN_CHARTS_UNAVAILABLE_TEXT, fmtMinuteTick, type CyclesModel, type CyclesPoint,
} from '../../services/leanCharts';
import { ChartLegend, ChartNotice, ChartTooltipBox, Marker, chartHeight, type LegendItem } from './chartParts';

export interface LearningCyclesChartProps {
  model: CyclesModel;
  compact?: boolean;
  unavailable?: boolean;
  className?: string;
}

export const LearningCyclesChart: React.FC<LearningCyclesChartProps> = ({
  model, compact = false, unavailable = false, className = '',
}) => {
  const legend: LegendItem[] = model.series.map(s => ({
    label: s.name,
    color: s.color,
    kind: s.dashed ? 'dashed' : s.markers ? (s.round === 2 ? 'triangle' : 'circle') : 'line',
    faded: s.faded,
  }));
  return (
    <Card
      title="More cycles, more learning"
      subtitle="Each dot is a batch: how much of it sold. More dots = more chances to adjust."
      className={className}
    >
      {unavailable && <ChartNotice text={LEAN_CHARTS_UNAVAILABLE_TEXT} tone="warn" />}
      <ChartLegend items={legend} />
      {model.emptyText ? (
        <ChartNotice text={model.emptyText} />
      ) : (
        <div className="w-full" style={{ height: chartHeight(compact) }}>
          <ResponsiveContainer>
            <ScatterChart margin={{ top: 8, right: 12, left: 0, bottom: compact ? 0 : 12 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                type="number" dataKey="minute" domain={[0, 'dataMax'] as const}
                tickFormatter={(v) => fmtMinuteTick(Number(v))} tick={{ fontSize: 11 }}
                label={compact ? undefined : { value: 'Minute the batch was sent', position: 'insideBottom', offset: -6, style: { fontSize: 11 } }}
              />
              <YAxis
                type="number" dataKey="rate" domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]}
                tickFormatter={(v) => `${Math.round(Number(v) * 100)}%`} width={40} tick={{ fontSize: 11 }}
              />
              <Tooltip
                cursor={{ strokeDasharray: '3 3' }}
                content={(props: any) => {
                  const p = props?.active ? (props?.payload?.[0]?.payload as CyclesPoint | undefined) : undefined;
                  if (!p) return null;
                  return (
                    <ChartTooltipBox
                      title={`Minute ${fmtMinuteTick(Math.round(p.minute * 10) / 10)}`}
                      rows={[{ label: p.label, value: `${Math.round(p.rate * 100)}%` }]}
                    />
                  );
                }}
              />
              {model.series.map(s => (
                <Scatter
                  key={s.key}
                  name={s.name}
                  data={s.points}
                  isAnimationActive={false}
                  lineJointType="linear"
                  line={{
                    stroke: s.color,
                    strokeWidth: s.dashed ? 1.5 : 2,
                    strokeDasharray: s.dashed ? '5 4' : undefined,
                    strokeOpacity: s.faded ? 0.35 : 1,
                  }}
                  shape={(props: any) =>
                    s.markers ? (
                      <Marker
                        cx={props.cx} cy={props.cy} shape={s.round === 2 ? 'triangle' : 'circle'} color={s.color}
                        opacity={s.faded ? 0.35 : 1} size={compact ? 4 : 5}
                      />
                    ) : (
                      <g />
                    )
                  }
                />
              ))}
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
};

export default LearningCyclesChart;
