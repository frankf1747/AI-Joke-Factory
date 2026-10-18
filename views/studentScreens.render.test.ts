import { afterEach, describe, expect, it, vi } from 'vitest';
import JokeMaker from './JokeMaker';
import QualityControl from './QualityControl';
import { TEST_CONFIG, fakeGame, renderWithGame, testUser } from './testing/renderWithGame';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DemoModeContext, GameContext } from '../context';
import { EMPTY_DEMO_UI } from '../services/tour/demoUi';
import { Role, type ApiTeamSummaryResponse, type Batch } from '../types';
import type { LeanTeamStats } from '../types/api';

afterEach(() => vi.unstubAllGlobals());

const summary = (lean?: Partial<LeanTeamStats>): ApiTeamSummaryResponse => ({
  team: { id: 1, name: 'Team 1' }, round_id: 1, rank: 1, points: 0, total_sales: 3, profit: -1.25,
  batches_created: 2, batches_processed: 1, published_jokes: 3, unprocessed_batches: 2,
  jokes_created: 5, jokes_published: 3,
  lean: lean && {
    batches_submitted: 2, setup_cost: 0, carrying_cost: 0, avg_submit_to_publish_s: 40, avg_publish_to_first_sale_s: 0,
    batch_series: [], ...lean,
  },
});

const jokeMaker = (round: 1 | 2, extra: Partial<typeof TEST_CONFIG> = {}) => renderWithGame(JokeMaker, {
  user: testUser(Role.JOKE_MAKER),
  config: { ...TEST_CONFIG, round, ...extra },
  teamSummary: summary({}),
});

const marketing = (lean: Partial<LeanTeamStats>) => renderWithGame(QualityControl, {
  user: testUser(Role.QUALITY_CONTROL),
  teamSummary: summary(lean),
});

describe('Joke Maker screen', () => {
  it('quotes Round 1 shipping for its batch of 5', () => {
    expect(jokeMaker(1)).toContain('Shipping: $2 per batch of 5');
  });

  it('quotes the three Round 2 tiers and says up to 10 jokes, smaller allowed', () => {
    const out = jokeMaker(2);
    expect(out).toContain('Shipping: $1 for 1–4 jokes · $2 for 5 · $3 for 6–10');
    expect(out).toContain('make up to 10 jokes per batch');
  });

  describe('Production line card', () => {
    const lean = { marketMode: 'LEAN' as const };

    it('puts Next step first in the card, then the paste box, the send row and the shipping line', () => {
      const out = jokeMaker(1, { ...lean, round1BatchSize: 5 });
      const at = (t: string) => out.indexOf(`data-tour="${t}"`);
      expect(out.split('data-tour="jm-next-step"').length).toBe(2);
      const order = ['jm-next-step', 'jm-draft', 'jm-send', 'jm-shipping'].map(at);
      expect(order.every(i => i >= 0)).toBe(true);
      expect([...order].sort((a, b) => a - b)).toEqual(order);
      expect(out.indexOf('Production Line')).toBeLessThan(at('jm-next-step'));
    });

    it('says what to make, and where it goes, in plain text', () => {
      const out = jokeMaker(1, { ...lean, round1BatchSize: 5 });
      expect(out).toContain('make exactly 5 jokes per batch with any AI tool and paste the whole response below. Marketing will split it into individual jokes.');
      expect(out).toContain('Stuck? Try work, family, food, tech or animals.');
      expect(out).toContain('Shipping: $2 per batch of 5');
      expect(out).not.toContain('bg-blue-50');
    });

    it('says up to 10 in Round 2', () => {
      const out = jokeMaker(2, { ...lean, round2BatchLimit: 10 });
      expect(out).toContain('Round 2:');
      expect(out).toContain('make up to 10 jokes per batch with any AI tool');
    });

    it('disables the gold Send to Marketing button while there is no text', () => {
      const out = jokeMaker(1, lean);
      const button = out.match(/<button[^>]*>(?:(?!<\/button>).)*Send to Marketing(?:(?!<\/button>).)*<\/button>/s)?.[0] ?? '';
      expect(button).toContain('disabled=""');
      expect(button).toContain('Send to Marketing');
      expect(button).toContain('var(--paper-2)');
    });

    it('keeps the card controls inside the watch-mode fieldset', () => {
      const out = jokeMaker(1, lean);
      const fieldset = out.match(/<fieldset[^>]*>.*<\/fieldset>/s)?.[0] ?? '';
      for (const t of ['jm-next-step', 'jm-draft', 'jm-send', 'jm-shipping']) expect(fieldset).toContain(`data-tour="${t}"`);
    });
  });

  it('reads the amounts from the round, never from fixed copy', () => {
    const out = jokeMaker(2, { shippingFeeSmall: 0.5, shippingFeeStandard: 1, shippingFeeLarge: 4 });
    expect(out).toContain('Shipping: $0.50 for 1–4 jokes · $1 for 5 · $4 for 6–10');
  });

  it('shows no WIP counter and no setup or carrying wording, even with an old WIP limit stored', () => {
    const out = jokeMaker(1, { wipLimit: 2, setupCostPerBatch: 2 });
    for (const gone of ['batches waiting', 'wait, or go help', 'to set up', 'Setup cost', 'Carrying cost']) {
      expect(out).not.toContain(gone);
    }
  });
});

