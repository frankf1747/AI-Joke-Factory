/* Pure summarisation for the Lean fees pilot. Kept separate from the runner so
   the success checks are unit-tested and the markdown is reproducible.

   One class plays Round 1 then Round 2 under one rule set and one set of fees
   (docs/superpowers/specs/2026-10-11-lean-fees-next-step-design.md §7). One
   RunResult is one round of that class. */
import type { ConfigRequest, LeanTeamStats } from '../../types/api';
import { leanFeesOf } from '../../services/leanMode';

export type PilotRound = 1 | 2;

export interface TeamRow {
  teamId: number;
  persona: string;
  /** Sales × market price. */
  revenue: number;
  shipping: number;
  storage: number;
  hosting: number;
  /** Listing fees: released jokes × cost_of_publishing. */
  listing: number;
  /** Discard fees: dropped jokes × cost_of_discard. */
  discard: number;
  profit: number;
  /** Batches sent. */
  batches: number;
  /** Mean jokes per split batch; null when none was split. */
  meanBatchSize: number | null;
  /** Mean seconds from sending a batch to its first sale, over batches that sold; null when none sold. */
  sendToFirstSaleS: number | null;
  /** Every batch the team sent, for the batch-size table; absent in older sidecars. */
  batchList?: BatchOutcome[];
}

/** One sent batch: its joke count (null while Marketing has not split it) and seconds to its first sale. */
export interface BatchOutcome { size: number | null; firstSaleS: number | null }

/**
 * durationS is wall seconds from the server's started_at to its ended_at;
 * classMinutes is that × bot speed / 60; maxClassMinutes is the longest the
 * round should have run (classMinuteLimit), above which the report flags it.
 */
export interface RunResult {
  round: PilotRound; durationS: number; classMinutes?: number; maxClassMinutes?: number; calls: number; rows: TeamRow[];
}

/** Wall seconds as class minutes at the bot speed, to one decimal. */
export function classMinutesOf(durationS: number, speed: number): number {
  return Number(((durationS * speed) / 60).toFixed(1));
}

/** Seconds of slack on top of the arrival window and the settle, for request latency. */
export const ROUND_SLACK_S = 2;

/** The longest a round should run, in class minutes: (window + settle + slack) × speed / 60. */
export function classMinuteLimit(windowS: number, settleS: number, speed: number): number {
  return classMinutesOf(windowS + settleS + ROUND_SLACK_S, speed);
}

/** A round ran longer than its limit. Rounds without both figures are never flagged. */
export function isOver(r: RunResult): boolean {
  return r.classMinutes != null && r.maxClassMinutes != null && r.classMinutes > r.maxClassMinutes;
}

export interface PersonaSummary {
  n: number;
  revenue: number; shipping: number; storage: number; hosting: number; listing: number; discard: number; profit: number;
  batches: number;
  meanBatchSize: number | null;
  sendToFirstSaleS: number | null;
  /** All five fees as a share of revenue, in percent; null without revenue. */
  feesPct: number | null;
}

/**
 * Report order. BALANCED_HOLDS is the pilot-only contrast: Balanced in every way
 * except that its Marketing seat holds each batch an extra 60 class-seconds.
 */
export const PERSONAS = ['CAREFUL', 'BALANCED', 'BALANCED_HOLDS', 'SPRAY', 'LEARNER'] as const;
export const HOLDS = 'BALANCED_HOLDS';
export const ROUNDS: readonly PilotRound[] = [1, 2];

const money = (v: number) => (v < 0 ? `-$${Math.abs(v).toFixed(2)}` : `$${v.toFixed(2)}`);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const meanOrNull = (xs: Array<number | null>) => {
  const known = xs.filter((x): x is number => x != null);
  return known.length ? mean(known) : null;
};

/** Fees are everything profit subtracts from revenue: shipping, storage, hosting, listing, discard. */
export function feesOf(r: Pick<TeamRow, 'shipping' | 'storage' | 'hosting' | 'listing' | 'discard'>): number {
  return r.shipping + r.storage + r.hosting + r.listing + r.discard;
}

