import React, { useEffect, useMemo, useState } from 'react';
import { useGame } from '../context';
import { Button, RoleLayout, Modal } from '../components';
import { BotPanel, botPanelRequested } from '../components/BotPanel';
import { isWatchMode } from '../services/watchMode';
import { ControlBar } from '../components/instructor/ControlBar';
import { LiveTab } from '../components/instructor/LiveTab';
import { TeamsTab } from '../components/instructor/TeamsTab';
import { SetupTab } from '../components/instructor/SetupTab';
import { DebriefTab } from '../components/instructor/DebriefTab';
import { defaultViewRound, followPhase, instructorPhase, knownPhase, type InstructorTab, type TabFollow } from '../services/instructorPhase';
import { useLeanCharts } from '../services/useLeanCharts';
import { leanChartsPanel, leanRoundFlags, resolveLeanChartsRound } from '../services/leanCharts';
import { feeValuesOf, shippingOrderError } from '../components/FeeConfigFields';
import { feeRoundsText, productionTeamCount } from '../services/leanMode';
import { DEFAULT_BOARD_SORT, INITIAL_BOARD_RANKS, boardRanksFor, boardRows, nextBoardRanks, type BoardSort } from '../services/liveBoard';
import { buildApplyUpdates, setupValuesOf, type SetupValues } from '../services/roundConfig';
import { memberedTeamIds, playingChartTeams, playingStats } from '../services/playingTeams';

/** The four tabs under the control bar (spec 6b). Setup is never a phase's default. */
export type ScreenTab = InstructorTab | 'setup';
const SCREEN_TABS: ReadonlyArray<{ id: ScreenTab; label: string }> = [
  { id: 'live', label: 'Live' },
  { id: 'teams', label: 'Teams' },
  { id: 'setup', label: 'Setup' },
  { id: 'debrief', label: 'Debrief' },
];

