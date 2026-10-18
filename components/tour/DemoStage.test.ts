import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DemoStage } from './DemoStage';
import JokeMaker from '../../views/JokeMaker';
import QualityControl from '../../views/QualityControl';
import { StatTiles } from '../StatTiles';
import {
  DEMO_JOKES, DEMO_NOTE, DEMO_RAW_BATCH, demoFrame, type DemoOptions, type TourMoney,
} from '../../services/tour/demoScript';
import { stepsFor } from '../../services/tour/tourSteps';
import { stepDuration } from '../../services/tour/tourMachine';
import type { TourRole } from '../../services/tour/seen';

/* The guided tour spotlights real elements by their data-tour id. Rendered
   statically here — every step of both tours, in Round 1 and Round 2, at the
   start and at the end of the step — each step's target must be on the demo
   screen, so no step ever falls back to a centred card in a real class. */

const FEES: TourMoney = {
  marketPrice: 1, costOfPublishing: 0.1, costOfDiscard: 0.01,
  shippingFeeSmall: 1, shippingFeeStandard: 2, shippingFeeLarge: 3,
  storageFeePerJokeMinute: 0.05, hostingFeePerJokeMinute: 0.05,
};
const VIEW = { JOKE_MAKER: JokeMaker, QUALITY_CONTROL: QualityControl } as const;
const ROLES: TourRole[] = ['JOKE_MAKER', 'QUALITY_CONTROL'];
const opts = (role: TourRole, roundNumber: 1 | 2 = 1): DemoOptions => ({ role, roundNumber, fees: FEES });

const stepsOf = (o: DemoOptions) => stepsFor(o.role, o);
const render = (o: DemoOptions, k: number, elapsedMs: number, reducedMotion = false) =>
  renderToStaticMarkup(createElement(DemoStage, {
    view: VIEW[o.role], frame: demoFrame(stepsOf(o), k, o, elapsedMs, reducedMotion),
  }));
const renderStep = (o: DemoOptions, id: string, elapsedMs = 0, reducedMotion = false) =>
  render(o, stepsOf(o).findIndex(s => s.id === id), elapsedMs, reducedMotion);
const has = (html: string, id: string) => html.includes(`data-tour="${id}"`);

class SpyStorage {
  map = new Map<string, string>();
  writes: string[] = [];
  get length() { return this.map.size; }
  key(i: number) { return Array.from(this.map.keys())[i] ?? null; }
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  setItem(k: string, v: string) { this.writes.push(`set ${k}`); this.map.set(k, String(v)); }
  removeItem(k: string) { this.writes.push(`remove ${k}`); this.map.delete(k); }
  clear() { this.writes.push('clear'); this.map.clear(); }
}

const realFetch = globalThis.fetch;
let fetchSpy: ReturnType<typeof vi.fn>;
let storage: SpyStorage;
beforeEach(() => {
  fetchSpy = vi.fn(async () => { throw new Error('network call from the demo'); });
  globalThis.fetch = fetchSpy as unknown as typeof fetch;
  storage = new SpyStorage();
  (globalThis as any).localStorage = storage;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  delete (globalThis as any).localStorage;
});

describe('every step target is on the demo screen', () => {
  for (const roundNumber of [1, 2] as const) {
    for (const role of ROLES) {
      const o = opts(role, roundNumber);
      for (const [k, step] of stepsOf(o).entries()) {
        if (step.target === null) continue;
        it(`${role} · Round ${roundNumber} · ${step.id} → [data-tour="${step.target}"]`, () => {
          expect(has(render(o, k, 0), step.target!)).toBe(true);
          expect(has(render(o, k, stepDuration(step)), step.target!)).toBe(true);
        });
      }
    }
  }
});

