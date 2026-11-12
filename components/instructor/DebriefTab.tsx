/* The Instructor's Debrief tab (spec 6b): Round 1 vs Round 2, per team. */
import React, { useState } from 'react';
import { useGame } from '../../context';
import { Button, Card } from '../../components';
import { LeanDebrief } from '../LeanDebrief';
import { SaveRunDialog, savableRounds } from './SaveRunDialog';
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
  /** For Save run record: which rounds can be saved, and their ids. */
  roundIds: { 1: number | null; 2: number | null };
  roundStatuses: { 1: string | null; 2: string | null };
}

export const DebriefTab: React.FC<DebriefTabProps> = ({ statsR1, statsR2, round2Started, ratesR1, ratesR2, roundIds, roundStatuses }) => {
  const { teamNames, config } = useGame();
  const [saveOpen, setSaveOpen] = useState(false);
  const canSave = savableRounds(roundStatuses).length > 0;
  const rates = { r1: ratesR1 ?? config, r2: ratesR2 ?? config };
  return (
    <Card
      title="Round 1 vs Round 2"
      subtitle="Same rules and fees in both rounds, per team. Sorted by Round 2 profit."
      action={
        <Button variant="secondary" disabled={!canSave} title={canSave ? undefined : 'End Round 1 first'} onClick={() => setSaveOpen(true)}>
          Save run record
        </Button>
      }
    >
      <LeanDebrief r1={statsR1} r2={statsR2} round2Started={round2Started} teamNames={teamNames} rates={rates} />
      <SaveRunDialog
        open={saveOpen} onClose={() => setSaveOpen(false)}
        roundIds={roundIds} roundStatuses={roundStatuses}
        statsR1={statsR1} statsR2={statsR2}
        ratesR1={rates.r1} ratesR2={rates.r2} teamNames={teamNames}
      />
    </Card>
  );
};
