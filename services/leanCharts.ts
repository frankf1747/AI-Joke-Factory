/**
 * Lean charts — pure transforms from GET .../lean-charts (types/api.ts
 * LeanChartsResponse) to the rows the four recharts cards draw. The components
 * in components/leanCharts only render; every rule is here and in
 * services/leanCharts.test.ts.
 */
import type { LeanChartsClassAverage, LeanChartsResponse, LeanChartsTeam } from '../types/api';

/** Same meaning, same colour, everywhere (design_handoff_joke_factory_ui/colors_and_type.css.txt). */
export const LEAN_CHART_COLORS = {
  setup: '#2563eb',        // --production: shipping (each batch the Joke Maker sends)
  waiting: '#7c3aed',      // --marketing: storage (waiting on Marketing's desk)
  shelf: '#d97706',        // --market: hosting (unsold on the shelf)
  neverSold: '#e11d48',    // --waste: published, never sold
  discarded: '#94a3b8',    // --fg4: discarded
  round1: '#3B82F6',       // Round 1, as on the Wasted Jokes chart
  round2: '#F97316',       // Round 2, as on the Wasted Jokes chart
  classAverage: '#64748b', // --fg3, always drawn dashed
} as const;

export const LEAN_CHARTS_POLL_MS = 10_000;
export const LEAN_CHARTS_FAILURE_LIMIT = 3;
/** The backend refuses lean charts of a CLASSIC round: 409 CONFLICT with this in the message. */
export const NOT_LEAN_ROUND_MESSAGE = 'NOT_LEAN_ROUND';
export const LEAN_CHARTS_UNAVAILABLE_TEXT = 'Chart data unavailable — retrying';
export const NO_BATCHES_TEXT = 'No batches sent yet';
export const NO_RELEASES_TEXT = 'No jokes released yet';

/** True for the backend's 409 refusal of lean charts for a CLASSIC round. */
export function isNotLeanRound(e: unknown): boolean {
  const err = e as { status?: unknown; message?: unknown } | null;
  return Boolean(err) && err!.status === 409 && String(err!.message ?? '').includes(NOT_LEAN_ROUND_MESSAGE);
}

export function roundColor(round: 1 | 2): string {
  return round === 2 ? LEAN_CHART_COLORS.round2 : LEAN_CHART_COLORS.round1;
}

