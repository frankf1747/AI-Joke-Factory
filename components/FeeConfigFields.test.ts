import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FeeConfigFields, SHIPPING_ORDER_TEXT, changedFees, feeValuesOf, shippingOrderError, type FeeConfigValues } from './FeeConfigFields';

const config: FeeConfigValues = {
  arrivalWindowSeconds: 900, shippingFeeSmall: 1, shippingFeeStandard: 2, shippingFeeLarge: 3,
  storageFeePerJokeMinute: 0.1, hostingFeePerJokeMinute: 0.05,
};

const render = (disabled: boolean, values: FeeConfigValues = config) => renderToStaticMarkup(createElement(FeeConfigFields, {
  values, onChange: () => {}, disabled, lockHint: 'Lean settings lock once the round starts',
  round1BatchSize: 5, round2BatchLimit: 10,
}));

describe('FeeConfigFields', () => {
  it('labels the three shipping tiers, storage and hosting, with the batch-size rule', () => {
    const out = render(false);
    expect(out).toContain('Shipping fee (1–4 / 5 / 6–10 jokes):');
    expect(out).toContain('aria-label="Shipping fee for 1–4 jokes"');
    expect(out).toContain('aria-label="Shipping fee for 5 jokes"');
    expect(out).toContain('aria-label="Shipping fee for 6–10 jokes"');
    expect(out).toContain('Storage fee per joke-minute:');
    expect(out).toContain('Hosting fee per joke-minute:');
    expect(out).toContain('R1 batch: 5 (exactly)');
    expect(out).toContain('R2 batch: up to 10');
    expect(out).toContain('value="0.05"');
    expect(out).not.toContain('disabled=""');
  });

  it('locks every input with the hint once the round has started', () => {
    const out = render(true);
    expect(out.match(/disabled=""/g)?.length).toBe(6);
    expect(out).toContain('title="Lean settings lock once the round starts"');
  });

  it('sends only what changed, with the arrival window clamped to a whole second of at least 1', () => {
    expect(changedFees(feeValuesOf(config), config)).toEqual({});
    expect(changedFees({ ...config, storageFeePerJokeMinute: 0.2, shippingFeeLarge: 4 }, config))
      .toEqual({ storageFeePerJokeMinute: 0.2, shippingFeeLarge: 4 });
    expect(changedFees({ ...config, arrivalWindowSeconds: 0 }, config)).toEqual({ arrivalWindowSeconds: 1 });
    expect(changedFees({ ...config, arrivalWindowSeconds: 600.6 }, config)).toEqual({ arrivalWindowSeconds: 601 });
    expect(changedFees({ ...config, hostingFeePerJokeMinute: Number.NaN }, config)).toEqual({});
  });

  it('accepts shipping fees that rise (or stay level) with batch size, and refuses any that fall', () => {
    expect(shippingOrderError(config)).toBeNull();
    expect(shippingOrderError({ ...config, shippingFeeSmall: 2, shippingFeeStandard: 2, shippingFeeLarge: 2 })).toBeNull();
    expect(shippingOrderError({ ...config, shippingFeeSmall: 3 })).toBe(SHIPPING_ORDER_TEXT);
    expect(shippingOrderError({ ...config, shippingFeeLarge: 1.5 })).toBe(SHIPPING_ORDER_TEXT);
    expect(SHIPPING_ORDER_TEXT).toBe('Shipping fees must rise with batch size: 1–4 jokes ≤ 5 jokes ≤ 6–10 jokes.');
  });

  it('shows the order message inline while the shipping fees fall, and not otherwise', () => {
    expect(render(false, { ...config, shippingFeeSmall: 5 })).toContain(`role="alert"`);
    expect(render(false, { ...config, shippingFeeSmall: 5 })).toContain(SHIPPING_ORDER_TEXT);
    expect(render(false)).not.toContain(SHIPPING_ORDER_TEXT);
  });
});
