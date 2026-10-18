import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextStepLine, NextStepLive } from './NextStep';

describe('NextStepLine', () => {
  it('labels the sentence "Next step" in a blue bar with an arrow', () => {
    const out = renderToStaticMarkup(createElement(NextStepLine, {
      step: { text: 'Keep writing — every batch is another chance to sell.', tone: 'info' },
    }));
    expect(out).toContain('Next step');
    expect(out).toContain('Keep writing — every batch is another chance to sell.');
    expect(out).toContain('bg-sky-50');
    expect(out).not.toContain('bg-amber-50');
    expect(out).toContain('<svg');
    expect(out).not.toContain('role="status"');
    expect(out).not.toContain('aria-live');
  });

  it('turns amber for a warning', () => {
    const out = renderToStaticMarkup(createElement(NextStepLine, {
      step: { text: 'No batch sent in 90 s — keep the line moving.', tone: 'warn' },
    }));
    expect(out).toContain('bg-amber-50');
    expect(out).not.toContain('bg-sky-50');
  });

  it('shows text as text, never as markup', () => {
    const out = renderToStaticMarkup(createElement(NextStepLine, {
      step: { text: 'Keep <b>writing</b> — every batch is another chance to sell.', tone: 'info' },
    }));
    expect(out).not.toContain('<b>writing</b>');
    expect(out).toContain('&lt;b&gt;writing&lt;/b&gt;');
  });
});

describe('NextStepLive', () => {
  it('asks for the sentence at the current time', () => {
    const asked: number[] = [];
    const before = Date.now();
    const out = renderToStaticMarkup(createElement(NextStepLive, {
      step: (now: number) => { asked.push(now); return { text: 'Desk is clear — nudge your Joke Maker to send the next batch.', tone: 'info' }; },
    }));
    expect(out).toContain('Desk is clear');
    expect(asked).toHaveLength(1);
    expect(asked[0]).toBeGreaterThanOrEqual(before);
  });
});
