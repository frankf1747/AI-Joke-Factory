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
/** Enough for "🤖 Bot 03B"; small enough that a hostile link cannot fill the banner or the quota. */
const MAX_NAME_LENGTH = 60;

export interface WatchIdentity {
  userId: number;
  displayName: string;
}

type ReadStore = Pick<Storage, 'getItem'>;
type WriteStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

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
  // isSafeInteger: "99999999999999999999" parses to 1e20, which is no user id.
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * The name arrives in a link anyone can craft and is rendered in a banner, so
 * drop control characters and bidi overrides (which can reorder the text around
 * them), then cap it. Capping by code point keeps an emoji from being cut in half.
 */
function sanitizeName(raw: string | null, userId: number): string {
  const cleaned = (raw ?? '').replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, '').trim();
  const capped = Array.from(cleaned).slice(0, MAX_NAME_LENGTH).join('').trim();
  return capped || `user ${userId}`;
}

/** True when the URL asks for watch mode at all, valid id or not. A caller uses
 *  it to tell "not a watch tab" from "asked to watch but capture failed". */
export function watchRequested(search: string): boolean {
  return new URLSearchParams(search).has(WATCH_PARAM);
}

/**
 * Call once at startup, before rendering. The URL is authoritative: `?watch=`
 * puts this tab in watch mode, and a URL without a valid one takes it out again,
 * so an instructor who reuses the tab for `/?bots=1` is not left acting as a
 * read-only bot. Never throws — a blocked or full sessionStorage returns null,
 * and the caller can tell that apart from "not requested" with watchRequested().
 */
export function captureWatchIdentity(search: string, store: WriteStore | null = tabStore()): WatchIdentity | null {
  if (!store) return null;
  try {
    const params = new URLSearchParams(search);
    const userId = parseId(params.get(WATCH_PARAM));
    if (userId === null) {
      store.removeItem(SS_USER_ID);
      store.removeItem(SS_DISPLAY_NAME);
      return null;
    }
    store.setItem(SS_USER_ID, String(userId));
    store.setItem(SS_DISPLAY_NAME, sanitizeName(params.get(WATCH_NAME_PARAM), userId));
    return getWatchIdentity(store);
  } catch {
    // Half-written state must not read back as a watch identity.
    try {
      store.removeItem(SS_USER_ID);
      store.removeItem(SS_DISPLAY_NAME);
    } catch {
      /* nothing more to do */
    }
    return null;
  }
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
