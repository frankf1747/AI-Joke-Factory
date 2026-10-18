import { describe, expect, it } from 'vitest';
import { releaseOutcome } from './marketingRelease';

const base = { releasedCount: 2, batchSize: 5, costOfPublishing: 0.1, costOfDiscard: 0.01 };

describe('releaseOutcome', () => {
  it('a release without a note: the usual toast, and the box clears', () => {
    expect(releaseOutcome({ ...base, ok: true, note: '' })).toEqual({
      toast: 'Released 2 jokes · 3 discarded · −$0.23', cost: 0.23, clearNote: true,
    });
  });

  it('charges the jokes left behind as discards: 3 published, 2 discarded', () => {
    const out = releaseOutcome({ ...base, releasedCount: 3, ok: true, note: '' });
    expect(out.cost).toBeCloseTo(0.32, 10);
    expect(out.toast).toBe('Released 3 jokes · 2 discarded · −$0.32');
  });

  it('a release that discards nothing keeps the short toast', () => {
    const out = releaseOutcome({ ...base, releasedCount: 5, ok: true, note: '' });
    expect(out.cost).toBeCloseTo(0.5, 10);
    expect(out.toast).toBe('Released 5 jokes · −$0.50');
  });

  it('a release with a note adds " · note sent"', () => {
    expect(releaseOutcome({ ...base, ok: true, note: 'More puns' }).toast).toBe('Released 2 jokes · 3 discarded · −$0.23 · note sent');
  });

  it('a whole-batch discard with a note says so too', () => {
    expect(releaseOutcome({ ...base, releasedCount: 0, ok: true, note: 'Nothing landed' }).toast)
      .toBe('Passed on this batch · 5 jokes discarded · −$0.05 · note sent');
    expect(releaseOutcome({ ...base, releasedCount: 0, ok: true, note: '' }).cost).toBeCloseTo(0.05, 10);
  });

  it('a blank note is not "sent"', () => {
    expect(releaseOutcome({ ...base, releasedCount: 1, ok: true, note: '  \n' }).toast).toBe('Released 1 joke · 4 discarded · −$0.14');
  });

  it('a failed publish shows no toast and keeps the typed note', () => {
    expect(releaseOutcome({ ...base, ok: false, note: 'Keep this' })).toEqual({ toast: null, cost: 0, clearNote: false });
  });
});
