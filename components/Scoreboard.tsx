/* The Scoreboard card of both student screens (spec 4.3): rank by profit with
   a movement tag, profit, jokes that found a buyer, and sales. Imports nothing
   from the components barrel (it pulls in context). Values the round has not
   produced yet (no team summary) show "—". */
import React, { useRef } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { ordinal } from '../services/format';
import { INITIAL_RANK_STATE, formatProfit, nextRankState, type RankMovement, type RankState } from '../services/scoreboard';

const DASH = '—';

const LABEL = 'text-[11px] font-medium text-[color:var(--ink-3)]';

/**
 * The movement since the previous successful summary, from the pure
 * nextRankState. The state lives in a ref and is advanced during render, so the
 * tag is never one render stale; the step is idempotent for the same inputs,
 * which keeps repeat renders safe.
 */
function useRankMovement(rank: number | null, round: number | null): RankMovement {
  const state = useRef<RankState>(INITIAL_RANK_STATE);
  state.current = nextRankState(state.current, { rank, round });
  return state.current.move;
}

const MovementTag: React.FC<{ movement: RankMovement }> = ({ movement }) => {
  const base = 'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold';
  switch (movement.kind) {
    case 'lead':
      return <span className={base} style={{ background: 'var(--gold-tint)', color: 'var(--navy)' }}>In the lead</span>;
    case 'up':
      return (
        <span className={base} style={{ background: 'var(--selling-bg)', color: 'var(--selling)' }}>
          <ArrowUp size={12} aria-hidden="true" />up {movement.by}
        </span>
      );
    case 'down':
      return (
        <span className={base} style={{ background: 'var(--warn-bg)', color: 'var(--warn)' }}>
          <ArrowDown size={12} aria-hidden="true" />down {movement.by}
        </span>
      );
    case 'same':
      return <span className={`${base} font-medium`} style={{ color: 'var(--ink-3)' }}>no change</span>;
    default:
      return null;
  }
};

export const Scoreboard: React.FC<{
  rank: number | null;
  /** The round number; a new round clears the previous rank. */
  round: number | null;
  profit: number | null | undefined;
  totalSales: number | null;
  publishedJokes: number | null;
  /** Published jokes that ever sold (foundABuyer); null with no summary. */
  foundBuyer: number | null;
  /** data-tour id for the guided tour. */
  tourId: 'jm-stats' | 'mk-stats';
}> = ({ rank, round, profit, totalSales, publishedJokes, foundBuyer, tourId }) => {
  const movement = useRankMovement(rank, round);
  const place = rank == null ? null : ordinal(rank);
  const loss = profit != null && profit < 0;
  return (
    <section
      data-tour={tourId}
      aria-label="Scoreboard"
      className="rounded-xl p-4 border"
      style={{ background: 'var(--sheet)', borderColor: 'var(--rule)', boxShadow: 'var(--shadow-card)' }}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className={LABEL}>Team rank, by profit</div>
          <div className="flex items-center gap-3 mt-1">
            <div className="flex items-start leading-none" style={{ fontFamily: "'Instrument Sans', 'IBM Plex Sans', sans-serif", fontWeight: 600, fontSize: 54, color: 'var(--ink)' }}>
              <span>{place ? place.n : DASH}</span>
              {place && <sup style={{ fontSize: 20, lineHeight: 1, marginTop: 6, marginLeft: 2 }}>{place.suffix}</sup>}
            </div>
            <MovementTag movement={movement} />
          </div>
        </div>
        <div className="text-right">
          <div className={LABEL}>Profit</div>
          <div
            className="mt-1"
            style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontWeight: 500, fontSize: 26, color: loss ? 'var(--warn)' : 'var(--ink)' }}
          >
            {formatProfit(profit)}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 mt-4 pt-3 border-t" style={{ borderColor: 'var(--rule)' }}>
        <div>
          <div className={LABEL}>Found a buyer</div>
          <div className="mt-0.5 flex items-baseline gap-1.5">
            <span className="text-xl font-semibold" style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace" }}>{foundBuyer ?? DASH}</span>
            {publishedJokes != null && foundBuyer != null && (
              <span className="text-xs text-[color:var(--ink-3)]">of {publishedJokes} on market</span>
            )}
          </div>
        </div>
        <div>
          <div className={LABEL}>Sales</div>
          <div className="mt-0.5 text-xl font-semibold" style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace" }}>{totalSales ?? DASH}</div>
        </div>
      </div>
    </section>
  );
};
