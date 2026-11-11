import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GuidedTour, MAX_TICK_MS, TICK_MS, TourErrorBoundary, tourPlan } from './GuidedTour';
import JokeMaker from '../../views/JokeMaker';
import type { GameConfig } from '../../types';
import { TEST_CONFIG } from '../../views/testing/renderWithGame';

/** The lobby before Round 1 starts, at the default fees. */
const CONFIG: GameConfig = { ...TEST_CONFIG, status: 'LOBBY', isActive: false, startTime: null, elapsedTime: 0 };

describe('tourPlan', () => {
  it('builds the role\'s steps for the round, captions filled from its fees', () => {
    const r1 = tourPlan('JOKE_MAKER', CONFIG);
    expect(r1.options).toMatchObject({ role: 'JOKE_MAKER', roundNumber: 1 });
    expect(r1.steps.find(s => s.id === 'jm-batch-size')!.body).toBe('Every batch is 5 jokes. Keep them coming.');
    const r2 = tourPlan('JOKE_MAKER', { ...CONFIG, round: 2 });
    expect(r2.steps.find(s => s.id === 'jm-batch-size')!.body).toBe(
      'You choose the batch size now. Smaller batches reach customers and come back with feedback sooner.',
    );
    expect(tourPlan('QUALITY_CONTROL', CONFIG).steps.find(s => s.id === 'mk-fees')!.body)
      .toContain('Every joke you release costs $0.10 to list, and 5¢ a minute while it sits unsold.');
    expect(tourPlan('QUALITY_CONTROL', CONFIG).steps).toHaveLength(12);
  });

  it('is the same tour whether the round is ACTIVE or not, so a round starting mid-tour changes nothing but the Skip button', () => {
    const before = tourPlan('QUALITY_CONTROL', CONFIG);
    const after = tourPlan('QUALITY_CONTROL', { ...CONFIG, isActive: true, status: 'PLAYING', startTime: 1, elapsedTime: 3 });
    expect(after.options).toEqual(before.options);
    expect(after.steps.map(s => s.id)).toEqual(before.steps.map(s => s.id));
  });
});

describe('the clock', () => {
  it('ticks ten times a second and never counts more than 250 ms for one tick', () => {
    expect(TICK_MS).toBe(100);
    expect(MAX_TICK_MS).toBe(250);
  });
});

describe('TourErrorBoundary', () => {
  it('reports the error once and renders nothing after it', () => {
    const onError = vi.fn();
    const boundary = new TourErrorBoundary({ onError, children: 'stage' });
    expect(boundary.render()).toBe('stage');
    expect(TourErrorBoundary.getDerivedStateFromError()).toEqual({ failed: true });
    boundary.componentDidCatch(new Error('boom'));
    expect(onError).toHaveBeenCalledTimes(1);
    boundary.state = { failed: true };
    expect(boundary.render()).toBeNull();
  });
});

describe('TourErrorBoundary around a throwing tour', () => {
  /* Fizz (static render) has no error boundaries, so drive the same lifecycle
     by hand: a child throws, React calls getDerivedStateFromError then
     componentDidCatch, and the boundary shows nothing instead of propagating. */
  it('turns a render error in the tour itself into an empty render and one report', () => {
    const onError = vi.fn();
    const Thrower = () => { throw new Error('tour render failed'); };
    const child = createElement(Thrower);
    const boundary = new TourErrorBoundary({ onError, children: child });
    expect(boundary.render()).toBe(child);
    const error = new Error('tour render failed');
    boundary.state = { ...boundary.state, ...TourErrorBoundary.getDerivedStateFromError() };
    boundary.componentDidCatch(error);
    expect(boundary.render()).toBeNull();
    expect(onError).toHaveBeenCalledWith(error);
  });
});

describe('GuidedTour', () => {
  it('renders nothing without a document (static render), and calls nothing', () => {
    const onEnd = vi.fn();
    const html = renderToStaticMarkup(createElement(GuidedTour, {
      role: 'JOKE_MAKER', view: JokeMaker, config: CONFIG, roundActive: false, onEnd,
    }));
    expect(html).toBe('');
    expect(onEnd).not.toHaveBeenCalled();
  });
});
