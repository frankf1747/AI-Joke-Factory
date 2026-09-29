// services/bots/personas.test.ts
import { describe, it, expect } from 'vitest';
import { seededRng } from '../shared/jokes';
import {
  PERSONAS, choosePublished, jitter, personaSequence, publishCount, type Persona,
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
    expect(personaSequence({ CAREFUL: 2, BALANCED: 2, SPRAY: 2 }))
      .toEqual(['CAREFUL', 'BALANCED', 'SPRAY', 'CAREFUL', 'BALANCED', 'SPRAY']);
  });

  it('handles uneven and empty counts', () => {
    expect(personaSequence({ CAREFUL: 2, BALANCED: 0, SPRAY: 1 })).toEqual(['CAREFUL', 'SPRAY', 'CAREFUL']);
    expect(personaSequence({ CAREFUL: 0, BALANCED: 0, SPRAY: 0 })).toEqual([]);
  });
});
