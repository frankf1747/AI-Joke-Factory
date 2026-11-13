/* The measures Compare puts side by side, computed from a run record's raw facts
   (docs/superpowers/specs/2026-11-12-experiment-records-design.md). Pure: no DOM, no I/O.
   A measure that cannot be computed is null, never NaN or Infinity. */
import { fmtMinSec } from '../format';
import { formatProfit } from '../scoreboard';
import type { RunRecord, RunRound, RunTeam } from './types';

export type MeasureId =
  | 'mean_profit' | 'median_profit' | 'teams_in_profit' | 'fees_total' | 'fees_pct_revenue' | 'listing' | 'hosting'
  | 'sold' | 'released' | 'sold_share' | 'never_sold'
  | 'batches_per_team' | 'mean_batch_size' | 'sent_to_released_s' | 'send_to_first_sale_s' | 'first_sale_in_round_s'
  | 'profit_change' | 'teams_improved' | 'sold_share_change'
  | 'fit_gain';
export type MeasureScope = 'round' | 'change' | 'bots';
export type MeasureUnit = 'money' | 'percent' | 'points' | 'count' | 'seconds' | 'number';
export interface MeasureDef {
  id: MeasureId;
  group: 'Money' | 'Sales' | 'Flow' | 'Round 1 → 2' | 'Bots only';
  label: string;
  unit: MeasureUnit;
  better: 'higher' | 'lower';
  scope: MeasureScope;
}

export const MEASURES: readonly MeasureDef[] = [
  { id: 'mean_profit', group: 'Money', label: 'Mean profit per team', unit: 'money', better: 'higher', scope: 'round' },
  { id: 'median_profit', group: 'Money', label: 'Median profit', unit: 'money', better: 'higher', scope: 'round' },
  { id: 'teams_in_profit', group: 'Money', label: 'Teams in profit', unit: 'percent', better: 'higher', scope: 'round' },
  { id: 'fees_total', group: 'Money', label: 'Total fees', unit: 'money', better: 'lower', scope: 'round' },
  { id: 'fees_pct_revenue', group: 'Money', label: 'Fees as % of revenue', unit: 'percent', better: 'lower', scope: 'round' },
  { id: 'listing', group: 'Money', label: 'Listing', unit: 'money', better: 'lower', scope: 'round' },
  { id: 'hosting', group: 'Money', label: 'Hosting', unit: 'money', better: 'lower', scope: 'round' },
  { id: 'sold', group: 'Sales', label: 'Jokes sold', unit: 'count', better: 'higher', scope: 'round' },
  { id: 'released', group: 'Sales', label: 'Released', unit: 'count', better: 'higher', scope: 'round' },
  { id: 'sold_share', group: 'Sales', label: 'Released jokes that sold', unit: 'percent', better: 'higher', scope: 'round' },
  { id: 'never_sold', group: 'Sales', label: 'Never sold', unit: 'count', better: 'lower', scope: 'round' },
  { id: 'batches_per_team', group: 'Flow', label: 'Batches per team', unit: 'number', better: 'higher', scope: 'round' },
  { id: 'mean_batch_size', group: 'Flow', label: 'Mean batch size', unit: 'number', better: 'lower', scope: 'round' },
  { id: 'sent_to_released_s', group: 'Flow', label: 'Sent → released', unit: 'seconds', better: 'lower', scope: 'round' },
  { id: 'send_to_first_sale_s', group: 'Flow', label: 'Send → first sale', unit: 'seconds', better: 'lower', scope: 'round' },
  { id: 'first_sale_in_round_s', group: 'Flow', label: 'First sale in the round', unit: 'seconds', better: 'lower', scope: 'round' },
  { id: 'profit_change', group: 'Round 1 → 2', label: 'Mean profit change', unit: 'money', better: 'higher', scope: 'change' },
  { id: 'teams_improved', group: 'Round 1 → 2', label: 'Teams that improved', unit: 'percent', better: 'higher', scope: 'change' },
  { id: 'sold_share_change', group: 'Round 1 → 2', label: 'Released jokes that sold, change', unit: 'points', better: 'higher', scope: 'change' },
  { id: 'fit_gain', group: 'Bots only', label: 'Fit, first → last Round 2 batch', unit: 'number', better: 'higher', scope: 'bots' },
];

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
const mean = (xs: readonly number[]): number | null => (xs.length === 0 ? null : sum(xs) / xs.length);
const nonNull = (xs: ReadonlyArray<number | null | undefined>): number[] => xs.filter((x): x is number => typeof x === 'number');

