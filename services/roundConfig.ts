/**
 * Pure helpers for the instructor's Setup tab: what the Customer budget box
 * shows, the settings Apply sends and the lock banner.
 */
import { changedFees, feeValuesOf, type FeeConfigValues } from './feeConfig';
import type { ApiInstructorRound, GameConfig } from '../types';
import { DEFAULT_IDEAL_PROFILE, IDEAL_DIMENSIONS } from '../config/dimensions';
import type { PhaseStatuses } from './instructorPhase';

/** The backend's default customer budget (domain defaults), used before any round has been read. */
export const DEFAULT_CUSTOMER_BUDGET = 3;

/**
 * The budget to show: the round's stored value whenever it sends a usable one
 * (above 0), whatever the round's status. It used to be read only once a round
 * was ACTIVE or ENDED, so a CONFIGURED round kept the front end's own default
 * (10) on screen while the server held 3 — and Start then sent that 10. A
 * placeholder 0 or a missing field keeps the value already known.
 */
export function customerBudgetFromRound(
  round: { customer_budget?: unknown; status?: unknown } | null | undefined,
  known: number,
): number {
  const stored = Number(round?.customer_budget);
  return Number.isFinite(stored) && stored > 0 ? stored : known;
}

/**
 * What the stored round (GET /config) puts back on the instructor screen after a reload: the
 * hidden ideal joke and the numbers the CONFIG row shows (the screen does not show the cost of discard, so it is not read). The profile is always returned whole
 * (a default for any dimension the round lacks, nothing for TITLE_FIT or an unknown key), so the
 * picker never shows a blank. Numbers the round does not send are left out, so a spread over the
 * current config keeps what it had.
 */
export function configFromInstructorRound(
  round: Partial<ApiInstructorRound> | null | undefined,
): Partial<Pick<GameConfig, 'idealProfile' | 'customerBudget' | 'marketPrice' | 'costOfPublishing'>> {
  const stored: Record<string, unknown> = round?.ideal_profile ?? {};
  const idealProfile: Record<string, string> = { ...DEFAULT_IDEAL_PROFILE };
  for (const dim of IDEAL_DIMENSIONS) {
    const v = stored[dim.id];
    if (typeof v === 'string' && v !== '') idealProfile[dim.id] = v;
  }
  const out: ReturnType<typeof configFromInstructorRound> = { idealProfile };
  const budget = Number(round?.customer_budget);
  if (Number.isFinite(budget) && budget > 0) out.customerBudget = budget;
  const price = Number(round?.market_price);
  if (round?.market_price != null && Number.isFinite(price) && price > 0) out.marketPrice = price;
  const publishing = Number(round?.cost_of_publishing);
  if (round?.cost_of_publishing != null && Number.isFinite(publishing) && publishing >= 0) out.costOfPublishing = publishing;
  return out;
}

export type StoredConfigFields = ReturnType<typeof configFromInstructorRound>;

export interface StoredConfigContext {
  /** The round the result was fetched for is still the round in view. */
  roundStillViewed: boolean;
  /** Nothing has been read back yet this session, so nothing on screen is known. */
  isFirstLoad: boolean;
  /** Config keys the instructor edited while the fetch was in flight; they win. */
  editedKeys: ReadonlySet<keyof GameConfig>;
  /** Round 1's stored round, read on first load when the viewed Round 2 has no profile (needsRound1Config). */
  inheritFrom?: Partial<ApiInstructorRound> | null;
}

const hasStoredProfile = (round: Partial<ApiInstructorRound> | null | undefined): boolean =>
  Object.keys(round?.ideal_profile ?? {}).length > 0;

/**
 * Whether a first-load read of Round 2 also needs Round 1's stored round: after a reload
 * between rounds the viewed round is Round 2, which has no ideal_profile until it starts, and
 * Round 2 inherits Round 1's ideal joke and prices (R23) rather than the defaults.
 */
export function needsRound1Config(
  round: Partial<ApiInstructorRound> | null | undefined,
  ctx: { isFirstLoad: boolean; viewedRound: 1 | 2 },
): boolean {
  return ctx.isFirstLoad && ctx.viewedRound === 2 && !hasStoredProfile(round);
}

