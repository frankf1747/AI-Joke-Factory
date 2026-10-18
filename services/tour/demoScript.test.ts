import { describe, expect, it } from 'vitest';
import {
  DEMO_FEEDBACK_JOKE_COUNT, DEMO_JOKES, DEMO_NOTE, DEMO_RAW_BATCH, DEMO_T0, DEMO_TIMES, EARLIER_JOKES, NEXT_BATCH_ID, SENT_BATCH_ID, TYPING_SHARE,
  buildDemoState, demoFrame, demoFrameKey, demoOptionsFor, initialDemoState, revealTyping, typedLength,
  type DemoOptions, type DemoState, type TourMoney,
} from './demoScript';
import { JOKE_MAKER_STEPS, MARKETING_STEPS, stepsFor } from './tourSteps';
import { EMPTY_DEMO_UI } from './demoUi';
import { stepDuration } from './tourMachine';
import { computeProfit, countJokesSold } from '../economics';
import { leanFeesOf, shippingFeeFor } from '../leanMode';
import { jokeDetail, jokeState, type JokeState } from '../jokeState';
import { foundABuyer } from '../scoreboard';
import { jokeMakerInputFrom, jokeMakerNextStep, marketingInputFrom, marketingNextStep } from '../nextStep';
import { toFeedbackRows } from '../../views/feedback';
import { feedbackJokeContext } from '../feedbackJokeContext';
import { TEST_CONFIG } from '../../views/testing/renderWithGame';
import type { TourRole } from './seen';

/** The game's default prices and Lean fees. */
const DEFAULT_FEES: TourMoney = {
  marketPrice: 1, costOfPublishing: 0.1, costOfDiscard: 0.01,
  shippingFeeSmall: 1, shippingFeeStandard: 2, shippingFeeLarge: 3,
  storageFeePerJokeMinute: 0.05, hostingFeePerJokeMinute: 0.05,
};
const ODD_FEES: TourMoney = {
  marketPrice: 2, costOfPublishing: 0.25, costOfDiscard: 0.05,
  shippingFeeSmall: 0.5, shippingFeeStandard: 1.5, shippingFeeLarge: 4,
  storageFeePerJokeMinute: 0.1, hostingFeePerJokeMinute: 0.02,
};
const opts = (role: TourRole, roundNumber: 1 | 2 = 1, fees = DEFAULT_FEES): DemoOptions => ({ role, roundNumber, fees });
const ROLES: TourRole[] = ['JOKE_MAKER', 'QUALITY_CONTROL'];
const ALL: DemoOptions[] = ROLES.flatMap(role => [opts(role, 1), opts(role, 2), opts(role, 2, ODD_FEES)]);

const stepsOf = (o: DemoOptions) => stepsFor(o.role, o);
const indexOf = (o: DemoOptions, id: string) => stepsOf(o).findIndex(s => s.id === id);
const endOf = (o: DemoOptions, k: number) => buildDemoState(stepsOf(o), k, o, stepDuration(stepsOf(o)[k]));
const at = (o: DemoOptions, id: string, elapsedMs = 0) => buildDemoState(stepsOf(o), indexOf(o, id), o, elapsedMs);

/* The game's formulas, written out again here so the script cannot grade its own homework. */
const minutes = (from: number, to: number) => Math.max(0, to - from) / 60_000;
const chargedJokes = (n: number) => (n > 0 ? n : 5);
function expectedFees(s: DemoState) {
  const f = s.options.fees;
  const now = s.ui.clockMs;
  let shipping = 0;
  let storage = 0;
  let hosting = 0;
  for (const b of s.game.batches) {
    const n = chargedJokes(b.jokes.length);
    shipping += shippingFeeFor(n, f);
    const decided = b.status === 'PROCESSED';
    storage += n * minutes(b.submittedAt!, decided ? Math.min(b.ratedAt!, now) : now) * f.storageFeePerJokeMinute;
    if (decided) {
      const unsold = b.jokes.filter(j => j.is_published && !(j.sold_count! > 0)).length;
      hosting += unsold * minutes(b.ratedAt!, now) * f.hostingFeePerJokeMinute;
    }
  }
  return { shipping, storage, hosting };
}
function expectedProfit(s: DemoState): number {
  const decided = s.game.batches.filter(b => b.status === 'PROCESSED');
  const created = decided.reduce((n, b) => n + b.jokes.length, 0);
  const published = decided.reduce((n, b) => n + b.jokes.filter(j => j.is_published).length, 0);
  const sales = s.game.batches.reduce((n, b) => n + b.jokes.reduce((m, j) => m + (j.sold_count ?? 0), 0), 0);
  const f = s.options.fees;
  const fees = expectedFees(s);
  return sales * f.marketPrice - published * f.costOfPublishing - (created - published) * f.costOfDiscard
    - fees.shipping - fees.storage - fees.hosting;
}