/** initialTab opens the screen on one tab (the render tests use it); otherwise the phase picks. */
const Instructor: React.FC<{ initialTab?: ScreenTab }> = ({ initialTab }) => {
  const { 
    config, updateConfig, setGameActive, resetGame, toggleTeamPopup,
    roster
    , instructorStats
    , instructorStatsRound1
    , instructorStatsRound2
    , endRound
    , roundIds
    , roundStatuses
    , instructorLobby
  } = useGame();

  // The Setup tab's edits in progress: the Classic numbers, the Lean fees and arrival window.
  const [setupLocal, setSetupLocal] = useState<SetupValues>(() => setupValuesOf(config));
  /** After Apply: which rounds the fees were written to, e.g. "Fees applied to Rounds 1 and 2". */
  const [feeNotice, setFeeNotice] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  // The End Round confirm. Its round outlives the close, so the title and the button
  // never read "End Round  now?" while the modal goes away.
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [endConfirmRound, setEndConfirmRound] = useState<1 | 2>(1);

  // The round the leaderboard, charts and debrief show (spec decision 6). UI only:
  // Start, End and the popups act on config.round, which the poll sets, and nothing
  // here calls setRound. It follows the phase (Round 2 once it has started) until
  // the instructor picks a round in the control bar.
  const phase = instructorPhase(roundStatuses);
  const [viewRound, setViewRound] = useState<1 | 2>(() => defaultViewRound(phase));
  useEffect(() => { setViewRound(defaultViewRound(phase)); }, [phase]);
  // The open tab follows the phase (Teams in the lobby, Live during and between rounds,
  // Debrief after Round 2). A tab the instructor picks stays until the phase changes.
  // Until the first status poll lands (a reload) the phase is unknown and no tab is
  // committed, so the screen never opens Teams for one poll and then jumps to Live.
  const tabPhase = knownPhase(roundStatuses);
  const [tabFollow, setTabFollow] = useState<TabFollow<ScreenTab>>(
    () => followPhase<ScreenTab>({ tab: initialTab ?? null, phase: null }, tabPhase),
  );
  const followed = followPhase(tabFollow, tabPhase);
  if (followed !== tabFollow) setTabFollow(followed);
  const tab = followed.tab;
  const setTab = (t: ScreenTab) => setTabFollow(s => ({ ...s, tab: t }));
  // The leaderboard's sort and each team's rank-move tag. Kept here so both survive
  // a tab switch and a rank change during another tab still tags the row.
  const [boardSort, setBoardSort] = useState<BoardSort>(DEFAULT_BOARD_SORT);
  const [boardRanks, setBoardRanks] = useState(INITIAL_BOARD_RANKS);

  // Keep local inputs aligned with server-driven config changes (polling/reset).
  useEffect(() => setSetupLocal(l => ({ ...l, budget: config.customerBudget })), [config.customerBudget]);
  useEffect(() => setSetupLocal(l => ({ ...l, marketPrice: config.marketPrice })), [config.marketPrice]);
  useEffect(() => setSetupLocal(l => ({ ...l, costOfPublishing: config.costOfPublishing })), [config.costOfPublishing]);
  useEffect(
    () => setSetupLocal(l => ({ ...l, fees: feeValuesOf(config) })),
    [config.arrivalWindowSeconds, config.shippingFeeSmall, config.shippingFeeStandard, config.shippingFeeLarge,
      config.storageFeePerJokeMinute, config.hostingFeePerJokeMinute, config.customersPerTeam],
  );

  // Config edit rules:
  // - While a round is active, or once both rounds have ended: config is not editable.
  // - Batch sizes are not editable: Round 1 is exactly 5, Round 2 up to 10 (Reset Game sets them).
  const classOver = roundStatuses[1] === 'ENDED' && roundStatuses[2] === 'ENDED';
  const canEditBudget = !config.isActive && !classOver && (config.round === 1 || config.round === 2);
  const canEditPricing = canEditBudget;
  // Lean settings lock once the selected round has started (ACTIVE or ENDED); the server
  // refuses them with 409 MARKET_MODE_LOCKED. Classic fields keep canEditPricing/canEditBudget.
  // An unknown status (null) is not treated as locked: the server stays the authority.
  const selectedRoundStatus = roundStatuses[config.round === 2 ? 2 : 1];
  const leanLocked = selectedRoundStatus != null && selectedRoundStatus !== 'CONFIGURED';
  const canEditLean = canEditPricing && !leanLocked;

  // What Apply would send; its keys are the Setup tab's changed fields and change count.
  const pendingUpdates = buildApplyUpdates({ local: setupLocal, config, canEditBudget, canEditPricing, canEditLean });
  // The server refuses shipping fees that fall with batch size; FeeConfigFields says so inline.
  const feeOrderBlocked = canEditLean && shippingOrderError(setupLocal.fees) != null;

  const handleUpdateSettings = async () => {
    setFeeNotice(null);
    if (feeOrderBlocked) return;
    const updates = pendingUpdates;
    if (Object.keys(updates).length === 0) return;
    const result = await updateConfig(updates);
    if (result.feeRounds.length > 0) setFeeNotice(feeRoundsText(result.feeRounds));
  };

  // --- Data Processing ---

  // Teams with no members and no activity come back as all-zero rows: leave them out.
  const membered = useMemo(() => memberedTeamIds(instructorLobby), [instructorLobby]);
  const statsR1 = useMemo(() => playingStats(instructorStatsRound1 ?? null, membered), [instructorStatsRound1, membered]);
  const statsR2 = useMemo(() => playingStats(instructorStatsRound2 ?? null, membered), [instructorStatsRound2, membered]);
  const statsCurrent = useMemo(() => playingStats(instructorStats ?? null, membered), [instructorStats, membered]);
  const leaderboardStatsSelected = (viewRound === 1 ? statsR1 : statsR2) ?? statsCurrent ?? null;

  /* The lean charts show when the round in view is Lean (a Classic round shows a
     notice). The leaderboard's rule: its stats rows carry `lean`, or, before
     stats arrive, the current round's config. Both rounds
     are loaded (charts 3 and 4 overlay them): an ACTIVE round is polled every
     10 s, an ENDED one fetched once, a round not yet started not at all. */
  const leanRounds = useMemo(
    () => leanRoundFlags(instructorStatsRound1?.leaderboard, instructorStatsRound2?.leaderboard, config.round === 2 ? 2 : 1, config.marketMode),
    [instructorStatsRound1?.leaderboard, instructorStatsRound2?.leaderboard, config.round, config.marketMode],
  );
  const leanChartsR1Raw = useLeanCharts({
    roundId: roundIds[1],
    teamId: null,
    enabled: leanRounds[1] && roundStatuses[1] != null && roundStatuses[1] !== 'CONFIGURED',
    live: roundStatuses[1] === 'ACTIVE',
  });
  const leanChartsR2Raw = useLeanCharts({
    roundId: roundIds[2],
    teamId: null,
    enabled: leanRounds[2] && roundStatuses[2] != null && roundStatuses[2] !== 'CONFIGURED',
    live: roundStatuses[2] === 'ACTIVE',
  });
  const leanChartsR1 = useMemo(
    () => ({ ...leanChartsR1Raw, data: playingChartTeams(leanChartsR1Raw.data, membered) }),
    [leanChartsR1Raw, membered],
  );
  const leanChartsR2 = useMemo(
    () => ({ ...leanChartsR2Raw, data: playingChartTeams(leanChartsR2Raw.data, membered) }),
    [leanChartsR2Raw, membered],
  );
  // A 409 NOT_LEAN_ROUND (a mode change racing the start) in a Lean round hides
  // the panel, notice included, until a later poll answers again.
  // The control never strands the instructor: a pick that is no longer showable
  // (new game, round not Lean, live round Classic) is dropped for the live round.
  // Between rounds (the live round configured, not started) a Lean round stays
  // on screen for the debrief, even when the next round is Classic.
  const leanCurrentStatus = roundStatuses[config.round === 2 ? 2 : 1];
  const leanCurrentStarted = leanCurrentStatus != null && leanCurrentStatus !== 'CONFIGURED';
  // The lean charts show the round in view, unless resolveLeanChartsRound moves them
  // off a round with no Lean charts. Derived, so it can never disagree with viewRound.
  const leanChartsRound = useMemo(
    () => resolveLeanChartsRound(viewRound, leanRounds, config.round === 2 ? 2 : 1, leanCurrentStarted),
    [viewRound, leanRounds, config.round, leanCurrentStarted],
  );
  const leanPanel = leanChartsPanel(
    leanChartsRound,
    leanRounds,
    { 1: leanChartsR1.notLean, 2: leanChartsR2.notLean },
  );

  /* The board's Lean columns and totals follow the round in view: the backend nests
     `lean` on each row for LEAN rounds only (leanRoundFlags; before rows arrive,
     the current round's config). */
  const boardLean = leanRounds[viewRound];
  const boardStatsRows = leaderboardStatsSelected?.leaderboard;
  const boardRoundId = leaderboardStatsSelected?.round_id ?? null;
  // One step per poll: a team whose rank changed gets a held tag and one gold fade.
  useEffect(() => {
    setBoardRanks(prev => nextBoardRanks(prev, boardRows(boardStatsRows ?? [], {}), boardRoundId));
  }, [boardStatsRows, boardRoundId]);
  // The market is the current round's; it opens when that round starts.
  const marketStatus = roundStatuses[config.round === 2 ? 2 : 1];
  const marketOpen = marketStatus === 'ACTIVE' || marketStatus === 'ENDED';

  return (
    <RoleLayout>
      <div className="space-y-8">
        {/* Never in a watch tab: a crafted /?watch=<instructorId>&bots=1 would
            otherwise run bots, whose worker writes through services/shared/client.ts
            and so bypasses apiClient's read-only guard. */}
        {botPanelRequested(window.location.search) && !isWatchMode() && <BotPanel />}
        {/* Reset Confirm Modal */}
        <Modal
          isOpen={showResetConfirm}
          onClose={() => setShowResetConfirm(false)}
          title="Reset Game"
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-700">
              This will clear all game data. Are you sure you want to reset?
            </p>
            <div className="grid grid-cols-2 gap-3 mt-6">
              <Button variant="secondary" onClick={() => setShowResetConfirm(false)} className="w-full">
                Cancel
              </Button>
              <Button
                variant="danger"
                className="w-full font-bold"
                onClick={async () => {
                  setShowResetConfirm(false);
                  const ok = await resetGame();
                  if (!ok) return;

                  // Reset leaderboard UI state (data is cleared in resetGame()).
                  setViewRound(1);
                  setBoardSort(DEFAULT_BOARD_SORT);
                  setBoardRanks(INITIAL_BOARD_RANKS);
                }}
              >
                Yes, Reset
              </Button>
            </div>
          </div>
        </Modal>

        {/* End Round confirm, for both rounds */}
        <Modal
          isOpen={endConfirmOpen}
          onClose={() => setEndConfirmOpen(false)}
          title={`End Round ${endConfirmRound} now?`}
        >
          <div className="space-y-4">
            <p className="text-sm" style={{ color: 'var(--ink-2)' }}>
              {endConfirmRound === 1
                ? 'Students stop sending and releasing jokes, and the game moves to Round 2.'
                : 'Students stop sending and releasing jokes, and both rounds are over.'}
            </p>
            <div className="grid grid-cols-2 gap-3 mt-6">
              <Button variant="outline" onClick={() => setEndConfirmOpen(false)} className="w-full">
                Keep playing
              </Button>
              <Button
                variant="danger"
                className="w-full font-bold"
                onClick={() => {
                  setEndConfirmOpen(false);
                  endRound();
                }}
              >
                {`End Round ${endConfirmRound}`}
              </Button>
            </div>
          </div>
        </Modal>

        <ControlBar
          statuses={roundStatuses}
          viewRound={viewRound}
          onViewRound={setViewRound}
          arrivalWindowSeconds={config.arrivalWindowSeconds}
          teamsPlaying={productionTeamCount(roster)}
          showTeammates={config.showTeamPopup}
          onShowTeammates={show => toggleTeamPopup(show)}
          onStart={async () => {
            // Start acts on config.round, the round the poll sets. Starting Round 2
            // closes the teammate popups first and syncs the switch.
            if (config.round === 2) {
              await toggleTeamPopup(false);
            }
            await setGameActive(true);
          }}
          onEnd={() => {
            setEndConfirmRound(config.round === 2 ? 2 : 1);
            setEndConfirmOpen(true);
          }}
          onOpenDebrief={() => setTab('debrief')}
        />

        <div role="tablist" aria-label="Instructor views" className="flex gap-6 border-b" style={{ borderColor: 'var(--rule)' }}>
          {SCREEN_TABS.map(t => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`instructor-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls="instructor-tabpanel"
              onClick={() => setTab(t.id)}
              className="-mb-px px-0.5 pb-2.5 pt-1 text-[14.5px] font-medium transition-colors"
              style={{
                color: tab === t.id ? 'var(--navy)' : 'var(--ink-3)',
                borderBottom: `2px solid ${tab === t.id ? 'var(--navy)' : 'transparent'}`,
              }}
            >{t.label}</button>
          ))}
        </div>

        {/* Only the open tab is mounted. Every poll and all screen state live above
            (context, useLeanCharts, the state here), so switching tabs neither stops
            nor repeats a fetch; only an opened team in Jokes standing still closes. */}
        <div role="tabpanel" id="instructor-tabpanel" aria-labelledby={tab ? `instructor-tab-${tab}` : undefined} className="space-y-8">
          {tab == null && (
            <p className="py-6 text-center text-sm" style={{ color: 'var(--ink-3)' }}>Waiting for the round status.</p>
          )}
          {tab === 'live' && (
            <LiveTab
              viewRound={viewRound} leaderboard={boardStatsRows ?? []} boardLean={boardLean}
              boardSort={boardSort} setBoardSort={setBoardSort} boardRanks={boardRanksFor(boardRanks, boardRoundId)}
              marketOpen={marketOpen} leanPanel={leanPanel} leanChartsRound={leanChartsRound}
              leanChartsR1={leanChartsR1} leanChartsR2={leanChartsR2}
            />
          )}
          {tab === 'teams' && (
            <TeamsTab />
          )}
          {tab === 'setup' && (
            <SetupTab
              local={setupLocal} setLocal={next => { setFeeNotice(null); setSetupLocal(next); }}
              canEditBudget={canEditBudget} canEditPricing={canEditPricing} canEditLean={canEditLean}
              pending={pendingUpdates} applyBlocked={feeOrderBlocked} feeNotice={feeNotice}
              onApply={() => { void handleUpdateSettings(); }} onReset={() => setShowResetConfirm(true)}
            />
          )}
          {tab === 'debrief' && (
            <DebriefTab
              statsR1={statsR1}
              statsR2={statsR2}
              round2Started={roundStatuses[2] === 'ACTIVE' || roundStatuses[2] === 'ENDED'}
            />
          )}
        </div>
      </div>

    </RoleLayout>
  );
};

export default Instructor;