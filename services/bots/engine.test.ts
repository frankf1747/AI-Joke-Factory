// services/bots/engine.test.ts
import { describe, it, expect } from 'vitest';
import { DEFAULT_IDEAL_PROFILE } from '../../config/dimensions';
import { variedCorpus } from '../shared/jokes';
import { BotEngine, fitPieces, splitBlob, titleOf, wallClockSteps } from './engine';
import { botName, isBotName } from './naming';
import { BATCH_CAP_PER_ROUND } from './personas';
import type { FromWorker, StartOptions } from './protocol';
import { FakeWorld } from './testing/fakeApi';

const nextTick = () => new Promise<void>(resolve => setImmediate(resolve));

function setup(humans: string[] = []) {
  const world = new FakeWorld();
  const instructorId = world.addUser('Instructor', 'INSTRUCTOR');
  for (const name of humans) world.addUser(name);
  let clock = 0;
  const emitted: FromWorker[] = [];
  const engine = new BotEngine({
    api: world.api(),
    instructorUserId: instructorId,
    // Advances fake time and yields a macrotask, so waiting tests get a turn.
    delay: ms => { clock += ms; return nextTick(); },
    now: () => clock,
    emit: m => { emitted.push(m); },
    seed: 'engine-test',
  });
  return { world, engine, emitted };
}

async function until(condition: () => boolean, what: string): Promise<void> {
  for (let i = 0; i < 50_000; i++) {
    if (condition()) return;
    await nextTick();
  }
  throw new Error(`timed out waiting for: ${what}`);
}

async function settle(ticks: number): Promise<void> {
  for (let i = 0; i < ticks; i++) await nextTick();
}

function options(overrides: Partial<StartOptions> = {}): StartOptions {
  return {
    roundId: 1,
    teams: [{ index: 1, persona: 'SPRAY' }],
    speed: 10,
    startRound: true,
    idealProfile: { ...DEFAULT_IDEAL_PROFILE },
    ...overrides,
  };
}

const teamOf = (world: FakeWorld, name: string) => world.userNamed(name)?.teamId ?? null;

