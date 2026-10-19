/* The shared Lean settings on the instructor's Setup tab as pure values: the
   arrival window, customers per team and the five fees, what Apply sends for
   them, the shipping order rule and the arrival minutes box. Kept out of
   FeeConfigFields so services/roundConfig.ts can use them without importing a
   component. */
import type { GameConfig } from '../types';

export interface FeeConfigValues {
  arrivalWindowSeconds: number;
  shippingFeeSmall: number;
  shippingFeeStandard: number;
  shippingFeeLarge: number;
  storageFeePerJokeMinute: number;
  hostingFeePerJokeMinute: number;
  /** AI customers per team; 0 = the fixed customer count. Shared like the fees. */
  customersPerTeam: number;
}

export const FEE_KEYS = [
  'arrivalWindowSeconds', 'shippingFeeSmall', 'shippingFeeStandard', 'shippingFeeLarge',
  'storageFeePerJokeMinute', 'hostingFeePerJokeMinute', 'customersPerTeam',
] as const satisfies ReadonlyArray<keyof FeeConfigValues>;

export function feeValuesOf(config: FeeConfigValues): FeeConfigValues {
  return {
    arrivalWindowSeconds: config.arrivalWindowSeconds,
    shippingFeeSmall: config.shippingFeeSmall,
    shippingFeeStandard: config.shippingFeeStandard,
    shippingFeeLarge: config.shippingFeeLarge,
    storageFeePerJokeMinute: config.storageFeePerJokeMinute,
    hostingFeePerJokeMinute: config.hostingFeePerJokeMinute,
    customersPerTeam: config.customersPerTeam,
  };
}

/**
 * The updateConfig patch for what changed. The arrival window is clamped to a
 * whole number of at least 1 second (0 would bring every customer at once),
 * customers per team to a whole number from 0 to 1000 (the server's range); a
 * value that is not a number is left out, so the server keeps its own.
 */
export function changedFees(local: FeeConfigValues, config: FeeConfigValues): Partial<GameConfig> {
  const out: Partial<GameConfig> = {};
  for (const k of FEE_KEYS) {
    const v = local[k];
    if (v === config[k] || !Number.isFinite(v)) continue;
    out[k] = k === 'arrivalWindowSeconds' ? Math.max(1, Math.round(v || 0))
      : k === 'customersPerTeam' ? Math.min(1000, Math.max(0, Math.round(v)))
      : v;
  }
  return out;
}

export const SHIPPING_ORDER_TEXT = 'Shipping fees must rise with batch size: 1–4 jokes ≤ 5 jokes ≤ 6–10 jokes.';

/**
 * The server refuses shipping fees that fall with batch size (400
 * VALIDATION_ERROR), so the form checks first: small ≤ standard ≤ large.
 * A value that is not a number is ignored here (changedFees leaves it out).
 */
export function shippingOrderError(v: Pick<FeeConfigValues, 'shippingFeeSmall' | 'shippingFeeStandard' | 'shippingFeeLarge'>): string | null {
  const tiers = [v.shippingFeeSmall, v.shippingFeeStandard, v.shippingFeeLarge].filter(Number.isFinite);
  return tiers.every((x, i) => i === 0 || tiers[i - 1] <= x) ? null : SHIPPING_ORDER_TEXT;
}


/** The arrival window is entered in minutes; the backend takes whole seconds (a fraction is a 400). */
export function arrivalSecondsFromMinutes(min: number): number {
  return Math.round(min * 60);
}

/** The arrival window as the minutes box shows it: 900 s reads 15, 90 s reads 1.5. */
export const arrivalMinutesOf = (seconds: number): number => Number((seconds / 60).toFixed(2));

/**
 * The minutes box's text: what the instructor is typing (draft) while the box is
 * focused, else the stored window. The window is whole seconds, so 1.24 min is
 * sent as 74 s and reads back 1.23; the draft keeps that from rewriting the box
 * mid-typing.
 */
export function arrivalBoxText(draft: string | null, seconds: number): string {
  return draft ?? String(arrivalMinutesOf(seconds));
}
