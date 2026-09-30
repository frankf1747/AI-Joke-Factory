// services/watchMode.test.ts
import { afterEach, describe, it, expect } from 'vitest';
import {
  captureWatchIdentity,
  clearPersisted,
  getWatchIdentity,
  isWatchMode,
  mayClaimMarketingBatch,
  SEAT_TTL_MS,
  setWatchedSeat,
  watchRequested,
  watchUrl,
} from './watchMode';

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(k: string) { return this.map.has(k) ? (this.map.get(k) as string) : null; }
  setItem(k: string, v: string) { this.map.set(k, String(v)); }
  removeItem(k: string) { this.map.delete(k); }
}

describe('watch mode identity', () => {
  it('captures the bot from the URL into per-tab storage', () => {
    const tab = new MemoryStorage();
    const w = captureWatchIdentity('?watch=17&watchName=%F0%9F%A4%96%20Bot%2003B', tab);
    expect(w).toEqual({ userId: 17, displayName: '🤖 Bot 03B' });
    expect(getWatchIdentity(tab)).toEqual(w);
    expect(isWatchMode(tab)).toBe(true);
  });

  it('survives a reload, because the reload keeps the query string', () => {
    const tab = new MemoryStorage();
    captureWatchIdentity('?watch=17&watchName=x', tab);
    expect(captureWatchIdentity('?watch=17&watchName=x', tab)).toEqual({ userId: 17, displayName: 'x' });
  });

  it('ends watch mode when the URL no longer carries ?watch', () => {
    const tab = new MemoryStorage();
    captureWatchIdentity('?watch=17&watchName=x', tab);
    expect(captureWatchIdentity('?bots=1', tab)).toBeNull();
    expect(isWatchMode(tab)).toBe(false);
    expect(tab.getItem('joke_factory_watch_user_id')).toBeNull();
    expect(tab.getItem('joke_factory_watch_display_name')).toBeNull();
  });

  it('clears a stale identity when the new ?watch is invalid', () => {
    const tab = new MemoryStorage();
    captureWatchIdentity('?watch=17&watchName=x', tab);
    expect(captureWatchIdentity('?watch=abc', tab)).toBeNull();
    expect(isWatchMode(tab)).toBe(false);
    expect(tab.getItem('joke_factory_watch_display_name')).toBeNull();
  });

  it('is off without a watch parameter', () => {
    const tab = new MemoryStorage();
    expect(captureWatchIdentity('?bots=1', tab)).toBeNull();
    expect(isWatchMode(tab)).toBe(false);
  });

  it('ignores ids that are not positive integers', () => {
    for (const bad of ['abc', '0', '-3', '2.5', '99999999999999999999']) {
      const tab = new MemoryStorage();
      expect(captureWatchIdentity(`?watch=${bad}`, tab)).toBeNull();
    }
  });

  it('builds a URL that round-trips', () => {
    const url = new URL(watchUrl('https://app.test', 42, '🤖 Bot 01A'));
    expect(captureWatchIdentity(url.search, new MemoryStorage())).toEqual({ userId: 42, displayName: '🤖 Bot 01A' });
  });

  it('is off when there is no sessionStorage at all', () => {
    expect(getWatchIdentity(null)).toBeNull();
    expect(captureWatchIdentity('?watch=17', null)).toBeNull();
  });
});

describe('watch name', () => {
  it('falls back to "user <id>" when the name is missing, blank or only control characters', () => {
    for (const q of ['?watch=9', '?watch=9&watchName=', '?watch=9&watchName=%20%20', '?watch=9&watchName=%00%1F%0A']) {
      expect(captureWatchIdentity(q, new MemoryStorage())).toEqual({ userId: 9, displayName: 'user 9' });
    }
  });

  it('trims and strips control characters and bidi overrides', () => {
    const name = encodeURIComponent('  Bo\u0007b\u202E 03\u202CB\n ');
    expect(captureWatchIdentity(`?watch=9&watchName=${name}`, new MemoryStorage())).toEqual({
      userId: 9,
      displayName: 'Bob 03B',
    });
  });

  it('caps the name at 60 characters without splitting an emoji', () => {
    const a = captureWatchIdentity(`?watch=9&watchName=${'a'.repeat(500)}`, new MemoryStorage());
    expect(a?.displayName).toBe('a'.repeat(60));
    const b = captureWatchIdentity(`?watch=9&watchName=${encodeURIComponent('🤖'.repeat(100))}`, new MemoryStorage());
    expect(b?.displayName).toBe('🤖'.repeat(60));
  });
});

