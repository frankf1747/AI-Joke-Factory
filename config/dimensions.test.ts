import { describe, it, expect } from 'vitest';
import {
  DIMENSIONS,
  SCORED_DIMENSIONS,
  PLACEHOLDER_DIMS,
  INTRINSIC_DIMS,
  dimById,
  dimProx,
  CATEGORICAL_DIMS,
} from './dimensions';

describe('DIMENSIONS', () => {
  it('has exactly 12 entries', () => {
    expect(DIMENSIONS).toHaveLength(12);
  });

  it('scores 11 of them — Structure is a placeholder and is excluded', () => {
    expect(PLACEHOLDER_DIMS.has('structure')).toBe(true);
    expect(SCORED_DIMENSIONS).toHaveLength(11);
    expect(SCORED_DIMENSIONS.map(d => d.id)).not.toContain('structure');
  });

  it('marks title_fit as intrinsic (graded on its own scale, no ideal)', () => {
    expect(INTRINSIC_DIMS.has('title_fit')).toBe(true);
    expect(dimById('title_fit')?.label).toBe('Title Fit');
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

  it('grades title_fit intrinsically, best → worst', () => {
    const dim = dimById('title_fit')!;
    expect(dimProx(dim, 'Perfect')).toBeCloseTo(1, 6);
    expect(dimProx(dim, 'Strong')).toBeCloseTo(0.75, 6);
    expect(dimProx(dim, 'Moderate')).toBeCloseTo(0.5, 6);
    expect(dimProx(dim, 'Weak')).toBeCloseTo(0.25, 6);
    expect(dimProx(dim, 'Mismatch')).toBeCloseTo(0, 6);
  });
});
