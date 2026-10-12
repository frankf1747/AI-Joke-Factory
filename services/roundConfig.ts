/**
 * Pure helpers for the instructor's CONFIG row: what the Customer Budget box
 * shows, and the settings Apply sends.
 */
import { changedFees, type FeeConfigValues } from '../components/FeeConfigFields';
import type { GameConfig } from '../types';

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

export interface ApplyInputs {
  local: {
    budget: number; marketPrice: number; costOfPublishing: number;
    nudge1: number; nudge2: number; fees: FeeConfigValues;
  };
  config: GameConfig;
  canEditBudget: boolean;
  canEditPricing: boolean;
  canEditNudges: boolean;
  canEditLean: boolean;
}

/**
 * The updateConfig patch Apply sends: only fields the instructor changed and
 * the screen allows. Never the budget or a customer count that was not edited
 * (the server does not lock customer_count after the start, so a stale send
 * would overwrite the real count).
 */
export function buildApplyUpdates(i: ApplyInputs): Partial<GameConfig> {
  const { local, config } = i;
  const updates: Partial<GameConfig> = {};
  if (i.canEditBudget && local.budget !== config.customerBudget) updates.customerBudget = local.budget;
  if (i.canEditPricing && local.marketPrice !== config.marketPrice) updates.marketPrice = local.marketPrice;
  if (i.canEditPricing && local.costOfPublishing !== config.costOfPublishing) updates.costOfPublishing = local.costOfPublishing;
  // Clamped: a 0s nudge would fire the instant Marketing lands on the view.
  if (i.canEditNudges && local.nudge1 !== config.marketingNudge1Seconds) updates.marketingNudge1Seconds = Math.max(5, local.nudge1);
  if (i.canEditNudges && local.nudge2 !== config.marketingNudge2Seconds) updates.marketingNudge2Seconds = Math.max(5, local.nudge2);
  // The fees, the arrival window and customers per team (shared Lean settings).
  if (i.canEditLean) Object.assign(updates, changedFees(local.fees, config));
  return updates;
}
