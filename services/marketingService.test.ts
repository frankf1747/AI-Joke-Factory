import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiError } from './apiClient';
import {
  MARKETING_NOTE_MAX, buildPublishBody, marketingService, publishFailureMessage, toMarketingNote,
} from './marketingService';

/* The publish body Marketing's desk sends, and what it does with a failure.
   The wire test drives the real service through the real apiRequest over a
   stubbed fetch, the way services/api/contract.test.ts does. */

class MemoryStorage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  clear() { this.map.clear(); }
  getItem(key: string) { return this.map.has(key) ? this.map.get(key)! : null; }
  setItem(key: string, value: string) { this.map.set(key, String(value)); }
  removeItem(key: string) { this.map.delete(key); }
  key(i: number) { return Array.from(this.map.keys())[i] ?? null; }
}

const realFetch = globalThis.fetch;

function stub(body: unknown, status = 200) {
  const spy = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => body,
    text: async () => JSON.stringify(body),
  })) as any;
  globalThis.fetch = spy;
  return spy;
}

beforeEach(() => {
  (globalThis as any).localStorage = new MemoryStorage();
  vi.stubEnv('VITE_API_BASE_URL', 'http://api.test');
  vi.stubEnv('VITE_USE_MOCK_API', 'false');
});

afterEach(() => {
  globalThis.fetch = realFetch;
  delete (globalThis as any).localStorage;
  vi.unstubAllEnvs();
});

const JOKES = [{ joke_id: 11 }, { joke_id: 12 }];

describe('buildPublishBody', () => {
  it('sends one decision per joke, titles only on published ones, and the note as typed', () => {
    const body = buildPublishBody(JOKES, [11], { '11': '  Office Hours  ', '12': 'ignored' }, 'More puns.\nShorter setups.');
    expect(body).toEqual({
      jokes: [
        { joke_id: 11, joke_title: 'Office Hours', is_published: true },
        { joke_id: 12, joke_title: '', is_published: false },
      ],
      note: 'More puns.\nShorter setups.',
    });
  });

  it('carries the note on a whole-batch discard too', () => {
    const body = buildPublishBody(JOKES, [], {}, 'Nothing landed — try workplace jokes.');
    expect(body.jokes.every(j => !j.is_published)).toBe(true);
    expect(body.note).toBe('Nothing landed — try workplace jokes.');
  });

  it('leaves a blank note off the wire, so the request is what it was before notes', () => {
    for (const note of ['', '   ', '\n\t']) {
      expect('note' in buildPublishBody(JOKES, [11], { '11': 't' }, note)).toBe(false);
    }
  });
});

describe('marketingService.publish', () => {
  it('puts the note on the wire next to the decisions', async () => {
    const spy = stub({ data: { batch: { batch_id: 7, status: 'PROCESSED', processed_at: null }, published: { count: 1, joke_ids: [11] }, discarded: { count: 1, joke_ids: [12] } } });
    await marketingService.publish(7, buildPublishBody(JOKES, [11], { '11': 'T' }, 'Keep it clean'));
    expect(String(spy.mock.calls[0][0])).toBe('http://api.test/v1/marketing/batches/7/publish');
    expect(JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string)).toEqual({
      jokes: [
        { joke_id: 11, joke_title: 'T', is_published: true },
        { joke_id: 12, joke_title: '', is_published: false },
      ],
      note: 'Keep it clean',
    });
  });

  it('surfaces a note over the limit as an ApiError on field note', async () => {
    stub({ error: { code: 'VALIDATION_ERROR', message: 'must be at most 500 characters', field: 'note' } }, 400);
    const err = (await marketingService.publish(7, buildPublishBody(JOKES, [11], { '11': 'T' }, 'x')).catch(e => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.field).toBe('note');
    expect(publishFailureMessage(err)).toBe(
      'Your note to the Joke Maker was not sent: must be at most 500 characters. Shorten it and release again.',
    );
  });
});

describe('publishFailureMessage', () => {
  it('keeps the existing messages for the existing failures', () => {
    expect(publishFailureMessage(new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'NO_JOKE_PUBLISHED', field: 'jokes' })))
      .toBe('Round 1 requires at least one joke to be published.');
    expect(publishFailureMessage(new ApiError({ status: 409, code: 'BATCH_ALREADY_PROCESSED', message: 'x' })))
      .toBe('This batch was already processed.');
    expect(publishFailureMessage(new ApiError({ status: 403, code: 'NOT_ASSIGNED_TO_THIS_MARKETER', message: 'x' })))
      .toBe('You are not assigned to this batch.');
    expect(publishFailureMessage(new ApiError({ status: 409, code: 'ROUND_NOT_ACTIVE', message: 'x' })))
      .toBe('Round is not active. Please wait for the instructor to start.');
    expect(publishFailureMessage(new TypeError('Failed to fetch'))).toBe('Failed to publish the batch. Please try again.');
  });
});

describe('toMarketingNote', () => {
  it('keeps text and turns absent, null, blank and non-strings into null', () => {
    expect(toMarketingNote('More puns')).toBe('More puns');
    for (const raw of [undefined, null, '', '  \n', 42, {}]) expect(toMarketingNote(raw)).toBeNull();
  });
});

describe('MARKETING_NOTE_MAX', () => {
  it('matches the backend limit', () => {
    expect(MARKETING_NOTE_MAX).toBe(500);
  });
});
