/* The Instructor's Debrief tab (spec 6b): Round 1 vs Round 2, per team. */
import React from 'react';
import { useGame } from '../../context';
import { Card } from '../../components';
import { LeanDebrief } from '../LeanDebrief';
import type { ApiInstructorStatsResponse } from '../../types';
import type { FeeRates } from '../../services/shownFees';

export interface DebriefTabProps {
  statsR1: ApiInstructorStatsResponse | null;
  statsR2: ApiInstructorStatsResponse | null;
  /** Round 2 is ACTIVE or ENDED. */
  round2Started: boolean;
  /** Each round's own fee amounts (services/roundRates); the selected config when absent. */
  ratesR1?: FeeRates;
  ratesR2?: FeeRates;
}

export const DebriefTab: React.FC<DebriefTabProps> = ({ statsR1, statsR2, round2Started, ratesR1, ratesR2 }) => {
  const { teamNames, config } = useGame();
  return (
    <Card title="Round 1 vs Round 2" subtitle="Same rules and fees in both rounds, per team. Sorted by Round 2 profit.">
      <LeanDebrief r1={statsR1} r2={statsR2} round2Started={round2Started} teamNames={teamNames} rates={{ r1: ratesR1 ?? config, r2: ratesR2 ?? config }} />
    </Card>
  );
};
