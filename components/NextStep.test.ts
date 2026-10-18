import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextStepLine, NextStepLive, didChange } from './NextStep';

describe('NextStepLine', () => {
  it('shows the "Next step" label and the sentence on one quiet row, with no background', () => {
    const out = renderToStaticMarkup(createElement(NextStepLine, {
      step: { text: 'Keep writing. Every batch is another chance to sell.', tone: 'info' },
    }));
    expect(out).toContain('Next step');
    expect(out).toContain('Keep writing. Every batch is another chance to sell.');
    expect(out).toContain('text-[color:var(--ink-3)]');
    expect(out).toContain('text-[color:var(--ink)]');
    expect(out).not.toContain('--warn');
    expect(out).not.toMatch(/\bbg-/);
    expect(out).not.toContain('border');
    expect(out).not.toContain('<svg');
    expect(out).not.toContain('role="status"');
    expect(out).not.toContain('aria-live');
  });

  it('turns the text --warn for a warning, still without a background', () => {
    const out = renderToStaticMarkup(createElement(NextStepLine, {
      step: { text: 'No batch sent in 90 s. Keep the line moving.', tone: 'warn' },
    }));
    expect(out).toContain('text-[color:var(--warn)]');
    expect(out).not.toMatch(/\bbg-/);
  });

  it('shows text as text, never as markup', () => {
    const out = renderToStaticMarkup(createElement(NextStepLine, {
      step: { text: 'Keep <b>writing</b>. Every batch is another chance to sell.', tone: 'info' },
    }));
    expect(out).not.toContain('<b>writing</b>');
    expect(out).toContain('&lt;b&gt;writing&lt;/b&gt;');
  });

  it('marks the row data-changed only when told the text just changed', () => {
    const step = { text: 'Keep writing.', tone: 'info' as const };
    expect(renderToStaticMarkup(createElement(NextStepLine, { step, changed: true }))).toContain('data-changed="true"');
    expect(renderToStaticMarkup(createElement(NextStepLine, { step }))).toContain('data-changed="false"');
  });
});

describe('didChange', () => {
  it('is false on the first sentence and for the same sentence again', () => {
    expect(didChange(null, 'Keep writing.')).toBe(false);
    expect(didChange('Keep writing.', 'Keep writing.')).toBe(false);
  });

  it('is true when the sentence is different', () => {
    expect(didChange('Keep writing.', 'No batch sent in 90 s. Keep the line moving.')).toBe(true);
  });

  it('ignores a ticking duration inside the same sentence', () => {
    expect(didChange('Batch waiting 52 s. Release what\'s good enough.', 'Batch waiting 53 s. Release what\'s good enough.')).toBe(false);
    expect(didChange('Batch waiting 59 s. Release.', 'Batch waiting 1 min. Release.')).toBe(false);
    expect(didChange('Batch waiting 1 min 12 s. Release.', 'Batch waiting 1 min 13 s. Release.')).toBe(false);
  });
});

describe('NextStepLive', () => {
  it('asks for the sentence at the current time, and does not flash on the first render', () => {
    const asked: number[] = [];
    const before = Date.now();
    const out = renderToStaticMarkup(createElement(NextStepLive, {
      step: (now: number) => { asked.push(now); return { text: 'Desk is clear. Nudge your Joke Maker to send the next batch.', tone: 'info' }; },
    }));
    expect(out).toContain('Desk is clear');
    expect(out).toContain('data-changed="false"');
    expect(asked).toHaveLength(1);
    expect(asked[0]).toBeGreaterThanOrEqual(before);
  });
});
