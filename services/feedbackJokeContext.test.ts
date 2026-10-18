import { describe, expect, it } from 'vitest';
import { feedbackJokeContext } from './feedbackJokeContext';
import type { Batch, Joke } from '../types';
import type { FeedbackRow } from '../views/feedback';

const joke = (id: number, over: Partial<Joke> = {}): Joke =>
  ({ joke_id: id, joke_text: `text ${id}`, id: String(id), content: `text ${id}`, ...over }) as Joke;
const batch = (id: number, jokes: Joke[], over: Partial<Batch> = {}): Batch =>
  ({ batch_id: id, round_id: 1, team_id: 1, status: 'PROCESSED', jokes, id: String(id), ...over }) as unknown as Batch;
const row = (id: number, title: string): FeedbackRow =>
  ({ joke_id: id, joke_title: title, was_bought: false, good: [], improve: [] });

describe('feedbackJokeContext', () => {
  const batches = [
    batch(5001, [joke(11)]),
    batch(5002, [
      joke(21, { joke_text: 'I told my boss I needed a raise.', sold_count: 6, published_at: '2026-10-18T10:00:00Z' }),
      joke(22),
      joke(23, { sold_count: 0 }),
    ], { ratedAt: Date.parse('2026-10-18T09:59:00Z') }),
  ];

  it('fills batch, 1-based position, text, release time and buyers from the joke\'s batch', () => {
    const [a, b] = feedbackJokeContext([row(21, 'The Self-Starter'), row(23, 'Could Have Been an Email')], batches);
    expect(a).toMatchObject({
      joke_id: 21, joke_title: 'The Self-Starter',
      batchId: 5002, position: 1, text: 'I told my boss I needed a raise.',
      releasedAt: Date.parse('2026-10-18T10:00:00Z'), soldCount: 6,
    });
    // No published_at on the joke: the batch's processed time stands in.
    expect(b).toMatchObject({ batchId: 5002, position: 3, text: 'text 23', releasedAt: Date.parse('2026-10-18T09:59:00Z'), soldCount: 0 });
  });

  it('keeps the feedback order and fields', () => {
    const rows = [row(23, 'C'), row(11, 'A')];
    const out = feedbackJokeContext(rows, batches);
    expect(out.map(r => r.joke_id)).toEqual([23, 11]);
    expect(out[1]).toMatchObject({ batchId: 5001, position: 1, releasedAt: null, soldCount: null });
  });

  it('gives a joke missing from the batches nulls and keeps its title', () => {
    const [m] = feedbackJokeContext([row(99, 'Brand New')], batches);
    expect(m).toMatchObject({
      joke_id: 99, joke_title: 'Brand New',
      batchId: null, position: null, text: null, releasedAt: null, soldCount: null,
    });
  });
});
