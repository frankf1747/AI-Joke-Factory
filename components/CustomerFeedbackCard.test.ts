import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CustomerFeedbackCardView } from './CustomerFeedbackCard';
import type { FeedbackRow } from '../views/feedback';

const ROWS: FeedbackRow[] = [{
  joke_id: 9101, joke_title: 'Corporate Comedy', was_bought: true,
  good: [{ id: 'TOPIC', label: 'Topic' }], improve: [{ id: 'WORDPLAY', label: 'Wordplay' }],
}];

const render = (props: Partial<Parameters<typeof CustomerFeedbackCardView>[0]> = {}) =>
  renderToStaticMarkup(createElement(CustomerFeedbackCardView, {
    rows: ROWS, canPopOut: true, popped: false, onPopOut: () => {}, onBringBack: () => {}, ...props,
  }));

describe('CustomerFeedbackCardView', () => {
  it('offers a one-line Expand button on Marketing\'s own screen and shows the list inline', () => {
    const out = render();
    expect(out).toContain('Customer feedback');
    expect(out).toContain('Expand');
    expect(out).not.toContain('Pop out');
    expect(out).toContain('whitespace-nowrap');
    expect(out).toContain('Corporate Comedy');
    expect(out).not.toContain('Showing in the floating window');
    // The pattern summary lives in the floating window only.
    expect(out).not.toContain('Keep doing');
  });

  it('shows each joke as compact landed / missed lines', () => {
    const out = render();
    expect(out).toContain('Landed: ');
    expect(out).toContain('Needs work: ');
    expect(out).toContain('Topic');
    expect(out).toContain('Wordplay');
    expect(out).toContain('Sold');
  });

  it('offers no pop-out in watch mode, even if asked to be popped', () => {
    for (const popped of [false, true]) {
      const out = render({ canPopOut: false, popped });
      expect(out).not.toContain('Expand');
      expect(out).not.toContain('Bring back');
      expect(out).not.toContain('Showing in the floating window');
      expect(out).not.toContain('role="dialog"');
      expect(out).toContain('Corporate Comedy');
    }
  });

  it('while popped out, the card says so with exactly one Bring back; the window leads with the pattern', () => {
    const out = render({ popped: true });
    expect(out).toContain('Showing in the floating window');
    expect(out.split('Bring back')).toHaveLength(2);
    expect(out).not.toContain('Expand');
    expect(out).toContain('Keep doing');
    expect(out).toContain('Fix next');
    // No Document PiP under node, so the floating copy is the in-page panel.
    expect(out).toContain('role="dialog"');
    expect(out.split('Corporate Comedy')).toHaveLength(2);
  });

  it('shows the empty state when there is no feedback yet', () => {
    expect(render({ rows: [] })).toContain('No feedback yet — release jokes to start uncovering the target.');
  });
});
