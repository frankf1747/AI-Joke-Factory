import { describe, it, expect } from 'vitest';
import {
  DIMENSIONS,
  IDEAL_DIMENSIONS,
  MAX_FIT,
  CATCH_ALL,
  dimById,
  categoryIndex,
  isCatchAll,
} from './dimensions';

describe('DIMENSIONS catalog', () => {
  it('has all 12 dimensions in backend order', () => {
    expect(DIMENSIONS.map(d => d.id)).toEqual([
      'LENGTH', 'TOPIC', 'HUMOR_STYLE', 'COMPLEXITY', 'EDGINESS', 'STRUCTURE',
      'WORDPLAY', 'FRESHNESS', 'SETUP_PAYOFF', 'CLARITY', 'ENERGY', 'TITLE_FIT',
    ]);
  });

  it('scores all 12 — Structure is a real dimension, not a placeholder', () => {
    expect(MAX_FIT).toBe(12);
    expect(dimById('STRUCTURE')?.scoring).toBe('categorical');
  });

  it('offers an ideal for 11 dimensions — Title Fit is intrinsic', () => {
    expect(IDEAL_DIMENSIONS).toHaveLength(11);
    expect(IDEAL_DIMENSIONS.map(d => d.id)).not.toContain('TITLE_FIT');
    expect(dimById('TITLE_FIT')?.hasIdeal).toBe(false);
  });

  it('uses the backend Topic list, which includes Politics', () => {
    expect(dimById('TOPIC')?.categories).toEqual([
      'Work', 'Relationships', 'Family', 'Food', 'Technology',
      'Animals', 'School', 'Money', 'Travel', 'Health',
      'Sports', 'Politics', 'Everyday', 'Language', 'Other',
    ]);
  });

  it('carries the catch-all on exactly the four dimensions that have one', () => {
    const withCatchAll = DIMENSIONS
      .filter(d => d.categories.includes(CATCH_ALL))
      .map(d => d.id);
    expect(withCatchAll).toEqual(['HUMOR_STYLE', 'EDGINESS', 'STRUCTURE', 'ENERGY']);
  });

  it('marks which dimensions the code classifies rather than the LLM', () => {
    expect(dimById('LENGTH')?.classifiedBy).toBe('code');
    expect(dimById('TOPIC')?.classifiedBy).toBe('llm');
  });

  it('every id is unique', () => {
    const ids = DIMENSIONS.map(d => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('resolves a category to its index, and -1 when absent', () => {
    expect(categoryIndex('COMPLEXITY', 'Very simple')).toBe(0);
    expect(categoryIndex('COMPLEXITY', 'Expert')).toBe(4);
    expect(categoryIndex('COMPLEXITY', 'Nonsense')).toBe(-1);
    expect(categoryIndex('NOT_A_DIM', 'Expert')).toBe(-1);
  });

  it('recognises the catch-all string', () => {
    expect(isCatchAll(CATCH_ALL)).toBe(true);
    expect(isCatchAll('Clean')).toBe(false);
  });

  it('returns undefined for an unknown dimension id', () => {
    expect(dimById('BOGUS')).toBeUndefined();
  });
});
