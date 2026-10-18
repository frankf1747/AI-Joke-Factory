/* Marketing's "Customer feedback" card, with its Pop out button, and the
   static "What customers judge" criteria list below it.

   Pop out floats the live feedback above the game (components/PopOutPanel.tsx):
   a Document Picture-in-Picture window in Chrome and Edge, a panel pinned to the
   bottom-right of the page elsewhere. The floating copy leads with the pattern
   across the recent jokes (Keep doing / Fix next), then the jokes. While it is
   out, the card stays in place and says "Showing in the floating window", with
   a single "Bring back" to close it.

   `canPopOut` is false in watch mode: the pop-out is for Marketing's own
   screen only, so a watch tab gets the plain card. */
import React, { useState } from 'react';
import { SquareArrowOutUpRight } from 'lucide-react';
import { summarizeFeedback, type SummaryItem } from '../services/feedbackSummary';
import { Card } from './ui';
import { DIMENSIONS } from '../config/dimensions';
import { FeedbackCard } from './FeedbackCard';
import { PopOutPanel } from './PopOutPanel';
import type { FeedbackRow } from '../views/feedback';

export const CUSTOMER_FEEDBACK_TITLE = 'Customer feedback';

export const FeedbackList: React.FC<{ rows: FeedbackRow[] }> = ({ rows }) =>
  rows.length === 0 ? (
    <p className="py-4 text-center text-sm italic" style={{ color: 'var(--ink-3)' }}>
      No feedback yet. Release jokes to start uncovering the target.
    </p>
  ) : (
    <div className="[&>*+*]:border-t [&>*+*]:border-[color:var(--rule)]">
      {rows.map(r => <FeedbackCard key={r.joke_id} row={r} />)}
    </div>
  );

const SummaryRow: React.FC<{ label: string; items: SummaryItem[]; tone: 'keep' | 'fix' }> = ({ label, items, tone }) => (
  <div className="flex items-start gap-2">
    <span className="w-20 shrink-0 pt-0.5 text-[13px] font-semibold text-gray-700">{label}</span>
    <div className="flex flex-wrap gap-1.5">
      {items.length === 0 ? (
        <span className="text-[13px] text-gray-400">—</span>
      ) : items.map(i => (
        <span
          key={i.id}
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
            tone === 'keep' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'
          }`}
        >
          {i.label} ×{i.count}
        </span>
      ))}
    </div>
  </div>
);

/** The pattern across the shown jokes: what to keep doing, what to fix next. */
export const FeedbackSummaryBlock: React.FC<{ rows: FeedbackRow[] }> = ({ rows }) => {
  const s = summarizeFeedback(rows);
  if (s.keep.length === 0 && s.fix.length === 0) return null;
  return (
    <div className="mb-3 space-y-2 rounded-lg bg-slate-50 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
        What customers keep telling you
      </p>
      <SummaryRow label="Keep doing" items={s.keep} tone="keep" />
      <SummaryRow label="Fix next" items={s.fix} tone="fix" />
    </div>
  );
};

const feedbackSubtitle = (n: number) =>
  `Your latest ${n} released ${n === 1 ? 'joke' : 'jokes'}. Customers say what landed and what missed, never by how much.`;

export interface CustomerFeedbackCardViewProps {
  rows: FeedbackRow[];
  canPopOut: boolean;
  popped: boolean;
  onPopOut: () => void;
  onBringBack: () => void;
}

/** Stateless, so tests can render both states. */
export const CustomerFeedbackCardView: React.FC<CustomerFeedbackCardViewProps> = ({
  rows, canPopOut, popped, onPopOut, onBringBack,
}) => {
  const out = canPopOut && popped;
  return (
    <>
      <Card
        tour="mk-feedback"
        title={CUSTOMER_FEEDBACK_TITLE}
        subtitle={rows.length === 0 ? undefined : feedbackSubtitle(rows.length)}
        action={canPopOut && !out ? (
          <button
            type="button"
            data-tour="mk-expand"
            onClick={onPopOut}
            aria-label="Pop out: open the feedback in a floating window that stays on top"
            title="Open the feedback in a floating window that stays on top"
            className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[13.5px] font-medium underline-offset-[3px] hover:underline"
            style={{ color: 'var(--navy)' }}
          >
            Pop out
            <SquareArrowOutUpRight size={14} aria-hidden="true" />
          </button>
        ) : undefined}
      >
        {out ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <p className="text-sm" style={{ color: 'var(--ink-3)' }}>Showing in the floating window</p>
            <button
              type="button"
              onClick={onBringBack}
              className="text-[13.5px] font-medium underline-offset-[3px] hover:underline"
              style={{ color: 'var(--navy)' }}
            >
              Bring back
            </button>
          </div>
        ) : (
          <div className="max-h-[460px] overflow-y-auto pr-1">
            <FeedbackList rows={rows} />
          </div>
        )}
      </Card>
      {canPopOut && (
        <PopOutPanel title={CUSTOMER_FEEDBACK_TITLE} open={out} onClose={onBringBack}>
          <div className="p-1">
            <FeedbackSummaryBlock rows={rows} />
            <FeedbackList rows={rows} />
          </div>
        </PopOutPanel>
      )}
    </>
  );
};

/** The 12 criteria, static: the 11 matched ones in three columns, then Title Fit
    set apart, because the title Marketing writes decides it. No tallies here. */
export const WhatCustomersJudge: React.FC = () => (
  <Card
    title="What customers judge"
    subtitle="12 criteria. Pop out the feedback to see which ones keep landing or missing."
  >
    <ul className="grid grid-cols-3 gap-x-3 gap-y-0.5 text-[13.5px]" style={{ color: 'var(--ink-2)' }}>
      {DIMENSIONS.filter(d => d.hasIdeal).map(d => <li key={d.id} className="py-[3px]">{d.label}</li>)}
      {DIMENSIONS.filter(d => !d.hasIdeal).map(d => (
        <li
          key={d.id}
          className="col-span-3 mt-1 border-t border-dashed pt-[7px]"
          style={{ borderColor: 'var(--rule-2)', color: 'var(--ink)' }}
        >
          {d.label}
          <small className="ml-1.5" style={{ color: 'var(--ink-3)' }}>set by the title you write</small>
        </li>
      ))}
    </ul>
  </Card>
);

export const CustomerFeedbackCard: React.FC<{ rows: FeedbackRow[]; canPopOut: boolean }> = ({ rows, canPopOut }) => {
  const [popped, setPopped] = useState(false);
  return (
    <CustomerFeedbackCardView
      rows={rows}
      canPopOut={canPopOut}
      popped={popped}
      onPopOut={() => setPopped(true)}
      onBringBack={() => setPopped(false)}
    />
  );
};

export default CustomerFeedbackCard;
