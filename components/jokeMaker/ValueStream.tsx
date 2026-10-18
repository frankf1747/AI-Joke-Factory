/* The Joke Maker's Value stream: one row per batch the team has sent, newest
   first. Opening a row shows a paper-coloured tray holding Marketing's note (the
   one raised surface) and one flat, state-tinted card per joke (spec section 5).
   The note is untrusted student text and is rendered as a React text child. */
import React from 'react';
import { ChevronRight } from 'lucide-react';
import { useDemoUi } from '../../context';
import { fmtDuration } from '../../services/format';
import { batchSummary, jokeDetail, jokeState, type JokeState } from '../../services/jokeState';
import type { Batch, Joke } from '../../types';
import { MarketingNoteIcon, marketingNoteOf, MARKETING_NOTE_HEADING } from '../MarketingNote';
import { useNow } from '../NextStep';

const MONO = "'IBM Plex Mono', ui-monospace, monospace";
const NOTE_SHADOW = '0 1px 2px rgba(20,32,43,.05), 0 10px 24px -14px rgba(20,32,43,.28)';

/** Row square, joke card fill and top-right text colour per state. */
const LOOK: Record<JokeState, { square: React.CSSProperties; card: React.CSSProperties; detail: React.CSSProperties }> = {
  'selling': {
    square: { background: 'var(--selling)' },
    card: { background: '#eaf2ec' },
    detail: { color: 'var(--selling)' },
  },
  'lost-buyers': {
    square: { background: 'var(--selling)', opacity: 0.5 },
    card: { background: 'rgba(234,242,236,.5)' },
    detail: { color: 'var(--selling)', opacity: 0.75 },
  },
  'no-buyer': {
    square: { background: '#d9a92b' },
    card: { background: '#f9f1dc' },
    detail: { color: 'var(--waiting)' },
  },
  'not-released': {
    square: { background: '#c9c3b7' },
    card: { background: 'transparent', border: '1px dashed var(--rule-2)' },
    detail: { color: 'var(--ink-3)' },
  },
  'with-marketing': {
    square: { border: '1px solid var(--ink-4)' },
    card: {},
    detail: { color: 'var(--ink-3)' },
  },
};

/** One joke as a small square coloured by its state. `fade` (0 to 1) dims it further. Shared with the Jokes by stage card. */
export const StateSquare: React.FC<{ state: JokeState; fade?: number }> = ({ state, fade = 1 }) => {
  const { square } = LOOK[state];
  return (
    <span
      aria-hidden="true"
      data-square=""
      className="inline-block shrink-0"
      style={{ width: 9, height: 9, ...square, opacity: Number(square.opacity ?? 1) * fade }}
    />
  );
};

const seconds = (fromMs: number, nowMs: number) => Math.max(0, (nowMs - fromMs) / 1000);

