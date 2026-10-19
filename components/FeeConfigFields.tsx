/* The Lean settings on the instructor's Setup tab: the arrival window (Round
   timing), customers per team (Market) and the five fees (Costs). One rule set
   for both rounds, so there is no market mode, preset or WIP limit to choose.
   Apply writes them to every round still being configured (both rounds before
   the class starts); a round that has started is locked. */
import React, { useState } from 'react';
import { customersHint } from '../services/leanMode';
import { arrivalBoxText, arrivalSecondsFromMinutes, shippingOrderError, type FeeConfigValues } from '../services/feeConfig';
import { SetupField, SetupInput } from './instructor/SetupField';

export {
  FEE_KEYS, SHIPPING_ORDER_TEXT, changedFees, feeValuesOf, shippingOrderError, type FeeConfigValues,
} from '../services/feeConfig';

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
  // The arrival box's text while it is being typed in; null once it is left.
  const [arrivalDraft, setArrivalDraft] = useState<string | null>(null);
  const set = (k: keyof FeeConfigValues) => (v: number) => onChange({ ...values, [k]: v });
  const common = (k: keyof FeeConfigValues) => ({
    disabled, changed: changed?.has(k) ?? false, title: disabled ? lockHint : undefined,
  });

  if (part === 'timing') {
    return (
      <SetupField label="Customers arrive over" htmlFor="cfg-arrival-window" hint="From the moment you press Start. After this, no new customers come.">
        <SetupInput
          id="cfg-arrival-window" label="Arrival window in minutes" value={arrivalBoxText(arrivalDraft, values.arrivalWindowSeconds)}
          step="1" min="0" suffix="min" {...common('arrivalWindowSeconds')}
          onChange={(min, raw) => {
            setArrivalDraft(raw);
            onChange({ ...values, arrivalWindowSeconds: arrivalSecondsFromMinutes(min) });
          }}
          onBlur={() => setArrivalDraft(null)}
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