/** The instructor's rename (kept in the browser, keyed by team id) wins, as on the leaderboard. */
export function teamLabel(teamId: number, fallback: string, teamNames: Record<string, string> = {}): string {
  return teamNames[String(teamId)] || fallback || `Team ${teamId}`;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** "45 s" under a minute, "1.6 min" from a minute on. */
export function fmtMinutes(minutes: number): string {
  if (minutes < 1) return `${Math.round(minutes * 60)} s`;
  return `${minutes.toFixed(1)} min`;
}

/** Axis ticks: whole minutes as "3", fractions (12-second samples) as "0.2". */
export function fmtMinuteTick(minute: number): string {
  return Number.isInteger(minute) ? String(minute) : minute.toFixed(1);
}

/**
 * Minute-axis ticks: half minutes under three minutes, otherwise whole minutes
 * with the smallest step of 1, 2, 3, 5, 10, 15, 20, 30, 60 … that keeps at most
 * eight ticks. Starts at 0 and ends at the first tick at or after `maxMinutes`.
 */
export function minuteTicks(maxMinutes: number): number[] {
  const max = Number.isFinite(maxMinutes) ? Math.max(0, maxMinutes) : 0;
  let step: number;
  if (max < 3) {
    step = 0.5;
  } else {
    const fits = (s: number) => Math.ceil(max / s) + 1 <= 8;
    step = [1, 2, 3, 5, 10, 15, 20, 30, 60].find(fits) ?? Math.ceil(max / 7 / 60) * 60;
  }
  const n = Math.ceil(max / step - 1e-9);
  return Array.from({ length: n + 1 }, (_, i) => i * step);
}

/* ---- Which rounds are Lean ------------------------------------------------ */

type StatsRows = ReadonlyArray<{ lean?: unknown }> | null | undefined;

/**
 * The leaderboard's rule: a round is Lean when its stats rows carry `lean`.
 * Before any rows arrive, the current round falls back to its config.
 */
export function leanRoundFlags(
  r1Rows: StatsRows,
  r2Rows: StatsRows,
  currentRound: 1 | 2,
  currentMarketMode: string,
): { 1: boolean; 2: boolean } {
  const flag = (rows: StatsRows, n: 1 | 2) =>
    rows && rows.length > 0 ? rows.some(r => r.lean != null) : n === currentRound && currentMarketMode === 'LEAN';
  return { 1: flag(r1Rows, 1), 2: flag(r2Rows, 2) };
}

/** The round the instructor's lean-charts control may sit on. A pick stays only
 *  while both it and the live round are Lean, and a pick that is not Lean falls
 *  back to the live round. When the live round is Classic and running, the
 *  Classic cards must show. While a Classic live round has not started yet the
 *  instructor is between rounds (the debrief): a Lean round stays on screen. */
export function resolveLeanChartsRound(
  selected: 1 | 2,
  flags: { 1: boolean; 2: boolean },
  currentRound: 1 | 2,
  currentStarted: boolean,
): 1 | 2 {
  if (!flags[currentRound]) {
    if (currentStarted) return currentRound;
    if (flags[selected]) return selected;
    const other: 1 | 2 = currentRound === 1 ? 2 : 1;
    return flags[other] ? other : currentRound;
  }
  return flags[selected] ? selected : currentRound;
}

/** Whether the instructor's lean panel renders, and whether each round is fetched. */
export function leanChartsVisibility(
  round: 1 | 2,
  flags: { 1: boolean; 2: boolean },
  notLean: { 1: boolean; 2: boolean },
): boolean {
  return flags[round] && !notLean[round];
}

/** The instructor's team picker: every team in either round, by id. */
export function teamOptions(
  r1: LeanChartsResponse | null,
  r2: LeanChartsResponse | null,
  teamNames: Record<string, string> = {},
): Array<{ id: number; name: string }> {
  const byId = new Map<number, string>();
  for (const res of [r1, r2]) {
    for (const t of res?.teams ?? []) {
      if (!byId.has(t.team_id)) byId.set(t.team_id, teamLabel(t.team_id, t.team_name, teamNames));
    }
  }
  return [...byId.entries()].sort((a, b) => a[0] - b[0]).map(([id, name]) => ({ id, name }));
}

/* ---- Chart 1: Where the money leaked -------------------------------------- */

export interface WasteBarRow {
  teamId: number;
  team: string;
  setup: number;
  waiting: number;
  shelf: number;
  neverSold: number;
  discarded: number;
  total: number;
}

export type WasteSegmentKey = 'setup' | 'waiting' | 'shelf' | 'neverSold' | 'discarded';

/** Bar segments in stacking order, left to right. The keys are the backend's
    waste keys (setup = shipping, waiting = storage, shelf = hosting); the
    labels are the fee names students see. */
export const WASTE_SEGMENTS: ReadonlyArray<{ key: WasteSegmentKey; label: string; color: string }> = [
  { key: 'setup', label: 'Shipping', color: LEAN_CHART_COLORS.setup },
  { key: 'waiting', label: "Storage (waiting on Marketing's desk)", color: LEAN_CHART_COLORS.waiting },
  { key: 'shelf', label: 'Hosting (unsold on the shelf)', color: LEAN_CHART_COLORS.shelf },
  { key: 'neverSold', label: 'Listing fees on never-sold jokes', color: LEAN_CHART_COLORS.neverSold },
  { key: 'discarded', label: 'Discards', color: LEAN_CHART_COLORS.discarded },
];

/** One bar per team, most waste first (ties: lowest team id first). */
export function wasteBars(res: LeanChartsResponse | null, teamNames: Record<string, string> = {}): WasteBarRow[] {
  return (res?.teams ?? [])
    .map(t => ({
      teamId: t.team_id,
      team: teamLabel(t.team_id, t.team_name, teamNames),
      setup: t.waste.setup,
      waiting: t.waste.waiting,
      shelf: t.waste.shelf,
      neverSold: t.waste.never_sold,
      discarded: t.waste.discarded,
      total: t.waste.total,
    }))
    .sort((a, b) => b.total - a.total || a.teamId - b.teamId);
}

export function hasWaste(rows: ReadonlyArray<WasteBarRow>): boolean {
  return rows.some(r => r.total > 0);
}

/* ---- Chart 2: Jokes standing still ---------------------------------------- */

export interface IdleRow {
  minute: number;
  waiting: number;
  shelf: number;
  /** Class-average idle jokes (waiting + shelf), drawn dashed. */
  classAverage: number;
}

export function idleRows(team: LeanChartsTeam | null, avg: LeanChartsClassAverage | null): IdleRow[] {
  const samples = avg?.idle ?? team?.idle ?? [];
  return samples.map((s, k) => {
    const mine = team?.idle[k];
    const a = avg?.idle[k];
    return {
      minute: s.t / 60,
      waiting: mine?.waiting ?? 0,
      shelf: mine?.shelf ?? 0,
      classAverage: a ? a.waiting + a.shelf : 0,
    };
  });
}

export function hasIdle(rows: ReadonlyArray<IdleRow>): boolean {
  return rows.some(r => r.waiting + r.shelf + r.classAverage > 0);
}

/** The instructor's default team for chart 2: most idle jokes at the latest sample (ties: lowest id). */
export function defaultIdleTeamId(res: LeanChartsResponse | null): number | null {
  let best: { id: number; idle: number } | null = null;
  for (const t of res?.teams ?? []) {
    const last = t.idle[t.idle.length - 1];
    const idle = last ? last.waiting + last.shelf : 0;
    if (!best || idle > best.idle || (idle === best.idle && t.team_id < best.id)) best = { id: t.team_id, idle };
  }
  return best?.id ?? null;
}

/** The limit counts batches and the chart counts jokes, so the limit is stated, not drawn. */
export function idleSubtitle(wipLimit: number): string {
  const base = 'Jokes waiting for Marketing or unsold on the shelf. A growing pile is waste.';
  return wipLimit > 0 ? `${base} WIP limit: ${wipLimit} batch${wipLimit === 1 ? '' : 'es'}` : base;
}

/* ---- Chart 3: Smaller batches, faster feedback ---------------------------- */

export interface BatchScatterPoint {
  key: string;
  teamId: number;
  team: string;
  round: 1 | 2;
  seq: number;
  jokes: number;
  published: number;
  sold: number;
  /** Minutes from sending to the first sale; null while unsold. */
  minutes: number | null;
  noSale: boolean;
  /** Plot position: batch size jittered sideways; minutes, or the "no sale yet" band. */
  x: number;
  y: number;
}

export interface BatchScatter {
  r1: BatchScatterPoint[];
  r2: BatchScatterPoint[];
  xMax: number;
  yMax: number;
  yTicks: number[];
  bandFrom: number;
  bandTo: number;
}

/** 0..max in whole steps: by one up to 5, then by ceil(max / 5). */
export function integerTicks(max: number): number[] {
  const step = max <= 5 ? 1 : Math.ceil(max / 5);
  const out: number[] = [];
  for (let v = 0; v <= max; v += step) out.push(v);
  return out;
}

export function batchScatter(
  sources: { 1: LeanChartsResponse | null; 2: LeanChartsResponse | null },
  teamFilter: number | null,
  teamNames: Record<string, string> = {},
): BatchScatter {
  type Raw = Omit<BatchScatterPoint, 'x' | 'y'>;
  const raw: Raw[] = [];
  for (const round of [1, 2] as const) {
    for (const t of sources[round]?.teams ?? []) {
      if (teamFilter != null && t.team_id !== teamFilter) continue;
      for (const b of t.batches) {
        raw.push({
          key: `${round}-${t.team_id}-${b.seq}`,
          teamId: t.team_id,
          team: teamLabel(t.team_id, t.team_name, teamNames),
          round,
          seq: b.seq,
          jokes: b.jokes,
          published: b.published,
          sold: b.sold,
          minutes: b.first_sale_s == null ? null : b.first_sale_s / 60,
          noSale: b.first_sale_s == null,
        });
      }
    }
  }
  const yMax = Math.max(1, Math.ceil(Math.max(0, ...raw.map(p => p.minutes ?? 0))));
  const bandFrom = yMax * 1.08;
  const bandTo = yMax * 1.3;
  const bandY = (bandFrom + bandTo) / 2;
  const xMax = Math.max(5, ...raw.map(p => p.jokes));

  // Points with the same batch size spread evenly over ±0.3 so they do not stack.
  const groups = new Map<number, Raw[]>();
  for (const p of raw) groups.set(p.jokes, [...(groups.get(p.jokes) ?? []), p]);
  const points: BatchScatterPoint[] = [];
  for (const group of groups.values()) {
    group.sort((a, b) => a.round - b.round || a.teamId - b.teamId || a.seq - b.seq);
    group.forEach((p, i) => {
      const offset = group.length <= 1 ? 0 : -0.3 + (0.6 * i) / (group.length - 1);
      points.push({ ...p, x: p.jokes + offset, y: p.minutes ?? bandY });
    });
  }
  return {
    r1: points.filter(p => p.round === 1),
    r2: points.filter(p => p.round === 2),
    xMax,
    yMax,
    yTicks: integerTicks(yMax),
    bandFrom,
    bandTo,
  };
}

/* ---- Chart 4: More cycles, more learning ---------------------------------- */

export interface CyclesPoint {
  minute: number;
  /** Sell-through, 0..1. */
  rate: number;
  label: string;
  /** Sent too recently to judge: drawn hollow and left out of the line. */
  pending: boolean;
}

export const TOO_RECENT_TEXT = 'Too recent to judge — still selling';
export const TOO_RECENT_LEGEND = 'Too recent to judge (hollow)';
export const TOO_RECENT_CAPTION = 'Hollow dots: sent too late to judge yet.';

/** Seconds elapsed (started_at → clock_end) and the sample step, from a response. */
export interface LeanJudgeTiming {
  elapsed: number;
  sample: number;
}

/** The response's own clock; null when the round has not started. */
export function leanJudgeTiming(res: LeanChartsResponse | null | undefined): LeanJudgeTiming | null {
  if (!res?.started_at) return null;
  const elapsed = (Date.parse(res.clock_end) - Date.parse(res.started_at)) / 1000;
  if (!Number.isFinite(elapsed) || !(res.sample_seconds > 0)) return null;
  return { elapsed, sample: res.sample_seconds };
}

/**
 * Customers arrive within about 15 samples (the arrival window), so a batch
 * sent less than two samples ago, or in the last sample of the window or after
 * it, has not had a fair chance to sell: its sell-through is not judged yet.
 */
export function isTooRecentToJudge(sentS: number, timing: LeanJudgeTiming | null | undefined): boolean {
  if (!timing) return false;
  const window = 15 * timing.sample;
  return timing.elapsed - sentS < 2 * timing.sample || sentS >= window - timing.sample;
}

export interface CyclesSeries {
  key: string;
  name: string;
  color: string;
  /** Marker shape: Round 1 circle, Round 2 triangle. */
  round: 1 | 2;
  dashed: boolean;
  markers: boolean;
  faded: boolean;
  points: CyclesPoint[];
}

export interface CyclesModel {
  series: CyclesSeries[];
  /** Set when there is nothing to plot. */
  emptyText: string | null;
}

/** One point per batch at the minute it was sent; batches with nothing published
 *  are skipped, and batches too recent to judge are marked pending. */
export function batchSellThrough(
  team: LeanChartsTeam | null | undefined,
  timing: LeanJudgeTiming | null = null,
): CyclesPoint[] {
  return [...(team?.batches ?? [])]
    .filter(b => b.published > 0)
    .sort((a, b) => a.seq - b.seq)
    .map(b => ({
      minute: b.sent_s / 60,
      rate: clamp01(b.sold / b.published),
      label: `Batch ${b.seq}: ${b.sold} of ${b.published} sold`,
      pending: isTooRecentToJudge(b.sent_s, timing),
    }));
}

/** The class's pooled sell-through per sample; samples with nothing published
 *  are dropped, and so are samples too recent to judge (bucket start at or after
 *  min(elapsed − 2 samples, window − 1 sample)). */
export function classSellThrough(
  avg: LeanChartsClassAverage | null | undefined,
  timing: LeanJudgeTiming | null = null,
): CyclesPoint[] {
  const cut = timing ? Math.min(timing.elapsed - 2 * timing.sample, 15 * timing.sample - timing.sample) : Infinity;
  return (avg?.sell_through ?? []).flatMap(s =>
    s.value == null || s.t >= cut
      ? []
      : [{
          minute: s.t / 60,
          rate: clamp01(s.value),
          label: `Class: ${Math.round(clamp01(s.value) * 100)}% sold`,
          pending: false,
        }],
  );
}

function cyclesEmptyText(series: ReadonlyArray<CyclesSeries>, teams: ReadonlyArray<LeanChartsTeam>): string | null {
  if (series.some(s => s.points.length > 0)) return null;
  return teams.some(t => t.batches.length > 0) ? NO_RELEASES_TEXT : NO_BATCHES_TEXT;
}

/** Instructor: the class line per round, or one picked team's batches per round. */
export function cyclesForInstructor(
  r1: LeanChartsResponse | null,
  r2: LeanChartsResponse | null,
  teamFilter: number | null,
  teamNames: Record<string, string> = {},
): CyclesModel {
  const series: CyclesSeries[] = [];
  const teams: LeanChartsTeam[] = [];
  for (const [round, res] of [[1, r1], [2, r2]] as const) {
    if (!res) continue;
    if (teamFilter == null) {
      teams.push(...res.teams);
      series.push({
        key: `r${round}-class`, name: `Round ${round} · class`, color: roundColor(round), round,
        dashed: false, markers: true, faded: false, points: classSellThrough(res.class_average, leanJudgeTiming(res)),
      });
    } else {
      const team = res.teams.find(t => t.team_id === teamFilter) ?? null;
      if (team) teams.push(team);
      series.push({
        key: `r${round}-team`,
        name: `Round ${round} · ${team ? teamLabel(team.team_id, team.team_name, teamNames) : `Team ${teamFilter}`}`,
        color: roundColor(round), round, dashed: false, markers: true, faded: false,
        points: batchSellThrough(team, leanJudgeTiming(res)),
      });
    }
  }
  return { series, emptyText: cyclesEmptyText(series, teams) };
}