/** Per persona means, per round (both rounds always present, possibly empty). */
export function summarise(runs: RunResult[]): Record<PilotRound, Record<string, PersonaSummary>> {
  const out = { 1: {}, 2: {} } as Record<PilotRound, Record<string, PersonaSummary>>;
  for (const round of ROUNDS) {
    const rows = runs.filter(r => r.round === round).flatMap(r => r.rows);
    for (const persona of new Set(rows.map(r => r.persona))) {
      const xs = rows.filter(r => r.persona === persona);
      const s: PersonaSummary = {
        n: xs.length,
        revenue: mean(xs.map(x => x.revenue)), shipping: mean(xs.map(x => x.shipping)),
        storage: mean(xs.map(x => x.storage)), hosting: mean(xs.map(x => x.hosting)),
        listing: mean(xs.map(x => x.listing)), discard: mean(xs.map(x => x.discard)),
        profit: mean(xs.map(x => x.profit)), batches: mean(xs.map(x => x.batches)),
        meanBatchSize: meanOrNull(xs.map(x => x.meanBatchSize)),
        sendToFirstSaleS: meanOrNull(xs.map(x => x.sendToFirstSaleS)),
        feesPct: null,
      };
      s.feesPct = s.revenue > 0 ? (feesOf(s) / s.revenue) * 100 : null;
      out[round][persona] = s;
    }
  }
  return out;
}

/** Spearman's rank correlation, ties given their average rank; null below 3 pairs or with no spread. */
export function spearman(xs: readonly number[], ys: readonly number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  const ranks = (vs: readonly number[]) => {
    const order = vs.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
    const r = new Array<number>(vs.length);
    for (let k = 0; k < order.length;) {
      let j = k;
      while (j + 1 < order.length && order[j + 1].v === order[k].v) j++;
      for (let m = k; m <= j; m++) r[order[m].i] = (k + j) / 2 + 1;
      k = j + 1;
    }
    return r;
  };
  const rx = ranks(xs.slice(0, n));
  const ry = ranks(ys.slice(0, n));
  const mx = mean(rx);
  const my = mean(ry);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (rx[i] - mx) * (ry[i] - my);
    dx += (rx[i] - mx) ** 2;
    dy += (ry[i] - my) ** 2;
  }
  return dx === 0 || dy === 0 ? null : num / Math.sqrt(dx * dy);
}

/** notes are extra lines under a check (caveats, indicative figures); they never change pass. */
export interface Check { name: string; pass: boolean; detail: string; notes?: string[] }

/** The three success checks of spec §7, in its order. */
export function successChecks(runs: RunResult[]): Check[] {
  const s = summarise(runs);
  const pct = s[1].SPRAY?.feesPct ?? null;
  const fees: Check = {
    name: 'Spray spends 40–60 % of its revenue on fees in Round 1',
    pass: pct != null && pct >= 40 && pct <= 60,
    detail: pct == null ? 'no Spray Round 1 revenue' : `Spray Round 1 fees are ${pct.toFixed(1)} % of revenue`,
  };

  const learner = s[2].LEARNER?.sendToFirstSaleS ?? null;
  const spray = s[2].SPRAY?.sendToFirstSaleS ?? null;
  const faster: Check = {
    name: "In Round 2, the Learner's batches of 3 reach their first sale sooner than Spray's batches of 10",
    pass: learner != null && spray != null && learner < spray,
    detail: learner == null || spray == null
      ? `no first sale for ${[learner == null ? 'Learner' : '', spray == null ? 'Spray' : ''].filter(Boolean).join(' or ')} in Round 2`
      : `send → first sale: Learner ${Math.round(learner)} s, Spray ${Math.round(spray)} s`,
  };

  faster.notes = ['Learner also differs in pacing and feedback waits; see the batch-size table'];

  // Controlled contrast: the holders differ from Balanced only in how long
  // Marketing keeps each batch, so a lower mean profit is the cost of holding.
  const parts: string[] = [];
  let holdPays = false;
  for (const round of ROUNDS) {
    const held = s[round][HOLDS];
    const balanced = s[round].BALANCED;
    if (!held || !balanced) {
      holdPays = true;
      parts.push(`Round ${round}: no ${!held ? 'Balanced (holds)' : 'Balanced'} teams`);
      continue;
    }
    if (!(held.profit < balanced.profit)) holdPays = true;
    parts.push(`Round ${round}: ${money(held.profit)} vs ${money(balanced.profit)}`);
  }
  const rhos: string[] = [];
  for (const round of ROUNDS) {
    const rows = runs.filter(r => r.round === round).flatMap(r => r.rows).filter(r => r.batches > 0);
    const rho = spearman(rows.map(r => r.storage / r.batches), rows.map(r => r.profit));
    rhos.push(
      rho != null
        ? `Round ${round}: ρ = ${rho.toFixed(2)}`
        : rows.length < 3
          ? `Round ${round}: too few teams with batches to rank (${rows.length})`
          : `Round ${round}: no spread in storage per batch`,
    );
  }
  const desk: Check = {
    name: "No persona profits by leaving batches on Marketing's desk",
    pass: !holdPays,
    detail: `mean profit, Balanced (holds) vs Balanced: ${parts.join('; ')}`,
    notes: [
      `Indicative only (not a pass/fail): rank correlation of storage fee per batch with profit, across all teams: ${rhos.join('; ')}`,
    ],
  };
  return [fees, faster, desk];
}