describe('the sample data', () => {
  it('has five original one-line placeholder jokes, pasted as a numbered reply', () => {
    expect(DEMO_JOKES).toHaveLength(5);
    expect(new Set(DEMO_JOKES).size).toBe(5);
    for (const j of [...DEMO_JOKES, ...EARLIER_JOKES]) {
      expect(j).not.toContain('\n');
      expect(j.length).toBeLessThanOrEqual(80);
    }
    expect(EARLIER_JOKES.filter(j => DEMO_JOKES.includes(j))).toEqual([]);
    expect(DEMO_RAW_BATCH.split('\n')).toEqual(DEMO_JOKES.map((j, i) => `${i + 1}) ${j}`));
  });

  it('starts as Team Demo in a running Lean round, with one earlier batch on the market, 4 of 5 sold', () => {
    const s = initialDemoState(opts('JOKE_MAKER'));
    expect(s.game.teamNames[s.game.user!.team]).toBe('Team Demo');
    expect(s.game.batches).toHaveLength(1);
    expect(s.game.batches[0].jokes.every(j => j.is_published)).toBe(true);
    expect(countJokesSold(s.game.batches)).toBe(4);
    expect(s.game.config).toMatchObject({ isActive: true, marketMode: 'LEAN', round: 1 });
    expect(s.ui).toEqual({ ...EMPTY_DEMO_UI, clockMs: DEMO_T0 + DEMO_TIMES.tourStart * 1000 });
  });

  it('carries the round number and the round\'s money into the demo game', () => {
    const s = initialDemoState(opts('QUALITY_CONTROL', 2, ODD_FEES));
    expect(s.game.config).toMatchObject({ round: 2, ...ODD_FEES });
  });
});

describe('joke states in the demo (publish_status, published_at, first_sold_at)', () => {
  const o = opts('JOKE_MAKER');
  const sentBatch = (s: DemoState) => s.game.batches.find(b => b.batch_id === SENT_BATCH_ID)!;
  const statesOf = (s: DemoState) => sentBatch(s).jokes.map(j => jokeState(j, sentBatch(s)));

  it('the opened batch shows every state: selling, lost its buyers, no buyer yet and not released', () => {
    const s = at(o, 'jm-note');
    expect(statesOf(s)).toEqual(['selling', 'not-released', 'lost-buyers', 'not-released', 'no-buyer'] satisfies JokeState[]);
    const details = sentBatch(s).jokes.map(j => jokeDetail(j, s.ui.clockMs, sentBatch(s)));
    expect(details).toEqual([
      '1 buyer', 'Not released by Marketing', 'Sold before, swapped out', 'Not released by Marketing', 'No buyer yet, on market 20 s',
    ]);
  });

  it('every published joke in the demo has a title, a publish time and a non-empty detail', () => {
    for (const k of [0, 5, 6, 9]) {
      const s = buildDemoState(stepsOf(o), k, o, 99_999);
      for (const b of s.game.batches) {
        for (const j of b.jokes.filter(x => x.publish_status === 'PUBLISHED')) {
          expect(j.joke_title).toBeTruthy();
          expect(j.published_at).toBeTruthy();
          expect(jokeDetail(j, s.ui.clockMs, b).length).toBeGreaterThan(0);
          // Sold jokes carry first_sold_at; is_published agrees with publish_status.
          if ((j.sold_count ?? 0) > 0) expect(j.first_sold_at).toBeTruthy();
          expect(j.is_published).toBe(true);
        }
      }
    }
  });

  it('the earlier batch is published with 4 of its 5 jokes sold, one still without a buyer', () => {
    const earlier = initialDemoState(o).game.batches[0];
    expect(earlier.jokes.every(j => j.publish_status === 'PUBLISHED' && j.joke_title && j.published_at)).toBe(true);
    expect(earlier.jokes.map(j => jokeState(j, earlier))).toEqual(['no-buyer', 'selling', 'selling', 'selling', 'selling']);
    expect(foundABuyer([earlier])).toBe(4);
  });

  it('a batch waiting for Marketing has only pending jokes, and Marketing\'s dropped jokes are discarded', () => {
    const sent = at(o, 'jm-send', 3000);
    expect(sentBatch(sent).jokes.every(j => j.publish_status === 'PENDING')).toBe(true);
    const dropped = sentBatch(at(o, 'jm-note')).jokes.filter(j => j.publish_status === 'DISCARDED');
    expect(dropped).toHaveLength(2);
    expect(dropped.every(j => j.is_published === false && (j.sold_count ?? 0) === 0)).toBe(true);
  });

  it('the Joke Maker scoreboard counts the jokes that found a buyer', () => {
    const s = endOf(o, stepsOf(o).length - 1);
    // 4 earlier + the first sale + the joke that sold and was swapped out.
    expect(foundABuyer(s.game.batches)).toBe(6);
  });
});

