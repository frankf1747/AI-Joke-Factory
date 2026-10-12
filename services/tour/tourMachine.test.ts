import { describe, expect, it } from 'vitest';
import {
  INITIAL_TOUR_STATE, TOUR_STEP_MS, stepDuration, tourProgress, tourReducer,
  type TourAction, type TourState,
} from './tourMachine';

const STEPS = [{ durationMs: 5000 }, {}, { durationMs: 4000 }];
const run = (actions: TourAction[], from: TourState = INITIAL_TOUR_STATE) =>
  actions.reduce((s, a) => tourReducer(s, a, STEPS), from);
const tick = (dtMs: number): TourAction => ({ type: 'tick', dtMs });

describe('stepDuration', () => {
  it('defaults to 6000 ms', () => {
    expect(TOUR_STEP_MS).toBe(6000);
    expect(stepDuration({})).toBe(6000);
    expect(stepDuration({ durationMs: 0 })).toBe(6000);
    expect(stepDuration({ durationMs: Number.NaN })).toBe(6000);
    expect(stepDuration({ durationMs: 7000 })).toBe(7000);
  });
});

describe('tourReducer', () => {
  it('auto-advances when a step has been up for its duration', () => {
    expect(run([tick(4999)])).toMatchObject({ index: 0, elapsedMs: 4999 });
    expect(run([tick(4999), tick(1)])).toMatchObject({ index: 1, elapsedMs: 0 });
    // Step 2 has no duration: the 6000 ms default.
    expect(run([tick(5000), tick(5999)])).toMatchObject({ index: 1, elapsedMs: 5999 });
    expect(run([tick(5000), tick(6000)])).toMatchObject({ index: 2, elapsedMs: 0 });
  });

  it('holds the last step at its end until Start, instead of closing on its own', () => {
    const atLast = run([tick(5000), tick(6000)]);
    const held = run([tick(4000), tick(9000), tick(100)], atLast);
    expect(held).toMatchObject({ index: 2, elapsedMs: 4000, ended: null });
    expect(tourReducer(held, { type: 'next' }, STEPS).ended).toBe('finished');
  });

  it('pause stops the clock; resume and togglePause start it again', () => {
    const paused = run([tick(1000), { type: 'pause' }, tick(10_000)]);
    expect(paused).toMatchObject({ index: 0, elapsedMs: 1000, paused: true });
    expect(run([{ type: 'resume' }, tick(500)], paused)).toMatchObject({ elapsedMs: 1500, paused: false });
    expect(run([{ type: 'togglePause' }, tick(500)], paused)).toMatchObject({ elapsedMs: 1500, paused: false });
    expect(run([{ type: 'togglePause' }])).toMatchObject({ paused: true });
  });

  it('next and back move one step and restart it from 0 ms', () => {
    const s = run([tick(2000), { type: 'next' }, tick(3000)]);
    expect(s).toMatchObject({ index: 1, elapsedMs: 3000 });
    expect(tourReducer(s, { type: 'back' }, STEPS)).toMatchObject({ index: 0, elapsedMs: 0 });
  });

  it('Back on the first step replays it from the start', () => {
    expect(run([tick(3000), { type: 'back' }])).toMatchObject({ index: 0, elapsedMs: 0 });
  });

  it('Back keeps a paused tour paused', () => {
    expect(run([{ type: 'next' }, { type: 'pause' }, { type: 'back' }])).toMatchObject({ index: 0, paused: true });
  });

  it('skip and finish end the tour, and nothing moves it afterwards', () => {
    const skipped = run([{ type: 'skip' }]);
    expect(skipped.ended).toBe('skipped');
    expect(run([{ type: 'finish' }]).ended).toBe('finished');
    expect(run([{ type: 'next' }, tick(99_999), { type: 'back' }, { type: 'finish' }], skipped)).toBe(skipped);
  });

  it('ignores zero, negative and NaN ticks', () => {
    const s = run([tick(1000)]);
    for (const dt of [0, -50, Number.NaN]) expect(tourReducer(s, tick(dt), STEPS)).toBe(s);
  });
});

describe('tourProgress', () => {
  it('counts finished steps plus the share of the current one', () => {
    expect(tourProgress(INITIAL_TOUR_STATE, STEPS)).toBe(0);
    expect(tourProgress({ ...INITIAL_TOUR_STATE, index: 1, elapsedMs: 3000 }, STEPS)).toBeCloseTo(0.5);
    expect(tourProgress({ ...INITIAL_TOUR_STATE, index: 2, elapsedMs: 4000 }, STEPS)).toBe(1);
  });
});