/**
 * One team's row from the round's leaderboard row, its prices and its lean
 * charts batches. Mean batch size counts split batches (an unsplit one has no
 * joke rows yet); send → first sale averages the batches that sold.
 */
export function teamRowFrom(
  r: {
    team: { id: number };
    total_sales: number; published_jokes: number; discarded_jokes: number; profit: number;
    lean?: LeanTeamStats;
  },
  persona: string,
  prices: { market_price: number; cost_of_publishing: number; cost_of_discard: number },
  chartBatches: ReadonlyArray<{ seq?: number; jokes?: number; first_sale_s: number | null }> | undefined,
): TeamRow {
  const fees = leanFeesOf(r.lean);
  const split = (r.lean?.batch_series ?? []).filter(b => b.jokes > 0);
  const sold = (chartBatches ?? []).map(b => b.first_sale_s).filter((v): v is number => v != null);
  // The charts report an unsplit batch as the round's batch_size; the stats
  // series has 0 joke rows for it, so the size comes from the series.
  const series = new Map((r.lean?.batch_series ?? []).map(b => [b.seq, b.jokes]));
  const sizeOf = (b: { seq?: number; jokes?: number }): number | null => {
    const rows = b.seq != null ? series.get(b.seq) : undefined;
    if (rows !== undefined) return rows > 0 ? rows : null;
    return r.lean ? null : b.jokes ?? null;
  };
  return {
    teamId: r.team.id, persona,
    revenue: r.total_sales * prices.market_price,
    shipping: fees.shipping, storage: fees.storage, hosting: fees.hosting,
    listing: r.published_jokes * prices.cost_of_publishing,
    discard: r.discarded_jokes * prices.cost_of_discard,
    profit: r.profit,
    batches: r.lean?.batches_submitted ?? 0,
    meanBatchSize: split.length ? split.reduce((n, b) => n + b.jokes, 0) / split.length : null,
    sendToFirstSaleS: sold.length ? sold.reduce((a, b) => a + b, 0) / sold.length : null,
    batchList: (chartBatches ?? []).map(b => ({ size: sizeOf(b), firstSaleS: b.first_sale_s })),
  };
}

export interface BatchSizeRow {
  /** Jokes in the batch; null for batches Marketing never split. */
  size: number | null;
  batches: number;
  /** Share of these batches with at least one sale, 0–1. */
  soldShare: number;
  /** Mean send → first sale over the sold ones; null when none sold. */
  sendToFirstSaleS: number | null;
}

/** Every batch of a round, all teams, grouped by size (ascending, unsplit last). */
export function batchSizeTable(runs: RunResult[], round: PilotRound): BatchSizeRow[] {
  const all = runs.filter(r => r.round === round).flatMap(r => r.rows).flatMap(r => r.batchList ?? []);
  const sizes = [...new Set(all.map(b => b.size))].sort((a, b) => (a ?? Infinity) - (b ?? Infinity));
  return sizes.map(size => {
    const xs = all.filter(b => b.size === size);
    const sold = xs.map(b => b.firstSaleS).filter((v): v is number => v != null);
    return { size, batches: xs.length, soldShare: sold.length / xs.length, sendToFirstSaleS: sold.length ? mean(sold) : null };
  });
}

