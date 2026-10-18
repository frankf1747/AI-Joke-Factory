import { describe, expect, it } from 'vitest';
import { DEFAULT_CUSTOMER_BUDGET, buildApplyUpdates, customerBudgetFromRound, configFromInstructorRound, storedConfigPatch, isRouteMissing } from './roundConfig';
import { DEFAULT_IDEAL_PROFILE } from '../config/dimensions';
import { feeValuesOf } from '../components/FeeConfigFields';
import { TEST_CONFIG } from '../views/testing/renderWithGame';

describe('customerBudgetFromRound (the CONFIG "Cust. Budget" box)', () => {
  it('shows the stored budget of a round that has not started, not the stale default', () => {
    // The bug: the budget was only read once the round was ACTIVE or ENDED, so a CONFIGURED
    // round showed the front end's old default of 10 while the backend held 3.
    expect(customerBudgetFromRound({ status: 'CONFIGURED', customer_budget: 3 }, 10)).toBe(3);
    expect(customerBudgetFromRound({ status: 'ACTIVE', customer_budget: 3 }, 10)).toBe(3);
    expect(customerBudgetFromRound({ status: 'ENDED', customer_budget: 4 }, 10)).toBe(4);
  });

  it('keeps what it had when the round sends no usable budget (a placeholder 0, or nothing)', () => {
    expect(customerBudgetFromRound({ customer_budget: 0 }, 3)).toBe(3);
    expect(customerBudgetFromRound(null, 3)).toBe(3);
    expect(customerBudgetFromRound({}, 3)).toBe(3);
  });

  it('starts from the backend default of 3', () => {
    expect(DEFAULT_CUSTOMER_BUDGET).toBe(3);
  });
});

describe('buildApplyUpdates (what Apply sends)', () => {
  const config = { ...TEST_CONFIG, isActive: false, customersPerTeam: 18 };
  const all = { canEditBudget: true, canEditPricing: true, canEditNudges: true, canEditLean: true };
  const local = (over: Partial<Parameters<typeof buildApplyUpdates>[0]['local']> = {}) => ({
    budget: config.customerBudget, marketPrice: config.marketPrice, costOfPublishing: config.costOfPublishing,
    nudge1: config.marketingNudge1Seconds, nudge2: config.marketingNudge2Seconds, fees: feeValuesOf(config), ...over,
  });

  it('sends nothing, in particular no budget and no customer count, when the instructor edited nothing', () => {
    expect(buildApplyUpdates({ local: local(), config, ...all })).toEqual({});
  });

  it('sends only the field that was edited', () => {
    expect(buildApplyUpdates({ local: local({ budget: 5 }), config, ...all })).toEqual({ customerBudget: 5 });
    const fees = { ...feeValuesOf(config), customersPerTeam: 20 };
    const u = buildApplyUpdates({ local: local({ fees }), config, ...all });
    expect(u).toEqual({ customersPerTeam: 20 });
    expect(u).not.toHaveProperty('customerBudget');
    expect(u).not.toHaveProperty('customerCount');
  });

  it('leaves out fields the screen has locked, and clamps the nudges to 5 s', () => {
    expect(buildApplyUpdates({ local: local({ budget: 9 }), config, ...all, canEditBudget: false })).toEqual({});
    expect(buildApplyUpdates({ local: local({ nudge1: 1 }), config, ...all })).toEqual({ marketingNudge1Seconds: 5 });
    const fees = { ...feeValuesOf(config), customersPerTeam: 20 };
    expect(buildApplyUpdates({ local: local({ fees }), config, ...all, canEditLean: false })).toEqual({});
  });
});

