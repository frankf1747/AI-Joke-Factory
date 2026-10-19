/* The Instructor's Live tab (spec 6b): the class totals, the leaderboard, the
   charts and the live market. The screen keeps the polling (context,
   useLeanCharts), the stats rows, the sort and the rank moves, so switching tabs
   neither stops nor repeats a fetch and a rank change seen on another tab still
   tags its row. The Classic chart cards below are Task D6's to remove. */
import React, { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, X } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, ScatterChart, Scatter, LabelList
} from 'recharts';
import { useGame } from '../../context';
import { Card } from '../../components';
import { LeanChartsPanel } from '../leanCharts/LeanChartsPanel';
import type { LeanChartsState } from '../../services/useLeanCharts';
import { classTotals, type LeaderboardRow } from '../../services/classTotals';
import { boardRows, nextBoardSort, type BoardRanks, type BoardSort } from '../../services/liveBoard';
import { ClassTotalsRow, LeaderboardTable, PresentBoard, QUIET_BUTTON, QUIET_BUTTON_STYLE } from './LiveBoard';
import { LiveMarket } from './LiveMarket';

export const CHART_KEYS = ['sales', 'sequence_quality', 'unrated_jokes'] as const;
export type ChartKey = typeof CHART_KEYS[number];

type Setter<T> = React.Dispatch<React.SetStateAction<T>>;
type RoundMode = 'R1' | 'R2' | 'BOTH';
type Metric = { key: string; label: string };
export type WasteRow = { team_id: string; team_name: string; r1_wasted: number; r1_rate: number; r2_wasted: number; r2_rate: number };
export type ScatterPoint = {
  team_name: string; round: 'R1' | 'R2'; x: number; y: number; xLabel: string; yLabel: string; xRaw: number; yRaw: number;
};

export interface LiveTabProps {
  viewRound: 1 | 2;
  /** The stats rows of the round in view. */
  leaderboard: LeaderboardRow[];
  /** The round in view is Lean: fees, never sold and the two waits show. */
  boardLean: boolean;
  boardSort: BoardSort;
  setBoardSort: Setter<BoardSort>;
  boardRanks: BoardRanks;
  /** The current round has started, so its market is open. */
  marketOpen: boolean;
  setExpandedChart: (chart: string | null) => void;
  renderChart: (type: string, opts?: { isExpanded?: boolean }) => React.ReactNode;
  hiddenCharts: ChartKey[];
  restoreAllCharts: () => void;
  isChartHidden: (key: ChartKey) => boolean;
  hideChart: (key: ChartKey) => void;
  showLeanCharts: boolean;
  leanChartsRound: 1 | 2;
  leanChartsR1: LeanChartsState;
  leanChartsR2: LeanChartsState;
  visibleTeamIds: string[];
  salesTab: RoundMode; setSalesTab: Setter<RoundMode>;
  salesTeamFilter: string; setSalesTeamFilter: Setter<string>;
  sequenceTab: RoundMode; setSequenceTab: Setter<RoundMode>;
  sequenceTeamFilter: string; setSequenceTeamFilter: Setter<string>;
  unratedTab: RoundMode; setUnratedTab: Setter<RoundMode>;
  unratedTeamFilter: string; setUnratedTeamFilter: Setter<string>;
  wasteChartMode: 'count' | 'rate'; setWasteChartMode: Setter<'count' | 'rate'>;
  wasteChartData: WasteRow[];
  scatterRoundMode: RoundMode; setScatterRoundMode: Setter<RoundMode>;
  scatterXMetric: string; setScatterXMetric: Setter<string>;
  scatterYMode: 'metric' | 'ratio'; setScatterYMode: Setter<'metric' | 'ratio'>;
  scatterYMetric: string; setScatterYMetric: Setter<string>;
  scatterNumerator: string; setScatterNumerator: Setter<string>;
  scatterDenominator: string; setScatterDenominator: Setter<string>;
  scatterBaseMetrics: Metric[];
  scatterMetrics: Metric[];
  scatterData: ScatterPoint[];
  metricLabel: (key: string) => string;
  yAxisLabel: string;
  isRatioYAxis: boolean;
  isXMetricInteger: boolean;
  isYMetricInteger: boolean;
  formatScatterValue: (val: number, isInteger: boolean) => string;
  renderScatterDot: (props: any) => React.ReactElement | null;
  renderScatterLabel: (props: any) => React.ReactElement | null;
}

