// services/bots/engine.liveFeedback.test.ts — the "Uses feedback" persona on the graded live jokes, against the in-memory backend.
import { describe, expect, it } from 'vitest';
import { DEFAULT_IDEAL_PROFILE } from '../../config/dimensions';
import { variedCorpus } from '../shared/jokes';
import { indexTraitCorpus, normalizeJokeText, traitClassification, traitFit } from '../shared/traitCorpus';
import { BotEngine, splitBlob } from './engine';
import { GRADED_JOKES } from './gradedJokes';
import type { FromWorker, StartOptions } from './protocol';
import { FakeWorld, type FakeBatch } from './testing/fakeApi';
import { simulateFeedback } from './testing/feedbackSim';

const index = indexTraitCorpus(GRADED_JOKES);
const nextTick = () => new Promise<void>(resolve => setImmediate(resolve));

/** Customers judge each live joke by its graded traits against the default ideal. */
function setup() {
  const world = new FakeWorld();
  world.feedbackFor = joke => {
    const j = index.byText.get(normalizeJokeText(joke.joke_text));
    return j ? simulateFeedback(joke.joke_id, traitClassification(j), DEFAULT_IDEAL_PROFILE) : { good_dimensions: [], improve_dimensions: [] };
  };
  const instructorId = world.addUser('Instructor', 'INSTRUCTOR');
  let clock = 0;
  const logs: string[] = [];
  const engine = new BotEngine({
    api: world.api(), instructorUserId: instructorId,
    delay: ms => { clock += ms; return nextTick(); }, now: () => clock,
    emit: (m: FromWorker) => { if (m.type === 'log') logs.push(`${m.entry.teamIndex}${m.entry.seat}: ${m.entry.text}`); },
    seed: 'live-feedback-test', traitCorpus: GRADED_JOKES,
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

/** What the instructor's panel sends: personas only, no pilot options. */
const panelStart: StartOptions = {
  roundId: 1, speed: 10, startRound: true, idealProfile: { ...DEFAULT_IDEAL_PROFILE },
  teams: [{ index: 1, persona: 'FEEDBACK' }, { index: 2, persona: 'BALANCED' }],
};

const teamBatches = (world: FakeWorld, teamId: number | null): FakeBatch[] => world.batches.filter(b => b.teamId === teamId);
const textsOf = (b: FakeBatch): string[] => (b.jokes.length ? b.jokes.map(j => j.joke_text) : splitBlob(b.rawText ?? ''));
const liveTexts = new Set(variedCorpus.map(j => normalizeJokeText(j.text)));

describe('the "Uses feedback" persona', () => {
  it('sends and reads notes from the panel\'s persona alone; Balanced in the same class does neither, and both write live jokes', async () => {
    const { world, engine, logs } = setup();
    await engine.start(panelStart);
    const [fb, bal] = engine.status().teams.map(t => t.teamId);
    await until(() => teamBatches(world, fb).length >= 5 && teamBatches(world, bal).length >= 5, 'five batches each');
    engine.stop();
    expect(teamBatches(world, fb).some(b => !!b.note)).toBe(true);
    expect(teamBatches(world, bal).every(b => !b.note)).toBe(true);
    expect(logs.some(l => l.startsWith('1A: read Marketing\'s note'))).toBe(true);
    for (const team of [fb, bal]) {
      expect(teamBatches(world, team).flatMap(textsOf).every(t => liveTexts.has(normalizeJokeText(t)))).toBe(true);
    }
  });

  it('its later batches fit the hidden ideal better than Balanced\'s', async () => {
    const { world, engine } = setup();
    await engine.start(panelStart);
    const [fb, bal] = engine.status().teams.map(t => t.teamId);
    await until(() => teamBatches(world, fb).length >= 7 && teamBatches(world, bal).length >= 7, 'seven batches each');
    engine.stop();
    const fitOf = (b: FakeBatch) => {
      const fits = textsOf(b).map(t => traitFit(index.byText.get(normalizeJokeText(t))!, DEFAULT_IDEAL_PROFILE));
      return fits.reduce((a, x) => a + x, 0) / fits.length;
    };
    const late = (team: number | null) => teamBatches(world, team).slice(3, 7).map(fitOf).reduce((a, x) => a + x, 0) / 4;
    expect(late(fb)).toBeGreaterThan(late(bal) + 1);
  });
});
