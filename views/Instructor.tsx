import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '../context';
import { Button, RoleLayout, Modal } from '../components';
import { Clock } from 'lucide-react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line
} from 'recharts';
import { Role } from '../types';
import { BotPanel, botPanelRequested } from '../components/BotPanel';
import { isWatchMode } from '../services/watchMode';
import { ControlBar } from '../components/instructor/ControlBar';
import { LiveTab, CHART_KEYS, type ChartKey } from '../components/instructor/LiveTab';
import { TeamsTab } from '../components/instructor/TeamsTab';
import { SetupTab } from '../components/instructor/SetupTab';
import { DebriefTab } from '../components/instructor/DebriefTab';
import { defaultTab, defaultViewRound, instructorPhase, type InstructorTab } from '../services/instructorPhase';
import { useLeanCharts } from '../services/useLeanCharts';
import { leanChartsVisibility, leanRoundFlags, resolveLeanChartsRound } from '../services/leanCharts';
import { changedFees, feeValuesOf, shippingOrderError, type FeeConfigValues } from '../components/FeeConfigFields';
import { LEAN_LEADERBOARD_COLUMNS, feeRoundsText, fmtMoney, leanFeesOf, neverSold, productionTeamCount, type LeanSortKey } from '../services/leanMode';
import { buildApplyUpdates } from '../services/roundConfig';

// Expanded Palette for more teams
const PALETTE = [
    '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', 
    '#6366F1', '#EC4899', '#14B8A6', '#F97316', '#64748B',
    '#0EA5E9', '#A855F7', '#22C55E', '#EAB308', '#F43F5E'
];

const INSTRUCTOR_HIDDEN_CHARTS_SESSION_KEY = 'joke_factory_instructor_hidden_charts_v1';

/** The four tabs under the control bar (spec 6b). Setup is never a phase's default. */
export type ScreenTab = InstructorTab | 'setup';
const SCREEN_TABS: ReadonlyArray<{ id: ScreenTab; label: string }> = [
  { id: 'live', label: 'Live' },
  { id: 'teams', label: 'Teams' },
  { id: 'setup', label: 'Setup' },
  { id: 'debrief', label: 'Debrief' },
];

// Lean leaderboard columns, read from row.lean on LEAN rounds only.
const LEAN_COLUMNS = LEAN_LEADERBOARD_COLUMNS;
const isLeanSortKey = (k: string): k is LeanSortKey => LEAN_COLUMNS.some(c => c.key === k);
const fmtSeconds = (s: number) => (s > 0 ? `${Math.round(s)}s` : '—');

