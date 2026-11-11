// services/bots/engine.feedback.test.ts — bots that use feedback (spec 2026-11-10 §4), against the in-memory backend.
import { describe, expect, it } from 'vitest';
import { DEFAULT_IDEAL_PROFILE } from '../../config/dimensions';
import { loadTraitCorpus } from '../../scripts/traits/loadTraitCorpus';
import { indexTraitCorpus, normalizeJokeText, traitClassification, traitFit } from '../shared/traitCorpus';
import { BotEngine, splitBlob } from './engine';
import { parseNote } from './feedbackLoop';
import type { FromWorker, StartOptions } from './protocol';
import { FakeWorld, type FakeBatch } from './testing/fakeApi';
import { simulateFeedback } from './testing/feedbackSim';

const corpus = loadTraitCorpus();
const index = indexTraitCorpus(corpus);
const nextTick = () => new Promise<void>(resolve => setImmediate(resolve));

/** A world whose customers judge corpus jokes against the pilot's ideal, as the trait classifier would. */
function setup(withCorpus = true) {
  const world = new FakeWorld();
  world.feedbackFor = joke => {
    const traits = index.byText.get(normalizeJokeText(joke.joke_text));
    return traits
      ? simulateFeedback(joke.joke_id, traitClassification(traits), DEFAULT_IDEAL_PROFILE)
      : { good_dimensions: [], improve_dimensions: [] };
  };
  const instructorId = world.addUser('Instructor', 'INSTRUCTOR');
  let clock = 0;
  const logs: string[] = [];
  const engine = new BotEngine({
    api: world.api(),
    instructorUserId: instructorId,
    delay: ms => { clock += ms; return nextTick(); },
    now: () => clock,
    emit: (m: FromWorker) => { if (m.type === 'log') logs.push(`${m.entry.teamIndex}${m.entry.seat}: ${m.entry.text}`); },
    seed: 'feedback-test',
    ...(withCorpus ? { traitCorpus: corpus } : {}),
  });
  return { world, engine, logs };
}

async function until(condition: () => boolean, what: string): Promise<void> {
  for (let i = 0; i < 50_000; i++) {
    if (condition()) return;
    await nextTick();
  }
  throw new Error(`timed out waiting for: ${what}`);
}

const twins = (over: Partial<StartOptions['teams'][number]> = {}): StartOptions => ({
  roundId: 1, speed: 10, startRound: true, idealProfile: { ...DEFAULT_IDEAL_PROFILE },
  teams: [
    { index: 1, persona: 'BALANCED', useFeedback: true, releaseAll: true, ...over },
    { index: 2, persona: 'BALANCED', useFeedback: false, releaseAll: true, deckIndex: 1, ...over },
  ],
});

const teamBatches = (world: FakeWorld, teamId: number | null): FakeBatch[] => world.batches.filter(b => b.teamId === teamId);
const textsOf = (b: FakeBatch): string[] => (b.jokes.length ? b.jokes.map(j => j.joke_text) : splitBlob(b.rawText ?? ''));

describe('bots that use feedback', () => {
  it('refuses to start a useFeedback team without the trait corpus', async () => {
    const { engine } = setup(false);
    await expect(engine.start(twins())).rejects.toThrow(/traitCorpus/);
  });

  it('Marketing sends a plain-words note with each release; the Joke Maker reads it; the twin neither sends nor reads', async () => {
    const { world, engine, logs } = setup();
    await engine.start(twins());
    const [on, off] = engine.status().teams.map(t => t.teamId);
    await until(() => teamBatches(world, on).length >= 5 && teamBatches(world, off).length >= 5, 'five batches each');
    engine.stop();

    const notes = teamBatches(world, on).map(b => b.note).filter((n): n is string => !!n);
    expect(notes.length).toBeGreaterThan(0);
    for (const note of notes) {
      expect(note).toMatch(/^On "[^"]+": (Keep|Change): /);
      expect(parseNote(note).length).toBeGreaterThan(0);
    }
    expect(teamBatches(world, off).every(b => !b.note)).toBe(true);
    expect(logs.some(l => l.startsWith('1A: read Marketing\'s note'))).toBe(true);
    expect(logs.some(l => l.startsWith('2A: read Marketing\'s note'))).toBe(false);
    expect(logs.some(l => l.startsWith('1B: note to the Joke Maker: On "'))).toBe(true);
  });

  it('twins draw the same starting jokes, only corpus jokes, never one twice in a round', async () => {
    const { world, engine } = setup();
    await engine.start(twins());
    const [on, off] = engine.status().teams.map(t => t.teamId);
    await until(() => teamBatches(world, on).length >= 4 && teamBatches(world, off).length >= 4, 'four batches each');
    engine.stop();
    expect(textsOf(teamBatches(world, on)[0])).toEqual(textsOf(teamBatches(world, off)[0]));
    for (const team of [on, off]) {
      const texts = teamBatches(world, team).flatMap(textsOf);
      expect(texts.every(t => index.byText.has(normalizeJokeText(t)))).toBe(true);
      expect(new Set(texts).size).toBe(texts.length);
    }
  });

  it('titles each corpus joke with its corpus title, and releaseAll publishes every joke', async () => {
    const { world, engine } = setup();
    await engine.start(twins());
    await until(() => world.decisions.length >= 4, 'four decisions');
    engine.stop();
    for (const d of world.decisions) expect(d.published).toBe(d.total);
    const published = world.batches.flatMap(b => b.jokes).filter(j => j.published);
    expect(published.length).toBeGreaterThan(0);
    for (const j of published) expect(j.title).toBe(index.byText.get(normalizeJokeText(j.joke_text))?.title);
  });

  it('the feedback team\'s later batches fit the hidden ideal better than its twin\'s', async () => {
    const { world, engine } = setup();
    await engine.start(twins());
    const [on, off] = engine.status().teams.map(t => t.teamId);
    await until(() => teamBatches(world, on).length >= 8 && teamBatches(world, off).length >= 8, 'eight batches each');
    engine.stop();
    const fitOf = (b: FakeBatch) => {
      const fits = textsOf(b).map(t => traitFit(index.byText.get(normalizeJokeText(t))!, DEFAULT_IDEAL_PROFILE));
      return fits.reduce((a, x) => a + x, 0) / fits.length;
    };
    const late = (team: number | null) => teamBatches(world, team).slice(4, 8).map(fitOf).reduce((a, x) => a + x, 0) / 4;
    expect(late(on)).toBeGreaterThan(late(off) + 1);
  });

  it('a Round 2 batch size per team overrides the persona\'s, capped at the round\'s batch_size', async () => {
    const { world, engine } = setup();
    world.round = { ...world.round, round_number: 2, batch_size: 10, max_batch_size: 10 };
    await engine.start(twins({ round2BatchSize: 3 }));
    const [on] = engine.status().teams.map(t => t.teamId);
    await until(() => teamBatches(world, on).length >= 2, 'two batches');
    engine.stop();
    for (const b of teamBatches(world, on)) expect(textsOf(b)).toHaveLength(3);
  });
});
