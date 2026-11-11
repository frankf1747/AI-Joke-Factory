/* Pure summarisation for the feedback pilot and the cost sweep
   (docs/superpowers/specs/2026-11-10-two-costs-feedback-bots-design.md §5).
   Kept apart from the runners (feedback-pilot.mts, cost-sweep.mts) so the
   checks are unit-tested and the markdown is reproducible from a sidecar.

   One class = 20 bot teams, Round 1 then Round 2, trait classifier, bots at
   10×. Four groups of 5: small (Round 2 batches of 3) or large (10), with or
   without feedback. Each feedback team has a twin without it: same persona
   (Balanced), pace, batch sizes and seed (deckIndex), so the pair draws the
   same starting jokes. Every Marketing seat releases every joke, so each team
   is "a team releasing everything". The pilot computes each released joke's
   fit from its corpus traits and the round's ideal (services/shared/traitCorpus.ts
   traitFit, the port of the Go rules); the bots never see it. */
import type { ConfigRequest, LeanTeamStats } from '../../types/api';
import type { BotTeamSpec } from '../../services/bots/protocol';
import { leanFeesOf } from '../../services/leanMode';
import { normalizeJokeText, traitFit, type TraitIndex } from '../../services/shared/traitCorpus';
import type { IdealProfile } from '../../config/dimensions';

export type GroupId = 'SMALL_ON' | 'SMALL_OFF' | 'LARGE_ON' | 'LARGE_OFF';
export type PilotRound = 1 | 2;

export const GROUPS: ReadonlyArray<{ id: GroupId; label: string; round2BatchSize: number; useFeedback: boolean }> = [
  { id: 'SMALL_ON', label: 'Small + feedback', round2BatchSize: 3, useFeedback: true },
  { id: 'SMALL_OFF', label: 'Small, no feedback', round2BatchSize: 3, useFeedback: false },
  { id: 'LARGE_ON', label: 'Large + feedback', round2BatchSize: 10, useFeedback: true },
  { id: 'LARGE_OFF', label: 'Large, no feedback', round2BatchSize: 10, useFeedback: false },
];

/** The customers' bar: the backend's default buy threshold (domain.DefaultBuyThreshold); the pilot never changes it. */
export const CUSTOMERS_BAR = 8;
/** A mean fit "rises" from the first to the last Round 2 batch when it gains at least this much. */
export const RISE = 0.5;
/** "About half of teams or more" finish Round 2 in profit. */
export const PROFIT_SHARE_MIN = 0.45;
/** A team releasing everything spends this share of its Round 1 revenue on fees. */
export const FEE_SHARE_RANGE: readonly [number, number] = [0.4, 0.6];

export interface ClassTeam extends BotTeamSpec { group: GroupId }

/**
 * The 2×2 class: `perGroup` matched pairs of each size. Indices run 1…4×perGroup;
 * each no-feedback twin plays with its partner's deckIndex.
 */
export function classTeams(perGroup = 5): ClassTeam[] {
  const out: ClassTeam[] = [];
  for (let k = 0; k < perGroup; k++) {
    for (const size of [3, 10]) {
      const on = out.length + 1;
      const base = { persona: 'BALANCED' as const, releaseAll: true, round2BatchSize: size };
      out.push({ ...base, index: on, useFeedback: true, group: size === 3 ? 'SMALL_ON' : 'LARGE_ON' });
      out.push({ ...base, index: on + 1, useFeedback: false, deckIndex: on, group: size === 3 ? 'SMALL_OFF' : 'LARGE_OFF' });
    }
  }
  return out;
}

/** Listing per released joke and hosting per joke-minute, at classroom (1×) rates. */
export interface Costs { listing: number; hosting: number }

/**
 * One round's config. Two costs: listing (per joke, unscaled) and hosting,
 * which the backend charges per wall-clock minute, so it is sent × speed to
 * weigh what it weighs in a real 15-minute round; shipping, storage and discard 0.
 */
export function pilotConfig(costs: Costs, speed: number, windowS: number, round: PilotRound): ConfigRequest {
  return {
    market_mode: 'LEAN', arrival_window_seconds: windowS, wip_limit: 0, batch_size: round === 1 ? 5 : 10,
    cost_of_publishing: costs.listing, cost_of_discard: 0,
    hosting_fee_per_joke_minute: Number((costs.hosting * speed).toFixed(4)),
    shipping_fee_small: 0, shipping_fee_standard: 0, shipping_fee_large: 0, storage_fee_per_joke_minute: 0,
  };
}