describe('BotEngine', () => {
  it('puts humans on the lowest team and each bot team on its own team', async () => {
    const { world, engine } = setup(['alice', 'bob']);
    await engine.start(options({ teams: [{ index: 1, persona: 'SPRAY' }, { index: 2, persona: 'CAREFUL' }], startRound: false }));
    engine.stop();

    const alice = world.userNamed('alice');
    const bob = world.userNamed('bob');
    expect(alice?.teamId).toBe(1);
    expect(bob?.teamId).toBe(1);
    expect(new Set([alice?.role, bob?.role])).toEqual(new Set(['JM', 'MARKETING']));
    for (const [index, team] of [[1, 2], [2, 3]] as const) {
      expect(world.userNamed(botName(index, 'A'))).toMatchObject({ teamId: team, role: 'JM' });
      expect(world.userNamed(botName(index, 'B'))).toMatchObject({ teamId: team, role: 'MARKETING' });
    }
  });

  it('surfaces the backend refusal when the round has no ideal profile', async () => {
    const { engine } = setup();
    await expect(engine.start(options({ idealProfile: undefined }))).rejects.toMatchObject({ status: 409 });
    expect(engine.status().running).toBe(false);
  });

  it('plays: Spray publishes every joke, Careful publishes two', async () => {
    const { world, engine } = setup();
    await engine.start(options({ teams: [{ index: 1, persona: 'SPRAY' }, { index: 2, persona: 'CAREFUL' }] }));
    const spray = teamOf(world, botName(1, 'A'));
    const careful = teamOf(world, botName(2, 'A'));
    await until(
      () => world.decisions.filter(d => d.teamId === spray).length >= 2
        && world.decisions.filter(d => d.teamId === careful).length >= 2,
      'two publishes from each team',
    );
    engine.stop();

    for (const d of world.decisions.filter(x => x.teamId === spray)) expect(d).toMatchObject({ published: 5, total: 5 });
    for (const d of world.decisions.filter(x => x.teamId === careful)) expect(d).toMatchObject({ published: 2, total: 5 });
  });

  it('stops every actor', async () => {
    const { world, engine } = setup();
    await engine.start(options({ teams: [{ index: 1, persona: 'SPRAY' }, { index: 2, persona: 'BALANCED' }] }));
    await until(() => world.decisions.length >= 1, 'a first publish');
    engine.stop();
    await settle(200);
    const callsAfterStop = world.calls.length;
    await settle(2_000);
    expect(world.calls.length).toBe(callsAfterStop);
    expect(engine.status().running).toBe(false);
  });

  it('keeps playing when one bot keeps failing', async () => {
    const { world, engine } = setup();
    world.failNext('submitBatch', 1_000_000, botName(1, 'A'));
    await engine.start(options({ teams: [{ index: 1, persona: 'SPRAY' }, { index: 2, persona: 'SPRAY' }] }));
    const healthy = teamOf(world, botName(2, 'A'));
    await until(
      () => world.decisions.some(d => d.teamId === healthy) && engine.status().teams[0].jm.error !== null,
      'team 2 publishing while team 1 errors',
    );
    engine.stop();

    const broken = teamOf(world, botName(1, 'A'));
    expect(world.decisions.filter(d => d.teamId === broken)).toHaveLength(0);
    expect(engine.status().teams[0].jm.error).toContain('INTERNAL');
  });

  it('stops submitting at the per-round batch cap', async () => {
    const { world, engine } = setup();
    await engine.start(options());
    await until(() => engine.status().teams[0].jm.activity.includes('cap'), 'the batch cap');
    engine.stop();
    const team = teamOf(world, botName(1, 'A'));
    expect(world.batches.filter(b => b.teamId === team)).toHaveLength(BATCH_CAP_PER_ROUND);
  });

  it('pauses every bot when seats are re-shuffled, and resumes after re-forming', async () => {
    const { world, engine } = setup();
    await engine.start(options({ startRound: false }));
    const bot = world.userNamed(botName(1, 'A'));
    if (!bot) throw new Error('bot 01A missing');
    bot.teamId = 999;
    await until(() => engine.status().scrambled, 'scramble detection');

    await engine.reform();
    expect(engine.status().scrambled).toBe(false);
    expect(world.userNamed(botName(1, 'A'))).toMatchObject({ teamId: 1, role: 'JM' });
    engine.stop();
  });

  it('removes bots and only bots', async () => {
    const { world, engine } = setup(['alice', 'bob']);
    await engine.start(options({ startRound: false }));
    const removed = await engine.remove(1);
    expect(removed).toBe(2);
    expect([...world.users.values()].map(u => u.name).sort()).toEqual(['Instructor', 'alice', 'bob']);
    expect(engine.status()).toMatchObject({ running: false, teams: [] });
  });

  it('narrates each decision for watchers', async () => {
    const { world, engine, emitted } = setup();
    await engine.start(options());
    await until(() => world.decisions.length >= 1, 'a publish');
    engine.stop();

    const marketer = world.userNamed(botName(1, 'B'));
    if (!marketer) throw new Error('bot 01B missing');
    expect(engine.historyFor(marketer.id).map(e => e.text).join('\n')).toMatch(/Spray: keeping 5 of 5/);
    expect(engine.metaFor(marketer.id)).toMatchObject({ teamIndex: 1, seat: 'B', persona: 'SPRAY' });
    expect(emitted.some(m => m.type === 'log' && m.entry.botUserId === marketer.id)).toBe(true);
  });

  it('probes the lobby and round', async () => {
    const { engine, emitted } = setup(['alice']);
    await engine.start(options({ startRound: false }));
    engine.stop();
    expect(await engine.probe(1)).toEqual({ humans: 1, bots: 2, roundStatus: 'CONFIGURED' });
    expect(emitted[emitted.length - 1]).toMatchObject({ type: 'probe' });
    expect(engine.status().warnings.join(' ')).toMatch(/alice has no human partner/);
  });

  it('refuses a round that has already ended, before seating anyone', async () => {
    const { world, engine } = setup();
    world.round.status = 'ENDED';
    await expect(engine.start(options())).rejects.toThrow(/ENDED/);
    expect([...world.users.values()].some(u => isBotName(u.name))).toBe(false);
  });

  it('Careful gives up when feedback never arrives, then keeps playing', async () => {
    const { world, engine } = setup();
    world.autoClassify = false;
    await engine.start(options({ teams: [{ index: 1, persona: 'CAREFUL' }] }));
    const jm = world.userNamed(botName(1, 'A'));
    if (!jm) throw new Error('bot 01A missing');
    await until(() => engine.historyFor(jm.id).some(e => /gave up waiting/.test(e.text)), 'the feedback timeout');
    await until(() => world.decisions.length >= 2, 'a second batch after giving up');
    engine.stop();
  });

  it('publishes an inherited batch that does not split cleanly into the round-1 count', async () => {
    const { world, engine } = setup();
    await engine.start(options({ startRound: false }));
    const team = teamOf(world, botName(1, 'A'));
    if (team == null) throw new Error('bot team missing');
    // Adjust this literal to FakeBatch's required fields if the fake has grown more.
    world.batches.push({
      id: world.newBatchId(), teamId: team, state: 'QUEUED', lockedBy: null, jokes: [],
      rawText: 'A joke nobody on this team wrote, told as one long rambling story\n\n!!! and a tail',
    });
    world.round.status = 'ACTIVE';
    world.profileConfigured = true;
    await until(() => world.decisions.some(d => d.teamId === team), 'the inherited batch to publish');
    engine.stop();
    expect(world.decisions[0]).toMatchObject({ teamId: team, total: 5 });
  });

  it('treats a lost batch (403) as a re-poll, not an error', async () => {
    const { world, engine } = setup();
    world.failNext('marketingPublish', 1, botName(1, 'B'), 403);
    await engine.start(options());
    const team = teamOf(world, botName(1, 'A'));
    await until(() => world.decisions.some(d => d.teamId === team), 'a publish after the lost batch');
    engine.stop();
    expect(engine.status().teams[0].marketing.error).toBeNull();
  });
});

