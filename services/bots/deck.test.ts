// services/bots/deck.test.ts
import { describe, it, expect } from 'vitest';
import { Deck } from './deck';
import { seededRng, variedCorpus } from '../shared/jokes';

describe('Deck', () => {
  it('never repeats a joke within one batch, even across reshuffles', () => {
    const deck = new Deck(variedCorpus, seededRng('deck'));
    for (let batch = 0; batch < 200; batch++) {
      const ids = deck.draw(5).map(j => j.id);
      expect(new Set(ids).size).toBe(5);
    }
  });

  it('works through the whole corpus before repeating', () => {
    const deck = new Deck(variedCorpus, seededRng('coverage'));
    const seen = new Set<string>();
    for (let i = 0; i < variedCorpus.length / 5; i++) for (const j of deck.draw(5)) seen.add(j.id);
    expect(seen.size).toBe(variedCorpus.length);
  });

  it('refuses a draw larger than the corpus', () => {
    expect(() => new Deck(variedCorpus.slice(0, 3), seededRng('x')).draw(4)).toThrow(RangeError);
  });

  it('rejects a corpus with duplicate ids', () => {
    const a = variedCorpus[0];
    expect(() => new Deck([a, a, variedCorpus[1]], seededRng('dup'))).toThrow(/duplicate/);
  });

  it.each([4, 3])('draws %i of a 4-joke corpus without gaps or repeats', n => {
    const deck = new Deck(variedCorpus.slice(0, 4), seededRng(`tight-${n}`));
    for (let batch = 0; batch < 200; batch++) {
      const drawn = deck.draw(n);
      expect(drawn).toHaveLength(n);
      for (const j of drawn) expect(j).toBeDefined();
      expect(new Set(drawn.map(j => j.id)).size).toBe(n);
    }
  });
});
