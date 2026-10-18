import { describe, expect, it } from 'vitest';
import {
  jokeMakerInputFrom, jokeMakerNextStep, marketingInputFrom, marketingNextStep,
  type JokeMakerStepInput, type MarketingStepInput,
} from './nextStep';
import type { Batch, Joke } from '../types';
import type { FeedbackRow } from '../views/feedback';

const NOW = 1_000_000_000;
const s = (seconds: number) => seconds * 1000;

const jm = (over: Partial<JokeMakerStepInput> = {}): JokeMakerStepInput => ({
  now: NOW, roundActive: true, classOver: false, roundNumber: 1, marketingBacklog: 1, lastSentAt: NOW - s(10), lastBatchJokes: 5,
  ...over,
});
const mk = (over: Partial<MarketingStepInput> = {}): MarketingStepInput => ({
  now: NOW, roundActive: true, classOver: false, storageFeePerJokeMinute: 0.05, deskBatchSentAt: null, deskEmpty: false,
  lastDecision: null, topFixNext: null, ...over,
});

describe('Joke Maker next step', () => {
  it('rule 1: the round has not started', () => {
    expect(jokeMakerNextStep(jm({ roundActive: false })))
      .toEqual({ text: 'Get your AI tool ready. The round starts soon.', tone: 'info' });
  });

  it('after the final round has ended: join the debrief, whatever else is true', () => {
    expect(jokeMakerNextStep(jm({ roundActive: false, classOver: true, roundNumber: 2, marketingBacklog: 0 })))
      .toEqual({ text: 'Round over. Join the debrief.', tone: 'info' });
  });

  it('Marketing\'s note never reaches the Next step line: students find it inside the batch', () => {
    const batches = [
      batch(1, { status: 'PROCESSED', submittedAt: NOW - s(60), ratedAt: NOW - s(5), jokes: [joke(1, true)], marketing_note: 'Go shorter' }),
    ];
    const input = jokeMakerInputFrom({ now: NOW, roundActive: true, round: 1, teamSummary: { unprocessed_batches: 1 }, batches });
    expect(input).not.toHaveProperty('latestNote');
    const step = jokeMakerNextStep(input);
    expect(step.text).not.toContain('Go shorter');
    expect(step.text).not.toContain('Marketing says');
    expect(step).toEqual({ text: 'Keep writing. Every batch is another chance to sell.', tone: 'info' });
  });


  it('rule 3: Round 2, a last batch of 6 or more jokes', () => {
    expect(jokeMakerNextStep(jm({ roundNumber: 2, lastBatchJokes: 6 }))).toEqual({
      text: 'Big batches wait longer for feedback. Try 2 or 3 jokes next.', tone: 'warn',
    });
    expect(jokeMakerNextStep(jm({ roundNumber: 2, lastBatchJokes: 5 })).tone).toBe('info');
    expect(jokeMakerNextStep(jm({ roundNumber: 1, lastBatchJokes: 8 })).text).not.toContain('Big batches');
    expect(jokeMakerNextStep(jm({ roundNumber: 2, lastBatchJokes: null })).text).not.toContain('Big batches');
  });

  it('rule 4: Marketing\'s desk is empty', () => {
    expect(jokeMakerNextStep(jm({ marketingBacklog: 0 }))).toEqual({
      text: "Marketing's desk is empty. Send your next batch of 5.", tone: 'info',
    });
    expect(jokeMakerNextStep(jm({ roundNumber: 2, marketingBacklog: 0 })).text)
      .toBe("Marketing's desk is empty. Send a small batch now.");
    expect(jokeMakerNextStep(jm({ marketingBacklog: null, lastSentAt: NOW })).text)
      .toBe('Keep writing. Every batch is another chance to sell.');
  });

  it('rule 5: no batch sent for 90 s', () => {
    expect(jokeMakerNextStep(jm({ lastSentAt: NOW - s(90) }))).toEqual({
      text: 'No batch sent in 90 s. Keep the line moving.', tone: 'warn',
    });
    expect(jokeMakerNextStep(jm({ lastSentAt: NOW - s(89) })).tone).toBe('info');
    expect(jokeMakerNextStep(jm({ lastSentAt: null })).tone).toBe('info');
  });

  it('rule 6: otherwise', () => {
    expect(jokeMakerNextStep(jm())).toEqual({ text: 'Keep writing. Every batch is another chance to sell.', tone: 'info' });
  });

  it('the first matching rule wins', () => {
    const all = jm({
      roundNumber: 2, lastBatchJokes: 10,
      marketingBacklog: 0, lastSentAt: NOW - s(200),
    });
    expect(jokeMakerNextStep(all).text).toContain('Big batches');
    expect(jokeMakerNextStep({ ...all, lastBatchJokes: 3 }).text).toContain('desk is empty');
    expect(jokeMakerNextStep({ ...all, lastBatchJokes: 3, marketingBacklog: 2 }).text).toContain('No batch sent');
  });
});