describe('the demo plays on the real screen', () => {
  it('types the batch into the Joke Maker textbox, and shows Marketing\'s note under the batch', () => {
    const o = opts('JOKE_MAKER');
    const typed = renderStep(o, 'jm-write', 7000);
    expect(typed).toContain(DEMO_JOKES[4].replace(/'/g, '&#x27;'));
    expect(typed).toContain(`${DEMO_RAW_BATCH.trim().length} chars`);
    expect(renderStep(o, 'jm-write', 0)).toContain('0 chars');
    const note = renderStep(o, 'jm-note');
    expect(note).toContain('From Marketing');
    expect(note).toContain(DEMO_NOTE);
    expect(note).toContain('Team Demo');
    // The opened batch shows a card per joke with its state detail.
    for (const part of ['1 buyer', 'Sold before, swapped out', 'No buyer yet, on market 20 s', 'Not released by Marketing', 'To-Do Overload']) {
      expect(note).toContain(part);
    }
  });

  it('shows the round\'s shipping line: Round 1 one size, Round 2 three', () => {
    expect(renderStep(opts('JOKE_MAKER', 1), 'jm-shipping')).toContain('Shipping: $2 per batch of 5');
    expect(renderStep(opts('JOKE_MAKER', 2), 'jm-shipping')).toContain('Shipping: $1 for 1–4 jokes · $2 for 5 · $3 for 6–10');
  });

  it('the Next step line reads the demo, not the wall clock', () => {
    expect(renderStep(opts('JOKE_MAKER'), 'jm-next')).toContain('Marketing&#x27;s desk is empty. Send your next batch of 5.');
    expect(renderStep(opts('JOKE_MAKER'), 'jm-shipping')).toContain('Keep writing. Every batch is another chance to sell.');
    expect(renderStep(opts('QUALITY_CONTROL'), 'mk-next')).toContain(
      'Batch waiting 52 s. Release what&#x27;s good enough. Storage costs 5¢ a joke each minute.',
    );
  });

  it('splits the batch, picks three and types the note on Marketing\'s desk', () => {
    const o = opts('QUALITY_CONTROL');
    expect(renderStep(o, 'mk-arrives', 0)).toContain('to cut. The wording stays as written.');
    expect(renderStep(o, 'mk-arrives', 3000)).toContain('>Discard<');
    expect(renderStep(o, 'mk-pick', 3000).match(/aria-checked="true"/g)).toHaveLength(3);
    expect(renderStep(o, 'mk-note', 7000)).toContain(`${DEMO_NOTE.length}/500`);
    expect(renderStep(o, 'mk-note', 0)).toContain('0/500');
    expect(renderStep(o, 'mk-note', 0, true)).toContain(`${DEMO_NOTE.length}/500`);
  });

  it('opens "Fees and wait times" for the fees step, with the sales chart, and shows the new feedback card', () => {
    const o = opts('QUALITY_CONTROL');
    expect(renderStep(o, 'mk-scoreboard')).toContain('Fees and wait times');
    expect(renderStep(o, 'mk-scoreboard')).not.toContain('Where your sales went');
    const fees = renderStep(o, 'mk-fees');
    for (const part of ['Where your sales went', 'Shipping', 'Storage', 'Hosting', 'Listing and discard fees']) expect(fees).toContain(part);
    expect(renderStep(o, 'mk-feedback')).toContain('To-Do Overload');
    expect(renderStep(o, 'mk-expand')).toContain('Expand');
  });

  it('ignores the student\'s own "Fees and wait times" choice and never writes it', () => {
    storage.setItem('jf_more_tiles_joke_maker', '1');
    storage.setItem('jf_more_tiles_quality_control', '1');
    storage.writes = [];
    expect(renderStep(opts('JOKE_MAKER'), 'jm-scoreboard')).not.toContain('Where your sales went');
    expect(renderStep(opts('QUALITY_CONTROL'), 'mk-scoreboard')).not.toContain('Where your sales went');
    expect(storage.writes).toEqual([]);
  });

  it('is inert and hidden from assistive technology', () => {
    const stage = render(opts('JOKE_MAKER'), 0, 0).match(/<div[^>]*data-tour-stage=""[^>]*>/)![0];
    expect(stage).toContain('inert=""');
    expect(stage).toContain('aria-hidden="true"');
  });

  it('never makes a request or writes localStorage, in any frame', () => {
    for (const roundNumber of [1, 2] as const) for (const role of ROLES) {
      const o = opts(role, roundNumber);
      for (const [k, step] of stepsOf(o).entries()) {
        render(o, k, 0);
        render(o, k, stepDuration(step));
      }
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(storage.writes).toEqual([]);
  });
});

describe('StatTiles open from the outside (the demo)', () => {
  const tiles = (open?: boolean) => renderToStaticMarkup(createElement(StatTiles, {
    keyTiles: [createElement('i', { key: 'a' }, 'KeyA')], moreTiles: [createElement('i', { key: 'c' }, 'MoreC')],
    storageKey: 'k', open, tourKey: 'x-key', tourMore: 'x-more',
  }));

  it('open wins over the remembered choice, both ways', () => {
    storage.setItem('k', '1');
    expect(tiles(false)).not.toContain('MoreC');
    storage.setItem('k', '0');
    expect(tiles(true)).toContain('MoreC');
    expect(tiles(undefined)).not.toContain('MoreC');
  });

  it('carries the data-tour ids on the key grid and the More panel', () => {
    const out = tiles(true);
    expect(out).toContain('data-tour="x-key"');
    expect(out).toContain('data-tour="x-more"');
  });
});

describe('the demo header', () => {
  for (const role of ROLES) {
    it(`${role}: reads Running with a few minutes on the demo clock, never wall time or 00:00`, () => {
      const o = opts(role);
      const html = renderStep(o, stepsOf(o)[0].id);
      expect(html).toContain('Running');
      expect(html).toContain('04:00');
      expect(html).not.toContain('00:00');
    });
  }
});
