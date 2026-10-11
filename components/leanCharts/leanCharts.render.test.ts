import { describe, expect, it } from 'vitest';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WasteBreakdownChart } from './WasteBreakdownChart';
import { IdleJokesChart } from './IdleJokesChart';
import { BatchFeedbackChart } from './BatchFeedbackChart';
import { LearningCyclesChart } from './LearningCyclesChart';
import { batchScatter, cyclesForInstructor } from '../../services/leanCharts';
import { leanChartsFixture } from '../../services/leanCharts.testdata';

const html = (el: ReactElement) => renderToStaticMarkup(el);
const res = leanChartsFixture();

describe('chart 1 — Where the money leaked', () => {
  it('shows its title, subtitle, legend and the empty state', () => {
    const out = html(createElement(WasteBreakdownChart, { data: null, teamNames: {} }));
    expect(out).toContain('Where the money leaked');
    expect(out).toContain('Cost of waste per team, by kind. Shorter bars = leaner.');
    for (const label of [
      'Shipping', 'Storage (waiting on Marketing&#x27;s desk)', 'Hosting (unsold on the shelf)',
      'Listing fees on never-sold jokes', 'Discards',
    ]) {
      expect(out).toContain(label);
    }
    for (const old of ['>Setup<', 'Waiting at Marketing', 'Unsold on shelf', 'Published, never sold']) {
      expect(out).not.toContain(old);
    }
    expect(out).toContain('No batches sent yet');
  });
  it('draws a chart when there is waste', () => {
    const out = html(createElement(WasteBreakdownChart, { data: res, teamNames: {} }));
    expect(out).toContain('recharts-responsive-container');
    expect(out).not.toContain('No batches sent yet');
  });
  it('says when the data is unavailable', () => {
    const out = html(createElement(WasteBreakdownChart, { data: res, teamNames: {}, unavailable: true }));
    expect(out).toContain('Chart data unavailable — retrying');
  });
});

describe('chart 2 — Jokes standing still', () => {
  it('states the WIP limit in the subtitle and the empty state before any batch', () => {
    const out = html(createElement(IdleJokesChart, { team: null, classAverage: null, wipLimit: 2 }));
    expect(out).toContain('Jokes standing still');
    expect(out).toContain('Jokes waiting for Marketing or unsold on the shelf. A growing pile is waste. WIP limit: 2 batches');
    expect(out).toContain('Class average');
    expect(out).toContain('No batches sent yet');
  });
  it('names the team it shows', () => {
    const out = html(createElement(IdleJokesChart, {
      team: res.teams[1], classAverage: res.class_average, wipLimit: 0, teamLabel: 'Team 2 — most idle jokes now',
    }));
    expect(out).toContain('Showing Team 2 — most idle jokes now');
    expect(out).not.toContain('WIP limit');
    expect(out).toContain('recharts-responsive-container');
  });
});

describe('chart 3 — Smaller batches, faster feedback', () => {
  it('shows its title, subtitle, legend and the empty state', () => {
    const out = html(createElement(BatchFeedbackChart, { scatter: batchScatter({ 1: null, 2: null }, null) }));
    expect(out).toContain('Smaller batches, faster feedback');
    expect(out).toContain('Each dot is a batch. Lower = the market answered sooner.');
    expect(out).toContain('Round 1');
    expect(out).toContain('Round 2');
    expect(out).toContain('No sale yet (hollow)');
    expect(out).toContain('No batches sent yet');
  });
  it('draws a chart when there are batches', () => {
    const out = html(createElement(BatchFeedbackChart, { scatter: batchScatter({ 1: res, 2: null }, null) }));
    expect(out).toContain('recharts-responsive-container');
  });
});

describe('chart 4 — More cycles, more learning', () => {
  it('shows its title, subtitle and why it is empty', () => {
    const out = html(createElement(LearningCyclesChart, { model: cyclesForInstructor(null, null, null) }));
    expect(out).toContain('More cycles, more learning');
    expect(out).toContain('Each dot is a batch: how much of it sold. More dots = more chances to adjust.');
    expect(out).toContain('No batches sent yet');
  });
  it('lists its series in the legend', () => {
    const out = html(createElement(LearningCyclesChart, { model: cyclesForInstructor(res, null, null) }));
    expect(out).toContain('Round 1 · class');
    expect(out).toContain('recharts-responsive-container');
  });
  it('explains the hollow "too recent to judge" dots', () => {
    const out = html(createElement(LearningCyclesChart, { model: cyclesForInstructor(res, null, null) }));
    expect(out).toContain('Too recent to judge (hollow)');
    expect(out).toContain('Hollow dots: sent too late to judge yet.');
  });
});
