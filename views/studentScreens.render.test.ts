import { afterEach, describe, expect, it, vi } from 'vitest';
import JokeMaker from './JokeMaker';
import QualityControl from './QualityControl';
import { BatchSplitter } from '../components/marketing/BatchSplitter';
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
      expect(out.indexOf('Production line')).toBeLessThan(at('jm-next-step'));
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

describe('Jokes by stage', () => {
  const j = (n: number, over: Partial<Batch['jokes'][number]> = {}) => ({
    joke_id: n, id: String(n), joke_text: `Joke ${n}`, content: `Joke ${n}`, joke_title: `Title ${n}`,
    publish_status: 'PUBLISHED' as const, sold_count: 0, is_published: true, ...over,
  });
  const b = (id: number, status: Batch['status'], jokes: Batch['jokes']): Batch => ({
    batch_id: id, round_id: 1, team_id: 1, status, jokes, id: String(id), team: '1', round: 1,
  });
  // Selling 2, lost its buyers 1, no buyer yet 2, not released 1; one batch still with Marketing.
  const fixture = [
    b(1, 'PROCESSED', [
      j(1, { sold_count: 2 }), j(2, { first_sold_at: '2026-10-18T10:00:00Z' }), j(3, { publish_status: 'DISCARDED', is_published: false }),
    ]),
    b(2, 'PROCESSED', [j(4, { sold_count: 1 }), j(5), j(6)]),
    b(3, 'SUBMITTED', []),
  ];
  const card = (batches: Batch[], unprocessed: number | undefined) => {
    const out = renderWithGame(JokeMaker, {
      user: testUser(Role.JOKE_MAKER), batches,
      teamSummary: unprocessed == null ? null : { ...summary({}), unprocessed_batches: unprocessed },
    });
    return out.slice(out.indexOf('Jokes by stage'));
  };
  const row = (out: string, label: string) =>
    out.match(new RegExp(`${label}</span><span[^>]*>(.*?)</span>`, 's'))?.[1].replace(/<[^>]*>/g, '') ?? '';

  it('shows With Marketing from the summary, then each market stage with its count', () => {
    const out = card(fixture, 1);
    expect(out).toContain('Where your output sits right now.');
    expect(out).toContain('With Marketing');
    expect(row(out, 'With Marketing')).toBe('1 batch');
    expect(out).toContain('On the market');
    expect(row(out, 'Selling')).toBe('2');
    expect(row(out, 'Lost its buyers')).toBe('1');
    expect(row(out, 'No buyer yet')).toBe('2');
    expect(row(out, 'Not released')).toBe('1');
    const at = (t: string) => out.indexOf(t);
    expect(at('With Marketing')).toBeLessThan(at('Selling'));
    expect(at('Selling')).toBeLessThan(at('Lost its buyers'));
    expect(at('Lost its buyers')).toBeLessThan(at('No buyer yet'));
    expect(at('No buyer yet')).toBeLessThan(at('Not released'));
  });

  it('says "batches" for other counts and a dash while there is no summary', () => {
    expect(row(card(fixture, 3), 'With Marketing')).toBe('3 batches');
    expect(row(card(fixture, 0), 'With Marketing')).toBe('0 batches');
    expect(row(card([], undefined), 'With Marketing')).toBe('—');
  });

  it('draws one square per joke and caps them at 30 while the count stays honest', () => {
    const many = [b(9, 'PROCESSED', Array.from({ length: 45 }, (_, i) => j(100 + i, { sold_count: 1 })))];
    const out = card(many, 0);
    expect(row(out, 'Selling')).toBe('45');
    expect(out.match(/data-square/g)?.length).toBe(30);
    expect(card(fixture, 1).match(/data-square/g)?.length).toBe(6);
  });

  it('replaces the old status rows', () => {
    const out = card(fixture, 1);
    for (const gone of ['In review', 'On market<', 'Wasted', 'w-20 shrink-0']) expect(out).not.toContain(gone);
  });
});