describe('Value stream', () => {
  const NOW = 1_000_000_000_000;
  const joke = (n: number, over: Partial<Batch['jokes'][number]> = {}) => ({
    joke_id: n, id: String(n), joke_text: `Joke ${n}`, content: `Joke ${n}`, joke_title: `Title ${n}`,
    publish_status: 'PUBLISHED' as const, sold_count: 0, is_published: true, ...over,
  });
  const batch = (id: number, over: Partial<Batch> = {}): Batch => ({
    batch_id: id, round_id: 1, team_id: 1, status: 'PROCESSED', jokes: [joke(1)],
    id: String(id), team: '1', round: 1, submittedAt: NOW - 300_000, ratedAt: NOW - 120_000, ...over,
  });
  // Oldest first, the way the context provides them.
  const three = [
    batch(5001),
    batch(5002, {
      marketing_note: 'Shorter setups sell.',
      jokes: [joke(1, { joke_title: 'The Self-Starter', sold_count: 6 }), joke(2, { publish_status: 'DISCARDED', is_published: false })],
    }),
    batch(5003, { status: 'SUBMITTED', jokes: [], ratedAt: undefined }),
  ];
  const render = (open: string[]) => renderToStaticMarkup(createElement(
    GameContext.Provider,
    { value: fakeGame({ user: testUser(Role.JOKE_MAKER), teamSummary: { ...summary({}), batches_created: 3 }, batches: three }) },
    createElement(DemoModeContext.Provider, { value: { ...EMPTY_DEMO_UI, jmOpenBatchIds: open, clockMs: NOW } }, createElement(JokeMaker)),
  ));

  it('lists the newest batch first under a "Value stream" header with the batch count', () => {
    const out = render([]);
    expect(out).toContain('data-tour="jm-value-stream"');
    expect(out).toContain('Value stream');
    expect(out).toContain('3 batches');
    expect(out.indexOf('B-5003')).toBeGreaterThan(-1);
    expect(out.indexOf('B-5003')).toBeLessThan(out.indexOf('B-5001'));
    expect(out).toContain('Sent 5 min ago');
    expect(out).toContain('not split yet');
  });

  it('opens a batch to its note card and joke cards', () => {
    const out = render(['5002']);
    expect(out).toContain('data-tour="jm-marketing-note"');
    expect(out).toContain('From Marketing');
    expect(out).toContain('Shorter setups sell.');
    expect(out).toContain('with the release, 2 min ago');
    expect(out).toContain('#1');
    expect(out).toContain('The Self-Starter');
    expect(out).toContain('6 buyers');
    expect(out).toContain('Not released by Marketing');
    expect(out).toContain('joke-font');
  });

  it('shows no note card on a batch without a note, and no jokes while closed', () => {
    expect(render(['5001'])).not.toContain('jm-marketing-note');
    const closed = render([]);
    expect(closed).not.toContain('From Marketing');
    expect(closed).not.toContain('Shorter setups sell.');
    expect(closed).not.toContain('The Self-Starter');
  });
});

