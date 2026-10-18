/* The pop-out window's content: what Marketing's customers keep telling it,
   as a criteria × jokes matrix with a key to the jokes below.

   Columns are the feedback's jokes in API order (latest first). Rows are the
   criteria any joke mentions, grouped and ordered by summarizeFeedback: Fix
   next, then Keep doing, each with its count on the winning side. A cell is ✓
   (landed), ✕ (missed) or · (not mentioned); a row can show marks from both
   sides. "No word yet" lists the criteria no joke mentions; a joke with no
   customer read yet is an all-"·" column and changes nothing there.

   The key names each column's joke: batch, position, release time, buyers,
   and its text behind a disclosure. Clicking a column header opens its key
   row; hovering a column or a key row highlights both.

   Pass/fail only, never by how much: see the note at the top of views/feedback.ts. */
import React, { useMemo, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { DIMENSIONS } from '../config/dimensions';
import { summarizeFeedback, type SummaryItem } from '../services/feedbackSummary';
import { feedbackJokeContext, type FeedbackJoke } from '../services/feedbackJokeContext';
import { fmtDuration } from '../services/format';
import { useNow } from './NextStep';
import type { Batch } from '../types';
import type { FeedbackRow } from '../views/feedback';

const MONO = "'IBM Plex Mono', ui-monospace, monospace";
const HOT_OUTLINE = 'inset 0 0 0 1.5px var(--navy)';

const titleOf = (j: FeedbackJoke) => j.joke_title || 'Untitled joke';

/** Customers holding the joke now: `sold_count` when the batch list has it, else `was_bought`. */
const hasBuyer = (j: FeedbackJoke) => (j.soldCount == null ? j.was_bought : j.soldCount > 0);
function buyersLabel(j: FeedbackJoke): string {
  if (j.soldCount == null) return j.was_bought ? 'Has a buyer' : 'No buyer now';
  if (j.soldCount === 0) return 'No buyer now';
  return j.soldCount === 1 ? '1 buyer' : `${j.soldCount} buyers`;
}

type Mark = { glyph: string; word: 'landed' | 'missed' | 'not mentioned'; style: React.CSSProperties };
function markOf(j: FeedbackJoke, dimId: string): Mark {
  if (j.good.some(d => d.id === dimId)) {
    return { glyph: '✓', word: 'landed', style: { background: 'var(--selling-bg)', color: 'var(--selling)', fontWeight: 600 } };
  }
  if (j.improve.some(d => d.id === dimId)) {
    return { glyph: '✕', word: 'missed', style: { background: 'var(--warn-bg)', color: 'var(--warn)', fontWeight: 600 } };
  }
  return { glyph: '·', word: 'not mentioned', style: { color: 'var(--ink-4)' } };
}

/** "B-5002, joke #1, released 6 min ago", or null for a joke the batch list does not have yet. */
function keyLine(j: FeedbackJoke, now: number): string | null {
  if (j.batchId == null) return null;
  const parts = [`B-${j.batchId}`];
  if (j.position != null) parts.push(`joke #${j.position}`);
  if (j.releasedAt != null) parts.push(`released ${fmtDuration((now - j.releasedAt) / 1000)} ago`);
  return parts.join(', ');
}

export interface FeedbackMatrixProps {
  jokes: FeedbackJoke[];
  /** Epoch ms, for "released … ago". */
  now: number;
}

export const FeedbackMatrix: React.FC<FeedbackMatrixProps> = ({ jokes, now }) => {
  const [hot, setHot] = useState<number | null>(null);
  const [open, setOpen] = useState<ReadonlySet<number>>(() => new Set());
  const keyRows = useRef(new Map<number, HTMLLIElement>());

  const summary = useMemo(() => summarizeFeedback(jokes), [jokes]);
  const mentioned = new Set([...summary.fix, ...summary.keep].map(i => i.id));
  const unmentioned = DIMENSIONS.filter(d => !mentioned.has(d.id)).map(d => d.label);

  const setOpenFor = (id: number, isOpen: boolean) => setOpen(prev => {
    if (prev.has(id) === isOpen) return prev;
    const next = new Set(prev);
    if (isOpen) next.add(id); else next.delete(id);
    return next;
  });
  const openKeyRow = (id: number) => {
    setOpenFor(id, true);
    keyRows.current.get(id)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };
  const hover = (id: number) => ({ onMouseEnter: () => setHot(id), onMouseLeave: () => setHot(null) });

  const group = (label: string, items: SummaryItem[], countColor: string) => items.length === 0 ? null : (
    <React.Fragment key={label}>
      <tr>
        <td colSpan={jokes.length + 1} className="pb-px pt-2 text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>{label}</td>
      </tr>
      {items.map(item => (
        <tr key={item.id}>
          <td className="h-6 whitespace-nowrap" style={{ color: 'var(--ink)' }}>
            <span className="inline-block max-w-[calc(100%-32px)] overflow-hidden text-ellipsis align-middle">{item.label}</span>
            <b className="float-right pr-0.5 text-xs font-semibold leading-6" style={{ fontFamily: MONO, color: countColor }}>×{item.count}</b>
          </td>
          {jokes.map(j => {
            const m = markOf(j, item.id);
            return (
              <td
                key={j.joke_id}
                className="h-6 rounded text-center text-[13px] transition-shadow"
                title={`${titleOf(j)}: ${item.label} ${m.word}`}
                style={{ ...m.style, boxShadow: hot === j.joke_id ? HOT_OUTLINE : undefined }}
                {...hover(j.joke_id)}
                aria-label={m.word}
              >{m.glyph}</td>
            );
          })}
        </tr>
      ))}
    </React.Fragment>
  );

  return (
    <div>
      <div>
        <b className="block text-[15px] font-semibold tracking-[-0.01em]" style={{ color: 'var(--ink)' }}>
          What customers keep telling you
        </b>
        <span className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
          Your latest {jokes.length} released {jokes.length === 1 ? 'joke' : 'jokes'}
        </span>
      </div>

      <table className="-mx-[3px] mt-2.5 w-full table-fixed border-separate border-spacing-[3px] text-[13px]">
        <thead>
          <tr>
            <th className="w-[39%] pb-1.5 text-left align-bottom text-[11.5px] font-normal" style={{ color: 'var(--ink-4)' }}>
              Latest first
            </th>
            {jokes.map(j => (
              <th
                key={j.joke_id}
                className="rounded p-0 text-left align-bottom font-medium transition-colors"
                style={{ background: hot === j.joke_id ? 'var(--navy-tint)' : undefined }}
                {...hover(j.joke_id)}
              >
                <button
                  type="button"
                  onClick={() => openKeyRow(j.joke_id)}
                  onFocus={() => setHot(j.joke_id)}
                  onBlur={() => setHot(null)}
                  className="block w-full rounded px-1 pb-[5px] pt-1 text-left hover:bg-[color:var(--paper)]"
                >
                  <span className="block text-[10.5px]" style={{ fontFamily: MONO, color: 'var(--ink-3)' }}>
                    {j.batchId == null ? ' ' : `B-${j.batchId}${j.position == null ? '' : ` #${j.position}`}`}
                  </span>
                  <span
                    title={titleOf(j)}
                    className="mt-px min-h-[2.5em] overflow-hidden text-xs font-semibold leading-[1.25]"
                    style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', color: 'var(--ink)' }}
                  >
                    {titleOf(j)}
                  </span>
                  <span className="mt-0.5 block text-[11px] font-medium" style={{ color: hasBuyer(j) ? 'var(--selling)' : 'var(--ink-3)' }}>
                    {buyersLabel(j)}
                  </span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {group('Fix next', summary.fix, 'var(--warn)')}
          {group('Keep doing', summary.keep, 'var(--selling)')}
        </tbody>
      </table>

      {unmentioned.length > 0 && (
        <p className="mt-2 text-[12.5px]" style={{ color: 'var(--ink-3)' }}>No word yet: {unmentioned.join(', ')}.</p>
      )}

      <ol className="mt-3 grid list-none gap-0.5 border-t pt-2.5" style={{ borderColor: 'var(--rule)' }}>
        {jokes.map(j => {
          const line = keyLine(j, now);
          const isOpen = open.has(j.joke_id);
          const head = (
            <>
              <span className="min-w-0">
                <b className="block text-[13.5px] font-semibold" style={{ color: 'var(--ink)' }}>{titleOf(j)}</b>
                {line && <small className="block text-xs" style={{ color: 'var(--ink-3)' }}>{line}</small>}
              </span>
              <span
                className="shrink-0 whitespace-nowrap rounded-full px-2 py-px text-xs font-medium"
                style={hasBuyer(j)
                  ? { color: 'var(--selling)', background: 'var(--selling-bg)' }
                  : { color: 'var(--ink-3)', background: 'var(--paper)' }}
              >
                {buyersLabel(j)}
              </span>
            </>
          );
          return (
            <li
              key={j.joke_id}
              ref={el => { if (el) keyRows.current.set(j.joke_id, el); else keyRows.current.delete(j.joke_id); }}
              className="rounded-md transition-colors"
              style={{ background: hot === j.joke_id ? 'var(--navy-tint)' : undefined }}
              {...hover(j.joke_id)}
            >
              {j.text == null ? (
                <div className="grid grid-cols-[14px_1fr_auto] items-center gap-2 p-1.5">
                  <span aria-hidden="true" />
                  {head}
                </div>
              ) : (
                <details open={isOpen} onToggle={e => setOpenFor(j.joke_id, e.currentTarget.open)}>
                  <summary className="grid cursor-pointer list-none grid-cols-[14px_1fr_auto] items-center gap-2 rounded-md p-1.5 hover:bg-[color:var(--paper)] [&::-webkit-details-marker]:hidden">
                    <ChevronRight
                      size={14}
                      aria-hidden="true"
                      className="transition-transform"
                      style={{ color: isOpen ? 'var(--ink-2)' : 'var(--ink-4)', transform: isOpen ? 'rotate(90deg)' : undefined }}
                    />
                    {head}
                  </summary>
                  <p
                    className="joke-font mb-2 ml-7 mr-1.5 mt-0.5 max-w-[62ch] rounded-md px-3 py-[9px] text-[15px] leading-normal"
                    style={{ background: 'var(--paper)', color: 'var(--ink)' }}
                  >
                    {j.text}
                  </p>
                </details>
              )}
            </li>
          );
        })}
      </ol>

      <p className="mt-3 text-xs" style={{ color: 'var(--ink-3)' }}>
        Customers say what landed and what missed, never by how much. Each joke shows 5 of the 12 criteria.
      </p>
    </div>
  );
};

/** The matrix for the live pop-out: joins the feedback to the batch list and keeps "released … ago" ticking. */
export const FeedbackMatrixLive: React.FC<{ rows: FeedbackRow[]; batches: Batch[] }> = ({ rows, batches }) => {
  const now = useNow(1000);
  const jokes = useMemo(() => feedbackJokeContext(rows, batches), [rows, batches]);
  return <FeedbackMatrix jokes={jokes} now={now} />;
};

export default FeedbackMatrix;
