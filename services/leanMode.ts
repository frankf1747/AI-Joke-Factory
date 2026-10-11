/**
 * Lean market mode — pure helpers shared by the views.
 *
 * The backend decides the rules (jokefactory_be: market_mode and the fees on
 * the round). Lean is the only mode this branch plays: one rule set and one
 * set of fees for both rounds; only the batch size differs (Round 1 exactly
 * 5, Round 2 up to 10). The frontend reads the rules off the public round.
 * Everything here tolerates a backend that predates a field: a missing mode
 * reads as CLASSIC and a missing fee as 0 (that backend does not charge it).
 */
export type MarketMode = 'CLASSIC' | 'LEAN';

export interface LeanRoundFields {
  market_mode?: string;
  arrival_window_seconds?: number;
  setup_cost_per_batch?: number;
  carrying_cost_per_joke_minute?: number;
  wip_limit?: number;
  shipping_fee_small?: number;
  shipping_fee_standard?: number;
  shipping_fee_large?: number;
  storage_fee_per_joke_minute?: number;
  hosting_fee_per_joke_minute?: number;
}

/** The shipping tiers: small 1–4 jokes, standard exactly 5, large 6 or more. */
export interface ShippingFees {
  shippingFeeSmall: number;
  shippingFeeStandard: number;
  shippingFeeLarge: number;
}

/** The five Lean fees, as GameConfig carries them. */
export interface LeanFeeConfig extends ShippingFees {
  /** Per joke per minute a batch waits on Marketing's desk. */
  storageFeePerJokeMinute: number;
  /** Per joke per minute a released joke waits for its first sale. */
  hostingFeePerJokeMinute: number;
}

export interface LeanConfig extends LeanFeeConfig {
  marketMode: MarketMode;
  arrivalWindowSeconds: number;
  /** Stored by the backend but no longer charged (replaced by the fees). */
  setupCostPerBatch: number;
  /** Stored by the backend but no longer charged (replaced by the fees). */
  carryingCostPerJokeMinute: number;
  wipLimit: number;
}

export const LEAN_DEFAULTS: LeanConfig = {
  marketMode: 'CLASSIC', arrivalWindowSeconds: 900, setupCostPerBatch: 0, carryingCostPerJokeMinute: 0, wipLimit: 0,
  shippingFeeSmall: 0, shippingFeeStandard: 0, shippingFeeLarge: 0, storageFeePerJokeMinute: 0, hostingFeePerJokeMinute: 0,
};

/** The standard shipment: an unsplit batch counts as this many jokes for its fees. */
export const STANDARD_SHIPMENT_JOKES = 5;

/**
 * Round settings a caller may send beyond the GameConfig lean fields. The bot
 * pilot sets these; context.updateConfig never sends them.
 */
export interface LeanConfigUpdate extends Partial<LeanConfig> {
  /** How sharply customers prefer jokes that fit the hidden ideal. */
  preferenceBase?: number;
  /** AI customers per round. */
  customerCount?: number;
}

/**
 * @deprecated The two-rule-set class preset of the first Lean design (Round 1
 * push, Round 2 WIP-limited pull). Only scripts/pilot/lean-pilot.mts still
 * reads it; the instructor screen no longer offers it.
 */
export const LEAN_CLASS_PRESET: Record<1 | 2, LeanConfigUpdate> = {
  1: { marketMode: 'LEAN', setupCostPerBatch: 2, carryingCostPerJokeMinute: 0.05, wipLimit: 0, preferenceBase: 3, customerCount: 150 },
  2: { marketMode: 'LEAN', setupCostPerBatch: 0.5, carryingCostPerJokeMinute: 0.05, wipLimit: 2, preferenceBase: 3, customerCount: 150 },
};

export function isLeanRound(round: LeanRoundFields | null | undefined): boolean {
  return round?.market_mode === 'LEAN';
}

export function leanConfigFromRound(round: LeanRoundFields | null | undefined): LeanConfig {
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
  return {
    marketMode: isLeanRound(round) ? 'LEAN' : 'CLASSIC',
    arrivalWindowSeconds: num(round?.arrival_window_seconds, LEAN_DEFAULTS.arrivalWindowSeconds),
    setupCostPerBatch: num(round?.setup_cost_per_batch, LEAN_DEFAULTS.setupCostPerBatch),
    carryingCostPerJokeMinute: num(round?.carrying_cost_per_joke_minute, LEAN_DEFAULTS.carryingCostPerJokeMinute),
    wipLimit: num(round?.wip_limit, LEAN_DEFAULTS.wipLimit),
    shippingFeeSmall: num(round?.shipping_fee_small, LEAN_DEFAULTS.shippingFeeSmall),
    shippingFeeStandard: num(round?.shipping_fee_standard, LEAN_DEFAULTS.shippingFeeStandard),
    shippingFeeLarge: num(round?.shipping_fee_large, LEAN_DEFAULTS.shippingFeeLarge),
    storageFeePerJokeMinute: num(round?.storage_fee_per_joke_minute, LEAN_DEFAULTS.storageFeePerJokeMinute),
    hostingFeePerJokeMinute: num(round?.hosting_fee_per_joke_minute, LEAN_DEFAULTS.hostingFeePerJokeMinute),
  };
}

