import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mockApiRequest } from './mockApi';

class MemoryStorage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  clear() { this.map.clear(); }
  getItem(key: string) { return this.map.has(key) ? this.map.get(key)! : null; }
  setItem(key: string, value: string) { this.map.set(key, String(value)); }
  removeItem(key: string) { this.map.delete(key); }
  key(i: number) { return Array.from(this.map.keys())[i] ?? null; }
}

beforeEach(() => { (globalThis as any).localStorage = new MemoryStorage(); });
afterEach(() => { delete (globalThis as any).localStorage; });

async function signIn() {
  const joined: any = await mockApiRequest('/v1/session/join', { method: 'POST', body: { display_name: 'Prof' } });
  return { 'X-User-Id': String(joined.data.user.user_id) };
}

describe('mock GET /v1/instructor/rounds/:id/config', () => {
  it('has no ideal_profile until one is saved, then serves the saved one', async () => {
    const headers = await signIn();
    const before: any = await mockApiRequest('/v1/instructor/rounds/1/config', { headers });
    expect(before.ok).toBe(true);
    expect(before.data.round.id).toBe(1);
    expect(before.data.round).not.toHaveProperty('ideal_profile');

    await mockApiRequest('/v1/instructor/rounds/1/config', {
      method: 'POST', headers, body: { customer_budget: 4, ideal_profile: { TOPIC: 'Animals', LENGTH: 'Short' } },
    });
    const after: any = await mockApiRequest('/v1/instructor/rounds/1/config', { headers });
    expect(after.data.round.ideal_profile).toEqual({ TOPIC: 'Animals', LENGTH: 'Short' });
    expect(after.data.round.customer_budget).toBe(4);
  });
});
