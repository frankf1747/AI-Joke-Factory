import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LeanChartsPanel } from './LeanChartsPanel';
import { EMPTY_LEAN_CHARTS_STATE } from '../../services/useLeanCharts';
import { leanChartsFixture } from '../../services/leanCharts.testdata';

const render = (round: 1 | 2) =>
  renderToStaticMarkup(createElement(LeanChartsPanel, {
    round,
    r1: EMPTY_LEAN_CHARTS_STATE,
    r2: { ...EMPTY_LEAN_CHARTS_STATE, data: leanChartsFixture({ round_id: 8 }) },
    teamNames: { '2': 'Zebras' },
  }));

describe('LeanChartsPanel', () => {
  it('renders the control bar and the four cards in order', () => {
    const out = render(2);
    const titles = ['Lean charts', 'Where the money leaked', 'Jokes standing still', 'Smaller batches, faster feedback', 'More cycles, more learning'];
    const at = titles.map(t => out.indexOf(t));
    expect(at.every(i => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(out).toContain('All teams');
    expect(out).toContain('Zebras');
  });
  it('shows the most idle team by default in chart 2', () => {
    expect(render(2)).toContain('Showing Zebras — most idle jokes now');
  });
  it('has no round buttons of its own: the control bar picks the round', () => {
    const out = render(2);
    expect(out).not.toContain('aria-pressed');
    expect(out).not.toMatch(/>R[12]</);
  });
});
