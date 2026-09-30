// services/watchMode.ts
/**
 * Watch mode: a tab that renders a bot's real Joke Maker or Marketing screen.
 *
 * THE CONSTRAINT THIS FILE EXISTS FOR. The app keeps its identity in
 * localStorage, and localStorage is shared by every tab on the origin. A watch
 * tab that wrote the bot's id there would switch the INSTRUCTOR tab to that bot
 * on its next poll; one that cleared it — which context.tsx's logout() does on a
 * 404 from /session/me — would log the instructor out of every tab. So a watch
 * tab keeps its identity in sessionStorage, which is per-tab, and never writes
 * or clears the shared keys. apiClient and context consult this module first.
 */
export const WATCH_PARAM = 'watch';
export const WATCH_NAME_PARAM = 'watchName';
const SS_USER_ID = 'joke_factory_watch_user_id';
const SS_DISPLAY_NAME = 'joke_factory_watch_display_name';

export interface WatchIdentity {
  userId: number;
  displayName: string;
}

type ReadStore = Pick<Storage, 'getItem'>;
type WriteStore = Pick<Storage, 'getItem' | 'setItem'>;

function tabStore(): WriteStore | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

function sharedStore(): Pick<Storage, 'removeItem'> | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function parseId(raw: string | null): number | null {
  if (raw === null || !/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return id > 0 ? id : null;
}

/** Call once at startup, before rendering. Reads `?watch=` into this tab. */
export function captureWatchIdentity(search: string, store: WriteStore | null = tabStore()): WatchIdentity | null {
  if (!store) return null;
  const params = new URLSearchParams(search);
  const userId = parseId(params.get(WATCH_PARAM));
  if (userId !== null) {
    store.setItem(SS_USER_ID, String(userId));
    store.setItem(SS_DISPLAY_NAME, params.get(WATCH_NAME_PARAM) ?? `user ${userId}`);
  }
  return getWatchIdentity(store);
}

export function getWatchIdentity(store: ReadStore | null = tabStore()): WatchIdentity | null {
  if (!store) return null;
  const userId = parseId(store.getItem(SS_USER_ID));
  if (userId === null) return null;
  return { userId, displayName: store.getItem(SS_DISPLAY_NAME) ?? `user ${userId}` };
}

export function isWatchMode(store: ReadStore | null = tabStore()): boolean {
  return getWatchIdentity(store) !== null;
}

export function watchUrl(origin: string, userId: number, displayName: string): string {
  const url = new URL('/', origin);
  url.searchParams.set(WATCH_PARAM, String(userId));
  url.searchParams.set(WATCH_NAME_PARAM, displayName);
  return url.toString();
}

/** Remove shared keys — unless this is a watch tab, where that would be sabotage. */
export function clearPersisted(
  keys: readonly string[],
  storage: Pick<Storage, 'removeItem'> | null = sharedStore(),
  watchStore: ReadStore | null = tabStore(),
): void {
  if (!storage || isWatchMode(watchStore)) return;
  for (const key of keys) storage.removeItem(key);
}
