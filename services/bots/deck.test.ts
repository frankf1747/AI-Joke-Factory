// services/bots/deck.test.ts
import { describe, it, expect } from 'vitest';
import { Deck, drawLearnerBatch } from './deck';
import type { JokeMemory } from './personas';
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

describe('drawLearnerBatch', () => {
  const textOf = (i: number) => variedCorpus[i].text;

  it('draws exactly like the deck while no sold text is known', () => {
    const memory: JokeMemory = new Map([[textOf(0), 'unsold']]);
    const plain = new Deck(variedCorpus, seededRng('same'));
    const learner = new Deck(variedCorpus, seededRng('same'));
    let cursor = 0;
    for (let batch = 0; batch < 5; batch++) {
      const out = drawLearnerBatch(learner, variedCorpus, memory, 5, cursor);
      cursor = out.cursor;
      expect(out.jokes.map(j => j.id)).toEqual(plain.draw(5).map(j => j.id));
    }
  });

  it('reuses floor(size/2) sold texts, rotating through them', () => {
    const memory: JokeMemory = new Map([[textOf(0), 'sold'], [textOf(1), 'sold'], [textOf(2), 'sold']]);
    const deck = new Deck(variedCorpus, seededRng('rotate'));
    const first = drawLearnerBatch(deck, variedCorpus, memory, 5, 0);
    const second = drawLearnerBatch(deck, variedCorpus, memory, 5, first.cursor);
    const reusedIn = (jokes: readonly { id: string }[]) => jokes.map(j => j.id).filter(id => ['A01', 'A02', 'A03'].includes(id));
    expect(first.jokes).toHaveLength(5);
    expect(reusedIn(first.jokes.slice(0, 2))).toEqual([variedCorpus[0].id, variedCorpus[1].id]);
    expect(reusedIn(second.jokes.slice(0, 2))).toEqual([variedCorpus[2].id, variedCorpus[0].id]);
    for (const out of [first, second]) expect(new Set(out.jokes.map(j => j.id)).size).toBe(5);
  });

  it('reuses at least one sold text in a batch of 2 or 3, none in a batch of 1', () => {
    const memory: JokeMemory = new Map([[textOf(0), 'sold']]);
    const deck = new Deck(variedCorpus, seededRng('small'));
    expect(drawLearnerBatch(deck, variedCorpus, memory, 3, 0).jokes.map(j => j.id)).toContain(variedCorpus[0].id);
    expect(drawLearnerBatch(deck, variedCorpus, memory, 2, 0).jokes.map(j => j.id)).toContain(variedCorpus[0].id);
    expect(drawLearnerBatch(deck, variedCorpus, memory, 1, 0).jokes).toHaveLength(1);
  });

  it('skips texts known not to sell when the deck can avoid them', () => {
    const corpus = variedCorpus.slice(0, 8);
    const memory: JokeMemory = new Map([[corpus[0].text, 'sold']]);
    for (const j of corpus.slice(1, 5)) memory.set(j.text, 'unsold');
    const deck = new Deck(corpus, seededRng('skip'));
    for (let batch = 0; batch < 20; batch++) {
      const { jokes } = drawLearnerBatch(deck, corpus, memory, 3, batch);
      expect(jokes).toHaveLength(3);
      expect(new Set(jokes.map(j => j.id)).size).toBe(3);
      for (const j of jokes) expect(memory.get(j.text)).not.toBe('unsold');
    }
  });

  it('accepts a text known not to sell when the deck cannot avoid it', () => {
    const corpus = variedCorpus.slice(0, 4);
    const memory: JokeMemory = new Map([[corpus[0].text, 'sold']]);
    for (const j of corpus.slice(1)) memory.set(j.text, 'unsold');
    const deck = new Deck(corpus, seededRng('stuck'));
    const { jokes } = drawLearnerBatch(deck, corpus, memory, 3, 0);
    expect(jokes).toHaveLength(3);
    expect(new Set(jokes.map(j => j.id)).size).toBe(3);
  });
});
