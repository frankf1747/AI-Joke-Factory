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

  it('stays in [0, 1)', () => {
    const r = seededRng('range');
    for (let i = 0; i < 1000; i++) {
      const x = r();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});
