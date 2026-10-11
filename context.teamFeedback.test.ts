import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { pollTeamFeedback } from './context';
import { Role } from './types';
import type { Wrapped, TeamFeedbackResponse } from './types/api';

/* ============================================================================
   Who gets to hear from the customers: Marketing, and only Marketing.

   GET /v1/rounds/{rid}/teams/{tid}/feedback is a TEAM route the backend would
   serve to either team role (core/usecase/feedback.go:44-49). The game wants
   the Joke Maker to hear from Marketing instead — Marketing reads the customers
   and writes a note with each batch — so the Joke Maker's screen has no
   feedback panel and its poll must never ask for the route. These tests pin
   that: Marketing asks, the Joke Maker and every other role stay off the wire,
   and a failed poll never blanks a panel that already has feedback on it.

   Driven through the real service and the real apiRequest over a stubbed fetch,
   the way services/api/contract.test.ts does, so what is asserted is the
   request that would actually go on the wire.
============================================================================ */

/** environment is 'node' — no DOM, no localStorage. Same stand-in the contract
 *  tests use, so apiRequest's real X-User-Id path runs rather than a mock. */
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

const FEEDBACK: Wrapped<TeamFeedbackResponse> = {
  data: {
    jokes: [{
      joke_id: 9101, joke_title: 'Corporate Comedy', was_bought: true,
      good_dimensions: ['LENGTH', 'TOPIC'],
      improve_dimensions: ['WORDPLAY', 'CLARITY', 'ENERGY'],
    }],
  },
};

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

const urls = (spy: any): string[] => spy.mock.calls.map((c: any[]) => String(c[0]));

beforeEach(() => {
  (globalThis as any).localStorage = new MemoryStorage();
  localStorage.clear();
  // The repo commits a .env.local with VITE_USE_MOCK_API=true; without these the
  // mock branch answers and the stubbed fetch is never called.
  vi.stubEnv('VITE_API_BASE_URL', 'http://api.test');
  vi.stubEnv('VITE_USE_MOCK_API', 'false');
});

afterEach(() => {
  globalThis.fetch = realFetch;
  delete (globalThis as any).localStorage;
  vi.unstubAllEnvs();
});

describe('pollTeamFeedback', () => {
  it('asks for the team route when the poll is running as MARKETING', async () => {
    const spy = stub(FEEDBACK);
    const res = await pollTeamFeedback(Role.QUALITY_CONTROL, 7, 3, { current: false });
    expect(urls(spy)).toEqual(['http://api.test/v1/rounds/7/teams/3/feedback']);
    // The {data} envelope is unwrapped by teamApi.feedback, not by the caller.
    expect(res?.jokes[0].good_dimensions).toEqual(['LENGTH', 'TOPIC']);
  });

  it('never asks as the JOKE_MAKER — the Joke Maker hears from Marketing instead', async () => {
    const spy = stub(FEEDBACK);
    expect(await pollTeamFeedback(Role.JOKE_MAKER, 7, 3, { current: false })).toBeUndefined();
    expect(spy).not.toHaveBeenCalled();
  });

  it('stays off the wire for every other role', async () => {
    for (const role of [Role.INSTRUCTOR, Role.CUSTOMER, Role.UNASSIGNED]) {
      const spy = stub(FEEDBACK);
      expect(await pollTeamFeedback(role, 7, 3, { current: false })).toBeUndefined();
      expect(spy).not.toHaveBeenCalled();
    }
  });

  it('stays off the wire before the round or the team is known', async () => {
    const spy = stub(FEEDBACK);
    expect(await pollTeamFeedback(Role.QUALITY_CONTROL, null, 3, { current: false })).toBeUndefined();
    expect(await pollTeamFeedback(Role.QUALITY_CONTROL, 7, null, { current: false })).toBeUndefined();
    expect(spy).not.toHaveBeenCalled();
  });

  it('latches on a 404 so a backend without the route is asked once, not forever', async () => {
    const spy = stub({ code: 'NOT_FOUND', message: 'not found' }, 404);
    const unsupported = { current: false };
    expect(await pollTeamFeedback(Role.QUALITY_CONTROL, 7, 3, unsupported)).toBeUndefined();
    expect(unsupported.current).toBe(true);
    await pollTeamFeedback(Role.QUALITY_CONTROL, 7, 3, unsupported);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('keeps polling after a transient failure, and applies nothing', async () => {
    // undefined, not null: a 500 must leave the last good feedback on screen
    // rather than blanking the panel mid-round.
    const spy = stub({ code: 'INTERNAL', message: 'boom' }, 500);
    const unsupported = { current: false };
    expect(await pollTeamFeedback(Role.QUALITY_CONTROL, 7, 3, unsupported)).toBeUndefined();
    expect(unsupported.current).toBe(false);
    await pollTeamFeedback(Role.QUALITY_CONTROL, 7, 3, unsupported);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
