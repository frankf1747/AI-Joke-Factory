import { describe, it, expect } from 'vitest';
import {
  INITIAL_NUDGE_STATE,
  nudgeReducer,
  isNudgeOpen,
  type NudgeState,
} from './marketingNudge';

const CFG = { nudge1Seconds: 60, nudge2Seconds: 45 };

/** Drive a list of events through the reducer from a starting state. */
const run = (events: Parameters<typeof nudgeReducer>[1][], from: NudgeState = INITIAL_NUDGE_STATE) =>
  events.reduce((s, e) => nudgeReducer(s, e, CFG), from);

describe('nudgeReducer', () => {
  it('starts idle with nothing scheduled', () => {
    expect(INITIAL_NUDGE_STATE.phase).toBe('idle');
    expect(INITIAL_NUDGE_STATE.dueInMs).toBeNull();
  });

  it('arms the first nudge when a split batch is ready', () => {
    const s = run([{ type: 'BATCH_READY' }]);
    expect(s.phase).toBe('waiting');
    expect(s.dueInMs).toBe(60_000);
  });

  it('opens the first popup when the wait elapses', () => {
    const s = run([{ type: 'BATCH_READY' }, { type: 'TIMEOUT' }]);
    expect(s.phase).toBe('nudge1');
    expect(s.dueInMs).toBeNull();
  });

  it('arms the second nudge when the first popup is dismissed', () => {
    const s = run([{ type: 'BATCH_READY' }, { type: 'TIMEOUT' }, { type: 'DISMISS' }]);
    expect(s.phase).toBe('settling');
    expect(s.dueInMs).toBe(45_000);
  });

  it('opens the second popup when the settling period elapses', () => {
    const s = run([
      { type: 'BATCH_READY' }, { type: 'TIMEOUT' }, { type: 'DISMISS' }, { type: 'TIMEOUT' },
    ]);
    expect(s.phase).toBe('nudge2');
    expect(s.dueInMs).toBeNull();
  });

  it('goes silent for the rest of the batch once the second popup is dismissed', () => {
    const s = run([
      { type: 'BATCH_READY' }, { type: 'TIMEOUT' }, { type: 'DISMISS' },
      { type: 'TIMEOUT' }, { type: 'DISMISS' },
    ]);
    expect(s.phase).toBe('silent');
    expect(s.dueInMs).toBeNull();
  });

  it('cancels a pending nudge as soon as the batch is released', () => {
    const s = run([{ type: 'BATCH_READY' }, { type: 'RELEASED' }]);
    expect(s.phase).toBe('silent');
    expect(s.dueInMs).toBeNull();
  });

  it('cancels the second nudge too when released mid-deliberation', () => {
    const s = run([
      { type: 'BATCH_READY' }, { type: 'TIMEOUT' }, { type: 'DISMISS' }, { type: 'RELEASED' },
    ]);
    expect(s.phase).toBe('silent');
    expect(s.dueInMs).toBeNull();
  });

  it('ignores a stray timeout once silent', () => {
    const silent = run([{ type: 'BATCH_READY' }, { type: 'RELEASED' }]);
    expect(nudgeReducer(silent, { type: 'TIMEOUT' }, CFG)).toEqual(silent);
  });

  it('ignores a stray timeout while idle', () => {
    expect(nudgeReducer(INITIAL_NUDGE_STATE, { type: 'TIMEOUT' }, CFG)).toEqual(INITIAL_NUDGE_STATE);
  });

  it('re-arms from scratch when the next batch arrives', () => {
    const silent = run([{ type: 'BATCH_READY' }, { type: 'RELEASED' }]);
    const next = nudgeReducer(silent, { type: 'BATCH_READY' }, CFG);
    expect(next.phase).toBe('waiting');
    expect(next.dueInMs).toBe(60_000);
  });

  it('disarms when the batch goes away (e.g. back to splitting)', () => {
    const s = run([{ type: 'BATCH_READY' }, { type: 'BATCH_CLEARED' }]);
    expect(s.phase).toBe('idle');
    expect(s.dueInMs).toBeNull();
  });

  it('honours instructor-configured durations', () => {
    const cfg = { nudge1Seconds: 90, nudge2Seconds: 30 };
    const armed = nudgeReducer(INITIAL_NUDGE_STATE, { type: 'BATCH_READY' }, cfg);
    expect(armed.dueInMs).toBe(90_000);
    const settling = [{ type: 'TIMEOUT' } as const, { type: 'DISMISS' } as const]
      .reduce((s, e) => nudgeReducer(s, e, cfg), armed);
    expect(settling.dueInMs).toBe(30_000);
  });
});

describe('isNudgeOpen', () => {
  it('is true only while a popup is showing', () => {
    expect(isNudgeOpen('nudge1')).toBe(true);
    expect(isNudgeOpen('nudge2')).toBe(true);
    expect(isNudgeOpen('idle')).toBe(false);
    expect(isNudgeOpen('waiting')).toBe(false);
    expect(isNudgeOpen('settling')).toBe(false);
    expect(isNudgeOpen('silent')).toBe(false);
  });
});
