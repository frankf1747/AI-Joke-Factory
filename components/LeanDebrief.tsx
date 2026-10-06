/* Round 1 vs Round 2, per team — the debrief table for Lean classes. Round 1
   is played with push rules and Round 2 with lean rules, so the comparison
   itself is the lesson: profit, waste and lead time side by side. */
import React from 'react';
import type { TeamStats } from '../types/api';
import { fmtMoney } from '../services/leanMode';

/** The slice of a stats response the debrief reads. Both the instructor stats
    type (types.ts) and RoundStatsResponse (types/api.ts) fit it. */
export interface DebriefStats {
  leaderboard: Array<
    Pick<TeamStats, 'profit' | 'total_sales' | 'published_jokes' | 'unsold_jokes' | 'lean'> & {
      team: { id: number; name: string };
    }
  >;
}

export interface DebriefSide {
  profit: number; sales: number; published: number; unsold: number;
  setup: number; carrying: number; leadTimeS: number; saleTimeS: number;
}
export interface DebriefRow {
  teamId: number; team: string;
  r1: DebriefSide | null; r2: DebriefSide | null;
  delta: { profit: number; leadTimeS: number; unsold: number };
}

function side(t: DebriefStats['leaderboard'][number]): DebriefSide {
  return {
    profit: t.profit, sales: t.total_sales, published: t.published_jokes, unsold: t.unsold_jokes,
    setup: t.lean?.setup_cost ?? 0, carrying: t.lean?.carrying_cost ?? 0,
    leadTimeS: t.lean?.avg_submit_to_publish_s ?? 0, saleTimeS: t.lean?.avg_publish_to_first_sale_s ?? 0,
  };
}

/** `teamNames` holds the instructor's renames (kept only in the browser), keyed
    by team id — the same map the leaderboard reads, so both tables agree. */
export function debriefRows(
  r1: DebriefStats | null,
  r2: DebriefStats | null,
  teamNames: Record<string, string> = {},
): DebriefRow[] {
  const byTeam = new Map<number, DebriefRow>();
  for (const [key, stats] of [['r1', r1], ['r2', r2]] as const) {
    for (const t of stats?.leaderboard ?? []) {
      const row = byTeam.get(t.team.id) ?? {
        teamId: t.team.id, team: teamNames[String(t.team.id)] || t.team.name, r1: null, r2: null, delta: { profit: 0, leadTimeS: 0, unsold: 0 },
      };
      row[key] = side(t);
      byTeam.set(t.team.id, row);
    }
  }
  for (const row of byTeam.values()) {
    if (row.r1 && row.r2) {
      row.delta = {
        profit: row.r2.profit - row.r1.profit,
        leadTimeS: row.r2.leadTimeS - row.r1.leadTimeS,
        unsold: row.r2.unsold - row.r1.unsold,
      };
    }
  }
  return [...byTeam.values()].sort((a, b) => (b.r2?.profit ?? b.r1?.profit ?? 0) - (a.r2?.profit ?? a.r1?.profit ?? 0));
}

const fmtS = (s: number) => (s > 0 ? `${Math.round(s)}s` : '—');
const Cell: React.FC<{ s: DebriefSide | null; pick: (s: DebriefSide) => string }> = ({ s, pick }) => (
  <td className="px-2 py-1 text-right tabular-nums">{s ? pick(s) : '—'}</td>
);

export const LeanDebrief: React.FC<{
  r1: DebriefStats | null;
  r2: DebriefStats | null;
  teamNames?: Record<string, string>;
}> = ({ r1, r2, teamNames }) => {
  const rows = debriefRows(r1, r2, teamNames);
  if (rows.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs" aria-label="Round 1 versus Round 2, per team">
        <thead>
          <tr className="text-gray-500">
            <th className="px-2 py-1 text-left">Team</th>
            <th className="px-2 py-1 text-right">R1 profit</th><th className="px-2 py-1 text-right">R2 profit</th><th className="px-2 py-1 text-right">Δ profit</th>
            <th className="px-2 py-1 text-right">R1 unsold</th><th className="px-2 py-1 text-right">R2 unsold</th>
            <th className="px-2 py-1 text-right">R1 setup+carry</th><th className="px-2 py-1 text-right">R2 setup+carry</th>
            <th className="px-2 py-1 text-right">R1 lead</th><th className="px-2 py-1 text-right">R2 lead</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.teamId} className="border-t border-gray-100">
              <td className="px-2 py-1 font-medium">{r.team}</td>
              <Cell s={r.r1} pick={s => fmtMoney(s.profit)} /><Cell s={r.r2} pick={s => fmtMoney(s.profit)} />
              <td className={`px-2 py-1 text-right tabular-nums font-semibold ${
                !(r.r1 && r.r2) ? '' : r.delta.profit >= 0 ? 'text-emerald-700' : 'text-rose-700'
              }`}>
                {r.r1 && r.r2 ? fmtMoney(r.delta.profit) : '—'}
              </td>
              <Cell s={r.r1} pick={s => String(s.unsold)} /><Cell s={r.r2} pick={s => String(s.unsold)} />
              <Cell s={r.r1} pick={s => fmtMoney(s.setup + s.carrying)} /><Cell s={r.r2} pick={s => fmtMoney(s.setup + s.carrying)} />
              <Cell s={r.r1} pick={s => fmtS(s.leadTimeS)} /><Cell s={r.r2} pick={s => fmtS(s.leadTimeS)} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
