import { describe, expect, it } from 'vitest';
import {
  jokeMakerInputFrom, jokeMakerNextStep, marketingInputFrom, marketingNextStep, quoteNote,
  type JokeMakerStepInput, type MarketingStepInput,
} from './nextStep';
import type { Batch, Joke } from '../types';
import type { FeedbackRow } from '../views/feedback';

const NOW = 1_000_000_000;
const s = (seconds: number) => seconds * 1000;

const jm = (over: Partial<JokeMakerStepInput> = {}): JokeMakerStepInput => ({
  now: NOW, roundActive: true, roundNumber: 1, marketingBacklog: 1, lastSentAt: NOW - s(10), lastBatchJokes: 5,
  latestNote: null, ...over,
});
const mk = (over: Partial<MarketingStepInput> = {}): MarketingStepInput => ({
  now: NOW, roundActive: true, storageFeePerJokeMinute: 0.1, deskBatchSentAt: null, deskEmpty: false,
  lastDecision: null, topFixNext: null, ...over,
});

describe('Joke Maker next step', () => {
  it('rule 1: the round has not started', () => {
    expect(jokeMakerNextStep(jm({ roundActive: false, latestNote: { text: 'More puns', batchSentAt: NOW } })))
      .toEqual({ text: 'Get your AI tool ready — the round starts soon.', tone: 'info' });
  });

  it('rule 2: quotes Marketing\'s note on the latest processed batch for 2 minutes after it was sent', () => {
    const note = (ago: number) => jm({ latestNote: { text: 'Shorter setups, more puns.', batchSentAt: NOW - s(ago) } });
    expect(jokeMakerNextStep(note(119))).toEqual({
      text: 'Marketing says: “Shorter setups, more puns.” — use it in your next batch.', tone: 'info',
    });
    expect(jokeMakerNextStep(note(120)).text).toContain('Marketing says');
    expect(jokeMakerNextStep(note(121)).text).not.toContain('Marketing says');
  });

  it('rule 2: cuts a long note at 80 characters and keeps it on one line', () => {
    const long = `${'a'.repeat(79)}bc and more`;
    expect(quoteNote(long)).toBe(`${'a'.repeat(79)}b…`);
    expect(quoteNote('x'.repeat(80))).toBe('x'.repeat(80));
    expect(quoteNote('Line one.\n\n  Line two.')).toBe('Line one. Line two.');
    expect(quoteNote(`${'😀'.repeat(81)}`)).toBe(`${'😀'.repeat(80)}…`);
    expect(jokeMakerNextStep(jm({ latestNote: { text: long, batchSentAt: NOW } })).text)
      .toBe(`Marketing says: “${'a'.repeat(79)}b…” — use it in your next batch.`);
  });

  it('rule 2: a blank note says nothing', () => {
    expect(jokeMakerNextStep(jm({ latestNote: { text: '   ', batchSentAt: NOW } })).text).not.toContain('Marketing says');
  });

  it('rule 3: Round 2, a last batch of 6 or more jokes', () => {
    expect(jokeMakerNextStep(jm({ roundNumber: 2, lastBatchJokes: 6 }))).toEqual({
      text: 'Big batches wait longer for feedback — try 2 or 3 jokes next.', tone: 'warn',
    });
    expect(jokeMakerNextStep(jm({ roundNumber: 2, lastBatchJokes: 5 })).tone).toBe('info');
    expect(jokeMakerNextStep(jm({ roundNumber: 1, lastBatchJokes: 8 })).text).not.toContain('Big batches');
    expect(jokeMakerNextStep(jm({ roundNumber: 2, lastBatchJokes: null })).text).not.toContain('Big batches');
  });

  it('rule 4: Marketing\'s desk is empty', () => {
    expect(jokeMakerNextStep(jm({ marketingBacklog: 0 }))).toEqual({
      text: "Marketing's desk is empty — send your next batch of 5.", tone: 'info',
    });
    expect(jokeMakerNextStep(jm({ roundNumber: 2, marketingBacklog: 0 })).text)
      .toBe("Marketing's desk is empty — send a small batch now.");
    expect(jokeMakerNextStep(jm({ marketingBacklog: null, lastSentAt: NOW })).text)
      .toBe('Keep writing — every batch is another chance to sell.');
  });

  it('rule 5: no batch sent for 90 s', () => {
    expect(jokeMakerNextStep(jm({ lastSentAt: NOW - s(90) }))).toEqual({
      text: 'No batch sent in 90 s — keep the line moving.', tone: 'warn',
    });
    expect(jokeMakerNextStep(jm({ lastSentAt: NOW - s(89) })).tone).toBe('info');
    expect(jokeMakerNextStep(jm({ lastSentAt: null })).tone).toBe('info');
  });

  it('rule 6: otherwise', () => {
    expect(jokeMakerNextStep(jm())).toEqual({ text: 'Keep writing — every batch is another chance to sell.', tone: 'info' });
  });

  it('the first matching rule wins', () => {
    const all = jm({
      roundNumber: 2, latestNote: { text: 'Go short', batchSentAt: NOW - s(5) }, lastBatchJokes: 10,
      marketingBacklog: 0, lastSentAt: NOW - s(200),
    });
    expect(jokeMakerNextStep(all).text).toContain('Marketing says');
    expect(jokeMakerNextStep({ ...all, latestNote: null }).text).toContain('Big batches');
    expect(jokeMakerNextStep({ ...all, latestNote: null, lastBatchJokes: 3 }).text).toContain('desk is empty');
    expect(jokeMakerNextStep({ ...all, latestNote: null, lastBatchJokes: 3, marketingBacklog: 2 }).text).toContain('No batch sent');
  });
});