/* ---- Settings ------------------------------------------------------------ */

/** The five fees at the real-time (classroom) rate. */
export interface PilotFees {
  shippingSmall: number; shippingStandard: number; shippingLarge: number;
  /** Per joke-minute. */
  storage: number;
  /** Per joke-minute. */
  hosting: number;
}

/** The game's defaults (tuned defaults spec §2): the recommended configuration, no overrides. */
export const SPEC_FEES: PilotFees = { shippingSmall: 1, shippingStandard: 2, shippingLarge: 3, storage: 0.05, hosting: 0.05 };

export interface Tuning {
  fees: PilotFees;
  /** Arrival window in seconds (bots run 10× faster, so 90 s stands for 15 minutes). */
  window: number;
  preferenceBase?: number;
  /** A fixed customer count; sent with customers_per_team 0 so the per-team rule is off. */
  customers?: number;
  /** Customers per team (the backend default is 18); the count at start is this × the number of teams. */
  customersPerTeam?: number;
  budget?: number;
  /** Customers' buy threshold τ (fit out of 12 a joke needs before anyone buys it). */
  buyThreshold?: number;
  /** Teams per persona (Careful, Balanced, Spray, Learner); default 3. */
  perPersona: number;
  /** Extra Balanced teams whose Marketing holds each batch; default 2. */
  holdTeams: number;
  tag?: string;
  /** The env knobs that changed a value, for the report. */
  overrides: string[];
}

/**
 * Reads PILOT_SHIP_SMALL, PILOT_SHIP_STANDARD, PILOT_SHIP_LARGE, PILOT_STORAGE,
 * PILOT_HOSTING (real-time amounts; default the spec's), PILOT_WINDOW (default
 * 90), PILOT_PREFERENCE_BASE, PILOT_CUSTOMERS, PILOT_CUSTOMERS_PER_TEAM, PILOT_BUDGET and PILOT_TAG.
 * Throws on a bad value, and when shipping does not rise with batch size.
 */
export function parseTuning(env: Record<string, string | undefined>): Tuning {
  const overrides: string[] = [];
  const num = (name: string, ok: (v: number) => boolean, rule: string): number | undefined => {
    const raw = env[name];
    if (raw === undefined || raw.trim() === '') return undefined;
    const v = Number(raw);
    if (!Number.isFinite(v) || !ok(v)) throw new Error(`${name} must be ${rule}, got ${raw}`);
    overrides.push(name);
    return v;
  };
  const fee = (name: string, fallback: number) => num(name, v => v >= 0, 'a number >= 0') ?? fallback;
  const fees: PilotFees = {
    shippingSmall: fee('PILOT_SHIP_SMALL', SPEC_FEES.shippingSmall),
    shippingStandard: fee('PILOT_SHIP_STANDARD', SPEC_FEES.shippingStandard),
    shippingLarge: fee('PILOT_SHIP_LARGE', SPEC_FEES.shippingLarge),
    storage: fee('PILOT_STORAGE', SPEC_FEES.storage),
    hosting: fee('PILOT_HOSTING', SPEC_FEES.hosting),
  };
  if (fees.shippingSmall > fees.shippingStandard || fees.shippingStandard > fees.shippingLarge) {
    throw new Error('shipping fees must rise with batch size: PILOT_SHIP_SMALL <= PILOT_SHIP_STANDARD <= PILOT_SHIP_LARGE');
  }
  const customers = num('PILOT_CUSTOMERS', v => Number.isInteger(v) && v >= 1, 'an integer >= 1');
  const customersPerTeam = num('PILOT_CUSTOMERS_PER_TEAM', v => Number.isInteger(v) && v >= 0 && v <= 1000, 'an integer from 0 to 1000');
  if (customers !== undefined && customersPerTeam !== undefined) {
    throw new Error('set PILOT_CUSTOMERS (a fixed count) or PILOT_CUSTOMERS_PER_TEAM, not both');
  }
  return {
    fees,
    window: num('PILOT_WINDOW', v => Number.isInteger(v) && v >= 1, 'an integer >= 1') ?? 90,
    preferenceBase: num('PILOT_PREFERENCE_BASE', v => v > 1, 'a number > 1'),
    customers,
    customersPerTeam,
    budget: num('PILOT_BUDGET', v => v >= 0, 'a number >= 0'),
    buyThreshold: num('PILOT_BUY_THRESHOLD', v => v >= 0 && v <= 12, 'a number from 0 to 12'),
    perPersona: num('PILOT_PER_PERSONA', v => Number.isInteger(v) && v >= 1, 'an integer >= 1') ?? 3,
    holdTeams: num('PILOT_HOLD_TEAMS', v => Number.isInteger(v) && v >= 0, 'an integer >= 0') ?? 2,
    tag: env.PILOT_TAG?.trim() || undefined,
    overrides,
  };
}