describe('Marketing next step', () => {
  it('rule 1: the round has not started', () => {
    expect(marketingNextStep(mk({ roundActive: false, deskBatchSentAt: NOW - s(300) }))).toEqual({
      text: "Watch the desk. Your Joke Maker's first batch is coming.", tone: 'info',
    });
  });

  it('after the final round has ended: join the debrief, whatever else is true', () => {
    expect(marketingNextStep(mk({ roundActive: false, classOver: true, deskBatchSentAt: NOW - s(300) })))
      .toEqual({ text: 'Round over. Join the debrief.', tone: 'info' });
  });

  it('rule 2: a batch on the desk for 45 s or more, priced at the round\'s storage fee', () => {
    expect(marketingNextStep(mk({ deskBatchSentAt: NOW - s(45) }))).toEqual({
      text: "Batch waiting 45 s. Release what's good enough. Storage costs 5¢ a joke each minute.", tone: 'warn',
    });
    expect(marketingNextStep(mk({ deskBatchSentAt: NOW - s(44) })).tone).toBe('info');
    expect(marketingNextStep(mk({ deskBatchSentAt: NOW - s(130.9), storageFeePerJokeMinute: 0.25 })).text)
      .toBe("Batch waiting 2 min 10 s. Release what's good enough. Storage costs 25¢ a joke each minute.");
  });

  it('rule 2: the wait reads in minutes from 60 s, whole minutes from 10 min', () => {
    const waiting = (secs: number) => marketingNextStep(mk({ deskBatchSentAt: NOW - s(secs) })).text;
    expect(waiting(59)).toContain('Batch waiting 59 s.');
    expect(waiting(60)).toContain('Batch waiting 1 min.');
    expect(waiting(120)).toContain('Batch waiting 2 min.');
    expect(waiting(72)).toContain('Batch waiting 1 min 12 s.');
    expect(waiting(599)).toContain('Batch waiting 9 min 59 s.');
    expect(waiting(600)).toContain('Batch waiting 10 min.');
    expect(waiting(3391)).toContain('Batch waiting 56 min.');
  });

  it('rule 2: no storage clause when storage is free (CLASSIC)', () => {
    expect(marketingNextStep(mk({ deskBatchSentAt: NOW - s(45), storageFeePerJokeMinute: 0 })).text)
      .toBe("Batch waiting 45 s. Release what's good enough.");
  });

  it('rule 3: the last decision discarded 60 % or more of a batch', () => {
    expect(marketingNextStep(mk({ lastDecision: { published: 2, discarded: 3 } }))).toEqual({
      text: "You discarded 3 of 5 last time. Customers can only buy what's on the shelf.", tone: 'warn',
    });
    expect(marketingNextStep(mk({ lastDecision: { published: 3, discarded: 2 } })).tone).toBe('info');
    expect(marketingNextStep(mk({ lastDecision: { published: 0, discarded: 0 } })).tone).toBe('info');
  });

  it('rule 4: the top Fix next item', () => {
    expect(marketingNextStep(mk({ topFixNext: 'Wordplay' }))).toEqual({
      text: 'Tell your Joke Maker: fix Wordplay next.', tone: 'info',
    });
  });

  it('rule 5: the desk is empty', () => {
    expect(marketingNextStep(mk({ deskEmpty: true }))).toEqual({
      text: 'Desk is clear. Nudge your Joke Maker to send the next batch.', tone: 'info',
    });
    expect(marketingNextStep(mk({ deskEmpty: null })).text)
      .toBe("Release what's good enough, then tell your Joke Maker what to change.");
  });

  it('rule 6: otherwise', () => {
    expect(marketingNextStep(mk())).toEqual({
      text: "Release what's good enough, then tell your Joke Maker what to change.", tone: 'info',
    });
  });

  it('the first matching rule wins', () => {
    const all = mk({ deskBatchSentAt: NOW - s(60), lastDecision: { published: 1, discarded: 4 }, topFixNext: 'Topic', deskEmpty: true });
    expect(marketingNextStep(all).text).toContain('Batch waiting 1 min.');
    expect(marketingNextStep({ ...all, deskBatchSentAt: NOW - s(10) }).text).toContain('You discarded 4 of 5');
    expect(marketingNextStep({ ...all, deskBatchSentAt: null, lastDecision: null }).text).toContain('fix Topic next');
    expect(marketingNextStep({ ...all, deskBatchSentAt: null, lastDecision: null, topFixNext: null }).text).toContain('Desk is clear');
  });
});

