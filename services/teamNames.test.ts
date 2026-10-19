import { describe, expect, it } from 'vitest';
import { clearTeamNames, liveTeamNames, loadTeamNames, nameLabels, saveTeamNames, teamNamesKey } from './teamNames';

/** A Storage stand-in; `broken` throws on every call, like a blocked or full store. */
function store(broken = false) {
  const data = new Map<string, string>();
  const guard = () => { if (broken) throw new Error('blocked'); };
  return {
    data,
    getItem: (k: string) => { guard(); return data.get(k) ?? null; },
    setItem: (k: string, v: string) => { guard(); data.set(k, v); },
    removeItem: (k: string) => { guard(); data.delete(k); },
  };
}

describe('team names in this browser', () => {
  it('keys the names to the instructor', () => {
    expect(teamNamesKey(7)).not.toBe(teamNamesKey(8));
  });

  it('saves and loads the names', () => {
    const s = store();
    const names = { '3': { name: 'Owls', createdAt: '2026-10-18T09:00:00Z' }, '4': { name: 'Team 4' } };
    saveTeamNames(s, teamNamesKey(7), names);
    expect(loadTeamNames(s, teamNamesKey(7))).toEqual(names);
    expect(loadTeamNames(s, teamNamesKey(8))).toEqual({});
    clearTeamNames(s, teamNamesKey(7));
    expect(loadTeamNames(s, teamNamesKey(7))).toEqual({});
  });

  it('reads junk, non-string names or a broken store as no names, and never throws', () => {
    const s = store();
    s.data.set(teamNamesKey(7), '{not json');
    expect(loadTeamNames(s, teamNamesKey(7))).toEqual({});
    s.data.set(teamNamesKey(7), JSON.stringify({ '3': 'Owls', '4': 12, '5': null, '6': { name: 7 }, '8': { name: 'Bats', createdAt: 9 } }));
    // A name saved before the team's creation time was kept loads without one.
    expect(loadTeamNames(s, teamNamesKey(7))).toEqual({ '3': { name: 'Owls' }, '8': { name: 'Bats' } });
    const b = store(true);
    expect(loadTeamNames(b, teamNamesKey(7))).toEqual({});
    expect(() => saveTeamNames(b, teamNamesKey(7), { '3': { name: 'Owls' } })).not.toThrow();
    expect(() => clearTeamNames(b, teamNamesKey(7))).not.toThrow();
    expect(loadTeamNames(null, teamNamesKey(7))).toEqual({});
  });
});

/* A reset run elsewhere (another tab, another browser) deletes the teams and restarts their ids
   at 1, so a saved "Team 3: Owls" would land on the next class's team 3. Each name keeps the
   team's created_at from the lobby; a team now listed with another created_at is a new team. */
describe('liveTeamNames (drops names saved for a team that has since been recreated)', () => {
  const owls = { name: 'Owls', createdAt: '2026-10-18T09:00:00Z' };
  const bats = { name: 'Bats', createdAt: '2026-10-18T09:00:00Z' };

  it('keeps a name whose team is listed with the same created_at', () => {
    expect(liveTeamNames({ '3': owls }, [{ id: 3, created_at: owls.createdAt }])).toEqual({ '3': owls });
  });

  it('drops a name whose team is listed with another created_at (a reset elsewhere)', () => {
    expect(liveTeamNames({ '3': owls, '4': bats }, [
      { id: 3, created_at: '2026-10-20T08:00:00Z' }, { id: 4, created_at: bats.createdAt },
    ])).toEqual({ '4': bats });
  });

  it('drops a name saved without a created_at once its team is listed with one', () => {
    expect(liveTeamNames({ '3': { name: 'Owls' } }, [{ id: 3, created_at: owls.createdAt }])).toEqual({});
  });

  it('keeps names it cannot check: before the lobby loads, a team not listed, a lobby without created_at', () => {
    expect(liveTeamNames({ '3': owls }, null)).toEqual({ '3': owls });
    expect(liveTeamNames({ '3': owls }, [{ id: 4, created_at: owls.createdAt }])).toEqual({ '3': owls });
    expect(liveTeamNames({ '3': { name: 'Owls' } }, [{ id: 3 }])).toEqual({ '3': { name: 'Owls' } });
  });

  it('returns the same object when nothing is dropped, so callers can skip a save', () => {
    const saved = { '3': owls };
    expect(liveTeamNames(saved, [{ id: 3, created_at: owls.createdAt }])).toBe(saved);
  });

  it('nameLabels gives the plain names the screens show', () => {
    expect(nameLabels({ '3': owls, '4': { name: 'Bats' } })).toEqual({ '3': 'Owls', '4': 'Bats' });
  });
});
