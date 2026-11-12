import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CompareTab, readFiles } from './CompareTab';
import { MAX_RECORD_BYTES } from '../../services/runRecord/parse';
import type { LoadedRun } from '../../services/runRecord/parse';
import { CRITERIA_KEY } from '../../services/runRecord/compare';
import { fixtureRecord, fixtureRound, fixtureTeam, listingPair } from '../../services/runRecord/compare.testdata';

const render = (initialRuns?: LoadedRun[]) => renderToStaticMarkup(createElement(CompareTab, { initialRuns }));
const loaded = (...records: ReturnType<typeof fixtureRecord>[]): LoadedRun[] =>
  records.map((record, i) => ({ fileName: `run-${i}.jfrun.json`, record }));
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('CompareTab', () => {
  it('with no runs shows the title, the file control and the empty state', () => {
    const html = render();
    expect(html).toContain('Compare runs');
    expect(html).toContain('Load saved run records to compare settings and results side by side.');
    expect(html).toContain('Add record files');
    expect(html).toContain('or drop files here');
    expect(html).toMatch(/<input[^>]*type="file"[^>]*accept=".json,.jfrun.json,application\/json"[^>]*multiple/);
    expect(text(html)).toContain('No runs loaded yet. Save a record from Debrief after a class, then add it here.');
    expect(html).not.toContain('Add one more run to compare.');
  });

  it('with two runs shows both names, the differing setting before the fold, and the measures', () => {
    const html = render(loaded(...listingPair()));
    expect(html).toContain('Compare runs');
    expect(html).toContain('Run A');
    expect(html).toContain('Run B');
    expect(html).toContain('Students · 2026-11-20 · 2 teams');
    expect(html).toContain('Remove');
    const listing = html.indexOf('Round 1 · Listing');
    const fold = html.indexOf('Same in every run');
    expect(listing).toBeGreaterThan(-1);
    expect(fold).toBeGreaterThan(listing);
    expect(html).toMatch(/<summary[^>]*>Same in every run \(\d+\)<\/summary>/);
    expect(html).toContain('var(--gold-tint)');
    expect(html).toContain('Mean profit per team');
    expect(html).toContain('Higher is better');
    expect(html).toContain('placeholder="Target"');
    expect(html).toContain('Save comparison (CSV)');
    expect(html).toContain('Sold share by batch');
    expect(html).not.toContain('No runs loaded yet.');
    expect(html).not.toContain('Add one more run to compare.');
  });

  it('with one run asks for another', () => {
    const html = render(loaded(fixtureRecord('Only run')));
    expect(html).toContain('Only run');
    expect(html).toContain('Add one more run to compare.');
  });

  it('lists each run’s teams behind a Teams disclosure', () => {
    const html = render(loaded(...listingPair()));
    expect(html).toMatch(/<summary[^>]*>Teams<\/summary>/);
    expect(html).toContain('Team 2');
  });

  it('shows the bots row and Fit by batch only when every run has fit data', () => {
    expect(render(loaded(...listingPair()))).not.toContain('Fit by batch');
    const withFit = fixtureRecord('Bots', {
      played_by: 'bots',
      rounds: [fixtureRecord('x').rounds[0], {
        ...fixtureRecord('x').rounds[1],
        teams: fixtureRecord('x').rounds[1].teams.map(t => ({ ...t, fit_by_batch: [{ seq: 1, fit: 3 }, { seq: 2, fit: 5 }] })),
      }],
    });
    const html = render(loaded(withFit, { ...withFit, name: 'Bots 2', exported_at: '2026-11-22T00:00:00Z' }));
    expect(html).toContain('Fit by batch');
    expect(html).toContain('Fit, first → last Round 2 batch');
  });
});

describe('CompareTab, the instructor\'s criteria', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('marks the best run and each target met on a used row, and sums targets per run', () => {
    const saved = { 'mean_profit:1': { use: true, better: 'higher', target: 2 } };
    vi.stubGlobal('window', { localStorage: { getItem: (k: string) => (k === CRITERIA_KEY ? JSON.stringify(saved) : null), setItem: () => {} } });
    const strong = fixtureRecord('Run B', {
      exported_at: '2026-11-21T12:00:00Z',
      rounds: [fixtureRound(1, { teams: [fixtureTeam(1, { profit: 3 }), fixtureTeam(2, { profit: 4 })] }), fixtureRound(2)],
    });
    const out = text(render(loaded(fixtureRecord('Run A'), strong)));
    expect(out).toContain('$3.50 Best · ✓ target');
    expect(out).toContain('Run A : 0 of 1 targets met');
    expect(out).toContain('Run B : 1 of 1 targets met');
  });

  it('shows no marks or summary when nothing is used', () => {
    const out = render(loaded(...listingPair()));
    expect(out).not.toContain('Best');
    expect(out).not.toContain('targets met');
  });
});

describe('readFiles', () => {
  const fake = (name: string, size: number, text: () => Promise<string>) => ({ name, size, text }) as unknown as File;

  it('refuses a file over 5 MB without reading it', async () => {
    const text = vi.fn(async () => '{}');
    const res = await readFiles([fake('big.jfrun.json', MAX_RECORD_BYTES + 1, text)]);
    expect(res).toEqual({ readable: [], unreadable: [{ fileName: 'big.jfrun.json', reason: 'is larger than 5 MB' }] });
    expect(text).not.toHaveBeenCalled();
  });

  it('reads a file within the limit and refuses one that cannot be read', async () => {
    const res = await readFiles([
      fake('ok.jfrun.json', 2, async () => '{}'),
      fake('bad.jfrun.json', 2, async () => { throw new Error('nope'); }),
    ]);
    expect(res).toEqual({
      readable: [{ fileName: 'ok.jfrun.json', text: '{}' }],
      unreadable: [{ fileName: 'bad.jfrun.json', reason: 'could not be read' }],
    });
  });
});
