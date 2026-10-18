import { describe, it, expect } from 'vitest';
import { normalizeInstructorLobby } from './context';
import type { ApiInstructorLobbyResponse } from './types';

/* GET /lobby returns ports.LobbySnapshot, which has no json tags: Go sends
   PascalCase keys, except the nested domain.Team (id/name/created_at). Empty
   rosters arrive as null. The mock backend still sends the older snake_case
   shape, so the normalizer reads both. */
describe('normalizeInstructorLobby', () => {
  const go: ApiInstructorLobbyResponse = {
    RoundID: 4,
    Summary: { Waiting: 1, Assigned: 2, Dropped: 0, TeamCount: 1 },
    Teams: [{
      Team: { id: 3, name: 'Team 3', created_at: '2026-01-12T10:10:00Z' },
      Members: [{ UserID: 12, DisplayName: 'Alice', Role: 'JM' }, { UserID: 13, DisplayName: 'Bo', Role: 'MARKETING' }],
    }],
    Unassigned: [{ UserID: 20, DisplayName: 'Carol', Status: 'WAITING' }],
  };

  it('reads the PascalCase snapshot Go sends, wrapped in data', () => {
    const out = normalizeInstructorLobby({ data: go }, null);
    expect(out.round_id).toBe(4);
    expect(out.summary).toEqual({ waiting: 1, assigned: 2, dropped: 0, team_count: 1 });
    expect(out.teams).toEqual([{
      team: { id: 3, name: 'Team 3' },
      members: [
        { user_id: 12, display_name: 'Alice', role: 'JM' },
        { user_id: 13, display_name: 'Bo', role: 'MARKETING' },
      ],
    }]);
    expect(out.unassigned).toEqual([{ user_id: 20, display_name: 'Carol', status: 'WAITING' }]);
    expect(out.customers).toEqual([]);
  });

  it('reads null rosters as empty and falls back to the given round id', () => {
    const out = normalizeInstructorLobby({ Summary: { Waiting: 0, Assigned: 0, Dropped: 0, TeamCount: 0 }, Teams: null, Unassigned: null }, 9);
    expect(out.round_id).toBe(9);
    expect(out.teams).toEqual([]);
    expect(out.unassigned).toEqual([]);
  });

  it('still reads the mock backend\'s snake_case lobby, customers included', () => {
    const out = normalizeInstructorLobby({
      round_id: 1,
      summary: { waiting: 0, assigned: 3, dropped: 0, team_count: 1, customer_count: 1 },
      teams: [{ team: { id: 1, name: 'Team 1' }, members: [{ user_id: 5, display_name: 'Dee', role: 'JM' }] }],
      customers: [{ user_id: 6, display_name: 'Eve', role: 'CUSTOMER' }],
      unassigned: [],
    }, null);
    expect(out.teams[0].members[0]).toEqual({ user_id: 5, display_name: 'Dee', role: 'JM' });
    expect(out.customers).toEqual([{ user_id: 6, display_name: 'Eve', role: 'CUSTOMER' }]);
  });

  it('survives an empty or missing body', () => {
    for (const raw of [null, undefined, {}]) {
      const out = normalizeInstructorLobby(raw, 2);
      expect(out.teams).toEqual([]);
      expect(out.customers).toEqual([]);
      expect(out.unassigned).toEqual([]);
    }
  });
});
