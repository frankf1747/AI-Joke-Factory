/* Round 1 vs Round 2, per team (spec 6b): the Instructor's Debrief table. Both
   rounds play the same rules and fees (only the batch size differs), so any
   change is the team's doing: profit, never sold, fees and sent to released
   side by side. The figures come from boardRows, so they match the Live board. */
import React from 'react';
import type { LeaderboardRow } from '../services/classTotals';
import { boardRows, type BoardRow } from '../services/liveBoard';
import { fmtMoney } from '../services/leanMode';
import { fmtMinSec } from '../services/format';
import { formatProfit } from '../services/scoreboard';

/** The slice of an instructor stats response the debrief reads. */
export interface DebriefStats {
  leaderboard: LeaderboardRow[];
}

/** One team in one round. The lean figures are null in a Classic round. */
export interface DebriefSide {
  profit: number;
  neverSold: number | null;
  /** Shipping + storage + hosting (an older backend's setup + carrying). */
  fees: number | null;
  /** Average seconds from sent to released; null before the team has one. */
  sentToReleased: number | null;
}

export interface DebriefRow {
  teamId: string;
  team: string;
  r1: DebriefSide | null;
  r2: DebriefSide | null;
  /** Round 2 profit minus Round 1 profit; null unless the team played both. */
  profitChange: number | null;
}

const side = (b: BoardRow): DebriefSide => ({
  profit: b.profit, neverSold: b.neverSold, fees: b.feesTotal, sentToReleased: b.sentToReleased,
});

/**
 * One row per team across both rounds, sorted by Round 2 profit; a team with
 * no Round 2 row goes to the bottom, by Round 1 profit. `teamNames` holds the
 * instructor's renames, the same map the Live board reads.
 */
export function debriefRows(
  r1: DebriefStats | null,
  r2: DebriefStats | null,
  teamNames: Record<string, string> = {},
): DebriefRow[] {
  const byTeam = new Map<string, DebriefRow>();
  for (const [key, stats] of [['r1', r1], ['r2', r2]] as const) {
    for (const b of boardRows(stats?.leaderboard ?? [], teamNames)) {
      const row = byTeam.get(b.teamId) ?? { teamId: b.teamId, team: b.team, r1: null, r2: null, profitChange: null };
      row[key] = side(b);
      byTeam.set(b.teamId, row);
    }
  }
  const rows = [...byTeam.values()];
  for (const row of rows) {
    if (row.r1 && row.r2) row.profitChange = row.r2.profit - row.r1.profit;
  }
  return rows.sort((a, b) => {
    if (a.r2 && b.r2) return b.r2.profit - a.r2.profit;
    if (a.r2 || b.r2) return a.r2 ? -1 : 1;
    return (b.r1?.profit ?? 0) - (a.r1?.profit ?? 0);
  });
}

const DASH = '–';

/** "+$10.99" in green, "−$5.00" in warn, "$0.00" plain; whole cents decide the sign. */
function changeCell(change: number | null): { text: string; color?: string } {
  if (change == null) return { text: DASH };
  const cents = Math.round(change * 100);
  if (cents === 0) return { text: formatProfit(0) };
  return cents > 0
    ? { text: `+${formatProfit(change)}`, color: 'var(--selling)' }
    : { text: formatProfit(change), color: 'var(--warn)' };
}

const BORDER: React.CSSProperties = { borderBottom: '1px solid var(--rule)' };
const TH = 'whitespace-nowrap px-3 py-2 text-[12.5px] font-medium';
const GROUPS: Array<[string, number]> = [['Profit', 3], ['Never sold', 2], ['Fees', 2], ['Sent to released', 2]];
const SUB_HEADS = ['R1', 'R2', 'Change', 'R1', 'R2', 'R1', 'R2', 'R1', 'R2'];

export const LeanDebrief: React.FC<{
  r1: DebriefStats | null;
  r2: DebriefStats | null;
  /** Round 2 is ACTIVE or ENDED; before then there is nothing to compare. */
  round2Started: boolean;
  teamNames?: Record<string, string>;
}> = ({ r1, r2, round2Started, teamNames }) => {
  if (!round2Started) {
    return (
      <div className="px-5 py-10 text-center text-sm" style={{ color: 'var(--ink-3)' }}>
        <b className="mb-1 block text-base" style={{ color: 'var(--ink)' }}>Available once Round 2 has started</b>
        It compares each team across the two rounds.
      </div>
    );
  }
  const rows = debriefRows(r1, r2, teamNames);
  if (rows.length === 0) {
    return <p className="px-3 py-6 text-center text-sm" style={{ color: 'var(--ink-3)' }}>No teams on the board yet.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="mt-2.5 w-full border-collapse text-[14.5px] tabular-nums" aria-label="Round 1 versus Round 2, per team">
        <thead>
          <tr>
            <th />
            {GROUPS.map(([label, span]) => (
              <th key={label} scope="colgroup" colSpan={span} className={`${TH} pb-0 text-center`} style={{ color: 'var(--ink-2)' }}>
                {label}
              </th>
            ))}
          </tr>
          <tr style={{ color: 'var(--ink-3)' }}>
            <th scope="col" className={`${TH} text-left`} style={BORDER}>Team</th>
            {SUB_HEADS.map((label, i) => (
              <th key={i} scope="col" className={`${TH} text-right`} style={BORDER}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const td = i === rows.length - 1 ? {} : BORDER;
            const change = changeCell(r.profitChange);
            const pair = (pick: (s: DebriefSide) => string | null) =>
              [r.r1, r.r2].map((s, round) => (
                <td
                  key={round}
                  className="px-3 py-[9px] text-right font-mono"
                  style={{ ...td, color: round === 0 ? 'var(--ink-3)' : 'var(--ink)' }}
                >
                  {(s && pick(s)) ?? DASH}
                </td>
              ));
            return (
              <tr key={r.teamId}>
                <td className="whitespace-nowrap px-3 py-[9px] text-left font-semibold" style={{ ...td, color: 'var(--ink)' }}>{r.team}</td>
                {pair(s => formatProfit(s.profit))}
                <td
                  className={`px-3 py-[9px] text-right font-mono ${change.color ? 'font-semibold' : ''}`}
                  style={{ ...td, color: change.color ?? 'var(--ink)' }}
                >
                  {change.text}
                </td>
                {pair(s => (s.neverSold == null ? null : String(s.neverSold)))}
                {pair(s => (s.fees == null ? null : fmtMoney(s.fees)))}
                {pair(s => (s.sentToReleased == null ? null : fmtMinSec(s.sentToReleased)))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