/**
 * The config body of one round. The backend charges storage and hosting per
 * wall-clock minute while the bots play `speed` times faster, so those two are
 * multiplied by `speed` to weigh what they weigh in a real 15-minute round.
 * Shipping is per batch, not per minute, and is sent unscaled. Batch size:
 * exactly 5 in Round 1, up to 10 in Round 2. No WIP limit.
 */
export function pilotConfig(t: Tuning, speed: number, round: PilotRound): ConfigRequest {
  const perMinute = (v: number) => Number((v * speed).toFixed(4));
  const body: ConfigRequest = {
    market_mode: 'LEAN', arrival_window_seconds: t.window, wip_limit: 0, batch_size: round === 1 ? 5 : 10,
    shipping_fee_small: t.fees.shippingSmall, shipping_fee_standard: t.fees.shippingStandard,
    shipping_fee_large: t.fees.shippingLarge,
    storage_fee_per_joke_minute: perMinute(t.fees.storage), hosting_fee_per_joke_minute: perMinute(t.fees.hosting),
  };
  if (t.preferenceBase !== undefined) body.preference_base = t.preferenceBase;
  // A fixed count switches the per-team rule off (customers_per_team 0), or the start would overwrite it.
  if (t.customers !== undefined) { body.customer_count = t.customers; body.customers_per_team = 0; }
  if (t.customersPerTeam !== undefined) body.customers_per_team = t.customersPerTeam;
  if (t.budget !== undefined) body.customer_budget = t.budget;
  if (t.buyThreshold !== undefined) body.buy_threshold = t.buyThreshold;
  return body;
}

/** The Settings lines: fees, scaling, window and every override. */
export function settingsLines(t: Tuning, speed: number, counts: string): string[] {
  const f = t.fees;
  return [
    `Bots at ${speed}×; ${counts}; one class, Round 1 then Round 2.`,
    `Fees (real time): shipping $${f.shippingSmall} / $${f.shippingStandard} / $${f.shippingLarge} for 1–4 / 5 / 6–10 jokes, `
      + `storage $${f.storage} and hosting $${f.hosting} per joke-minute.`,
    `Storage and hosting are sent ×${speed} ($${Number((f.storage * speed).toFixed(4))} and $${Number((f.hosting * speed).toFixed(4))}) `
      + 'because the backend charges per wall-clock minute; shipping is per batch and is not scaled.',
    t.customers !== undefined ? `Customers: a fixed ${t.customers} (PILOT_CUSTOMERS), no per-team scaling.`
      : t.customersPerTeam === 0 ? 'Customers: per-team scaling off (PILOT_CUSTOMERS_PER_TEAM=0), the stored fixed count.'
      : t.customersPerTeam !== undefined
        ? `Customers: ${t.customersPerTeam} per team (PILOT_CUSTOMERS_PER_TEAM); the count at start is ${t.customersPerTeam} × the number of teams.`
        : 'Customers: the backend default, 18 per team (the count at start is 18 × the number of teams).',
    `Arrival window ${t.window} s (stands for ${Math.round((t.window * speed) / 60)} minutes of class time); batch size 5 exactly in Round 1, up to 10 in Round 2; no WIP limit.`,
    'Bot rounds are capped at 40 jokes per team, whatever the batch size.',
    t.overrides.length ? `Overrides: ${t.overrides.join(', ')}.` : 'Overrides: none (the game\'s defaults).',
  ];
}

/* ---- Markdown ------------------------------------------------------------ */

