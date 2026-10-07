import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StudentLeanCharts } from './StudentLeanCharts';

describe('StudentLeanCharts', () => {
  it('shows charts 2 and 4 only — never the instructor charts', () => {
    // Effects do not run in a static render, so nothing is fetched.
    const out = renderToStaticMarkup(createElement(StudentLeanCharts, { roundId: 7, teamId: 3, roundNumber: 1, live: true }));
    expect(out).toContain('Jokes standing still');
    expect(out).toContain('More cycles, more learning');
    expect(out).toContain('Your batches · Round 1');
    expect(out).toContain('Class average');
    expect(out).not.toContain('Where the money leaked');
    expect(out).not.toContain('Smaller batches, faster feedback');
    expect(out).toContain('No batches sent yet');
  });
});