/** One sent batch, in send order. */
export interface BatchFit {
  seq: number;
  released: number;
  /** Mean fit of its released jokes; null when it released none (or none is a corpus joke). */
  meanFit: number | null;
  /** Released jokes at or above the bar. */
  aboveBar: number;
  /** At least one released joke at or above the bar. */
  cleared: boolean;
}

/**
 * Each batch's released jokes scored against the ideal, from the team's batch
 * list (what the bots' own seats read). Batches in send order; jokes not in
 * the corpus are left out.
 */
export function batchFits(
  batches: ReadonlyArray<{ batch_id: number; submitted_at: string | null; jokes: ReadonlyArray<{ joke_text: string; publish_status: string }> | null }>,
  index: TraitIndex, ideal: IdealProfile, bar = CUSTOMERS_BAR,
): BatchFit[] {
  return [...batches]
    .sort((a, b) => (Date.parse(a.submitted_at ?? '') || 0) - (Date.parse(b.submitted_at ?? '') || 0) || a.batch_id - b.batch_id)
    .map((b, i) => {
      const fits = (b.jokes ?? [])
        .filter(j => j.publish_status === 'PUBLISHED')
        .map(j => index.byText.get(normalizeJokeText(j.joke_text)))
        .filter(j => j != null)
        .map(j => traitFit(j, ideal));
      const aboveBar = fits.filter(f => f >= bar).length;
      return {
        seq: i + 1, released: fits.length,
        meanFit: fits.length ? fits.reduce((a, f) => a + f, 0) / fits.length : null,
        aboveBar, cleared: aboveBar > 0,
      };
    });
}

export interface TeamRow {
  teamId: number;
  group: GroupId;
  revenue: number;
  listing: number;
  hosting: number;
  /** Shipping + storage + discard: 0 at the pilot's costs, kept so a misconfigured run shows. */
  otherFees: number;
  profit: number;
  sales: number;
  batches: BatchFit[];
  /** Mean seconds from sending a batch to its first sale, over batches that sold; null when none did. */
  sendToFirstSaleS: number | null;
}

/** A team's row from its leaderboard row, the round's prices, its lean charts batches and its batch fits. */
export function teamRowFrom(
  r: { team: { id: number }; total_sales: number; published_jokes: number; discarded_jokes: number; profit: number; lean?: LeanTeamStats },
  group: GroupId,
  prices: { market_price: number; cost_of_publishing: number; cost_of_discard: number },
  chartBatches: ReadonlyArray<{ first_sale_s: number | null }> | undefined,
  batches: BatchFit[],
): TeamRow {
  const lean = leanFeesOf(r.lean);
  const sold = (chartBatches ?? []).map(b => b.first_sale_s).filter((v): v is number => v != null);
  return {
    teamId: r.team.id, group,
    revenue: r.total_sales * prices.market_price,
    listing: r.published_jokes * prices.cost_of_publishing,
    hosting: lean.hosting,
    otherFees: lean.shipping + lean.storage + r.discarded_jokes * prices.cost_of_discard,
    profit: r.profit, sales: r.total_sales, batches,
    sendToFirstSaleS: sold.length ? sold.reduce((a, b) => a + b, 0) / sold.length : null,
  };
}

export interface RoundResult { round: PilotRound; durationS: number; rows: TeamRow[] }
export interface ClassResult { classNo: number; seed: string; rounds: RoundResult[] }
export interface PilotSidecar {
  date: string; costs: Costs; settings: string[]; classes: ClassResult[]; errors: string[]; tag?: string;
}

