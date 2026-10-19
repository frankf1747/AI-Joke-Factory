/* The Instructor's Teams tab (spec 6b, 7.4) as plain data: the lobby read into
   team cards with a Joke Maker slot and a Marketing slot, the honest
   Auto-assign count, and what a drop sends to PATCH …/users/:uid. */
import type { InstructorLobby } from '../types';
import { pairNames } from './format';

/** A seat on the wire: PATCH accepts JM or MARKETING (never QC). */
export type Seat = 'JM' | 'MARKETING';

export interface SeatPair { userId: number; name: string }

export interface SeatedTeam {
  id: number;
  name: string;
  /** Normally one pair each; the backend keeps no (team, role) uniqueness, so a slot can hold more. */
  jm: SeatPair[];
  marketing: SeatPair[];
}

/** The body of PATCH …/users/:uid for a move: a seat on a team, or back to the lobby. */
export type MoveBody =
  | { status: 'ASSIGNED'; role: Seat; team_id: number }
  | { status: 'WAITING'; team_id: null };

export type DropTarget = { kind: 'slot'; teamId: number; seat: Seat } | { kind: 'lobby' };

/** What a drop does: move one pair, swap a team's two roles, or nothing. */
export type DropAction = { kind: 'move'; userId: number; body: MoveBody } | { kind: 'swap'; teamId: number } | null;

/** The legacy QC reads as Marketing; a member with no role sits in the Joke Maker slot. */
export function seatOf(role: string | null | undefined): Seat {
  return role === 'MARKETING' || role === 'QC' ? 'MARKETING' : 'JM';
}

/** One card per real team: teams with no members are not drawn. Names prefer the instructor's rename. */
export function seatedTeams(lobby: InstructorLobby | null, teamNames: Record<string, string>): SeatedTeam[] {
  if (!lobby) return [];
  return lobby.teams
    .filter(t => t.members.length > 0)
    .map(t => {
      const team: SeatedTeam = { id: Number(t.team.id), name: teamNames[String(t.team.id)] || t.team.name, jm: [], marketing: [] };
      for (const m of t.members) {
        const pair = { userId: Number(m.user_id), name: pairNames(m.display_name) || m.display_name };
        (seatOf(m.role) === 'MARKETING' ? team.marketing : team.jm).push(pair);
      }
      return team;
    })
    .sort((a, b) => a.id - b.id);
}

/** POST …/assign reshuffles waiting and assigned pairs alike, so it makes floor((waiting + assigned) / 2) teams. */
export function autoAssignCount(summary: { waiting: number; assigned: number } | null | undefined): number {
  if (!summary) return 0;
  return Math.floor((Math.max(0, summary.waiting) + Math.max(0, summary.assigned)) / 2);
}

/** Dropping into a slot sets that slot's role on that team; into the lobby sends the pair back to WAITING.
    Dropping a pair onto its teammate's slot swaps the team's two roles instead. */
export function dropAction(teams: ReadonlyArray<SeatedTeam>, userId: number, target: DropTarget): DropAction {
  const home = teams.find(t => t.jm.some(p => p.userId === userId) || t.marketing.some(p => p.userId === userId));
  const homeSeat: Seat | null = home ? (home.jm.some(p => p.userId === userId) ? 'JM' : 'MARKETING') : null;
  if (target.kind === 'lobby') {
    return home ? { kind: 'move', userId, body: { status: 'WAITING', team_id: null } } : null;
  }
  if (home && home.id === target.teamId) {
    if (homeSeat === target.seat) return null;
    const other = target.seat === 'JM' ? home.jm : home.marketing;
    const mine = homeSeat === 'JM' ? home.jm : home.marketing;
    if (other.length === 1 && mine.length === 1) return { kind: 'swap', teamId: home.id };
  }
  return { kind: 'move', userId, body: { status: 'ASSIGNED', role: target.seat, team_id: target.teamId } };
}