describe('configFromInstructorRound (the stored config read back after a reload)', () => {
  const stored = { id: 1, round_number: 1, status: 'CONFIGURED', customer_budget: 4, market_price: 2, cost_of_publishing: 0.3, cost_of_discard: 0.05 } as any;

  it('shows the stored ideal joke: TOPIC Animals, not the default Work', () => {
    const got = configFromInstructorRound({ ...stored, ideal_profile: { ...DEFAULT_IDEAL_PROFILE, TOPIC: 'Animals' } });
    expect(got.idealProfile?.TOPIC).toBe('Animals');
    expect(DEFAULT_IDEAL_PROFILE.TOPIC).toBe('Work');
  });

  it('falls back to the default profile when none is stored', () => {
    expect(configFromInstructorRound(stored).idealProfile).toEqual(DEFAULT_IDEAL_PROFILE);
  });

  it('keeps a default for a dimension the stored profile lacks or blanks, and drops unknown keys', () => {
    const got = configFromInstructorRound({ ...stored, ideal_profile: { TOPIC: 'Animals', LENGTH: '', TITLE_FIT: 'Perfect' } });
    expect(got.idealProfile).toEqual({ ...DEFAULT_IDEAL_PROFILE, TOPIC: 'Animals' });
  });

  it('fills the numbers the CONFIG row shows, and leaves out those the round does not send', () => {
    expect(configFromInstructorRound(stored)).toMatchObject({ customerBudget: 4, marketPrice: 2, costOfPublishing: 0.3 });
    expect(configFromInstructorRound(stored)).not.toHaveProperty('costOfDiscard');
    const bare = configFromInstructorRound({ id: 1, round_number: 1, status: 'CONFIGURED', customer_budget: 0 } as any);
    expect(Object.keys(bare).sort()).toEqual(['idealProfile']);
  });
});

describe('storedConfigPatch (when a GET /config result may touch the screen)', () => {
  const animals = { ...DEFAULT_IDEAL_PROFILE, TOPIC: 'Animals' };
  const withProfile = { id: 2, round_number: 2, status: 'CONFIGURED', customer_budget: 5, market_price: 2, cost_of_publishing: 0.3, ideal_profile: animals } as any;
  const noProfile = { id: 2, round_number: 2, status: 'CONFIGURED', customer_budget: 3, market_price: 1, cost_of_publishing: 0.1 } as any;
  const ctx = { roundStillViewed: true, isFirstLoad: false, editedKeys: new Set<keyof typeof TEST_CONFIG>() };

  it('changes nothing when the round it was fetched for is no longer the one in view', () => {
    expect(storedConfigPatch(withProfile, { ...ctx, roundStillViewed: false, isFirstLoad: true })).toEqual({});
  });

  it('on first load with no stored profile, shows the default profile and the stored numbers', () => {
    const patch = storedConfigPatch(noProfile, { ...ctx, isFirstLoad: true });
    expect(patch.idealProfile).toEqual(DEFAULT_IDEAL_PROFILE);
    expect(patch).toMatchObject({ customerBudget: 3, marketPrice: 1, costOfPublishing: 0.1 });
  });

  it('on a round change to a round with no stored profile, keeps the profile and prices on screen', () => {
    expect(storedConfigPatch(noProfile, ctx)).toEqual({});
    expect(storedConfigPatch({ ...noProfile, ideal_profile: {} }, ctx)).toEqual({});
  });

  it('on a round change to a round with a stored profile, takes the profile and numbers', () => {
    const patch = storedConfigPatch(withProfile, ctx);
    expect(patch.idealProfile?.TOPIC).toBe('Animals');
    expect(patch).toMatchObject({ customerBudget: 5, marketPrice: 2, costOfPublishing: 0.3 });
  });

  it('skips only the keys edited while the fetch was in flight', () => {
    const patch = storedConfigPatch(withProfile, { ...ctx, editedKeys: new Set(['idealProfile', 'marketPrice']) });
    expect(patch).not.toHaveProperty('idealProfile');
    expect(patch).not.toHaveProperty('marketPrice');
    expect(patch).toMatchObject({ customerBudget: 5, costOfPublishing: 0.3 });
  });
});

describe('isRouteMissing (the GET /config latch)', () => {
  it('latches on a 405 and on a 404 that is not the domain NOT_FOUND envelope', () => {
    expect(isRouteMissing({ status: 405 })).toBe(true);
    expect(isRouteMissing({ status: 404 })).toBe(true);
    expect(isRouteMissing({ status: 404, code: 'ROUTE_NOT_FOUND' })).toBe(true);
  });
  it('does not latch on a 404 for an unknown round, or on other failures', () => {
    expect(isRouteMissing({ status: 404, code: 'NOT_FOUND' })).toBe(false);
    expect(isRouteMissing({ status: 500 })).toBe(false);
    expect(isRouteMissing({ status: 401 })).toBe(false);
  });
});
