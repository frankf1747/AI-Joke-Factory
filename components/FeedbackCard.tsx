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

/* One joke: its title with the buyer tag on the right, then a "Landed" line
   and a "Missed" line. Each criterion sits in its own small chip (green on its
   tint, or warn on its tint) so they read apart at a glance, in the floating
   window too. No icons, no edge lines: the words and the colours carry it. */
const DimLine: React.FC<{ tone: 'good' | 'improve'; labels: string[] }> = ({ tone, labels }) => (
  <div className="flex items-baseline gap-2">
    <span className="w-14 shrink-0 text-[13px]" style={{ color: 'var(--ink-3)' }}>
      {tone === 'good' ? 'Landed' : 'Missed'}
    </span>
    <ul className="flex flex-wrap gap-1">
      {labels.map(l => (
        <li
          key={l}
          className="rounded-md px-[7px] text-[13px] leading-[21px]"
          style={{
            color: tone === 'good' ? 'var(--selling)' : 'var(--warn)',
            background: tone === 'good' ? 'var(--selling-bg)' : 'var(--warn-bg)',
          }}
        >
          {l}
        </li>
      ))}
    </ul>
  </div>
);

/* `was_bought` means a customer owns the joke right now, not that it ever sold. */
export const FeedbackCard: React.FC<{ row: FeedbackRow }> = ({ row }) => (
  <div className="py-3 mk-fade-in">
    <div className="flex items-baseline justify-between gap-2.5">
      <p className="min-w-0 break-words text-[14.5px] font-semibold leading-snug" style={{ color: 'var(--ink)' }}>
        {row.joke_title || 'Untitled joke'}
      </p>
      <span
        className="shrink-0 whitespace-nowrap rounded-full px-2 py-px text-xs font-medium"
        style={row.was_bought
          ? { color: 'var(--selling)', background: 'var(--selling-bg)' }
          : { color: 'var(--ink-3)', background: 'var(--paper)' }}
      >
        {row.was_bought ? 'Has a buyer' : 'No buyer now'}
      </span>
    </div>
    {row.good.length === 0 && row.improve.length === 0 ? (
      <p className="mt-1.5 text-[13px] italic" style={{ color: 'var(--ink-3)' }}>No customer read on this one yet.</p>
    ) : (
      <div className="mt-2 space-y-1">
        {row.good.length > 0 && <DimLine tone="good" labels={row.good.map(d => d.label)} />}
        {row.improve.length > 0 && <DimLine tone="improve" labels={row.improve.map(d => d.label)} />}
      </div>
    )}
  </div>
);

export default FeedbackCard;
