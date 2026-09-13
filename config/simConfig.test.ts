import { describe, it, expect } from 'vitest';
import { SIM_CONFIG, categoryById } from './simConfig';

/* These are the LEGACY Marketing Topic palette — the buttons a team clicks when
   titling a joke. They are NOT the scoring rubric's Topic categories, which are
   the backend's fixed 15 and live in config/dimensions.ts. The two lists do not
   overlap by design: "Workplace" here is not "Work" there.

   The palette is on borrowed time. Topic is classified by the LLM, not chosen by
   Marketing, and the publish endpoint has no field for it — so the picker comes
   out when the Marketing screen is rebuilt against the real API. These tests
   guard the palette until then; they assert nothing about how jokes are scored. */
describe('SIM_CONFIG categories (legacy Marketing picker palette)', () => {
  it('offers 10 topics to pick from', () => {
    expect(SIM_CONFIG.categories).toHaveLength(10);
  });

  it('category ids are unique', () => {
    const ids = SIM_CONFIG.categories.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('categoryById returns the right one or undefined', () => {
    expect(categoryById('workplace')?.label).toBe('Workplace');
    expect(categoryById('nonexistent')).toBeUndefined();
  });
});

describe('SIM_CONFIG economics', () => {
  it('all costs are non-negative', () => {
    const e = SIM_CONFIG.economics;
    expect(e.marketPrice).toBeGreaterThan(0);
    expect(e.costOfPublishing).toBeGreaterThanOrEqual(0);
    expect(e.costOfDiscard).toBeGreaterThanOrEqual(0);
    expect(e.buyerBudget).toBeGreaterThan(0);
  });
});
