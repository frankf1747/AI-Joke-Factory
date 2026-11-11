import { describe, expect, it } from 'vitest';
import { DEFAULT_IDEAL_PROFILE } from '../../config/dimensions';
import { seededRng } from '../shared/jokes';
import { traitClassification, traitFit, type TraitJoke, type Traits } from '../shared/traitCorpus';
import { loadTraitCorpus } from '../../scripts/traits/loadTraitCorpus';
import type { FeedbackJoke } from '../../types/api';
import {
  NOTE_MAX, applyFeedback, beliefScore, composeNote, emptyBelief, noteLine, parseNote, pickBatch, seededOrder,
} from './feedbackLoop';
import { simulateFeedback } from './testing/feedbackSim';

const corpus = loadTraitCorpus();
const IDEAL = { ...DEFAULT_IDEAL_PROFILE } as Traits;

const fb = (id: number, title: string, good: string[], improve: string[], hints: Record<string, string> = {}): FeedbackJoke => ({
  joke_id: id, joke_title: title, was_bought: false,
  good_dimensions: good as FeedbackJoke['good_dimensions'],
  improve_dimensions: improve as FeedbackJoke['improve_dimensions'],
  improve_hints: hints as FeedbackJoke['improve_hints'],
});

describe('the note', () => {
  it('says, per joke, what landed, what missed and which way to move, in plain words', () => {
    expect(noteLine({
      title: 'Office Memo No. 3', landed: ['TOPIC', 'LENGTH'],
      missed: [{ dim: 'HUMOR_STYLE' }, { dim: 'ENERGY', direction: 'LOWER' }],
    })).toBe('On "Office Memo No. 3": Keep: Topic, Length. Change: Humor Style, Energy. Energy: calmer.');
    expect(noteLine({ title: 'T', landed: [], missed: [{ dim: 'SETUP_PAYOFF', direction: 'HIGHER' }] }))
      .toBe('On "T": Change: Setup→Payoff. Setup→Payoff: longer build-up.');
  });

  it('reports only scored jokes it has not reported before, newest first', () => {
    const jokes = [
      fb(3, 'C', ['TOPIC'], ['LENGTH'], { LENGTH: 'LOWER' }),
      fb(2, 'B', [], []),
      fb(1, 'A', ['ENERGY'], []),
    ];
    const out = composeNote(jokes, new Set([1]));
    expect(out).toEqual({ note: 'On "C": Keep: Topic. Change: Length. Length: shorter.', reported: [3] });
    expect(composeNote(jokes, new Set([1, 3]))).toEqual({ note: '', reported: [] });
  });

  it(`stays within the backend's ${NOTE_MAX} characters, dropping whole lines`, () => {
    const all = ['LENGTH', 'TOPIC', 'HUMOR_STYLE', 'COMPLEXITY', 'EDGINESS', 'STRUCTURE'];
    const many = Array.from({ length: 8 }, (_, i) => fb(i + 1, `A long title for joke number ${i + 1}`, all, all));
    const out = composeNote(many, new Set());
    expect(Array.from(out.note).length).toBeLessThanOrEqual(NOTE_MAX);
    expect(out.reported.length).toBe(out.note.split('\n').length);
    expect(out.reported.length).toBeGreaterThan(0);
  });

  it('a title with double quotes round-trips through composeNote and parseNote', () => {
    const title = 'The "Final" Notice, No. 4';
    const out = composeNote([fb(7, title, ['TOPIC'], ['ENERGY'], { ENERGY: 'LOWER' })], new Set());
    expect(parseNote(out.note)).toEqual([
      { title, landed: ['TOPIC'], missed: [{ dim: 'ENERGY', direction: 'LOWER' }] },
    ]);
  });

  it('parses back exactly what it says, and ignores anything else', () => {
    const note = [
      'On "Office Memo No. 3": Keep: Topic, Length. Change: Humor Style, Energy. Energy: calmer.',
      'Great batch, keep going!',
      'On "Pet Report No. 9": Change: Setup→Payoff, Weather. Setup→Payoff: longer build-up. Topic: sideways.',
    ].join('\n');
    expect(parseNote(note)).toEqual([
      { title: 'Office Memo No. 3', landed: ['TOPIC', 'LENGTH'], missed: [{ dim: 'HUMOR_STYLE' }, { dim: 'ENERGY', direction: 'LOWER' }] },
      { title: 'Pet Report No. 9', landed: [], missed: [{ dim: 'SETUP_PAYOFF', direction: 'HIGHER' }] },
    ]);
    expect(parseNote(null)).toEqual([]);
    expect(parseNote('')).toEqual([]);
  });
});

