import { describe, expect, it } from 'vitest';
import { ROUND_STARTED_LABEL, SKIP_LABEL, keyAction, tourControls } from './tourControls';
import { INITIAL_TOUR_STATE } from '../../services/tour/tourMachine';

const STEPS = [{}, {}, { finishLabel: 'Start' }];

describe('tourControls', () => {
  it('shows "Step n of N", progress, and Back disabled on the first step', () => {
    const c = tourControls(INITIAL_TOUR_STATE, STEPS, false);
    expect(c).toMatchObject({ stepText: 'Step 1 of 3', progress: 0, backDisabled: true, pauseLabel: 'Pause', nextLabel: 'Next' });
    const mid = tourControls({ ...INITIAL_TOUR_STATE, index: 1, elapsedMs: 3000 }, STEPS, false);
    expect(mid).toMatchObject({ stepText: 'Step 2 of 3', backDisabled: false });
    expect(mid.progress).toBeCloseTo(0.5);
  });

  it('says Play while paused, and Start on the last step', () => {
    expect(tourControls({ ...INITIAL_TOUR_STATE, paused: true }, STEPS, false).pauseLabel).toBe('Play');
    expect(tourControls({ ...INITIAL_TOUR_STATE, index: 2 }, STEPS, false).nextLabel).toBe('Start');
  });

  it('turns Skip into a primary "Round started — go to the game" once the round goes ACTIVE mid-tour', () => {
    expect(tourControls(INITIAL_TOUR_STATE, STEPS, false)).toMatchObject({ skipLabel: SKIP_LABEL, skipPrimary: false });
    expect(SKIP_LABEL).toBe('Skip tour');
    expect(tourControls({ ...INITIAL_TOUR_STATE, index: 1 }, STEPS, true)).toMatchObject({
      skipLabel: 'Round started — go to the game', skipPrimary: true,
    });
    expect(ROUND_STARTED_LABEL).toBe('Round started — go to the game');
  });
});

describe('keyAction', () => {
  it('Esc skips, ← back, → next, Space pauses', () => {
    expect(keyAction({ key: 'Escape' })).toEqual({ type: 'skip' });
    expect(keyAction({ key: 'Esc' })).toEqual({ type: 'skip' });
    expect(keyAction({ key: 'ArrowLeft' })).toEqual({ type: 'back' });
    expect(keyAction({ key: 'ArrowRight' })).toEqual({ type: 'next' });
    expect(keyAction({ key: ' ', targetTag: 'DIV' })).toEqual({ type: 'togglePause' });
    expect(keyAction({ key: 'Spacebar' })).toEqual({ type: 'togglePause' });
  });

  it('leaves browser shortcuts, other keys, and Space on a focused button alone', () => {
    expect(keyAction({ key: 'ArrowLeft', altKey: true })).toBeNull();
    expect(keyAction({ key: 'ArrowRight', metaKey: true })).toBeNull();
    expect(keyAction({ key: 'Escape', ctrlKey: true })).toBeNull();
    expect(keyAction({ key: 'Enter' })).toBeNull();
    expect(keyAction({ key: 'a' })).toBeNull();
    expect(keyAction({ key: ' ', targetTag: 'BUTTON' })).toBeNull();
  });
});
