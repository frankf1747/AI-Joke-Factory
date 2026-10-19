/* Chart 2, "Jokes standing still" (instructor only, spec 6b). One row per team,
   biggest pile first, so twenty teams fit without a team picker. "Right now"
   is the latest sample as a bar (waiting on Marketing, then unsold on the
   market) with the class average as a dashed tick; "Over the round" is the same
   two counts as a light stacked area, with the class average dashed. Clicking
   a row opens that team's full chart under it. Rows come from
   services/idleRows.ts. */
import React, { useId, useState } from 'react';
import { Card } from '../ui';
import type { LeanChartsResponse } from '../../types/api';
import { LEAN_CHART_COLORS, LEAN_CHARTS_UNAVAILABLE_TEXT, NO_BATCHES_TEXT, fmtMinuteTick, minuteTicks } from '../../services/leanCharts';
import { idleAverageNow, idlePeak, idleRows, type IdleAvgPoint, type IdleRowPoint, type IdleTeamRow } from '../../services/idleRows';
import { fmtDuration } from '../../services/format';
import { ChartLegend, ChartNotice } from './chartParts';

export interface IdleRowsProps {
  data: LeanChartsResponse | null;
  teamNames: Record<string, string>;
  unavailable?: boolean;
  className?: string;
}

const AXIS: React.CSSProperties = { fontSize: 11.5, fill: 'var(--ink-3)' };
const jokes = (n: number) => `${n} ${n === 1 ? 'joke' : 'jokes'}`;
const fmtCount = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

/** The two stacked bands and the class-average line, in the plot's own pixels. */
function trendPaths(
  series: ReadonlyArray<IdleRowPoint>,
  avg: ReadonlyArray<IdleAvgPoint>,
  x: (t: number) => number,
  y: (v: number) => number,
): { waiting: string; shelf: string; avg: string } {
  const at = (t: number, v: number) => `${x(t).toFixed(1)},${y(v).toFixed(1)}`;
  const top = (f: (p: IdleRowPoint) => number) => series.map((p, i) => `${i ? 'L' : 'M'}${at(p.t, f(p))}`).join('');
  const back = (f: (p: IdleRowPoint) => number) => [...series].reverse().map(p => `L${at(p.t, f(p))}`).join('');
  return {
    waiting: series.length ? `${top(p => p.waiting)}${back(() => 0)}Z` : '',
    shelf: series.length ? `${top(p => p.waiting + p.shelf)}${back(p => p.waiting)}Z` : '',
    avg: avg.map((p, i) => `${i ? 'L' : 'M'}${at(p.t, p.total)}`).join(''),
  };
}

const TrendFills: React.FC<{ paths: ReturnType<typeof trendPaths> }> = ({ paths }) => (
  <>
    <path d={paths.waiting} fill={LEAN_CHART_COLORS.storage} opacity={0.45} />
    <path d={paths.shelf} fill={LEAN_CHART_COLORS.hosting} opacity={0.5} />
    <path
      d={paths.avg} fill="none" stroke={LEAN_CHART_COLORS.classAverage} strokeWidth={1}
      strokeDasharray="3 2" vectorEffect="non-scaling-stroke"
    />
  </>
);

const SPARK_W = 150;
// About 26 px a row (the spark plus 3 px above and below), so twenty teams fit.
const SPARK_H = 20;

const Spark: React.FC<{ row: IdleTeamRow; maxT: number; maxY: number }> = ({ row, maxT, maxY }) => {
  const x = (t: number) => 1 + (t / maxT) * (SPARK_W - 2);
  const y = (v: number) => SPARK_H - 1 - (v / maxY) * (SPARK_H - 3);
  const peak = idlePeak(row.series);
  const tip = peak && peak.jokes > 0
    ? `${row.teamName}: peak ${jokes(peak.jokes)} at ${fmtDuration(peak.t)}`
    : `${row.teamName}: nothing standing still yet`;
  return (
    <svg viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} width="100%" height={SPARK_H} preserveAspectRatio="none" role="img" aria-label={tip}>
      <title>{tip}</title>
      <TrendFills paths={trendPaths(row.series, row.avgSeries, x, y)} />
    </svg>
  );
};

const DETAIL_W = 560;
const DETAIL_H = 190;

/** The opened team's full chart: the same areas with axes. */
const Detail: React.FC<{ row: IdleTeamRow; maxT: number }> = ({ row, maxT }) => {
  const L = 36, R = 12, T = 10, B = 32;
  const xTicks = minuteTicks(maxT / 60);
  const xMax = xTicks[xTicks.length - 1] * 60 || 1;
  const peak = Math.max(1, ...row.series.map(p => p.waiting + p.shelf), ...row.avgSeries.map(p => p.total));
  const yMax = Math.ceil(peak / 2) * 2;
  const x = (t: number) => L + (t / xMax) * (DETAIL_W - L - R);
  const y = (v: number) => T + (1 - v / yMax) * (DETAIL_H - T - B);
  return (
    <svg viewBox={`0 0 ${DETAIL_W} ${DETAIL_H}`} className="block h-auto w-full" role="img" aria-label={`${row.teamName}, jokes standing still over the round`}>
      {[0, 0.5, 1].map(f => (
        <g key={f}>
          <line x1={L} x2={DETAIL_W - R} y1={y(f * yMax)} y2={y(f * yMax)} stroke="var(--rule)" />
          <text x={L - 8} y={y(f * yMax) + 4} textAnchor="end" style={AXIS}>{fmtCount(f * yMax)}</text>
        </g>
      ))}
      {xTicks.map(m => (
        <text key={m} x={x(m * 60)} y={DETAIL_H - B + 16} textAnchor="middle" style={AXIS}>{fmtMinuteTick(m)}</text>
      ))}
      <text x={(L + DETAIL_W - R) / 2} y={DETAIL_H - 2} textAnchor="middle" style={AXIS}>minutes into the round</text>
      <TrendFills paths={trendPaths(row.series, row.avgSeries, x, y)} />
    </svg>
  );
};

