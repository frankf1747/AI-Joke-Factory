import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StatTiles, readMoreOpen, writeMoreOpen } from './StatTiles';
import JokeMaker from '../views/JokeMaker';
import QualityControl from '../views/QualityControl';
import { renderWithGame, testUser, TEST_CONFIG } from '../views/testing/renderWithGame';
import { Role } from '../types';

const key = [<i key="a">KeyA</i>, <i key="b">KeyB</i>];
const more = [<i key="c">MoreC</i>];

afterEach(() => vi.unstubAllGlobals());

describe('StatTiles', () => {
  it('closed by default: key tiles, button "More numbers", folded tiles absent', () => {
    const out = renderToStaticMarkup(<StatTiles keyTiles={key} moreTiles={more} storageKey="jf_more_tiles_x" />);
    expect(out).toContain('KeyA');
    expect(out).not.toContain('MoreC');
    expect(out).toContain('More numbers');
    expect(out).toContain('aria-expanded="false"');
    expect(out).toContain('aria-controls=');
  });
  it('open: shows folded tiles and "Fewer numbers"', () => {
    const out = renderToStaticMarkup(<StatTiles keyTiles={key} moreTiles={more} storageKey="k" initialOpen />);
    expect(out).toContain('MoreC');
    expect(out).toContain('Fewer numbers');
    expect(out).toContain('aria-expanded="true"');
  });
  it('no button when there is nothing to fold', () => {
    const out = renderToStaticMarkup(<StatTiles keyTiles={key} moreTiles={[]} storageKey="k" />);
    expect(out).not.toContain('<button');
  });
  it('with no key tiles: no key grid, only the disclosure, and tourMore survives', () => {
    const out = renderToStaticMarkup(<StatTiles keyTiles={[]} moreTiles={more} storageKey="k" tourKey="x-key" tourMore="x-more" initialOpen />);
    expect(out).not.toContain('x-key');
    expect(out).toContain('data-tour="x-more"');
    expect(out).toContain('MoreC');
    expect(out).toContain('Fewer numbers');
  });
  it('reads the remembered choice from localStorage', () => {
    vi.stubGlobal('localStorage', { getItem: (k: string) => (k === 'k' ? '1' : null) });
    expect(readMoreOpen('k')).toBe(true);
    expect(renderToStaticMarkup(<StatTiles keyTiles={key} moreTiles={more} storageKey="k" />)).toContain('MoreC');
  });
  it('falls back to closed when storage throws', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
    expect(readMoreOpen('k')).toBe(false);
    expect(() => writeMoreOpen('k', true)).not.toThrow();
  });
});

const labels = (out: string, ls: string[]) => ls.map(l => out.indexOf(l));
const inOrder = (xs: number[]) => xs.every((x, i) => x >= 0 && (i === 0 || x > xs[i - 1]));

describe('student screens', () => {
  const jm = () => renderWithGame(JokeMaker, { user: testUser(Role.JOKE_MAKER) });
  const mk = (config = TEST_CONFIG) => renderWithGame(QualityControl, { user: testUser(Role.QUALITY_CONTROL), config });
  const scoreboardCopy = ['Team rank, by profit', 'Profit', 'Found a buyer', 'Sales'];

  it('Joke Maker: the Scoreboard replaces the key tiles; Fees and wait times replaces More numbers in Lean', () => {
    const out = jm();
    expect(out).toContain('data-tour="jm-stats"');
    expect(inOrder(labels(out, scoreboardCopy))).toBe(true);
    for (const gone of ['Current Team Rank', 'Jokes Sold / Made']) expect(out).not.toContain(gone);
    for (const folded of ['Batches', 'Created to Publish', 'Content Waste', 'Where your sales went']) expect(out).not.toContain(folded);
    expect(out).toContain('Fees and wait times');
    expect(out).not.toContain('More numbers');
    expect(out).not.toContain('text-xl" title');
  });
  it('Marketing: the Scoreboard replaces the key tiles; Fees and wait times is folded', () => {
    const out = mk();
    expect(out).toContain('data-tour="mk-stats"');
    expect(inOrder(labels(out, scoreboardCopy))).toBe(true);
    for (const gone of ['Current Team Rank', 'Jokes Sold / Made']) expect(out).not.toContain(gone);
    for (const l of ['Content Backlog', 'Created to Publish', 'Publish → first sale', 'Content Waste', 'Shipping fees', 'Storage fees', 'Hosting fees', 'Where your sales went']) expect(out).not.toContain(l);
    expect(out).toContain('Fees and wait times');
    expect(out).not.toContain('More numbers');
  });
  it('before the round starts the Scoreboard shows dashes on both screens', () => {
    for (const out of [jm(), mk()]) expect(out).toContain('>—<');
  });
  it('open (remembered), Lean: the charts, then the plain list of the other numbers; the fee and wait tiles are gone', () => {
    vi.stubGlobal('localStorage', { getItem: () => '1' });
    const j = jm();
    expect(j).toContain('Fees and wait times appear once the round starts.');
    expect(j).toContain('Content Waste');
    expect(j).toContain('Batches');
    expect(j).not.toContain('Created to Publish');
    const m = mk();
    expect(m).toContain('Content Backlog');
    expect(m).toContain('Content Waste');
    expect(m).toContain('data-tour="mk-more"');
    for (const gone of ['Created to Publish', 'Publish → first sale', 'Shipping fees', 'Storage fees', 'Hosting fees']) expect(m).not.toContain(gone);
  });
  it('open (remembered), Classic: today\'s More numbers tiles, unchanged', () => {
    vi.stubGlobal('localStorage', { getItem: () => '1' });
    const classic = { ...TEST_CONFIG, marketMode: 'CLASSIC' as const };
    const std = mk(classic);
    for (const l of ['Fewer numbers', 'Content Backlog', 'Created to Publish', 'Content Waste', 'data-tour="mk-more"']) expect(std).toContain(l);
    expect(std).not.toContain('Shipping fees');
    expect(std).not.toContain('Fees and wait times');
    const j = renderWithGame(JokeMaker, { user: testUser(Role.JOKE_MAKER), config: classic });
    for (const l of ['Fewer numbers', 'Batches', 'Created to Publish', 'Content Waste']) expect(j).toContain(l);
  });
});
