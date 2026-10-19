import { describe, expect, it } from 'vitest';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WasteBreakdownChart } from './WasteBreakdownChart';
import { IdleRows } from './IdleRows';
import { BatchFeedbackChart } from './BatchFeedbackChart';
import { LearningCyclesChart } from './LearningCyclesChart';
import { batchScatter, cyclesForInstructor } from '../../services/leanCharts';
import { leanChartsFixture } from '../../services/leanCharts.testdata';

const html = (el: ReactElement) => renderToStaticMarkup(el);
const res = leanChartsFixture();

describe('chart 1, Where the money leaked', () => {
  it('shows its title, subtitle, legend and the empty state', () => {
    const out = html(createElement(WasteBreakdownChart, { data: null, teamNames: {} }));
    expect(out).toContain('Where the money leaked');
    expect(out).toContain('Fees per team, most first. Shorter is leaner.');
    for (const label of [
      'Shipping', 'Storage, waiting on Marketing', 'Hosting, unsold on the market', 'Listing fees, never sold', 'Discards',
    ]) {
      expect(out).toContain(label);
    }
    expect(out).toContain('No batches sent yet');
  });
  it('draws one bar per team, most fees first, in the chart tokens', () => {
    const out = html(createElement(WasteBreakdownChart, { data: res, teamNames: {} }));
    expect(out).not.toContain('No batches sent yet');
    expect(out.indexOf('title="Team 2: Shipping $8.00"')).toBeLessThan(out.indexOf('title="Team 1: Shipping $4.00"'));
    expect(out).toContain('background:var(--chart-shipping)');
    expect(out).toContain('$13.00');
  });
  it('says when the data is unavailable', () => {
    const out = html(createElement(WasteBreakdownChart, { data: res, teamNames: {}, unavailable: true }));
    expect(out).toContain('Chart data unavailable, retrying.');
  });
});

describe('chart 2, Jokes standing still', () => {
  it('shows its title, subtitle, legend and the empty state before any sample', () => {
    const out = html(createElement(IdleRows, { data: null, teamNames: {} }));
    expect(out).toContain('Jokes standing still');
    expect(out).toContain('Every team, biggest pile first. Click a team for its full chart.');
    for (const label of ['Waiting on Marketing', 'Unsold on the market', 'Class average']) expect(out).toContain(label);
    expect(out).toContain('No batches sent yet');
  });
  it('ranks the teams, marks a count above the class average and states each peak on hover', () => {
    const out = html(createElement(IdleRows, { data: res, teamNames: { '2': 'Zebras' } }));
    const names = [...out.matchAll(/font-semibold" style="color:var\(--ink\)" title="([^"]+)"/g)].map(m => m[1]);
    expect(names).toEqual(['Zebras', 'Team 1', 'Team 3']);
    expect(out).toMatch(/color:var\(--warn\)">6</);
    expect(out).toContain('<title>Zebras: peak 6 jokes at 2 min</title>');
    expect(out).toContain('<title>Team 3: nothing standing still yet</title>');
    // Light stacked areas, no dark stroke; the class average dashed.
    expect(out).toContain('fill="var(--chart-storage)" opacity="0.45"');
    expect(out).toContain('stroke-dasharray="3 2"');
    expect(out).not.toContain('<select');
  });
  it('keeps rows about 26 px tall (twenty teams fit) and links each row to its region', () => {
    const out = html(createElement(IdleRows, { data: res, teamNames: {} }));
    expect(out).toMatch(/<svg viewBox="0 0 150 20"[^>]*height="20"/);
    const controls = [...out.matchAll(/aria-controls="([^"]+)"/g)].map(m => m[1]);
    expect(controls).toHaveLength(3);
    for (const id of controls) expect(out).toContain(`id="${id}"`);
  });
});

describe('chart 3, Smaller batches, faster feedback', () => {
  it('shows its title, subtitle, legend and the empty state', () => {
    const out = html(createElement(BatchFeedbackChart, { scatter: batchScatter({ 1: null, 2: null }, null) }));
    expect(out).toContain('Smaller batches, faster feedback');
    expect(out).toContain('Batch size against minutes to its first sale. Hollow: no sale yet.');
    expect(out).toContain('Round 1');
    expect(out).toContain('Round 2');
    expect(out).toContain('No batches sent yet');
  });
  it('draws a chart when there are batches', () => {
    const out = html(createElement(BatchFeedbackChart, { scatter: batchScatter({ 1: res, 2: null }, null) }));
    expect(out).toContain('recharts-responsive-container');
  });
});

describe('chart 4, More cycles, more learning', () => {
  it('shows its title, subtitle and why it is empty', () => {
    const out = html(createElement(LearningCyclesChart, { model: cyclesForInstructor(null, null, null) }));
    expect(out).toContain('More cycles, more learning');
    expect(out).toContain('Share of released jokes that sold, across the class.');
    expect(out).toContain('No batches sent yet');
  });
  it('lists one line per round in the legend and explains the hollow dots', () => {
    const out = html(createElement(LearningCyclesChart, { model: cyclesForInstructor(res, null, null) }));
    expect(out).toContain('>Round 1</span>');
    expect(out).toContain('Hollow dots: sent too late to judge yet.');
    expect(out).toContain('recharts-responsive-container');
  });
});
