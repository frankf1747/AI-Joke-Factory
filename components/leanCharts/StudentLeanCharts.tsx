/* The two lean charts on a team screen (Joke Maker and Marketing), where the
   learning-curve card used to be: "Jokes standing still" and "More cycles,
   more learning", compact. Own team only plus the anonymous class average; in
   Round 2 the team's Round 1 batches are drawn faded behind (only if Round 1
   was Lean too). components/LearningCurve.tsx stays in the repo, so going back
   is a one-line change in each view. */
import React, { useEffect, useState } from 'react';
import { sessionApi } from '../../services/api/session';
import { useLeanCharts } from '../../services/useLeanCharts';
import { cyclesForStudent, leanRound1Id } from '../../services/leanCharts';
import { IdleJokesChart } from './IdleJokesChart';
import { LearningCyclesChart } from './LearningCyclesChart';

export interface StudentLeanChartsProps {
  roundId: number | null;
  teamId: number | null;
  roundNumber: 1 | 2;
  /** true while the round is ACTIVE: poll every 10 s; otherwise fetch once. */
  live: boolean;
}

export const StudentLeanCharts: React.FC<StudentLeanChartsProps> = ({ roundId, teamId, roundNumber, live }) => {
  const current = useLeanCharts({ roundId, teamId, enabled: roundId != null && teamId != null, live });

  // Round 2 only: Round 1's id, once, if Round 1 was Lean.
  const [round1Id, setRound1Id] = useState<number | null>(null);
  useEffect(() => {
    if (roundNumber !== 2) {
      setRound1Id(null);
      return undefined;
    }
    let cancelled = false;
    sessionApi.activeRounds()
      .then(res => { if (!cancelled) setRound1Id(leanRound1Id(res.rounds)); })
      .catch(() => { if (!cancelled) setRound1Id(null); });
    return () => { cancelled = true; };
  }, [roundNumber]);
  const earlier = useLeanCharts({
    roundId: round1Id,
    teamId,
    enabled: roundNumber === 2 && round1Id != null && teamId != null,
    live: false,
  });

  if (current.notLean) return null;
  return (
    <>
      <IdleJokesChart
        team={current.data?.teams[0] ?? null}
        classAverage={current.data?.class_average ?? null}
        wipLimit={current.data?.wip_limit ?? 0}
        compact
        unavailable={current.unavailable}
      />
      <LearningCyclesChart model={cyclesForStudent(current.data, roundNumber, earlier.data)} compact unavailable={current.unavailable} />
    </>
  );
};

export default StudentLeanCharts;
