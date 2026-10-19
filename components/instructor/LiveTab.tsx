/* The Instructor's Live tab (spec 6b): the class totals, the leaderboard, the
   four lean charts and the live market. The screen keeps the polling (context,
   useLeanCharts), the stats rows, the sort and the rank moves, so switching tabs
   neither stops nor repeats a fetch and a rank change seen on another tab still
   tags its row. */
import React, { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2 } from 'lucide-react';
import { useGame } from '../../context';
import { Card } from '../../components';
import { LeanChartsPanel } from '../leanCharts/LeanChartsPanel';
import type { LeanChartsState } from '../../services/useLeanCharts';
import type { LeanChartsPanelState } from '../../services/leanCharts';
import { classTotals, type LeaderboardRow } from '../../services/classTotals';
import { boardRows, nextBoardSort, type BoardRanks, type BoardSort } from '../../services/liveBoard';
import { ClassTotalsRow, LeaderboardTable, PresentBoard, QUIET_BUTTON, QUIET_BUTTON_STYLE } from './LiveBoard';
import { LiveMarket } from './LiveMarket';

type Setter<T> = React.Dispatch<React.SetStateAction<T>>;

export interface LiveTabProps {
  viewRound: 1 | 2;
  /** The stats rows of the round in view. */
  leaderboard: LeaderboardRow[];
  /** The round in view is Lean: fees, never sold and the two waits show. */
  boardLean: boolean;
  boardSort: BoardSort;
  setBoardSort: Setter<BoardSort>;
  /** The rank tags; omitted while they still belong to another round. */
  boardRanks?: BoardRanks;
  /** The current round has started, so its market is open. */
  marketOpen: boolean;
  /** The charts, the Classic notice, or nothing (a transient 409 in a Lean round). */
  leanPanel: LeanChartsPanelState;
  leanChartsRound: 1 | 2;
  leanChartsR1: LeanChartsState;
  leanChartsR2: LeanChartsState;
}

export const LiveTab: React.FC<LiveTabProps> = ({
  viewRound, leaderboard, boardLean, boardSort, setBoardSort, boardRanks, marketOpen,
  leanPanel, leanChartsRound, leanChartsR1, leanChartsR2,
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

      {leanPanel !== 'none' && (
        <LeanChartsPanel
          lean={leanPanel === 'charts'}
          round={leanChartsRound}
          r1={leanChartsR1}
          r2={leanChartsR2}
          teamNames={teamNames}
        />
      )}

      <LiveMarket items={marketItems ?? []} open={marketOpen} teamNames={teamNames} />
    </>
  );
};
