/* The Lean part of the instructor's CONFIG row: the batch-size rule (read
   only: Reset Game sets it, Round 1 exactly 5 and Round 2 up to 10), the
   arrival window and the five fees. One rule set for both rounds, so there is
   no market mode, preset or WIP limit to choose. The values edit the round the
   Round 1 / Round 2 tabs select, and lock once it has started. */
import React from 'react';
import type { GameConfig } from '../types';

export interface FeeConfigValues {
  arrivalWindowSeconds: number;
  shippingFeeSmall: number;
  shippingFeeStandard: number;
  shippingFeeLarge: number;
  storageFeePerJokeMinute: number;
  hostingFeePerJokeMinute: number;
}

const FEE_KEYS = [
  'arrivalWindowSeconds', 'shippingFeeSmall', 'shippingFeeStandard', 'shippingFeeLarge',
  'storageFeePerJokeMinute', 'hostingFeePerJokeMinute',
] as const satisfies ReadonlyArray<keyof FeeConfigValues>;

export function feeValuesOf(config: FeeConfigValues): FeeConfigValues {
  return {
    arrivalWindowSeconds: config.arrivalWindowSeconds,
    shippingFeeSmall: config.shippingFeeSmall,
    shippingFeeStandard: config.shippingFeeStandard,
    shippingFeeLarge: config.shippingFeeLarge,
    storageFeePerJokeMinute: config.storageFeePerJokeMinute,
    hostingFeePerJokeMinute: config.hostingFeePerJokeMinute,
  };
}

/**
 * The updateConfig patch for what changed. The arrival window is clamped to a
 * whole number of at least 1 second (0 would bring every customer at once); a
 * value that is not a number is left out, so the server keeps its own.
 */
export function changedFees(local: FeeConfigValues, config: FeeConfigValues): Partial<GameConfig> {
  const out: Partial<GameConfig> = {};
  for (const k of FEE_KEYS) {
    const v = local[k];
    if (v === config[k] || !Number.isFinite(v)) continue;
    out[k] = k === 'arrivalWindowSeconds' ? Math.max(1, Math.round(v || 0)) : v;
  }
  return out;
}

const inputClass = (disabled: boolean) =>
  `w-20 p-1 border border-gray-300 rounded !text-center appearance-none [-moz-appearance:textfield] bg-white text-black ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`;

const FeeInput: React.FC<{
  id: string; label: string; value: number; step: string; min: string; disabled: boolean; onChange: (v: number) => void;
}> = ({ id, label, value, step, min, disabled, onChange }) => (
  <input
    id={id}
    aria-label={label}
    type="number"
    step={step}
    min={min}
    value={value}
    onChange={e => onChange(Number(e.target.value))}
    disabled={disabled}
    className={inputClass(disabled)}
  />
);

export const FeeConfigFields: React.FC<{
  values: FeeConfigValues;
  onChange: (next: FeeConfigValues) => void;
  /** True once the selected round has started (or while one runs). */
  disabled: boolean;
  /** Tooltip while locked. */
  lockHint: string;
  round1BatchSize: number;
  round2BatchLimit: number;
}> = ({ values, onChange, disabled, lockHint, round1BatchSize, round2BatchLimit }) => {
  const set = (k: keyof FeeConfigValues) => (v: number) => onChange({ ...values, [k]: v });
  const tip = (text: string) => (disabled ? lockHint : text);
  return (
    <>
      <div className="flex items-center space-x-3 text-sm text-gray-600" title="Set by Reset Game. Round 1 batches must have exactly this many jokes; Round 2 batches may have fewer.">
        <span className="whitespace-nowrap">R1 batch: {round1BatchSize} (exactly)</span>
        <span className="whitespace-nowrap">R2 batch: up to {round2BatchLimit}</span>
      </div>
      <div className="flex items-center space-x-3" title={tip('Seconds over which customers arrive')}>
        <label htmlFor="cfg-arrival-window" className="text-sm text-gray-600 whitespace-nowrap">Arrival window (s):</label>
        <FeeInput id="cfg-arrival-window" label="Arrival window in seconds" value={values.arrivalWindowSeconds} step="1" min="1" disabled={disabled} onChange={set('arrivalWindowSeconds')} />
      </div>
      <div className="flex items-center space-x-2" title={tip('Charged for every batch the Joke Maker sends, by its size. A batch not yet split ships as 5 jokes.')}>
        <span className="text-sm text-gray-600 whitespace-nowrap">Shipping fee (1–4 / 5 / 6–10 jokes):</span>
        <FeeInput id="cfg-shipping-small" label="Shipping fee for 1–4 jokes" value={values.shippingFeeSmall} step="0.5" min="0" disabled={disabled} onChange={set('shippingFeeSmall')} />
        <FeeInput id="cfg-shipping-standard" label="Shipping fee for 5 jokes" value={values.shippingFeeStandard} step="0.5" min="0" disabled={disabled} onChange={set('shippingFeeStandard')} />
        <FeeInput id="cfg-shipping-large" label="Shipping fee for 6–10 jokes" value={values.shippingFeeLarge} step="0.5" min="0" disabled={disabled} onChange={set('shippingFeeLarge')} />
      </div>
      <div className="flex items-center space-x-3" title={tip("Charged per joke per minute while a batch waits on Marketing's desk, from send until released or discarded")}>
        <label htmlFor="cfg-storage-fee" className="text-sm text-gray-600 whitespace-nowrap">Storage fee per joke-minute:</label>
        <FeeInput id="cfg-storage-fee" label="Storage fee per joke-minute" value={values.storageFeePerJokeMinute} step="0.01" min="0" disabled={disabled} onChange={set('storageFeePerJokeMinute')} />
      </div>
      <div className="flex items-center space-x-3" title={tip('Charged per joke per minute while a released joke sits unsold, until its first sale or the end of the round')}>
        <label htmlFor="cfg-hosting-fee" className="text-sm text-gray-600 whitespace-nowrap">Hosting fee per joke-minute:</label>
        <FeeInput id="cfg-hosting-fee" label="Hosting fee per joke-minute" value={values.hostingFeePerJokeMinute} step="0.01" min="0" disabled={disabled} onChange={set('hostingFeePerJokeMinute')} />
      </div>
    </>
  );
};
