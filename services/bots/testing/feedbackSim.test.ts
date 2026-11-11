import { describe, expect, it } from 'vitest';
import { DEFAULT_IDEAL_PROFILE } from '../../../config/dimensions';
import { directionHint, simulateFeedback } from './feedbackSim';

const IDEAL = { ...DEFAULT_IDEAL_PROFILE };

describe('simulateFeedback (a port of feedback.go)', () => {
  it('shows 3 missed and 2 landed criteria, walking the 12 from joke id mod 12, with directions on scales', () => {
    const joke = { ...IDEAL, TOPIC: 'Food', HUMOR_STYLE: 'Pun', COMPLEXITY: 'Expert', LENGTH: 'Long', TITLE_FIT: 'Strong' };
    // id 13 starts at TOPIC (index 1): fails TOPIC, HUMOR_STYLE, COMPLEXITY; then passes EDGINESS, STRUCTURE.
    expect(simulateFeedback(13, joke, IDEAL)).toEqual({
      good_dimensions: ['EDGINESS', 'STRUCTURE'],
      improve_dimensions: ['TOPIC', 'HUMOR_STYLE', 'COMPLEXITY'],
      improve_hints: { COMPLEXITY: 'LOWER' },
    });
  });

  it('backfills to 5 from the other side, and a Strong title passes', () => {
    const out = simulateFeedback(0, { ...IDEAL, TITLE_FIT: 'Strong' }, IDEAL);
    expect(out.improve_dimensions).toEqual([]);
    expect(out.good_dimensions).toEqual(['LENGTH', 'TOPIC', 'HUMOR_STYLE', 'COMPLEXITY', 'EDGINESS']);
  });

  it('gives no direction for categories, the catch-all, or a joke on the ideal', () => {
    expect(directionHint('TOPIC', 'Work', 'Food')).toBeUndefined();
    expect(directionHint('ENERGY', 'Conversational', 'None of the above')).toBeUndefined();
    expect(directionHint('LENGTH', 'Medium', 'Medium')).toBeUndefined();
    expect(directionHint('LENGTH', 'Medium', 'Short')).toBe('HIGHER');
  });
});
