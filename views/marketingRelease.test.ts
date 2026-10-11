import { describe, expect, it } from 'vitest';
import { releaseOutcome } from './marketingRelease';

const base = { releasedCount: 2, batchSize: 5, costOfPublishing: 0.1, costOfDiscard: 0.01 };

describe('releaseOutcome', () => {
  it('a release without a note: the usual toast, and the box clears', () => {
    expect(releaseOutcome({ ...base, ok: true, note: '' })).toEqual({
      toast: 'Released 2 jokes · −$0.20', clearNote: true,
    });
  });

  it('a release with a note adds " · note sent"', () => {
    expect(releaseOutcome({ ...base, ok: true, note: 'More puns' }).toast).toBe('Released 2 jokes · −$0.20 · note sent');
  });

  it('a whole-batch discard with a note says so too', () => {
    expect(releaseOutcome({ ...base, releasedCount: 0, ok: true, note: 'Nothing landed' }).toast)
      .toBe('Passed on this batch · 5 jokes discarded · −$0.05 · note sent');
  });

  it('a blank note is not "sent"', () => {
    expect(releaseOutcome({ ...base, releasedCount: 1, ok: true, note: '  \n' }).toast).toBe('Released 1 joke · −$0.10');
  });

  it('a failed publish shows no toast and keeps the typed note', () => {
    expect(releaseOutcome({ ...base, ok: false, note: 'Keep this' })).toEqual({ toast: null, clearNote: false });
  });
});