export function wipStatus(waiting: number, limit: number): { blocked: boolean; label: string | null } {
  if (limit <= 0) return { blocked: false, label: null };
  const blocked = waiting >= limit;
  const base = `Marketing has ${waiting} of ${limit} batches waiting`;
  return { blocked, label: blocked ? `${base} — wait, or go help` : base };
}

/**
 * The shipping fee of one batch with this many jokes: small for 1–4, standard
 * for exactly 5, large for 6 or more. An unknown count (a batch Marketing has
 * not split: 0, negative or not a number) ships as the standard 5.
 */
export function shippingFeeFor(jokes: number, c: ShippingFees): number {
  const n = Number.isFinite(jokes) && jokes > 0 ? jokes : STANDARD_SHIPMENT_JOKES;
  if (n < STANDARD_SHIPMENT_JOKES) return c.shippingFeeSmall;
  if (n === STANDARD_SHIPMENT_JOKES) return c.shippingFeeStandard;
  return c.shippingFeeLarge;
}

/**
 * Money with a leading sign and two decimals, rounding half away from zero.
 * The cent count is taken to 12 significant digits before rounding, which
 * absorbs binary representation error: 1.005 * 100 is 100.49999999999999 in
 * floating point, so a plain Math.round (or toFixed(2)) would give $1.00.
 */
export function fmtMoney(v: number): string {
  const cents = Math.round(Number((Math.abs(v) * 100).toPrecision(12)));
  const abs = (cents / 100).toFixed(2);
  return v < 0 && cents > 0 ? `-$${abs}` : `$${abs}`;
}

/** A fee in copy: whole dollars without cents ("$2"), otherwise as fmtMoney ("$0.50"). */
export function fmtFee(v: number): string {
  const cents = Math.round(Number((Math.abs(v) * 100).toPrecision(12)));
  return cents % 100 === 0 ? `${v < 0 && cents > 0 ? '-' : ''}$${cents / 100}` : fmtMoney(v);
}

/**
 * A per-minute rate: in cents below $1 ("10¢", "5¢", "2.5¢"), in dollars from
 * $1 up ("$1.00"). Never more than two decimals of a cent.
 */
export function fmtCents(v: number): string {
  if (Math.abs(v) >= 1) return fmtMoney(v);
  const cents = Number((v * 100).toFixed(2));
  return `${cents}¢`;
}

/** "10¢ a joke each minute" — the storage or hosting fee as students read it. */
export function fmtPerMinute(v: number): string {
  return `${fmtCents(v)} a joke each minute`;
}

/** The backend reports a WIP refusal as 409 CONFLICT with this prefix in the message. */
export const WIP_LIMIT_MESSAGE = 'WIP_LIMIT_REACHED';

/** True for the backend's 409 refusal of a Lean submit beyond the WIP limit. */
export function isWipLimitReached(e: unknown): boolean {
  const err = e as { status?: unknown; message?: unknown } | null;
  return Boolean(err) && err!.status === 409 && String(err!.message ?? '').includes(WIP_LIMIT_MESSAGE);
}

/** What the Joke Maker sees when the backend refuses a submit at the WIP limit. */
export const WIP_LIMIT_TEXT = 'Marketing still has batches waiting. In a pull system you wait — or go help them decide.';

/** The backend refuses a Lean setting change after the round started with this prefix. */
export const MARKET_MODE_LOCKED_MESSAGE = 'MARKET_MODE_LOCKED';

/** What the instructor sees when the backend refuses a fee or market change after the start. */
export const MARKET_MODE_LOCKED_TEXT = "Fees and Lean settings can't change once a round has started.";

/** True for the backend's 409 refusal to change Lean settings after a round started. */
export function isMarketModeLocked(e: unknown): boolean {
  const err = e as { status?: unknown; message?: unknown } | null;
  return Boolean(err) && err!.status === 409 && String(err!.message ?? '').includes(MARKET_MODE_LOCKED_MESSAGE);
}

export interface LeanConfigBody {
  market_mode?: MarketMode;
  arrival_window_seconds?: number;
  setup_cost_per_batch?: number;
  carrying_cost_per_joke_minute?: number;
  wip_limit?: number;
  preference_base?: number;
  customer_count?: number;
  shipping_fee_small?: number;
  shipping_fee_standard?: number;
  shipping_fee_large?: number;
  storage_fee_per_joke_minute?: number;
  hosting_fee_per_joke_minute?: number;
}

/**
 * GameConfig (camelCase) lean keys → the POST /config body (snake_case), the
 * same mapping context.updateConfig uses. Absent keys stay absent so the
 * backend keeps the round's current value.
 */
