/* The instructor's four lean charts in a 2 × 2 grid on the Live tab (spec 6b).
   The round in view (the control bar's round, resolved in views/Instructor.tsx)
   sets charts 1 and 2; charts 3 and 4 always overlay both rounds. Every team is
   on every chart, so there is no team picker. A Classic round shows a one-line
   notice instead. */
import React, { useMemo } from 'react';
import type { LeanChartsState } from '../../services/useLeanCharts';
import { CLASSIC_CHARTS_TEXT, batchScatter, cyclesForInstructor } from '../../services/leanCharts';
import { WasteBreakdownChart } from './WasteBreakdownChart';
import { IdleRows } from './IdleRows';
import { BatchFeedbackChart } from './BatchFeedbackChart';
import { LearningCyclesChart } from './LearningCyclesChart';
import { ChartNotice } from './chartParts';

export interface LeanChartsPanelProps {
  /** The round in view has lean charts; false shows only the Classic notice. */
  lean: boolean;
  round: 1 | 2;
  r1: LeanChartsState;
  r2: LeanChartsState;
  /** The instructor's renames, keyed by team id (the leaderboard's map). */
  teamNames: Record<string, string>;
}

export const LeanChartsPanel: React.FC<LeanChartsPanelProps> = ({ lean, round, r1, r2, teamNames }) => {
  const selected = round === 1 ? r1 : r2;
  const scatter = useMemo(() => batchScatter({ 1: r1.data, 2: r2.data }, teamNames), [r1.data, r2.data, teamNames]);
  const cycles = useMemo(() => cyclesForInstructor(r1.data, r2.data), [r1.data, r2.data]);
  if (!lean) return <ChartNotice text={CLASSIC_CHARTS_TEXT} />;
  const eitherUnavailable = r1.unavailable || r2.unavailable;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <WasteBreakdownChart data={selected.data} teamNames={teamNames} unavailable={selected.unavailable} />
      <IdleRows data={selected.data} teamNames={teamNames} unavailable={selected.unavailable} />
      <BatchFeedbackChart scatter={scatter} unavailable={eitherUnavailable} />
      <LearningCyclesChart model={cycles} unavailable={eitherUnavailable} />
    </div>
  );
};

export default LeanChartsPanel;
