import { describe, it, expect } from 'vitest';
import {
  DIMENSIONS,
  IDEAL_DIMENSIONS,
  MAX_FIT,
  CATCH_ALL,
  dimById,
  categoryIndex,
  isCatchAll,
  dimFit,
  TITLE_FIT_GRADES,
  wordCount,
  classifyLength,
  LENGTH_SHORT_MAX,
  LENGTH_MEDIUM_MAX,
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

describe('dimFit — ordinal is a cliff, not a ramp', () => {
  it('scores an exact match 1', () => {
    expect(dimFit('COMPLEXITY', 'Moderate', 'Moderate')).toBe(1);
  });

  it('scores one step away 0.5', () => {
    expect(dimFit('COMPLEXITY', 'Moderate', 'Simple')).toBe(0.5);
    expect(dimFit('COMPLEXITY', 'Moderate', 'Thoughtful')).toBe(0.5);
  });

  it('scores two or more steps away 0 — the same as being completely wrong', () => {
    expect(dimFit('COMPLEXITY', 'Moderate', 'Very simple')).toBe(0);
    expect(dimFit('COMPLEXITY', 'Moderate', 'Expert')).toBe(0);
    expect(dimFit('FRESHNESS', 'Timeless', 'Time-sensitive')).toBe(0);
  });

  it('treats the catch-all as binary, bypassing adjacency', () => {
    // ENERGY is ordinal and has a catch-all.
    expect(dimFit('ENERGY', 'Conversational', CATCH_ALL)).toBe(0);
    expect(dimFit('ENERGY', CATCH_ALL, CATCH_ALL)).toBe(1);
  });

  it('scores unknown categories 0 rather than throwing', () => {
    expect(dimFit('COMPLEXITY', 'Moderate', 'Banana')).toBe(0);
    expect(dimFit('COMPLEXITY', 'Banana', 'Moderate')).toBe(0);
    expect(dimFit('NOT_A_DIM', 'a', 'b')).toBe(0);
  });

  it('scores an empty classification 0', () => {
    expect(dimFit('COMPLEXITY', 'Moderate', '')).toBe(0);
    expect(dimFit('COMPLEXITY', '', 'Moderate')).toBe(0);
  });
});

describe('dimFit — categorical is all or nothing', () => {
  it('scores an exact match 1 and anything else 0', () => {
    expect(dimFit('TOPIC', 'Work', 'Work')).toBe(1);
    expect(dimFit('TOPIC', 'Work', 'Money')).toBe(0);
  });

  it('does not reward adjacency in the list', () => {
    // Relationships sits next to Work, but categorical has no notion of near.
    expect(dimFit('TOPIC', 'Work', 'Relationships')).toBe(0);
  });

  it('matches the catch-all only against itself on categorical dims', () => {
    // Three of the four catch-all dimensions are categorical, so they never
    // reach the ordinal short-circuit — plain equality has to carry them.
    expect(dimFit('EDGINESS', CATCH_ALL, CATCH_ALL)).toBe(1);
    expect(dimFit('HUMOR_STYLE', 'Pun', CATCH_ALL)).toBe(0);
    expect(dimFit('STRUCTURE', CATCH_ALL, 'One-liner')).toBe(0);
  });
});

describe('dimFit — Title Fit is graded against itself', () => {
  it('maps each grade to its score, ignoring the ideal', () => {
    expect(dimFit('TITLE_FIT', '', 'Perfect')).toBe(1);
    expect(dimFit('TITLE_FIT', '', 'Strong')).toBe(0.75);
    expect(dimFit('TITLE_FIT', '', 'Moderate')).toBe(0.5);
    expect(dimFit('TITLE_FIT', '', 'Weak')).toBe(0.25);
    expect(dimFit('TITLE_FIT', '', 'Mismatch')).toBe(0);
  });

  it('scores an unknown grade 0', () => {
    expect(dimFit('TITLE_FIT', '', 'Sublime')).toBe(0);
  });

  it('exposes the grade table', () => {
    expect(TITLE_FIT_GRADES.Perfect).toBe(1);
    expect(TITLE_FIT_GRADES.Mismatch).toBe(0);
  });
});

describe('wordCount', () => {
  it('counts whitespace-separated tokens', () => {
    expect(wordCount('one two three')).toBe(3);
  });

  it('collapses runs of whitespace', () => {
    expect(wordCount('one   two\n\nthree\tfour')).toBe(4);
  });

  it('ignores leading and trailing whitespace', () => {
    expect(wordCount('  padded  ')).toBe(1);
  });

  it('counts empty and whitespace-only text as 0', () => {
    expect(wordCount('')).toBe(0);
    expect(wordCount('   \n\t ')).toBe(0);
  });

  it('does not split on non-breaking spaces, matching Go', () => {
    // JS \s matches U+00A0; Go's isWhitespace does not. Text pasted from a
    // chat window or Google Docs carries NBSPs, so this must agree with the
    // backend or a joke can land in a different Length bucket on each side.
    expect(wordCount('one two three')).toBe(2);
    expect(wordCount('em space')).toBe(1);
  });
});

describe('classifyLength', () => {
  const words = (n: number) => Array.from({ length: n }, () => 'w').join(' ');

  it('exposes the backend thresholds', () => {
    expect(LENGTH_SHORT_MAX).toBe(15);
    expect(LENGTH_MEDIUM_MAX).toBe(40);
  });

  it('calls 15 words or fewer Short', () => {
    expect(classifyLength(words(1))).toBe('Short');
    expect(classifyLength(words(15))).toBe('Short');
  });

  it('calls 16 to 40 words Medium', () => {
    expect(classifyLength(words(16))).toBe('Medium');
    expect(classifyLength(words(40))).toBe('Medium');
  });

  it('calls more than 40 words Long', () => {
    expect(classifyLength(words(41))).toBe('Long');
  });

  it('calls empty text Short', () => {
    expect(classifyLength('')).toBe('Short');
  });
});
