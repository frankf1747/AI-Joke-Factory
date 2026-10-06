// services/bots/personas.test.ts
import { describe, it, expect } from 'vitest';
import { seededRng } from '../shared/jokes';
import {
  PERSONAS, PERSONA_ORDER, chooseWithMemory, choosePublished, jitter, personaSequence, publishCount, type Persona,
} from './personas';

const always = (x: number) => () => x;

describe('publishCount', () => {
  it('Careful publishes two, Spray publishes everything', () => {
    expect(publishCount(PERSONAS.CAREFUL, 5, 1, always(0.5))).toBe(2);
    expect(publishCount(PERSONAS.SPRAY, 5, 1, always(0.5))).toBe(5);
  });

  it('Balanced publishes three or four depending on the roll', () => {
    expect(publishCount(PERSONAS.BALANCED, 5, 1, always(0.1))).toBe(3);
    expect(publishCount(PERSONAS.BALANCED, 5, 1, always(0.9))).toBe(4);
  });

  it('never publishes more jokes than the batch has', () => {
    expect(publishCount(PERSONAS.SPRAY, 3, 2, always(0.5))).toBe(3);
    expect(publishCount(PERSONAS.BALANCED, 2, 2, always(0.9))).toBe(2);
  });

  it('enforces round 1\'s at-least-one rule even for a persona that would publish nothing', () => {
    const silent: Persona = { ...PERSONAS.CAREFUL, publish: () => 0 };
    expect(publishCount(silent, 5, 1, always(0.5))).toBe(1);
    expect(publishCount(silent, 5, 2, always(0.5))).toBe(0);
  });

  it('publishes nothing from an empty batch', () => {
    expect(publishCount(PERSONAS.SPRAY, 0, 1, always(0.5))).toBe(0);
  });
});

describe('choosePublished', () => {
  const ids = [11, 12, 13, 14, 15];

  it('keeps exactly the requested number of the given ids', () => {
    const kept = choosePublished(ids, 2, seededRng('choose'));
    expect(kept.size).toBe(2);
    for (const id of kept) expect(ids).toContain(id);
  });

  it('is deterministic for a given seed', () => {
    const a = choosePublished(ids, 3, seededRng('choose'));
    const b = choosePublished(ids, 3, seededRng('choose'));
    expect([...a]).toEqual([...b]);
  });

  it('clamps to the pool', () => {
    expect(choosePublished(ids, 9, always(0.5)).size).toBe(5);
    expect(choosePublished(ids, -1, always(0.5)).size).toBe(0);
  });
});

describe('jitter', () => {
  it('stays within ±25% by default', () => {
    expect(jitter(1000, always(0))).toBe(750);
    expect(jitter(1000, always(0.999999))).toBe(1250);
  });
});

describe('personaSequence', () => {
  it('interleaves personas so each spans the team numbers', () => {
    expect(personaSequence({ CAREFUL: 2, BALANCED: 2, SPRAY: 2, LEARNER: 0 }))
      .toEqual(['CAREFUL', 'BALANCED', 'SPRAY', 'CAREFUL', 'BALANCED', 'SPRAY']);
  });

  it('handles uneven and empty counts', () => {
    expect(personaSequence({ CAREFUL: 2, BALANCED: 0, SPRAY: 1, LEARNER: 0 })).toEqual(['CAREFUL', 'SPRAY', 'CAREFUL']);
    expect(personaSequence({ CAREFUL: 0, BALANCED: 0, SPRAY: 0, LEARNER: 0 })).toEqual([]);
  });
});

describe('Learner persona', () => {
  it('is in the order and publishes 2 of 3 by default', () => {
    expect(PERSONA_ORDER).toContain('LEARNER');
    expect(PERSONAS.LEARNER.leanBatchSize).toBe(3);
    expect(publishCount(PERSONAS.LEARNER, 3, 2, () => 0.5)).toBe(2);
  });

  it('keeps jokes it has seen sell, drops ones it has seen fail, fills from unknowns', () => {
    const memory = new Map<string, 'sold' | 'unsold'>([['hit', 'sold'], ['dud', 'unsold']]);
    const jokes = [
      { joke_id: 1, joke_text: 'hit' }, { joke_id: 2, joke_text: 'dud' }, { joke_id: 3, joke_text: 'new' }, { joke_id: 4, joke_text: 'other' },
    ];
    const keep = chooseWithMemory(jokes, memory, 2, () => 0);
    expect(keep.has(1)).toBe(true);
    expect(keep.has(2)).toBe(false);
    expect(keep.size).toBe(2); // the hit plus one unknown
  });

  it('never publishes nothing in round 1', () => {
    const memory = new Map<string, 'sold' | 'unsold'>([['dud', 'unsold']]);
    const keep = chooseWithMemory([{ joke_id: 2, joke_text: 'dud' }], memory, 0, () => 0, 1);
    expect(keep.size).toBe(1);
  });
});
