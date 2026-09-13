import { describe, it, expect } from 'vitest';
import {
  computeProfit, selectPublishedJokeIds, computeLeadTimeSeconds,
  computeAvgCreatedToPublishSeconds,
} from './economics';

describe('computeProfit (Marketing-only costs)', () => {
  const rates = { marketPrice: 1, costOfPublishing: 0.1, costOfDiscard: 0.01 };

  it('a sold joke nets price minus the publish cost only', () => {
    expect(computeProfit({ created: 1, published: 1, sold: 1 }, rates)).toBeCloseTo(0.9, 6);
  });

  it('a published-but-unsold joke loses only the publish cost', () => {
    expect(computeProfit({ created: 1, published: 1, sold: 0 }, rates)).toBeCloseTo(-0.1, 6);
  });

  it('a created-but-discarded joke loses only the discard cost', () => {
    expect(computeProfit({ created: 1, published: 0, sold: 0 }, rates)).toBeCloseTo(-0.01, 6);
  });

  it('creating jokes is free for the JM — 40 created, none published, none sold', () => {
    // 40 discarded × 0.01 = 0.40; no creation charge exists.
    expect(computeProfit({ created: 40, published: 0, sold: 0 }, rates)).toBeCloseTo(-0.4, 6);
  });

  it('40 created · 20 published · 11 sold → 11 − 2.00 − 0.20 = +8.80', () => {
    expect(computeProfit({ created: 40, published: 20, sold: 11 }, rates)).toBeCloseTo(8.8, 6);
  });

  it('never charges negative discards when published exceeds created', () => {
    expect(computeProfit({ created: 0, published: 2, sold: 0 }, rates)).toBeCloseTo(-0.2, 6);
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

  it('keeps that safety net by default, so Round 1 cannot ship an empty batch', () => {
    expect(selectPublishedJokeIds([{ joke_id: 4, rating: 1 }], {})).toEqual([4]);
  });

  it('publishes nothing when the round allows it and nothing scored 5', () => {
    // Round 2: Marketing may reject a whole batch, so the safety net stands down.
    expect(
      selectPublishedJokeIds([
        { joke_id: 1, rating: 1 },
        { joke_id: 2, rating: 1 },
      ], { allowEmpty: true }),
    ).toEqual([]);
  });

  it('still publishes the 5-rated jokes when the round allows empty', () => {
    expect(
      selectPublishedJokeIds([
        { joke_id: 1, rating: 5 },
        { joke_id: 2, rating: 1 },
      ], { allowEmpty: true }),
    ).toEqual([1]);
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

describe('computeAvgCreatedToPublishSeconds', () => {
  const at = (s: number) => new Date(1_700_000_000_000 + s * 1000).toISOString();

  it('returns null when the team has no batches', () => {
    expect(computeAvgCreatedToPublishSeconds([])).toBeNull();
  });

  it('returns null while every batch is still unpublished', () => {
    expect(computeAvgCreatedToPublishSeconds([
      { submitted_at: at(0), rated_at: null },
      { submitted_at: at(10) },
    ])).toBeNull();
  });

  it('measures one batch from submission to release', () => {
    expect(computeAvgCreatedToPublishSeconds([
      { submitted_at: at(0), rated_at: at(90) },
    ])).toBe(90);
  });

  it('averages across every published batch', () => {
    expect(computeAvgCreatedToPublishSeconds([
      { submitted_at: at(0), rated_at: at(60) },   // 60s
      { submitted_at: at(100), rated_at: at(220) }, // 120s
    ])).toBe(90);
  });

  it('ignores batches still sitting in the backlog', () => {
    expect(computeAvgCreatedToPublishSeconds([
      { submitted_at: at(0), rated_at: at(60) },
      { submitted_at: at(10) },                      // never released
    ])).toBe(60);
  });

  it('ignores batches with no submission time', () => {
    expect(computeAvgCreatedToPublishSeconds([
      { rated_at: at(60) },
      { submitted_at: at(0), rated_at: at(40) },
    ])).toBe(40);
  });

  it('ignores unparseable timestamps rather than poisoning the average', () => {
    expect(computeAvgCreatedToPublishSeconds([
      { submitted_at: 'not-a-date', rated_at: at(60) },
      { submitted_at: at(0), rated_at: at(30) },
    ])).toBe(30);
  });

  it('rounds to whole seconds', () => {
    expect(computeAvgCreatedToPublishSeconds([
      { submitted_at: at(0), rated_at: at(10) },
      { submitted_at: at(0), rated_at: at(11) },
    ])).toBe(11); // 10.5 → 11
  });

  it('never reports negative time when clocks disagree', () => {
    expect(computeAvgCreatedToPublishSeconds([
      { submitted_at: at(100), rated_at: at(40) },
    ])).toBe(0);
  });
});
