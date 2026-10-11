/* Marketing's note to its Joke Maker, as the Joke Maker's Value stream shows it.

   Marketing writes the note in the "Note to your Joke Maker" box and it goes out
   with the batch's publish call; the batch list returns it as marketing_note.
   A collapsed batch row shows MarketingNoteIcon when the batch has a note, and
   the expanded batch shows MarketingNoteCallout above its jokes. Batches
   without a note render exactly as before.

   The note is untrusted student text. It is rendered as a React text child, so
   markup in it is shown, never interpreted; `white-space: pre-wrap` keeps its
   line breaks and `overflow-wrap: anywhere` breaks a long unbroken word instead
   of widening the card. Both are inline styles so they hold even where a
   Tailwind class was never generated. Imports components/ui-free on purpose:
   no barrel, no context. */
import React from 'react';
import { MessageSquare } from 'lucide-react';

/** Marketing's colour (the --marketing violet the lean charts use). */
export const MARKETING_NOTE_COLOR = '#7c3aed';
export const MARKETING_NOTE_TOOLTIP = 'Marketing left a note';
export const MARKETING_NOTE_HEADING = 'From Marketing';

/** The note to show for a batch, or null when there is none (absent, null or blank). */
export function marketingNoteOf(batch: { marketing_note?: string | null }): string | null {
  const note = batch.marketing_note;
  return typeof note === 'string' && note.trim() !== '' ? note : null;
}

/** The speech bubble on a collapsed batch row that has a note. */
export const MarketingNoteIcon: React.FC = () => (
  <span
    role="img"
    aria-label={MARKETING_NOTE_TOOLTIP}
    title={MARKETING_NOTE_TOOLTIP}
    className="inline-flex shrink-0"
    style={{ color: MARKETING_NOTE_COLOR }}
  >
    <MessageSquare size={13} aria-hidden="true" />
  </span>
);

/** The callout above an expanded batch's jokes. */
export const MarketingNoteCallout: React.FC<{ note: string }> = ({ note }) => (
  <div
    className="mx-3 my-2 rounded-md border border-violet-200 bg-violet-50 px-3 py-2"
    style={{ borderLeft: `3px solid ${MARKETING_NOTE_COLOR}` }}
  >
    <div className="mb-0.5 text-xs font-semibold" style={{ color: MARKETING_NOTE_COLOR }}>
      {MARKETING_NOTE_HEADING}
    </div>
    <p className="text-sm text-gray-800" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
      {note}
    </p>
  </div>
);
