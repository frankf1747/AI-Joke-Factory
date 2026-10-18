/* Marketing's note to its Joke Maker, as the Joke Maker's Value stream shows it.

   Marketing writes the note in the "Note to your Joke Maker" box and it goes out
   with the batch's publish call; the batch list returns it as marketing_note.
   A batch row shows MarketingNoteIcon when the batch has a note; the opened batch
   shows the note itself in NoteCard (components/jokeMaker/ValueStream.tsx).

   The note is untrusted student text. NoteCard renders it as a React text child,
   so markup in it is shown, never interpreted. Imports components/ui-free on
   purpose: no barrel, no context. */
import React from 'react';
import { MessageSquare } from 'lucide-react';

export const MARKETING_NOTE_TOOLTIP = 'Marketing left a note';
export const MARKETING_NOTE_HEADING = 'From Marketing';

/** The note to show for a batch, or null when there is none (absent, null or blank). */
export function marketingNoteOf(batch: { marketing_note?: string | null }): string | null {
  const note = batch.marketing_note;
  return typeof note === 'string' && note.trim() !== '' ? note : null;
}

/** The small icon on a batch row that has a note. */
export const MarketingNoteIcon: React.FC = () => (
  <span
    role="img"
    aria-label={MARKETING_NOTE_TOOLTIP}
    title={MARKETING_NOTE_TOOLTIP}
    className="inline-flex shrink-0"
    style={{ color: 'var(--navy)' }}
  >
    <MessageSquare size={13} aria-hidden="true" />
  </span>
);
