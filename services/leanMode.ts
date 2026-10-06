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

/** The one-click class preset from the spec: Round 1 push, Round 2 lean. */
export const LEAN_CLASS_PRESET: Record<1 | 2, Partial<LeanConfig>> = {
  1: { marketMode: 'LEAN', setupCostPerBatch: 3, carryingCostPerJokeMinute: 0.02, wipLimit: 0 },
  2: { marketMode: 'LEAN', setupCostPerBatch: 1, carryingCostPerJokeMinute: 0.02, wipLimit: 2 },
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
}

/**
 * GameConfig (camelCase) lean keys → the POST /config body (snake_case), the
 * same mapping context.updateConfig uses. Absent keys stay absent so the
 * backend keeps the round's current value.
 */
export function leanConfigToBody(c: Partial<LeanConfig>): LeanConfigBody {
  const body: LeanConfigBody = {};
  if (c.marketMode !== undefined) body.market_mode = c.marketMode;
  if (c.arrivalWindowSeconds !== undefined) body.arrival_window_seconds = c.arrivalWindowSeconds;
  if (c.setupCostPerBatch !== undefined) body.setup_cost_per_batch = c.setupCostPerBatch;
  if (c.carryingCostPerJokeMinute !== undefined) body.carrying_cost_per_joke_minute = c.carryingCostPerJokeMinute;
  if (c.wipLimit !== undefined) body.wip_limit = c.wipLimit;
  return body;
}
