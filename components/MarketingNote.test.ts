import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BatchCard } from '../views/JokeMaker';
import { marketingNoteOf } from './MarketingNote';
import type { Batch } from '../types';

/* The Joke Maker's Value stream row (views/JokeMaker.tsx BatchCard), rendered
   statically: the speech-bubble icon and the "From Marketing" callout appear
   only for a batch that has a note, and the note is shown as text. */

function batch(over: Partial<Batch> = {}): Batch {
  return {
    batch_id: 41, round_id: 1, team_id: 3, status: 'PROCESSED',
    jokes: [{ joke_id: 1, joke_text: 'Why did the intern cross the road?', id: '1', content: 'x', is_published: true, sold_count: 0 } as Batch['jokes'][number]],
    id: '41', team: '3', round: 1,
    ...over,
  };
}

const render = (b: Batch, open: boolean) =>
  renderToStaticMarkup(createElement(BatchCard, { batch: b, open, onToggle: () => {} }));

describe('BatchCard and Marketing notes', () => {
  it('a batch without a note shows neither the icon nor the callout — absent, null or blank alike', () => {
    const plain = render(batch(), true);
    for (const marketing_note of [undefined, null, '', '   \n ']) {
      const out = render(batch({ marketing_note }), true);
      expect(out).toBe(plain);
      expect(out).not.toContain('Marketing left a note');
      expect(out).not.toContain('From Marketing');
      expect(render(batch({ marketing_note }), false)).not.toContain('Marketing left a note');
    }
  });

  it('a collapsed batch with a note shows the icon with its tooltip, but not the note', () => {
    const out = render(batch({ marketing_note: 'More puns, please.' }), false);
    expect(out).toContain('title="Marketing left a note"');
    expect(out).toContain('aria-label="Marketing left a note"');
    expect(out).not.toContain('From Marketing');
    expect(out).not.toContain('More puns, please.');
  });

  it('an expanded batch with a note shows the callout above the jokes', () => {
    const out = render(batch({ marketing_note: 'More puns, please.' }), true);
    expect(out).toContain('From Marketing');
    expect(out).toContain('More puns, please.');
    expect(out.indexOf('From Marketing')).toBeLessThan(out.indexOf('Why did the intern cross the road?'));
    expect(out).toContain('#7c3aed');
  });

  it('shows markup in a note as text, never as HTML', () => {
    const out = render(batch({ marketing_note: '<img src=x onerror="alert(1)"><script>alert(2)</script>' }), true);
    expect(out).not.toContain('<img');
    expect(out).not.toContain('<script');
    expect(out).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&lt;script&gt;');
  });

  it('keeps line breaks and wraps a long unbroken word inside the card', () => {
    const word = 'a'.repeat(500);
    const out = render(batch({ marketing_note: `Line one\nLine two\n${word}` }), true);
    expect(out).toContain('white-space:pre-wrap');
    expect(out).toContain('overflow-wrap:anywhere');
    expect(out).toContain(`Line one\nLine two\n${word}`);
  });
});

describe('marketingNoteOf', () => {
  it('returns the note, or null for absent, null and blank', () => {
    expect(marketingNoteOf({ marketing_note: 'Keep it short' })).toBe('Keep it short');
    expect(marketingNoteOf({ marketing_note: '  padded  ' })).toBe('  padded  ');
    expect(marketingNoteOf({})).toBeNull();
    expect(marketingNoteOf({ marketing_note: null })).toBeNull();
    expect(marketingNoteOf({ marketing_note: ' \n\t' })).toBeNull();
  });
});
