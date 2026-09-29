// services/bots/placement.ts
/**
 * Where everyone sits.
 *
 * WHY THIS EXISTS. `POST .../assign` randomly shuffles every WAITING and
 * ASSIGNED participant (usecase/instructor.go, loadAssignableParticipants), so
 * left alone it puts bots and humans on the same teams. The engine calls assign
 * once — that creates the teams and their round state — and then uses this plan
 * to PATCH everyone into a deterministic layout: humans on the lowest team ids,
 * each bot team on its own team after them.
 *
 * Pure: a lobby snapshot in, a layout out. No I/O.
 */
import type { LobbyResponse } from '../../types/api';
import { parseBotName, SEAT_ROLE, type SeatRole } from './naming';

export interface Participant {
  userId: number;
  name: string;
  role: SeatRole | null;
  teamId: number | null;
}

export interface Placement {
  userId: number;
  name: string;
  role: SeatRole;
  teamId: number;
}

export interface PlacementPlan {
  /** Every participant's target seat. */
  placements: Placement[];
  /** Only the placements that differ from where the participant is now. */
  patches: Placement[];
  humanTeamCount: number;
  botTeamCount: number;
  /** An odd human out. Flagged, never silently paired with a bot. */
  unpairedHuman: Participant | null;
  /** Bot team index (the `03` in `🤖 Bot 03A`) → backend team id. */
  teamIdByBotIndex: Map<number, number>;
}

export function participantsOf(lobby: LobbyResponse): Participant[] {
  const out: Participant[] = [];
  for (const team of lobby.Teams ?? []) {
    for (const m of team.Members) {
      const role = m.Role === 'JM' || m.Role === 'MARKETING' ? m.Role : null;
      out.push({ userId: m.UserID, name: m.DisplayName, role, teamId: team.Team.id });
    }
  }
  for (const u of lobby.Unassigned ?? []) {
    out.push({ userId: u.UserID, name: u.DisplayName, role: null, teamId: null });
  }
  return out;
}

export function teamsNeeded(humanCount: number, botTeamCount: number): number {
  return Math.ceil(humanCount / 2) + botTeamCount;
}

export function planPlacement(lobby: LobbyResponse): PlacementPlan {
  const teamIds = (lobby.Teams ?? []).map(t => t.Team.id).sort((a, b) => a - b);
  const everyone = participantsOf(lobby);

  // Sorting by current team keeps a human pair that assign already put together
  // together, and JM-first keeps their roles, so a good shuffle costs no patches.
  const humans = everyone.filter(p => parseBotName(p.name) === null).sort(byTeamRoleId);
  const bots = everyone.filter(p => parseBotName(p.name) !== null);
  const botIndices = [...new Set(bots.map(b => (parseBotName(b.name) as { index: number }).index))]
    .sort((a, b) => a - b);

  const humanTeamCount = Math.ceil(humans.length / 2);
  const needed = humanTeamCount + botIndices.length;
  if (teamIds.length < needed) {
    // Two usual causes, both upstream of this function: assign ran with a
    // team_count below what the class needs, or the lobby is missing teams that
    // have no members yet (the backend omits empty teams from `Teams`).
    const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
    throw new Error(
      `placement needs ${plural(needed, 'team')} (${humanTeamCount} human + ${botIndices.length} bot) ` +
        `but the lobby has ${teamIds.length}. Run assign with a larger team_count first; the ` +
        `backend omits empty teams from Teams, so teams nobody has been assigned to do not show up here.`,
    );
  }

  const placements: Placement[] = [];
  for (let pair = 0; pair < humanTeamCount; pair++) {
    const teamId = teamIds[pair];
    const first = humans[pair * 2];
    const second = humans[pair * 2 + 1];
    const firstRole: SeatRole = first.role ?? 'JM';
    placements.push({ userId: first.userId, name: first.name, role: firstRole, teamId });
    if (second) {
      // The shuffle routinely makes two humans both Joke Makers; one team cannot
      // hold that, so the second of the pair takes the other role.
      placements.push({ userId: second.userId, name: second.name, role: other(firstRole), teamId });
    }
  }
  const unpairedHuman = humans.length % 2 === 1 ? humans[humans.length - 1] : null;

  const teamIdByBotIndex = new Map<number, number>();
  botIndices.forEach((index, rank) => teamIdByBotIndex.set(index, teamIds[humanTeamCount + rank]));
  for (const bot of bots) {
    const id = parseBotName(bot.name) as { index: number; seat: 'A' | 'B' };
    placements.push({
      userId: bot.userId,
      name: bot.name,
      role: SEAT_ROLE[id.seat],
      teamId: teamIdByBotIndex.get(id.index) as number,
    });
  }

  const current = new Map(everyone.map(p => [p.userId, p]));
  const patches = placements.filter(p => {
    const now = current.get(p.userId) as Participant;
    return now.teamId !== p.teamId || now.role !== p.role;
  });

  return {
    placements, patches, humanTeamCount, botTeamCount: botIndices.length, unpairedHuman, teamIdByBotIndex,
  };
}

function other(role: SeatRole): SeatRole {
  return role === 'JM' ? 'MARKETING' : 'JM';
}

function byTeamRoleId(a: Participant, b: Participant): number {
  const team = (p: Participant) => p.teamId ?? Number.MAX_SAFE_INTEGER;
  const role = (p: Participant) => (p.role === 'JM' ? 0 : p.role === 'MARKETING' ? 1 : 2);
  return team(a) - team(b) || role(a) - role(b) || a.userId - b.userId;
}
