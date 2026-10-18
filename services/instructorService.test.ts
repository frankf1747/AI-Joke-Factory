import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { instructorService } from './instructorService';

/* getRoundConfig drives the real service through the real apiRequest over a
   stubbed fetch, the way marketingService.test.ts does. */

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

describe('instructorService.getRoundConfig', () => {
  it('reads GET /v1/instructor/rounds/7/config and returns the unwrapped round', async () => {
    const spy = stub({ data: { round: { id: 7, round_number: 1, ideal_profile: { TOPIC: 'Animals' } } } });
    const res = await instructorService.getRoundConfig(7 as any);
    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://api.test/v1/instructor/rounds/7/config');
    expect(init.method).toBe('GET');
    expect(res.round.ideal_profile?.TOPIC).toBe('Animals');
  });

  it('rejects with the 404 for a backend that has no such route', async () => {
    stub({ error: { code: 'NOT_FOUND', message: 'route not found' } }, 404);
    await expect(instructorService.getRoundConfig(7 as any)).rejects.toMatchObject({ status: 404 });
  });
});
