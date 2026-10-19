import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LeanChartsPanel } from './LeanChartsPanel';
import { EMPTY_LEAN_CHARTS_STATE } from '../../services/useLeanCharts';
import { leanChartsFixture } from '../../services/leanCharts.testdata';

const R1_NOTE = 'Round 1 batches are all 5 jokes. Round 2 lets teams pick 1 to 10.';

const render = (over: { lean?: boolean; round?: 1 | 2; withR2?: boolean } = {}) =>
  renderToStaticMarkup(createElement(LeanChartsPanel, {
    lean: over.lean ?? true,
    round: over.round ?? 1,
    r1: { ...EMPTY_LEAN_CHARTS_STATE, data: leanChartsFixture({ round_id: 7 }) },
    r2: over.withR2 ? { ...EMPTY_LEAN_CHARTS_STATE, data: leanChartsFixture({ round_id: 8 }) } : EMPTY_LEAN_CHARTS_STATE,
    teamNames: { '2': 'Zebras' },
  }));

describe('LeanChartsPanel', () => {
  it('renders the four cards in order', () => {
    const out = render();
    const titles = ['Where the money leaked', 'Jokes standing still', 'Smaller batches, faster feedback', 'More cycles, more learning'];
    const at = titles.map(t => out.indexOf(t));
    expect(at.every(i => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it('shows jokes standing still as one row per team, with no team dropdown', () => {
    const out = render();
    expect(out).toContain('Right now');
    expect(out).toContain('Over the round');
    expect(out.match(/aria-expanded="false"/g)).toHaveLength(3);
    expect(out).toContain('Zebras');
    expect(out).not.toContain('<select');
  });

  it('has no round buttons of its own: the control bar picks the round', () => {
    const out = render();
    expect(out).not.toContain('aria-pressed');
    expect(out).not.toMatch(/>R[12]</);
  });

  it('shows only a notice in a Classic round', () => {
    const out = render({ lean: false });
    expect(out).toContain('Lean charts appear in Lean rounds.');
    expect(out).not.toContain('Jokes standing still');
    expect(out).not.toContain('Where the money leaked');
  });

  it('notes the Round 1 batch size on the batches chart until Round 2 data exists', () => {
    expect(render()).toContain(R1_NOTE);
    expect(render({ round: 2, withR2: true })).not.toContain(R1_NOTE);
  });
});
