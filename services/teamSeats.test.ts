import { describe, expect, it } from 'vitest';
import { autoAssignBlock, autoAssignCount, dropAction, seatedTeams } from './teamSeats';
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
    { team: { id: 7, name: 'Team 7' }, members: [
      { user_id: 30, display_name: 'zoe_arjun', role: 'JM' },
      { user_id: 31, display_name: 'rosa_ken', role: 'MARKETING' },
    ] },
  ],
  customers: [],
  unassigned: [{ user_id: 20, display_name: 'ivy_omar', status: 'WAITING' }],
};

describe('seatedTeams', () => {
  it('draws real teams only, seats each pair by role and prefers the local name', () => {
    expect(seatedTeams(lobby, { '5': 'Owls' })[0]).toEqual(
      { id: 5, name: 'Owls', jm: [{ userId: 13, name: 'Noor and Ben' }], marketing: [{ userId: 12, name: 'Ama and Kenji' }] },
    );
    expect(seatedTeams(lobby, {}).map(t => t.id)).toEqual([5, 7]);
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

describe('autoAssignBlock (why Auto-assign is off, or null when it may run)', () => {
  it('is off while either round runs', () => {
    expect(autoAssignBlock({ 1: 'ACTIVE', 2: 'CONFIGURED' })).toBe('running');
    expect(autoAssignBlock({ 1: 'ENDED', 2: 'ACTIVE' })).toBe('running');
  });
  it('is off until the first status poll lands (both statuses unknown after a refresh)', () => {
    expect(autoAssignBlock({ 1: null, 2: null })).toBe('unknown');
  });
  it('may run in the lobby and between rounds', () => {
    expect(autoAssignBlock({ 1: 'CONFIGURED', 2: 'CONFIGURED' })).toBeNull();
    expect(autoAssignBlock({ 1: 'ENDED', 2: 'CONFIGURED' })).toBeNull();
  });
});

describe('dropAction', () => {
  const teams = seatedTeams(lobby, {});
  it('sends a seated pair back to the lobby, and ignores a lobby pair dropped on the lobby', () => {
    expect(dropAction(teams, 12, { kind: 'lobby' })).toEqual({ kind: 'move', userId: 12, body: { status: 'WAITING', team_id: null } });
    expect(dropAction(teams, 20, { kind: 'lobby' })).toBeNull();
  });
  it('swaps the team\'s roles when a pair lands on its teammate\'s slot, and ignores its own slot', () => {
    expect(dropAction(teams, 12, { kind: 'slot', teamId: 5, seat: 'JM' })).toEqual({ kind: 'swap', teamId: 5 });
    expect(dropAction(teams, 12, { kind: 'slot', teamId: 5, seat: 'MARKETING' })).toBeNull();
  });
  it('a waiting pair dropped on an occupied slot takes it, and the occupant goes to the lobby', () => {
    expect(dropAction(teams, 20, { kind: 'slot', teamId: 5, seat: 'JM' })).toEqual({
      kind: 'exchange',
      first: { userId: 20, body: { status: 'ASSIGNED', role: 'JM', team_id: 5 }, undo: { status: 'WAITING', team_id: null } },
      second: { userId: 13, body: { status: 'WAITING', team_id: null } },
    });
  });
  it('a seated pair dropped on another team\'s occupied slot trades seats with the occupant', () => {
    expect(dropAction(teams, 12, { kind: 'slot', teamId: 7, seat: 'JM' })).toEqual({
      kind: 'exchange',
      first: {
        userId: 12,
        body: { status: 'ASSIGNED', role: 'JM', team_id: 7 },
        undo: { status: 'ASSIGNED', role: 'MARKETING', team_id: 5 },
      },
      second: { userId: 30, body: { status: 'ASSIGNED', role: 'MARKETING', team_id: 5 } },
    });
  });
  it('a pair dropped on an empty slot just moves, with that slot\'s role', () => {
    const open = seatedTeams({ ...lobby, teams: [{ team: { id: 9, name: 'Team 9' }, members: [{ user_id: 40, display_name: 'a_b', role: 'JM' }] }] }, {});
    expect(dropAction(open, 20, { kind: 'slot', teamId: 9, seat: 'MARKETING' }))
      .toEqual({ kind: 'move', userId: 20, body: { status: 'ASSIGNED', role: 'MARKETING', team_id: 9 } });
  });
});
