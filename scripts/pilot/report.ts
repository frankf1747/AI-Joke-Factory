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
}

export interface RunResult { round: PilotRound; durationS: number; calls: number; rows: TeamRow[] }

export interface PersonaSummary {
  n: number;
  revenue: number; shipping: number; storage: number; hosting: number; listing: number; discard: number; profit: number;
  batches: number;
  meanBatchSize: number | null;
  sendToFirstSaleS: number | null;
  /** All five fees as a share of revenue, in percent; null without revenue. */
  feesPct: number | null;
}

export const PERSONAS = ['CAREFUL', 'BALANCED', 'SPRAY', 'LEARNER'] as const;
export const ROUNDS: readonly PilotRound[] = [1, 2];

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

export interface Check { name: string; pass: boolean; detail: string }

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

  const parts: string[] = [];
  let holdPays = false;
  for (const round of ROUNDS) {
    const rows = runs.filter(r => r.round === round).flatMap(r => r.rows).filter(r => r.batches > 0);
    const rho = spearman(rows.map(r => r.storage / r.batches), rows.map(r => r.profit));
    if (rho == null) {
      holdPays = true;
      parts.push(`Round ${round}: too few teams to rank`);
    } else {
      if (rho > 0) holdPays = true;
      parts.push(`Round ${round}: ρ = ${rho.toFixed(2)}`);
    }
  }
  const desk: Check = {
    name: "No persona profits by leaving batches on Marketing's desk",
    pass: !holdPays,
    detail: `rank correlation of storage fee per batch with profit, across teams (must not be positive): ${parts.join('; ')}`,
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
  chartBatches: ReadonlyArray<{ first_sale_s: number | null }> | undefined,
): TeamRow {
  const fees = leanFeesOf(r.lean);
  const split = (r.lean?.batch_series ?? []).filter(b => b.jokes > 0);
  const sold = (chartBatches ?? []).map(b => b.first_sale_s).filter((v): v is number => v != null);
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
  };
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

/** The spec's starting amounts (§3). */
export const SPEC_FEES: PilotFees = { shippingSmall: 1, shippingStandard: 2, shippingLarge: 3, storage: 0.1, hosting: 0.05 };

export interface Tuning {
  fees: PilotFees;
  /** Arrival window in seconds (bots run 10× faster, so 90 s stands for 15 minutes). */
  window: number;
  preferenceBase?: number;
  customers?: number;
  budget?: number;
  tag?: string;
  /** The env knobs that changed a value, for the report. */
  overrides: string[];
}

/**
 * Reads PILOT_SHIP_SMALL, PILOT_SHIP_STANDARD, PILOT_SHIP_LARGE, PILOT_STORAGE,
 * PILOT_HOSTING (real-time amounts; default the spec's), PILOT_WINDOW (default
 * 90), PILOT_PREFERENCE_BASE, PILOT_CUSTOMERS, PILOT_BUDGET and PILOT_TAG.
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
  return {
    fees,
    window: num('PILOT_WINDOW', v => Number.isInteger(v) && v >= 1, 'an integer >= 1') ?? 90,
    preferenceBase: num('PILOT_PREFERENCE_BASE', v => v > 1, 'a number > 1'),
    customers: num('PILOT_CUSTOMERS', v => Number.isInteger(v) && v >= 1, 'an integer >= 1'),
    budget: num('PILOT_BUDGET', v => v >= 0, 'a number >= 0'),
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
  if (t.customers !== undefined) body.customer_count = t.customers;
  if (t.budget !== undefined) body.customer_budget = t.budget;
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
    `Arrival window ${t.window} s (stands for ${Math.round((t.window * speed) / 60)} minutes of class time); batch size 5 exactly in Round 1, up to 10 in Round 2; no WIP limit.`,
    'Bot rounds are capped at 40 jokes per team, whatever the batch size.',
    t.overrides.length ? `Overrides: ${t.overrides.join(', ')}.` : 'Overrides: none (the spec\'s starting amounts).',
  ];
}

/* ---- Markdown ------------------------------------------------------------ */

const money = (v: number) => (v < 0 ? `-$${Math.abs(v).toFixed(2)}` : `$${v.toFixed(2)}`);
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
  return [
    `# Lean fees pilot — ${date}`, '',
    ...(tag ? [`_${tag}_`, ''] : []),
    '## Success checks', '',
    ...checks.map(c => `- **${c.pass ? 'PASS' : 'FAIL'}** — ${c.name}: ${c.detail}`),
    '',
    ...(errors.length ? ['## Errors', '', ...errors.map(x => `- ${x}`), ''] : []),
    ...(settings.length ? ['## Settings', '', ...settings.map(x => `- ${x}`), ''] : []),
    'Means per team. Fees are shipping + storage + hosting + listing + discard, so profit = revenue − fees. '
      + 'Mean batch size counts split batches; send → first sale is per batch, over batches that sold.', '',
    ...ROUNDS.filter(r => runs.some(x => x.round === r)).flatMap(table),
    '## Rounds', '',
    '| Round | Winner | Profit | Duration | Classification calls |',
    '|---|---|---|---|---|',
    ...[...runs].sort((a, b) => a.round - b.round).map(r => {
      const w = winnerOf(r);
      return `| ${r.round} | ${w?.persona ?? '—'} | ${w ? money(w.profit) : '—'} | ${r.durationS}s | ${r.calls} |`;
    }),
    '',
  ].join('\n');
}
