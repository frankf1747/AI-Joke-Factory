import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const html = readFileSync('index.html', 'utf8');
const css = readFileSync('index.css', 'utf8');

const tokens: Record<string, string> = {
  '--paper': '#f5f3ee',
  '--paper-2': '#ece8df',
  '--sheet': '#fffefb',
  '--rule': '#e2ddd2',
  '--rule-2': '#d3ccbe',
  '--ink': '#14202b',
  '--ink-2': '#44505c',
  '--ink-3': '#7a828a',
  '--ink-4': '#a7aaa8',
  '--navy': '#003b5c',
  '--navy-tint': '#e8eef2',
  '--gold': '#ffd100',
  '--gold-2': '#f2c500',
  '--gold-tint': '#ffeb99',
  '--selling': '#2e7d52',
  '--selling-bg': '#eaf2ec',
  '--waiting': '#8a6400',
  '--waiting-dot': '#d9a92b',
  '--waiting-bg': '#f9f1dc',
  '--warn': '#9a3b1c',
  '--warn-bg': '#f6e3da',
  '--chart-shipping': '#c4553a',
  '--chart-storage': '#3f7cc0',
  '--chart-hosting': '#d9a92b',
  '--chart-never-sold': '#7a4f9a',
  '--chart-discards': '#bdb7ab',
  '--chart-round-1': '#a7aaa8',
  '--r-3': '12px',
};

describe('design tokens and fonts', () => {
  it('requests every font family from Google Fonts', () => {
    for (const family of ['IBM+Plex+Sans', 'IBM+Plex+Mono', 'Lora', 'Instrument+Sans']) {
      expect(html).toContain(family);
    }
  });

  it.each(Object.entries(tokens))('defines %s as %s', (name, value) => {
    expect(css).toMatch(new RegExp(`${name}:\\s*${value}\\b`, 'i'));
  });

  it('points Round 2 at the navy token', () => {
    expect(css).toMatch(/--chart-round-2:\s*var\(--navy\)/);
  });

  it('sets the body on paper and ink with Plex Sans', () => {
    expect(css).toMatch(/body\s*\{[^}]*background:\s*var\(--paper\)/);
    expect(css).toMatch(/body\s*\{[^}]*color:\s*var\(--ink\)/);
    expect(css).toMatch(/body\s*\{[^}]*font-family:\s*'IBM Plex Sans'/);
  });

  it('sets .joke-font to Lora', () => {
    expect(css).toMatch(/\.joke-font\s*\{[^}]*'Lora'/);
  });

  it('defines the flip-card and rank-up blocks only once', () => {
    expect(css.match(/^\.flip-card-inner \{/gm)).toHaveLength(1);
    expect(css.match(/^\.jf-leaderboard-rankup \{/gm)).toHaveLength(1);
    expect(css.match(/^@keyframes jf-rank-up-flash/gm)).toHaveLength(1);
  });
});
