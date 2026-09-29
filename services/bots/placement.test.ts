// services/bots/placement.test.ts
import { describe, it, expect } from 'vitest';
import type { LobbyResponse, Role } from '../../types/api';
import { seededRng } from '../shared/jokes';
import { botName, parseBotName, type Seat } from './naming';
import { participantsOf, planPlacement, teamsNeeded } from './placement';

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

  it('gives a lone seat A its own team as Joke Maker and records its index', () => {
    const plan = planPlacement(lobby([[1, []], [2, []]], [[20, 'alice'], [21, 'bob'], [50, botName(1, 'A')]]));
    expect(target(plan, 50)).toMatchObject({ teamId: 2, role: 'JM' });
    expect(plan.teamIdByBotIndex.get(1)).toBe(2);
    expect(plan.botTeamCount).toBe(1);
  });

  it('plans nothing, without throwing, for a lobby with null Teams and Unassigned', () => {
    const empty = lobby([]);
    const plan = planPlacement({ ...empty, Teams: null, Unassigned: null });
    expect(plan.placements).toEqual([]);
    expect(plan.patches).toEqual([]);
    expect(plan.teamIdByBotIndex.size).toBe(0);
    expect(plan).toMatchObject({ humanTeamCount: 0, botTeamCount: 0, unpairedHuman: null });
  });

  it('explains the likely cause when the lobby has too few teams', () => {
    expect(() => planPlacement(lobby([[1, []]], [[30, botName(1, 'A')], [31, botName(2, 'A')]])))
      .toThrow(/needs 2 teams.*lobby has 1\b.*team_count/s);
  });
});

/**
 * WHY THIS PROPERTY. The engine's "Re-form teams" button re-runs assign (which
 * shuffles everyone again) and then re-applies this plan, and it must be safe to
 * press when nothing needs fixing: planning an already-planned lobby has to
 * yield zero patches and the same bot-team mapping, or every press would churn
 * PATCH calls and could swap seats under a running round. The generator covers
 * what a real class produces: unassigned users, shuffled roles (including two
 * JMs on one team), lone bot seats, sparse bot indices and spare teams.
 */
describe('planPlacement properties', () => {
  function randomLobby(rand: () => number): LobbyResponse {
    const int = (n: number) => Math.floor(rand() * n);
    const shuffle = <T,>(xs: T[]) => {
      for (let i = xs.length - 1; i > 0; i--) { const j = int(i + 1); [xs[i], xs[j]] = [xs[j], xs[i]]; }
      return xs;
    };
    const names = Array.from({ length: int(8) }, (_, i) => `h${i}`);
    const botIndices = shuffle(Array.from({ length: 12 }, (_, i) => i + 1)).slice(0, int(6));
    for (const index of botIndices) {
      const seats: Seat[] = int(4) === 0 ? [rand() < 0.5 ? 'A' : 'B'] : ['A', 'B'];
      names.push(...seats.map(seat => botName(index, seat)));
    }
    const humans = names.filter(n => parseBotName(n) === null).length;
    const teamCount = teamsNeeded(humans, botIndices.length) + (int(2) ? int(4) : 0);
    const teamIds = shuffle(Array.from({ length: 30 }, (_, i) => i + 1)).slice(0, teamCount);
    const members = new Map<number, Member[]>(teamIds.map(id => [id, []]));
    const unassigned: Array<[number, string]> = [];
    shuffle(names).forEach((name, i) => {
      const userId = 100 + i;
      if (teamIds.length === 0 || rand() < 0.3) unassigned.push([userId, name]);
      else members.get(teamIds[int(teamIds.length)])!.push([userId, name, rand() < 0.5 ? 'JM' : 'MARKETING']);
    });
    return lobby([...members], unassigned);
  }

  /** Applies the patches the way the backend would; empty teams vanish from the lobby. */
  function applied(before: LobbyResponse, patches: ReturnType<typeof planPlacement>['patches']): LobbyResponse {
    const seat = new Map(participantsOf(before).map(p => [p.userId, p]));
    for (const patch of patches) Object.assign(seat.get(patch.userId)!, { teamId: patch.teamId, role: patch.role });
    const teams = new Map<number, Member[]>();
    for (const p of seat.values()) {
      if (p.teamId === null) throw new Error(`user ${p.userId} is still unassigned after the patches`);
      teams.set(p.teamId, [...(teams.get(p.teamId) ?? []), [p.userId, p.name, p.role as Role]]);
    }
    return lobby([...teams]);
  }

  it('is idempotent and keeps every team single-kind, role-unique and correctly ordered', () => {
    const rand = seededRng('placement-properties');
    for (let run = 0; run < 500; run++) {
      const before = randomLobby(rand);
      const plan = planPlacement(before);

      const everyone = participantsOf(before).map(p => p.userId).sort();
      expect(plan.placements.map(p => p.userId).sort()).toEqual(everyone);

      const byTeam = new Map<number, typeof plan.placements>();
      for (const p of plan.placements) byTeam.set(p.teamId, [...(byTeam.get(p.teamId) ?? []), p]);
      for (const seated of byTeam.values()) {
        expect(new Set(seated.map(p => parseBotName(p.name) !== null)).size).toBe(1);
        expect(seated.filter(p => p.role === 'JM').length).toBeLessThanOrEqual(1);
        expect(seated.filter(p => p.role === 'MARKETING').length).toBeLessThanOrEqual(1);
      }
      const teamsOf = (bot: boolean) =>
        plan.placements.filter(p => (parseBotName(p.name) !== null) === bot).map(p => p.teamId);
      expect(Math.max(0, ...teamsOf(false))).toBeLessThan(Math.min(Infinity, ...teamsOf(true)));

      const again = planPlacement(applied(before, plan.patches));
      expect(again.patches).toEqual([]);
      expect(again.teamIdByBotIndex).toEqual(plan.teamIdByBotIndex);
    }
  });
});
