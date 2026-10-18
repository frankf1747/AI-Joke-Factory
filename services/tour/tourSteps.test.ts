import { describe, expect, it } from 'vitest';
import { JOKE_MAKER_STEPS, MARKETING_STEPS, captionText, stepsFor } from './tourSteps';
import { stepDuration } from './tourMachine';
import type { TourMoney, TourRound } from './demoScript';
import { DIMENSIONS } from '../../config/dimensions';

const DEFAULT_FEES: TourMoney = {
  marketPrice: 1, costOfPublishing: 0.1, costOfDiscard: 0.01,
  shippingFeeSmall: 1, shippingFeeStandard: 2, shippingFeeLarge: 3,
  storageFeePerJokeMinute: 0.05, hostingFeePerJokeMinute: 0.05,
};
const R1: TourRound = { roundNumber: 1, fees: DEFAULT_FEES };
const R2: TourRound = { roundNumber: 2, fees: DEFAULT_FEES };
const ids = (steps: ReadonlyArray<{ id: string }>) => steps.map(s => s.id);
const text = (steps: ReadonlyArray<{ title: string; body: unknown }>) => steps.map(s => [s.title, s.body]);

describe('stepsFor', () => {
  it('Joke Maker: ten steps, the same in both rounds', () => {
    const want = [
      'jm-welcome', 'jm-next', 'jm-write', 'jm-send', 'jm-shipping', 'jm-value-stream', 'jm-note', 'jm-scoreboard',
      'jm-customers', 'jm-goal',
    ];
    expect(ids(stepsFor('JOKE_MAKER', R1))).toEqual(want);
    expect(ids(stepsFor('JOKE_MAKER', R2))).toEqual(want);
  });

  it('Marketing: twelve steps, the same in both rounds', () => {
    const want = [
      'mk-welcome', 'mk-next', 'mk-arrives', 'mk-pick', 'mk-title', 'mk-note', 'mk-release', 'mk-scoreboard', 'mk-fees',
      'mk-feedback', 'mk-expand', 'mk-goal',
    ];
    expect(ids(stepsFor('QUALITY_CONTROL', R1))).toEqual(want);
    expect(ids(stepsFor('QUALITY_CONTROL', R2))).toEqual(want);
  });

  it('fills every caption in: no step comes back with a function', () => {
    for (const role of ['JOKE_MAKER', 'QUALITY_CONTROL'] as const) {
      for (const s of stepsFor(role, R2)) expect(typeof s.body).toBe('string');
    }
  });

  it('opens and closes on a centred card, and the last button says Start', () => {
    for (const steps of [JOKE_MAKER_STEPS, MARKETING_STEPS]) {
      expect(steps[0].target).toBeNull();
      expect(steps[steps.length - 1].target).toBeNull();
      expect(steps[steps.length - 1].finishLabel).toBe('Start');
      expect(steps.slice(0, -1).every(s => s.finishLabel === undefined)).toBe(true);
    }
  });

  it('gives the long captions time to be read', () => {
    const byId = (steps: readonly { id: string; durationMs?: number }[], id: string) => steps.find(x => x.id === id)!;
    for (const id of ['jm-scoreboard', 'jm-customers']) expect(byId(JOKE_MAKER_STEPS, id).durationMs).toBe(9000);
    for (const id of ['mk-fees', 'mk-pick']) expect(byId(MARKETING_STEPS, id).durationMs).toBe(9000);
  });

  it('runs about a minute', () => {
    const total = (steps: readonly { durationMs?: number }[]) => steps.reduce((ms, s) => ms + stepDuration(s), 0);
    expect(total(JOKE_MAKER_STEPS)).toBe(67_000);
    expect(total(MARKETING_STEPS)).toBe(77_000);
  });

  it('uses data-tour ids that are safe in a CSS selector, and unique step ids', () => {
    for (const steps of [JOKE_MAKER_STEPS, MARKETING_STEPS]) {
      expect(new Set(ids(steps)).size).toBe(steps.length);
      for (const s of steps) if (s.target !== null) expect(s.target).toMatch(/^[a-z]+(-[a-z]+)*$/);
    }
  });
});