function median(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** a ÷ b × 100, or null when b is 0. */
const pct = (a: number, b: number): number | null => (b === 0 ? null : (a / b) * 100);

const roundOf = (record: RunRecord, n: 1 | 2): RunRound | undefined => record.rounds.find(r => r.round === n);

/** Released jokes that sold at least once ÷ released, as a percent (the batch curve's measure). Each
    joke counts once however many copies sold, so it never passes 100%. Teams whose never_sold is
    unknown (a Classic round) are left out; null when none is known. */
function soldShare(round: RunRound): number | null {
  const known = round.teams.filter(t =>
    typeof t.released === 'number' && typeof t.never_sold === 'number' && t.never_sold >= 0 && t.never_sold <= t.released);
  return pct(sum(known.map(t => t.released - (t.never_sold as number))), sum(known.map(t => t.released)));
}

const batchesOf = (round: RunRound) => round.teams.flatMap(t => t.batches ?? []);

function feesPctRevenue(round: RunRound): number | null {
  const price = round.settings.market_price;
  if (typeof price !== 'number') return null;
  return pct(sum(round.teams.map(t => t.fees.total)), price * sum(round.teams.map(t => t.sold)));
}

function roundMeasure(round: RunRound, id: MeasureId): number | null {
  const teams = round.teams;
  switch (id) {
    case 'mean_profit': return mean(teams.map(t => t.profit));
    case 'median_profit': return median(teams.map(t => t.profit));
    case 'teams_in_profit': return teams.length === 0 ? null : pct(teams.filter(t => t.profit > 0).length, teams.length);
    case 'fees_total': return teams.length === 0 ? null : sum(teams.map(t => t.fees.total));
    case 'fees_pct_revenue': return feesPctRevenue(round);
    case 'listing': return teams.length === 0 ? null : sum(teams.map(t => t.fees.listing));
    case 'hosting': return teams.length === 0 ? null : sum(teams.map(t => t.fees.hosting));
    case 'sold': return teams.length === 0 ? null : sum(teams.map(t => t.sold));
    case 'released': return teams.length === 0 ? null : sum(teams.map(t => t.released));
    case 'sold_share': return soldShare(round);
    case 'never_sold': {
      const known = nonNull(teams.map(t => t.never_sold));
      return known.length === 0 ? null : sum(known);
    }
    case 'batches_per_team': return mean(teams.filter(t => t.batches).map(t => t.batches!.length));
    case 'mean_batch_size': {
      const batches = batchesOf(round);
      return batches.length === 0 ? null : sum(batches.map(b => b.jokes)) / batches.length;
    }
    case 'sent_to_released_s': return mean(nonNull(teams.map(t => t.sent_to_released_s)));
    case 'send_to_first_sale_s': return mean(nonNull(batchesOf(round).map(b => b.first_sale_s)));
    case 'first_sale_in_round_s': {
      const times = batchesOf(round).flatMap(b => (b.first_sale_s === null ? [] : [b.sent_s + b.first_sale_s]));
      return times.length === 0 ? null : Math.min(...times);
    }
    default: return null;
  }
}

/** Teams present in both rounds, paired by team_id. */
function pairedTeams(record: RunRecord): Array<[RunTeam, RunTeam]> {
  const r1 = roundOf(record, 1);
  const r2 = roundOf(record, 2);
  if (!r1 || !r2) return [];
  const pairs: Array<[RunTeam, RunTeam]> = [];
  for (const a of r1.teams) {
    const b = r2.teams.find(t => t.team_id === a.team_id);
    if (b) pairs.push([a, b]);
  }
  return pairs;
}

function changeMeasure(record: RunRecord, id: MeasureId): number | null {
  if (id === 'sold_share_change') {
    const r1 = roundOf(record, 1);
    const r2 = roundOf(record, 2);
    if (!r1 || !r2) return null;
    const a = soldShare(r1);
    const b = soldShare(r2);
    return a === null || b === null ? null : b - a;
  }
  const pairs = pairedTeams(record);
  if (id === 'profit_change') return mean(pairs.map(([a, b]) => b.profit - a.profit));
  if (id === 'teams_improved') return pairs.length === 0 ? null : pct(pairs.filter(([a, b]) => b.profit > a.profit).length, pairs.length);
  return null;
}

function fitGain(record: RunRecord): number | null {
  const r2 = roundOf(record, 2);
  if (!r2) return null;
  const gains: number[] = [];
  for (const t of r2.teams) {
    const ordered = [...(t.fit_by_batch ?? [])].sort((a, b) => a.seq - b.seq);
    const fits = nonNull(ordered.map(f => f.fit));
    if (fits.length >= 2) gains.push(fits[fits.length - 1] - fits[0]);
  }
  return mean(gains);
}

/** `round` is used for scope 'round'; ignored for 'change'; 'bots' reads Round 2. null = cannot be computed. */
export function measureValue(record: RunRecord, id: MeasureId, round: 1 | 2): number | null {
  const value = rawMeasure(record, id, round);
  return value !== null && Number.isFinite(value) ? value : null;
}

function rawMeasure(record: RunRecord, id: MeasureId, round: 1 | 2): number | null {
  const def = MEASURES.find(m => m.id === id);
  if (!def) return null;
  if (def.scope === 'change') return changeMeasure(record, id);
  if (def.scope === 'bots') return fitGain(record);
  const r = roundOf(record, round);
  return r ? roundMeasure(r, id) : null;
}

const MINUS = '−';
const signed = (n: number, digits: number) => (n < 0 ? `${MINUS}${Math.abs(n).toFixed(digits)}` : n.toFixed(digits));

export function formatMeasure(value: number | null, unit: MeasureUnit): string {
  if (value === null) return '–';
  switch (unit) {
    case 'money': return formatProfit(value);
    case 'percent': return `${Math.round(value)}%`;
    case 'points': {
      const n = Math.round(value);
      if (n === 0) return '0 pts';
      return `${n > 0 ? '+' : MINUS}${Math.abs(n)} pts`;
    }
    case 'count': return String(Math.round(value));
    case 'seconds': return fmtMinSec(value);
    case 'number': return signed(Math.abs(value) < 0.05 ? 0 : value, 1);
  }
}

export type CurveKind = 'sold_share' | 'fit';

/** Pooled over teams by batch seq: sold÷released×100, or mean fit. Points with no data are omitted. */
export function batchCurve(record: RunRecord, round: 1 | 2, kind: CurveKind): Array<{ seq: number; value: number }> {
  const r = roundOf(record, round);
  if (!r) return [];
  const bySeq = new Map<number, number[]>();
  const push = (seq: number, ...vals: number[]) => bySeq.set(seq, [...(bySeq.get(seq) ?? []), ...vals]);
  if (kind === 'sold_share') {
    const totals = new Map<number, { sold: number; released: number }>();
    for (const b of batchesOf(r)) {
      const t = totals.get(b.seq) ?? { sold: 0, released: 0 };
      totals.set(b.seq, { sold: t.sold + b.sold, released: t.released + b.released });
    }
    return [...totals.entries()]
      .sort(([a], [b]) => a - b)
      .flatMap(([seq, t]) => {
        const value = pct(t.sold, t.released);
        return value === null ? [] : [{ seq, value }];
      });
  }
  for (const t of r.teams) for (const f of t.fit_by_batch ?? []) if (f.fit !== null) push(f.seq, f.fit);
  return [...bySeq.entries()].sort(([a], [b]) => a - b).map(([seq, fits]) => ({ seq, value: mean(fits)! }));
}