describe('Before the first round starts', () => {
  const pre = () => renderWithGame(JokeMaker, { user: testUser(Role.JOKE_MAKER), batches: [], teamSummary: null });

  it('tells the Joke Maker the value stream fills in once the round starts', () => {
    const out = pre();
    expect(out).toContain('Your batches show up here once the round starts.');
    expect(out).not.toContain('No batches yet.');
  });

  it('keeps "No batches yet." once the round has a summary', () => {
    const out = renderWithGame(JokeMaker, { user: testUser(Role.JOKE_MAKER), batches: [], teamSummary: summary({}) });
    expect(out).toContain('No batches yet.');
    expect(out).not.toContain('once the round starts');
  });

  it('shows a dash on the scoreboard', () => {
    const out = pre();
    const board = out.match(/aria-label="Scoreboard".*?<\/section>/s)?.[0] ?? '';
    expect(board).toContain('—');
    expect(board).not.toContain('NaN');
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

describe('Marketing desk card', () => {
  /** Marketing's screen with batch B-5004 on the desk, submitted `secondsAgo` before a fixed clock (null: no submitted_at). */
  const deskGame = (over: Parameters<typeof renderWithGame>[1] = {}, secondsAgo: number | null = 72) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-18T12:00:00Z'));
    try {
      const submitted_at = secondsAgo === null ? null : new Date(Date.now() - secondsAgo * 1000).toISOString();
      return renderWithGame(QualityControl, {
        user: testUser(Role.QUALITY_CONTROL),
        teamSummary: summary({}),
        qcQueueSize: 2,
        qcQueue: {
          batch: { batch_id: 5004, round_id: 1, team_id: 1, submitted_at: submitted_at as string, raw_text: 'one\n\ntwo' },
          jokes: [], queue_size: 2,
        },
        ...over,
      });
    } finally {
      vi.useRealTimers();
    }
  };

  it('shows the title, the count, the batch bar, the position marker and the Enter keycap', () => {
    const out = deskGame();
    expect(out).toContain('Marketing desk');
    expect(out).toContain('1 more waiting');
    expect(out).toContain('B-5004');
    expect(out).toContain('waiting 1:12');
    for (const stage of ['Split', 'Choose', 'Release']) expect(out).toContain(`>${stage}</span>`);
    expect(out).toContain('<kbd');
    expect(out).toContain('Enter</kbd>');
    expect(out).toContain('data-tour="mk-desk"');
    expect(out).toContain('data-tour="mk-next-step"');
  });

  it('puts Next step first in the card, before the batch bar', () => {
    const out = deskGame();
    expect(out.indexOf('Marketing desk')).toBeLessThan(out.indexOf('data-tour="mk-next-step"'));
    expect(out.indexOf('data-tour="mk-next-step"')).toBeLessThan(out.indexOf('B-5004'));
  });

  it('says nothing else is waiting at zero and shows no count while it is unknown', () => {
    expect(deskGame({ qcQueueSize: 1 })).toContain('nothing else waiting');
    const unknown = deskGame({ qcQueueSize: null });
    expect(unknown).not.toContain('more waiting');
    expect(unknown).not.toContain('nothing else waiting');
  });

  it('omits the time when the batch has no submitted_at', () => {
    const out = deskGame({}, null);
    expect(out).toContain('B-5004');
    expect(out).not.toMatch(/waiting \d+:\d\d/);
  });

  it('keeps both tour targets with no batch on the desk', () => {
    const out = renderWithGame(QualityControl, { user: testUser(Role.QUALITY_CONTROL), qcQueue: null, qcQueueSize: 0 });
    expect(out).toContain('data-tour="mk-desk"');
    expect(out).toContain('data-tour="mk-next-step"');
    expect(out).toContain('nothing else waiting');
    expect(out).not.toContain('B-');
  });
});

describe('Split stage', () => {
  const render = (props: Partial<Parameters<typeof BatchSplitter>[0]>) => renderToStaticMarkup(
    createElement(BatchSplitter, {
      rawText: 'one two three four', round: 1, batchSize: 5, limit: 10, onComplete: () => {}, ...props,
    }),
  );
  const DISABLED = /\sdisabled=""/;
  const confirmButton = (out: string) =>
    out.match(/<button[^>]*>(?:(?!<\/button>).)*Confirm, next(?:(?!<\/button>).)*<\/button>/s)?.[0] ?? '';

  it('Round 1 with four cut pieces: wrong count message, 4 of 5, Confirm disabled', () => {
    const out = render({ initialCuts: [4, 8, 14, 18] });
    expect(out).toContain('Round 1 needs exactly 5 jokes; you have 4.');
    expect(out).toContain('4 of 5');
    expect(confirmButton(out)).toMatch(DISABLED);
    expect(out).toContain('Undo from here');
  });

  it('does not count the uncut remainder as a joke', () => {
    const out = render({ rawText: 'one two three', initialCuts: [4, 8] });
    expect(out).toContain('2 of 5');
    expect(out).toContain('Split the remaining text to finish.');
    expect(confirmButton(out)).toMatch(DISABLED);
  });

  it('enables Confirm once five pieces are cut and nothing remains', () => {
    const out = render({ rawText: 'a b c d e', initialCuts: [2, 4, 6, 8, 9] });
    expect(out).toContain('All split. Check the jokes, then confirm.');
    expect(out).toContain('5 of 5');
    expect(confirmButton(out)).not.toMatch(DISABLED);
  });

  it('Round 2 shows the cut count and the limit', () => {
    const out = render({ round: 2, initialCuts: [4, 8, 14, 18] });
    expect(out).toContain('4, up to 10');
    expect(out).toContain('All split. Check the jokes, then confirm.');
    expect(confirmButton(out)).not.toMatch(DISABLED);
  });

  it('asks for a first cut when nothing is cut', () => {
    const out = render({});
    expect(out).toContain('Split at least one joke first.');
    expect(out).toContain('0 of 5');
    expect(confirmButton(out)).toMatch(DISABLED);
  });
});

describe('Choose stage', () => {
  const JOKES = [101, 102, 103, 104, 105].map(id => ({ joke_id: id, joke_text: `Joke text ${id}` }));
  const choose = (ui: Partial<typeof EMPTY_DEMO_UI>, over: Parameters<typeof renderWithGame>[1] = {}) => renderToStaticMarkup(
    createElement(GameContext.Provider, {
      value: fakeGame({
        user: testUser(Role.QUALITY_CONTROL),
        teamSummary: summary({}),
        qcQueueSize: 1,
        qcQueue: {
          batch: { batch_id: 5004, round_id: 1, team_id: 1, submitted_at: '2026-10-18T12:00:00Z', raw_text: null },
          jokes: JOKES, queue_size: 1,
        },
        ...over,
      }),
    }, createElement(DemoModeContext.Provider, { value: { ...EMPTY_DEMO_UI, ...ui } }, createElement(QualityControl))),
  );
  /* Three of five picked; the first has a topic and a title, the others are missing one or both. */
  const THREE = {
    mkSelectedIds: [101, 102, 103],
    mkTopics: { 101: 'Work', 102: 'Food' },
    mkTitles: { 101: 'The Self-Starter' },
  };
  const cards = (out: string) => out.split('data-pick="').slice(1);

  it('marks the three picked cards selected and shows Deselect on each', () => {
    const out = choose(THREE);
    expect(out.match(/aria-checked="true"/g)).toHaveLength(3);
    expect(out.match(/aria-checked="false"/g)).toHaveLength(2);
    expect(out.match(/>Deselect</g)).toHaveLength(3);
  });

  it('says what is missing on a selected card and "To market" when it is complete', () => {
    const out = choose(THREE);
    expect(out.match(/>Needs a topic and a title</g)).toHaveLength(2);
    expect(out.match(/>To market</g)).toHaveLength(1);
    expect(cards(out)[0]).toContain('>To market<');
    expect(cards(out)[1]).toContain('>Needs a topic and a title<');
    expect(cards(out)[2]).toContain('>Needs a topic and a title<');
  });

  it('labels the two unselected cards Discard', () => {
    const out = choose(THREE);
    expect(out.match(/>Discard</g)).toHaveLength(2);
    expect(cards(out)[3]).toContain('>Discard<');
    expect(cards(out)[4]).toContain('>Discard<');
  });

  it('tallies the sale: Selling 3, discarding 2, costs $0.32', () => {
    expect(choose(THREE).replace(/<[^>]+>/g, '')).toContain('Selling 3, discarding 2, costs $0.32');
  });

  it('keeps the four tour targets on the screen', () => {
    const out = choose(THREE);
    for (const t of ['mk-jokes', 'mk-topic-title', 'mk-note', 'mk-release', 'mk-desk']) {
      expect(out).toContain(`data-tour="${t}"`);
    }
  });

  it('offers the 15 topics in a select, with a Topic placeholder, on selected cards only', () => {
    const out = choose(THREE);
    const selects = out.match(/<select[^>]*>.*?<\/select>/gs) ?? [];
    expect(selects).toHaveLength(3);
    const options = selects[0].match(/<option[^>]*>[^<]*<\/option>/g) ?? [];
    expect(options).toHaveLength(16);
    expect(options[0]).toContain('>Topic<');
    expect(selects[0]).toContain('required');
    for (const t of ['Work', 'Relationships', 'Family', 'Food', 'Technology', 'Animals', 'School', 'Money', 'Travel', 'Health', 'Sports', 'Politics', 'Everyday', 'Language', 'Other']) {
      expect(selects[0]).toContain(`>${t}</option>`);
    }
    expect(cards(out)[3]).not.toContain('<select');
  });

  it('shows the title counter, the header line and the note box', () => {
    const out = choose(THREE);
    expect(out).toContain('0/120');
    expect(out).toContain('16/120');
    expect(out.replace(/<[^>]+>/g, '')).toContain('Choose what to sell. Every joke you sell needs a topic and a title. The rest are discarded.');
    expect(out).toContain('Back to splitting');
    expect(out).toContain('Note to your Joke Maker, sent with this batch');
    expect(out).toContain('0/500');
  });

  const releaseButton = (out: string) =>
    out.match(/<button[^>]*data-tour="mk-release"[^>]*>(?:(?!<\/button>).)*<\/button>/s)?.[0] ?? '';

  it('keeps Release to market disabled until every selected joke has a topic and a title', () => {
    const incomplete = releaseButton(choose(THREE));
    expect(incomplete).toContain('Release to market');
    expect(incomplete).toMatch(/\sdisabled=""/);
    const ready = releaseButton(choose({
      mkSelectedIds: [101], mkTopics: { 101: 'Work' }, mkTitles: { 101: 'The Self-Starter' },
    }));
    expect(ready).toContain('Release to market');
    expect(ready).not.toMatch(/\sdisabled=""/);
  });

  it('Round 1 with nothing selected: disabled Release, tally of zero sold', () => {
    const out = choose({});
    expect(releaseButton(out)).toMatch(/\sdisabled=""/);
    expect(out.replace(/<[^>]+>/g, '')).toContain('Selling 0, discarding 5, costs $0.05');
  });

  it('Round 2 with nothing selected keeps the Discard batch path', () => {
    const out = choose({}, { config: { ...TEST_CONFIG, round: 2 } });
    const button = releaseButton(out);
    expect(button).toContain('Discard batch · 5 jokes');
    expect(button).not.toMatch(/\sdisabled=""/);
  });
});
