import { describe, expect, it } from 'vitest';
import type { Batch, Joke } from '../types';
import { latestRelease, moreWaiting, splitStatus } from './desk';

describe('moreWaiting', () => {
  it('does not count the batch on the desk', () => {
    expect(moreWaiting(2, true)).toBe(1);
    expect(moreWaiting(1, true)).toBe(0);
  });
  it('counts everything when no batch is on the desk', () => {
    expect(moreWaiting(2, false)).toBe(2);
  });
  it('stays unknown while the count is unknown', () => {
    expect(moreWaiting(null, false)).toBeNull();
    expect(moreWaiting(null, true)).toBeNull();
  });
  it('never goes below zero', () => {
    expect(moreWaiting(0, true)).toBe(0);
  });
});

describe('splitStatus', () => {
  const r1 = { round: 1 as const, batchSize: 5, limit: 10 };
  const r2 = { round: 2 as const, batchSize: 5, limit: 10 };

  it('asks for a first cut when nothing is split', () => {
    expect(splitStatus({ ...r1, cuts: 0, remainder: 'x' })).toEqual({
      count: 0, valid: false, message: 'Split at least one joke first.',
    });
  });
  it('asks to finish while text remains', () => {
    expect(splitStatus({ ...r1, cuts: 3, remainder: 'x' })).toEqual({
      count: 3, valid: false, message: 'Split the remaining text to finish.',
    });
  });
  it('does not count the uncut remainder as a joke', () => {
    expect(splitStatus({ ...r1, cuts: 4, remainder: 'x' }).count).toBe(4);
  });
  it('treats a whitespace-only remainder as empty', () => {
    expect(splitStatus({ ...r1, cuts: 5, remainder: ' \n ' }).valid).toBe(true);
  });
  it('Round 1 needs exactly the batch size', () => {
    expect(splitStatus({ ...r1, cuts: 4, remainder: '' })).toEqual({
      count: 4, valid: false, message: 'Round 1 needs exactly 5 jokes; you have 4.',
    });
    expect(splitStatus({ ...r1, cuts: 5, remainder: '' })).toEqual({
      count: 5, valid: true, message: 'All split. Check the jokes, then confirm.',
    });
    expect(splitStatus({ ...r1, cuts: 6, remainder: '' }).valid).toBe(false);
  });
  it('Round 2 allows one up to the limit', () => {
    expect(splitStatus({ ...r2, cuts: 11, remainder: '' })).toEqual({
      count: 11, valid: false, message: 'Round 2 allows up to 10; you have 11.',
    });
    expect(splitStatus({ ...r2, cuts: 10, remainder: '' }).valid).toBe(true);
    expect(splitStatus({ ...r2, cuts: 1, remainder: '' }).valid).toBe(true);
  });
  it('nothing left to cut and nothing cut asks for a first cut', () => {
    expect(splitStatus({ ...r2, cuts: 0, remainder: '' }).message).toBe('Split at least one joke first.');
  });
});

function joke(id: number, status: Joke['publish_status']): Joke {
  return { joke_id: id, joke_text: 't', id: String(id), content: 't', publish_status: status } as Joke;
}
function batch(id: number, over: Partial<Batch>): Batch {
  return { batch_id: id, round_id: 1, team_id: 1, status: 'PROCESSED', jokes: [], id: String(id), ...over } as unknown as Batch;
}

describe('latestRelease', () => {
  it('is null when nothing has been released', () => {
    expect(latestRelease([])).toBeNull();
    expect(latestRelease([batch(1, { status: 'SUBMITTED', jokes: [joke(1, 'PENDING')] })])).toBeNull();
    expect(latestRelease([batch(1, { ratedAt: undefined, jokes: [joke(1, 'PUBLISHED')] })])).toBeNull();
  });
  it('picks the largest ratedAt, not the largest id', () => {
    const r = latestRelease([
      batch(2, { ratedAt: 1000, jokes: [joke(1, 'PUBLISHED')] }),
      batch(9, { ratedAt: 500, jokes: [joke(2, 'DISCARDED')] }),
      batch(5, { status: 'SUBMITTED', jokes: [joke(3, 'PENDING')] }),
    ]);
    expect(r?.batchId).toBe(2);
  });
  it('counts published and discarded jokes', () => {
    const r = latestRelease([batch(3, {
      ratedAt: 10,
      jokes: [joke(1, 'PUBLISHED'), joke(2, 'PUBLISHED'), joke(3, 'PUBLISHED'), joke(4, 'DISCARDED'), joke(5, 'DISCARDED')],
    })]);
    expect(r).toEqual({ batchId: 3, published: 3, discarded: 2, noteSent: false });
  });
  it('reports a note only when it is not blank', () => {
    const jokes = [joke(1, 'PUBLISHED')];
    expect(latestRelease([batch(1, { ratedAt: 1, jokes, marketing_note: 'More puns' })])?.noteSent).toBe(true);
    expect(latestRelease([batch(1, { ratedAt: 1, jokes, marketing_note: '  ' })])?.noteSent).toBe(false);
    expect(latestRelease([batch(1, { ratedAt: 1, jokes, marketing_note: null })])?.noteSent).toBe(false);
  });
});
