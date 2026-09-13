import { describe, it, expect } from 'vitest';
import { SIM_CONFIG } from './simConfig';

describe('SIM_CONFIG economics', () => {
  it('all costs are non-negative', () => {
    const e = SIM_CONFIG.economics;
    expect(e.marketPrice).toBeGreaterThan(0);
    expect(e.costOfPublishing).toBeGreaterThanOrEqual(0);
    expect(e.costOfDiscard).toBeGreaterThanOrEqual(0);
    expect(e.buyerBudget).toBeGreaterThan(0);
  });
});