describe('wallClockSteps', () => {
  const total = (steps: Iterable<number>) => [...steps].reduce((a, b) => a + b, 0);

  it('divides the 1× duration by the speed', () => {
    expect(total(wallClockSteps(150_000, () => 1))).toBeCloseTo(150_000);
    expect(total(wallClockSteps(150_000, () => 10))).toBeCloseTo(15_000);
  });

  it('never sleeps longer than one tick, so a speed change lands within a second', () => {
    expect(Math.max(...wallClockSteps(150_000, () => 1))).toBeLessThanOrEqual(1_000);
  });

  it('re-reads the speed on every tick', () => {
    let calls = 0;
    expect(total(wallClockSteps(150_000, () => (calls++ < 10 ? 1 : 10)))).toBeCloseTo(24_000);
  });
});

describe('splitBlob', () => {
  it('cuts on blank lines and trims', () => {
    expect(splitBlob('a\n\n  b \n \nc')).toEqual(['a', 'b', 'c']);
  });
});

describe('titleOf', () => {
  it('uses the curated title for a corpus joke', () => {
    expect(titleOf(variedCorpus[0].text)).toBe(variedCorpus[0].title);
  });

  it('falls back instead of throwing on text it does not know', () => {
    expect(titleOf('A brand new joke about ducks')).toBe('A brand new joke');
  });

  it('never returns an empty title, which publish would reject', () => {
    expect(titleOf('!!! ???')).toBe('Untitled joke');
  });
});

describe('fitPieces', () => {
  it('merges extra pieces into the last one for round 1', () => {
    expect(fitPieces(['a b', 'c', 'd', 'e', 'f', 'g'], 5, 1)).toEqual(['a b', 'c', 'd', 'e', 'f g']);
  });

  it('halves the longest piece until round 1 has enough, keeping the text in order', () => {
    const out = fitPieces(['one two three four', 'five six'], 5, 1);
    expect(out).toHaveLength(5);
    expect(out.join(' ')).toBe('one two three four five six');
  });

  it('only caps later rounds, never pads them', () => {
    expect(fitPieces(['a', 'b'], 5, 2)).toEqual(['a', 'b']);
    expect(fitPieces(['a', 'b', 'c', 'd', 'e', 'f'], 5, 2)).toHaveLength(5);
  });

  it('drops blank pieces first', () => {
    expect(fitPieces(['a', '  ', 'b'], 2, 1)).toEqual(['a', 'b']);
  });

  it('halves by character when there are too few words, never cutting an emoji or CJK character', () => {
    const knock = fitPieces(['Knock-knock!'], 5, 1);
    expect(knock).toHaveLength(5);
    expect(knock.join('')).toBe('Knock-knock!');

    const cjk = fitPieces(['为什么程序员分不清万圣节和圣诞节'], 5, 1);
    expect(cjk).toHaveLength(5);
    expect(cjk.join('')).toBe('为什么程序员分不清万圣节和圣诞节');

    const emoji = fitPieces(['🤖🤖🤖🤖🤖🤖'], 5, 1);
    expect(emoji).toHaveLength(5);
    for (const piece of emoji) expect(Array.from(piece).every(ch => ch === '🤖')).toBe(true);
  });
});