/* ---- Inputs built from the screens' data ---- */

const joke = (id: number, published?: boolean): Joke => ({
  joke_id: id, joke_text: `joke ${id}`, id: String(id), content: `joke ${id}`, is_published: published,
});
const batch = (id: number, over: Partial<Batch>): Batch => ({
  batch_id: id, round_id: 1, team_id: 1, status: 'SUBMITTED', jokes: [], id: String(id), team: '1', round: 1, ...over,
});

describe('inputs from the screens\' data', () => {
  it('the Joke Maker reads its latest sent batch and the latest processed batch\'s note', () => {
    const batches = [
      batch(1, { status: 'PROCESSED', submittedAt: NOW - s(300), ratedAt: NOW - s(250), jokes: [joke(1, true)], marketing_note: 'old note' }),
      batch(2, { status: 'PROCESSED', submittedAt: NOW - s(100), ratedAt: NOW - s(40), jokes: [joke(2, true)], marketing_note: 'Go shorter' }),
      batch(3, { status: 'SUBMITTED', submittedAt: NOW - s(20), jokes: [] }),
    ];
    const input = jokeMakerInputFrom({ now: NOW, roundActive: true, round: 2, teamSummary: { unprocessed_batches: 1 }, batches });
    expect(input).toEqual({
      now: NOW, roundActive: true, classOver: false, roundNumber: 2, marketingBacklog: 1, lastSentAt: NOW - s(20), lastBatchJokes: null,
    });
  });

  it('no backlog before the summary loads; the last batch size comes from the latest sent batch', () => {
    const batches = [
      batch(1, { status: 'PROCESSED', submittedAt: NOW - s(100), ratedAt: NOW - s(90), jokes: [joke(1)], marketing_note: 'Go shorter' }),
      batch(2, { status: 'PROCESSED', submittedAt: NOW - s(50), ratedAt: NOW - s(30), jokes: [joke(2), joke(3)], marketing_note: null }),
    ];
    const input = jokeMakerInputFrom({ now: NOW, roundActive: true, round: 1, teamSummary: null, batches });
    expect(input.marketingBacklog).toBeNull();
    expect(input.lastBatchJokes).toBe(2);
    expect(jokeMakerInputFrom({ now: NOW, roundActive: true, round: 1, teamSummary: null, batches: [] }))
      .toMatchObject({ lastSentAt: null, lastBatchJokes: null });
  });

  it('Marketing reads the desk, the last decision and the top Fix next item', () => {
    const rows: FeedbackRow[] = [
      { joke_id: 1, joke_title: 'a', was_bought: false, good: [], improve: [{ id: 'WORDPLAY', label: 'Wordplay' }] },
      { joke_id: 2, joke_title: 'b', was_bought: false, good: [{ id: 'TOPIC', label: 'Topic' }], improve: [{ id: 'WORDPLAY', label: 'Wordplay' }] },
    ];
    const batches = [
      batch(1, { status: 'PROCESSED', submittedAt: NOW - s(400), ratedAt: NOW - s(300), jokes: [joke(1, true), joke(2, true)] }),
      batch(2, { status: 'PROCESSED', submittedAt: NOW - s(200), ratedAt: NOW - s(100), jokes: [joke(3, true), joke(4, false), joke(5, false)] }),
    ];
    const desk = new Date(NOW - s(50)).toISOString();
    const input = marketingInputFrom({
      now: NOW, roundActive: true, round: 1, storageFeePerJokeMinute: 0.05, teamSummary: { unprocessed_batches: 1 },
      qcQueue: { batch: { submitted_at: desk } }, batches, feedbackRows: rows,
    });
    expect(input).toEqual({
      now: NOW, roundActive: true, classOver: false, storageFeePerJokeMinute: 0.05, deskBatchSentAt: NOW - s(50), deskEmpty: false,
      lastDecision: { published: 1, discarded: 2 }, topFixNext: 'Wordplay',
    });
  });

  it('Marketing\'s desk is empty only when nothing is claimed and nothing waits; unknown before the summary loads', () => {
    const base = { now: NOW, roundActive: true, round: 1, storageFeePerJokeMinute: 0.05, batches: [], feedbackRows: [] };
    expect(marketingInputFrom({ ...base, teamSummary: { unprocessed_batches: 0 }, qcQueue: null }).deskEmpty).toBe(true);
    expect(marketingInputFrom({ ...base, teamSummary: { unprocessed_batches: 2 }, qcQueue: null }).deskEmpty).toBe(false);
    expect(marketingInputFrom({ ...base, teamSummary: null, qcQueue: null })).toMatchObject({
      deskEmpty: null, deskBatchSentAt: null, lastDecision: null, topFixNext: null,
    });
  });
});

