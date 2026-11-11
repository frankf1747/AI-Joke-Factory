import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { IDEAL_DIMENSIONS, classifyLength, isCatchAll, wordCount } from '../../config/dimensions';
import { asRawBlob } from '../../services/shared/jokes';
import { splitBlob } from '../../services/bots/engine';
import { parseTraitCorpus, traitFit } from '../../services/shared/traitCorpus';
import { PILOT_IDEAL, TRAIT_CORPUS_SIZE, WORD_RANGES, buildTraitCorpus, serializeTraitCorpus } from './buildTraitCorpus';
import { TRAIT_CORPUS_PATH } from './loadTraitCorpus';

const built = buildTraitCorpus();

describe('buildTraitCorpus', () => {
  it('is deterministic and builds 1,000 jokes the parser accepts', () => {
    expect(TRAIT_CORPUS_SIZE).toBe(1000);
    expect(serializeTraitCorpus(buildTraitCorpus())).toBe(serializeTraitCorpus(built));
    expect(parseTraitCorpus(JSON.parse(serializeTraitCorpus(built))).jokes).toHaveLength(1000);
  });

  it('uses every category but the catch-all on each of the 11 matched criteria', () => {
    for (const d of IDEAL_DIMENSIONS) {
      const seen = new Set(built.jokes.map(j => j.traits[d.id as keyof typeof j.traits]));
      expect([...seen].sort(), d.id).toEqual(d.categories.filter(c => !isCatchAll(c)).sort());
    }
  });

  it('writes texts whose word count sits inside their Length category', () => {
    for (const j of built.jokes) {
      const [lo, hi] = WORD_RANGES[j.traits.LENGTH];
      expect(wordCount(j.text)).toBeGreaterThanOrEqual(lo);
      expect(wordCount(j.text)).toBeLessThanOrEqual(hi);
      expect(classifyLength(j.text)).toBe(j.traits.LENGTH);
    }
  });

  it('puts about 4 % of jokes over the customers\' bar of 8 for the pilot ideal, most far below it', () => {
    const fits = built.jokes.map(j => traitFit(j, PILOT_IDEAL)).sort((a, b) => a - b);
    const share = fits.filter(f => f >= 8).length / fits.length;
    expect(share).toBeGreaterThanOrEqual(0.02);
    expect(share).toBeLessThanOrEqual(0.06);
    expect(fits[fits.length / 2]).toBeLessThan(6);
  });

  it('survives the Joke Maker blob and the bots\' blank-line split', () => {
    const five = built.jokes.slice(0, 5);
    expect(splitBlob(asRawBlob(five.map(j => j.text)))).toEqual(five.map(j => j.text));
  });

  it('is exactly the committed scripts/traits/trait-corpus.json', () => {
    expect(readFileSync(TRAIT_CORPUS_PATH, 'utf8')).toBe(serializeTraitCorpus(built));
  });
});
