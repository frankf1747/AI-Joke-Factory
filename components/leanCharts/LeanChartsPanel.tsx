/* The instructor's lean charts, rendered as children of the dashboard grid in
   views/Instructor.tsx in place of the five Classic chart cards when the round
   shown is Lean. A full-width control bar holds the team picker and the R1/R2
   control; the round control sets charts 1 and 2, and charts 3 and 4 always
   overlay both rounds. A round that is not Lean cannot be picked. */
import React, { useEffect, useMemo, useState } from 'react';
import type { LeanChartsState } from '../../services/useLeanCharts';
import { batchScatter, cyclesForInstructor, defaultIdleTeamId, teamLabel, teamOptions } from '../../services/leanCharts';
import { WasteBreakdownChart } from './WasteBreakdownChart';
import { IdleJokesChart } from './IdleJokesChart';
import { BatchFeedbackChart } from './BatchFeedbackChart';
import { LearningCyclesChart } from './LearningCyclesChart';

export interface LeanChartsPanelProps {
  round: 1 | 2;
  onRoundChange: (round: 1 | 2) => void;
  leanRounds: { 1: boolean; 2: boolean };
  r1: LeanChartsState;
  r2: LeanChartsState;
  /** The instructor's renames, keyed by team id (the leaderboard's map). */
  teamNames: Record<string, string>;
}

export const LeanChartsPanel: React.FC<LeanChartsPanelProps> = ({ round, onRoundChange, leanRounds, r1, r2, teamNames }) => {
  const [teamFilter, setTeamFilter] = useState<number | null>(null);
  const selected = round === 1 ? r1 : r2;
  const options = useMemo(() => teamOptions(r1.data, r2.data, teamNames), [r1.data, r2.data, teamNames]);

  // A reset or a new class can remove the picked team: fall back to all teams.
  useEffect(() => {
    if (teamFilter != null && options.length > 0 && !options.some(o => o.id === teamFilter)) setTeamFilter(null);
  }, [options, teamFilter]);

  const idleTeamId = teamFilter ?? defaultIdleTeamId(selected.data);
  const idleTeam = selected.data?.teams.find(t => t.team_id === idleTeamId) ?? null;
  const idleLabel = idleTeam
    ? `${teamLabel(idleTeam.team_id, idleTeam.team_name, teamNames)}${teamFilter == null ? ' — most idle jokes now' : ''}`
    : null;
  const scatter = useMemo(
    () => batchScatter({ 1: r1.data, 2: r2.data }, teamFilter, teamNames),
    [r1.data, r2.data, teamFilter, teamNames],
  );
  const cycles = useMemo(
    () => cyclesForInstructor(r1.data, r2.data, teamFilter, teamNames),
    [r1.data, r2.data, teamFilter, teamNames],
  );
  const eitherUnavailable = r1.unavailable || r2.unavailable;

  return (
    <>
      <div className="xl:col-span-2 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
        <div>
          <div className="text-sm font-semibold text-gray-800">Lean charts</div>
          <div className="text-xs text-gray-400">The round control sets the first two charts; the last two compare both rounds.</div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={teamFilter == null ? 'ALL' : String(teamFilter)}
            onChange={(e) => setTeamFilter(e.target.value === 'ALL' ? null : Number(e.target.value))}
            className="rounded border border-gray-200 bg-white px-2 py-1 text-xs font-bold text-gray-700 hover:border-gray-300 focus:outline-none"
            title="Filter by Team"
          >
            <option value="ALL">All teams</option>
            {options.map(o => (
              <option key={o.id} value={String(o.id)}>{o.name}</option>
            ))}
          </select>
          <div className="flex items-center rounded-md border border-gray-200 bg-white p-0.5">
            {([1, 2] as const).map(r => (
              <button
                key={r}
                type="button"
                disabled={!leanRounds[r]}
                aria-pressed={round === r}
                title={leanRounds[r] ? `Round ${r}` : `Round ${r} is not a Lean round`}
                className={`px-2 py-1 rounded text-xs font-bold disabled:cursor-not-allowed disabled:opacity-40 ${
                  round === r ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}
                onClick={() => onRoundChange(r)}
              >
                {r === 1 ? 'R1' : 'R2'}
              </button>
            ))}
          </div>
        </div>
      </div>
      <WasteBreakdownChart data={selected.data} teamNames={teamNames} unavailable={selected.unavailable} />
      <IdleJokesChart
        team={idleTeam}
        classAverage={selected.data?.class_average ?? null}
        wipLimit={selected.data?.wip_limit ?? 0}
        teamLabel={idleLabel}
        unavailable={selected.unavailable}
      />
      <BatchFeedbackChart scatter={scatter} unavailable={eitherUnavailable} />
      <LearningCyclesChart model={cycles} unavailable={eitherUnavailable} />
    </>
  );
};

export default LeanChartsPanel;