describe('the class is over only once the final round has ended', () => {
  const statuses = {
    beforeR1: { 1: 'CONFIGURED', 2: 'CONFIGURED' },
    duringR1: { 1: 'ACTIVE', 2: 'CONFIGURED' },
    betweenRounds: { 1: 'ENDED', 2: 'CONFIGURED' },
    duringR2: { 1: 'ENDED', 2: 'ACTIVE' },
    afterR2: { 1: 'ENDED', 2: 'ENDED' },
    unknown: { 1: null, 2: null },
  } as const;
  const jmLine = (st: (typeof statuses)[keyof typeof statuses], roundActive: boolean, round: number) =>
    jokeMakerNextStep(jokeMakerInputFrom({ now: NOW, roundActive, round, roundStatuses: st, teamSummary: null, batches: [] })).text;
  const mkLine = (st: (typeof statuses)[keyof typeof statuses], roundActive: boolean) =>
    marketingNextStep(marketingInputFrom({
      now: NOW, roundActive, round: 2, roundStatuses: st, storageFeePerJokeMinute: 0.05, teamSummary: null, qcQueue: null, batches: [], feedbackRows: [],
    })).text;

  it('before Round 1 and between rounds, rule 1 stays', () => {
    expect(jmLine(statuses.beforeR1, false, 1)).toBe('Get your AI tool ready. The round starts soon.');
    expect(jmLine(statuses.betweenRounds, false, 2)).toBe('Get your AI tool ready. The round starts soon.');
    expect(mkLine(statuses.betweenRounds, false)).toBe("Watch the desk. Your Joke Maker's first batch is coming.");
    expect(jmLine(statuses.unknown, false, 2)).toBe('Get your AI tool ready. The round starts soon.');
  });

  it('after Round 2 has ended, both seats are sent to the debrief', () => {
    expect(jmLine(statuses.afterR2, false, 2)).toBe('Round over. Join the debrief.');
    expect(mkLine(statuses.afterR2, false)).toBe('Round over. Join the debrief.');
  });

  it('while a round runs, the class is not over', () => {
    expect(jmLine(statuses.duringR1, true, 1)).not.toContain('debrief');
    expect(jmLine(statuses.duringR2, true, 2)).not.toContain('debrief');
    expect(mkLine(statuses.duringR2, true)).not.toContain('debrief');
  });
});