describe('the Joke Maker\'s picture of what customers want', () => {
  const joke: Traits = { ...IDEAL, TOPIC: 'Food', LENGTH: 'Long', ENERGY: 'High-energy', HUMOR_STYLE: 'Pun' };

  it('keeps a landed category, avoids a missed categorical one, moves one step on a missed scale, leaves the rest', () => {
    const b = applyFeedback(emptyBelief(), joke, {
      title: 't', landed: ['HUMOR_STYLE'],
      missed: [{ dim: 'TOPIC' }, { dim: 'LENGTH', direction: 'LOWER' }, { dim: 'ENERGY', direction: 'HIGHER' }],
    });
    expect(b.want).toEqual({ HUMOR_STYLE: 'Pun', LENGTH: 'Medium', ENERGY: 'High-energy' });
    expect(b.avoid).toEqual({ TOPIC: ['Food'], LENGTH: ['Long'], ENERGY: ['High-energy'] });
  });

  it('drops a wanted category that later missed, and ignores Title Fit (it has no ideal)', () => {
    let b = applyFeedback(emptyBelief(), joke, { title: 't', landed: ['TOPIC', 'TITLE_FIT'], missed: [] });
    expect(b.want).toEqual({ TOPIC: 'Food' });
    b = applyFeedback(b, joke, { title: 't', landed: [], missed: [{ dim: 'TOPIC' }, { dim: 'TITLE_FIT' }] });
    expect(b.want).toEqual({});
    expect(b.avoid).toEqual({ TOPIC: ['Food'] });
  });

  it('a missed scale without a direction is avoided like a category', () => {
    const b = applyFeedback(emptyBelief(), joke, { title: 't', landed: [], missed: [{ dim: 'COMPLEXITY' }] });
    expect(b.want).toEqual({});
    expect(b.avoid).toEqual({ COMPLEXITY: ['Moderate'] });
  });

  it('scores a joke +1 per wanted category, +0.5 one step off a wanted scale, −1 per avoided one', () => {
    const b = { want: { TOPIC: 'Work', LENGTH: 'Medium' }, avoid: { HUMOR_STYLE: ['Pun'] } };
    expect(beliefScore(b, IDEAL)).toBe(2);
    expect(beliefScore(b, joke)).toBe(-0.5); // Long is one step off Medium, Pun is avoided
    expect(beliefScore(b, { ...IDEAL, LENGTH: 'Short' })).toBe(1.5);
  });
});

describe('pickBatch', () => {
  const order = seededOrder(corpus.jokes, seededRng('pick'));

  it('with nothing learned follows the seeded order, skipping jokes already used this round', () => {
    expect(pickBatch(corpus.jokes, order, emptyBelief(), new Set(), 3).map(j => j.id)).toEqual(order.slice(0, 3));
    expect(pickBatch(corpus.jokes, order, emptyBelief(), new Set(order.slice(0, 2)), 3).map(j => j.id)).toEqual(order.slice(2, 5));
  });

  it('takes the jokes that best match what it believes, never one already used', () => {
    const belief = { want: { TOPIC: 'Work', HUMOR_STYLE: 'Observational', STRUCTURE: 'Setup–punchline' }, avoid: {} };
    const first = pickBatch(corpus.jokes, order, belief, new Set(), 3);
    for (const j of first) expect(beliefScore(belief, j.traits)).toBe(3);
    const next = pickBatch(corpus.jokes, order, belief, new Set(first.map(j => j.id)), 3);
    expect(next.some(j => first.includes(j))).toBe(false);
  });

  it('is the same order for the same seed, a different one for another', () => {
    expect(seededOrder(corpus.jokes, seededRng('a'))).toEqual(seededOrder(corpus.jokes, seededRng('a')));
    expect(seededOrder(corpus.jokes, seededRng('a'))).not.toEqual(seededOrder(corpus.jokes, seededRng('b')));
  });

  it('refuses a batch larger than what is left', () => {
    expect(() => pickBatch(corpus.jokes, order, emptyBelief(), new Set(order.slice(2)), 3)).toThrow(RangeError);
  });
});

/**
 * The whole loop without the engine: each batch is released, the backend's
 * feedback on the team's latest 3 released jokes goes into the next release's
 * note (one batch behind, as in a class), and the Joke Maker reads it before
 * writing. Ten batches of 3, twenty seeds, against the pilot's ideal.
 */
function learningCurve(seed: string, useFeedback: boolean): number[] {
  const byTitle = new Map(corpus.jokes.map(j => [j.title, j]));
  const order = seededOrder(corpus.jokes, seededRng(seed));
  let belief = emptyBelief();
  const used = new Set<string>();
  const released: Array<{ id: number; joke: TraitJoke }> = [];
  const reported = new Set<number>();
  let note = '';
  const curve: number[] = [];
  for (let b = 0; b < 10; b++) {
    if (useFeedback) for (const e of parseNote(note)) belief = applyFeedback(belief, (byTitle.get(e.title) as TraitJoke).traits, e);
    const batch = pickBatch(corpus.jokes, order, belief, used, 3);
    for (const j of batch) used.add(j.id);
    curve.push(batch.reduce((s, j) => s + traitFit(j, DEFAULT_IDEAL_PROFILE), 0) / batch.length);
    const said = [...released].reverse().slice(0, 3).map(r => ({
      joke_id: r.id, joke_title: r.joke.title, was_bought: false,
      ...simulateFeedback(r.id, traitClassification(r.joke), DEFAULT_IDEAL_PROFILE),
    }));
    const composed = composeNote(said, reported);
    for (const id of composed.reported) reported.add(id);
    note = composed.note;
    batch.forEach((joke, k) => released.push({ id: 1000 + 10 * b + k, joke }));
  }
  return curve;
}

describe('the loop, offline', () => {
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const seeds = Array.from({ length: 20 }, (_, i) => `loop-${i}`);
  const on = seeds.map(s => learningCurve(s, true));
  const off = seeds.map(s => learningCurve(s, false));

  it('twins write the same first two batches: feedback cannot arrive before the third', () => {
    for (let i = 0; i < seeds.length; i++) expect(on[i].slice(0, 2)).toEqual(off[i].slice(0, 2));
  });

  it('with feedback the mean fit of later batches rises well above the twin that ignores it', () => {
    const late = (cs: number[][]) => mean(cs.map(c => mean(c.slice(4))));
    expect(late(on)).toBeGreaterThan(late(off) + 2);
    expect(late(off)).toBeLessThan(mean(off.map(c => c[0])) + 1);
  });
});
