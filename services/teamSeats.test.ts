import { describe, expect, it } from 'vitest';
import { autoAssignCount, dropAction, seatedTeams } from './teamSeats';
import type { InstructorLobby } from '../types';

const lobby: InstructorLobby = {
  round_id: 1,
  summary: { waiting: 1, assigned: 2, dropped: 0, team_count: 2 },
  teams: [
    { team: { id: 5, name: 'Team 5' }, members: [
      { user_id: 12, display_name: 'ama_kenji', role: 'MARKETING' },
      { user_id: 13, display_name: 'noor_ben', role: 'JM' },
    ] },
    { team: { id: 2, name: 'Team 2' }, members: [] },
  ],
  customers: [],
  unassigned: [{ user_id: 20, display_name: 'ivy_omar', status: 'WAITING' }],
};

describe('seatedTeams', () => {
  it('draws real teams only, seats each pair by role and prefers the local name', () => {
    expect(seatedTeams(lobby, { '5': 'Owls' })).toEqual([
      { id: 5, name: 'Owls', jm: [{ userId: 13, name: 'Noor and Ben' }], marketing: [{ userId: 12, name: 'Ama and Kenji' }] },
    ]);
    expect(seatedTeams(null, {})).toEqual([]);
  });
});

describe('autoAssignCount', () => {
  it('counts waiting and assigned pairs, since Auto-assign reshuffles both', () => {
    expect(autoAssignCount({ waiting: 4, assigned: 2 })).toBe(3);
    expect(autoAssignCount({ waiting: 1, assigned: 2 })).toBe(1);
    expect(autoAssignCount(null)).toBe(0);
  });
});

describe('dropAction', () => {
  const teams = seatedTeams(lobby, {});
  it('seats a pair in the slot it lands on, with that slot\'s role', () => {
    expect(dropAction(teams, 20, { kind: 'slot', teamId: 5, seat: 'JM' }))
      .toEqual({ kind: 'move', userId: 20, body: { status: 'ASSIGNED', role: 'JM', team_id: 5 } });
  });
  it('sends a seated pair back to the lobby, and ignores a lobby pair dropped on the lobby', () => {
    expect(dropAction(teams, 12, { kind: 'lobby' })).toEqual({ kind: 'move', userId: 12, body: { status: 'WAITING', team_id: null } });
    expect(dropAction(teams, 20, { kind: 'lobby' })).toBeNull();
  });
  it('swaps the team\'s roles when a pair lands on its teammate\'s slot, and ignores its own slot', () => {
    expect(dropAction(teams, 12, { kind: 'slot', teamId: 5, seat: 'JM' })).toEqual({ kind: 'swap', teamId: 5 });
    expect(dropAction(teams, 12, { kind: 'slot', teamId: 5, seat: 'MARKETING' })).toBeNull();
  });
});
