/* The Joke Maker's "Jokes by stage" card: where the team's jokes sit right now
   (spec section 5). Counts come from stageCounts; the batches still with
   Marketing come from the team summary. Squares match the Value stream's. */
import React from 'react';
import { stageCounts, type JokeState } from '../../services/jokeState';
import type { Batch } from '../../types';
import { StateSquare } from './ValueStream';

const MONO = "'IBM Plex Mono', ui-monospace, monospace";

/** At most this many squares per row, so a big class does not blow up the card. The number stays honest. */
const MAX_SQUARES = 30;
/** When capped, the last few squares fade to say more are hidden. */
const FADE_TAIL = 5;

const Stage: React.FC<{ label: string; count: React.ReactNode; color: string; muted?: boolean; state?: JokeState; total?: number }> = ({
  label, count, color, muted, state, total = 0,
}) => {
  const shown = Math.min(total, MAX_SQUARES);
  return (
    <div className="grid items-center gap-x-3 gap-y-1 py-[3px]" style={{ gridTemplateColumns: '1fr auto' }}>
      <span className="text-sm" style={{ color: 'var(--ink-2)' }}>{label}</span>
      <span className="text-right text-sm font-semibold tabular-nums" style={{ fontFamily: MONO, color, opacity: muted ? 0.75 : 1 }}>{count}</span>
      {state && shown > 0 && (
        <span className="flex flex-wrap gap-[3px]" style={{ gridColumn: '1 / -1' }}>
          {Array.from({ length: shown }, (_, i) => {
            const tail = total > MAX_SQUARES ? i - (shown - FADE_TAIL) : -1;
            return <StateSquare key={i} state={state} fade={tail >= 0 ? 1 - (tail + 1) * (0.85 / FADE_TAIL) : 1} />;
          })}
        </span>
      )}
    </div>
  );
};

const groupStyle = (first: boolean): React.CSSProperties =>
  first ? {} : { marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--rule)' };

export const JokesByStage: React.FC<{
  batches: Batch[];
  /** Batches still with Marketing, from the team summary; null or undefined before the round starts. */
  unprocessedBatches: number | null | undefined;
}> = ({ batches, unprocessedBatches }) => {
  const counts = stageCounts(batches);
  const withMarketing = unprocessedBatches == null
    ? '—'
    : `${unprocessedBatches} ${unprocessedBatches === 1 ? 'batch' : 'batches'}`;
  return (
    <section
      aria-label="Jokes by stage"
      className="rounded-xl border px-[22px] pb-[18px] pt-5"
      style={{ background: 'var(--sheet)', borderColor: 'var(--rule)' }}
    >
      <h2 className="text-base font-semibold" style={{ color: 'var(--ink)' }}>Jokes by stage</h2>
      <p className="mb-3.5 mt-1 text-[13px]" style={{ color: 'var(--ink-3)' }}>Where your output sits right now.</p>
      <div style={groupStyle(true)}>
        <Stage label="With Marketing" count={withMarketing} color="var(--ink-2)" />
      </div>
      <div style={groupStyle(false)}>
        <span className="mb-1.5 block text-[12.5px]" style={{ color: 'var(--ink-3)' }}>On the market</span>
        <Stage label="Selling" count={counts.selling} color="var(--selling)" state="selling" total={counts.selling} />
        <Stage
          label="Lost its buyers"
          count={counts.lostBuyers}
          color="var(--selling)"
          muted
          state="lost-buyers"
          total={counts.lostBuyers}
        />
        <Stage label="No buyer yet" count={counts.noBuyer} color="var(--waiting)" state="no-buyer" total={counts.noBuyer} />
      </div>
      <div style={groupStyle(false)}>
        <Stage
          label="Not released"
          count={counts.notReleased}
          color="var(--ink-3)"
          state="not-released"
          total={counts.notReleased}
        />
      </div>
    </section>
  );
};
