import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mockApiRequest } from './mockApi';
import { foundABuyer } from './scoreboard';
import { mapBatchFromTeamList } from '../context';

/* The scoreboard's "Found a buyer" reads PUBLISHED + first_sold_at off the
   team batch list. The mock must send the same fields the real backend does
   (handler/batch.go): publish_status as well as first_sold_at. */

class MemoryStorage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  clear() { this.map.clear(); }
  getItem(key: string) { return this.map.has(key) ? this.map.get(key)! : null; }
  setItem(key: string, value: string) { this.map.set(key, String(value)); }
  removeItem(key: string) { this.map.delete(key); }
  key(i: number) { return Array.from(this.map.keys())[i] ?? null; }
}

beforeEach(() => {
  (globalThis as any).localStorage = new MemoryStorage();
});
afterEach(() => {
  delete (globalThis as any).localStorage;
});

const LS_KEY = 'joke_factory_mock_db_v1';

/** A fresh DB with an ACTIVE round (the instructor's start does this in the app). */
async function startRound() {
  await mockApiRequest('/v1/teams');
  const db = JSON.parse(localStorage.getItem(LS_KEY)!);
  db.round.status = 'ACTIVE';
  localStorage.setItem(LS_KEY, JSON.stringify(db));
}

describe('mock team batch list', () => {
  it('reports released jokes as PUBLISHED with first_sold_at once the market buys them', async () => {
    await startRound();

    // Marketing's side of the loop: claim the stocked batch, split it, release 3 of 5.
    const next: any = await mockApiRequest('/v1/marketing/queue/next');
    const batchId = next.data.batch.batch_id as number;
    const teamId = next.data.batch.team_id as number;
    const roundId = next.data.batch.round_id as number;
    const split: any = await mockApiRequest(`/v1/marketing/batches/${batchId}/split`, {
      method: 'POST',
      body: { jokes: ['one', 'two', 'three', 'four', 'five'] },
    });
    const ids: number[] = split.data.jokes.map((j: any) => j.joke_id);
    const released = new Set(ids.slice(0, 3));
    const pub: any = await mockApiRequest(`/v1/marketing/batches/${batchId}/publish`, {
      method: 'POST',
      body: {
        jokes: ids.map(id => ({ joke_id: id, joke_title: released.has(id) ? `T${id}` : '', is_published: released.has(id) })),
      },
    });
    expect(pub.ok).toBe(true);

    // Each GET lets the simulated buyer buy one unsold released joke, so three
    // polls sell all three; the last one is the list itself.
    await mockApiRequest('/v1/teams');
    await mockApiRequest('/v1/teams');
    const res: any = await mockApiRequest(`/v1/rounds/${roundId}/teams/${teamId}/batches`);
    const listed = res.data.batches.find((b: any) => b.batch_id === batchId);

    for (const j of listed.jokes) {
      if (released.has(j.joke_id)) {
        expect(j.publish_status).toBe('PUBLISHED');
        expect(j.first_sold_at).toBeTruthy();
      } else {
        expect(j.publish_status).toBe('DISCARDED');
      }
    }

    // And the number the scoreboard shows, through the app's own batch mapping.
    const mapped = mapBatchFromTeamList(1, teamId as never, listed);
    expect(foundABuyer([mapped])).toBe(3);
  });

  it('lists a batch Marketing has not released yet as PENDING', async () => {
    await startRound();
    const next: any = await mockApiRequest('/v1/marketing/queue/next');
    const { batch_id, team_id, round_id } = next.data.batch;
    const res: any = await mockApiRequest(`/v1/rounds/${round_id}/teams/${team_id}/batches`);
    const listed = res.data.batches.find((b: any) => b.batch_id === batch_id);
    expect(listed.jokes.every((j: any) => j.publish_status === 'PENDING')).toBe(true);
  });
});