/**
 * The part of a GET /config result that may go on the screen (spread it over the config).
 *  - A result for a round that is no longer in view changes nothing.
 *  - A round with a stored ideal_profile gives its profile and numbers.
 *  - A round without one is "never configured" (the GET cannot tell it from defaults): on first
 *    load it gives Round 1's profile and numbers when `inheritFrom` has them, else the default
 *    profile and its own numbers; on a round change it changes nothing, so Round 2 keeps
 *    Round 1's ideal joke and prices on screen, as it did before this read-back.
 *  - Keys the instructor edited while the fetch was in flight are left out.
 */
export function storedConfigPatch(
  round: Partial<ApiInstructorRound> | null | undefined,
  ctx: StoredConfigContext,
): StoredConfigFields {
  if (!ctx.roundStillViewed) return {};
  const stored = hasStoredProfile(round);
  if (!stored && !ctx.isFirstLoad) return {};
  const source = !stored && hasStoredProfile(ctx.inheritFrom) ? ctx.inheritFrom : round;
  const patch: Record<string, unknown> = { ...configFromInstructorRound(source) };
  for (const key of ctx.editedKeys) delete patch[key];
  return patch as StoredConfigFields;
}

/**
 * Whether the first load is over after a GET /config read resolves (success or failure). Once a
 * read for the round in view has resolved, a later round change is not a first load, so a failed
 * first read cannot let Round 2's defaults overwrite Round 1's setup. A read for a round that is
 * no longer in view settles nothing; nothing unsettles it but a new session.
 */
export function storedConfigSettled(wasSettled: boolean, roundStillViewed: boolean): boolean {
  return wasSettled || roundStillViewed;
}

/**
 * True when a GET /config failure means this backend has no such route (405, or a 404 that is not
 * the domain NOT_FOUND envelope, which is how a real route answers for an unknown round).
 */
export function isRouteMissing(e: { status: number; code?: string }): boolean {
  return e.status === 405 || (e.status === 404 && e.code !== 'NOT_FOUND');
}

export { arrivalSecondsFromMinutes } from './feeConfig';

/** The Setup tab's edits in progress: the Classic numbers and the shared Lean settings. */
export interface SetupValues {
  budget: number;
  marketPrice: number;
  costOfPublishing: number;
  fees: FeeConfigValues;
}

export function setupValuesOf(config: GameConfig): SetupValues {
  return {
    budget: config.customerBudget,
    marketPrice: config.marketPrice,
    costOfPublishing: config.costOfPublishing,
    fees: feeValuesOf(config),
  };
}

export interface ApplyInputs {
  local: SetupValues;
  config: GameConfig;
  canEditBudget: boolean;
  canEditPricing: boolean;
  canEditLean: boolean;
}

/**
 * The updateConfig patch Apply sends: only fields the instructor changed and
 * the screen allows. Never the budget or a customer count that was not edited
 * (the server does not lock customer_count after the start, so a stale send
 * would overwrite the real count). Its keys are also the Setup tab's change count.
 */
export function buildApplyUpdates(i: ApplyInputs): Partial<GameConfig> {
  const { local, config } = i;
  const updates: Partial<GameConfig> = {};
  if (i.canEditBudget && local.budget !== config.customerBudget) updates.customerBudget = local.budget;
  if (i.canEditPricing && local.marketPrice !== config.marketPrice) updates.marketPrice = local.marketPrice;
  if (i.canEditPricing && local.costOfPublishing !== config.costOfPublishing) updates.costOfPublishing = local.costOfPublishing;
  // The fees, the arrival window and customers per team (shared Lean settings).
  if (i.canEditLean) Object.assign(updates, changedFees(local.fees, config));
  return updates;
}

/**
 * The Setup tab's lock banner, or null when nothing is locked (the lobby) or the
 * statuses are not known yet. While a round runs every setting and the ideal joke
 * are locked; between rounds Round 1's settings are; after both, all of them.
 */
export function setupLockText(statuses: PhaseStatuses): string | null {
  const running = statuses[2] === 'ACTIVE' ? 2 : statuses[1] === 'ACTIVE' ? 1 : null;
  if (running) return `Round ${running} is running. Settings are locked until it ends; the ideal joke is locked too.`;
  if (statuses[1] === 'ENDED' && statuses[2] === 'ENDED') return 'Both rounds are over. Settings are read-only.';
  if (statuses[1] === 'ENDED') return 'Round 1 is over and its settings are locked. Changes now apply to Round 2.';
  return null;
}
