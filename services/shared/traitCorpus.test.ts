import { describe, expect, it } from 'vitest';
import { DEFAULT_IDEAL_PROFILE } from '../../config/dimensions';
import {
  TRAIT_TITLE_FIT, indexTraitCorpus, normalizeJokeText, parseTraitCorpus, traitClassification, traitFit,
  type TraitCorpus, type TraitJoke,
} from './traitCorpus';

const IDEAL_TRAITS = { ...DEFAULT_IDEAL_PROFILE } as TraitJoke['traits'];
/** 20 words: Medium, like the ideal's LENGTH. */
const MEDIUM_TEXT = 'The intern scheduled the quarterly goals with a straight face. Payroll lost my lunch break and nobody noticed at all.';

const joke = (over: Partial<TraitJoke> = {}): TraitJoke => ({
  id: 'T0001', title: 'Office Memo No. 1', text: MEDIUM_TEXT, traits: { ...IDEAL_TRAITS }, ...over,
});
const corpus = (jokes: unknown[], over: Record<string, unknown> = {}) => ({ version: 1, seed: 's', jokes, ...over });

describe('parseTraitCorpus', () => {
  it('accepts a well-formed corpus', () => {
    const c = parseTraitCorpus(corpus([joke(), joke({ id: 'T0002', title: 'Office Memo No. 2', text: `${MEDIUM_TEXT} Again.` })]));
    expect(c.jokes).toHaveLength(2);
  });

  it.each([
    ['a wrong version', corpus([joke()], { version: 2 }), /version/],
    ['a missing criterion', corpus([joke({ traits: { ...IDEAL_TRAITS, ENERGY: undefined } as unknown as TraitJoke['traits'] })]), /ENERGY/],
    ['a catch-all category', corpus([joke({ traits: { ...IDEAL_TRAITS, ENERGY: 'None of the above' } })]), /ENERGY/],
    ['an unknown category', corpus([joke({ traits: { ...IDEAL_TRAITS, TOPIC: 'Weather' } })]), /TOPIC/],
    ['Title Fit among the traits', corpus([joke({ traits: { ...IDEAL_TRAITS, TITLE_FIT: 'Strong' } as TraitJoke['traits'] })]), /exactly/],
    ['a LENGTH the text does not have', corpus([joke({ traits: { ...IDEAL_TRAITS, LENGTH: 'Short' } })]), /LENGTH Short/],
    ['a repeated title', corpus([joke(), joke({ id: 'T0002', text: `${MEDIUM_TEXT} Again.` })]), /repeats/],
    ['a repeated text up to spacing', corpus([joke(), joke({ id: 'T0002', title: 'Other', text: `  ${MEDIUM_TEXT.replace(' ', '   ')} ` })]), /repeats/],
  ])('refuses %s', (_name, raw, message) => {
    expect(() => parseTraitCorpus(raw)).toThrow(message);
  });
});

describe('trait fit', () => {
  it('grades a corpus joke with its traits and Title Fit "Strong"', () => {
    expect(TRAIT_TITLE_FIT).toBe('Strong');
    expect(traitClassification(joke())).toEqual({ ...IDEAL_TRAITS, TITLE_FIT: 'Strong' });
  });

  it('scores a joke on the ideal at 11.75 and one off it lower', () => {
    expect(traitFit(joke(), DEFAULT_IDEAL_PROFILE)).toBe(11.75);
    expect(traitFit(joke({ traits: { ...IDEAL_TRAITS, TOPIC: 'Food', COMPLEXITY: 'Expert' } }), DEFAULT_IDEAL_PROFILE)).toBe(9.75);
  });
});

describe('indexTraitCorpus', () => {
  it('finds a joke by its text, whatever the spacing, and by its title', () => {
    const c: TraitCorpus = parseTraitCorpus(corpus([joke()]));
    const idx = indexTraitCorpus(c);
    expect(idx.byText.get(normalizeJokeText(`\n ${MEDIUM_TEXT.replace(/ /g, '  ')} `))?.id).toBe('T0001');
    expect(idx.byTitle.get('Office Memo No. 1')?.id).toBe('T0001');
  });
});