describe('buildDemoState', () => {
  it('is deterministic: the same step and time always rebuild the same state', () => {
    for (const o of ALL) {
      const steps = stepsOf(o);
      for (let k = 0; k < steps.length; k++) {
        expect(buildDemoState(steps, k, o, 2500)).toEqual(buildDemoState(steps, k, o, 2500));
      }
    }
  });

  it('never shares state between builds', () => {
    const o = opts('JOKE_MAKER');
    const k = indexOf(o, 'jm-note');
    const a = buildDemoState(stepsOf(o), k, o);
    a.game.batches.push(a.game.batches[0]);
    a.ui.jmOpenBatchIds.push('x');
    const b = buildDemoState(stepsOf(o), k, o);
    expect(b.game.batches).toHaveLength(2);
    expect(b.ui.jmOpenBatchIds).toEqual([String(SENT_BATCH_ID)]);
    expect(EMPTY_DEMO_UI.jmOpenBatchIds).toEqual([]);
  });

  it('keeps Profit, jokes sold, the backlog and the three fees consistent with the game formulas at every moment', () => {
    for (const o of ALL) {
      const steps = stepsOf(o);
      for (let k = 0; k < steps.length; k++) {
        for (const s of [buildDemoState(steps, k, o, 0), endOf(o, k)]) {
          const sum = s.game.teamSummary!;
          expect(sum.profit!).toBeCloseTo(expectedProfit(s), 10);
          const fees = leanFeesOf(sum.lean);
          const want = expectedFees(s);
          expect(fees.shipping).toBeCloseTo(want.shipping, 10);
          expect(fees.storage).toBeCloseTo(want.storage, 10);
          expect(fees.hosting).toBeCloseTo(want.hosting, 10);
          const decided = s.game.batches.filter(b => b.status === 'PROCESSED');
          expect(sum.jokes_created).toBe(decided.reduce((n, b) => n + b.jokes.length, 0));
          expect(countJokesSold(s.game.batches)).toBeLessThanOrEqual(sum.jokes_created!);
          expect(sum.unprocessed_batches).toBe(s.game.batches.filter(b => b.status === 'SUBMITTED').length);
        }
      }
    }
  });

  it('Joke Maker ends on a plausible scoreboard at the default prices: 5 of 10 jokes sold (11 sales), listing and fees taken off', () => {
    const o = opts('JOKE_MAKER');
    const s = endOf(o, stepsOf(o).length - 1);
    expect(countJokesSold(s.game.batches)).toBe(5);
    expect(s.game.teamSummary!.jokes_created).toBe(10);
    expect(computeProfit({ created: 10, published: 8, sold: 11 }, DEFAULT_FEES)).toBeCloseTo(10.18, 10);
    // Shipping 2 × $2, storage 10 joke-minutes × 5¢, hosting: 1 unsold earlier joke for 270 s and
    // 2 unsold new jokes for 20 s each (the note is read 20 s after the release) × 5¢.
    expect(leanFeesOf(s.game.teamSummary!.lean)).toEqual({
      shipping: 4, storage: expect.closeTo(0.5, 10), hosting: expect.closeTo((310 / 60) * 0.05, 10),
    });
    expect(s.game.teamSummary!.profit!).toBeCloseTo(10.18 - 4 - 0.5 - (310 / 60) * 0.05, 10);
  });

  it('the profit shown at the end of both tours is positive, at the default fees and in Round 2', () => {
    for (const o of [opts('JOKE_MAKER'), opts('QUALITY_CONTROL'), opts('JOKE_MAKER', 2), opts('QUALITY_CONTROL', 2)]) {
      const s = endOf(o, stepsOf(o).length - 1);
      expect(s.game.teamSummary!.profit!).toBeGreaterThan(0);
      expect(s.game.teamSummary!.profit!).toBeLessThan(10);
    }
  });

  it('Joke Maker: the send clears the textbox and the batch waits for Marketing, then comes back with a note', () => {
    const o = opts('JOKE_MAKER');
    expect(at(o, 'jm-send').ui).toMatchObject({ jmDraft: DEMO_RAW_BATCH, jmCertified: true });
    const sent = at(o, 'jm-send', 3000);
    expect(sent.ui).toMatchObject({ jmDraft: '', jmCertified: false });
    expect(sent.game.batches.map(b => [b.batch_id, b.status])).toEqual([[101, 'PROCESSED'], [SENT_BATCH_ID, 'SUBMITTED']]);
    const note = at(o, 'jm-note');
    const released = note.game.batches.find(b => b.batch_id === SENT_BATCH_ID)!;
    expect(released.status).toBe('PROCESSED');
    expect(released.marketing_note).toBe(DEMO_NOTE);
    expect(released.jokes.filter(j => j.is_published)).toHaveLength(3);
    expect(note.ui.jmOpenBatchIds).toEqual([String(SENT_BATCH_ID)]);
  });

  it('Marketing: the batch arrives unsplit, splits into five, three are kept, then it is released', () => {
    const o = opts('QUALITY_CONTROL');
    const before = at(o, 'mk-arrives').game.qcQueue!;
    expect(before.batch!.raw_text).toBe(DEMO_RAW_BATCH);
    expect(before.jokes).toEqual([]);
    expect(before.queue_size).toBe(1);
    expect(at(o, 'mk-arrives', 3000).game.qcQueue!.jokes.map(j => j.joke_text)).toEqual([...DEMO_JOKES]);
    expect(endOf(o, indexOf(o, 'mk-pick')).ui.mkSelectedIds).toHaveLength(3);
    const ready = at(o, 'mk-release');
    for (const id of ready.ui.mkSelectedIds) {
      expect(ready.ui.mkTopics[id]).toBeTruthy();
      expect(ready.ui.mkTitles[id]).toBeTruthy();
    }
    expect(ready.ui.mkNote).toBe(DEMO_NOTE);
    const after = at(o, 'mk-scoreboard');
    expect(after.game.qcQueue).toBeNull();
    expect(after.ui.mkNote).toBe('');
    expect(after.game.teamSummary!.jokes_created).toBe(10);
    expect(after.game.teamSummary!.unprocessed_batches).toBe(0);
  });

  it('Marketing: "Fees add up" opens Fees and wait times and lands the next batch on the desk; the feedback card gets a new read', () => {
    const o = opts('QUALITY_CONTROL');
    expect(at(o, 'mk-scoreboard').ui.feesOpen).toBe(false);
    const fees = at(o, 'mk-fees');
    expect(fees.ui.feesOpen).toBe(true);
    expect(fees.game.qcQueue!.batch!.batch_id).toBe(NEXT_BATCH_ID);
    expect(fees.game.teamSummary!.unprocessed_batches).toBe(1);
    const lean = leanFeesOf(fees.game.teamSummary!.lean);
    expect(lean.shipping).toBe(6);
    expect(lean.storage).toBeGreaterThan(0);
    expect(lean.hosting).toBeGreaterThan(0);
    const feedback = at(o, 'mk-feedback').game.teamFeedback!.jokes[0];
    expect(feedback).toMatchObject({ joke_title: 'To-Do Overload', was_bought: true });
    expect(feedback.good_dimensions.length).toBeGreaterThan(0);
    expect(feedback.improve_dimensions.length).toBeGreaterThan(0);
  });

  it('Marketing: the feedback rows name real demo jokes, are capped at the feedback count and carry five criteria each', () => {
    const o = opts('QUALITY_CONTROL');
    for (const id of ['mk-welcome', 'mk-feedback', 'mk-expand']) {
      const s = at(o, id);
      const rows = toFeedbackRows(s.game.teamFeedback);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.length).toBeLessThanOrEqual(DEMO_FEEDBACK_JOKE_COUNT);
      for (const r of rows) expect(r.good.length + r.improve.length).toBe(5);
      const joined = feedbackJokeContext(rows, s.game.batches);
      // Every column of the pop-out matrix can be headed "B-{id} #{position}" and has its text for the key.
      for (const j of joined) {
        expect(j.batchId).not.toBeNull();
        expect(j.position).not.toBeNull();
        expect(j.text).toBeTruthy();
        expect(j.releasedAt).not.toBeNull();
      }
    }
    const rows = toFeedbackRows(at(o, 'mk-feedback').game.teamFeedback);
    expect(rows).toHaveLength(DEMO_FEEDBACK_JOKE_COUNT);
    expect(rows[0].joke_title).toBe('To-Do Overload');
    const joined = feedbackJokeContext(rows, at(o, 'mk-feedback').game.batches);
    expect(joined.map(j => `B-${j.batchId} #${j.position}`)).toEqual(['B-102 #1', 'B-101 #4', 'B-101 #3']);
  });

  it('the Joke Maker tour never opens Fees and wait times', () => {
    const o = opts('JOKE_MAKER');
    for (let k = 0; k < stepsOf(o).length; k++) expect(endOf(o, k).ui.feesOpen).toBe(false);
  });
});

