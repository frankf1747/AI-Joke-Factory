import { describe, expect, it } from 'vitest';
import {
  TOUR_SEEN_PREFIX, isTourRole, launchMode, markTourSeen, readTourSeen, recordTourEnd, shouldAutoPlay,
  type SeenStore,
} from './seen';

class MemoryStore implements SeenStore {
  map = new Map<string, string>();
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
}
const broken: SeenStore = {
  getItem: () => { throw new Error('SecurityError'); },
  setItem: () => { throw new Error('QuotaExceededError'); },
};

describe('the seen flag', () => {
  it('is jf_tour_seen_v1:<ROLE>, a new key, separate from the old tutorial', () => {
    expect(TOUR_SEEN_PREFIX).toBe('jf_tour_seen_v1:');
    const store = new MemoryStore();
    store.setItem('jf_tutorial_seen_v1:JOKE_MAKER', '1');
    expect(readTourSeen('JOKE_MAKER', store)).toBe(false);
    markTourSeen('JOKE_MAKER', store);
    expect(store.getItem('jf_tour_seen_v1:JOKE_MAKER')).toBe('1');
    expect(readTourSeen('JOKE_MAKER', store)).toBe(true);
    expect(readTourSeen('QUALITY_CONTROL', store)).toBe(false);
  });

  it('reads as unknown (null) when storage is missing or throws, and writing never throws', () => {
    expect(readTourSeen('JOKE_MAKER', null)).toBeNull();
    expect(readTourSeen('JOKE_MAKER', broken)).toBeNull();
    expect(() => markTourSeen('JOKE_MAKER', broken)).not.toThrow();
    expect(() => markTourSeen('JOKE_MAKER', null)).not.toThrow();
  });

  it('is set when the tour is finished or skipped, and not after an error', () => {
    for (const outcome of ['finished', 'skipped'] as const) {
      const store = new MemoryStore();
      recordTourEnd('QUALITY_CONTROL', outcome, store);
      expect(readTourSeen('QUALITY_CONTROL', store)).toBe(true);
    }
    const store = new MemoryStore();
    recordTourEnd('QUALITY_CONTROL', 'error', store);
    expect(readTourSeen('QUALITY_CONTROL', store)).toBe(false);
  });
});

describe('isTourRole', () => {
  it('is the Joke Maker and Marketing only', () => {
    expect(isTourRole('JOKE_MAKER')).toBe(true);
    expect(isTourRole('QUALITY_CONTROL')).toBe(true);
    for (const r of ['INSTRUCTOR', 'CUSTOMER', 'UNASSIGNED', 'MARKETING', '', null, undefined]) expect(isTourRole(r)).toBe(false);
  });
});

describe('shouldAutoPlay and launchMode, every combination', () => {
  const roles = ['JOKE_MAKER', 'QUALITY_CONTROL', 'INSTRUCTOR', 'CUSTOMER', 'UNASSIGNED'];
  const seens = [true, false, null] as const;
  for (const role of roles) {
    for (const watch of [false, true]) {
      for (const seen of seens) {
        for (const roundActive of [false, true]) {
          const student = role === 'JOKE_MAKER' || role === 'QUALITY_CONTROL';
          const eligible = student && !watch && seen === false;
          const want = !eligible ? 'none' : roundActive ? 'prompt' : 'tour';
          it(`${role} watch=${watch} seen=${seen} roundActive=${roundActive} → ${want}`, () => {
            const input = { role, watch, seen, roundActive };
            expect(launchMode(input)).toBe(want);
            expect(shouldAutoPlay(input)).toBe(want === 'tour');
          });
        }
      }
    }
  }
});
