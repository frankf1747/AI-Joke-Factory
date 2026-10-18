import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Card } from './ui';

describe('Card (quiet sheet frame)', () => {
  const out = renderToStaticMarkup(
    <Card title="Production line" subtitle="Write a batch" accent="#ff0000" tour="x" action={<b>Act</b>}>
      <i>Body</i>
    </Card>,
  );

  it('renders title, subtitle, action, body and the tour id', () => {
    for (const s of ['Production line', 'Write a batch', 'Act', 'Body', 'data-tour="x"']) expect(out).toContain(s);
  });

  it('uses the sheet frame: sheet background, rule border, --r-3 radius, no shadow', () => {
    expect(out).toContain('var(--sheet)');
    expect(out).toContain('var(--rule)');
    expect(out).toContain('var(--r-3)');
    expect(out).not.toContain('shadow');
  });

  it('has no grey header band, no divider and no edge accent, even when accent is passed', () => {
    expect(out).not.toContain('bg-gray-50');
    expect(out).not.toContain('border-b');
    expect(out).not.toContain('border-top');
    expect(out).not.toContain('#ff0000');
  });

  it('sets the border in its own inline style so stray width classes cannot thicken one edge', () => {
    expect(out).toContain('border:1px solid var(--rule)');
  });

  it('renders no empty heading when only an action is passed', () => {
    const o = renderToStaticMarkup(<Card action={<b>Act</b>}>x</Card>);
    expect(o).toContain('Act');
    expect(o).not.toContain('<h2');
  });
});