describe('the Next step line runs the real rules on the demo state', () => {
  const jmLine = (s: DemoState) => jokeMakerNextStep(jokeMakerInputFrom({
    now: s.ui.clockMs, roundActive: s.game.config.isActive, round: s.game.config.round,
    roundStatuses: s.game.roundStatuses, teamSummary: s.game.teamSummary, batches: s.game.batches,
  })).text;
  const mkLine = (s: DemoState) => marketingNextStep(marketingInputFrom({
    now: s.ui.clockMs, roundActive: s.game.config.isActive, round: s.game.config.round, roundId: s.game.roundId,
    roundStatuses: s.game.roundStatuses, storageFeePerJokeMinute: s.game.config.storageFeePerJokeMinute,
    teamSummary: s.game.teamSummary, qcQueue: s.game.qcQueue, batches: s.game.batches,
    feedbackRows: toFeedbackRows(s.game.teamFeedback),
  }));

  it('Joke Maker: desk empty, then keep writing while Marketing has the batch; the note never reaches the line', () => {
    expect(jmLine(at(opts('JOKE_MAKER'), 'jm-welcome'))).toBe("Marketing's desk is empty. Send your next batch of 5.");
    expect(jmLine(at(opts('JOKE_MAKER', 2), 'jm-welcome'))).toBe("Marketing's desk is empty. Send a small batch now.");
    // The Next step step comes first now, before anything is sent, so the line is still the desk-empty one.
    expect(jmLine(at(opts('JOKE_MAKER'), 'jm-next'))).toBe("Marketing's desk is empty. Send your next batch of 5.");
    expect(jmLine(at(opts('JOKE_MAKER'), 'jm-shipping'))).toBe('Keep writing. Every batch is another chance to sell.');
    // The note is read inside the opened batch (the jm-note spotlight), never on the Next step line.
    expect(jmLine(at(opts('JOKE_MAKER'), 'jm-note'))).not.toContain(DEMO_NOTE);
  });

  it('Marketing: the Next step step comes second, with the desk still clear', () => {
    const line = mkLine(at(opts('QUALITY_CONTROL'), 'mk-next'));
    expect(at(opts('QUALITY_CONTROL'), 'mk-next').game.qcQueue).toBeNull();
    expect(line.tone).not.toBe('warn');
    expect(line.text).not.toContain('Batch waiting');
  });

  it('Marketing: once the next batch has waited too long, the line says so, with the round\'s storage fee', () => {
    expect(mkLine(at(opts('QUALITY_CONTROL'), 'mk-fees'))).toEqual({
      tone: 'warn', text: "Batch waiting 52 s. Release what's good enough. Storage costs 5¢ a joke each minute.",
    });
    expect(mkLine(at(opts('QUALITY_CONTROL', 2, ODD_FEES), 'mk-fees')).text).toContain('Storage costs 10¢ a joke each minute.');
  });
});