describe("Marketing's last decision comes from the current round only", () => {
  it('ignores a decision from an earlier round (or class) in the rated history', () => {
    const base = {
      now: NOW, roundActive: true, storageFeePerJokeMinute: 0.05, teamSummary: { unprocessed_batches: 1 }, qcQueue: null, feedbackRows: [],
    };
    const r1 = batch(1, { round: 1, status: 'PROCESSED', submittedAt: NOW - s(900), ratedAt: NOW - s(800), jokes: [joke(1, false), joke(2, false), joke(3, false)] });
    // Newer timestamp but still Round 1 (a stale entry): must not count in Round 2.
    const staleR1 = batch(2, { round: 1, status: 'PROCESSED', submittedAt: NOW - s(50), ratedAt: NOW - s(10), jokes: [joke(4, false), joke(5, false)] });
    const r2 = batch(3, { round: 2, status: 'PROCESSED', submittedAt: NOW - s(100), ratedAt: NOW - s(60), jokes: [joke(6, true), joke(7, true), joke(8, false)] });
    expect(marketingInputFrom({ ...base, round: 2, batches: [r1, staleR1] }).lastDecision).toBeNull();
    expect(marketingInputFrom({ ...base, round: 2, batches: [r1, staleR1, r2] }).lastDecision).toEqual({ published: 2, discarded: 1 });
    expect(marketingInputFrom({ ...base, round: 1, batches: [r1, staleR1, r2] }).lastDecision).toEqual({ published: 0, discarded: 2 });
  });

  it('reads list-mapped batches (round_id 0, round set) with a known round id, so rule 3 still fires', () => {
    const base = {
      now: NOW, roundActive: true, round: 2, roundId: 21, storageFeePerJokeMinute: 0.05, teamSummary: { unprocessed_batches: 1 },
      qcQueue: null, feedbackRows: [],
    };
    // mapBatchFromTeamList: the list endpoint has no round_id, so it is 0; round is the fetched round's number.
    const listed = batch(5, { round_id: 0, round: 2, status: 'PROCESSED', submittedAt: NOW - s(90), ratedAt: NOW - s(30), jokes: [joke(1, true), joke(2, false), joke(3, false), joke(4, false)] });
    const previous = batch(4, { round_id: 0, round: 1, status: 'PROCESSED', submittedAt: NOW - s(20), ratedAt: NOW - s(5), jokes: [joke(5, true), joke(6, true)] });
    const input = marketingInputFrom({ ...base, batches: [listed, previous] });
    expect(input.lastDecision).toEqual({ published: 1, discarded: 3 });
    expect(marketingNextStep(input)).toEqual({
      text: "You discarded 3 of 4 last time. Customers can only buy what's on the shelf.", tone: 'warn',
    });
    expect(marketingInputFrom({ ...base, batches: [previous] }).lastDecision).toBeNull();
  });

  it('ignores an earlier class\'s batch of the same round number when the round id is known', () => {
    const base = {
      now: NOW, roundActive: true, round: 1, storageFeePerJokeMinute: 0.05, teamSummary: null, qcQueue: null, feedbackRows: [],
    };
    const oldClass = batch(1, { round_id: 7, round: 1, status: 'PROCESSED', submittedAt: NOW - s(20), ratedAt: NOW - s(10), jokes: [joke(1, false), joke(2, false)] });
    const now = batch(2, { round_id: 21, round: 1, status: 'PROCESSED', submittedAt: NOW - s(90), ratedAt: NOW - s(60), jokes: [joke(3, true)] });
    expect(marketingInputFrom({ ...base, roundId: 21, batches: [oldClass, now] }).lastDecision).toEqual({ published: 1, discarded: 0 });
    expect(marketingInputFrom({ ...base, roundId: 21, batches: [oldClass] }).lastDecision).toBeNull();
  });
});