export function leanConfigToBody(c: LeanConfigUpdate): LeanConfigBody {
  const body: LeanConfigBody = {};
  if (c.marketMode !== undefined) body.market_mode = c.marketMode;
  if (c.arrivalWindowSeconds !== undefined) body.arrival_window_seconds = c.arrivalWindowSeconds;
  if (c.setupCostPerBatch !== undefined) body.setup_cost_per_batch = c.setupCostPerBatch;
  if (c.carryingCostPerJokeMinute !== undefined) body.carrying_cost_per_joke_minute = c.carryingCostPerJokeMinute;
  if (c.wipLimit !== undefined) body.wip_limit = c.wipLimit;
  if (c.preferenceBase !== undefined) body.preference_base = c.preferenceBase;
  if (c.customerCount !== undefined) body.customer_count = c.customerCount;
  if (c.shippingFeeSmall !== undefined) body.shipping_fee_small = c.shippingFeeSmall;
  if (c.shippingFeeStandard !== undefined) body.shipping_fee_standard = c.shippingFeeStandard;
  if (c.shippingFeeLarge !== undefined) body.shipping_fee_large = c.shippingFeeLarge;
  if (c.storageFeePerJokeMinute !== undefined) body.storage_fee_per_joke_minute = c.storageFeePerJokeMinute;
  if (c.hostingFeePerJokeMinute !== undefined) body.hosting_fee_per_joke_minute = c.hostingFeePerJokeMinute;
  return body;
}

/** A team's three Lean fees so far, in dollars. */
export interface LeanFees { shipping: number; storage: number; hosting: number }

/**
 * Shipping, storage and hosting from a Lean stats block. A backend that
 * predates the fee names sends only setup_cost and carrying_cost: shipping then
 * reads setup_cost, storage reads the whole carrying_cost (it cannot be split)
 * and hosting 0, so the three still add up to what that backend charged.
 * Anything missing or not a number reads as 0, never NaN.
 */
export function leanFeesOf(
  lean: { shipping_cost?: unknown; storage_cost?: unknown; hosting_cost?: unknown; setup_cost?: unknown; carrying_cost?: unknown } | null | undefined,
): LeanFees {
  const num = (v: unknown): number | null => {
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
    return Number.isFinite(n) ? n : null;
  };
  if (!lean) return { shipping: 0, storage: 0, hosting: 0 };
  const split = num(lean.storage_cost) != null || num(lean.hosting_cost) != null;
  return {
    shipping: num(lean.shipping_cost) ?? num(lean.setup_cost) ?? 0,
    storage: split ? num(lean.storage_cost) ?? 0 : num(lean.carrying_cost) ?? 0,
    hosting: split ? num(lean.hosting_cost) ?? 0 : 0,
  };
}

/** Sort keys of the leaderboard's Lean columns. */
export type LeanSortKey = 'shipping_cost' | 'storage_cost' | 'hosting_cost' | 'lead_time_s' | 'sale_time_s';

/** The leaderboard's Lean columns, in order (views/Instructor.tsx). */
export const LEAN_LEADERBOARD_COLUMNS: ReadonlyArray<{ key: LeanSortKey; label: string; title: string }> = [
  { key: 'shipping_cost', label: 'Shipping', title: 'Shipping fees: every batch sent, priced by its size' },
  { key: 'storage_cost', label: 'Storage', title: "Storage fees: jokes waiting on Marketing's desk, per minute" },
  { key: 'hosting_cost', label: 'Hosting', title: 'Hosting fees: released jokes unsold on the shelf, per minute' },
  { key: 'lead_time_s', label: 'Lead', title: 'Average lead time: batch sent to joke released' },
  { key: 'sale_time_s', label: 'Sale', title: 'Average time from release to first sale' },
];

/** One learning-curve point: a batch's sell-through (sold ÷ published). */
export interface LearningCurvePoint { seq: number; rate: number }

/**
 * Sold ÷ published per batch, in submission order — the team's learning curve.
 * Batches with nothing published have no sell-through and are left out; the
 * rate is clamped to [0, 1] so a stray count can't push the line off the chart.
 */
export function learningCurvePoints(
  series: ReadonlyArray<{ seq: number; published: number; sold: number }> | null | undefined,
): LearningCurvePoint[] {
  return [...(series ?? [])]
    .filter(p => p.published > 0)
    .sort((a, b) => a.seq - b.seq)
    .map(p => ({ seq: p.seq, rate: Math.min(1, Math.max(0, p.sold / p.published)) }));
}

/**
 * Jokes published but never sold, for a Lean row: the sum over submitted
 * batches of (published − sold), each floored at 0. The backend's
 * unsold_jokes is max(published − sales, 0), and one joke can sell many
 * times, so it reads 0 even when many jokes never sold. Returns null when the
 * row has no lean stats (a Classic round), so callers keep the classic figure.
 */
export function neverSold(
  lean: { batch_series?: Array<{ published: number; sold: number }> | null } | null | undefined,
): number | null {
  if (!lean) return null;
  return (lean.batch_series ?? []).reduce(
    (n, b) => n + Math.max(0, (Number(b.published) || 0) - (Number(b.sold) || 0)),
    0,
  );
}
