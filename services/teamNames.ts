/* The instructor's team renames, kept in this browser only (there is no team
   rename endpoint). Keyed to the instructor, so another account on this
   browser starts from the default names. Every read and write is best-effort:
   a blocked, full or missing store means "no saved names", never an error.
   Callers skip all of this in a watch tab (services/watchMode.ts). */

type NameStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const TEAM_NAMES_PREFIX = 'joke_factory_team_names_v1:';

export const teamNamesKey = (instructorId: number | string): string => `${TEAM_NAMES_PREFIX}${instructorId}`;

/** localStorage, or null where it is missing or its accessor throws. */
export function browserNameStore(): NameStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadTeamNames(store: NameStore | null, key: string): Record<string, string> {
  if (!store) return {};
  try {
    const parsed: unknown = JSON.parse(store.getItem(key) ?? '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const names: Record<string, string> = {};
    for (const [id, name] of Object.entries(parsed)) if (typeof name === 'string') names[id] = name;
    return names;
  } catch {
    return {};
  }
}

export function saveTeamNames(store: NameStore | null, key: string, names: Record<string, string>): void {
  try {
    store?.setItem(key, JSON.stringify(names));
  } catch {
    // Best-effort: the names still apply on this screen.
  }
}

export function clearTeamNames(store: NameStore | null, key: string): void {
  try {
    store?.removeItem(key);
  } catch {
    // Best-effort.
  }
}
