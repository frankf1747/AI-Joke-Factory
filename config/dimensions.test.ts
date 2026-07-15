import { describe, it, expect } from 'vitest';
import { DIMENSIONS, dimById, dimProx, CATEGORICAL_DIMS } from './dimensions';

describe('DIMENSIONS', () => {
  it('has exactly 11 entries', () => {
    expect(DIMENSIONS).toHaveLength(11);
  });

  it('every id is unique', () => {
    const ids = DIMENSIONS.map(d => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('dimById returns the right dim or undefined', () => {
    expect(dimById('length')?.label).toBe('Length');
    expect(dimById('bogus')).toBeUndefined();
  });

  it('marks topic, humor_style, structure as categorical', () => {
    expect(CATEGORICAL_DIMS.has('topic')).toBe(true);
    expect(CATEGORICAL_DIMS.has('humor_style')).toBe(true);
    expect(CATEGORICAL_DIMS.has('structure')).toBe(true);
    expect(CATEGORICAL_DIMS.has('length')).toBe(false);
  });
});

describe('dimProx', () => {
  it('returns 1 for exact match on ordinal', () => {
    const dim = dimById('length')!;
    expect(dimProx(dim, 'Short')).toBe(1);
  });

  it('returns scaled distance for ordinal', () => {
    const dim = dimById('length')!;
    // ideal = Short (idx 0). Medium (idx 1) → 1 - 1/2 = 0.5. Long (idx 2) → 1 - 2/2 = 0.
    expect(dimProx(dim, 'Medium')).toBe(0.5);
    expect(dimProx(dim, 'Long')).toBe(0);
  });

  it('returns 1 / 0 for categorical', () => {
    const dim = dimById('humor_style')!;
    expect(dimProx(dim, 'Pun')).toBe(1);      // ideal = Pun
    expect(dimProx(dim, 'Irony')).toBe(0);    // different category
  });
});