describe('Marketing next step', () => {
  it('rule 1: the round has not started', () => {
    expect(marketingNextStep(mk({ roundActive: false, deskBatchSentAt: NOW - s(300) }))).toEqual({
      text: "Watch the desk — your Joke Maker's first batch is coming.", tone: 'info',
    });
  });

  it('rule 2: a batch on the desk for 45 s or more, priced at the round\'s storage fee', () => {
    expect(marketingNextStep(mk({ deskBatchSentAt: NOW - s(45) }))).toEqual({
      text: "Batch waiting 45 s — release what's good enough. Storage costs 10¢ a joke each minute.", tone: 'warn',
    });
    expect(marketingNextStep(mk({ deskBatchSentAt: NOW - s(44) })).tone).toBe('info');
    expect(marketingNextStep(mk({ deskBatchSentAt: NOW - s(130.9), storageFeePerJokeMinute: 0.25 })).text)
      .toBe("Batch waiting 130 s — release what's good enough. Storage costs 25¢ a joke each minute.");
  });

  it('rule 3: the last decision discarded 60 % or more of a batch', () => {
    expect(marketingNextStep(mk({ lastDecision: { published: 2, discarded: 3 } }))).toEqual({
      text: "You discarded 3 of 5 last time — customers can only buy what's on the shelf.", tone: 'warn',
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
      text: 'Desk is clear — nudge your Joke Maker to send the next batch.', tone: 'info',
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
    expect(marketingNextStep(all).text).toContain('Batch waiting 60 s');
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
      now: NOW, roundActive: true, roundNumber: 2, marketingBacklog: 1, lastSentAt: NOW - s(20), lastBatchJokes: null,
      latestNote: { text: 'Go shorter', batchSentAt: NOW - s(100) },
    });
  });

  it('the Joke Maker sees no note when the latest processed batch has none, and no backlog before the summary loads', () => {
    const batches = [
      batch(1, { status: 'PROCESSED', submittedAt: NOW - s(100), ratedAt: NOW - s(90), jokes: [joke(1)], marketing_note: 'Go shorter' }),
      batch(2, { status: 'PROCESSED', submittedAt: NOW - s(50), ratedAt: NOW - s(30), jokes: [joke(2), joke(3)], marketing_note: null }),
    ];
    const input = jokeMakerInputFrom({ now: NOW, roundActive: true, round: 1, teamSummary: null, batches });
    expect(input.latestNote).toBeNull();
    expect(input.marketingBacklog).toBeNull();
    expect(input.lastBatchJokes).toBe(2);
    expect(jokeMakerInputFrom({ now: NOW, roundActive: true, round: 1, teamSummary: null, batches: [] }))
      .toMatchObject({ lastSentAt: null, lastBatchJokes: null, latestNote: null });
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
      now: NOW, roundActive: true, storageFeePerJokeMinute: 0.1, teamSummary: { unprocessed_batches: 1 },
      qcQueue: { batch: { submitted_at: desk } }, batches, feedbackRows: rows,
    });
    expect(input).toEqual({
      now: NOW, roundActive: true, storageFeePerJokeMinute: 0.1, deskBatchSentAt: NOW - s(50), deskEmpty: false,
      lastDecision: { published: 1, discarded: 2 }, topFixNext: 'Wordplay',
    });
  });

  it('Marketing\'s desk is empty only when nothing is claimed and nothing waits; unknown before the summary loads', () => {
    const base = { now: NOW, roundActive: true, storageFeePerJokeMinute: 0.1, batches: [], feedbackRows: [] };
    expect(marketingInputFrom({ ...base, teamSummary: { unprocessed_batches: 0 }, qcQueue: null }).deskEmpty).toBe(true);
    expect(marketingInputFrom({ ...base, teamSummary: { unprocessed_batches: 2 }, qcQueue: null }).deskEmpty).toBe(false);
    expect(marketingInputFrom({ ...base, teamSummary: null, qcQueue: null })).toMatchObject({
      deskEmpty: null, deskBatchSentAt: null, lastDecision: null, topFixNext: null,
    });
  });
});
