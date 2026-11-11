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

describe('how the Joke Maker reads notes', () => {
  /** A world where customers say nothing, so the only notes are the ones a test writes. */
  function quiet() {
    const ctx = setup();
    ctx.world.feedbackFor = () => ({ good_dimensions: [], improve_dimensions: [] });
    return ctx;
  }
  const one = (over: Partial<StartOptions['teams'][number]> = {}): StartOptions => ({
    roundId: 1, speed: 10, startRound: true, idealProfile: { ...DEFAULT_IDEAL_PROFILE },
    teams: [{ index: 1, persona: 'BALANCED', useFeedback: true, releaseAll: true, ...over }],
  });
  const titleOf = (text: string) => index.byText.get(normalizeJokeText(text))!.title;
  const inject = (world: FakeWorld, teamId: number | null, note: string): void => {
    world.batches.push({
      id: world.newBatchId(), roundId: world.round.id, teamId: teamId as number, rawText: null, jokes: [],
      state: 'DONE', lockedBy: null, processedAt: world.nextProcessedAt(), note,
    });
  };
  const reads = (logs: string[]): number[] => logs
    .map(l => /^1A: read Marketing's note on (\d+) joke/.exec(l))
    .filter((m): m is RegExpExecArray => m != null)
    .map(m => Number(m[1]));

  it('a line about a title this Joke Maker did not send (human or another team) changes nothing', async () => {
    const control = quiet();
    await control.engine.start(one());
    const [cid] = control.engine.status().teams.map(t => t.teamId);
    await until(() => teamBatches(control.world, cid).length >= 6, 'six control batches');
    control.engine.stop();

    const { world, engine, logs } = quiet();
    await engine.start(one());
    const [on] = engine.status().teams.map(t => t.teamId);
    await until(() => teamBatches(world, on).length >= 1, 'a first batch');
    const foreign = corpus.jokes[corpus.jokes.length - 1].title;
    inject(world, on, [
      `On "${foreign}": Keep: Topic, Humor Style. Change: Length. Length: shorter.`,
      'Great batch, keep going!',
      'On "Something a human typed": Change: Topic.',
    ].join('\n'));
    await until(() => teamBatches(world, on).filter(b => b.jokes.length || b.rawText).length >= 6, 'six batches');
    engine.stop();

    const mine = teamBatches(world, on).filter(b => b.rawText || b.jokes.length);
    expect(mine.flatMap(textsOf).map(titleOf)).not.toContain(foreign);
    expect(reads(logs)).toEqual([]);
    expect(mine.slice(0, 6).map(textsOf)).toEqual(teamBatches(control.world, cid).slice(0, 6).map(textsOf));
  });

  it('a note read at several draws is applied once', async () => {
    const { world, engine, logs } = quiet();
    await engine.start(one());
    const [on] = engine.status().teams.map(t => t.teamId);
    await until(() => teamBatches(world, on).length >= 1, 'a first batch');
    const mine = textsOf(teamBatches(world, on)[0]).map(titleOf);
    inject(world, on, `On "${mine[0]}": Keep: Topic. Change: Humor Style.`);
    await until(() => teamBatches(world, on).filter(b => b.rawText || b.jokes.length).length >= 7, 'seven batches');
    engine.stop();
    expect(reads(logs)).toEqual([1]);
  });

  it('two notes that land between the same two draws are both applied', async () => {
    const { world, engine, logs } = quiet();
    await engine.start(one());
    const [on] = engine.status().teams.map(t => t.teamId);
    await until(() => teamBatches(world, on).length >= 2, 'two batches');
    const [first, second] = teamBatches(world, on).slice(0, 2).map(b => textsOf(b).map(titleOf)[0]);
    // Both land in the same tick: whichever draw reads them sees two unread notes.
    inject(world, on, `On "${first}": Keep: Topic. Change: Humor Style.`);
    inject(world, on, `On "${second}": Keep: Energy. Change: Length. Length: shorter.`);
    await until(() => teamBatches(world, on).filter(b => b.rawText || b.jokes.length).length >= 7, 'seven batches');
    engine.stop();
    expect(reads(logs).reduce((a, n) => a + n, 0)).toBe(2);
  });

  it('refuses a round2BatchSize that is not a whole number of at least 1', async () => {
    for (const bad of [0, -3, 2.5, Number.NaN]) {
      const { engine } = setup();
      await expect(engine.start(twins({ round2BatchSize: bad }))).rejects.toThrow(/round2BatchSize/);
    }
  });
});