describe('typing', () => {
  it('types over the first 70 % of the step, and shows the whole text at once with reduced motion', () => {
    expect(TYPING_SHARE).toBe(0.7);
    expect(typedLength(100, 0, 7000, false)).toBe(0);
    expect(typedLength(100, 2450, 7000, false)).toBe(50);
    expect(typedLength(100, 4900, 7000, false)).toBe(100);
    expect(typedLength(100, 9999, 7000, false)).toBe(100);
    expect(typedLength(100, 0, 7000, true)).toBe(100);
  });

  it('cuts only the typing field', () => {
    const ui = { ...EMPTY_DEMO_UI, jmDraft: 'abcdef', mkNote: 'note', mkSelectedIds: [7, 8], mkTitles: { 7: 'Title', 8: 'Other' } };
    expect(revealTyping(ui, 'jmDraft', 2)).toEqual({ ...ui, jmDraft: 'ab' });
    expect(revealTyping(ui, 'mkNote', 0)).toEqual({ ...ui, mkNote: '' });
    expect(revealTyping(ui, 'mkTitle', 3).mkTitles).toEqual({ 7: 'Tit', 8: 'Other' });
  });

  it('Back after typing replays it from nothing; Next mid-typing lands on the whole text', () => {
    const o = opts('JOKE_MAKER');
    const steps = stepsOf(o);
    const write = indexOf(o, 'jm-write');
    expect(demoFrame(steps, write, o, 0, false).ui.jmDraft).toBe('');
    const half = demoFrame(steps, write, o, 2000, false).ui.jmDraft;
    expect(half.length).toBeGreaterThan(0);
    expect(DEMO_RAW_BATCH.startsWith(half)).toBe(true);
    // Next while half typed: the following step starts from the full text.
    expect(demoFrame(steps, write + 1, o, 0, false).ui.jmDraft).toBe(DEMO_RAW_BATCH);
    // Back from there: the machine restarts the step at 0 ms, so the typing replays.
    expect(demoFrame(steps, write, o, 0, false).ui.jmDraft).toBe('');
    // Reduced motion: whole at once.
    expect(demoFrame(steps, write, o, 0, true).ui.jmDraft).toBe(DEMO_RAW_BATCH);
  });

  it('demoFrameKey changes only when the frame can change', () => {
    const o = opts('QUALITY_CONTROL');
    const steps = stepsOf(o);
    const pickStep = indexOf(o, 'mk-pick');
    expect(demoFrameKey(steps, pickStep, 100, false)).toBe(demoFrameKey(steps, pickStep, 1400, false));
    expect(demoFrameKey(steps, pickStep, 1400, false)).not.toBe(demoFrameKey(steps, pickStep, 1500, false));
    const note = indexOf(o, 'mk-note');
    expect(demoFrameKey(steps, note, 100, false)).not.toBe(demoFrameKey(steps, note, 200, false));
    expect(demoFrameKey(steps, note, 100, true)).toBe(demoFrameKey(steps, note, 200, true));
  });
});

