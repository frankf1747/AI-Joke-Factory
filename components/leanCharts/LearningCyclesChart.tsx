/* Chart 4, "More cycles, more learning". Sell-through (share of released
   jokes that sold, 0 to 100 %) against the minute of the round: one line per
   round (Round 1 grey, Round 2 navy), labelled at its end.
   A batch sent too recently to judge (services/leanCharts.ts
   isTooRecentToJudge) is drawn hollow and left out of the line, so the end of
   the round does not read as learning collapsing.
   Series come from services/leanCharts.ts cyclesForInstructor. Instructor
   screen only: the student screens dropped their lean charts. */
import React from 'react';
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '../ui';
import {
  LEAN_CHARTS_UNAVAILABLE_TEXT, TOO_RECENT_CAPTION, TOO_RECENT_TEXT,
  fmtMinuteTick, minuteTicks, type CyclesModel, type CyclesPoint,
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
    kind: s.dashed ? 'dashed' : 'line',
    faded: s.faded,
  }));
  const xTicks = minuteTicks(Math.max(0, ...model.series.flatMap(s => s.points.map(p => p.minute))));
  return (
    <Card
      title="More cycles, more learning"
      subtitle="Share of released jokes that sold, across the class."
      className={className}
    >
      {unavailable && <ChartNotice text={LEAN_CHARTS_UNAVAILABLE_TEXT} tone="warn" />}
      <p className="mb-1 text-[12.5px]" style={{ color: 'var(--ink-3)' }}>{TOO_RECENT_CAPTION}</p>
      {model.emptyText ? (
        <ChartNotice text={model.emptyText} />
      ) : (
        <div className="w-full" style={{ height: chartHeight(compact) }}>
          <ResponsiveContainer>
            <ScatterChart margin={{ top: 8, right: 12, left: 0, bottom: compact ? 0 : 12 }}>
              <CartesianGrid stroke="var(--rule)" vertical={false} />
              <XAxis
                type="number" dataKey="minute" domain={[0, xTicks[xTicks.length - 1]]} ticks={xTicks}
                tickFormatter={(v) => fmtMinuteTick(Number(v))} tick={{ fontSize: 11.5, fill: 'var(--ink-3)' }}
                label={compact ? undefined : { value: 'minutes into the round', position: 'insideBottom', offset: -6, style: { fontSize: 11.5, fill: 'var(--ink-3)' } }}
              />
              <YAxis
                type="number" dataKey="rate" domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]}
                tickFormatter={(v) => `${Math.round(Number(v) * 100)}%`} width={40} tick={{ fontSize: 11.5, fill: 'var(--ink-3)' }}
              />
              <Tooltip
                cursor={{ strokeDasharray: '3 3' }}
                content={(props: any) => {
                  const p = props?.active ? (props?.payload?.[0]?.payload as CyclesPoint | undefined) : undefined;
                  if (!p) return null;
                  return (
                    <ChartTooltipBox
                      title={`Minute ${fmtMinuteTick(Math.round(p.minute * 10) / 10)}`}
                      rows={[
                        { label: p.label, value: `${Math.round(p.rate * 100)}%` },
                        ...(p.pending ? [{ label: TOO_RECENT_TEXT, value: '' }] : []),
                      ]}
                    />
                  );
                }}
              />
              {model.series.flatMap(s => {
                const judged = s.points.filter(p => !p.pending);
                const pending = s.points.filter(p => p.pending);
                const end = judged[judged.length - 1];
                const marker = (hollow: boolean) => (props: any) => (
                  <g>
                    {s.markers && (
                      <Marker
                        cx={props.cx} cy={props.cy} shape="circle" color={s.color}
                        hollow={hollow} opacity={s.faded ? 0.35 : 1} size={compact ? 3 : 4}
                      />
                    )}
                    {/* The end label: the round's name above its last judged point. */}
                    {!hollow && end && props.payload?.minute === end.minute && props.payload?.rate === end.rate && Number.isFinite(props.cx) && Number.isFinite(props.cy) && (
                      <text
                        x={props.cx - 4} y={props.cy - 9} textAnchor="end"
                        style={{ fontSize: 11.5, fontWeight: 600, fill: 'var(--ink-2)' }}
                      >{s.name}</text>
                    )}
                  </g>
                );
                return [
                  <Scatter
                    key={s.key}
                    name={s.name}
                    data={judged}
                    isAnimationActive={false}
                    lineJointType="linear"
                    line={{
                      stroke: s.color,
                      strokeWidth: s.dashed ? 1.5 : 2,
                      strokeDasharray: s.dashed ? '5 4' : undefined,
                      strokeOpacity: s.faded ? 0.35 : 1,
                    }}
                    shape={marker(false)}
                  />,
                  ...(pending.length > 0
                    ? [
                        <Scatter
                          key={`${s.key}-pending`}
                          name={`${s.name} · too recent`}
                          data={pending}
                          isAnimationActive={false}
                          shape={marker(true)}
                        />,
                      ]
                    : []),
                ];
              })}
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}
      <ChartLegend items={legend} />
    </Card>
  );
};

export default LearningCyclesChart;
