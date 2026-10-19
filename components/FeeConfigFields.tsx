/* The Lean settings on the instructor's Setup tab: the arrival window (Round
   timing), customers per team (Market) and the five fees (Costs). One rule set
   for both rounds, so there is no market mode, preset or WIP limit to choose.
   Apply writes them to every round still being configured (both rounds before
   the class starts); a round that has started is locked. */
import React from 'react';
import type { GameConfig } from '../types';
import { customersHint } from '../services/leanMode';
import { arrivalSecondsFromMinutes } from '../services/roundConfig';
import { SetupField, SetupInput } from './instructor/SetupField';

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

const FEE_KEYS = [
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

/** The arrival window as the minutes box shows it: 900 s reads 15, 90 s reads 1.5. */
const minutesOf = (seconds: number) => Number((seconds / 60).toFixed(2));

const SHIPPING_TIERS = [
  { key: 'shippingFeeSmall', id: 'cfg-shipping-small', size: '1–4 jokes' },
  { key: 'shippingFeeStandard', id: 'cfg-shipping-standard', size: '5 jokes' },
  { key: 'shippingFeeLarge', id: 'cfg-shipping-large', size: '6–10 jokes' },
] as const;

export const FeeConfigFields: React.FC<{
  /** Which group of the Setup tab these fields sit in. */
  part: 'timing' | 'market' | 'costs';
  values: FeeConfigValues;
  onChange: (next: FeeConfigValues) => void;
  /** True once the selected round has started (or while one runs). */
  disabled: boolean;
  /** Tooltip while locked. */
  lockHint: string;
  /** Teams with a Joke Maker or Marketing in the lobby, for the customers hint. */
  teamCount?: number;
  /** The settings Apply would send, each outlined in amber. */
  changed?: ReadonlySet<keyof FeeConfigValues>;
}> = ({ part, values, onChange, disabled, lockHint, teamCount, changed }) => {
  const set = (k: keyof FeeConfigValues) => (v: number) => onChange({ ...values, [k]: v });
  const common = (k: keyof FeeConfigValues) => ({
    disabled, changed: changed?.has(k) ?? false, title: disabled ? lockHint : undefined,
  });

  if (part === 'timing') {
    return (
      <SetupField label="Customers arrive over" htmlFor="cfg-arrival-window" hint="From the moment you press Start. After this, no new customers come.">
        <SetupInput
          id="cfg-arrival-window" label="Arrival window in minutes" value={minutesOf(values.arrivalWindowSeconds)}
          step="1" min="0" suffix="min" {...common('arrivalWindowSeconds')}
          onChange={min => onChange({ ...values, arrivalWindowSeconds: arrivalSecondsFromMinutes(min) })}
        />
      </SetupField>
    );
  }

  if (part === 'market') {
    const hint = customersHint(values.customersPerTeam, teamCount ?? 0);
    return (
      <SetupField label="Customers per team" htmlFor="cfg-customers-per-team" hint={hint ?? undefined}>
        <SetupInput
          id="cfg-customers-per-team" label="Customers per team" value={values.customersPerTeam}
          step="1" min="0" suffix="each" {...common('customersPerTeam')} onChange={set('customersPerTeam')}
        />
      </SetupField>
    );
  }

  const orderError = disabled ? null : shippingOrderError(values);
  return (
    <>
      <SetupField label="Shipping per batch, by size" wide hint={orderError ? undefined : 'Must rise with batch size.'}>
        <div className="grid grid-cols-3 gap-2">
          {SHIPPING_TIERS.map(t => (
            <div key={t.key}>
              <small className="mb-[3px] block text-[12px]" style={{ color: 'var(--ink-3)' }}>{t.size}</small>
              <SetupInput
                id={t.id} label={`Shipping fee for ${t.size}`} value={values[t.key]}
                step="0.5" min="0" prefix="$" {...common(t.key)} onChange={set(t.key)}
              />
            </div>
          ))}
        </div>
        {orderError && <p role="alert" className="mt-[3px] text-[12px]" style={{ color: 'var(--warn)' }}>{orderError}</p>}
      </SetupField>
      <SetupField label="Storage, waiting on Marketing" htmlFor="cfg-storage-fee">
        <SetupInput
          id="cfg-storage-fee" label="Storage fee per joke-minute" value={values.storageFeePerJokeMinute}
          step="0.01" min="0" prefix="$" suffix="per joke-minute" {...common('storageFeePerJokeMinute')} onChange={set('storageFeePerJokeMinute')}
        />
      </SetupField>
      <SetupField label="Hosting, unsold on the market" htmlFor="cfg-hosting-fee">
        <SetupInput
          id="cfg-hosting-fee" label="Hosting fee per joke-minute" value={values.hostingFeePerJokeMinute}
          step="0.01" min="0" prefix="$" suffix="per joke-minute" {...common('hostingFeePerJokeMinute')} onChange={set('hostingFeePerJokeMinute')}
        />
      </SetupField>
    </>
  );
};
