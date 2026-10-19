/* Chart 3, "Smaller batches, faster feedback" (instructor only). One dot per
   batch: jokes in the batch across (jittered so equal sizes do not stack),
   minutes from sending to its first sale up. Round 1 grey, Round 2 navy.
   Batches with no sale yet are hollow, in a "no sale yet" band above the top
   of the axis, so they are visible and never read as fast. Until Round 2 has
   batches, a note says why Round 1's dots all sit at 5 jokes. */
import React from 'react';
import { CartesianGrid, ReferenceArea, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '../ui';
import {
  LEAN_CHART_COLORS, LEAN_CHARTS_UNAVAILABLE_TEXT, NO_BATCHES_TEXT, fmtMinutes,
  type BatchScatter, type BatchScatterPoint,
} from '../../services/leanCharts';
import { ChartLegend, ChartNotice, ChartTooltipBox, Marker, chartHeight } from './chartParts';

export interface BatchFeedbackChartProps {
  scatter: BatchScatter;
  unavailable?: boolean;
  className?: string;
}

export const ROUND_1_BATCH_NOTE = 'Round 1 batches are all 5 jokes. Round 2 lets teams pick 1 to 10.';

const renderPoint = (props: any) => {
  const p = props?.payload as BatchScatterPoint | undefined;
  if (!p) return <g />;
  return (
    <Marker
      cx={props.cx}
      cy={props.cy}
      shape="circle"
      color={p.round === 2 ? LEAN_CHART_COLORS.round2 : LEAN_CHART_COLORS.round1}
      hollow={p.noSale}
    />
  );
};

function firstSaleText(p: BatchScatterPoint): string {
  if (p.minutes != null) return fmtMinutes(p.minutes);
  return p.published > 0 ? 'No sale yet' : 'Nothing released yet';
}

export const BatchFeedbackChart: React.FC<BatchFeedbackChartProps> = ({ scatter, unavailable = false, className = '' }) => {
  const empty = scatter.r1.length + scatter.r2.length === 0;
  const xTicks = Array.from({ length: scatter.xMax }, (_, i) => i + 1);
  return (
    <Card
      title="Smaller batches, faster feedback"
      subtitle="Batch size against minutes to its first sale. Hollow: no sale yet."
      className={className}
    >
      {unavailable && <ChartNotice text={LEAN_CHARTS_UNAVAILABLE_TEXT} tone="warn" />}
      {scatter.r2.length === 0 && (
        <p className="mb-1 text-[12.5px]" style={{ color: 'var(--ink-2)' }}>{ROUND_1_BATCH_NOTE}</p>
      )}
      {empty ? (
        <ChartNotice text={NO_BATCHES_TEXT} />
      ) : (
        <div className="w-full" style={{ height: chartHeight(false) }}>
          <ResponsiveContainer>
            <ScatterChart margin={{ top: 8, right: 16, left: 0, bottom: 12 }}>
              <CartesianGrid stroke="var(--rule)" vertical={false} />
              <XAxis
                type="number" dataKey="x" domain={[0.5, scatter.xMax + 0.5]} ticks={xTicks} allowDecimals={false}
                tick={{ fontSize: 11.5, fill: 'var(--ink-3)' }}
                label={{ value: 'jokes in the batch', position: 'insideBottom', offset: -6, style: { fontSize: 11.5, fill: 'var(--ink-3)' } }}
              />
              <YAxis
                type="number" dataKey="y" domain={[0, scatter.bandTo]} ticks={scatter.yTicks} width={40}
                tick={{ fontSize: 11.5, fill: 'var(--ink-3)' }}
                label={{ value: 'minutes to first sale', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fontSize: 11.5, fill: 'var(--ink-3)' } }}
              />
              {/* recharts 3.6 types do not accept `fill` on ReferenceArea, so the band is a custom shape. */}
              <ReferenceArea
                y1={scatter.bandFrom}
                y2={scatter.bandTo}
                shape={(props: any) => <rect x={props.x} y={props.y} width={props.width} height={props.height} fill="var(--paper)" />}
                label={{ value: 'no sale yet', position: 'insideTopRight', style: { fontSize: 11, fill: LEAN_CHART_COLORS.classAverage } }}
              />
              <Tooltip
                cursor={{ strokeDasharray: '3 3' }}
                content={(props: any) => {
                  const p = props?.active ? (props?.payload?.[0]?.payload as BatchScatterPoint | undefined) : undefined;
                  if (!p) return null;
                  return (
                    <ChartTooltipBox
                      title={`${p.team} · Round ${p.round} · batch ${p.seq}`}
                      rows={[
                        { label: 'Jokes', value: String(p.jokes) },
                        { label: 'Sold', value: `${p.sold} of ${p.published} released` },
                        { label: 'First sale', value: firstSaleText(p) },
                      ]}
                    />
                  );
                }}
              />
              <Scatter name="Round 1" data={scatter.r1} shape={renderPoint} isAnimationActive={false} />
              <Scatter name="Round 2" data={scatter.r2} shape={renderPoint} isAnimationActive={false} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}
      <ChartLegend
        items={[
          { label: 'Round 1', color: LEAN_CHART_COLORS.round1, kind: 'circle' },
          { label: 'Round 2', color: LEAN_CHART_COLORS.round2, kind: 'circle' },
        ]}
      />
    </Card>
  );
};

export default BatchFeedbackChart;
