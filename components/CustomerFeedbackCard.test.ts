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
  it('offers Pop out on Marketing\'s own screen and shows the list inline', () => {
    const out = render();
    expect(out).toContain('Customer feedback');
    expect(out).toContain('Pop out');
    expect(out).toContain('aria-pressed="false"');
    expect(out).toContain('Corporate Comedy');
    expect(out).not.toContain('Showing in the floating window');
  });

  it('offers no pop-out in watch mode, even if asked to be popped', () => {
    for (const popped of [false, true]) {
      const out = render({ canPopOut: false, popped });
      expect(out).not.toContain('Pop out');
      expect(out).not.toContain('Bring back');
      expect(out).not.toContain('Showing in the floating window');
      expect(out).not.toContain('role="dialog"');
      expect(out).toContain('Corporate Comedy');
    }
  });

  it('while popped out, the card says so and offers Bring back; the list floats', () => {
    const out = render({ popped: true });
    expect(out).toContain('Showing in the floating window');
    expect(out).toContain('Bring back');
    expect(out).toContain('aria-pressed="true"');
    // No Document PiP under node, so the floating copy is the in-page panel.
    expect(out).toContain('role="dialog"');
    expect(out.split('Corporate Comedy')).toHaveLength(2);
  });

  it('shows the empty state when there is no feedback yet', () => {
    expect(render({ rows: [] })).toContain('No feedback yet — release jokes to start uncovering the target.');
  });
});
