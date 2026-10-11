/* What Marketing's desk does after it presses Release (or Discard batch):
   which toast to show and whether to clear the "Note to your Joke Maker" box.
   Pure and JSX-free so the rules are testable without React
   (views/marketingRelease.test.ts).

   - The publish succeeded: the usual toast, plus " · note sent" when a note
     went with the batch, and the note box clears.
   - It failed: no toast (context.publishBatch has already alerted) and the
     note stays in the box, so nothing the marketer typed is lost. */
import { fmt$ } from '../config/brand';

export const NOTE_SENT_SUFFIX = ' · note sent';

export interface ReleaseOutcomeInput {
  /** Whether the backend accepted the publish. */
  ok: boolean;
  /** Jokes released to market (0 for a whole-batch discard). */
  releasedCount: number;
  /** Jokes in the batch. */
  batchSize: number;
  costOfPublishing: number;
  costOfDiscard: number;
  /** The note box's text when Release or Discard was pressed. */
  note: string;
}

export interface ReleaseOutcome {
  toast: string | null;
  clearNote: boolean;
}

export function releaseOutcome(i: ReleaseOutcomeInput): ReleaseOutcome {
  if (!i.ok) return { toast: null, clearNote: false };
  const base = i.releasedCount === 0
    ? `Passed on this batch · ${i.batchSize} joke${i.batchSize > 1 ? 's' : ''} discarded · −${fmt$(i.batchSize * i.costOfDiscard)}`
    : `Released ${i.releasedCount} joke${i.releasedCount > 1 ? 's' : ''} · −${fmt$(i.releasedCount * i.costOfPublishing)}`;
  return { toast: base + (i.note.trim() !== '' ? NOTE_SENT_SUFFIX : ''), clearNote: true };
}
