/* Pure helpers for the Instructor's Live tab (spec 6b): the leaderboard's rows,
   columns, sorting and rank-move tags, and the live market's order. */
import type { ApiMarketItem } from '../types';
import type { LeaderboardRow } from './classTotals';
import { leanFeesOf, neverSold, type LeanFees } from './leanMode';

export interface BoardRow {
  teamId: string;
  team: string;
  /** The backend's DENSE_RANK by profit; the row position when it sends none. */
  rank: number;
  profit: number;
  sales: number;
  released: number;
  discarded: number;
  /** Lean figures; null when the backend sent the row without `lean` (shown as "–"). */
  neverSold: number | null;
  fees: LeanFees;
  feesTotal: number | null;
  /** Average seconds; null before the team has one. */
  sentToReleased: number | null;
  toFirstSale: number | null;
}

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
const seconds = (v: unknown): number | null => (num(v) > 0 ? num(v) : null);

/** The stats rows as the board shows them. A renamed team keeps its new name. */
export function boardRows(rows: LeaderboardRow[], teamNames: Record<string, string>): BoardRow[] {
  return rows.map((r, i) => {
    const teamId = String(r.team.id);
    const fees = leanFeesOf(r.lean);
    return {
      teamId,
      team: teamNames[teamId] || r.team.name || `Team ${teamId}`,
      rank: num(r.rank) > 0 ? num(r.rank) : i + 1,
      profit: num(r.profit),
      sales: num(r.total_sales),
      released: num(r.published_jokes),
      discarded: num(r.discarded_jokes),
      neverSold: neverSold(r.lean),
      fees,
      feesTotal: r.lean ? fees.shipping + fees.storage + fees.hosting : null,
      sentToReleased: seconds(r.lean?.avg_submit_to_publish_s),
      toFirstSale: seconds(r.lean?.avg_publish_to_first_sale_s),
    };
  });
}

export type BoardSortKey =
  | 'rank' | 'team' | 'profit' | 'sales' | 'released' | 'discarded'
  | 'neverSold' | 'fees' | 'sentToReleased' | 'toFirstSale';

export interface BoardColumn { key: BoardSortKey; label: string; align: 'left' | 'right'; leanOnly: boolean }

const COLUMNS: ReadonlyArray<BoardColumn> = [
  { key: 'rank', label: '#', align: 'left', leanOnly: false },
  { key: 'team', label: 'Team', align: 'left', leanOnly: false },
  { key: 'profit', label: 'Profit', align: 'right', leanOnly: false },
  { key: 'sales', label: 'Sales', align: 'right', leanOnly: false },
  { key: 'released', label: 'Released', align: 'right', leanOnly: false },
  { key: 'discarded', label: 'Discarded', align: 'right', leanOnly: false },
  { key: 'neverSold', label: 'Never sold', align: 'right', leanOnly: true },
  { key: 'fees', label: 'Fees', align: 'right', leanOnly: true },
  { key: 'sentToReleased', label: 'Sent to released', align: 'right', leanOnly: true },
  { key: 'toFirstSale', label: 'To first sale', align: 'right', leanOnly: true },
];

/** The columns in order; a Classic round has no fees, never-sold count or waits. */
export function boardColumns(lean: boolean): BoardColumn[] {
  return COLUMNS.filter(c => lean || !c.leanOnly);
}

export interface BoardSort { key: BoardSortKey; dir: 'asc' | 'desc' }

export const DEFAULT_BOARD_SORT: BoardSort = { key: 'profit', dir: 'desc' };

/** Lower is better for these, so their first click sorts ascending. */
const ASC_FIRST: ReadonlySet<BoardSortKey> = new Set(['rank', 'team', 'discarded', 'neverSold', 'fees', 'sentToReleased', 'toFirstSale']);

/** A click on a column header: the same column flips, another starts at its natural direction. */
export function nextBoardSort(current: BoardSort, key: BoardSortKey): BoardSort {
  if (current.key === key) return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' };
  return { key, dir: ASC_FIRST.has(key) ? 'asc' : 'desc' };
}

const valueOf = (r: BoardRow, key: Exclude<BoardSortKey, 'team'>): number | null =>
  key === 'fees' ? r.feesTotal : r[key];

/** The board in the chosen order. Ties keep the rank order; a team with no time yet sorts last. */
export function sortBoard(rows: BoardRow[], sort: BoardSort): BoardRow[] {
  const dir = sort.dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (sort.key === 'team') return dir * a.team.localeCompare(b.team, undefined, { numeric: true });
    const av = valueOf(a, sort.key), bv = valueOf(b, sort.key);
    if (av == null || bv == null) {
      if (av != null) return -1;
      if (bv != null) return 1;
    } else if (av !== bv) {
      return dir * (av - bv);
    }
    return a.rank - b.rank;
  });
}

/* Rank moves, per team (the Scoreboard's rule, services/scoreboard.ts): the tag
   holds until the rank changes again and starts over in a new round. */
export interface BoardMove { kind: 'up' | 'down'; by: number }

export interface TeamRank {
  rank: number;
  /** The tag on show; null until the team's rank changes within the round. */
  move: BoardMove | null;
  /** How many times the rank changed this round; keys the row so its fade replays. */
  seq: number;
  /** The rank changed on this poll: the row fades from gold once. */
  changed: boolean;
}

export interface BoardRanks { round: number | null; teams: Record<string, TeamRank> }

export const INITIAL_BOARD_RANKS: BoardRanks = { round: null, teams: {} };

/** The tags for the board, only while they belong to the round it shows: for one
    render after a round switch they are still the old round's. */
export function boardRanksFor(ranks: BoardRanks, round: number | null): BoardRanks | undefined {
  return round != null && ranks.round === round ? ranks : undefined;
}

/** One poll's step. A lower rank number is better. */
export function nextBoardRanks(
  state: BoardRanks,
  rows: ReadonlyArray<{ teamId: string; rank: number }>,
  round: number | null,
): BoardRanks {
  const fresh = round !== state.round;
  const teams: Record<string, TeamRank> = {};
  for (const { teamId, rank } of rows) {
    const prev = fresh ? undefined : state.teams[teamId];
    if (!prev) teams[teamId] = { rank, move: null, seq: 0, changed: false };
    else if (prev.rank === rank) teams[teamId] = prev.changed ? { ...prev, changed: false } : prev;
    else {
      const move: BoardMove = rank < prev.rank ? { kind: 'up', by: prev.rank - rank } : { kind: 'down', by: rank - prev.rank };
      teams[teamId] = { rank, move, seq: prev.seq + 1, changed: true };
    }
  }
  return { round, teams };
}

/** Best sellers first (sold_count = current holders); ties keep release order. */
export function bestSellers(items: ReadonlyArray<ApiMarketItem>): ApiMarketItem[] {
  return [...items].sort((a, b) => num(b.sold_count) - num(a.sold_count));
}

export const buyersText = (n: number): string => (n === 1 ? '1 buyer' : `${n} buyers`);
