import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CustomerFeedbackCardView, WhatCustomersJudge } from './CustomerFeedbackCard';
import { DIMENSIONS } from '../config/dimensions';
import type { FeedbackRow } from '../views/feedback';

const ROWS: FeedbackRow[] = [{
  joke_id: 9101, joke_title: 'Corporate Comedy', was_bought: true,
  good: [{ id: 'TOPIC', label: 'Topic' }], improve: [{ id: 'WORDPLAY', label: 'Wordplay' }],
}, {
  joke_id: 9100, joke_title: 'Standup Sprawl', was_bought: false,
  good: [{ id: 'CLARITY', label: 'Clarity' }], improve: [{ id: 'ENERGY', label: 'Energy' }],
}];

const render = (props: Partial<Parameters<typeof CustomerFeedbackCardView>[0]> = {}) =>
  renderToStaticMarkup(createElement(CustomerFeedbackCardView, {
    rows: ROWS, canPopOut: true, popped: false, onPopOut: () => {}, onBringBack: () => {}, ...props,
  }));

describe('CustomerFeedbackCardView', () => {
  it('offers a Pop out button on Marketing\'s own screen and shows the list inline', () => {
    const out = render();
    expect(out).toContain('Customer feedback');
    expect(out).toContain('Pop out');
    expect(out).not.toContain('Expand');
    expect(out).toContain('data-tour="mk-feedback"');
    expect(out).toContain('data-tour="mk-expand"');
    expect(out).toContain('title="Open the feedback in a floating window that stays on top"');
    expect(out).toContain('Corporate Comedy');
    expect(out).not.toContain('Showing in the floating window');
    // The pattern summary lives in the floating window only.
    expect(out).not.toContain('Keep doing');
  });

  it('counts the released jokes in the subtitle', () => {
    expect(render()).toContain('Your latest 2 released jokes. Customers say what landed and what missed, never by how much.');
    expect(render({ rows: ROWS.slice(0, 1) })).toContain('Your latest 1 released joke. Customers say');
    expect(render({ rows: ROWS.slice(0, 1) })).not.toContain('1 released jokes');
  });

  it('tags each joke by whether it has a buyer right now', () => {
    const out = render();
    expect(out).toContain('Has a buyer');
    expect(out).toContain('No buyer now');
    expect(out).not.toContain('Not sold yet');
    expect(out).not.toMatch(/>Sold</);
  });

  it('shows each joke as Landed and Missed chips, one box per criterion', () => {
    const out = render();
    expect(out).toContain('Landed');
    expect(out).toContain('Missed');
    for (const label of ['Topic', 'Wordplay', 'Clarity', 'Energy']) {
      expect(out).toMatch(new RegExp(`<li[^>]*>${label}</li>`));
    }
    expect(out).not.toContain('Topic, ');
    expect(out).not.toContain('×');
    expect(out).not.toContain('Needs work');
  });

  it('says so when a joke has no customer read yet', () => {
    const out = render({ rows: [{ joke_id: 1, joke_title: '', was_bought: false, good: [], improve: [] }] });
    expect(out).toContain('Untitled joke');
    expect(out).toContain('No customer read on this one yet.');
  });

  it('offers no pop-out in watch mode, even if asked to be popped', () => {
    for (const popped of [false, true]) {
      const out = render({ canPopOut: false, popped });
      expect(out).not.toContain('Pop out');
      expect(out).not.toContain('data-tour="mk-expand"');
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
    expect(out).not.toContain('data-tour="mk-expand"');
    expect(out).toContain('Keep doing');
    expect(out).toContain('Fix next');
    // No Document PiP under node, so the floating copy is the in-page panel.
    expect(out).toContain('role="dialog"');
    expect(out.split('Corporate Comedy')).toHaveLength(2);
  });

  it('shows the empty state when there is no feedback yet', () => {
    const out = render({ rows: [] });
    expect(out).toContain('No feedback yet. Release jokes to start uncovering the target.');
    expect(out).not.toContain('—');
  });
});

describe('WhatCustomersJudge', () => {
  const html = () => renderToStaticMarkup(createElement(WhatCustomersJudge));

  it('lists the 11 matched criteria, then Title Fit set apart', () => {
    const out = html();
    expect(out).toContain('What customers judge');
    expect(out).toContain('12 criteria. Pop out the feedback to see which ones keep landing or missing.');
    for (const d of DIMENSIONS.filter(x => x.hasIdeal)) expect(out).toContain(`>${d.label}</li>`);
    expect(out.match(/<li/g)).toHaveLength(12);
    const titleFit = out.indexOf('Title Fit');
    expect(titleFit).toBeGreaterThan(out.indexOf('Energy'));
    expect(out).toContain('set by the title you write');
  });

  it('carries no tallies', () => {
    expect(html()).not.toContain('×');
  });
});