const classCell = (r: RunResult) => (r.classMinutes == null ? '—' : `${r.classMinutes}${isOver(r) ? ' (over)' : ''}`);
const winnerOf = (r: RunResult) => [...r.rows].sort((a, b) => b.profit - a.profit)[0];

/** Only these hosts may be pilot targets by default: the class starts with a destructive reset. */
export function isLocalUrl(url: string): boolean {
  try {
    return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** Everything a run produced, written next to the markdown as JSON so it can be re-rendered. */
export interface PilotSidecar { date: string; settings: string[]; results: RunResult[]; errors: string[]; tag?: string }

export function markdown(
  runs: RunResult[], date: string, settings: string[] = [], errors: string[] = [], tag?: string,
): string {
  const s = summarise(runs);
  const checks = successChecks(runs);
  const table = (round: PilotRound): string[] => {
    const group = s[round];
    const known = PERSONAS.filter(p => group[p]);
    const extra = Object.keys(group).filter(p => !(PERSONAS as readonly string[]).includes(p)).sort();
    return [
      `## Round ${round}`, '',
      '| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |',
      '|---|---|---|---|---|---|---|---|---|---|---|---|',
      ...[...known, ...extra].map(p => {
        const x = group[p];
        return `| ${p} | ${x.n} | ${money(x.revenue)} | ${money(x.shipping)} | ${money(x.storage)} | ${money(x.hosting)} | `
          + `${money(x.listing)} | **${money(x.profit)}** | ${x.batches.toFixed(1)} | `
          + `${x.meanBatchSize == null ? '—' : x.meanBatchSize.toFixed(1)} | `
          + `${x.sendToFirstSaleS == null ? '—' : `${Math.round(x.sendToFirstSaleS)} s`} | `
          + `${x.feesPct == null ? '—' : `${x.feesPct.toFixed(1)} %`} |`;
      }),
      '',
    ];
  };
  const batchSection = (): string[] => {
    const t = batchSizeTable(runs, 2);
    if (!t.length) return [];
    return [
      '## Round 2 batches by size', '',
      'Every batch sent in Round 2, all teams, grouped by its number of jokes.', '',
      '| Batch size | Batches | Sold | Send → first sale (sold batches) |',
      '|---|---|---|---|',
      ...t.map(b => `| ${b.size ?? 'not split'} | ${b.batches} | ${Math.round(b.soldShare * 100)} % | `
        + `${b.sendToFirstSaleS == null ? '—' : `${Math.round(b.sendToFirstSaleS)} s`} |`),
      '',
    ];
  };
  return [
    `# Lean fees pilot — ${date}`, '',
    ...(tag ? [`_${tag}_`, ''] : []),
    '## Success checks', '',
    ...checks.flatMap(c => [`- **${c.pass ? 'PASS' : 'FAIL'}** — ${c.name}: ${c.detail}`, ...(c.notes ?? []).map(n => `  - ${n}`)]),
    '',
    ...batchSection(),
    ...(errors.length ? ['## Errors', '', ...errors.map(x => `- ${x}`), ''] : []),
    ...(settings.length ? ['## Settings', '', ...settings.map(x => `- ${x}`), ''] : []),
    'Means per team. Fees are shipping + storage + hosting + listing + discard, so profit = revenue − fees. '
      + 'Mean batch size counts split batches; send → first sale is per batch, over batches that sold.', '',
    ...ROUNDS.filter(r => runs.some(x => x.round === r)).flatMap(table),
    '## Rounds', '',
    '| Round | Winner | Profit | Duration | Classification calls | Class minutes |',
    '|---|---|---|---|---|---|',
    ...[...runs].sort((a, b) => a.round - b.round).map(r => {
      const w = winnerOf(r);
      return `| ${r.round} | ${w?.persona ?? '—'} | ${w ? money(w.profit) : '—'} | ${r.durationS}s | ${r.calls} | ${classCell(r)} |`;
    }),
    '',
    ...runs.filter(isOver).map(
      r => `**Warning:** Round ${r.round} ran ${r.classMinutes} class minutes, longer than ${r.maxClassMinutes}; its fees and sales are skewed.`,
    ),
    '',
  ].join('\n');
}