export const IdleRows: React.FC<IdleRowsProps> = ({ data, teamNames, unavailable = false, className = '' }) => {
  const [open, setOpen] = useState<number | null>(null);
  const regionId = useId();
  const rows = idleRows(data, teamNames);
  const avgNow = idleAverageNow(rows);
  const maxNow = Math.max(1, avgNow, ...rows.map(r => r.total));
  const lastT = (pts: ReadonlyArray<{ t: number }>) => pts[pts.length - 1]?.t ?? 0;
  const maxT = Math.max(1, ...rows.flatMap(r => [lastT(r.series), lastT(r.avgSeries)]));
  const maxY = Math.max(1, ...rows.flatMap(r => [...r.series.map(p => p.waiting + p.shelf), ...r.avgSeries.map(p => p.total)]));
  const started = rows.some(r => r.series.length > 0);
  const pct = (v: number) => `${(v / maxNow) * 100}%`;
  const cols = 'grid grid-cols-[88px_minmax(0,1.3fr)_minmax(0,1fr)] items-center gap-2.5';
  return (
    <Card title="Jokes standing still" subtitle="Every team, biggest pile first. Click a team for its full chart." className={className}>
      {unavailable && <ChartNotice text={LEAN_CHARTS_UNAVAILABLE_TEXT} tone="warn" />}
      {!started ? (
        <ChartNotice text={NO_BATCHES_TEXT} />
      ) : (
        <div>
          <div className={`${cols} px-2 pb-1 text-[12px]`} style={{ color: 'var(--ink-3)' }}>
            <span />
            <span>Right now</span>
            <span>Over the round</span>
          </div>
          {rows.map(r => {
            const isOpen = open === r.teamId;
            const detailId = `${regionId}-team-${r.teamId}`;
            return (
              <React.Fragment key={r.teamId}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={detailId}
                  onClick={() => setOpen(isOpen ? null : r.teamId)}
                  className={`${cols} w-full rounded-[6px] px-2 py-[3px] text-left hover:bg-[color:var(--paper)]`}
                  style={isOpen ? { background: 'var(--paper)' } : undefined}
                >
                  <span className="truncate text-[13.5px] font-semibold" style={{ color: 'var(--ink)' }} title={r.teamName}>{r.teamName}</span>
                  <span className="flex items-center gap-2">
                    <span className="relative flex h-3 flex-1 gap-px">
                      {r.waiting > 0 && (
                        <i
                          className="block h-full rounded-[2px]"
                          style={{ width: pct(r.waiting), background: LEAN_CHART_COLORS.storage }}
                          title={`${r.teamName}: ${r.waiting} waiting on Marketing`}
                        />
                      )}
                      {r.shelf > 0 && (
                        <i
                          className="block h-full rounded-[2px]"
                          style={{ width: pct(r.shelf), background: LEAN_CHART_COLORS.hosting }}
                          title={`${r.teamName}: ${r.shelf} unsold on the market`}
                        />
                      )}
                      <b
                        className="absolute -bottom-1 -top-1 w-0"
                        style={{ left: pct(avgNow), borderLeft: '1.5px dashed var(--ink-3)' }}
                        title={`Class average: ${fmtCount(avgNow)}`}
                      />
                    </span>
                    <span
                      className="min-w-[22px] font-mono text-[13.5px] font-semibold tabular-nums"
                      style={{ color: r.aboveAverage ? 'var(--warn)' : 'var(--ink-2)' }}
                    >{r.total}</span>
                  </span>
                  <Spark row={r} maxT={maxT} maxY={maxY} />
                </button>
                <div
                  id={detailId}
                  role="region"
                  aria-label={`${r.teamName}, full chart`}
                  hidden={!isOpen}
                  className="mb-1 pb-2.5 pt-1"
                  style={{ borderBottom: '1px solid var(--rule)' }}
                >
                  {isOpen && <Detail row={r} maxT={maxT} />}
                </div>
              </React.Fragment>
            );
          })}
        </div>
      )}
      <ChartLegend
        items={[
          { label: 'Waiting on Marketing', color: LEAN_CHART_COLORS.storage, kind: 'square' },
          { label: 'Unsold on the market', color: LEAN_CHART_COLORS.hosting, kind: 'square' },
          { label: 'Class average', color: LEAN_CHART_COLORS.classAverage, kind: 'dashed' },
        ]}
      />
    </Card>
  );
};

export default IdleRows;
