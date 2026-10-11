/* ============================ Feedback card ============================
   Pass/fail per dimension, nothing more. No bar, no percentage, no "→ target"
   arrow and no ideal level: the team should learn WHICH dimensions missed, not
   by how much. See the note at the top of views/feedback.ts.

   Rendered on Marketing's screen only (views/QualityControl.tsx). The Joke
   Maker no longer sees customer feedback; it hears from Marketing instead.

   Imports nothing from the components barrel: the barrel pulls in context,
   and context reaches back into components. */

import React from 'react';
import type { FeedbackRow } from '../views/feedback';

/* One joke, compact: its title with the sale status on the right, then one
   line of the criteria that landed and one of those that missed. Plain text
   at a readable size, so it scans at a glance in the floating window too. */
const DimLine: React.FC<{ tone: 'good' | 'improve'; labels: string[] }> = ({ tone, labels }) => (
  <p className={`text-[13px] leading-snug ${tone === 'good' ? 'text-emerald-700' : 'text-amber-700'}`}>
    <span aria-hidden="true">{tone === 'good' ? '✓ ' : '✗ '}</span>
    <span className="sr-only">{tone === 'good' ? 'Landed: ' : 'Needs work: '}</span>
    {labels.join(', ')}
  </p>
);

export const FeedbackCard: React.FC<{ row: FeedbackRow }> = ({ row }) => (
  <div className="py-2.5 mk-fade-in">
    <div className="flex items-start justify-between gap-2">
      <p className="text-sm font-semibold text-gray-900 leading-snug break-words min-w-0">
        {row.joke_title || 'Untitled joke'}
      </p>
      <span
        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
          row.was_bought ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
        }`}
      >
        {row.was_bought ? 'Sold' : 'Not sold yet'}
      </span>
    </div>
    {row.good.length === 0 && row.improve.length === 0 ? (
      <p className="mt-1 text-[13px] text-gray-400 italic">No customer read on this one yet.</p>
    ) : (
      <div className="mt-1 space-y-0.5">
        {row.good.length > 0 && <DimLine tone="good" labels={row.good.map(d => d.label)} />}
        {row.improve.length > 0 && <DimLine tone="improve" labels={row.improve.map(d => d.label)} />}
      </div>
    )}
  </div>
);

export default FeedbackCard;
