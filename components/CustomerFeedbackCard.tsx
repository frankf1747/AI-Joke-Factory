/* Marketing's "Customer feedback" card, with its Pop out button, and the
   static "What customers judge" criteria list below it.

   Pop out floats the live feedback above the game (components/PopOutPanel.tsx):
   a Document Picture-in-Picture window in Chrome and Edge, a panel pinned to the
   bottom-right of the page elsewhere (it can be dragged). The floating copy is
   the criteria × jokes matrix with its joke key (components/FeedbackMatrix.tsx);
   the batch list supplies each joke's batch, position and text. While it is
   out, the card stays in place and says "Showing in the floating window", with
   a single "Bring back" to close it.

   `canPopOut` is false in watch mode: the pop-out is for Marketing's own
   screen only, so a watch tab gets the plain card. */
import React, { useState } from 'react';
import { SquareArrowOutUpRight } from 'lucide-react';
import { Card } from './ui';
import { DIMENSIONS } from '../config/dimensions';
import { FeedbackCard } from './FeedbackCard';
import { PopOutPanel } from './PopOutPanel';
import { FeedbackMatrixLive } from './FeedbackMatrix';
import type { Batch } from '../types';
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

const feedbackSubtitle = (n: number) =>
  `Your latest ${n} released ${n === 1 ? 'joke' : 'jokes'}. Customers say what landed and what missed, never by how much.`;

export interface CustomerFeedbackCardViewProps {
  rows: FeedbackRow[];
  /** This team's batches, for the pop-out's joke key. */
  batches: Batch[];
  canPopOut: boolean;
  popped: boolean;
  onPopOut: () => void;
  onBringBack: () => void;
}

/** Stateless, so tests can render both states. */
export const CustomerFeedbackCardView: React.FC<CustomerFeedbackCardViewProps> = ({
  rows, batches, canPopOut, popped, onPopOut, onBringBack,
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
            {rows.length === 0 ? <FeedbackList rows={rows} /> : <FeedbackMatrixLive rows={rows} batches={batches} />}
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

export const CustomerFeedbackCard: React.FC<{ rows: FeedbackRow[]; batches: Batch[]; canPopOut: boolean }> = ({
  rows, batches, canPopOut,
}) => {
  const [popped, setPopped] = useState(false);
  return (
    <CustomerFeedbackCardView
      rows={rows}
      batches={batches}
      canPopOut={canPopOut}
      popped={popped}
      onPopOut={() => setPopped(true)}
      onBringBack={() => setPopped(false)}
    />
  );
};

export default CustomerFeedbackCard;
