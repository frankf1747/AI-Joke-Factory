// services/bots/engine.test.ts
import { describe, it, expect } from 'vitest';
import { DEFAULT_IDEAL_PROFILE } from '../../config/dimensions';
import { seededRng, variedCorpus } from '../shared/jokes';
import { BotEngine, fitPieces, splitBlob, titleOf, wallClockSteps } from './engine';
import { botName, isBotName } from './naming';
import { BATCH_CAP_PER_ROUND } from './personas';
import type { BotApi } from './api';
import type { FromWorker, StartOptions } from './protocol';
import { FakeWorld, type FakeUser } from './testing/fakeApi';

const nextTick = () => new Promise<void>(resolve => setImmediate(resolve));

interface Hooks {
  /** Called after each message is recorded; lets a test act mid-operation. */
  onEmit?: (message: FromWorker) => void;
  /** Wraps the fake client, e.g. to hold a request in flight. */
  wrapApi?: (api: BotApi) => BotApi;
}

function setup(humans: string[] = [], hooks: Hooks = {}) {
  const world = new FakeWorld();
  const instructorId = world.addUser('Instructor', 'INSTRUCTOR');
  for (const name of humans) world.addUser(name);
  let clock = 0;
  const emitted: FromWorker[] = [];
  const api = world.api();
  const engine = new BotEngine({
    api: hooks.wrapApi ? hooks.wrapApi(api) : api,
    instructorUserId: instructorId,
    // Advances fake time and yields a macrotask, so waiting tests get a turn.
    delay: ms => { clock += ms; return nextTick(); },
    now: () => clock,
    emit: m => { emitted.push(m); hooks.onEmit?.(m); },
    seed: 'engine-test',
  });
  return { world, engine, emitted, clock: () => clock };
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

/**
 * Holds chosen calls in flight until release(), to model a slow network. In
 * 'request' mode the call reaches the backend only on release; in 'response'
 * mode it lands at once and only the reply is late.
 */
class Gate {
  private held: Array<{ method: string; go: () => void }> = [];
  private methods = new Set<string>();
  private mode: 'request' | 'response' = 'request';

  /** How many calls are held, optionally of one method. */
  count(method?: string): number {
    return this.held.filter(h => method === undefined || h.method === method).length;
  }

  hold(method: string, mode: 'request' | 'response'): void {
    this.methods.add(method);
    this.mode = mode;
  }

  stopHolding(method?: string): void {
    if (method === undefined) this.methods.clear();
    else this.methods.delete(method);
  }

  /** Let held calls go, optionally only those of one method. */
  release(method?: string): void {
    const go = this.held.filter(h => method === undefined || h.method === method);
    this.held = this.held.filter(h => !go.includes(h));
    for (const h of go) h.go();
  }

  wrap(api: BotApi): BotApi {
    return new Proxy(api, {
      get: (target, prop, receiver) => {
        const value: unknown = Reflect.get(target, prop, receiver);
        if (prop === 'as') return (id: number, label: string) => this.wrap(target.as(id, label));
        if (typeof value !== 'function') return value;
        const method = String(prop);
        return (...args: unknown[]) => {
          const call = () => (value as (...a: unknown[]) => Promise<unknown>).apply(target, args);
          if (!this.methods.has(method)) return call();
          const released = new Promise<void>(go => this.held.push({ method, go }));
          if (this.mode === 'request') return released.then(call);
          const result = call();
          result.catch(() => undefined); // observed later, after release
          return released.then(() => result);
        };
      },
    });
  }
}

const teamOf = (world: FakeWorld, name: string) => world.userNamed(name)?.teamId ?? null;

/** Every human team holds exactly one JM and one Marketing, and no bot. */
function expectCleanHumanTeams(world: FakeWorld): void {
  const byTeam = new Map<number, FakeUser[]>();
  for (const u of world.participants()) {
    if (u.teamId == null) continue;
    byTeam.set(u.teamId, [...(byTeam.get(u.teamId) ?? []), u]);
  }
  for (const [teamId, members] of byTeam) {
    if (!members.some(m => !isBotName(m.name))) continue;
    const layout = members.map(m => `${m.name}:${m.role}`).sort();
    expect({ teamId, layout }).toEqual({
      teamId,
      layout: expect.arrayContaining([expect.stringMatching(/:JM$/), expect.stringMatching(/:MARKETING$/)]),
    });
    expect({ teamId, size: members.length, bots: members.filter(m => isBotName(m.name)).length })
      .toEqual({ teamId, size: 2, bots: 0 });
  }
}

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

  it('refuses a second start while the first is still starting, and stop() halts the one that ran', async () => {
    const { world, engine } = setup();
    const first = engine.start(options({ startRound: false }));
    const second = engine.start(options({ startRound: false }));
    await first;
    await expect(second).rejects.toThrow(/already running/);
    engine.stop();
    await settle(200);
    const callsAfterStop = world.calls.length;
    await settle(2_000);
    expect(world.calls.length).toBe(callsAfterStop);
  });

  it('stop() cancels a start that is still seating bots', async () => {
    let stopped = false;
    const { world, engine } = setup([], {
      onEmit: m => {
        if (stopped || m.type !== 'status') return;
        if (m.status.teams.length > 0 && m.status.teams.every(t => t.jm.activity === 'joined')) {
          stopped = true;
          engine.stop();
        }
      },
    });
    await engine.start(options());
    expect(stopped).toBe(true);
    await settle(200);
    expect(world.round.status).toBe('CONFIGURED');
    expect(world.calls).not.toContain('sessionMe');
    expect(engine.status().running).toBe(false);
  });

  it('runs overlapping re-forms one at a time, so no human team is left stranded', async () => {
    const { world, engine } = setup(['alice', 'bob', 'carol', 'dave', 'erin', 'frank']);
    // Like the real shuffle (usecase/instructor.go, r.Shuffle), each Auto-Assign
    // deals seats in a different order. Seeded, so the interleaving is repeatable.
    world.assignOrder = (ps, call) => {
      const rand = seededRng(`assign:${call}`);
      const out = [...ps].sort((a, b) => a.id - b.id);
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    };
    await engine.start(options({ teams: [{ index: 1, persona: 'SPRAY' }, { index: 2, persona: 'SPRAY' }], startRound: false }));
    expectCleanHumanTeams(world);
    await Promise.all([engine.reform(), engine.reform()]);
    engine.stop();
    expectCleanHumanTeams(world);
    for (const index of [1, 2]) {
      const team = teamOf(world, botName(index, 'A'));
      expect(world.userNamed(botName(index, 'B'))).toMatchObject({ teamId: team, role: 'MARKETING' });
      expect(world.userNamed(botName(index, 'A'))).toMatchObject({ role: 'JM' });
    }
  });

  it('leaves every seat exactly "stopped" after stop()', async () => {
    const { world, engine } = setup();
    await engine.start(options({ teams: [{ index: 1, persona: 'SPRAY' }, { index: 2, persona: 'CAREFUL' }] }));
    await until(() => world.decisions.length >= 1, 'a first publish');
    engine.stop();
    await settle(200);
    for (const team of engine.status().teams) {
      expect([team.jm.activity, team.marketing.activity]).toEqual(['stopped', 'stopped']);
    }
  });

  it("does not let a stopped run's in-flight seat check pause the next run", async () => {
    const gate = new Gate();
    const { world, engine } = setup([], { wrapApi: api => gate.wrap(api) });
    await engine.start(options({ startRound: false }));
    gate.hold('sessionMe', 'request');
    await until(() => gate.count('sessionMe') >= 2, 'both actors mid seat-check');
    engine.stop();
    gate.stopHolding();
    // Between runs the instructor pressed the ordinary Auto-Assign.
    const bot = world.userNamed(botName(1, 'A'));
    if (!bot) throw new Error('bot 01A missing');
    bot.teamId = 999;
    // The next run is still seating its bots when the old checks come back.
    gate.hold('sessionJoin', 'request');
    const restart = engine.start(options({ startRound: false }));
    await until(() => gate.count('sessionJoin') >= 1, 'the next run joining');
    gate.release('sessionMe');
    await settle(5);
    gate.stopHolding();
    gate.release();
    await restart;
    await settle(50);
    expect(engine.status().scrambled).toBe(false);
    engine.stop();
  });

  it('does not count a publish from a stopped run in the next run', async () => {
    const gate = new Gate();
    const { world, engine } = setup([], { wrapApi: api => gate.wrap(api) });
    gate.hold('marketingPublish', 'response');
    await engine.start(options());
    await until(() => gate.count() >= 1, 'a publish in flight');
    expect(world.decisions).toHaveLength(1);
    engine.stop();
    gate.stopHolding();
    const restart = engine.start(options({ startRound: false }));
    gate.release();
    await restart;
    expect(engine.status().classificationCalls).toBe(0);
    engine.stop();
  });

  it("does not re-add a removed bot's history from a late response", async () => {
    const gate = new Gate();
    const { world, engine } = setup([], { wrapApi: api => gate.wrap(api) });
    gate.hold('marketingPublish', 'response');
    await engine.start(options());
    const marketer = world.userNamed(botName(1, 'B'));
    if (!marketer) throw new Error('bot 01B missing');
    await until(() => gate.count() >= 1, 'a publish in flight');
    gate.stopHolding();
    await engine.remove(1);
    gate.release();
    await settle(50);
    expect(engine.historyFor(marketer.id)).toEqual([]);
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