describe('Header', () => {
  const header = (over: Partial<Parameters<typeof renderWithGame>[1]> = {}) => renderWithGame(JokeMaker, {
    user: { ...testUser(Role.JOKE_MAKER), display_name: 'priya_tomás', team: '3' },
    roundStatuses: { 1: 'ACTIVE', 2: 'CONFIGURED' },
    roundTimes: { 1: { startedAt: Date.now() - 439_000, endedAt: null }, 2: { startedAt: null, endedAt: null } },
    teamSummary: null,
    ...over,
  });

  it('shows the running round, its clock, the pair and the tour button', () => {
    const out = header();
    expect(out).toContain('Running');
    expect(out).toContain('Round 1');
    expect(out).toMatch(/\d\d:\d\d/);
    expect(out).toContain('elapsed');
    expect(out).toContain('Priya and Tomás');
    expect(out).toContain('title="Priya and Tomás"');
    expect(out).toContain('Team 3, Joke Maker');
    expect(out).toContain('aria-label="Replay the 1-minute tour"');
    expect(out).not.toContain('New here? Watch');
  });

  it('uses the team name from the summary when no name is stored locally', () => {
    expect(header({ teamSummary: { ...summary({}), team: { id: 3, name: 'Team Alpha' } } })).toContain('Team Alpha, Joke Maker');
  });

  it('says Round over with the total once the round has ended', () => {
    const out = header({
      roundStatuses: { 1: 'ENDED', 2: 'CONFIGURED' },
      roundTimes: { 1: { startedAt: 0, endedAt: 3_600_000 }, 2: { startedAt: null, endedAt: null } },
    });
    expect(out).toContain('Round over');
    expect(out).toContain('60:00');
    expect(out).toContain('total');
  });

  it('says Not started before the round opens', () => {
    const out = header({ roundStatuses: { 1: 'CONFIGURED', 2: null } });
    expect(out).toContain('Not started');
    expect(out).toContain('00:00');
    expect(out).toContain('not started');
  });
});

describe('Marketing screen', () => {
  it('shows the fees and the wait times (behind Fees and wait times) from the team summary', () => {
    vi.stubGlobal('localStorage', { getItem: () => '1' });
    const out = marketing({ shipping_cost: 8, storage_cost: 1.5, hosting_cost: 0.2, setup_cost: 8, carrying_cost: 1.7, avg_submit_to_publish_s: 161, avg_publish_to_first_sale_s: 52 });
    expect(out).toContain('Where your sales went');
    for (const l of ['Shipping', 'Storage', 'Hosting', 'Listing and discard fees']) expect(out).toContain(l);
    expect(out).toContain('$8.00');
    expect(out).toContain('$1.50');
    expect(out).toContain('$0.20');
    expect(out).toContain('With Marketing 2:41');
    expect(out).toContain('about 3:33');
    expect(out).not.toContain('Setup cost');
    expect(out).not.toContain('Carrying cost');
  });

  it('reads an older backend\'s setup and carrying costs without NaN', () => {
    vi.stubGlobal('localStorage', { getItem: () => '1' });
    const out = marketing({ setup_cost: 4, carrying_cost: 2.5 });
    expect(out).toContain('$4.00');
    expect(out).toContain('$2.50');
    expect(out).not.toContain('NaN');
  });
});
