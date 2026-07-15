import { describe, it, expect } from 'vitest';
import { computeProfit, selectPublishedJokeIds, computeLeadTimeSeconds } from './economics';

describe('computeProfit (two-cost)', () => {
  const rates = { marketPrice: 1, costOfCreation: 0.1, costOfPublishing: 0.1 };

  it('a sold joke nets price minus both costs', () => {
    expect(computeProfit({ created: 1, published: 1, sold: 1 }, rates)).toBeCloseTo(0.8, 6);
  });

  it('a published-but-unsold joke loses creation + publish', () => {
    expect(computeProfit({ created: 1, published: 1, sold: 0 }, rates)).toBeCloseTo(-0.2, 6);
  });

  it('a created-but-rejected joke loses only creation', () => {
    expect(computeProfit({ created: 1, published: 0, sold: 0 }, rates)).toBeCloseTo(-0.1, 6);
  });

  it('40 created · 20 published · 11 sold → +5.00', () => {
    expect(computeProfit({ created: 40, published: 20, sold: 11 }, rates)).toBeCloseTo(5, 6);
  });
});

describe('selectPublishedJokeIds (force-release)', () => {
  it('publishes all 5-rated when present', () => {
    expect(
      selectPublishedJokeIds([
        { joke_id: 1, rating: 5 },
        { joke_id: 2, rating: 3 },
        { joke_id: 3, rating: 5 },
      ]).sort(),
    ).toEqual([1, 3]);
  });

  it('publishes the single highest-rated when no 5 exists', () => {
    expect(
      selectPublishedJokeIds([
        { joke_id: 1, rating: 2 },
        { joke_id: 2, rating: 4 },
        { joke_id: 3, rating: 3 },
      ]),
    ).toEqual([2]);
  });

  it('breaks ties by lowest joke_id when no 5 exists', () => {
    expect(
      selectPublishedJokeIds([
        { joke_id: 7, rating: 4 },
        { joke_id: 3, rating: 4 },
      ]),
    ).toEqual([3]);
  });

  it('always returns at least one for a non-empty batch', () => {
    expect(selectPublishedJokeIds([{ joke_id: 9, rating: 1 }])).toEqual([9]);
  });
});

describe('computeLeadTimeSeconds', () => {
  it('returns seconds between submitted and first sold', () => {
    expect(
      computeLeadTimeSeconds('2026-06-01T10:00:00Z', '2026-06-01T10:01:30Z'),
    ).toBe(90);
  });

  it('returns null if first_sold_at is null/undefined', () => {
    expect(computeLeadTimeSeconds('2026-06-01T10:00:00Z', null)).toBeNull();
    expect(computeLeadTimeSeconds('2026-06-01T10:00:00Z', undefined)).toBeNull();
  });
});
