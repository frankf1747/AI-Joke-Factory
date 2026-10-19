/* The Instructor's Debrief tab (spec 6b): Round 1 vs Round 2. Moved from
   views/Instructor.tsx unchanged; the restyle comes later. */
import React from 'react';
import { useGame } from '../../context';
import { Card } from '../../components';
import { LeanDebrief } from '../LeanDebrief';
import type { ApiInstructorStatsResponse } from '../../types';

export interface DebriefTabProps {
  statsR1: ApiInstructorStatsResponse | null;
  statsR2: ApiInstructorStatsResponse | null;
}

export const DebriefTab: React.FC<DebriefTabProps> = ({ statsR1, statsR2 }) => {
  const { teamNames } = useGame();
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
      {statsR2 && [statsR1, statsR2].some(st => (st?.leaderboard ?? []).some(r => r.lean != null)) && (
        <div id="instructor-debrief" className="xl:col-span-2 scroll-mt-4">
        <Card title="Round 1 vs Round 2" subtitle="Same rules and fees in both rounds, per team">
          <LeanDebrief r1={statsR1} r2={statsR2} teamNames={teamNames} />
        </Card>
        </div>
      )}
    </div>
  );
};
