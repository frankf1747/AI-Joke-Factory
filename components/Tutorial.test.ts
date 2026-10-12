import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Tutorial from './Tutorial';

/* The "How this works" modal is the instructor's alone now: students get the
   guided tour of their own screen (components/tour/GuidedTour.tsx). */
describe('Tutorial', () => {
  const html = renderToStaticMarkup(createElement(Tutorial, { onClose: () => {} }));

  it('shows the instructor steps', () => {
    expect(html).toContain('Instructor');
    expect(html).toContain('Build the room');
    expect(html).toContain('Step 1 of 5');
  });

  it('has no Joke Maker, Marketing or AI Customers tabs', () => {
    // The retired tabs' labels and taglines ("Joke Maker · Production", "Marketing ·
    // Curate & publish", "AI Customers · N automated buyers") and their first steps.
    for (const gone of ['Production', 'Curate &amp; publish', 'AI Customers', 'automated buyers', 'You run Production', 'You are Marketing']) {
      expect(html).not.toContain(gone);
    }
  });
});
