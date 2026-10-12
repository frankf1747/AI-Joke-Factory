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
    expect(r1.steps.find(s => s.id === 'jm-shipping')!.body).toBe(
      'Each batch of 5 costs $2 to ship, so keep them coming but make them count.',
    );
    const r2 = tourPlan('JOKE_MAKER', { ...CONFIG, round: 2, shippingFeeSmall: 0.5 });
    expect(r2.steps.find(s => s.id === 'jm-shipping')!.body).toContain('You choose the size now: $0.50 for 1–4 jokes');
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