/** initialTab opens the screen on one tab (the render tests use it); otherwise the phase picks. */
const Instructor: React.FC<{ initialTab?: ScreenTab }> = ({ initialTab }) => {
  const { 
    config, updateConfig, setGameActive, resetGame, toggleTeamPopup,
    roster, teamNames, updateTeamName, updateUser,
    formTeams, resetToLobby
    , instructorStats
    , instructorStatsRound1
    , instructorStatsRound2
    , endRound
    , deleteUser
    , marketItems
    , roundIds
    , roundStatuses
  } = useGame();

  const [localBudget, setLocalBudget] = useState(config.customerBudget);
  const [localMarketPrice, setLocalMarketPrice] = useState(config.marketPrice);
  const [localCostOfPublishing, setLocalCostOfPublishing] = useState(config.costOfPublishing);
  // Marketing's decision clock — how long they may deliberate before each nudge.
  const [localNudge1, setLocalNudge1] = useState(config.marketingNudge1Seconds);
  const [localNudge2, setLocalNudge2] = useState(config.marketingNudge2Seconds);
  // The Lean fees and arrival window — edit the current round, like the fields above.
  const [localFees, setLocalFees] = useState<FeeConfigValues>(() => feeValuesOf(config));
  /** After Apply: which rounds the fees were written to, e.g. "Fees applied to Rounds 1 and 2". */
  const [feeNotice, setFeeNotice] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  // The End Round confirm. Its round outlives the close, so the title and the button
  // never read "End Round  now?" while the modal goes away.
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [endConfirmRound, setEndConfirmRound] = useState<1 | 2>(1);

  // Expanded Chart State
  const [expandedChart, setExpandedChart] = useState<string | null>(null);
  
  // Helper to determine default round view
  const getDefaultRoundMode = () => {
    if (config.round === 2 && !config.isActive) return 'BOTH';
    return config.round === 2 ? 'R2' : 'R1';
  };

  const [salesTab, setSalesTab] = useState<'R1' | 'R2' | 'BOTH'>(getDefaultRoundMode());
  const [sequenceTab, setSequenceTab] = useState<'R1' | 'R2' | 'BOTH'>(getDefaultRoundMode());
  const [unratedTab, setUnratedTab] = useState<'R1' | 'R2' | 'BOTH'>(getDefaultRoundMode());
  const [salesTeamFilter, setSalesTeamFilter] = useState<string>('ALL');
  const [sequenceTeamFilter, setSequenceTeamFilter] = useState<string>('ALL');
  const [unratedTeamFilter, setUnratedTeamFilter] = useState<string>('ALL');
  const [hoveredSalesSeriesKey, setHoveredSalesSeriesKey] = useState<string | null>(null);
  const [hoveredSequenceSeriesKey, setHoveredSequenceSeriesKey] = useState<string | null>(null);
  const [hoveredUnratedSeriesKey, setHoveredUnratedSeriesKey] = useState<string | null>(null);
  // The round the leaderboard, charts and debrief show (spec decision 6). UI only:
  // Start, End and the popups act on config.round, which the poll sets, and nothing
  // here calls setRound. It follows the phase (Round 2 once it has started) until
  // the instructor picks a round in the control bar.
  const phase = instructorPhase(roundStatuses);
  const round2Started = roundStatuses[2] === 'ACTIVE' || roundStatuses[2] === 'ENDED';
  const [viewRound, setViewRound] = useState<1 | 2>(() => defaultViewRound(phase));
  useEffect(() => { setViewRound(defaultViewRound(phase)); }, [phase]);
  // The open tab follows the phase (Teams in the lobby, Live during and between rounds,
  // Debrief after Round 2). A tab the instructor picks stays until the phase changes.
  const [tab, setTab] = useState<ScreenTab>(() => initialTab ?? defaultTab(phase));
  const [tabPhase, setTabPhase] = useState(phase);
  if (tabPhase !== phase) {
    setTabPhase(phase);
    setTab(defaultTab(phase));
  }
  // Lean charts: the round they show. It follows viewRound; resolveLeanChartsRound
  // may move it off a round that has no Lean charts to show.
  const [leanChartsRound, setLeanChartsRound] = useState<1 | 2>(viewRound);
  useEffect(() => { setLeanChartsRound(viewRound); }, [viewRound]);
  const [scatterXMetric, setScatterXMetric] = useState<string>('total_sales');
  const [scatterYMode, setScatterYMode] = useState<'metric' | 'ratio'>('metric');
  const [scatterYMetric, setScatterYMetric] = useState<string>('profit');
  const [scatterNumerator, setScatterNumerator] = useState<string>('profit');
  const [scatterDenominator, setScatterDenominator] = useState<string>('total_jokes');
  const [scatterRoundMode, setScatterRoundMode] = useState<'R1' | 'R2' | 'BOTH'>(getDefaultRoundMode());

  // Session-only chart visibility (defaults back on new browser session)
  const [hiddenCharts, setHiddenCharts] = useState<ChartKey[]>([]);
  const [deletingUserIds, setDeletingUserIds] = useState<string[]>([]);
  const [leaderboardSortKey, setLeaderboardSortKey] = useState<
    'team' | 'batches_processed' | 'published_jokes' | 'discarded_jokes' | 'unsold_jokes' | 'total_jokes' | 'total_sales' | 'profit'
    | LeanSortKey
  >('profit');
  const [leaderboardSortDir, setLeaderboardSortDir] = useState<'asc' | 'desc'>('desc');
  const [rankUpTeamIds, setRankUpTeamIds] = useState<string[]>([]);
  const prevLeaderboardPosRef = useRef<Record<string, number> | null>(null);
  const rankUpTimersRef = useRef<Record<string, number>>({});
  const [marketSortKey, setMarketSortKey] = useState<'id' | 'sales'>('id');
  const [marketSortDir, setMarketSortDir] = useState<'asc' | 'desc'>('desc');
  const [expandedMarketJokeIds, setExpandedMarketJokeIds] = useState<Record<string, boolean>>({});
  const [marketPage, setMarketPage] = useState(1);
  const [wasteChartMode, setWasteChartMode] = useState<'count' | 'rate'>('count');
  const [localSalesOverTime, setLocalSalesOverTime] = useState<
    Array<{ event_index: number; timestamp: string; team_id: number; team_name: string; total_sales: number }>
  >([]);
  const lastSalesTotalsRef = useRef<Record<string, number> | null>(null);
  const salesEventIndexRef = useRef<number>(0);

  // Keep local inputs aligned with server-driven config changes (polling/reset).
  useEffect(() => setLocalBudget(config.customerBudget), [config.customerBudget]);
  useEffect(() => setLocalMarketPrice(config.marketPrice), [config.marketPrice]);
  useEffect(() => setLocalCostOfPublishing(config.costOfPublishing), [config.costOfPublishing]);
  useEffect(() => setLocalNudge1(config.marketingNudge1Seconds), [config.marketingNudge1Seconds]);
  useEffect(() => setLocalNudge2(config.marketingNudge2Seconds), [config.marketingNudge2Seconds]);
  useEffect(
    () => setLocalFees(feeValuesOf(config)),
    [config.arrivalWindowSeconds, config.shippingFeeSmall, config.shippingFeeStandard, config.shippingFeeLarge,
      config.storageFeePerJokeMinute, config.hostingFeePerJokeMinute, config.customersPerTeam],
  );

  const handleDeleteUser = async (userId: string, displayName?: string) => {
    const label = displayName ? `${displayName} (${userId})` : `user ${userId}`;
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;
    setDeletingUserIds(prev => (prev.includes(userId) ? prev : [...prev, userId]));
    try {
      await deleteUser(userId);
    } finally {
      setDeletingUserIds(prev => prev.filter(id => id !== userId));
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.sessionStorage.getItem(INSTRUCTOR_HIDDEN_CHARTS_SESSION_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const filtered = parsed.filter((k: any): k is ChartKey =>
        (CHART_KEYS as readonly string[]).includes(String(k))
      ) as ChartKey[];
      setHiddenCharts(filtered);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (hiddenCharts.length === 0) {
        window.sessionStorage.removeItem(INSTRUCTOR_HIDDEN_CHARTS_SESSION_KEY);
      } else {
        window.sessionStorage.setItem(INSTRUCTOR_HIDDEN_CHARTS_SESSION_KEY, JSON.stringify(hiddenCharts));
      }
    } catch {
      // ignore
    }
  }, [hiddenCharts]);

  const isChartHidden = (key: ChartKey) => hiddenCharts.includes(key);

  const hideChart = (key: ChartKey) => {
    setHiddenCharts(prev => (prev.includes(key) ? prev : [...prev, key]));
    if (expandedChart === key) setExpandedChart(null);
  };

  const restoreAllCharts = () => setHiddenCharts([]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

// Config edit rules:
// - While a round is active: config is not editable.
// - Batch sizes are not editable: Round 1 is exactly 5, Round 2 up to 10 (Reset Game sets them).
  const canEditBudget = !config.isActive && (config.round === 1 || config.round === 2);
  const canEditPricing = !config.isActive && (config.round === 1 || config.round === 2);
  // Lean settings lock once the selected round has started (ACTIVE or ENDED); the server
  // refuses them with 409 MARKET_MODE_LOCKED. Classic fields keep canEditPricing/canEditBudget.
  // An unknown status (null) is not treated as locked: the server stays the authority.
  const selectedRoundStatus = roundStatuses[config.round === 2 ? 2 : 1];
  const leanLocked = selectedRoundStatus != null && selectedRoundStatus !== 'CONFIGURED';
  const canEditLean = canEditPricing && !leanLocked;
  const LEAN_LOCK_HINT = 'Lean settings lock once the round starts';
  // Pacing, not round-specific — editable between rounds whatever the round number.
  const canEditNudges = !config.isActive;

  const hasPendingConfigChanges =
    (canEditBudget && localBudget !== config.customerBudget) ||
    (canEditPricing && (localMarketPrice !== config.marketPrice || localCostOfPublishing !== config.costOfPublishing)) ||
    (canEditNudges && (localNudge1 !== config.marketingNudge1Seconds || localNudge2 !== config.marketingNudge2Seconds)) ||
    (canEditLean && Object.keys(changedFees(localFees, config)).length > 0);
  // The server refuses shipping fees that fall with batch size; FeeConfigFields says so inline.
  const feeOrderBlocked = canEditLean && shippingOrderError(localFees) != null;
  const canApply = hasPendingConfigChanges && !feeOrderBlocked;

  const handleUpdateSettings = async () => {
    setFeeNotice(null);
    if (feeOrderBlocked) return;
    const updates = buildApplyUpdates({
      local: { budget: localBudget, marketPrice: localMarketPrice, costOfPublishing: localCostOfPublishing,
        nudge1: localNudge1, nudge2: localNudge2, fees: localFees },
      config, canEditBudget, canEditPricing, canEditNudges, canEditLean,
    });
    if (Object.keys(updates).length === 0) return;
    const result = await updateConfig(updates);
    if (result.feeRounds.length > 0) setFeeNotice(feeRoundsText(result.feeRounds));
  };

  // --- Lobby Logic ---
  // Every non-instructor account is assignable: human customers are gone, so none are held
  // back. Each team seats 1 Joke Maker + 1 Marketing, hence the pairing.
  const connectedPairs = roster.filter(u => u.role !== Role.INSTRUCTOR).length;
  const assignableCount = connectedPairs;

  const handleFormTeams = () => {
      formTeams();
  };


  // --- Data Processing ---

  // Keep tab defaults aligned to current round logic.
  useEffect(() => {
    const defaultMode = getDefaultRoundMode();
    setSalesTab(defaultMode);
    setSequenceTab(defaultMode);
    setUnratedTab(defaultMode);
    setScatterRoundMode(defaultMode);
  }, [config.round, config.isActive]);

  const statsR1 = instructorStatsRound1 ?? null;
  const statsR2 = instructorStatsRound2 ?? null;
  const leaderboardStatsSelected = (viewRound === 1 ? statsR1 : statsR2) ?? instructorStats ?? null;

  /* Lean charts replace the five Classic chart cards when the round their
     round control shows is Lean — the leaderboard's rule: its stats rows carry
     `lean`, or, before stats arrive, the current round's config. Both rounds
     are loaded (charts 3 and 4 overlay them): an ACTIVE round is polled every
     10 s, an ENDED one fetched once, a round not yet started not at all. */
  const leanRounds = useMemo(
    () => leanRoundFlags(statsR1?.leaderboard, statsR2?.leaderboard, config.round === 2 ? 2 : 1, config.marketMode),
    [statsR1?.leaderboard, statsR2?.leaderboard, config.round, config.marketMode],
  );
  const leanChartsR1 = useLeanCharts({
    roundId: roundIds[1],
    teamId: null,
    enabled: leanRounds[1] && roundStatuses[1] != null && roundStatuses[1] !== 'CONFIGURED',
    live: roundStatuses[1] === 'ACTIVE',
  });
  const leanChartsR2 = useLeanCharts({
    roundId: roundIds[2],
    teamId: null,
    enabled: leanRounds[2] && roundStatuses[2] != null && roundStatuses[2] !== 'CONFIGURED',
    live: roundStatuses[2] === 'ACTIVE',
  });
  // A 409 NOT_LEAN_ROUND (a mode change racing the start) hides the panel
  // until a later poll answers again.
  // The control never strands the instructor: a pick that is no longer showable
  // (new game, round not Lean, live round Classic) is dropped for the live round.
  // Between rounds (the live round configured, not started) a Lean round stays
  // on screen for the debrief, even when the next round is Classic.
  const leanCurrentStatus = roundStatuses[config.round === 2 ? 2 : 1];
  const leanCurrentStarted = leanCurrentStatus != null && leanCurrentStatus !== 'CONFIGURED';
  useEffect(() => {
    const next = resolveLeanChartsRound(leanChartsRound, leanRounds, config.round === 2 ? 2 : 1, leanCurrentStarted);
    if (next !== leanChartsRound) {
      setLeanChartsRound(next);
    }
  }, [leanChartsRound, leanRounds, config.round, leanCurrentStarted]);
  const showLeanCharts = leanChartsVisibility(
    leanChartsRound,
    leanRounds,
    { 1: leanChartsR1.notLean, 2: leanChartsR2.notLean },
  );

  const mapLeaderboard = (rows: any[]) => {
    return (rows || []).map(row => {
      const teamId = Number(row.team.id);
      const teamName = teamNames[String(teamId)] || row.team.name;
      // Go's DENSE_RANK by profit (ties share a rank); 0 or absent (e.g. the mock) means none.
      const rank = Number(row.rank);
      return {
        team_id: teamId,
        team_name: teamName,
        rank: Number.isFinite(rank) && rank > 0 ? rank : null,
        batches_processed: Number(row.batches_processed ?? 0),
        published_jokes: Number(row.published_jokes ?? 0),
        discarded_jokes: Number(row.discarded_jokes ?? 0),
        unsold_jokes: Number(row.unsold_jokes ?? 0),
        total_jokes: Number(row.total_jokes ?? 0),
        total_sales: Number(row.total_sales ?? 0),
        profit: Number(row.profit ?? 0),
      };
    });
  };

  const leaderboardBase = useMemo(() => {
    return mapLeaderboard(leaderboardStatsSelected?.leaderboard || []);
  }, [leaderboardStatsSelected?.leaderboard, teamNames]);

  /* Lean columns follow the round the leaderboard tab shows: the backend
     nests `lean` on each row for LEAN rounds only, so its presence is the
     signal. Classic leaderboards render exactly the columns they always had. */
  const leaderboardIsLean = useMemo(
    () => (leaderboardStatsSelected?.leaderboard ?? []).some(r => r.lean != null),
    [leaderboardStatsSelected?.leaderboard],
  );
  const leanByTeam = useMemo(() => {
    const m: Record<string, Record<LeanSortKey | 'never_sold', number>> = {};
    for (const r of leaderboardStatsSelected?.leaderboard ?? []) {
      // Older backends send only setup_cost / carrying_cost: leanFeesOf falls back to them.
      const fees = leanFeesOf(r.lean);
      m[String(r.team.id)] = {
        shipping_cost: fees.shipping,
        storage_cost: fees.storage,
        hosting_cost: fees.hosting,
        lead_time_s: Number(r.lean?.avg_submit_to_publish_s ?? 0),
        sale_time_s: Number(r.lean?.avg_publish_to_first_sale_s ?? 0),
        // Lean rows: published-but-never-sold (see neverSold); classic unsold otherwise.
        never_sold: neverSold(r.lean) ?? Number(r.unsold_jokes ?? 0),
      };
    }
    return m;
  }, [leaderboardStatsSelected?.leaderboard]);

  const leaderboardBaseR1 = useMemo(() => {
    return mapLeaderboard(statsR1?.leaderboard || []);
  }, [statsR1?.leaderboard, teamNames]);

  const leaderboardBaseR2 = useMemo(() => {
    return mapLeaderboard(statsR2?.leaderboard || []);
  }, [statsR2?.leaderboard, teamNames]);

  // Metrics that must be displayed as integers (joke counts, batches, sales)
  const integerMetricKeys = new Set([
    'total_sales',
    'published_jokes',
    'discarded_jokes',
    'unsold_jokes',
    'total_jokes',
    'batches_processed',
  ]);

  const scatterBaseMetrics = [
    { key: 'total_sales', label: 'Total Sales' },
    { key: 'published_jokes', label: 'Published Jokes' },
    { key: 'discarded_jokes', label: 'Wasted Jokes' },
    { key: 'unsold_jokes', label: 'Unsold Jokes' },
    { key: 'total_jokes', label: 'Total Jokes' },
    { key: 'batches_processed', label: 'Processed Batches' },
    { key: 'profit', label: 'Profit' },
  ];
  const scatterRatioMetrics = [
    { key: 'ratio:waste_rate', label: 'Waste Rate (Wasted / Total)' },
    { key: 'ratio:accept_rate', label: 'Publish Rate (Published / Total)' },
    { key: 'ratio:marketing_efficiency', label: 'Mkt Efficiency (Sales / Published)' },
    { key: 'ratio:marketing_inefficiency', label: 'Mkt Inefficiency (Unsold / Published)' },
  ];
  const scatterMetrics = [...scatterBaseMetrics, ...scatterRatioMetrics];

  const metricLabel = (key: string) =>
    scatterMetrics.find(m => m.key === key)?.label ?? key;

  const metricValue = (row: any, key: string) => {
    if (key.startsWith('ratio:')) {
      const pick = (k: string) => {
        const v = Number(row?.[k] ?? 0);
        return Number.isFinite(v) ? v : 0;
      };
      switch (key) {
        case 'ratio:waste_rate': {
          const den = pick('total_jokes');
          return den === 0 ? 0 : pick('discarded_jokes') / den;
        }
        case 'ratio:accept_rate': {
          const den = pick('total_jokes');
          return den === 0 ? 0 : pick('published_jokes') / den;
        }
        case 'ratio:marketing_efficiency': {
          const den = pick('published_jokes');
          return den === 0 ? 0 : pick('total_sales') / den;
        }
        case 'ratio:marketing_inefficiency': {
          const den = pick('published_jokes');
          return den === 0 ? 0 : pick('unsold_jokes') / den;
        }
        default:
          return 0;
      }
    }
    const val = Number(row?.[key] ?? 0);
    return Number.isFinite(val) ? val : 0;
  };

  const isRatioMetricSelected = scatterYMetric.startsWith('ratio:');
  const isRatioYAxis = scatterYMode === 'ratio' || isRatioMetricSelected;
  const yAxisLabel =
    scatterYMode === 'ratio'
      ? `${metricLabel(scatterNumerator)} / ${metricLabel(scatterDenominator)}`
      : metricLabel(scatterYMetric);

  const scatterData = useMemo(() => {
    const buildPoints = (rows: any[], roundLabel: 'R1' | 'R2') =>
      rows.map(row => {
        const xVal = metricValue(row, scatterXMetric);
        const yVal =
          scatterYMode === 'ratio'
            ? (() => {
                const num = metricValue(row, scatterNumerator);
                const den = metricValue(row, scatterDenominator);
                return den === 0 ? 0 : num / den;
              })()
            : metricValue(row, scatterYMetric);
        return {
          team_name: row.team_name,
          round: roundLabel,
          x: xVal,
          y: yVal,
          xLabel: metricLabel(scatterXMetric),
          yLabel: yAxisLabel,
          xRaw: xVal,
          yRaw: yVal,
        };
      });

    if (scatterRoundMode === 'R1') return buildPoints(leaderboardBaseR1, 'R1');
    if (scatterRoundMode === 'R2') return buildPoints(leaderboardBaseR2, 'R2');
    return [
      ...buildPoints(leaderboardBaseR1, 'R1'),
      ...buildPoints(leaderboardBaseR2, 'R2'),
    ];
  }, [
    leaderboardBaseR1,
    leaderboardBaseR2,
    scatterXMetric,
    scatterYMode,
    scatterYMetric,
    scatterNumerator,
    scatterDenominator,
    scatterRoundMode,
  ]);

  // Utility to format scatter value: integer if it's an integer-type metric, else 2 decimals
  const formatScatterValue = (val: number, isInteger: boolean) =>
    isInteger ? Math.round(val).toString() : Number(val).toFixed(2);

  // Determine if the Y metric should display as integer
  const isYMetricInteger = scatterYMode === 'metric' && integerMetricKeys.has(scatterYMetric);
  const isXMetricInteger = integerMetricKeys.has(scatterXMetric);

  // Round-based colors: R1 = slate, R2 = blue
  const SCATTER_R1_COLOR = '#64748b'; // slate-500
  const SCATTER_R2_COLOR = '#2563eb'; // blue-600

  // Custom scatter dot renderer with round-based coloring (only when BOTH rounds selected)
  const renderScatterDot = (props: any) => {
    const { cx, cy, payload } = props;
    if (cx == null || cy == null || !payload) return null;
    const isR1 = payload.round === 'R1';
    // Only differentiate colors when BOTH rounds are selected; otherwise always blue
    const color = scatterRoundMode === 'BOTH' && isR1 ? SCATTER_R1_COLOR : SCATTER_R2_COLOR;
    // When both rounds shown, R1 points are faded
    const opacity = scatterRoundMode === 'BOTH' && isR1 ? 0.35 : 1;
    return (
      <circle
        cx={cx}
        cy={cy}
        r={6}
        fill={color}
        fillOpacity={opacity}
        stroke={color}
        strokeOpacity={opacity}
        strokeWidth={1}
      />
    );
  };

  const renderScatterLabel = (props: any) => {
    const { x, y, payload, viewBox } = props;
    if (x == null || y == null || !payload) return null;
    const valueText = formatScatterValue(payload.yRaw, isYMetricInteger);
    const roundSuffix = scatterRoundMode === 'BOTH' ? ` • ${payload.round}` : '';
    const vbY = viewBox?.y ?? 0;
    const vbH = viewBox?.height ?? 0;
    const maxY = vbY + vbH;
    const offset = 16;
    let labelY = y - offset;
    if (labelY < vbY + 10) labelY = y + offset;
    if (labelY > maxY - 6) labelY = y - offset;
    // Only differentiate colors when BOTH rounds selected; otherwise always blue
    const isR1 = payload.round === 'R1';
    const labelColor = scatterRoundMode === 'BOTH' && isR1 ? SCATTER_R1_COLOR : SCATTER_R2_COLOR;
    const labelOpacity = scatterRoundMode === 'BOTH' && isR1 ? 0.5 : 1;
    return (
      <text x={x} y={labelY} textAnchor="middle" dominantBaseline="central" fontSize={10} fill={labelColor} fillOpacity={labelOpacity}>
        {payload.team_name}{roundSuffix}: {valueText}
      </text>
    );
  };

  const wasteChartData = useMemo(() => {
    const r1Data = (statsR1?.rejection_by_team as any[]) ?? [];
    const r2Data = (statsR2?.rejection_by_team as any[]) ?? [];
    
    // Collect all unique team IDs from both rounds
    const allTeamIds = new Set<number>();
    r1Data.forEach((row: any) => allTeamIds.add(Number(row.team_id)));
    r2Data.forEach((row: any) => allTeamIds.add(Number(row.team_id)));
    
    // Create lookup maps
    const r1Map: Record<string, any> = {};
    const r2Map: Record<string, any> = {};
    r1Data.forEach((row: any) => { r1Map[String(row.team_id)] = row; });
    r2Data.forEach((row: any) => { r2Map[String(row.team_id)] = row; });
    
    // Sort by team ID numerically (Team 1, Team 2, ..., Team N)
    const sortedTeamIds = Array.from(allTeamIds).sort((a, b) => a - b);
    
    return sortedTeamIds.map(teamId => {
      const tid = String(teamId);
      const r1Row = r1Map[tid];
      const r2Row = r2Map[tid];
      return {
        team_id: tid,
        team_name: teamNames[tid] || r1Row?.team_name || r2Row?.team_name || `Team ${teamId}`,
        r1_wasted: Number(r1Row?.unaccepted_jokes ?? 0),
        r1_rate: Number(r1Row?.rejection_rate ?? 0),
        r2_wasted: Number(r2Row?.unaccepted_jokes ?? 0),
        r2_rate: Number(r2Row?.rejection_rate ?? 0),
      };
    });
  }, [statsR1?.rejection_by_team, statsR2?.rejection_by_team, teamNames]);
  // If the backend doesn't provide sales-over-time, build a local event series based on changes
  // in `leaderboard.total_sales` (which moves up/down on buy/return).
  useEffect(() => {
    // Reset when round changes
    setLocalSalesOverTime([]);
    lastSalesTotalsRef.current = null;
    salesEventIndexRef.current = 0;
  }, [instructorStats?.round_id]);

  useEffect(() => {
    const backendHasSeries = (instructorStats?.cumulative_sales?.length ?? 0) > 0;
    if (backendHasSeries) return;
    // Track sales deltas using the "current round" leaderboard (independent of the UI-only leaderboard round toggle).
    const trackingStats = (config.round === 2 ? statsR2 : statsR1) ?? instructorStats ?? null;
    const trackingLeaderboard = (trackingStats?.leaderboard || []).map((row: any) => ({
      team_id: Number(row.team.id),
      team_name: String(teamNames[String(row.team.id)] || row.team.name),
      total_sales: Number(row.total_sales ?? 0),
    }));
    if (trackingLeaderboard.length === 0) return;

    const curr: Record<string, number> = {};
    trackingLeaderboard.forEach(t => {
      curr[String(t.team_id)] = Number(t.total_sales ?? 0);
    });

    const prev = lastSalesTotalsRef.current;
    const changed =
      !prev ||
      Object.keys(curr).some(id => prev[id] !== curr[id]);
    if (!changed) return;

    salesEventIndexRef.current += 1;
    const eventIndex = salesEventIndexRef.current;
    const ts = new Date().toISOString();

    setLocalSalesOverTime(prevEvents => [
      ...prevEvents,
      ...trackingLeaderboard.map(t => ({
        event_index: eventIndex,
        timestamp: ts,
        team_id: Number(t.team_id),
        team_name: String(t.team_name),
        total_sales: Number(t.total_sales ?? 0),
      })),
    ]);

    lastSalesTotalsRef.current = curr;
  }, [config.round, statsR1?.leaderboard, statsR2?.leaderboard, instructorStats?.leaderboard, instructorStats?.cumulative_sales, teamNames]);

  const leaderboardSorted = useMemo(() => {
    return [...leaderboardBase].sort((a, b) => {
    const dir = leaderboardSortDir === 'asc' ? 1 : -1;
    if (leaderboardSortKey === 'team') {
      return dir * a.team_name.localeCompare(b.team_name);
    }
    if (isLeanSortKey(leaderboardSortKey)) {
      // A lean column picked on a Lean tab, then a switch to a Classic tab:
      // rank by profit, as the Classic leaderboard always has.
      if (!leaderboardIsLean) return -1 * (a.profit - b.profit);
      const av = leanByTeam[String(a.team_id)]?.[leaderboardSortKey] ?? 0;
      const bv = leanByTeam[String(b.team_id)]?.[leaderboardSortKey] ?? 0;
      return dir * (av - bv);
    }
    if (leaderboardSortKey === 'unsold_jokes' && leaderboardIsLean) {
      const av = leanByTeam[String(a.team_id)]?.never_sold ?? 0;
      const bv = leanByTeam[String(b.team_id)]?.never_sold ?? 0;
      return dir * (av - bv);
    }
    const av = a[leaderboardSortKey] ?? 0;
    const bv = b[leaderboardSortKey] ?? 0;
    return dir * (av - bv);
  });
  }, [leaderboardBase, leaderboardSortKey, leaderboardSortDir, leaderboardIsLean, leanByTeam]);

  // The rank a row shows: the backend's when it sent one, else the row's position.
  // Rank belongs to the team, not to the current sort.
  const displayedRank = (row: { rank: number | null }, idx: number) => row.rank ?? idx + 1;

  // Flash a colorful highlight when a team moves up in the displayed rank.
  useEffect(() => {
    const currPos: Record<string, number> = {};
    leaderboardSorted.forEach((row, idx) => {
      currPos[String(row.team_id)] = displayedRank(row, idx);
    });

    const prevPos = prevLeaderboardPosRef.current;
    if (prevPos) {
      const movedUpIds = Object.keys(currPos).filter(id => {
        const prev = prevPos[id];
        const curr = currPos[id];
        return typeof prev === 'number' && curr < prev;
      });

      if (movedUpIds.length) {
        setRankUpTeamIds(prev => {
          const s = new Set(prev);
          movedUpIds.forEach(id => s.add(id));
          return Array.from(s);
        });

        movedUpIds.forEach(id => {
          const existing = rankUpTimersRef.current[id];
          if (existing) window.clearTimeout(existing);
          rankUpTimersRef.current[id] = window.setTimeout(() => {
            setRankUpTeamIds(prev => prev.filter(x => x !== id));
            delete rankUpTimersRef.current[id];
          }, 1400);
        });
      }
    }

    prevLeaderboardPosRef.current = currPos;
  }, [leaderboardSorted]);

  const activeTeamIds = Array.from(new Set([
    ...leaderboardBase.map(t => String(t.team_id)),
    ...(statsR1?.leaderboard ?? []).map(r => String(r.team.id)),
    ...(statsR2?.leaderboard ?? []).map(r => String(r.team.id)),
    ...Object.keys(teamNames).filter(id => roster.some(u => u.team === id)),
  ])).sort((a, b) => Number(a) - Number(b));

  // Demo constraint: cap the displayed teams to 20.
  const visibleTeamIds = activeTeamIds.slice(0, 20);

  // Team filters (All Teams or a single selected team).
  const salesTeamIds = useMemo(() => {
    if (salesTeamFilter === 'ALL') return visibleTeamIds;
    if (!visibleTeamIds.includes(String(salesTeamFilter))) return visibleTeamIds;
    return [String(salesTeamFilter)];
  }, [salesTeamFilter, visibleTeamIds]);
  const sequenceTeamIds = useMemo(() => {
    if (sequenceTeamFilter === 'ALL') return visibleTeamIds;
    if (!visibleTeamIds.includes(String(sequenceTeamFilter))) return visibleTeamIds;
    return [String(sequenceTeamFilter)];
  }, [sequenceTeamFilter, visibleTeamIds]);
  const unratedTeamIds = useMemo(() => {
    if (unratedTeamFilter === 'ALL') return visibleTeamIds;
    if (!visibleTeamIds.includes(String(unratedTeamFilter))) return visibleTeamIds;
    return [String(unratedTeamFilter)];
  }, [unratedTeamFilter, visibleTeamIds]);

  useEffect(() => {
    if (salesTeamFilter !== 'ALL' && !visibleTeamIds.includes(String(salesTeamFilter))) setSalesTeamFilter('ALL');
  }, [salesTeamFilter, visibleTeamIds]);
  useEffect(() => {
    if (sequenceTeamFilter !== 'ALL' && !visibleTeamIds.includes(String(sequenceTeamFilter))) setSequenceTeamFilter('ALL');
  }, [sequenceTeamFilter, visibleTeamIds]);
  useEffect(() => {
    if (unratedTeamFilter !== 'ALL' && !visibleTeamIds.includes(String(unratedTeamFilter))) setUnratedTeamFilter('ALL');
  }, [unratedTeamFilter, visibleTeamIds]);

  const buildDenseSalesSeries = (
    events: any[],
    teamIds: string[],
    keyPrefix: string,
  ): any[] => {
    const byEvent: Record<number, Record<string, number>> = {};
    for (const ev of events) {
      const idx = Number((ev as any).event_index);
      if (!Number.isFinite(idx)) continue;
      if (!byEvent[idx]) byEvent[idx] = {};
      byEvent[idx][`${keyPrefix}${String(ev.team_id)}`] = Number((ev as any).total_sales ?? 0);
    }
    const eventIndices = Object.keys(byEvent).map(n => Number(n)).filter(n => Number.isFinite(n)).sort((a, b) => a - b);
    const last: Record<string, number> = {};
    teamIds.forEach(tid => { last[`${keyPrefix}${tid}`] = 0; });
    const rows: any[] = [];
    const base: any = { index: 0 };
    teamIds.forEach(tid => { base[`${keyPrefix}${tid}`] = 0; });
    rows.push(base);
    for (const idx of eventIndices) {
      const updates = byEvent[idx] || {};
      for (const k of Object.keys(updates)) last[k] = updates[k];
      const row: any = { index: idx };
      teamIds.forEach(tid => { row[`${keyPrefix}${tid}`] = last[`${keyPrefix}${tid}`] ?? 0; });
      rows.push(row);
    }
    return rows;
  };

  const buildDenseUnratedSeries = (
    events: any[],
    teamIds: string[],
    keyPrefix: string,
  ): any[] => {
    const byEvent: Record<number, Record<string, number>> = {};
    for (const ev of events) {
      const idx = Number((ev as any).team_event_index ?? (ev as any).event_index);
      if (!Number.isFinite(idx)) continue;
      if (!byEvent[idx]) byEvent[idx] = {};
      byEvent[idx][`${keyPrefix}${String(ev.team_id)}`] = Number((ev as any).queue_count ?? 0);
    }
    const eventIndices = Object.keys(byEvent).map(n => Number(n)).filter(n => Number.isFinite(n)).sort((a, b) => a - b);
    const last: Record<string, number> = {};
    teamIds.forEach(tid => { last[`${keyPrefix}${tid}`] = 0; });
    const rows: any[] = [];
    const base: any = { index: 0 };
    teamIds.forEach(tid => { base[`${keyPrefix}${tid}`] = 0; });
    rows.push(base);
    for (const idx of eventIndices) {
      const updates = byEvent[idx] || {};
      for (const k of Object.keys(updates)) last[k] = updates[k];
      const row: any = { index: idx };
      teamIds.forEach(tid => { row[`${keyPrefix}${tid}`] = last[`${keyPrefix}${tid}`] ?? 0; });
      rows.push(row);
    }
    return rows;
  };

  const mergeByIndex = (a: any[], b: any[]): any[] => {
    const m = new Map<number, any>();
    for (const row of a) m.set(Number(row.index), { ...(m.get(Number(row.index)) ?? {}), ...row });
    for (const row of b) m.set(Number(row.index), { ...(m.get(Number(row.index)) ?? {}), ...row });
    return Array.from(m.values()).sort((x, y) => Number(x.index) - Number(y.index));
  };

  const cumulativeSalesData = (() => {
    const eventsR1 = statsR1?.cumulative_sales ?? [];
    const eventsR2 = statsR2?.cumulative_sales ?? [];
    const fallbackEvents =
      (instructorStats?.cumulative_sales && instructorStats.cumulative_sales.length > 0)
        ? instructorStats.cumulative_sales
        : localSalesOverTime;
    const ids = salesTeamIds;
    if (salesTab === 'BOTH') {
      const s1 = buildDenseSalesSeries(eventsR1, ids, 'r1-');
      const s2 = buildDenseSalesSeries(eventsR2, ids, 'r2-');
      return mergeByIndex(s1, s2);
    }
    if (salesTab === 'R1') return buildDenseSalesSeries(eventsR1, ids, '');
    if (salesTab === 'R2') return buildDenseSalesSeries(eventsR2, ids, '');
    return buildDenseSalesSeries(fallbackEvents, ids, '');
  })();

  const unratedJokesOverTimeData = (() => {
    const eventsR1 = statsR1?.unrated_jokes_over_time ?? [];
    const eventsR2 = statsR2?.unrated_jokes_over_time ?? [];
    const fallbackEvents =
      (instructorStats?.unrated_jokes_over_time && instructorStats.unrated_jokes_over_time.length > 0)
        ? instructorStats.unrated_jokes_over_time
        : [];
    const ids = unratedTeamIds;
    const r1Events = eventsR1.length === 0 && config.round === 1 ? fallbackEvents : eventsR1;
    const r2Events = eventsR2.length === 0 && config.round === 2 ? fallbackEvents : eventsR2;
    if (unratedTab === 'BOTH') {
      const s1 = buildDenseUnratedSeries(r1Events, ids, 'r1-');
      const s2 = buildDenseUnratedSeries(r2Events, ids, 'r2-');
      return mergeByIndex(s1, s2);
    }
    if (unratedTab === 'R1') return buildDenseUnratedSeries(r1Events, ids, '');
    if (unratedTab === 'R2') return buildDenseUnratedSeries(r2Events, ids, '');
    return buildDenseUnratedSeries(fallbackEvents, ids, '');
  })();

  const buildDenseSequenceSeries = (points: any[], teamIds: string[], keyPrefix: string): any[] => {
    const grouped: Record<number, any> = {};
    points.forEach((p: any) => {
      const seq = Number(p.batch_order);
      if (!Number.isFinite(seq)) return;
      if (!grouped[seq]) grouped[seq] = { seq };
      grouped[seq][`${keyPrefix}${String(p.team_id)}`] = Number(p.avg_score ?? 0);
    });
    const rows = Object.values(grouped).sort((a: any, b: any) => a.seq - b.seq);
    // Forward fill, but do NOT invent values for teams that never appear in the stats.
    // This prevents phantom points/lines (e.g. Round 2 not started yet).
    const last: Record<string, number | null> = {};
    teamIds.forEach(tid => { last[`${keyPrefix}${tid}`] = null; });
    return rows.map((row: any) => {
      const out: any = { ...row };
      teamIds.forEach(tid => {
        const k = `${keyPrefix}${tid}`;
        if (out[k] == null) {
          out[k] = last[k];
        } else {
          last[k] = out[k];
        }
      });
      return out;
    });
  };

  const sequenceVsQualityData = (() => {
    const ids = sequenceTeamIds;
    const p1 = statsR1?.learning_curve ?? [];
    const p2 = statsR2?.learning_curve ?? [];
    if (sequenceTab === 'BOTH') {
      const s1 = buildDenseSequenceSeries(p1, ids, 'r1-');
      const s2 = buildDenseSequenceSeries(p2, ids, 'r2-');
      // merge by seq
      const m = new Map<number, any>();
      for (const row of s1) m.set(Number(row.seq), { ...(m.get(Number(row.seq)) ?? {}), ...row });
      for (const row of s2) m.set(Number(row.seq), { ...(m.get(Number(row.seq)) ?? {}), ...row });
      const merged = Array.from(m.values()).sort((a, b) => Number(a.seq) - Number(b.seq));
      return merged.length ? merged : [{ seq: 0 }];
    }
    if (sequenceTab === 'R1') {
      const s = buildDenseSequenceSeries(p1, ids, '');
      return s.length ? s : [{ seq: 0 }];
    }
    if (sequenceTab === 'R2') {
      const s = buildDenseSequenceSeries(p2, ids, '');
      return s.length ? s : [{ seq: 0 }];
    }
    const s = buildDenseSequenceSeries((instructorStats?.learning_curve ?? []), ids, '');
    return s.length ? s : [{ seq: 0 }];
  })();

  const rosterByTeam: Record<string, typeof roster> = {};
  roster.forEach(u => {
    if (u.role === Role.INSTRUCTOR || u.role === Role.CUSTOMER || u.role === Role.UNASSIGNED) return;
    if (!rosterByTeam[u.team]) rosterByTeam[u.team] = [];
    rosterByTeam[u.team].push(u);
  });
  
  // Drag and Drop Logic
  const handleDragStart = (e: React.DragEvent, userId: string) => {
    e.dataTransfer.setData('userId', userId);
  };
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };
  // No CUSTOMER target: customers are simulated now, and context.updateUser already refuses
  // a CUSTOMER role as a guaranteed 400 from the backend.
  const handleDrop = (e: React.DragEvent, targetType: 'TEAM' | 'LOBBY', targetId?: string) => {
    e.preventDefault();
    const userId = e.dataTransfer.getData('userId');
    if (!userId) return;

    const user = roster.find(u => u.id === userId);
    if (!user) return;

    if (targetType === 'LOBBY') {
        updateUser(userId, { role: Role.UNASSIGNED, team: 'N/A' });
    } else if (targetType === 'TEAM' && targetId) {
        const currentRole = (user.role === Role.JOKE_MAKER || user.role === Role.QUALITY_CONTROL) 
                          ? user.role 
                          : Role.JOKE_MAKER;
        updateUser(userId, { team: targetId, role: currentRole });
    }
  };

  const toggleUserRole = (userId: string, currentRole: Role) => {
      const newRole = currentRole === Role.JOKE_MAKER ? Role.QUALITY_CONTROL : Role.JOKE_MAKER;
      updateUser(userId, { role: newRole });
  };

  const renderLeaderboardTable = (opts: { maxHeightClass: string; isExpanded?: boolean }) => {
    const isExpanded = Boolean(opts.isExpanded);
    return (
      <div className={`overflow-x-auto ${opts.maxHeightClass} overflow-y-auto`}>
        <table className={`min-w-full ${isExpanded ? 'text-base' : 'text-sm'}`}>
          <thead className="sticky top-0 bg-white shadow-sm z-10">
            <tr className="bg-gray-50 border-b">
              <th className="px-3 py-2 text-left font-medium text-gray-500">Rank</th>
              <th className="px-3 py-2 text-left font-medium text-gray-500">
                <button
                  type="button"
                  className="inline-flex items-center hover:text-gray-800"
                  onClick={() => {
                    setLeaderboardSortKey('team');
                    setLeaderboardSortDir(prev => (leaderboardSortKey === 'team' ? (prev === 'asc' ? 'desc' : 'asc') : 'asc'));
                  }}
                  title="Sort by Team"
                >
                  <span>Team</span>
                  <span className="ml-1 w-3 text-center">
                    {leaderboardSortKey === 'team' ? (leaderboardSortDir === 'asc' ? '▲' : '▼') : ''}
                  </span>
                </button>
              </th>
              <th className="px-3 py-2 text-right font-medium text-gray-500">
                <button
                  type="button"
                  className="inline-flex items-center hover:text-gray-800"
                  onClick={() => {
                    setLeaderboardSortKey('batches_processed');
                    setLeaderboardSortDir(prev => (leaderboardSortKey === 'batches_processed' ? (prev === 'asc' ? 'desc' : 'asc') : 'desc'));
                  }}
                  title="Sort by Processed Batches"
                >
                  <span>Processed Batches</span>
                  <span className="ml-1 w-3 text-center">
                    {leaderboardSortKey === 'batches_processed' ? (leaderboardSortDir === 'asc' ? '▲' : '▼') : ''}
                  </span>
                </button>
              </th>
              <th className="px-3 py-2 text-right font-medium text-gray-500">
                <button
                  type="button"
                  className="inline-flex items-center hover:text-gray-800"
                  onClick={() => {
                    setLeaderboardSortKey('published_jokes');
                    setLeaderboardSortDir(prev => (leaderboardSortKey === 'published_jokes' ? (prev === 'asc' ? 'desc' : 'asc') : 'desc'));
                  }}
                  title="Sort by Published Jokes"
                >
                  <span>Published Jokes</span>
                  <span className="ml-1 w-3 text-center">
                    {leaderboardSortKey === 'published_jokes' ? (leaderboardSortDir === 'asc' ? '▲' : '▼') : ''}
                  </span>
                </button>
              </th>
              <th className="px-3 py-2 text-right font-medium text-gray-500">
                <button
                  type="button"
                  className="inline-flex items-center hover:text-gray-800"
                  onClick={() => {
                  setLeaderboardSortKey('discarded_jokes');
                  setLeaderboardSortDir(prev => (leaderboardSortKey === 'discarded_jokes' ? (prev === 'asc' ? 'desc' : 'asc') : 'desc'));
                  }}
                  title="Sort by Wasted Jokes"
                >
                  <span>Wasted Jokes</span>
                  <span className="ml-1 w-3 text-center">
                    {leaderboardSortKey === 'discarded_jokes' ? (leaderboardSortDir === 'asc' ? '▲' : '▼') : ''}
                  </span>
                </button>
              </th>
              <th className="px-3 py-2 text-right font-medium text-gray-500">
                <button
                  type="button"
                  className="inline-flex items-center hover:text-gray-800"
                  onClick={() => {
                    setLeaderboardSortKey('unsold_jokes');
                    setLeaderboardSortDir(prev => (leaderboardSortKey === 'unsold_jokes' ? (prev === 'asc' ? 'desc' : 'asc') : 'desc'));
                  }}
                  title={leaderboardIsLean ? 'Sort by Never Sold (published jokes with no sale)' : 'Sort by Unsold Jokes'}
                >
                  <span>{leaderboardIsLean ? 'Never Sold' : 'Unsold Jokes'}</span>
                  <span className="ml-1 w-3 text-center">
                    {leaderboardSortKey === 'unsold_jokes' ? (leaderboardSortDir === 'asc' ? '▲' : '▼') : ''}
                  </span>
                </button>
              </th>
              <th className="px-3 py-2 text-right font-medium text-gray-500">
                <button
                  type="button"
                  className="inline-flex items-center hover:text-gray-800"
                  onClick={() => {
                    setLeaderboardSortKey('total_jokes');
                    setLeaderboardSortDir(prev => (leaderboardSortKey === 'total_jokes' ? (prev === 'asc' ? 'desc' : 'asc') : 'desc'));
                  }}
                  title="Sort by Total Jokes"
                >
                  <span>Total Jokes</span>
                  <span className="ml-1 w-3 text-center">
                    {leaderboardSortKey === 'total_jokes' ? (leaderboardSortDir === 'asc' ? '▲' : '▼') : ''}
                  </span>
                </button>
              </th>
              <th className="px-3 py-2 text-right font-medium text-gray-500">
                <button
                  type="button"
                  className="inline-flex items-center hover:text-gray-800"
                  onClick={() => {
                    setLeaderboardSortKey('total_sales');
                    setLeaderboardSortDir(prev => (leaderboardSortKey === 'total_sales' ? (prev === 'asc' ? 'desc' : 'asc') : 'desc'));
                  }}
                  title="Sort by Total Sales"
                >
                  <span>Total Sales</span>
                  <span className="ml-1 w-3 text-center">
                    {leaderboardSortKey === 'total_sales' ? (leaderboardSortDir === 'asc' ? '▲' : '▼') : ''}
                  </span>
                </button>
              </th>
              <th className="px-3 py-2 text-right font-medium text-gray-500">
                <button
                  type="button"
                  className="inline-flex items-center hover:text-gray-800"
                  onClick={() => {
                    setLeaderboardSortKey('profit');
                    setLeaderboardSortDir(prev => (leaderboardSortKey === 'profit' ? (prev === 'asc' ? 'desc' : 'asc') : 'desc'));
                  }}
                  title="Sort by Profit"
                >
                  <span>Profit</span>
                  <span className="ml-1 w-3 text-center">
                    {leaderboardSortKey === 'profit' ? (leaderboardSortDir === 'asc' ? '▲' : '▼') : ''}
                  </span>
                </button>
              </th>
              {leaderboardIsLean && LEAN_COLUMNS.map(col => (
                <th key={col.key} className="px-3 py-2 text-right font-medium text-gray-500">
                  <button
                    type="button"
                    className="inline-flex items-center hover:text-gray-800"
                    onClick={() => {
                      setLeaderboardSortKey(col.key);
                      // Costs and times: lower is better, so the first click sorts ascending.
                      setLeaderboardSortDir(prev => (leaderboardSortKey === col.key ? (prev === 'asc' ? 'desc' : 'asc') : 'asc'));
                    }}
                    title={`Sort by ${col.title}`}
                  >
                    <span>{col.label}</span>
                    <span className="ml-1 w-3 text-center">
                      {leaderboardSortKey === col.key ? (leaderboardSortDir === 'asc' ? '▲' : '▼') : ''}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {leaderboardSorted.length === 0 && (
              <tr>
                <td colSpan={leaderboardIsLean ? 9 + LEAN_COLUMNS.length : 9} className="px-3 py-6 text-center text-gray-400 italic">
                  No leaderboard data yet.
                </td>
              </tr>
            )}
            {leaderboardSorted.map((row, idx) => (
              <tr
                key={String(row.team_id)}
                className={`hover:bg-gray-50 ${rankUpTeamIds.includes(String(row.team_id)) ? 'jf-leaderboard-rankup' : ''}`}
              >
                <td className="px-3 py-2 font-mono text-gray-700">{displayedRank(row, idx)}</td>
                <td className="px-3 py-2 font-semibold text-gray-900">{row.team_name}</td>
                <td className="px-3 py-2 text-right text-gray-800">{row.batches_processed}</td>
                <td className="px-3 py-2 text-right text-gray-800">{row.published_jokes}</td>
                <td className="px-3 py-2 text-right text-gray-800">{row.discarded_jokes}</td>
                <td className="px-3 py-2 text-right text-gray-800">
                  {leaderboardIsLean ? (leanByTeam[String(row.team_id)]?.never_sold ?? row.unsold_jokes) : row.unsold_jokes}
                </td>
                <td className="px-3 py-2 text-right text-gray-800">{row.total_jokes}</td>
                <td className="px-3 py-2 text-right text-gray-800">{row.total_sales}</td>
                <td className={`px-3 py-2 text-right font-bold ${Number(row.profit) < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                  {Number(row.profit).toFixed(2)}
                </td>
                {leaderboardIsLean && (() => {
                  const lean = leanByTeam[String(row.team_id)];
                  return (
                    <>
                      <td className="px-3 py-2 text-right text-gray-800 tabular-nums">{lean ? fmtMoney(lean.shipping_cost) : '—'}</td>
                      <td className="px-3 py-2 text-right text-gray-800 tabular-nums">{lean ? fmtMoney(lean.storage_cost) : '—'}</td>
                      <td className="px-3 py-2 text-right text-gray-800 tabular-nums">{lean ? fmtMoney(lean.hosting_cost) : '—'}</td>
                      <td className="px-3 py-2 text-right text-gray-800 tabular-nums">{lean ? fmtSeconds(lean.lead_time_s) : '—'}</td>
                      <td className="px-3 py-2 text-right text-gray-800 tabular-nums">{lean ? fmtSeconds(lean.sale_time_s) : '—'}</td>
                    </>
                  );
                })()}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  /* An axis drawn over an absent series reads as a measured zero — "nobody sold
     anything" rather than "the backend does not send this". These three series
     ARE rendered, so the charts stay; when the array is absent we say so instead
     of drawing an empty grid. */
  const seriesUnavailable = (what: string) => (
    <div className="flex h-full w-full items-center justify-center px-6 text-center">
      <div>
        <div className="text-sm font-semibold text-gray-500">Not available yet</div>
        <div className="mt-1 text-xs text-gray-400">{what}</div>
      </div>
    </div>
  );

  // Render Charts Helper
  const renderChart = (type: string, opts?: { isExpanded?: boolean }) => {
    const isExpandedView = Boolean(opts?.isExpanded);
    switch(type) {
        case 'sales': {
            const isExpanded = isExpandedView;
            const teamIds = salesTeamIds;
            const eventsR1 = statsR1?.cumulative_sales ?? [];
            const eventsR2 = statsR2?.cumulative_sales ?? [];
            const teamsWithSalesR1 = new Set<string>(eventsR1.map((e: any) => String(e.team_id)));
            const teamsWithSalesR2 = new Set<string>(eventsR2.map((e: any) => String(e.team_id)));
            // If backend doesn't provide cumulative series, allow the local fallback ONLY for the current round.
            if (teamsWithSalesR1.size === 0 && config.round === 1 && localSalesOverTime.length > 0) {
              localSalesOverTime.forEach(ev => teamsWithSalesR1.add(String(ev.team_id)));
            }
            if (teamsWithSalesR2.size === 0 && config.round === 2 && localSalesOverTime.length > 0) {
              localSalesOverTime.forEach(ev => teamsWithSalesR2.add(String(ev.team_id)));
            }
            if (teamsWithSalesR1.size === 0 && teamsWithSalesR2.size === 0) {
              return seriesUnavailable('No sales series for this round yet.');
            }
            const seriesDisplayName = (rawKey: string) => {
              const isR1 = rawKey.startsWith('r1-');
              const isR2 = rawKey.startsWith('r2-');
              const teamId = isR1 || isR2 ? rawKey.slice(3) : rawKey;
              const baseRaw = String(teamNames[teamId] ?? `Team ${teamId}`);
              const base = baseRaw.length > 18 ? `${baseRaw.slice(0, 16)}…` : baseRaw;
              if (!isExpanded) return base;
              // When BOTH rounds are shown, we label only R2 lines by default (less crowded),
              // so suffix is only needed for R1 lines when we choose to render them.
              if (salesTab === 'BOTH') return base;
              return base;
            };
            const colorForTeamId = (tid: string) => {
              const idx = visibleTeamIds.indexOf(String(tid));
              return PALETTE[(idx >= 0 ? idx : 0) % PALETTE.length];
            };
            const labelSeriesKeys = (() => {
              if (!isExpanded) return [] as string[];
              if (salesTab !== 'BOTH') return teamIds.map(tid => String(tid));
              // Smart: if lots of teams, label only R2 to keep it readable.
              return teamIds.length > 8
                ? teamIds.map(tid => `r2-${tid}`)
                : teamIds.flatMap(tid => [`r1-${tid}`, `r2-${tid}`]);
            })();
            const lastIndexBySeriesKey: Record<string, number> = {};
            if (isExpanded) {
              for (const k of labelSeriesKeys) {
                for (let i = cumulativeSalesData.length - 1; i >= 0; i--) {
                  const row: any = (cumulativeSalesData as any[])[i];
                  const yv = Number(row?.[k]);
                  if (Number.isFinite(yv)) {
                    lastIndexBySeriesKey[k] = i;
                    break;
                  }
                }
              }
            }
            // If multiple series end at the same y-value, offset their labels so they don't overlap.
            const labelYOffsetBySeriesKey: Record<string, number> = {};
            if (isExpanded) {
              const groups = new Map<string, string[]>();
              for (const k of labelSeriesKeys) {
                const idx = lastIndexBySeriesKey[k];
                if (idx == null) continue;
                const row: any = (cumulativeSalesData as any[])[idx];
                const yv = Number(row?.[k]);
                if (!Number.isFinite(yv)) continue;
                // group with tolerance by rounding (sales are integers anyway)
                const gk = String(Math.round(yv * 100) / 100);
                const arr = groups.get(gk) ?? [];
                arr.push(k);
                groups.set(gk, arr);
              }
              for (const arr of groups.values()) {
                if (arr.length <= 1) continue;
                const reachIndex = (seriesKey: string) => {
                  const lastIdx = lastIndexBySeriesKey[seriesKey];
                  if (lastIdx == null) return Number.POSITIVE_INFINITY;
                  const lastRow: any = (cumulativeSalesData as any[])[lastIdx];
                  const finalY = Number(lastRow?.[seriesKey]);
                  if (!Number.isFinite(finalY)) return Number.POSITIVE_INFINITY;
                  for (let i = 0; i <= lastIdx; i++) {
                    const row: any = (cumulativeSalesData as any[])[i];
                    const yv = Number(row?.[seriesKey]);
                    if (Number.isFinite(yv) && yv === finalY) return i;
                  }
                  return lastIdx;
                };
                // Earlier achiever gets a more negative offset (label above), matching desired "on top" ordering.
                arr.sort((a, b) => {
                  const ra = reachIndex(a);
                  const rb = reachIndex(b);
                  if (ra !== rb) return ra - rb;
                  return a.localeCompare(b);
                });
                const step = 14;
                const mid = (arr.length - 1) / 2;
                arr.forEach((k, i) => {
                  labelYOffsetBySeriesKey[k] = (i - mid) * step;
                });
              }
            }
            const makeEndLabel = (seriesKey: string, labelText: string, color: string) => (p: any) => {
              if (!isExpanded) return null;
              if (p?.index !== lastIndexBySeriesKey[seriesKey]) return null;
              const x = Number(p?.x);
              const y = Number(p?.y);
              if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
              const isR1 = seriesKey.startsWith('r1-');
              const labelOpacity = salesTab === 'BOTH' && isR1 ? 0.45 : 1;
              const dyOffset = labelYOffsetBySeriesKey[seriesKey] ?? 0;
              return (
                <text
                  x={x - 6}
                  y={y + dyOffset}
                  dy={4}
                  textAnchor="end"
                  fontSize={12}
                  fontWeight={800}
                  fill="#111827"
                  opacity={labelOpacity}
                  paintOrder="stroke"
                  stroke="#ffffff"
                  strokeWidth={5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  pointerEvents="none"
                >
                  <tspan fill={color}>● </tspan>
                  <tspan fill="#111827">{labelText}</tspan>
                </text>
              );
            };
            const shouldShowEndLabel = (seriesKey: string) => labelSeriesKeys.includes(seriesKey);

            // Render order: low final value first (bottom), high final value last (top).
            // If tied, the one that reached the final value LATER is rendered first, so the "earlier achiever" is on top.
            const computeSeriesPriority = (seriesKey: string) => {
              let lastIdx = -1;
              let finalY = -Infinity;
              for (let i = cumulativeSalesData.length - 1; i >= 0; i--) {
                const row: any = (cumulativeSalesData as any[])[i];
                const yv = Number(row?.[seriesKey]);
                if (Number.isFinite(yv)) {
                  finalY = yv;
                  lastIdx = i;
                  break;
                }
              }
              let reachIdx = lastIdx;
              if (Number.isFinite(finalY) && lastIdx >= 0) {
                for (let i = 0; i <= lastIdx; i++) {
                  const row: any = (cumulativeSalesData as any[])[i];
                  const yv = Number(row?.[seriesKey]);
                  if (Number.isFinite(yv) && yv === finalY) {
                    reachIdx = i;
                    break;
                  }
                }
              }
              return { finalY, reachIdx };
            };
            const sortSeriesKeysForRender = (keys: string[]) => {
              const enriched = keys.map(k => ({ k, ...computeSeriesPriority(k) }));
              enriched.sort((a, b) => {
                if (a.finalY !== b.finalY) return a.finalY - b.finalY; // low first
                if (a.reachIdx !== b.reachIdx) return b.reachIdx - a.reachIdx; // later reach first, earlier reach last (on top)
                return a.k.localeCompare(b.k);
              });
              return enriched.map(x => x.k);
            };

            return (
               <ResponsiveContainer width="100%" height="100%">
                 <LineChart data={cumulativeSalesData} margin={{ top: 12, bottom: 20, left: 48, right: isExpanded ? 24 : 16 }}>
                   <CartesianGrid strokeDasharray="3 3" />
                   <XAxis dataKey="index" label={{ value: 'Time Elapsed', position: 'insideBottom', offset: -10 }} />
                   <YAxis
                     width={44}
                      allowDecimals={false}
                     domain={[
                       0,
                       (dataMax: number) => {
                         const m = Number.isFinite(dataMax) ? dataMax : 0;
                         return Math.max(1, Math.ceil(m * 1.1));
                       },
                     ]}
                     padding={{ top: 10, bottom: 4 }}
                     label={{ value: 'Cum. Sales', angle: -90, position: 'insideLeft', dx: -10 }}
                   />
                    <Tooltip
                      shared={false}
                      content={(props: any) => {
                        const active = Boolean(props?.active);
                        const payload = Array.isArray(props?.payload) ? props.payload : [];
                        if (!active || payload.length === 0) return null;
                        const hoveredKey = hoveredSalesSeriesKey;
                        const p =
                          (hoveredKey
                            ? payload.find((it: any) => String(it?.dataKey ?? '') === hoveredKey)
                            : undefined) ??
                          payload[0] ??
                          {};
                        const rawKey = String(p.dataKey ?? '');
                        const isR1 = rawKey.startsWith('r1-');
                        const isR2 = rawKey.startsWith('r2-');
                        const teamId = isR1 || isR2 ? rawKey.slice(3) : rawKey;
                        const roundLabel = isR1 ? 'Round 1' : isR2 ? 'Round 2' : '';
                        const teamName = String(teamNames[teamId] ?? `Team ${teamId}`);
                        const sales = Number(p.value ?? 0);
                        const label = Number(props?.label);
                        return (
                          <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg">
                            <div className="text-xs font-bold text-gray-500">Event {Number.isFinite(label) ? label : ''}</div>
                            <div className="text-sm font-bold text-gray-900">{teamName}</div>
                            {roundLabel && <div className="text-xs font-bold text-gray-500">{roundLabel}</div>}
                            <div className="mt-1 text-sm text-gray-700">
                              <div className="flex justify-between gap-4">
                                <span className="font-medium">Sales</span>
                                <span className="font-mono font-bold text-emerald-700">{Number.isFinite(sales) ? sales : 0}</span>
                              </div>
                            </div>
                          </div>
                        );
                      }}
                    />
                    {salesTab === 'BOTH' ? (
                      <>
                        {sortSeriesKeysForRender(
                          visibleTeamIds.filter(tid => teamsWithSalesR1.has(String(tid))).map(tid => `r1-${tid}`)
                        ).map((seriesKey) => {
                          const teamId = seriesKey.slice(3);
                          const color = colorForTeamId(teamId);
                          return (
                          <Line
                            key={seriesKey}
                            type="monotone"
                            dataKey={seriesKey}
                            name={`${teamNames[teamId] || `Team ${teamId}`} (R1)`}
                            stroke={color}
                            strokeWidth={2}
                            strokeOpacity={0.25}
                            strokeDasharray="6 4"
                            dot={false}
                            isAnimationActive={!isExpanded}
                            activeDot={hoveredSalesSeriesKey === seriesKey ? { r: 4 } : false}
                            label={
                              isExpanded && shouldShowEndLabel(seriesKey)
                                ? makeEndLabel(seriesKey, seriesDisplayName(seriesKey), color)
                                : false
                            }
                            onMouseEnter={() => setHoveredSalesSeriesKey(seriesKey)}
                            onMouseLeave={() => setHoveredSalesSeriesKey(null)}
                          />
                          );
                        })}
                        {sortSeriesKeysForRender(
                          visibleTeamIds.filter(tid => teamsWithSalesR2.has(String(tid))).map(tid => `r2-${tid}`)
                        ).map((seriesKey) => {
                          const teamId = seriesKey.slice(3);
                          const color = colorForTeamId(teamId);
                          return (
                          <Line
                            key={seriesKey}
                            type="monotone"
                            dataKey={seriesKey}
                            name={`${teamNames[teamId] || `Team ${teamId}`} (R2)`}
                            stroke={color}
                            strokeWidth={3}
                            strokeOpacity={1}
                            dot={false}
                            isAnimationActive={!isExpanded}
                            activeDot={hoveredSalesSeriesKey === seriesKey ? { r: 4 } : false}
                            label={
                              isExpanded && shouldShowEndLabel(seriesKey)
                                ? makeEndLabel(seriesKey, seriesDisplayName(seriesKey), color)
                                : false
                            }
                            onMouseEnter={() => setHoveredSalesSeriesKey(seriesKey)}
                            onMouseLeave={() => setHoveredSalesSeriesKey(null)}
                          />
                          );
                        })}
                      </>
                    ) : (
                      <>
                   {sortSeriesKeysForRender(
                      (salesTab === 'R1'
                        ? visibleTeamIds.filter(tid => teamsWithSalesR1.has(String(tid)))
                        : salesTab === 'R2'
                          ? visibleTeamIds.filter(tid => teamsWithSalesR2.has(String(tid)))
                          : visibleTeamIds
                      ).map(tid => String(tid))
                    ).map((teamId) => {
                      const color = colorForTeamId(teamId);
                      return (
                      <Line 
                        key={teamId} 
                        type="monotone" 
                        dataKey={teamId} 
                        name={teamNames[teamId] || `Team ${teamId}`} 
                        stroke={color} 
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={!isExpanded}
                        activeDot={hoveredSalesSeriesKey === String(teamId) ? { r: 4 } : false}
                        label={
                          isExpanded && shouldShowEndLabel(String(teamId))
                            ? makeEndLabel(String(teamId), seriesDisplayName(String(teamId)), color)
                            : false
                        }
                        onMouseEnter={() => setHoveredSalesSeriesKey(String(teamId))}
                        onMouseLeave={() => setHoveredSalesSeriesKey(null)}
                      />
                      );
                    })}
                      </>
                    )}
                 </LineChart>
               </ResponsiveContainer>
            );
        }
        case 'sequence_quality': {
            const isExpanded = isExpandedView;
            const teamIds = sequenceTeamIds;
            const pointsR1 = statsR1?.learning_curve ?? [];
            const pointsR2 = statsR2?.learning_curve ?? [];
            const teamsWithSeqR1 = new Set<string>(pointsR1.map((p: any) => String(p.team_id)));
            const teamsWithSeqR2 = new Set<string>(pointsR2.map((p: any) => String(p.team_id)));
            if (
              teamsWithSeqR1.size === 0 &&
              teamsWithSeqR2.size === 0 &&
              (instructorStats?.learning_curve?.length ?? 0) === 0
            ) {
              return seriesUnavailable('The backend sends no per-batch quality series.');
            }

            const seriesDisplayName = (rawKey: string) => {
              const isR1 = rawKey.startsWith('r1-');
              const isR2 = rawKey.startsWith('r2-');
              const teamId = isR1 || isR2 ? rawKey.slice(3) : rawKey;
              const baseRaw = String(teamNames[teamId] ?? `Team ${teamId}`);
              const base = baseRaw.length > 18 ? `${baseRaw.slice(0, 16)}…` : baseRaw;
              if (!isExpanded) return base;
              if (sequenceTab === 'BOTH') return base;
              return base;
            };
            const colorForTeamId = (tid: string) => {
              const idx = visibleTeamIds.indexOf(String(tid));
              return PALETTE[(idx >= 0 ? idx : 0) % PALETTE.length];
            };
            const labelSeriesKeys = (() => {
              if (!isExpanded) return [] as string[];
              if (sequenceTab !== 'BOTH') return teamIds.map(tid => String(tid));
              // Smart: if lots of teams, label only R2 to keep it readable.
              return teamIds.length > 8
                ? teamIds.map(tid => `r2-${tid}`)
                : teamIds.flatMap(tid => [`r1-${tid}`, `r2-${tid}`]);
            })();

            const lastIndexBySeriesKey: Record<string, number> = {};
            if (isExpanded) {
              for (const k of labelSeriesKeys) {
                for (let i = sequenceVsQualityData.length - 1; i >= 0; i--) {
                  const row: any = (sequenceVsQualityData as any[])[i];
                  const yv = Number(row?.[k]);
                  if (Number.isFinite(yv)) {
                    lastIndexBySeriesKey[k] = i;
                    break;
                  }
                }
              }
            }

            // If multiple series end at the same y-value, offset their labels so they don't overlap.
            const labelYOffsetBySeriesKey: Record<string, number> = {};
            if (isExpanded) {
              const groups = new Map<string, string[]>();
              for (const k of labelSeriesKeys) {
                const idx = lastIndexBySeriesKey[k];
                if (idx == null) continue;
                const row: any = (sequenceVsQualityData as any[])[idx];
                const yv = Number(row?.[k]);
                if (!Number.isFinite(yv)) continue;
                // group with tolerance by rounding to 2 decimals
                const gk = String(Math.round(yv * 100) / 100);
                const arr = groups.get(gk) ?? [];
                arr.push(k);
                groups.set(gk, arr);
              }
              for (const arr of groups.values()) {
                if (arr.length <= 1) continue;
                const reachIndex = (seriesKey: string) => {
                  const lastIdx = lastIndexBySeriesKey[seriesKey];
                  if (lastIdx == null) return Number.POSITIVE_INFINITY;
                  const lastRow: any = (sequenceVsQualityData as any[])[lastIdx];
                  const finalY = Number(lastRow?.[seriesKey]);
                  if (!Number.isFinite(finalY)) return Number.POSITIVE_INFINITY;
                  for (let i = 0; i <= lastIdx; i++) {
                    const row: any = (sequenceVsQualityData as any[])[i];
                    const yv = Number(row?.[seriesKey]);
                    if (Number.isFinite(yv) && yv === finalY) return i;
                  }
                  return lastIdx;
                };
                arr.sort((a, b) => {
                  const ra = reachIndex(a);
                  const rb = reachIndex(b);
                  if (ra !== rb) return ra - rb;
                  return a.localeCompare(b);
                });
                const step = 14;
                const mid = (arr.length - 1) / 2;
                arr.forEach((k, i) => {
                  labelYOffsetBySeriesKey[k] = (i - mid) * step;
                });
              }
            }

            const makeEndLabel = (seriesKey: string, labelText: string, color: string) => (p: any) => {
              if (!isExpanded) return null;
              if (p?.seq !== lastIndexBySeriesKey[seriesKey]) return null;
              const x = Number(p?.x);
              const y = Number(p?.y);
              if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
              const isR1 = seriesKey.startsWith('r1-');
              const labelOpacity = sequenceTab === 'BOTH' && isR1 ? 0.45 : 1;
              const dyOffset = labelYOffsetBySeriesKey[seriesKey] ?? 0;
              return (
                <text
                  x={x - 6}
                  y={y + dyOffset}
                  dy={4}
                  textAnchor="end"
                  fontSize={12}
                  fontWeight={800}
                  fill="#111827"
                  opacity={labelOpacity}
                  paintOrder="stroke"
                  stroke="#ffffff"
                  strokeWidth={5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  pointerEvents="none"
                >
                  <tspan fill={color}>● </tspan>
                  <tspan fill="#111827">{labelText}</tspan>
                </text>
              );
            };
            const shouldShowEndLabel = (seriesKey: string) => labelSeriesKeys.includes(seriesKey);

            const computeSeriesPriority = (seriesKey: string) => {
              let lastIdx = -1;
              let finalY = -Infinity;
              for (let i = sequenceVsQualityData.length - 1; i >= 0; i--) {
                const row: any = (sequenceVsQualityData as any[])[i];
                const yv = Number(row?.[seriesKey]);
                if (Number.isFinite(yv)) {
                  finalY = yv;
                  lastIdx = i;
                  break;
                }
              }
              let reachIdx = lastIdx;
              if (Number.isFinite(finalY) && lastIdx >= 0) {
                for (let i = 0; i <= lastIdx; i++) {
                  const row: any = (sequenceVsQualityData as any[])[i];
                  const yv = Number(row?.[seriesKey]);
                  if (Number.isFinite(yv) && yv === finalY) {
                    reachIdx = i;
                    break;
                  }
                }
              }
              return { finalY, reachIdx };
            };
            const sortSeriesKeysForRender = (keys: string[]) => {
              const enriched = keys.map(k => ({ k, ...computeSeriesPriority(k) }));
              enriched.sort((a, b) => {
                if (a.finalY !== b.finalY) return a.finalY - b.finalY;
                if (a.reachIdx !== b.reachIdx) return b.reachIdx - a.reachIdx;
                return a.k.localeCompare(b.k);
              });
              return enriched.map(x => x.k);
            };

            return (
               <ResponsiveContainer width="100%" height="100%">
                 <LineChart data={sequenceVsQualityData} margin={{ top: 12, bottom: 20, left: 48, right: isExpanded ? 24 : 16 }}>
                   <CartesianGrid strokeDasharray="3 3" />
                   <XAxis dataKey="seq" label={{ value: 'Batch Sequence', position: 'insideBottom', offset: -10 }} />
                   <YAxis
                     width={44}
                    // Add headroom without changing the axis max label (keep max at 5).
                    domain={[0, 5]}
                     padding={{ top: 12, bottom: 6 }}
                     label={{ value: 'Avg Score', angle: -90, position: 'insideLeft', dx: -10 }}
                   />
                   <Tooltip
                     shared={false}
                     content={(props: any) => {
                       const active = Boolean(props?.active);
                       const payload = Array.isArray(props?.payload) ? props.payload : [];
                       if (!active || payload.length === 0) return null;

                       const hoveredKey = hoveredSequenceSeriesKey;
                       const p =
                         (hoveredKey
                           ? payload.find((it: any) => String(it?.dataKey ?? '') === hoveredKey)
                           : undefined) ??
                         payload[0] ??
                         {};

                       const rawKey = String(p.dataKey ?? '');
                       const isR1 = rawKey.startsWith('r1-');
                       const isR2 = rawKey.startsWith('r2-');
                       const teamId = isR1 || isR2 ? rawKey.slice(3) : rawKey;
                       const roundLabel = isR1 ? 'Round 1' : isR2 ? 'Round 2' : '';
                       const teamName = String(teamNames[teamId] ?? `Team ${teamId}`);
                       const quality = Number(p.value ?? NaN);
                       const label = Number(props?.label);

                       return (
                         <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg">
                           <div className="text-xs font-bold text-gray-500">
                             Batch {Number.isFinite(label) ? label : ''}
                           </div>
                           <div className="text-sm font-bold text-gray-900">{teamName}</div>
                           {roundLabel && <div className="text-xs font-bold text-gray-500">{roundLabel}</div>}
                           <div className="mt-1 text-sm text-gray-700">
                             <div className="flex justify-between gap-4">
                               <span className="font-medium">Avg Score</span>
                               <span className="font-mono font-bold text-indigo-700">
                                 {Number.isFinite(quality) ? quality.toFixed(1) : '—'}
                               </span>
                             </div>
                           </div>
                         </div>
                       );
                     }}
                   />
                   {sequenceTab === 'BOTH' ? (
                     <>
                       {sortSeriesKeysForRender(
                         teamIds.filter(tid => teamsWithSeqR1.has(String(tid))).map(tid => `r1-${tid}`)
                       ).map((seriesKey) => {
                         const teamId = seriesKey.slice(3);
                         const color = colorForTeamId(teamId);
                         return (
                         <Line
                           key={seriesKey}
                           type="monotone"
                           dataKey={seriesKey}
                           name={`${teamNames[teamId] || `Team ${teamId}`} (R1)`}
                           stroke={color}
                           strokeWidth={2}
                           strokeOpacity={0.25}
                           strokeDasharray="6 4"
                           connectNulls
                           dot={false}
                           isAnimationActive={!isExpanded}
                           activeDot={hoveredSequenceSeriesKey === seriesKey ? { r: 4 } : false}
                           label={
                             isExpanded && shouldShowEndLabel(seriesKey)
                               ? makeEndLabel(seriesKey, seriesDisplayName(seriesKey), color)
                               : false
                           }
                           onMouseEnter={() => setHoveredSequenceSeriesKey(seriesKey)}
                           onMouseLeave={() => setHoveredSequenceSeriesKey(null)}
                         />
                         );
                       })}
                       {sortSeriesKeysForRender(
                         teamIds.filter(tid => teamsWithSeqR2.has(String(tid))).map(tid => `r2-${tid}`)
                       ).map((seriesKey) => {
                         const teamId = seriesKey.slice(3);
                         const color = colorForTeamId(teamId);
                         return (
                         <Line
                           key={seriesKey}
                           type="monotone"
                           dataKey={seriesKey}
                           name={`${teamNames[teamId] || `Team ${teamId}`} (R2)`}
                           stroke={color}
                           strokeWidth={3}
                           strokeOpacity={1}
                           connectNulls
                           dot={false}
                           isAnimationActive={!isExpanded}
                           activeDot={hoveredSequenceSeriesKey === seriesKey ? { r: 4 } : false}
                           label={
                             isExpanded && shouldShowEndLabel(seriesKey)
                               ? makeEndLabel(seriesKey, seriesDisplayName(seriesKey), color)
                               : false
                           }
                           onMouseEnter={() => setHoveredSequenceSeriesKey(seriesKey)}
                           onMouseLeave={() => setHoveredSequenceSeriesKey(null)}
                         />
                         );
                       })}
                     </>
                   ) : (
                     <>
                   {sortSeriesKeysForRender(
                      (sequenceTab === 'R1'
                        ? teamIds.filter(tid => teamsWithSeqR1.has(String(tid)))
                        : sequenceTab === 'R2'
                          ? teamIds.filter(tid => teamsWithSeqR2.has(String(tid)))
                          : teamIds
                      ).map(tid => String(tid))
                    ).map((teamId) => {
                      const color = colorForTeamId(teamId);
                      return (
                      <Line 
                        key={teamId} 
                        type="monotone" 
                        dataKey={teamId} 
                        name={teamNames[teamId] || `Team ${teamId}`} 
                        stroke={color} 
                        strokeWidth={2}
                        connectNulls
                        dot={false}
                        isAnimationActive={!isExpanded}
                        activeDot={hoveredSequenceSeriesKey === String(teamId) ? { r: 4 } : false}
                        label={
                          isExpanded && shouldShowEndLabel(String(teamId))
                            ? makeEndLabel(String(teamId), seriesDisplayName(String(teamId)), color)
                            : false
                        }
                        onMouseEnter={() => setHoveredSequenceSeriesKey(String(teamId))}
                        onMouseLeave={() => setHoveredSequenceSeriesKey(null)}
                      />
                      );
                    })}
                     </>
                   )}
                 </LineChart>
               </ResponsiveContainer>
            );
        }
        case 'unrated_jokes': {
            const isExpanded = isExpandedView;
            const teamIds = unratedTeamIds;
            const eventsR1 = statsR1?.unrated_jokes_over_time ?? [];
            const eventsR2 = statsR2?.unrated_jokes_over_time ?? [];
            const fallbackEvents = (instructorStats?.unrated_jokes_over_time ?? []);
            const teamsWithUnratedR1 = new Set<string>(eventsR1.map((e: any) => String(e.team_id)));
            const teamsWithUnratedR2 = new Set<string>(eventsR2.map((e: any) => String(e.team_id)));
            // If per-round cache is empty, allow current-round fallback data to show up.
            if (teamsWithUnratedR1.size === 0 && config.round === 1 && fallbackEvents.length > 0) {
              fallbackEvents.forEach((e: any) => teamsWithUnratedR1.add(String(e.team_id)));
            }
            if (teamsWithUnratedR2.size === 0 && config.round === 2 && fallbackEvents.length > 0) {
              fallbackEvents.forEach((e: any) => teamsWithUnratedR2.add(String(e.team_id)));
            }
            if (teamsWithUnratedR1.size === 0 && teamsWithUnratedR2.size === 0) {
              return seriesUnavailable('The backend sends no queue-depth series.');
            }

            const seriesDisplayName = (rawKey: string) => {
              const isR1 = rawKey.startsWith('r1-');
              const isR2 = rawKey.startsWith('r2-');
              const teamId = isR1 || isR2 ? rawKey.slice(3) : rawKey;
              const baseRaw = String(teamNames[teamId] ?? `Team ${teamId}`);
              const base = baseRaw.length > 18 ? `${baseRaw.slice(0, 16)}…` : baseRaw;
              if (!isExpanded) return base;
              if (unratedTab === 'BOTH') return base;
              return base;
            };
            const colorForTeamId = (tid: string) => {
              const idx = visibleTeamIds.indexOf(String(tid));
              return PALETTE[(idx >= 0 ? idx : 0) % PALETTE.length];
            };
            const labelSeriesKeys = (() => {
              if (!isExpanded) return [] as string[];
              if (unratedTab !== 'BOTH') return teamIds.map(tid => String(tid));
              return teamIds.length > 8
                ? teamIds.map(tid => `r2-${tid}`)
                : teamIds.flatMap(tid => [`r1-${tid}`, `r2-${tid}`]);
            })();

            const lastIndexBySeriesKey: Record<string, number> = {};
            if (isExpanded) {
              for (const k of labelSeriesKeys) {
                for (let i = unratedJokesOverTimeData.length - 1; i >= 0; i--) {
                  const row: any = (unratedJokesOverTimeData as any[])[i];
                  const yv = Number(row?.[k]);
                  if (Number.isFinite(yv)) {
                    lastIndexBySeriesKey[k] = i;
                    break;
                  }
                }
              }
            }
            const labelYOffsetBySeriesKey: Record<string, number> = {};
            if (isExpanded) {
              const groups = new Map<string, string[]>();
              for (const k of labelSeriesKeys) {
                const idx = lastIndexBySeriesKey[k];
                if (idx == null) continue;
                const row: any = (unratedJokesOverTimeData as any[])[idx];
                const yv = Number(row?.[k]);
                if (!Number.isFinite(yv)) continue;
                const gk = String(Math.round(yv * 100) / 100);
                const arr = groups.get(gk) ?? [];
                arr.push(k);
                groups.set(gk, arr);
              }
              for (const arr of groups.values()) {
                if (arr.length <= 1) continue;
                const reachIndex = (seriesKey: string) => {
                  const lastIdx = lastIndexBySeriesKey[seriesKey];
                  if (lastIdx == null) return Number.POSITIVE_INFINITY;
                  const lastRow: any = (unratedJokesOverTimeData as any[])[lastIdx];
                  const finalY = Number(lastRow?.[seriesKey]);
                  if (!Number.isFinite(finalY)) return Number.POSITIVE_INFINITY;
                  for (let i = 0; i <= lastIdx; i++) {
                    const row: any = (unratedJokesOverTimeData as any[])[i];
                    const yv = Number(row?.[seriesKey]);
                    if (Number.isFinite(yv) && yv === finalY) return i;
                  }
                  return lastIdx;
                };
                arr.sort((a, b) => {
                  const ra = reachIndex(a);
                  const rb = reachIndex(b);
                  if (ra !== rb) return ra - rb;
                  return a.localeCompare(b);
                });
                const step = 14;
                const mid = (arr.length - 1) / 2;
                arr.forEach((k, i) => {
                  labelYOffsetBySeriesKey[k] = (i - mid) * step;
                });
              }
            }
            const makeEndLabel = (seriesKey: string, labelText: string, color: string) => (p: any) => {
              if (!isExpanded) return null;
              if (p?.index !== lastIndexBySeriesKey[seriesKey]) return null;
              const x = Number(p?.x);
              const y = Number(p?.y);
              if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
              const isR1 = seriesKey.startsWith('r1-');
              const labelOpacity = unratedTab === 'BOTH' && isR1 ? 0.45 : 1;
              const dyOffset = labelYOffsetBySeriesKey[seriesKey] ?? 0;
              return (
                <text
                  x={x - 6}
                  y={y + dyOffset}
                  dy={4}
                  textAnchor="end"
                  fontSize={12}
                  fontWeight={800}
                  fill="#111827"
                  opacity={labelOpacity}
                  paintOrder="stroke"
                  stroke="#ffffff"
                  strokeWidth={5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  pointerEvents="none"
                >
                  <tspan fill={color}>● </tspan>
                  <tspan fill="#111827">{labelText}</tspan>
                </text>
              );
            };
            const shouldShowEndLabel = (seriesKey: string) => labelSeriesKeys.includes(seriesKey);
            const computeSeriesPriority = (seriesKey: string) => {
              let lastIdx = -1;
              let finalY = -Infinity;
              for (let i = unratedJokesOverTimeData.length - 1; i >= 0; i--) {
                const row: any = (unratedJokesOverTimeData as any[])[i];
                const yv = Number(row?.[seriesKey]);
                if (Number.isFinite(yv)) {
                  finalY = yv;
                  lastIdx = i;
                  break;
                }
              }
              let reachIdx = lastIdx;
              if (Number.isFinite(finalY) && lastIdx >= 0) {
                for (let i = 0; i <= lastIdx; i++) {
                  const row: any = (unratedJokesOverTimeData as any[])[i];
                  const yv = Number(row?.[seriesKey]);
                  if (Number.isFinite(yv) && yv === finalY) {
                    reachIdx = i;
                    break;
                  }
                }
              }
              return { finalY, reachIdx };
            };
            const sortSeriesKeysForRender = (keys: string[]) => {
              const enriched = keys.map(k => ({ k, ...computeSeriesPriority(k) }));
              enriched.sort((a, b) => {
                if (a.finalY !== b.finalY) return a.finalY - b.finalY;
                if (a.reachIdx !== b.reachIdx) return b.reachIdx - a.reachIdx;
                return a.k.localeCompare(b.k);
              });
              return enriched.map(x => x.k);
            };

            return (
               <ResponsiveContainer width="100%" height="100%">
                 <LineChart data={unratedJokesOverTimeData} margin={{ top: 12, bottom: 20, left: 48, right: isExpanded ? 24 : 16 }}>
                   <CartesianGrid strokeDasharray="3 3" />
                   <XAxis dataKey="index" label={{ value: 'Time Elapsed', position: 'insideBottom', offset: -10 }} />
                   <YAxis
                     width={44}
                     allowDecimals={false}
                     domain={[
                       0,
                       (dataMax: number) => {
                         const m = Number.isFinite(dataMax) ? dataMax : 0;
                         return Math.max(1, Math.ceil(m * 1.1));
                       },
                     ]}
                     padding={{ top: 10, bottom: 4 }}
                     label={{ value: 'Unrated Jokes', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' }, dx: -10, dy: 20 }}
                   />
                   <Tooltip
                     shared={false}
                     content={(props: any) => {
                       const active = Boolean(props?.active);
                       const payload = Array.isArray(props?.payload) ? props.payload : [];
                       if (!active || payload.length === 0) return null;
                       const hoveredKey = hoveredUnratedSeriesKey;
                       const p =
                         (hoveredKey
                           ? payload.find((it: any) => String(it?.dataKey ?? '') === hoveredKey)
                           : undefined) ??
                         payload[0] ??
                         {};
                       const rawKey = String(p.dataKey ?? '');
                       const isR1 = rawKey.startsWith('r1-');
                       const isR2 = rawKey.startsWith('r2-');
                       const teamId = isR1 || isR2 ? rawKey.slice(3) : rawKey;
                       const roundLabel = isR1 ? 'Round 1' : isR2 ? 'Round 2' : '';
                       const teamName = String(teamNames[teamId] ?? `Team ${teamId}`);
                       const queueCount = Number(p.value ?? 0);
                       const label = Number(props?.label);
                       return (
                         <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg">
                           <div className="text-xs font-bold text-gray-500">Batch {Number.isFinite(label) ? label : ''}</div>
                           <div className="text-sm font-bold text-gray-900">{teamName}</div>
                           {roundLabel && <div className="text-xs font-bold text-gray-500">{roundLabel}</div>}
                           <div className="mt-1 text-sm text-gray-700">
                             <div className="flex justify-between gap-4">
                               <span className="font-medium">Unrated</span>
                               <span className="font-mono font-bold text-indigo-700">{Number.isFinite(queueCount) ? queueCount : 0}</span>
                             </div>
                           </div>
                         </div>
                       );
                     }}
                   />
                   {unratedTab === 'BOTH' ? (
                     <>
                       {sortSeriesKeysForRender(
                         visibleTeamIds.filter(tid => teamsWithUnratedR1.has(String(tid))).map(tid => `r1-${tid}`)
                       ).map((seriesKey) => {
                         const teamId = seriesKey.slice(3);
                         const color = colorForTeamId(teamId);
                         return (
                         <Line
                           key={seriesKey}
                           type="monotone"
                           dataKey={seriesKey}
                           name={`${teamNames[teamId] || `Team ${teamId}`} (R1)`}
                           stroke={color}
                           strokeWidth={2}
                           strokeOpacity={0.25}
                           strokeDasharray="6 4"
                           dot={false}
                           isAnimationActive={!isExpanded}
                           activeDot={hoveredUnratedSeriesKey === seriesKey ? { r: 4 } : false}
                           label={
                             isExpanded && shouldShowEndLabel(seriesKey)
                               ? makeEndLabel(seriesKey, seriesDisplayName(seriesKey), color)
                               : false
                           }
                           onMouseEnter={() => setHoveredUnratedSeriesKey(seriesKey)}
                           onMouseLeave={() => setHoveredUnratedSeriesKey(null)}
                         />
                         );
                       })}
                       {sortSeriesKeysForRender(
                         visibleTeamIds.filter(tid => teamsWithUnratedR2.has(String(tid))).map(tid => `r2-${tid}`)
                       ).map((seriesKey) => {
                         const teamId = seriesKey.slice(3);
                         const color = colorForTeamId(teamId);
                         return (
                         <Line
                           key={seriesKey}
                           type="monotone"
                           dataKey={seriesKey}
                           name={`${teamNames[teamId] || `Team ${teamId}`} (R2)`}
                           stroke={color}
                           strokeWidth={3}
                           strokeOpacity={1}
                           dot={false}
                           isAnimationActive={!isExpanded}
                           activeDot={hoveredUnratedSeriesKey === seriesKey ? { r: 4 } : false}
                           label={
                             isExpanded && shouldShowEndLabel(seriesKey)
                               ? makeEndLabel(seriesKey, seriesDisplayName(seriesKey), color)
                               : false
                           }
                           onMouseEnter={() => setHoveredUnratedSeriesKey(seriesKey)}
                           onMouseLeave={() => setHoveredUnratedSeriesKey(null)}
                         />
                         );
                       })}
                     </>
                   ) : (
                     <>
                   {sortSeriesKeysForRender(
                      (unratedTab === 'R1'
                        ? teamIds.filter(tid => teamsWithUnratedR1.has(String(tid)))
                        : unratedTab === 'R2'
                          ? teamIds.filter(tid => teamsWithUnratedR2.has(String(tid)))
                          : teamIds
                      ).map(tid => String(tid))
                    ).map((teamId) => {
                      const color = colorForTeamId(teamId);
                      return (
                      <Line
                        key={teamId}
                        type="monotone"
                        dataKey={teamId}
                        name={teamNames[teamId] || `Team ${teamId}`}
                        stroke={color}
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={!isExpanded}
                        activeDot={hoveredUnratedSeriesKey === String(teamId) ? { r: 4 } : false}
                        label={
                          isExpanded && shouldShowEndLabel(String(teamId))
                            ? makeEndLabel(String(teamId), seriesDisplayName(String(teamId)), color)
                            : false
                        }
                        onMouseEnter={() => setHoveredUnratedSeriesKey(String(teamId))}
                        onMouseLeave={() => setHoveredUnratedSeriesKey(null)}
                      />
                      );
                    })}
                     </>
                   )}
                 </LineChart>
               </ResponsiveContainer>
            );
        }
        default: return null;
    }
  };


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
                  setLeanChartsRound(1);
                  setLeaderboardSortKey('profit');
                  setLeaderboardSortDir('desc');
                  setRankUpTeamIds([]);
                  prevLeaderboardPosRef.current = null;
                  (Object.values(rankUpTimersRef.current) as number[]).forEach(t => window.clearTimeout(t));
                  rankUpTimersRef.current = {};

                  // Reset local chart series derived from leaderboard changes.
                  setLocalSalesOverTime([]);
                  lastSalesTotalsRef.current = null;
                  salesEventIndexRef.current = 0;
                  setExpandedChart(null);
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

        {/* Expanded Chart Modal */}
        <Modal 
            isOpen={!!expandedChart} 
            onClose={() => setExpandedChart(null)} 
            title={
              expandedChart === 'leaderboard'
                ? 'Leaderboard'
                : expandedChart === 'sales'
                  ? 'Cumulative Sales Over Time'
                  : expandedChart === 'sequence_quality'
                    ? 'Batch Sequence vs Quality'
                    : expandedChart === 'unrated_jokes'
                      ? 'Unrated Jokes Over Time'
                      : 'Expanded'
            }
            maxWidth="max-w-[90vw]"
        >
            {expandedChart === 'leaderboard' ? (
              <div className="h-[75vh] w-full flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center rounded-md border border-gray-200 bg-white p-0.5">
                      {[1, 2].map(r => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setViewRound(r as 1 | 2)}
                          disabled={r === 2 && !round2Started}
                          className={`px-3 py-1.5 rounded text-sm font-bold ${
                            viewRound === r ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
                          }`}
                          title={r === 1 ? 'Round 1 leaderboard' : 'Round 2 leaderboard'}
                        >
                          {r === 1 ? 'Round 1' : 'Round 2'}
                        </button>
                      ))}
                    </div>
                  <div className="flex items-center space-x-2 bg-slate-100 px-4 py-2 rounded-lg text-slate-700 font-mono text-xl">
                    <Clock size={20} />
                    <span>{formatTime(config.elapsedTime)}</span>
                  </div>
                </div>
                {renderLeaderboardTable({ maxHeightClass: 'max-h-[65vh]', isExpanded: true })}
              </div>
            ) : (
            <div className="h-[75vh] w-full flex flex-col">
              {(expandedChart === 'sales' || expandedChart === 'sequence_quality' || expandedChart === 'unrated_jokes') && (
                <div className="mb-3 flex justify-end items-center gap-4 pr-6">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Team Filter:</span>
                    <select
                      value={
                        expandedChart === 'sales'
                          ? salesTeamFilter
                          : expandedChart === 'sequence_quality'
                            ? sequenceTeamFilter
                            : unratedTeamFilter
                      }
                      onChange={(e) => {
                        if (expandedChart === 'sales') setSalesTeamFilter(e.target.value);
                        else if (expandedChart === 'sequence_quality') setSequenceTeamFilter(e.target.value);
                        else setUnratedTeamFilter(e.target.value);
                      }}
                      className="rounded border border-gray-200 bg-white px-2 py-1 text-xs font-bold text-gray-700 hover:border-gray-300 focus:outline-none"
                    >
                      <option value="ALL">All Teams</option>
                      {visibleTeamIds.map(tid => (
                        <option key={tid} value={tid}>{teamNames[tid] || `Team ${tid}`}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center rounded-md border border-gray-200 bg-white p-0.5">
                    {(['R1', 'R2', 'BOTH'] as const).map(k => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => {
                          if (expandedChart === 'sales') setSalesTab(k);
                          else if (expandedChart === 'sequence_quality') setSequenceTab(k);
                          else setUnratedTab(k);
                        }}
                        className={`px-3 py-1.5 rounded text-sm font-bold ${
                          (expandedChart === 'sales'
                            ? salesTab
                            : expandedChart === 'sequence_quality'
                              ? sequenceTab
                              : unratedTab
                          ) === k
                            ? 'bg-gray-900 text-white shadow-sm'
                            : 'text-gray-600 hover:bg-gray-100'
                        }`}
                        title={k === 'BOTH' ? 'Compare both rounds' : (k === 'R1' ? 'Round 1' : 'Round 2')}
                      >
                        {k === 'R1' ? 'Round 1' : k === 'R2' ? 'Round 2' : 'Compare Rounds'}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex-1">
                {expandedChart && renderChart(expandedChart, { isExpanded: true })}
              </div>
            </div>
            )}
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
            nor repeats a fetch; only LeanChartsPanel's own team picker starts over. */}
        <div role="tabpanel" id="instructor-tabpanel" aria-labelledby={`instructor-tab-${tab}`} className="space-y-8">
          {tab === 'live' && (
            <LiveTab
              viewRound={viewRound} setViewRound={setViewRound} round2Started={round2Started}
              setExpandedChart={setExpandedChart} renderLeaderboardTable={renderLeaderboardTable} renderChart={renderChart}
              hiddenCharts={hiddenCharts} restoreAllCharts={restoreAllCharts} isChartHidden={isChartHidden} hideChart={hideChart}
              showLeanCharts={showLeanCharts} leanChartsRound={leanChartsRound} leanRounds={leanRounds}
              leanChartsR1={leanChartsR1} leanChartsR2={leanChartsR2} visibleTeamIds={visibleTeamIds}
              salesTab={salesTab} setSalesTab={setSalesTab} salesTeamFilter={salesTeamFilter} setSalesTeamFilter={setSalesTeamFilter}
              sequenceTab={sequenceTab} setSequenceTab={setSequenceTab}
              sequenceTeamFilter={sequenceTeamFilter} setSequenceTeamFilter={setSequenceTeamFilter}
              unratedTab={unratedTab} setUnratedTab={setUnratedTab}
              unratedTeamFilter={unratedTeamFilter} setUnratedTeamFilter={setUnratedTeamFilter}
              wasteChartMode={wasteChartMode} setWasteChartMode={setWasteChartMode} wasteChartData={wasteChartData}
              scatterRoundMode={scatterRoundMode} setScatterRoundMode={setScatterRoundMode}
              scatterXMetric={scatterXMetric} setScatterXMetric={setScatterXMetric}
              scatterYMode={scatterYMode} setScatterYMode={setScatterYMode}
              scatterYMetric={scatterYMetric} setScatterYMetric={setScatterYMetric}
              scatterNumerator={scatterNumerator} setScatterNumerator={setScatterNumerator}
              scatterDenominator={scatterDenominator} setScatterDenominator={setScatterDenominator}
              scatterBaseMetrics={scatterBaseMetrics} scatterMetrics={scatterMetrics} scatterData={scatterData}
              metricLabel={metricLabel} yAxisLabel={yAxisLabel} isRatioYAxis={isRatioYAxis}
              isXMetricInteger={isXMetricInteger} isYMetricInteger={isYMetricInteger} formatScatterValue={formatScatterValue}
              renderScatterDot={renderScatterDot} renderScatterLabel={renderScatterLabel}
              marketSortKey={marketSortKey} setMarketSortKey={setMarketSortKey}
              marketSortDir={marketSortDir} setMarketSortDir={setMarketSortDir}
              marketPage={marketPage} setMarketPage={setMarketPage}
              expandedMarketJokeIds={expandedMarketJokeIds} setExpandedMarketJokeIds={setExpandedMarketJokeIds}
            />
          )}
          {tab === 'teams' && (
            <TeamsTab
              connectedPairs={connectedPairs} assignableCount={assignableCount} handleFormTeams={handleFormTeams}
              visibleTeamIds={visibleTeamIds} rosterByTeam={rosterByTeam} deletingUserIds={deletingUserIds}
              handleDeleteUser={handleDeleteUser} handleDragStart={handleDragStart} handleDragOver={handleDragOver}
              handleDrop={handleDrop} toggleUserRole={toggleUserRole}
            />
          )}
          {tab === 'setup' && (
            <SetupTab
              localNudge1={localNudge1} setLocalNudge1={setLocalNudge1} localNudge2={localNudge2} setLocalNudge2={setLocalNudge2}
              localBudget={localBudget} setLocalBudget={setLocalBudget}
              localMarketPrice={localMarketPrice} setLocalMarketPrice={setLocalMarketPrice}
              localCostOfPublishing={localCostOfPublishing} setLocalCostOfPublishing={setLocalCostOfPublishing}
              localFees={localFees} setLocalFees={setLocalFees}
              canEditNudges={canEditNudges} canEditBudget={canEditBudget} canEditPricing={canEditPricing} canEditLean={canEditLean}
              LEAN_LOCK_HINT={LEAN_LOCK_HINT} canApply={canApply} hasPendingConfigChanges={hasPendingConfigChanges}
              feeNotice={feeNotice} handleUpdateSettings={handleUpdateSettings} setShowResetConfirm={setShowResetConfirm}
            />
          )}
          {tab === 'debrief' && <DebriefTab statsR1={statsR1} statsR2={statsR2} />}
        </div>
      </div>

    </RoleLayout>
  );
};

export default Instructor;