/** Marketing's note: a white raised card with a small tail pointing up at the batch row. */
export const NoteCard: React.FC<{ note: string; ratedAt?: number; now: number }> = ({ note, ratedAt, now }) => (
  <div
    data-tour="jm-marketing-note"
    className="relative rounded-xl px-4 py-3"
    style={{ background: '#fff', boxShadow: NOTE_SHADOW }}
  >
    <span
      aria-hidden="true"
      className="absolute"
      style={{ top: -5, left: 24, width: 10, height: 10, background: '#fff', transform: 'rotate(45deg)' }}
    />
    <div className="relative flex items-baseline justify-between gap-3">
      <span className="text-xs font-semibold" style={{ color: 'var(--navy)' }}>{MARKETING_NOTE_HEADING}</span>
      {ratedAt != null && (
        <span className="text-[11px]" style={{ color: 'var(--ink-3)' }}>
          with the release, {fmtDuration(seconds(ratedAt, now))} ago
        </span>
      )}
    </div>
    <p className="relative mt-1 text-sm" style={{ color: 'var(--ink)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
      {note}
    </p>
  </div>
);

/** One joke in an opened batch. `position` is its place in the batch, counted from 1. */
export const JokeCard: React.FC<{ joke: Joke; batch: Batch; position: number; now: number }> = ({ joke, batch, position, now }) => {
  const state = jokeState(joke, batch);
  const look = LOOK[state];
  const muted = state === 'not-released';
  return (
    <div className="rounded-lg px-3 py-2.5" style={look.card}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 text-sm" style={{ color: muted ? 'var(--ink-3)' : 'var(--ink)' }}>
          <span className="mr-2 text-[11px]" style={{ fontFamily: MONO, color: 'var(--ink-3)' }}>#{position}</span>
          {joke.joke_title && <span className="font-semibold">{joke.joke_title}</span>}
        </span>
        <span className="shrink-0 text-[11px] font-medium" style={look.detail}>{jokeDetail(joke, now, batch)}</span>
      </div>
      <p
        className="joke-font mt-1 text-[15px] leading-relaxed"
        style={{ color: muted ? 'var(--ink-3)' : 'var(--ink)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
      >
        {joke.joke_text}
      </p>
    </div>
  );
};

/** One batch: the row, and when open, the tray under it. Exported for components/MarketingNote.test.ts. */
export const BatchRow: React.FC<{
  batch: Batch;
  open: boolean;
  onToggle: () => void;
  now: number;
}> = ({ batch, open, onToggle, now }) => {
  const note = marketingNoteOf(batch);
  const jokes = batch.jokes;
  // Jokes still with Marketing have no card; they show as outline squares in the row.
  const cards = jokes
    .map((joke, i) => ({ joke, position: i + 1 }))
    .filter(({ joke }) => jokeState(joke, batch) !== 'with-marketing');
  return (
    <div className="rounded-lg" style={open ? { background: 'var(--paper)' } : undefined}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left"
      >
        <ChevronRight
          size={15}
          aria-hidden="true"
          style={{ color: 'var(--ink-3)', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }}
        />
        <span className="text-xs font-medium" style={{ fontFamily: MONO, color: 'var(--ink)' }}>B-{batch.batch_id}</span>
        {batch.submittedAt != null && (
          <span className="text-xs" style={{ color: 'var(--ink-3)' }}>Sent {fmtDuration(seconds(batch.submittedAt, now))} ago</span>
        )}
        {note != null && <MarketingNoteIcon />}
        {jokes.length === 0 ? (
          <span
            className="rounded px-1.5 py-0.5 text-[11px]"
            style={{ border: '1px dashed var(--rule-2)', color: 'var(--ink-3)' }}
          >
            not split yet
          </span>
        ) : (
          <span className="flex items-center gap-1">
            {jokes.map((j, i) => <StateSquare key={i} state={jokeState(j, batch)} />)}
          </span>
        )}
        <span className="ml-auto pl-2 text-xs" style={{ color: 'var(--ink-2)' }}>{batchSummary(batch)}</span>
      </button>
      {open && (
        <div className="space-y-1.5 px-3 pb-3 pt-1.5">
          {note != null && <NoteCard note={note} ratedAt={batch.ratedAt} now={now} />}
          {cards.map(({ joke, position }) => (
            <JokeCard key={position} joke={joke} batch={batch} position={position} now={now} />
          ))}
          {cards.length === 0 && note == null && (
            <p className="text-xs" style={{ color: 'var(--ink-3)' }}>With Marketing. Its jokes show here once Marketing releases them.</p>
          )}
        </div>
      )}
    </div>
  );
};

/** The Value stream card. `batches` is in the context's order, oldest first; the card shows newest first. */
export const ValueStream: React.FC<{
  batches: Batch[];
  batchCount?: number | null;
  openIds: Set<string>;
  onToggle: (id: string) => void;
  /** False before the round's first summary arrives: an empty stream then says the round has not started. */
  roundStarted?: boolean;
}> = ({ batches, batchCount, openIds, onToggle, roundStarted = true }) => {
  const demoUi = useDemoUi();
  const wallNow = useNow(1000, demoUi !== null);
  const now = demoUi ? demoUi.clockMs : wallNow;
  const count = batchCount ?? batches.length;
  return (
    <section
      data-tour="jm-value-stream"
      aria-label="Value stream"
      className="rounded-xl border p-4"
      style={{ background: 'var(--sheet)', borderColor: 'var(--rule)' }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold" style={{ color: 'var(--ink)' }}>Value stream</h2>
        <span className="text-xs" style={{ fontFamily: MONO, color: 'var(--ink-3)' }}>
          {count} {count === 1 ? 'batch' : 'batches'}
        </span>
      </div>
      <p className="mt-0.5 text-xs" style={{ color: 'var(--ink-3)' }}>
        Every batch you have sent, newest first. Open one to see how each joke is doing.
      </p>
      <div className="mt-3 max-h-[520px] space-y-1 overflow-y-auto">
        {batches.length === 0 && (
          <p className="py-4 text-center text-sm" style={{ color: 'var(--ink-3)' }}>
            {roundStarted ? 'No batches yet.' : 'Your batches show up here once the round starts.'}
          </p>
        )}
        {[...batches].reverse().map(b => (
          <BatchRow key={b.id} batch={b} open={openIds.has(b.id)} onToggle={() => onToggle(b.id)} now={now} />
        ))}
      </div>
    </section>
  );
};