describe('a store that throws', () => {
  it('returns null instead of throwing when setItem fails (quota, blocked storage)', () => {
    const removed: string[] = [];
    const broken = {
      getItem: () => null,
      setItem: () => { throw new DOMException('full', 'QuotaExceededError'); },
      removeItem: (k: string) => { removed.push(k); },
    };
    expect(() => captureWatchIdentity('?watch=17&watchName=x', broken)).not.toThrow();
    expect(captureWatchIdentity('?watch=17&watchName=x', broken)).toBeNull();
    expect(removed).toContain('joke_factory_watch_user_id');
  });

  it('returns null instead of throwing when removeItem fails', () => {
    const broken = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => { throw new Error('blocked'); },
    };
    expect(captureWatchIdentity('?bots=1', broken)).toBeNull();
  });
});

describe('watchRequested', () => {
  it('is true whenever the URL carries a watch parameter, valid or not', () => {
    expect(watchRequested('?watch=17')).toBe(true);
    expect(watchRequested('?watch=abc')).toBe(true);
    expect(watchRequested('?watch=')).toBe(true);
    expect(watchRequested('?bots=1&watch=3')).toBe(true);
  });

  it('is false without one', () => {
    expect(watchRequested('')).toBe(false);
    expect(watchRequested('?bots=1')).toBe(false);
    expect(watchRequested('?watchName=x')).toBe(false);
  });
});

describe('clearPersisted', () => {
  it('clears the shared keys in a normal tab', () => {
    const shared = new MemoryStorage();
    shared.setItem('joke_factory_user_id', '5');
    clearPersisted(['joke_factory_user_id'], shared, new MemoryStorage());
    expect(shared.getItem('joke_factory_user_id')).toBeNull();
  });

  it('never touches them from a watch tab — that would log the instructor out everywhere', () => {
    const shared = new MemoryStorage();
    shared.setItem('joke_factory_user_id', '5');
    const tab = new MemoryStorage();
    captureWatchIdentity('?watch=17', tab);
    clearPersisted(['joke_factory_user_id'], shared, tab);
    expect(shared.getItem('joke_factory_user_id')).toBe('5');
  });

  it('clears every listed key in a normal tab, and leaves unlisted ones', () => {
    const shared = new MemoryStorage();
    shared.setItem('a', '1');
    shared.setItem('b', '2');
    shared.setItem('c', '3');
    clearPersisted(['a', 'b'], shared, new MemoryStorage());
    expect([shared.getItem('a'), shared.getItem('b'), shared.getItem('c')]).toEqual([null, null, '3']);
  });

  it('leaves every listed key alone in a watch tab', () => {
    const shared = new MemoryStorage();
    shared.setItem('a', '1');
    shared.setItem('b', '2');
    const tab = new MemoryStorage();
    captureWatchIdentity('?watch=17', tab);
    clearPersisted(['a', 'b'], shared, tab);
    expect([shared.getItem('a'), shared.getItem('b')]).toEqual(['1', '2']);
  });

  it('clears again once the tab has left watch mode', () => {
    const shared = new MemoryStorage();
    shared.setItem('a', '1');
    const tab = new MemoryStorage();
    captureWatchIdentity('?watch=17', tab);
    captureWatchIdentity('?bots=1', tab);
    clearPersisted(['a'], shared, tab);
    expect(shared.getItem('a')).toBeNull();
  });
});

