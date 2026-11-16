import { describe, expect, it } from 'vitest';
import { DEFAULT_IDEAL_PROFILE, IDEAL_DIMENSIONS } from '../../config/dimensions';
import { variedCorpus } from '../shared/jokes';
import { traitFit } from '../shared/traitCorpus';
import { GRADED_JOKES } from './gradedJokes';
import graded from './graded-jokes.json';

describe('GRADED_JOKES', () => {
  it('holds every live bot joke, with its own title and text and a category on every matched criterion', () => {
    expect(GRADED_JOKES.jokes.map(j => j.id)).toEqual(variedCorpus.map(j => j.id));
    for (const j of GRADED_JOKES.jokes) {
      expect(Object.keys(j.traits).sort()).toEqual(IDEAL_DIMENSIONS.map(d => d.id).sort());
    }
  });

  it('keeps the grader\'s grades as given', () => {
    const grades = graded.jokes as Record<string, Record<string, string>>;
    for (const j of GRADED_JOKES.jokes) {
      for (const [dim, cat] of Object.entries(grades[j.id])) expect(j.traits[dim as keyof typeof j.traits]).toBe(cat);
    }
  });

  it('leaves room to learn toward the default ideal: the best jokes fit far better than the average one', () => {
    const fits = GRADED_JOKES.jokes.map(j => traitFit(j, DEFAULT_IDEAL_PROFILE)).sort((a, b) => b - a);
    const mean = fits.reduce((a, x) => a + x, 0) / fits.length;
    expect(fits[0] - mean).toBeGreaterThan(2);
  });
});
