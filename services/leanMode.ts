/**
 * Lean market mode — pure helpers shared by the views.
 *
 * The backend decides the rules (jokefactory_be: market_mode on the round).
 * The frontend only reads them off the public round and renders lean
 * controls and tiles when the round is LEAN. Everything here tolerates a
 * backend that predates the feature: missing fields read as CLASSIC.
 */
export type MarketMode = 'CLASSIC' | 'LEAN';

export interface LeanRoundFields {
  market_mode?: string;
  arrival_window_seconds?: number;
  setup_cost_per_batch?: number;
  carrying_cost_per_joke_minute?: number;
  wip_limit?: number;
}

export interface LeanConfig {
  marketMode: MarketMode;
  arrivalWindowSeconds: number;
  setupCostPerBatch: number;
  carryingCostPerJokeMinute: number;
  wipLimit: number;
}

export const LEAN_DEFAULTS: LeanConfig = {
  marketMode: 'CLASSIC', arrivalWindowSeconds: 900, setupCostPerBatch: 0, carryingCostPerJokeMinute: 0, wipLimit: 0,
};

/**
 * Round settings the class preset writes beyond the GameConfig lean fields.
 * Only the preset sets these; context.updateConfig never sends them.
 */
export interface LeanPresetConfig extends Partial<LeanConfig> {
  /** How sharply customers prefer jokes that fit the hidden ideal. */
  preferenceBase?: number;
  /** AI customers per round. */
  customerCount?: number;
}

/**
 * The one-click class preset: Round 1 push, Round 2 lean. Values come from the
 * bot pilot (docs/pilots/2026-10-06-lean-pilot-tuning4.md), the first tuning
 * where Round 2 beat Round 1 on mean profit (+$0.69 vs -$8.64):
 * - setup $2.00 (R1) vs $0.50 (R2): a big-batch round pays for each changeover,
 *   and small batches only pay off once changeovers are cheap.
 * - carrying $0.05 per joke-minute, both rounds: inventory waiting in Marketing
 *   or unsold on the shelf has to cost enough to be felt.
 * - WIP 0 (R1, push) vs 2 (R2, pull): Round 2 caps batches waiting in Marketing.
 * - preference_base 3: fit matters enough that learning what sells pays.
 * - 150 customers: enough demand that a well-aimed small batch sells through.
 * The arrival window keeps its 900 s default. The pilot ran bots at 10x and
 * scaled carrying by 10 to match; these are the real-time values for a class.
 */
export const LEAN_CLASS_PRESET: Record<1 | 2, LeanPresetConfig> = {
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
  };
}

export function wipStatus(waiting: number, limit: number): { blocked: boolean; label: string | null } {
  if (limit <= 0) return { blocked: false, label: null };
  const blocked = waiting >= limit;
  const base = `Marketing has ${waiting} of ${limit} batches waiting`;
  return { blocked, label: blocked ? `${base} — wait, or go help` : base };
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

/** The backend reports a WIP refusal as 409 CONFLICT with this prefix in the message. */
export const WIP_LIMIT_MESSAGE = 'WIP_LIMIT_REACHED';

/** True for the backend's 409 refusal of a Lean submit beyond the WIP limit. */
export function isWipLimitReached(e: unknown): boolean {
  const err = e as { status?: unknown; message?: unknown } | null;
  return Boolean(err) && err!.status === 409 && String(err!.message ?? '').includes(WIP_LIMIT_MESSAGE);
}

/** What the Joke Maker sees when the backend refuses a submit at the WIP limit. */
export const WIP_LIMIT_TEXT = 'Marketing still has batches waiting. In a pull system you wait — or go help them decide.';

/** The backend refuses a market-mode change after the round started with this prefix. */
export const MARKET_MODE_LOCKED_MESSAGE = 'MARKET_MODE_LOCKED';

/** What the instructor sees when the backend refuses a market-mode change. */
export const MARKET_MODE_LOCKED_TEXT = "The market mode can't change once a round has started.";

/** True for the backend's 409 refusal to change market_mode after a round started. */
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
}

/**
 * GameConfig (camelCase) lean keys → the POST /config body (snake_case), the
 * same mapping context.updateConfig uses. Absent keys stay absent so the
 * backend keeps the round's current value.
 */
export function leanConfigToBody(c: LeanPresetConfig): LeanConfigBody {
  const body: LeanConfigBody = {};
  if (c.marketMode !== undefined) body.market_mode = c.marketMode;
  if (c.arrivalWindowSeconds !== undefined) body.arrival_window_seconds = c.arrivalWindowSeconds;
  if (c.setupCostPerBatch !== undefined) body.setup_cost_per_batch = c.setupCostPerBatch;
  if (c.carryingCostPerJokeMinute !== undefined) body.carrying_cost_per_joke_minute = c.carryingCostPerJokeMinute;
  if (c.wipLimit !== undefined) body.wip_limit = c.wipLimit;
  if (c.preferenceBase !== undefined) body.preference_base = c.preferenceBase;
  if (c.customerCount !== undefined) body.customer_count = c.customerCount;
  return body;
}

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
