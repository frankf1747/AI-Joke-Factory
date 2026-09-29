import { describe, it, expect } from 'vitest';
import { seededRng } from './jokes';

describe('seededRng', () => {
  it('repeats the same sequence for the same seed', () => {
    const a = seededRng('bots:1');
    const b = seededRng('bots:1');
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('differs between seeds', () => {
    expect(seededRng('bots:1')()).not.toBe(seededRng('bots:2')());
  });

  // Golden values: if hashSeed or mulberry32 ever change, every fixture deal and
  // bot deck silently changes, so this pin forces that change to be deliberate.
  it('produces the pinned sequence for a known seed', () => {
    const r = seededRng('bots:1');
    expect(r()).toBe(0.48049018648453057);
    expect(r()).toBe(0.46553788729943335);
    expect(r()).toBe(0.9292137688025832);
  });

  it('uses a numeric seed directly, distinct from the same digits as a string', () => {
    const a = seededRng(42);
    const b = seededRng(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(seededRng(42)()).not.toBe(seededRng('42')());
  });

  it('stays in [0, 1)', () => {
    const r = seededRng('range');
    for (let i = 0; i < 1000; i++) {
      const x = r();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});
