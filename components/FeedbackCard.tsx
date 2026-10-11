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
   row of the criteria that landed and one of those that missed, each criterion
   in its own small box so they read apart at a glance, in the floating window
   too. */
const DimLine: React.FC<{ tone: 'good' | 'improve'; labels: string[] }> = ({ tone, labels }) => (
  <div className="flex items-start gap-1.5">
    <span
      aria-hidden="true"
      className={`w-4 shrink-0 pt-0.5 text-center text-[13px] font-bold ${tone === 'good' ? 'text-emerald-600' : 'text-amber-600'}`}
    >
      {tone === 'good' ? '✓' : '✗'}
    </span>
    <span className="sr-only">{tone === 'good' ? 'Landed: ' : 'Needs work: '}</span>
    <ul className="flex flex-wrap gap-1">
      {labels.map(l => (
        <li
          key={l}
          className={`rounded-md border px-1.5 py-0.5 text-[12px] font-medium leading-tight ${
            tone === 'good'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-amber-200 bg-amber-50 text-amber-800'
          }`}
        >
          {l}
        </li>
      ))}
    </ul>
  </div>
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
      <div className="mt-1.5 space-y-1">
        {row.good.length > 0 && <DimLine tone="good" labels={row.good.map(d => d.label)} />}
        {row.improve.length > 0 && <DimLine tone="improve" labels={row.improve.map(d => d.label)} />}
      </div>
    )}
  </div>
);

export default FeedbackCard;
