/* The instructor's team renames, kept in this browser only (there is no team
   rename endpoint). Keyed to the instructor, so another account on this
   browser starts from the default names. Every read and write is best-effort:
   a blocked, full or missing store means "no saved names", never an error.
   Callers skip all of this in a watch tab (services/watchMode.ts).

   A reset run elsewhere (another tab or browser) deletes the teams and restarts
   their ids at 1, so a name saved for team 3 would land on the next class's
   team 3. Each name keeps its team's created_at from the lobby, and
   liveTeamNames drops a name once its team is listed with another one. */

/** A saved rename and the created_at of the team it was made for (absent when unknown). */
export interface SavedTeamName { name: string; createdAt?: string }
export type SavedTeamNames = Record<string, SavedTeamName>;

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

/** The saved names; a name saved as a bare string (before created_at was kept) loads without one. */
export function loadTeamNames(store: NameStore | null, key: string): SavedTeamNames {
  if (!store) return {};
  try {
    const parsed: unknown = JSON.parse(store.getItem(key) ?? '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const names: SavedTeamNames = {};
    for (const [id, entry] of Object.entries(parsed)) {
      if (typeof entry === 'string') names[id] = { name: entry };
      else if (entry && typeof entry === 'object' && typeof (entry as SavedTeamName).name === 'string') {
        const { name, createdAt } = entry as SavedTeamName;
        names[id] = typeof createdAt === 'string' ? { name, createdAt } : { name };
      }
    }
    return names;
  } catch {
    return {};
  }
}

export function saveTeamNames(store: NameStore | null, key: string, names: SavedTeamNames): void {
  try {
    store?.setItem(key, JSON.stringify(names));
  } catch {
    // Best-effort: the names still apply on this screen.
  }
}

/**
 * The saved names that still belong to their team. A name is dropped when the lobby lists its
 * team with a created_at other than the one saved (or with one, when none was saved). A name it
 * cannot check is kept: before the lobby loads (teams null), for a team the lobby does not list
 * (the lobby lists only teams with members), or when the lobby sends no created_at. Returns the
 * same object when nothing is dropped.
 */
export function liveTeamNames(
  saved: SavedTeamNames,
  teams: ReadonlyArray<{ id: number | string; created_at?: string }> | null,
): SavedTeamNames {
  if (!teams) return saved;
  const createdAt = new Map(teams.map(t => [String(t.id), t.created_at]));
  let dropped = false;
  const out: SavedTeamNames = {};
  for (const [id, entry] of Object.entries(saved)) {
    const current = createdAt.get(id);
    if (current != null && entry.createdAt !== current) dropped = true;
    else out[id] = entry;
  }
  return dropped ? out : saved;
}

/** The plain names the screens show, keyed by team id. */
export function nameLabels(saved: SavedTeamNames): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [id, entry] of Object.entries(saved)) out[id] = entry.name;
  return out;
}

export function clearTeamNames(store: NameStore | null, key: string): void {
  try {
    store?.removeItem(key);
  } catch {
    // Best-effort.
  }
}