export const LiveTab: React.FC<LiveTabProps> = ({
  viewRound, leaderboard, boardLean, boardSort, setBoardSort, boardRanks, marketOpen, setExpandedChart, renderChart,
  hiddenCharts, restoreAllCharts, isChartHidden, hideChart,
  showLeanCharts, leanChartsRound, leanChartsR1, leanChartsR2, visibleTeamIds,
  salesTab, setSalesTab, salesTeamFilter, setSalesTeamFilter,
  sequenceTab, setSequenceTab, sequenceTeamFilter, setSequenceTeamFilter,
  unratedTab, setUnratedTab, unratedTeamFilter, setUnratedTeamFilter,
  wasteChartMode, setWasteChartMode, wasteChartData,
  scatterRoundMode, setScatterRoundMode, scatterXMetric, setScatterXMetric, scatterYMode, setScatterYMode,
  scatterYMetric, setScatterYMetric, scatterNumerator, setScatterNumerator, scatterDenominator, setScatterDenominator,
  scatterBaseMetrics, scatterMetrics, scatterData, metricLabel, yAxisLabel, isRatioYAxis, isXMetricInteger, isYMetricInteger,
  formatScatterValue, renderScatterDot, renderScatterLabel,
}) => {
  const { teamNames, marketItems } = useGame();
  const rows = useMemo(() => boardRows(leaderboard, teamNames), [leaderboard, teamNames]);
  const totals = useMemo(() => classTotals(leaderboard, boardLean), [leaderboard, boardLean]);
  const [presenting, setPresenting] = useState(false);
  const presentRef = useRef<HTMLButtonElement>(null);
  const closePresent = React.useCallback(() => {
    setPresenting(false);
    presentRef.current?.focus();
  }, []);
  return (
    <>
      <ClassTotalsRow totals={totals} />

      <Card
        title={`Leaderboard, Round ${viewRound}`}
        subtitle="Ranked by profit. Click a column to sort."
        action={
          <button ref={presentRef} type="button" onClick={() => setPresenting(true)} className={QUIET_BUTTON} style={QUIET_BUTTON_STYLE}>
            <Maximize2 size={16} aria-hidden="true" />
            Present
          </button>
        }
      >
        <LeaderboardTable
          rows={rows}
          lean={boardLean}
          sort={boardSort}
          onSort={key => setBoardSort(s => nextBoardSort(s, key))}
          ranks={boardRanks}
        />
      </Card>
      {/* A portal: out of the tab's spacing and any stacking context, over the header too. */}
      {presenting && createPortal(
        <PresentBoard round={viewRound} rows={rows} lean={boardLean} sort={boardSort} onClose={closePresent} />,
        document.body,
      )}

      {/* Dashboard Charts */}
      {hiddenCharts.length > 0 && (
        <div className="flex justify-end">
          <button
            onClick={restoreAllCharts}
            className="text-xs font-bold text-blue-600 underline hover:text-blue-700"
            title="Restore all charts for this session"
          >
            Show all charts
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {showLeanCharts ? (
          <LeanChartsPanel
            round={leanChartsRound}
            r1={leanChartsR1}
            r2={leanChartsR2}
            teamNames={teamNames}
          />
        ) : (
        <>
        {!isChartHidden('sales') && (
          <Card
            title="Cumulative Sales Over Time"
            action={
              <div className="flex items-center gap-2">
                <select
                  value={salesTeamFilter}
                  onChange={(e) => setSalesTeamFilter(e.target.value)}
                  className="rounded border border-gray-200 bg-white px-2 py-1 text-xs font-bold text-gray-700 hover:border-gray-300 focus:outline-none"
                  title="Filter by Team"
                >
                  <option value="ALL">All Teams</option>
                  {visibleTeamIds.map(tid => (
                    <option key={tid} value={tid}>{teamNames[tid] || `Team ${tid}`}</option>
                  ))}
                </select>
                <div className="flex items-center rounded-md border border-gray-200 bg-white p-0.5">
                  {(['R1', 'R2', 'BOTH'] as const).map(k => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setSalesTab(k)}
                      className={`px-2 py-1 rounded text-xs font-bold ${
                        salesTab === k ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
                      }`}
                      title={k === 'BOTH' ? 'Compare both rounds' : (k === 'R1' ? 'Round 1' : 'Round 2')}
                    >
                      {k === 'R1' ? 'R1' : k === 'R2' ? 'R2' : 'Both'}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setExpandedChart('sales')}
                  className="p-1 hover:bg-gray-100 rounded text-gray-500 hover:text-gray-700"
                  title="Expand chart"
                >
                  <Maximize2 size={18} />
                </button>
                <button
                  onClick={() => hideChart('sales')}
                  className="p-1 hover:bg-gray-100 rounded text-gray-500 hover:text-red-600"
                  title="Hide chart (this session only)"
                >
                  <X size={18} />
                </button>
              </div>
            }
          >
            <div className="h-72 w-full">
              {renderChart('sales')}
            </div>
          </Card>
        )}

        {/* 3) Batch Sequence vs Quality */}
        {!isChartHidden('sequence_quality') && (
          <Card
            title="Batch Sequence vs Quality"
            action={
              <div className="flex items-center gap-2">
                <select
                  value={sequenceTeamFilter}
                  onChange={(e) => setSequenceTeamFilter(e.target.value)}
                  className="rounded border border-gray-200 bg-white px-2 py-1 text-xs font-bold text-gray-700 hover:border-gray-300 focus:outline-none"
                  title="Filter by Team"
                >
                  <option value="ALL">All Teams</option>
                  {visibleTeamIds.map(tid => (
                    <option key={tid} value={tid}>{teamNames[tid] || `Team ${tid}`}</option>
                  ))}
                </select>
                <div className="flex items-center rounded-md border border-gray-200 bg-white p-0.5">
                  {(['R1', 'R2', 'BOTH'] as const).map(k => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setSequenceTab(k)}
                      className={`px-2 py-1 rounded text-xs font-bold ${
                        sequenceTab === k ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
                      }`}
                      title={k === 'BOTH' ? 'Compare both rounds' : (k === 'R1' ? 'Round 1' : 'Round 2')}
                    >
                      {k === 'R1' ? 'R1' : k === 'R2' ? 'R2' : 'Both'}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setExpandedChart('sequence_quality')}
                  className="p-1 hover:bg-gray-100 rounded text-gray-500 hover:text-gray-700"
                  title="Expand chart"
                >
                  <Maximize2 size={18} />
                </button>
                <button
                  onClick={() => hideChart('sequence_quality')}
                  className="p-1 hover:bg-gray-100 rounded text-gray-500 hover:text-red-600"
                  title="Hide chart (this session only)"
                >
                  <X size={18} />
                </button>
              </div>
            }
          >
            <div className="h-72 w-full">
              {renderChart('sequence_quality')}
            </div>
          </Card>
        )}

        {/* Wasted Jokes / Rejection Rate (full width) - R1/R2 side by side */}
        <Card
          title="Wasted Jokes"
          action={
            <div className="flex items-center rounded-md border border-gray-200 bg-white p-0.5">
              <button
                className={`px-2 py-1 rounded text-xs font-bold ${
                  wasteChartMode === 'count' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}
                onClick={() => setWasteChartMode('count')}
              >
                Count
              </button>
              <button
                className={`px-2 py-1 rounded text-xs font-bold ${
                  wasteChartMode === 'rate' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}
                onClick={() => setWasteChartMode('rate')}
              >
                Rejection Rate
              </button>
            </div>
          }
          className="xl:col-span-2"
        >
          <div className="h-80">
            <ResponsiveContainer>
              <BarChart
                data={wasteChartData.map(item => ({
                  team: item.team_name,
                  R1: wasteChartMode === 'count' ? item.r1_wasted : item.r1_rate,
                  R2: wasteChartMode === 'count' ? item.r2_wasted : item.r2_rate,
                }))}
                margin={{ top: 10, right: 20, left: wasteChartMode === 'rate' ? 50 : 30, bottom: 30 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="team" angle={-15} textAnchor="end" height={50} />
                <YAxis
                  label={{
                    value: wasteChartMode === 'rate' ? 'Rejection Rate' : 'Wasted Jokes',
                    angle: -90,
                    position: 'insideLeft',
                    style: { textAnchor: 'middle' },
                    dx: wasteChartMode === 'rate' ? -15 : -5,
                  }}
                  tickFormatter={(v) => wasteChartMode === 'rate' ? `${Math.round(v * 100)}%` : v}
                  width={wasteChartMode === 'rate' ? 45 : 35}
                  domain={(() => {
                    const maxVal = Math.max(
                      ...wasteChartData.map(d => wasteChartMode === 'count' ? Math.max(d.r1_wasted, d.r2_wasted) : Math.max(d.r1_rate, d.r2_rate)),
                      0
                    );
                    if (maxVal <= 0) return wasteChartMode === 'rate' ? [0, 0.25] : [0, 25];
                    const targetMax = maxVal * 1.25;
                    const step = wasteChartMode === 'rate' ? 0.05 : 5;
                    const roundedMax = Math.ceil(targetMax / step) * step;
                    return [0, roundedMax];
                  })()}
                  ticks={(() => {
                    const maxVal = Math.max(
                      ...wasteChartData.map(d => wasteChartMode === 'count' ? Math.max(d.r1_wasted, d.r2_wasted) : Math.max(d.r1_rate, d.r2_rate)),
                      0
                    );
                    const max = (() => {
                      if (maxVal <= 0) return wasteChartMode === 'rate' ? 0.25 : 25;
                      const targetMax = maxVal * 1.25;
                      const step = wasteChartMode === 'rate' ? 0.05 : 5;
                      return Math.ceil(targetMax / step) * step;
                    })();
                    const step = wasteChartMode === 'rate' ? 0.05 : 5;
                    const ticks: number[] = [];
                    for (let t = 0; t <= max; t += step) ticks.push(t);
                    return ticks;
                  })()}
                />
                <Tooltip formatter={(v: any) => wasteChartMode === 'rate' ? `${(Number(v) * 100).toFixed(1)}%` : v} />
                <Legend />
                <Bar dataKey="R1" name="Round 1" fill="#3B82F6" />
                <Bar dataKey="R2" name="Round 2" fill="#F97316" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Scatter Plots */}
        <Card title="Scatter Plots" className="xl:col-span-2">
          <div className="flex flex-wrap items-center gap-4 mb-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-600 uppercase">Round</span>
              <div className="flex items-center rounded-md border border-gray-200 bg-white p-0.5">
                {(['R1', 'R2', 'BOTH'] as const).map(k => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setScatterRoundMode(k)}
                    className={`px-2 py-1 rounded text-xs font-bold ${
                      scatterRoundMode === k ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
                    }`}
                    title={k === 'BOTH' ? 'Compare both rounds' : (k === 'R1' ? 'Round 1' : 'Round 2')}
                  >
                    {k === 'R1' ? 'R1' : k === 'R2' ? 'R2' : 'Both'}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-600 uppercase">X-Axis</span>
              <select
                className="border border-slate-200 rounded px-2 py-1 text-sm bg-white"
                value={scatterXMetric}
                onChange={(e) => setScatterXMetric(e.target.value)}
              >
                {scatterBaseMetrics.map(m => (
                  <option key={m.key} value={m.key}>{m.label}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-600 uppercase">Y-Axis</span>
              <div className="inline-flex items-center gap-2">
                <select
                  className="border border-slate-200 rounded px-2 py-1 text-sm bg-white"
                  value={scatterYMode}
                  onChange={(e) => setScatterYMode(e.target.value as 'metric' | 'ratio')}
                >
                  <option value="metric">Metric</option>
                  <option value="ratio">Ratio</option>
                </select>
                {scatterYMode === 'metric' ? (
                  <select
                    className="border border-slate-200 rounded px-2 py-1 text-sm bg-white"
                    value={scatterYMetric}
                    onChange={(e) => setScatterYMetric(e.target.value)}
                  >
                    {scatterMetrics.map(m => (
                      <option key={m.key} value={m.key}>{m.label}</option>
                    ))}
                  </select>
                ) : (
                  <>
                    <select
                      className="border border-slate-200 rounded px-2 py-1 text-sm bg-white"
                      value={scatterNumerator}
                      onChange={(e) => setScatterNumerator(e.target.value)}
                    >
                      {scatterMetrics.map(m => (
                        <option key={m.key} value={m.key}>{m.label}</option>
                      ))}
                    </select>
                    <span className="text-sm text-slate-500">/</span>
                    <select
                      className="border border-slate-200 rounded px-2 py-1 text-sm bg-white"
                      value={scatterDenominator}
                      onChange={(e) => setScatterDenominator(e.target.value)}
                    >
                      {scatterMetrics.map(m => (
                        <option key={m.key} value={m.key}>{m.label}</option>
                      ))}
                    </select>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="h-80">
            <ResponsiveContainer>
              <ScatterChart margin={{ top: 10, right: 20, left: 44, bottom: 30 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  dataKey="x"
                  name="x"
                  label={{
                    value: metricLabel(scatterXMetric),
                    angle: 0,
                    position: 'insideBottom',
                    offset: -5,
                  }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name="y"
                  width={50}
                  tickMargin={6}
                  padding={{ top: 10, bottom: 10 }}
                  allowDecimals={!isYMetricInteger}
                  label={{
                    value: yAxisLabel,
                    angle: -90,
                    position: 'insideLeft',
                    style: { textAnchor: 'middle' },
                    dx: -20,
                  }}
                  domain={isRatioYAxis ? [0, 1] : undefined}
                  ticks={isRatioYAxis ? [0,0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,1] : undefined}
                  tickFormatter={(v) => {
                    if (isRatioYAxis) {
                      return [0.2, 0.4, 0.6, 0.8].includes(Number(v)) ? v.toFixed(1) : '';
                    }
                    // For integer metrics, show integers; for decimals, show 2 places
                    if (isYMetricInteger) {
                      return Number.isInteger(v) ? String(v) : '';
                    }
                    return Number(v).toFixed(2);
                  }}
                />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  content={(props: any) => {
                    const { active, payload } = props;
                    if (!active || !payload || payload.length === 0) return null;
                    const p = payload[0]?.payload;
                    if (!p) return null;
                    const xFormatted = formatScatterValue(p.xRaw, isXMetricInteger);
                    const yFormatted = formatScatterValue(p.yRaw, isYMetricInteger);
                    const roundInfo = scatterRoundMode === 'BOTH' ? ` (${p.round})` : '';
                    return (
                      <div className="bg-white border border-gray-200 rounded shadow-lg px-3 py-2 text-sm">
                        <div className="font-semibold text-gray-900 mb-1">{p.team_name}{roundInfo}</div>
                        <div className="text-gray-600">
                          <span className="font-medium">{p.xLabel}:</span> {xFormatted}
                        </div>
                        <div className="text-gray-600">
                          <span className="font-medium">{p.yLabel}:</span> {yFormatted}
                        </div>
                      </div>
                    );
                  }}
                />
                <Scatter data={scatterData} shape={renderScatterDot}>
                  <LabelList content={renderScatterLabel} />
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {!isChartHidden('unrated_jokes') && (
          <Card
            title="Unrated Jokes Over Time"
            className="xl:col-span-2"
            action={
              <div className="flex items-center gap-2">
                <select
                  value={unratedTeamFilter}
                  onChange={(e) => setUnratedTeamFilter(e.target.value)}
                  className="rounded border border-gray-200 bg-white px-2 py-1 text-xs font-bold text-gray-700 hover:border-gray-300 focus:outline-none"
                  title="Filter by Team"
                >
                  <option value="ALL">All Teams</option>
                  {visibleTeamIds.map(tid => (
                    <option key={tid} value={tid}>{teamNames[tid] || `Team ${tid}`}</option>
                  ))}
                </select>
                <div className="flex items-center rounded-md border border-gray-200 bg-white p-0.5">
                  {(['R1', 'R2', 'BOTH'] as const).map(k => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setUnratedTab(k)}
                      className={`px-2 py-1 rounded text-xs font-bold ${
                        unratedTab === k ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
                      }`}
                      title={k === 'BOTH' ? 'Compare both rounds' : (k === 'R1' ? 'Round 1' : 'Round 2')}
                    >
                      {k === 'R1' ? 'R1' : k === 'R2' ? 'R2' : 'Both'}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setExpandedChart('unrated_jokes')}
                  className="p-1 hover:bg-gray-100 rounded text-gray-500 hover:text-gray-700"
                  title="Expand chart"
                >
                  <Maximize2 size={18} />
                </button>
                <button
                  onClick={() => hideChart('unrated_jokes')}
                  className="p-1 hover:bg-gray-100 rounded text-gray-500 hover:text-red-600"
                  title="Hide chart (this session only)"
                >
                  <X size={18} />
                </button>
              </div>
            }
          >
            <div className="h-72 w-full">
              {renderChart('unrated_jokes')}
            </div>
          </Card>
        )}
        </>
        )}

      </div>

      <LiveMarket items={marketItems ?? []} open={marketOpen} teamNames={teamNames} />
    </>
  );
};
