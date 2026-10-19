import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FeeConfigFields, SHIPPING_ORDER_TEXT, changedFees, feeValuesOf, shippingOrderError, type FeeConfigValues } from './FeeConfigFields';

const config: FeeConfigValues = {
  arrivalWindowSeconds: 900, shippingFeeSmall: 1, shippingFeeStandard: 2, shippingFeeLarge: 3,
  storageFeePerJokeMinute: 0.05, hostingFeePerJokeMinute: 0.05, customersPerTeam: 18,
};

type Part = 'timing' | 'market' | 'costs';
const render = (disabled: boolean, values: FeeConfigValues = config, teamCount?: number, part: Part = 'costs', changed: ReadonlySet<keyof FeeConfigValues> = new Set()) =>
  renderToStaticMarkup(createElement(FeeConfigFields, {
    part, values, teamCount, changed, onChange: () => {}, disabled, lockHint: 'Lean settings lock once the round starts',
  }));

describe('FeeConfigFields', () => {
  it('costs: labels each shipping tier above its input, then storage and hosting per joke-minute', () => {
    const out = render(false);
    expect(out).toContain('Shipping per batch, by size');
    const tiers = ['1–4 jokes', '5 jokes', '6–10 jokes'];
    const at = tiers.map(t => out.indexOf(`>${t}<`));
    const inputs = ['cfg-shipping-small', 'cfg-shipping-standard', 'cfg-shipping-large'].map(id => out.indexOf(`id="${id}"`));
    // Each size label sits above (before) its own input, in tier order.
    at.forEach((pos, i) => {
      expect(pos).toBeGreaterThan(-1);
      expect(pos).toBeLessThan(inputs[i]);
      if (i > 0) expect(pos).toBeGreaterThan(inputs[i - 1]);
    });
    expect(out).toContain('aria-label="Shipping fee for 1–4 jokes"');
    expect(out).toContain('Storage, waiting on Marketing');
    expect(out).toContain('Hosting, unsold on the market');
    expect((out.match(/per joke-minute/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(out).toContain('value="0.05"');
    expect(out).not.toContain('disabled=""');
    expect(out).not.toContain('Shipping fee (1–4 / 5 / 6–10 jokes):');
  });

  it('timing: the arrival window is entered in minutes (900 s shows 15)', () => {
    const out = render(false, config, undefined, 'timing');
    expect(out).toContain('Customers arrive over');
    expect(out).toMatch(/id="cfg-arrival-window"[^>]*value="15"/);
    expect(out).toContain('>min<');
    expect(render(false, { ...config, arrivalWindowSeconds: 90 }, undefined, 'timing')).toMatch(/id="cfg-arrival-window"[^>]*value="1.5"/);
  });

  it('locks every input with the hint once the round has started', () => {
    expect(render(true).match(/disabled=""/g)?.length).toBe(5);
    expect(render(true, config, undefined, 'timing').match(/disabled=""/g)?.length).toBe(1);
    expect(render(true, config, undefined, 'market').match(/disabled=""/g)?.length).toBe(1);
    expect(render(true)).toContain('title="Lean settings lock once the round starts"');
  });

  it('outlines a changed field in amber, and only that one', () => {
    const out = render(false, { ...config, storageFeePerJokeMinute: 0.2 }, undefined, 'costs', new Set(['storageFeePerJokeMinute']));
    expect(out.match(/data-changed="true"/g)?.length).toBe(1);
    expect(out).toMatch(/data-changed="true"[^>]*style="[^"]*border-color:var\(--waiting\)[^"]*"[^>]*>.*?id="cfg-storage-fee"/);
    expect(render(false)).not.toContain('data-changed="true"');
  });

  it('sends only what changed, with the arrival window clamped to a whole second of at least 1', () => {
    expect(changedFees(feeValuesOf(config), config)).toEqual({});
    expect(changedFees({ ...config, storageFeePerJokeMinute: 0.2, shippingFeeLarge: 4 }, config))
      .toEqual({ storageFeePerJokeMinute: 0.2, shippingFeeLarge: 4 });
    expect(changedFees({ ...config, arrivalWindowSeconds: 0 }, config)).toEqual({ arrivalWindowSeconds: 1 });
    expect(changedFees({ ...config, arrivalWindowSeconds: 600.6 }, config)).toEqual({ arrivalWindowSeconds: 601 });
    expect(changedFees({ ...config, hostingFeePerJokeMinute: Number.NaN }, config)).toEqual({});
  });

  it('shows customers per team with a hint for the lobby team count, and sends it as a whole number from 0 to 1000', () => {
    const out = render(false, config, 20, 'market');
    expect(out).toContain('Customers per team');
    expect(out).toContain('aria-label="Customers per team"');
    expect(out).toContain('about 360 customers for 20 teams');
    expect(render(false, config, undefined, 'market')).not.toContain('customers for');
    expect(render(false, { ...config, customersPerTeam: 0 }, 20, 'market')).toContain('Fixed customer count');
    expect(changedFees({ ...config, customersPerTeam: 25 }, config)).toEqual({ customersPerTeam: 25 });
    expect(changedFees({ ...config, customersPerTeam: 0 }, config)).toEqual({ customersPerTeam: 0 });
    expect(changedFees({ ...config, customersPerTeam: 12.6 }, config)).toEqual({ customersPerTeam: 13 });
    expect(changedFees({ ...config, customersPerTeam: 5000 }, config)).toEqual({ customersPerTeam: 1000 });
    expect(changedFees({ ...config, customersPerTeam: -3 }, config)).toEqual({ customersPerTeam: 0 });
    expect(changedFees({ ...config, customersPerTeam: Number.NaN }, config)).toEqual({});
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
