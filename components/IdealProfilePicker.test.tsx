import { describe, it, expect } from 'vitest';
import { IDEAL_DIMENSIONS, DEFAULT_IDEAL_PROFILE, CATCH_ALL } from '../config/dimensions';
import { isCompleteProfile, selectableCategories } from './IdealProfilePicker';

describe('selectableCategories', () => {
  it('omits the catch-all, which the backend rejects', () => {
    for (const dim of IDEAL_DIMENSIONS) {
      expect(selectableCategories(dim)).not.toContain(CATCH_ALL);
    }
  });
  it('leaves at least one choice on every dimension', () => {
    for (const dim of IDEAL_DIMENSIONS) {
      expect(selectableCategories(dim).length).toBeGreaterThan(0);
    }
  });
});

describe('isCompleteProfile', () => {
  it('accepts the defaults', () => {
    expect(isCompleteProfile(DEFAULT_IDEAL_PROFILE)).toBe(true);
  });
  it('rejects a profile missing any dimension', () => {
    const partial = { ...DEFAULT_IDEAL_PROFILE };
    delete (partial as Record<string, string>).CLARITY;
    expect(isCompleteProfile(partial)).toBe(false);
  });
  it('rejects a blank selection', () => {
    expect(isCompleteProfile({ ...DEFAULT_IDEAL_PROFILE, CLARITY: '' })).toBe(false);
  });
  it('rejects a catch-all selection', () => {
    expect(isCompleteProfile({ ...DEFAULT_IDEAL_PROFILE, ENERGY: CATCH_ALL })).toBe(false);
  });
  it('does not require TITLE_FIT, which has no ideal', () => {
    expect(Object.keys(DEFAULT_IDEAL_PROFILE)).not.toContain('TITLE_FIT');
    expect(isCompleteProfile(DEFAULT_IDEAL_PROFILE)).toBe(true);
  });
});
