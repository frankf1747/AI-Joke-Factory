import { describe, expect, it } from 'vitest';
import { clearTeamNames, loadTeamNames, saveTeamNames, teamNamesKey } from './teamNames';

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
    saveTeamNames(s, teamNamesKey(7), { '3': 'Owls', '4': 'Team 4' });
    expect(loadTeamNames(s, teamNamesKey(7))).toEqual({ '3': 'Owls', '4': 'Team 4' });
    expect(loadTeamNames(s, teamNamesKey(8))).toEqual({});
    clearTeamNames(s, teamNamesKey(7));
    expect(loadTeamNames(s, teamNamesKey(7))).toEqual({});
  });

  it('reads junk, non-string names or a broken store as no names, and never throws', () => {
    const s = store();
    s.data.set(teamNamesKey(7), '{not json');
    expect(loadTeamNames(s, teamNamesKey(7))).toEqual({});
    s.data.set(teamNamesKey(7), JSON.stringify({ '3': 'Owls', '4': 12, '5': null }));
    expect(loadTeamNames(s, teamNamesKey(7))).toEqual({ '3': 'Owls' });
    const b = store(true);
    expect(loadTeamNames(b, teamNamesKey(7))).toEqual({});
    expect(() => saveTeamNames(b, teamNamesKey(7), { '3': 'Owls' })).not.toThrow();
    expect(() => clearTeamNames(b, teamNamesKey(7))).not.toThrow();
    expect(loadTeamNames(null, teamNamesKey(7))).toEqual({});
  });
});
