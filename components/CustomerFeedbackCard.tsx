/* Marketing's "Customer feedback" card, with its Pop out button.

   Pop out floats the same live list above the game (components/PopOutPanel.tsx):
   a Document Picture-in-Picture window in Chrome and Edge, a panel pinned to the
   bottom-right of the page elsewhere. While it is out, the card stays in place
   and says "Showing in the floating window", with "Bring back" to close it.

   `canPopOut` is false in watch mode: the pop-out is for Marketing's own
   screen only, so a watch tab gets the plain card. */
import React, { useState } from 'react';
import { PictureInPicture2 } from 'lucide-react';
import { Card } from './ui';
import { BRAND } from '../config/brand';
import { FeedbackCard } from './FeedbackCard';
import { PopOutPanel } from './PopOutPanel';
import type { FeedbackRow } from '../views/feedback';

export const CUSTOMER_FEEDBACK_TITLE = 'Customer feedback';

export const FeedbackList: React.FC<{ rows: FeedbackRow[] }> = ({ rows }) =>
  rows.length === 0 ? (
    <p className="text-sm text-gray-400 italic py-4 text-center">
      No feedback yet — release jokes to start uncovering the target.
    </p>
  ) : (
    <>{rows.map(r => <FeedbackCard key={r.joke_id} row={r} />)}</>
  );

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
        title={CUSTOMER_FEEDBACK_TITLE}
        subtitle="Which criteria landed and which missed — the customers never say by how much"
        accent={BRAND.sold}
        action={canPopOut ? (
          <button
            type="button"
            onClick={out ? onBringBack : onPopOut}
            aria-pressed={out}
            className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50"
          >
            <PictureInPicture2 size={13} aria-hidden="true" />
            {out ? 'Bring back' : 'Pop out'}
          </button>
        ) : undefined}
      >
        {out ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <p className="text-sm text-gray-500">Showing in the floating window</p>
            <button
              type="button"
              onClick={onBringBack}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              Bring back
            </button>
          </div>
        ) : (
          <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
            <FeedbackList rows={rows} />
          </div>
        )}
      </Card>
      {canPopOut && (
        <PopOutPanel title={CUSTOMER_FEEDBACK_TITLE} open={out} onClose={onBringBack}>
          <div className="space-y-3">
            <FeedbackList rows={rows} />
          </div>
        </PopOutPanel>
      )}
    </>
  );
};

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