describe('demoOptionsFor', () => {
  it('reads the round number, prices and fees from the round, never fixed text', () => {
    expect(demoOptionsFor('QUALITY_CONTROL', { ...TEST_CONFIG, round: 2, ...ODD_FEES })).toEqual(opts('QUALITY_CONTROL', 2, ODD_FEES));
    expect(demoOptionsFor('JOKE_MAKER', TEST_CONFIG)).toEqual(opts('JOKE_MAKER', 1, DEFAULT_FEES));
  });

  it('falls back to the default prices and to no fee for broken values', () => {
    const o = demoOptionsFor('JOKE_MAKER', {
      ...TEST_CONFIG, marketPrice: Number.NaN, costOfPublishing: -1, shippingFeeStandard: Number.NaN, storageFeePerJokeMinute: -0.5,
    });
    expect(o.fees).toMatchObject({ marketPrice: 1, costOfPublishing: 0.1, shippingFeeStandard: 0, storageFeePerJokeMinute: 0 });
  });

  it('builds the same demo whether or not the live round has started', () => {
    expect(demoOptionsFor('JOKE_MAKER', { ...TEST_CONFIG, isActive: true }))
      .toEqual(demoOptionsFor('JOKE_MAKER', { ...TEST_CONFIG, isActive: false, status: 'LOBBY' }));
  });
});

describe('the step lists the script runs on', () => {
  it('every onEnter and beat returns a new state and leaves its input alone', () => {
    for (const step of [...JOKE_MAKER_STEPS, ...MARKETING_STEPS]) {
      for (const f of [step.onEnter, ...(step.beats ?? []).map(b => b.apply)]) {
        if (!f) continue;
        const o = opts(step.id.startsWith('jm') ? 'JOKE_MAKER' : 'QUALITY_CONTROL', 2);
        const s = buildDemoState(stepsOf(o), Math.max(0, indexOf(o, step.id) - 1), o, 99_999);
        const copy = JSON.parse(JSON.stringify(s));
        f(s);
        expect(JSON.parse(JSON.stringify(s))).toEqual(copy);
      }
    }
  });
});
