import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Tutorial, { buildSteps } from './Tutorial';

/* The "How this works" modal is the instructor's alone now: students get the
   guided tour of their own screen (components/tour/GuidedTour.tsx). */
describe('Tutorial', () => {
  const html = renderToStaticMarkup(createElement(Tutorial, { onClose: () => {} }));

  it('shows the instructor steps', () => {
    expect(html).toContain('Instructor');
    expect(html).toContain('Set up the class');
    expect(html).toContain('Step 1 of 6');
  });

  it('follows the Setup, Teams, Live and Debrief tabs and drops the tuning knobs', () => {
    const copy = buildSteps().map(s => `${s.t} ${s.b}`).join(' ');
    for (const tab of ['Live', 'Teams', 'Setup', 'Debrief']) expect(copy).toContain(tab);
    for (const gone of ['τ', 'jitter', 'swap margin']) expect(copy).not.toContain(gone);
    // The ideal joke sits beside the settings at wide widths, so no "below".
    expect(copy).not.toContain('Below them');
  });

  it('keeps every step to the copy rules', () => {
    for (const s of buildSteps()) {
      expect(`${s.t} ${s.b}`).not.toMatch(/[—!]/);
    }
  });

  it('has no Joke Maker, Marketing or AI Customers tabs', () => {
    // The retired tabs' labels and taglines ("Joke Maker · Production", "Marketing ·
    // Curate & publish", "AI Customers · N automated buyers") and their first steps.
    for (const gone of ['Production', 'Curate &amp; publish', 'AI Customers', 'automated buyers', 'You run Production', 'You are Marketing']) {
      expect(html).not.toContain(gone);
    }
  });
});