const mean = (xs: readonly number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const meanOrNull = (xs: ReadonlyArray<number | null>): number | null => {
  const known = xs.filter((x): x is number => x != null);
  return known.length ? mean(known) : null;
};

const rowsOf = (classes: readonly ClassResult[], round: PilotRound, groups: readonly GroupId[]): TeamRow[] =>
  classes.flatMap(c => c.rounds.filter(r => r.round === round).flatMap(r => r.rows)).filter(r => groups.includes(r.group));

const fitted = (r: TeamRow) => r.batches.filter(b => b.meanFit != null);
/** First and last batch fit of a team (batches that released a corpus joke); null without any. */
export function firstLastFit(r: TeamRow): { first: number; last: number } | null {
  const b = fitted(r);
  return b.length ? { first: b[0].meanFit as number, last: b[b.length - 1].meanFit as number } : null;
}
/** The 1-based batch number of the first batch that cleared the bar; null when none did. */
export const firstClear = (r: TeamRow): number | null => r.batches.find(b => b.cleared)?.seq ?? null;

export interface GroupSummary {
  teams: number;
  /** Mean fit of released jokes by batch number (1-based index = batch), over the teams that sent that batch. */
  curve: Array<number | null>;
  /** Mean over teams that cleared the bar; null when none did. */
  batchesToClear: number | null;
  cleared: number;
  /** Released jokes at or above the bar, over all released jokes; null without any. */
  shareAboveBar: number | null;
  sales: number; listing: number; hosting: number; profit: number;
  sendToFirstSaleS: number | null;
}

export function summariseGroup(rows: readonly TeamRow[]): GroupSummary {
  const longest = Math.max(0, ...rows.map(r => r.batches.length));
  const curve = Array.from({ length: longest }, (_, i) => meanOrNull(rows.map(r => r.batches[i]?.meanFit ?? null)));
  const clears = rows.map(firstClear).filter((v): v is number => v != null);
  let released = 0;
  let above = 0;
  for (const r of rows) for (const b of r.batches) { released += b.released; above += b.aboveBar; }
  return {
    teams: rows.length, curve,
    batchesToClear: clears.length ? mean(clears) : null, cleared: clears.length,
    shareAboveBar: released ? above / released : null,
    sales: mean(rows.map(r => r.sales)), listing: mean(rows.map(r => r.listing)), hosting: mean(rows.map(r => r.hosting)),
    profit: mean(rows.map(r => r.profit)), sendToFirstSaleS: meanOrNull(rows.map(r => r.sendToFirstSaleS)),
  };
}

export interface Check { id: 1 | 2 | 3 | 4 | 5; name: string; pass: boolean; detail: string }

const money = (v: number) => (v < 0 ? `-$${Math.abs(v).toFixed(2)}` : `$${v.toFixed(2)}`);
const fit1 = (v: number | null) => (v == null ? '—' : v.toFixed(1));
const pct = (v: number) => `${Math.round(v * 100)} %`;

/** The five success checks of spec §5, over every class of one setting. */
export function successChecks(classes: readonly ClassResult[]): Check[] {
  const on = rowsOf(classes, 2, ['SMALL_ON', 'LARGE_ON']);
  const off = rowsOf(classes, 2, ['SMALL_OFF', 'LARGE_OFF']);
  const rise = (rows: TeamRow[]) => {
    const pairs = rows.map(firstLastFit).filter((p): p is { first: number; last: number } => p != null);
    return pairs.length ? mean(pairs.map(p => p.last - p.first)) : null;
  };
  const onRise = rise(on);
  const offRise = rise(off);
  const c1: Check = {
    id: 1, name: "Feedback teams' mean fit rises from their first to their last Round 2 batches; no-feedback twins' does not",
    pass: onRise != null && offRise != null && onRise >= RISE && offRise < RISE,
    detail: `first → last batch: feedback ${onRise == null ? '—' : `${onRise >= 0 ? '+' : ''}${onRise.toFixed(2)}`}, `
      + `no feedback ${offRise == null ? '—' : `${offRise >= 0 ? '+' : ''}${offRise.toFixed(2)}`} (rises = at least +${RISE})`,
  };

  const onProfit = mean(on.map(r => r.profit));
  const offProfit = mean(off.map(r => r.profit));
  const c2: Check = {
    id: 2, name: 'In Round 2, feedback teams earn more profit than their no-feedback twins',
    pass: on.length > 0 && onProfit > offProfit,
    detail: `mean Round 2 profit: feedback ${money(onProfit)}, no feedback ${money(offProfit)}`,
  };

  const gain = (a: GroupId, b: GroupId) => mean(rowsOf(classes, 2, [a]).map(r => r.profit)) - mean(rowsOf(classes, 2, [b]).map(r => r.profit));
  const small = gain('SMALL_ON', 'SMALL_OFF');
  const large = gain('LARGE_ON', 'LARGE_OFF');
  const c3: Check = {
    id: 3, name: 'The feedback gain is larger for small batches than for large ones',
    pass: small > large,
    detail: `Round 2 profit gain from feedback: small ${money(small)}, large ${money(large)}`,
  };

  const clears = on.map(firstClear).filter((v): v is number => v != null);
  const meanClear = clears.length ? mean(clears) : null;
  // Per size too: a large team gets no feedback before its last batches, so its first clear is batch-size luck.
  const bySize = (['SMALL_ON', 'LARGE_ON'] as const).map(g => {
    const xs = rowsOf(classes, 2, [g]).map(firstClear).filter((v): v is number => v != null);
    return `${g === 'SMALL_ON' ? 'small' : 'large'} ${xs.length ? mean(xs).toFixed(1) : '—'}`;
  }).join(', ');
  const c4: Check = {
    id: 4, name: 'Feedback is gradual: a feedback team needs at least 3 batches to first clear the bar',
    pass: meanClear != null && meanClear >= 3,
    detail: meanClear == null
      ? `no feedback team cleared the bar of ${CUSTOMERS_BAR} in Round 2`
      : `feedback teams first clear the bar of ${CUSTOMERS_BAR} at batch ${meanClear.toFixed(1)} on average (${bySize}; `
        + `${clears.length} of ${on.length} teams cleared it)`,
  };

  const all2 = rowsOf(classes, 2, GROUPS.map(g => g.id));
  const inProfit = all2.length ? all2.filter(r => r.profit > 0).length / all2.length : 0;
  const r1 = rowsOf(classes, 1, GROUPS.map(g => g.id));
  const revenue1 = r1.reduce((n, r) => n + r.revenue, 0);
  const fees1 = r1.reduce((n, r) => n + r.listing + r.hosting + r.otherFees, 0);
  const feeShare = revenue1 > 0 ? fees1 / revenue1 : null;
  const c5: Check = {
    id: 5, name: 'About half of teams or more finish Round 2 in profit, and a team releasing everything spends 40–60 % of its Round 1 revenue on fees',
    pass: inProfit >= PROFIT_SHARE_MIN && feeShare != null && feeShare >= FEE_SHARE_RANGE[0] && feeShare <= FEE_SHARE_RANGE[1],
    detail: `${pct(inProfit)} of teams in profit in Round 2 (want ≥ ${pct(PROFIT_SHARE_MIN)}); Round 1 fees are `
      + `${feeShare == null ? '— (no revenue)' : pct(feeShare)} of revenue (every team releases everything)`,
  };
  return [c1, c2, c3, c4, c5];
}

/** Groups' tables for one round, and the learning curves. */
function roundSection(classes: readonly ClassResult[], round: PilotRound): string[] {
  const s = GROUPS.map(g => ({ g, x: summariseGroup(rowsOf(classes, round, [g.id])) }));
  const longest = Math.max(0, ...s.map(({ x }) => x.curve.length));
  return [
    `## Round ${round}`, '',
    '| Group | Teams | Batches to clear the bar | Released jokes over the bar | Sales | Listing | Hosting | Profit | Send → first sale |',
    '|---|---|---|---|---|---|---|---|---|',
    ...s.map(({ g, x }) => `| ${g.label} | ${x.teams} | ${x.batchesToClear == null ? '— (none)' : `${x.batchesToClear.toFixed(1)} (${x.cleared} teams)`} | `
      + `${x.shareAboveBar == null ? '—' : pct(x.shareAboveBar)} | ${x.sales.toFixed(1)} | ${money(x.listing)} | ${money(x.hosting)} | `
      + `**${money(x.profit)}** | ${x.sendToFirstSaleS == null ? '—' : `${Math.round(x.sendToFirstSaleS)} s`} |`),
    '',
    `Mean fit of released jokes by batch (the learning curve; the bar is ${CUSTOMERS_BAR}):`, '',
    `| Group | ${Array.from({ length: longest }, (_, i) => `B${i + 1}`).join(' | ')} |`,
    `|---|${Array.from({ length: longest }, () => '---').join('|')}|`,
    ...s.map(({ g, x }) => `| ${g.label} | ${Array.from({ length: longest }, (_, i) => fit1(x.curve[i] ?? null)).join(' | ')} |`),
    '',
  ];
}

export function markdown(side: PilotSidecar): string {
  const checks = successChecks(side.classes);
  return [
    `# Feedback pilot — listing ${money(side.costs.listing)}, hosting ${money(side.costs.hosting)} per joke-minute — ${side.date}`, '',
    ...(side.tag ? [`_${side.tag}_`, ''] : []),
    '## Success checks', '',
    ...checks.map(c => `- **${c.pass ? 'PASS' : 'FAIL'}** — ${c.id}. ${c.name}: ${c.detail}`),
    '',
    ...(side.errors.length ? ['## Errors', '', ...side.errors.map(e => `- ${e}`), ''] : []),
    ...(side.settings.length ? ['## Settings', '', ...side.settings.map(x => `- ${x}`), ''] : []),
    `Means per team over ${side.classes.length} ${side.classes.length === 1 ? 'class' : 'classes'}. `
      + 'Fit is computed by the pilot from each released joke\'s corpus traits and the round\'s ideal; the bots never see it.', '',
    ...([1, 2] as const).filter(r => side.classes.some(c => c.rounds.some(x => x.round === r))).flatMap(r => roundSection(side.classes, r)),
  ].join('\n');
}

/* ---- The cost sweep ------------------------------------------------------ */

export const SWEEP_LISTING: readonly number[] = [0.1, 0.25, 0.5];
export const SWEEP_HOSTING: readonly number[] = [0.05, 0.1, 0.2];
/** What "cheapest" orders by: a joke listed and unsold for the whole 15-minute window. */
export const sweepCost = (c: Costs): number => c.listing + 15 * c.hosting;

export interface SweepSetting { costs: Costs; checks: Check[] }

/** The cheapest setting that passes checks 2, 3 and 5 (spec §5); null when none does. */
export function chooseDefaults(settings: readonly SweepSetting[]): Costs | null {
  const ok = settings.filter(s => [2, 3, 5].every(id => s.checks.find(c => c.id === id)?.pass));
  ok.sort((a, b) => sweepCost(a.costs) - sweepCost(b.costs) || a.costs.hosting - b.costs.hosting);
  return ok[0]?.costs ?? null;
}

export interface SweepSidecar { date: string; settings: string[]; runs: PilotSidecar[]; tag?: string }

export function sweepMarkdown(side: SweepSidecar): string {
  const rows: SweepSetting[] = side.runs.map(r => ({ costs: r.costs, checks: successChecks(r.classes) }));
  const chosen = chooseDefaults(rows);
  const mark = (s: SweepSetting, id: number) => (s.checks.find(c => c.id === id)?.pass ? 'PASS' : 'FAIL');
  return [
    `# Cost sweep — ${side.date}`, '',
    ...(side.tag ? [`_${side.tag}_`, ''] : []),
    chosen
      ? `**Chosen defaults:** listing ${money(chosen.listing)} per joke, hosting ${money(chosen.hosting)} per joke-minute (the cheapest setting that passes checks 2, 3 and 5).`
      : '**No setting passes checks 2, 3 and 5**: keep the starting values (listing $0.10, hosting $0.05) and revisit.',
    '',
    ...(side.settings.length ? ['## Settings', '', ...side.settings.map(x => `- ${x}`), ''] : []),
    '| Listing | Hosting | 1 rises | 2 profit | 3 small > large | 4 gradual | 5 costs | Teams in profit (R2) | Fees % of R1 revenue |',
    '|---|---|---|---|---|---|---|---|---|',
    ...side.runs.map((r, i) => {
      const s = rows[i];
      const all2 = rowsOf(r.classes, 2, GROUPS.map(g => g.id));
      const r1 = rowsOf(r.classes, 1, GROUPS.map(g => g.id));
      const rev = r1.reduce((n, x) => n + x.revenue, 0);
      const fees = r1.reduce((n, x) => n + x.listing + x.hosting + x.otherFees, 0);
      return `| ${money(r.costs.listing)} | ${money(r.costs.hosting)} | ${[1, 2, 3, 4, 5].map(id => mark(s, id)).join(' | ')} | `
        + `${all2.length ? pct(all2.filter(x => x.profit > 0).length / all2.length) : '—'} | ${rev > 0 ? pct(fees / rev) : '—'} |`;
    }),
    '',
    'If check 4 fails (feedback solves the puzzle too fast), the knobs are the jokes per feedback (`feedback_joke_count`, default 3) '
      + 'and the criteria shown per joke (5), not the costs.',
    '',
    ...detailOf(side.runs, chosen),
  ].join('\n');
}

/** The comparison in full for the chosen setting, else for the starting values (the first run when neither ran); headings one level down. */
function detailOf(runs: readonly PilotSidecar[], chosen: Costs | null): string[] {
  const want = chosen ?? { listing: 0.1, hosting: 0.05 };
  const run = runs.find(r => r.costs.listing === want.listing && r.costs.hosting === want.hosting) ?? runs[0];
  if (!run) return [];
  return markdown({ ...run, settings: [], tag: undefined }).split('\n').map(l => (l.startsWith('#') ? `#${l}` : l));
}

/* ---- Settings from the environment --------------------------------------- */

export interface PilotEnv {
  costs: Costs;
  /** Arrival window in seconds: 90 at 10× stands for a 15-minute round. */
  window: number;
  classes: number;
  perGroup: number;
  /** Base seed; class k plays with `${seed}-c${k}`. */
  seed: string;
  tag?: string;
}

/**
 * PILOT_LISTING and PILOT_HOSTING (classroom rates; default the starting values
 * $0.10 and $0.05), PILOT_CLASSES (3), PILOT_WINDOW (90 s), PILOT_PER_GROUP (5
 * pairs of each size), PILOT_SEED (default a fresh one) and PILOT_TAG. Throws
 * on a bad value.
 */
export function parsePilotEnv(env: Record<string, string | undefined>, now = Date.now()): PilotEnv {
  const num = (name: string, ok: (v: number) => boolean, rule: string, fallback: number): number => {
    const raw = env[name];
    if (raw === undefined || raw.trim() === '') return fallback;
    const v = Number(raw);
    if (!Number.isFinite(v) || !ok(v)) throw new Error(`${name} must be ${rule}, got ${raw}`);
    return v;
  };
  const whole = (v: number) => Number.isInteger(v) && v >= 1;
  return {
    costs: {
      listing: num('PILOT_LISTING', v => v >= 0, 'a number >= 0', 0.1),
      hosting: num('PILOT_HOSTING', v => v >= 0, 'a number >= 0', 0.05),
    },
    window: num('PILOT_WINDOW', whole, 'an integer >= 1', 90),
    classes: num('PILOT_CLASSES', whole, 'an integer >= 1', 3),
    perGroup: num('PILOT_PER_GROUP', whole, 'an integer >= 1', 5),
    seed: env.PILOT_SEED?.trim() || `feedback-${now}`,
    tag: env.PILOT_TAG?.trim() || undefined,
  };
}

/** The Settings lines of a report. */
export function settingsLines(e: PilotEnv, speed: number): string[] {
  return [
    `One class = ${4 * e.perGroup} bot teams (${e.perGroup} matched pairs of each batch size), Balanced pace, bots at ${speed}×, `
      + `trait classifier; Round 1 then Round 2; ${e.classes} ${e.classes === 1 ? 'class' : 'classes'}, seeds ${e.seed}-c1… .`,
    'Round 1: batches of 5 for everyone. Round 2: small teams send 3, large teams 10. Every Marketing seat releases every joke.',
    `Costs (classroom rates): listing $${e.costs.listing} per released joke, hosting $${e.costs.hosting} per joke-minute `
      + `(sent ×${speed}, $${Number((e.costs.hosting * speed).toFixed(4))}, because the backend charges per wall-clock minute). `
      + 'Shipping, storage and discard 0.',
    `Arrival window ${e.window} s (${Math.round((e.window * speed) / 60)} class minutes). The ideal is the pilot ideal `
      + `(config/dimensions DEFAULT_IDEAL_PROFILE) in both rounds. The bar is the customers' default buy threshold, ${CUSTOMERS_BAR}.`,
  ];
}
