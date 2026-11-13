/* The Compare tab's learning curves: the share of released jokes that sold (or, for bot runs, fit) by batch
   number, one line per run, so runs can be compared batch by batch. */
import React, { useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { batchCurve, type CurveKind } from '../../../services/runRecord/measures';
import type { RunRecord } from '../../../services/runRecord/types';
import { ChartLegend, ChartNotice, ChartTooltipBox, chartHeight } from '../../leanCharts/chartParts';
import { CONTROL, CONTROL_STYLE, RUN_COLORS } from './layout';

type Point = { seq: number } & Record<string, number | undefined>;

const runKey = (i: number) => `run${i}`;

/** One point per batch number, each run's value under run0, run1, … */
function chartData(records: readonly RunRecord[], round: 1 | 2, kind: CurveKind): Point[] {
  const bySeq = new Map<number, Point>();
  records.forEach((r, i) => {
    for (const { seq, value } of batchCurve(r, round, kind)) {
      bySeq.set(seq, { ...(bySeq.get(seq) ?? { seq }), [runKey(i)]: value });
    }
  });
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq);
}

const fmt = (kind: CurveKind, v: number) => (kind === 'sold_share' ? `${Math.round(v)}%` : v.toFixed(1));

export const BatchChart: React.FC<{ records: readonly RunRecord[]; fitAvailable: boolean }> = ({ records, fitAvailable }) => {
  const [picked, setPicked] = useState<CurveKind>('sold_share');
  const [round, setRound] = useState<1 | 2>(1);
  const kind: CurveKind = fitAvailable ? picked : 'sold_share';
  const data = chartData(records, round, kind);
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <select value={kind} onChange={e => setPicked(e.target.value === 'fit' ? 'fit' : 'sold_share')} className={CONTROL} style={CONTROL_STYLE} aria-label="Curve">
          <option value="sold_share">Released jokes that sold, by batch</option>
          {fitAvailable && <option value="fit">Fit by batch</option>}
        </select>
        <select value={round} onChange={e => setRound(e.target.value === '2' ? 2 : 1)} className={CONTROL} style={CONTROL_STYLE} aria-label="Round">
          <option value="1">Round 1</option>
          <option value="2">Round 2</option>
        </select>
      </div>
      {data.length === 0 ? (
        <ChartNotice text={`No batch data for Round ${round} in these runs.`} />
      ) : (
        <div className="w-full" style={{ height: chartHeight(false) }}>
          <ResponsiveContainer>
            <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 12 }}>
              <CartesianGrid stroke="var(--rule)" vertical={false} />
              <XAxis
                type="number" dataKey="seq" domain={['dataMin', 'dataMax']} allowDecimals={false}
                tick={{ fontSize: 11.5, fill: 'var(--ink-3)' }}
                label={{ value: 'batch', position: 'insideBottom', offset: -6, style: { fontSize: 11.5, fill: 'var(--ink-3)' } }}
              />
              <YAxis
                type="number" domain={kind === 'sold_share' ? [0, 100] : ['auto', 'auto']}
                tickFormatter={v => fmt(kind, Number(v))} width={40} tick={{ fontSize: 11.5, fill: 'var(--ink-3)' }}
              />
              <Tooltip
                content={(props: any) => {
                  const p = props?.active ? (props?.payload?.[0]?.payload as Point | undefined) : undefined;
                  if (!p) return null;
                  return (
                    <ChartTooltipBox
                      title={`Batch ${p.seq}`}
                      rows={records.flatMap((r, i) => {
                        const v = p[runKey(i)];
                        return v === undefined ? [] : [{ label: r.name, value: fmt(kind, v), color: RUN_COLORS[i % RUN_COLORS.length] }];
                      })}
                    />
                  );
                }}
              />
              {records.map((r, i) => (
                <Line
                  key={i} type="monotone" dataKey={runKey(i)} name={r.name} connectNulls isAnimationActive={false}
                  stroke={RUN_COLORS[i % RUN_COLORS.length]} strokeWidth={2} dot={{ r: 3 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <ChartLegend items={records.map((r, i) => ({ label: r.name, color: RUN_COLORS[i % RUN_COLORS.length], kind: 'line' }))} />
    </div>
  );
};
