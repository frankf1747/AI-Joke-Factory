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
  const JM_KEY = ['Profit', 'Current Team Rank', 'Jokes Sold / Made', 'Created to Publish'];
  const MK_KEY = ['Profit', 'Current Team Rank', 'Jokes Sold / Made', 'Content Backlog'];

  it('Joke Maker: four key tiles in order, Batches and Content Waste folded', () => {
    const out = jm();
    expect(inOrder(labels(out, JM_KEY))).toBe(true);
    expect(out).not.toContain('Batches');
    expect(out).not.toContain('Content Waste');
    expect(out).not.toContain('text-xl');
  });
  it('Marketing: four key tiles in order, the rest folded', () => {
    const out = mk();
    expect(inOrder(labels(out, MK_KEY))).toBe(true);
    for (const l of ['Publish → first sale', 'Content Waste', 'Shipping fees', 'Storage fees', 'Hosting fees']) expect(out).not.toContain(l);
    expect(out).not.toContain('text-xl');
  });
  it('open (remembered): extra tiles appear; fee tiles only in Lean', () => {
    vi.stubGlobal('localStorage', { getItem: () => '1' });
    expect(jm()).toContain('Content Waste');
    expect(jm()).toContain('Batches');
    expect(mk()).toContain('Shipping fees');
    const std = mk({ ...TEST_CONFIG, marketMode: 'CLASSIC' });
    expect(std).toContain('Content Waste');
    expect(std).not.toContain('Shipping fees');
  });
});
