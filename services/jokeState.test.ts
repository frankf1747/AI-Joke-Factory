import { describe, it, expect } from 'vitest';
import type { Batch, Joke } from '../types';
import { jokeState, jokeDetail, batchSummary, stageCounts } from './jokeState';

const NOW = Date.parse('2026-10-18T10:10:00Z');
const PUBLISHED_AT = '2026-10-18T10:06:00Z'; // 240 s before NOW

function joke(over: Partial<Joke> = {}): Joke {
  return { joke_id: 1, joke_text: 'text', id: '1', content: 'text', ...over } as Joke;
}

function batch(status: Batch['status'], jokes: Joke[]): Batch {
  return { batch_id: 1, round_id: 1, team_id: 1, status, jokes, id: '1' } as unknown as Batch;
}

describe('jokeState and jokeDetail', () => {
  it('PENDING is with Marketing', () => {
    const j = joke({ publish_status: 'PENDING' });
    expect(jokeState(j)).toBe('with-marketing');
    expect(jokeDetail(j, NOW)).toBe('With Marketing');
  });

  it('PUBLISHED with buyers is selling', () => {
    const j = joke({ publish_status: 'PUBLISHED', sold_count: 6 });
    expect(jokeState(j)).toBe('selling');
    expect(jokeDetail(j, NOW)).toBe('6 buyers');
  });

  it('says "1 buyer" for a single buyer', () => {
    expect(jokeDetail(joke({ publish_status: 'PUBLISHED', sold_count: 1 }), NOW)).toBe('1 buyer');
  });

  it('PUBLISHED, no buyers now, sold before is lost-buyers', () => {
    const j = joke({ publish_status: 'PUBLISHED', sold_count: 0, first_sold_at: '2026-10-18T10:07:00Z' });
    expect(jokeState(j)).toBe('lost-buyers');
    expect(jokeDetail(j, NOW)).toBe('Sold before, swapped out');
  });

  it('PUBLISHED, never sold is no-buyer with the time on market', () => {
    const j = joke({ publish_status: 'PUBLISHED', sold_count: 0, first_sold_at: null, published_at: PUBLISHED_AT });
    expect(jokeState(j)).toBe('no-buyer');
    expect(jokeDetail(j, NOW)).toBe('No buyer yet, on market 4 min');
  });

  it('no-buyer without a release time drops the wait', () => {
    const j = joke({ publish_status: 'PUBLISHED' });
    expect(jokeState(j)).toBe('no-buyer');
    expect(jokeDetail(j, NOW)).toBe('No buyer yet');
  });

  it('DISCARDED is not released', () => {
    const j = joke({ publish_status: 'DISCARDED' });
    expect(jokeState(j)).toBe('not-released');
    expect(jokeDetail(j, NOW)).toBe('Not released by Marketing');
  });

  describe('legacy mock without publish_status', () => {
    it('falls back to is_published and the batch status', () => {
      const sold = joke({ is_published: true, sold_count: 3 });
      const unsold = joke({ is_published: true, sold_count: 0 });
      const dropped = joke({ is_published: false });
      expect(jokeState(sold, batch('RATED', [sold]))).toBe('selling');
      expect(jokeState(unsold, batch('PROCESSED', [unsold]))).toBe('no-buyer');
      expect(jokeState(dropped, batch('PROCESSED', [dropped]))).toBe('not-released');
    });

    it('a joke in an unprocessed batch is with Marketing', () => {
      const j = joke({ is_published: false });
      expect(jokeState(j, batch('SUBMITTED', [j]))).toBe('with-marketing');
    });
  });
});

describe('batchSummary', () => {
  const pub = (n: number) => joke({ publish_status: 'PUBLISHED', sold_count: n });

  it('a SUBMITTED batch is with Marketing', () => {
    expect(batchSummary(batch('SUBMITTED', [joke({ publish_status: 'PENDING' })]))).toBe('With Marketing');
  });

  it('a DRAFT batch is with Marketing', () => {
    expect(batchSummary(batch('DRAFT', []))).toBe('With Marketing');
  });

  it('counts jokes on the market and their buyers', () => {
    const b = batch('PROCESSED', [pub(5), pub(4), pub(3), pub(0), joke({ publish_status: 'DISCARDED' })]);
    expect(batchSummary(b)).toBe('4 on market, 12 buyers');
  });

  it('says "1 buyer" for a single buyer', () => {
    expect(batchSummary(batch('PROCESSED', [pub(1), pub(0)]))).toBe('2 on market, 1 buyer');
  });

  it('says "no buyers yet" when nobody holds a joke', () => {
    expect(batchSummary(batch('PROCESSED', [pub(0)]))).toBe('1 on market, no buyers yet');
  });

  it('says "None released" when Marketing released nothing', () => {
    expect(batchSummary(batch('PROCESSED', [joke({ publish_status: 'DISCARDED' })]))).toBe('None released');
  });
});

describe('stageCounts', () => {
  it('counts across batches and leaves out jokes still with Marketing', () => {
    const batches = [
      batch('PROCESSED', [
        joke({ publish_status: 'PUBLISHED', sold_count: 2 }),
        joke({ publish_status: 'PUBLISHED', sold_count: 0, first_sold_at: '2026-10-18T10:00:00Z' }),
        joke({ publish_status: 'DISCARDED' }),
      ]),
      batch('PROCESSED', [
        joke({ publish_status: 'PUBLISHED', sold_count: 1 }),
        joke({ publish_status: 'PUBLISHED', sold_count: 0 }),
        joke({ publish_status: 'PUBLISHED', sold_count: 0 }),
      ]),
      batch('SUBMITTED', [joke({ publish_status: 'PENDING' }), joke({ publish_status: 'PENDING' })]),
    ];
    expect(stageCounts(batches)).toEqual({ selling: 2, lostBuyers: 1, noBuyer: 2, notReleased: 1 });
  });

  it('is all zero for no batches', () => {
    expect(stageCounts([])).toEqual({ selling: 0, lostBuyers: 0, noBuyer: 0, notReleased: 0 });
  });
});