describe('mayClaimMarketingBatch', () => {
  afterEach(() => setWatchedSeat(null));

  function watchTab() {
    const tab = new MemoryStorage();
    captureWatchIdentity('?watch=17', tab);
    return tab;
  }

  it('always allows a normal tab, whatever seat was stored', () => {
    const tab = new MemoryStorage();
    expect(mayClaimMarketingBatch(4, tab)).toBe(true);
    expect(mayClaimMarketingBatch(null, tab)).toBe(true);
    setWatchedSeat({ seat: 'A', teamId: 9, claiming: true });
    expect(mayClaimMarketingBatch(4, tab)).toBe(true);
  });

  it('refuses a watch tab that has not heard from the engine', () => {
    expect(mayClaimMarketingBatch(4, watchTab())).toBe(false);
  });

  it('refuses when the engine says the bot is a Joke Maker', () => {
    setWatchedSeat({ seat: 'A', teamId: 4, claiming: true });
    expect(mayClaimMarketingBatch(4, watchTab())).toBe(false);
  });

  it('refuses when the bot sits on a team other than the one the engine intends', () => {
    setWatchedSeat({ seat: 'B', teamId: 4, claiming: true });
    expect(mayClaimMarketingBatch(5, watchTab())).toBe(false);
  });

  it('refuses when either team id is unknown', () => {
    const tab = watchTab();
    setWatchedSeat({ seat: 'B', teamId: null, claiming: true });
    expect(mayClaimMarketingBatch(4, tab)).toBe(false);
    expect(mayClaimMarketingBatch(null, tab)).toBe(false);
    setWatchedSeat({ seat: 'B', teamId: 4, claiming: true });
    expect(mayClaimMarketingBatch(null, tab)).toBe(false);
  });

  it('allows the Marketing bot on the very team its engine intends', () => {
    setWatchedSeat({ seat: 'B', teamId: 4, claiming: true });
    expect(mayClaimMarketingBatch(4, watchTab())).toBe(true);
  });

  it('refuses while the engine is paused, stopped or not running this seat', () => {
    setWatchedSeat({ seat: 'B', teamId: 4, claiming: false });
    expect(mayClaimMarketingBatch(4, watchTab())).toBe(false);
  });

  it('allows a seat heard from just under SEAT_TTL_MS ago', () => {
    const tab = watchTab();
    setWatchedSeat({ seat: 'B', teamId: 4, claiming: true }, () => 1_000);
    expect(mayClaimMarketingBatch(4, tab, () => 1_000 + SEAT_TTL_MS - 1)).toBe(true);
  });

  it('refuses once the engine has been silent for SEAT_TTL_MS', () => {
    const tab = watchTab();
    setWatchedSeat({ seat: 'B', teamId: 4, claiming: true }, () => 1_000);
    expect(mayClaimMarketingBatch(4, tab, () => 1_000 + SEAT_TTL_MS)).toBe(false);
    expect(mayClaimMarketingBatch(4, tab, () => 1_000 + 60_000)).toBe(false);
  });

  it('a fresh reply renews an expired seat', () => {
    const tab = watchTab();
    setWatchedSeat({ seat: 'B', teamId: 4, claiming: true }, () => 1_000);
    expect(mayClaimMarketingBatch(4, tab, () => 20_000)).toBe(false);
    setWatchedSeat({ seat: 'B', teamId: 4, claiming: true }, () => 20_000);
    expect(mayClaimMarketingBatch(4, tab, () => 20_000)).toBe(true);
  });

  it('refuses a seat stamped in the future, e.g. after the clock went back', () => {
    const tab = watchTab();
    setWatchedSeat({ seat: 'B', teamId: 4, claiming: true }, () => 50_000);
    expect(mayClaimMarketingBatch(4, tab, () => 1_000)).toBe(false);
  });

  it('refuses again once the seat is cleared', () => {
    const tab = watchTab();
    setWatchedSeat({ seat: 'B', teamId: 4, claiming: true });
    setWatchedSeat(null);
    expect(mayClaimMarketingBatch(4, tab)).toBe(false);
  });
});
