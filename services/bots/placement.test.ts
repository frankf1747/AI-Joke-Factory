// services/bots/placement.test.ts
import { describe, it, expect } from 'vitest';
import type { LobbyResponse, Role } from '../../types/api';
import { botName } from './naming';
import { planPlacement, teamsNeeded } from './placement';

type Member = [userId: number, name: string, role: Role];

function lobby(teams: Array<[teamId: number, members: Member[]]>, unassigned: Array<[number, string]> = []): LobbyResponse {
  return {
    RoundID: 1,
    Summary: {
      Waiting: unassigned.length,
      Assigned: teams.reduce((n, [, m]) => n + m.length, 0),
      Dropped: 0,
      TeamCount: teams.length,
    },
    Teams: teams.map(([id, members]) => ({
      Team: { id, name: `Team ${id}`, created_at: '2026-01-01T00:00:00Z' },
      Members: members.map(([UserID, DisplayName, Role]) => ({ UserID, DisplayName, Role })),
    })),
    Unassigned: unassigned.map(([UserID, DisplayName]) => ({ UserID, DisplayName, Status: 'WAITING' as const })),
  };
}

const target = (plan: ReturnType<typeof planPlacement>, userId: number) =>
  plan.placements.find(p => p.userId === userId);

describe('teamsNeeded', () => {
  it('is one team per human pair plus one per bot team', () => {
    expect(teamsNeeded(0, 3)).toBe(3);
    expect(teamsNeeded(2, 3)).toBe(4);
    expect(teamsNeeded(3, 3)).toBe(5);
  });
});

describe('planPlacement', () => {
  it('gives each bot team its own team, seat A as Joke Maker', () => {
    const plan = planPlacement(lobby([
      [1, [[10, botName(2, 'B'), 'JM'], [11, botName(1, 'A'), 'MARKETING']]],
      [2, [[12, botName(1, 'B'), 'JM'], [13, botName(2, 'A'), 'MARKETING']]],
    ]));
    expect(target(plan, 11)).toMatchObject({ teamId: 1, role: 'JM' });
    expect(target(plan, 12)).toMatchObject({ teamId: 1, role: 'MARKETING' });
    expect(target(plan, 13)).toMatchObject({ teamId: 2, role: 'JM' });
    expect(target(plan, 10)).toMatchObject({ teamId: 2, role: 'MARKETING' });
    expect(plan).toMatchObject({ humanTeamCount: 0, botTeamCount: 2, unpairedHuman: null });
  });

  it('moves humans to the lowest-numbered teams and bots after them', () => {
    const plan = planPlacement(lobby([
      [1, [[30, botName(1, 'A'), 'JM'], [31, botName(1, 'B'), 'MARKETING']]],
      [2, [[20, 'alice', 'JM'], [21, 'bob', 'MARKETING']]],
    ]));
    expect(target(plan, 20)).toMatchObject({ teamId: 1, role: 'JM' });
    expect(target(plan, 21)).toMatchObject({ teamId: 1, role: 'MARKETING' });
    expect(target(plan, 30)).toMatchObject({ teamId: 2, role: 'JM' });
    expect(plan.teamIdByBotIndex.get(1)).toBe(2);
    expect(plan.patches).toHaveLength(4);
  });

  it('gives the second human of a pair the other role when the shuffle made both Joke Makers', () => {
    const plan = planPlacement(lobby([
      [1, [[20, 'alice', 'JM']]],
      [2, [[21, 'bob', 'JM']]],
    ]));
    expect(target(plan, 20)).toMatchObject({ teamId: 1, role: 'JM' });
    expect(target(plan, 21)).toMatchObject({ teamId: 1, role: 'MARKETING' });
  });

  it('flags an odd human instead of pairing them with a bot', () => {
    const plan = planPlacement(lobby([[1, []], [2, []]], [[20, 'alice'], [21, 'bob'], [22, 'carol']]));
    expect(plan.unpairedHuman?.userId).toBe(22);
    expect(target(plan, 22)).toMatchObject({ teamId: 2, role: 'JM' });
    expect(plan.humanTeamCount).toBe(2);
  });

  it('places unassigned bots too', () => {
    const plan = planPlacement(lobby([[5, []]], [[40, botName(1, 'B')], [41, botName(1, 'A')]]));
    expect(target(plan, 41)).toMatchObject({ teamId: 5, role: 'JM' });
    expect(target(plan, 40)).toMatchObject({ teamId: 5, role: 'MARKETING' });
  });

  it('produces no patches when the lobby is already in place', () => {
    const plan = planPlacement(lobby([
      [1, [[20, 'alice', 'JM'], [21, 'bob', 'MARKETING']]],
      [2, [[30, botName(1, 'A'), 'JM'], [31, botName(1, 'B'), 'MARKETING']]],
    ]));
    expect(plan.patches).toEqual([]);
  });

  it('refuses a lobby with too few teams', () => {
    expect(() => planPlacement(lobby([[1, []]], [
      [30, botName(1, 'A')], [31, botName(1, 'B')], [32, botName(2, 'A')], [33, botName(2, 'B')],
    ]))).toThrow(/needs 2 teams/);
  });
});