describe('captions (spec §4, verbatim)', () => {
  it('Joke Maker, Round 1, at the default fees', () => {
    expect(text(stepsFor('JOKE_MAKER', R1))).toEqual([
      ["You're the Joke Maker.", "Your team earns money when AI customers buy your jokes. Here's your screen in one minute."],
      ['Your next step.', "The top of the Production line watches the game and tells you what to do next. Glance at it whenever you're unsure."],
      ['Write, then paste.', 'Write jokes with your AI tool and paste the whole reply here. Marketing splits it into separate jokes.'],
      ['Send a batch.', 'Tick the box and press Send to Marketing. Each send is one batch.'],
      ['Every batch pays shipping.', 'Each batch of 5 costs $2 to ship, so keep them coming but make them count.'],
      ['Follow your batches.', 'Each row is a batch and each square is a joke. Outline means with Marketing, green is selling, amber is waiting for a buyer, pale green sold before but lost its buyer, and grey was not released. Open a row to see each joke.'],
      ["Read Marketing's note.", 'Open a batch and Marketing\'s note sits above its jokes. It says what customers liked and what to change. Read it before you write the next batch.'],
      ['Your scoreboard.', 'Team rank, by profit, is your place among all teams, and profit is sales minus fees. "Found a buyer" counts the jokes that have sold. "Fees and wait times" shows where the money went.'],
      ['How customers buy.', 'AI customers are picky: they judge every joke on 12 criteria and only buy the ones that fit what they like. Better-aimed jokes beat lots of random ones.'],
      ['Your goal.', 'Keep the line moving, learn from each batch, and improve the next one.'],
    ]);
  });

  it('Joke Maker, Round 2: the shipping step lists the three sizes', () => {
    expect(stepsFor('JOKE_MAKER', R2)[4].body).toBe(
      'You choose the size now: $1 for 1–4 jokes, $2 for 5, $3 for 6–10. Smaller batches come back with feedback sooner.',
    );
    // Every other caption is the same in both rounds.
    const r1 = stepsFor('JOKE_MAKER', R1).map(s => s.body);
    const r2 = stepsFor('JOKE_MAKER', R2).map(s => s.body);
    expect(r2.filter((b, i) => b !== r1[i])).toHaveLength(1);
  });

  it('Marketing, at the default fees', () => {
    expect(text(stepsFor('QUALITY_CONTROL', R1))).toEqual([
      ["You're Marketing.", 'You decide which jokes go to market. Listing a joke costs $0.10, and each sale earns $1.'],
      ['Your next step.', "The top of the Marketing desk watches the game and tells you what to do next. Glance at it whenever you're unsure."],
      ['A batch arrives.', "Your Joke Maker's batch lands on your desk. Cut it into separate jokes: click between two jokes and press Enter."],
      ['Pick the winners, quickly.', "Tick the jokes customers will buy and leave the rest to be discarded (discarding costs $0.01). Don't be too strict: customers can only buy what's on the shelf."],
      ['Topic and title.', 'Choose a topic from the dropdown and write a title for each joke you sell. A good title helps it sell.'],
      ['Tell your Joke Maker.', 'Say what to change next. Your note is sent with this batch.'],
      ['Release.', 'Release to market puts the jokes you ticked on the market, where customers start buying. The tally beside it shows what it costs.'],
      ['Your scoreboard.', 'Your team rank, by profit, sits beside your profit and sales. "Found a buyer" shows how many of your released jokes have sold so far.'],
      ['Fees add up.', '"Fees and wait times" shows where your sales went. Every batch pays shipping. A batch waiting on your desk pays storage (5¢ a joke each minute), and an unsold joke pays hosting (5¢ a joke each minute). Release quickly.'],
      ['What customers said.', 'For your latest jokes: which criteria landed and which missed. It never says by how much.'],
      ['Keep it in view.', 'Pop out opens a window that stays on top while you work. It groups the criteria into "Fix next" and "Keep doing".'],
      ['Your goal.', 'Ship what sells, tell your Joke Maker why, and improve every batch.'],
    ]);
  });

  it('Marketing captions describe the redesigned desk, not the old one', () => {
    const body = (id: string) => captionText(MARKETING_STEPS.find(s => s.id === id)!, R1);
    expect(body('mk-title')).toMatch(/topic/);
    expect(body('mk-title')).toMatch(/title/);
    expect(body('mk-title')).not.toMatch(/chips/i);
    expect(body('mk-expand')).toContain('window');
    expect(body('mk-expand')).toContain('Fix next');
    expect(body('mk-expand')).not.toContain('Expand');
    expect(body('mk-next')).toContain('top of the Marketing desk');
    for (const step of MARKETING_STEPS) {
      const all = `${step.title} ${captionText(step, R1)}`;
      for (const old of ['Expand', 'chips', 'All Clear', 'Split the batch', 'Pick the winners —']) expect(all).not.toContain(old);
      expect(all).not.toMatch(/[—!]/);
    }
    // Marketing's own note is never quoted: only the note step talks about it.
    expect(MARKETING_STEPS.filter(s => /note/i.test(captionText(s, R1))).map(s => s.id)).toEqual(['mk-note']);
  });

  it('every amount comes from the round: non-default fees show in the captions', () => {
    const odd: TourMoney = {
      marketPrice: 2, costOfPublishing: 0.25, costOfDiscard: 0.05,
      shippingFeeSmall: 0.5, shippingFeeStandard: 1.5, shippingFeeLarge: 4,
      storageFeePerJokeMinute: 0.1, hostingFeePerJokeMinute: 0.025,
    };
    const mk = stepsFor('QUALITY_CONTROL', { roundNumber: 1, fees: odd }).map(s => s.body);
    expect(mk[0]).toBe('You decide which jokes go to market. Listing a joke costs $0.25, and each sale earns $2.');
    expect(mk[3]).toContain('(discarding costs $0.05)');
    expect(mk[8]).toContain('pays storage (10¢ a joke each minute), and an unsold joke pays hosting (2.5¢ a joke each minute).');
    expect(stepsFor('JOKE_MAKER', { roundNumber: 1, fees: odd })[4].body).toBe(
      'Each batch of 5 costs $1.50 to ship, so keep them coming but make them count.',
    );
    expect(stepsFor('JOKE_MAKER', { roundNumber: 2, fees: odd })[4].body).toBe(
      'You choose the size now: $0.50 for 1–4 jokes, $1.50 for 5, $4 for 6–10. Smaller batches come back with feedback sooner.',
    );
  });

  it('the scoreboard and fees captions describe the Scoreboard and "Fees and wait times", not the old tiles', () => {
    const find = (steps: ReadonlyArray<{ id: string }>, id: string) => steps.find(x => x.id === id)!;
    const jm = find(JOKE_MAKER_STEPS, 'jm-scoreboard') as unknown as { body: string };
    const mkFees = find(MARKETING_STEPS, 'mk-fees') as unknown as { body: (r: TourRound) => string };
    expect(jm.body).toContain('Team rank, by profit');
    expect(jm.body).toContain('Fees and wait times');
    for (const steps of [JOKE_MAKER_STEPS, MARKETING_STEPS]) {
      for (const step of steps) {
        const body = captionText(step, R1);
        expect(body).not.toContain('More numbers');
        expect(body).not.toContain('Jokes Sold / Made');
      }
    }
    expect(mkFees.body(R1)).toContain('Fees and wait times');
  });

  it('Joke Maker captions use the redesigned screen words, never the old stage names', () => {
    for (const step of JOKE_MAKER_STEPS) {
      const text = captionText(step, R1);
      for (const old of ['In review', 'On market', 'wasted', 'sold or', 'dots']) expect(text).not.toContain(old);
      expect(text).not.toMatch(/[—!]/);
    }
    // Marketing's note is only mentioned by its own step: it is meant to be found inside the opened batch.
    const mentions = JOKE_MAKER_STEPS.filter(s => /note/i.test(captionText(s, R1))).map(s => s.id);
    expect(mentions).toEqual(['jm-note']);
  });

  it('captionText leaves a plain caption alone', () => {
    expect(captionText(JOKE_MAKER_STEPS[0], R1)).toBe(JOKE_MAKER_STEPS[0].body);
  });

  it('"12 criteria" is still the number of criteria the customers judge', () => {
    expect(DIMENSIONS).toHaveLength(12);
  });
});
