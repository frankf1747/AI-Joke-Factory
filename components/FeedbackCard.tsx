/* ============================ Feedback card ============================
   Pass/fail per dimension, nothing more. No bar, no percentage, no "→ target"
   arrow and no ideal level: the team should learn WHICH dimensions missed, not
   by how much. See the note at the top of views/feedback.ts.

   Shared by both team seats — Marketing (views/QualityControl.tsx) and the Joke
   Maker (views/JokeMaker.tsx) — because they read the same per-team rows. One
   component, so the two screens cannot drift into telling the same team two
   different stories about the same joke.

   Imports from components/ui rather than the components barrel: the barrel
   pulls in context, and context reaches back into components. */

import React from 'react';
import { Check, X as XIcon, BadgeCheck, Minus } from 'lucide-react';
import { SectionLabel } from './ui';
import type { FeedbackRow } from '../views/feedback';

export const DimChip: React.FC<{ label: string; tone: 'good' | 'improve' }> = ({ label, tone }) => (
  <span
    className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md border ${
      tone === 'good'
        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
        : 'bg-amber-50 text-amber-800 border-amber-300'
    }`}
  >
    {tone === 'good' ? <Check size={11} /> : <XIcon size={11} />} {label}
  </span>
);

export const FeedbackCard: React.FC<{ row: FeedbackRow }> = ({ row }) => (
  <div
    className={`rounded-lg border p-3 mk-fade-in ${
      row.was_bought ? 'border-emerald-100 bg-emerald-50/40' : 'border-gray-200 bg-gray-50/60'
    }`}
  >
    {/* Status badge first, then the title Marketing gave the joke on its own
        line, so the title is never read as part of the status. */}
    <div className="mb-2 space-y-1">
      <span
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
          row.was_bought
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border-gray-200 bg-white text-gray-500'
        }`}
      >
        {row.was_bought
          ? <BadgeCheck size={11} className="shrink-0" />
          : <Minus size={11} className="shrink-0" />}
        {row.was_bought ? 'Sold' : 'Not sold yet'}
      </span>
      {row.joke_title && (
        <p className="text-xs text-gray-800 leading-snug">
          <span className="text-gray-400">Title: </span>
          <span className="font-semibold">{row.joke_title}</span>
        </p>
      )}
    </div>

    {row.good.length === 0 && row.improve.length === 0 ? (
      <p className="text-[11px] text-gray-400 italic">No customer read on this one yet.</p>
    ) : (
      <div className="space-y-2">
        {row.good.length > 0 && (
          <div>
            <SectionLabel className="mb-1">Landed</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {row.good.map(d => <DimChip key={d.id} label={d.label} tone="good" />)}
            </div>
          </div>
        )}
        {row.improve.length > 0 && (
          <div>
            <SectionLabel className="mb-1">Needs work</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {row.improve.map(d => <DimChip key={d.id} label={d.label} tone="improve" />)}
            </div>
          </div>
        )}
      </div>
    )}
  </div>
);

export default FeedbackCard;
