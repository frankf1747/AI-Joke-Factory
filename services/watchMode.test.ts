// services/watchMode.test.ts
import { describe, it, expect } from 'vitest';
import { captureWatchIdentity, clearPersisted, getWatchIdentity, isWatchMode, watchUrl } from './watchMode';

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

  it('keeps watching after a reload that dropped the query string', () => {
    const tab = new MemoryStorage();
    captureWatchIdentity('?watch=17&watchName=x', tab);
    expect(captureWatchIdentity('', tab)).toEqual({ userId: 17, displayName: 'x' });
  });

  it('is off without a watch parameter', () => {
    const tab = new MemoryStorage();
    expect(captureWatchIdentity('?bots=1', tab)).toBeNull();
    expect(isWatchMode(tab)).toBe(false);
  });

  it('ignores ids that are not positive integers', () => {
    for (const bad of ['abc', '0', '-3', '2.5']) {
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
});
