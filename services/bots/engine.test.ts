// services/bots/engine.test.ts
import { describe, it, expect } from 'vitest';
import { DEFAULT_IDEAL_PROFILE } from '../../config/dimensions';
import { seededRng, variedCorpus } from '../shared/jokes';
import { BotEngine, CAP_REACHED, SEAT_CHECK_MS, WIP_WAIT_ACTIVITY, fitPieces, splitBlob, titleOf, wallClockSteps } from './engine';
import { botName, isBotName } from './naming';
import { Deck } from './deck';
import { JOKE_CAP_PER_ROUND } from './personas';

/** Round 1 batches of 5 reach the 40-joke cap after exactly this many batches. */
const ROUND1_BATCHES_AT_CAP = JOKE_CAP_PER_ROUND / 5;
import type { BotApi } from './api';
import type { BatchSubmitRequest } from '../../types/api';
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
  private held: Array<{ method: string; client: string | null; go: () => void }> = [];
  /** Each held method keeps its own mode, so one hold() never changes another's. */
  private modes = new Map<string, 'request' | 'response'>();

  /** How many calls are held, optionally of one method and one client (the label given to `as`). */
  count(method?: string, client?: string): number {
    return this.held.filter(
      h => (method === undefined || h.method === method) && (client === undefined || h.client === client),
    ).length;
  }

  hold(method: string, mode: 'request' | 'response'): void {
    this.modes.set(method, mode);
  }

  stopHolding(method?: string): void {
    if (method === undefined) this.modes.clear();
    else this.modes.delete(method);
  }

  /** Let held calls go, optionally only those of one method. */
  release(method?: string): void {
    const go = this.held.filter(h => method === undefined || h.method === method);
    this.held = this.held.filter(h => !go.includes(h));
    for (const h of go) h.go();
  }

  wrap(api: BotApi, client: string | null = null): BotApi {
    return new Proxy(api, {
      get: (target, prop, receiver) => {
        const value: unknown = Reflect.get(target, prop, receiver);
        if (prop === 'as') return (id: number, label: string) => this.wrap(target.as(id, label), label);
        if (typeof value !== 'function') return value;
        const method = String(prop);
        return (...args: unknown[]) => {
          const call = () => (value as (...a: unknown[]) => Promise<unknown>).apply(target, args);
          const mode = this.modes.get(method);
          if (mode === undefined) return call();
          const released = new Promise<void>(go => this.held.push({ method, client, go }));
          if (mode === 'request') return released.then(call);
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

  it('stops submitting at the per-round joke cap', async () => {
    const { world, engine } = setup();
    await engine.start(options());
    await until(() => engine.status().teams[0].jm.activity.includes('cap'), 'the batch cap');
    engine.stop();
    const team = teamOf(world, botName(1, 'A'));
    expect(world.batches.filter(b => b.teamId === team)).toHaveLength(ROUND1_BATCHES_AT_CAP);
  });

  it('caps full-batch personas at exactly 8 batches of 5 in round 1', async () => {
    const { world, engine } = setup();
    const personas = ['CAREFUL', 'BALANCED', 'SPRAY'] as const;
    await engine.start(options({ teams: personas.map((persona, i) => ({ index: i + 1, persona })) }));
    await until(() => engine.status().teams.every(t => t.jm.activity.includes(CAP_REACHED)), 'every cap');
    const activity = engine.status().teams[0].jm.activity;
    engine.stop();
    expect(ROUND1_BATCHES_AT_CAP).toBe(8);
    for (let i = 1; i <= personas.length; i++) {
      const team = teamOf(world, botName(i, 'A'));
      expect(world.batches.filter(b => b.teamId === team)).toHaveLength(ROUND1_BATCHES_AT_CAP);
    }
    expect(activity).toBe(`done — 40-joke ${CAP_REACHED}`);
  });

  it('shows a Joke Maker refused by the WIP limit as waiting, not as an idle round', async () => {
    const { world, engine } = setup();
    world.failNext('submitBatch', 1_000_000, botName(1, 'A'), 409, 'WIP_LIMIT_REACHED: Marketing has 2 batches waiting');
    await engine.start(options());
    await until(() => engine.status().teams[0].jm.activity === WIP_WAIT_ACTIVITY, 'the WIP wait');
    engine.stop();
    expect(engine.status().teams[0].jm.error).toBeNull();
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

  it('tells watchers it claims batches only while it would call queue/next itself', async () => {
    const { world, engine } = setup(['alice', 'bob']);
    const marketer = () => world.userNamed(botName(1, 'B'));
    const jm = () => world.userNamed(botName(1, 'A'));
    await engine.start(options({ speed: 10 }));
    const botMarketer = marketer();
    const botJm = jm();
    if (!botMarketer || !botJm) throw new Error('bots missing');

    // Playing normally: the Marketing seat claims, the Joke Maker never does.
    await until(() => engine.metaFor(botMarketer.id)?.claiming === true, 'the marketer claiming');
    expect(engine.metaFor(botJm.id)?.claiming).toBe(false);

    // Auto-Assign swaps the bot marketer onto the human team: every bot pauses.
    const humanMarketer = [...world.users.values()].find(u => !isBotName(u.name) && u.role === 'MARKETING');
    if (!humanMarketer) throw new Error('human marketer missing');
    [botMarketer.teamId, humanMarketer.teamId] = [humanMarketer.teamId, botMarketer.teamId];
    await until(() => engine.status().scrambled, 'scramble detection');
    expect(engine.metaFor(botMarketer.id)?.claiming).toBe(false);

    // Re-forming ends the pause.
    await engine.reform();
    expect(engine.status().scrambled).toBe(false);
    expect(engine.metaFor(botMarketer.id)?.claiming).toBe(true);

    engine.stop();
    expect(engine.metaFor(botMarketer.id)?.claiming).toBe(false);
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

  it('refuses to fill an ACTIVE round, before seating anyone', async () => {
    // The panel's probe can be seconds old: Stop an all-bot run, then Fill at
    // once, and the panel still believes the round is CONFIGURED.
    const { world, engine } = setup();
    world.round.status = 'ACTIVE';
    await expect(engine.start(options({ startRound: false }))).rejects.toThrow(/ACTIVE/);
    expect([...world.users.values()].some(u => isBotName(u.name))).toBe(false);
    expect(engine.status().running).toBe(false);
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

  it('Careful starts round 2 without waiting on a batch round 1 never published', async () => {
    const { world, engine } = setup();
    await engine.start(options({ teams: [{ index: 1, persona: 'CAREFUL' }], speed: 1 }));
    const team = teamOf(world, botName(1, 'A'));
    const jm = world.userNamed(botName(1, 'A'));
    if (!jm) throw new Error('bot 01A missing');
    await until(() => world.batches.some(b => b.teamId === team && b.roundId === 1), 'a round-1 batch');
    world.round.status = 'ENDED';
    // Marketing's dwell runs out, its split or publish meets a 409, and the
    // round-1 batch is never published.
    await settle(300);
    expect(world.decisions).toHaveLength(0);

    world.round = { ...world.round, id: 2, round_number: 2, status: 'ACTIVE' };
    await until(() => world.batches.some(b => b.teamId === team && b.roundId === 2), 'a round-2 batch');
    engine.stop();
    expect(engine.historyFor(jm.id).map(e => e.text).join('\n')).not.toMatch(/gave up waiting/);
  });

  it('never lets a bot moved into a human team publish that team\'s batch', async () => {
    const { world, engine } = setup(['alice', 'bob']);
    await engine.start(options({ speed: 10 }));
    const humanTeam = teamOf(world, 'alice');
    if (humanTeam == null) throw new Error('human team missing');
    const batchId = world.newBatchId();
    world.batches.push({
      id: batchId, roundId: world.round.id, teamId: humanTeam, state: 'QUEUED', lockedBy: null, jokes: [],
      rawText: variedCorpus.slice(0, 5).map(j => j.text).join('\n\n'),
    });
    // A mid-round Auto-Assign swaps the bot marketer with the human marketer.
    const botMarketer = world.userNamed(botName(1, 'B'));
    const humanMarketer = [...world.users.values()].find(u => !isBotName(u.name) && u.role === 'MARKETING');
    if (!botMarketer || !humanMarketer) throw new Error('marketers missing');
    [botMarketer.teamId, humanMarketer.teamId] = [humanMarketer.teamId, botMarketer.teamId];

    await until(() => engine.status().scrambled, 'scramble detection');
    await settle(500);
    engine.stop();
    expect(world.decisions.filter(d => d.teamId === humanTeam)).toEqual([]);
    // The claim that revealed the move still holds the batch; the instructor is told.
    expect(engine.status().warnings).toContain(
      `${botName(1, 'B')} picked up team ${humanTeam}'s batch #${batchId} before noticing it was moved. `
        + `That batch stays hidden from team ${humanTeam} for up to 15 minutes; Remove bots releases it at once.`,
    );
  });

  it('reports a batch held for a human team once, and keeps reporting it after re-forming', async () => {
    const gate = new Gate();
    const { world, engine } = setup(['alice', 'bob'], { wrapApi: api => gate.wrap(api) });
    await engine.start(options({ speed: 10 }));
    const humanTeam = teamOf(world, 'alice');
    if (humanTeam == null) throw new Error('human team missing');
    const batchId = world.newBatchId();
    world.batches.push({
      id: batchId, roundId: world.round.id, teamId: humanTeam, state: 'QUEUED', lockedBy: null, jokes: [],
      rawText: variedCorpus.slice(0, 5).map(j => j.text).join('\n\n'),
    });
    const botMarketer = world.userNamed(botName(1, 'B'));
    const humanMarketer = [...world.users.values()].find(u => !isBotName(u.name) && u.role === 'MARKETING');
    if (!botMarketer || !humanMarketer) throw new Error('marketers missing');
    const swap = () => { [botMarketer.teamId, humanMarketer.teamId] = [humanMarketer.teamId, botMarketer.teamId]; };
    const reports = () => engine.historyFor(botMarketer.id).filter(e => e.text.startsWith('the queue handed me')).length;
    swap();
    await until(() => reports() === 1, 'the first report');

    // Re-forming puts the bot back but does not release the batch it holds.
    await engine.reform();
    const held = () => engine.status().warnings.filter(w => w.includes(`batch #${batchId}`));
    expect(held()).toHaveLength(1);
    // The bot reads its seat just before a second swap and trusts that answer,
    // so its queue hands it the same held batch again.
    gate.hold('sessionMe', 'response');
    await until(() => gate.count('sessionMe', 'bot 1B') >= 1, 'the bot marketer checking its seat');
    swap();
    gate.stopHolding();
    gate.release();
    await until(() => reports() === 2, 'the second report');
    engine.stop();
    expect(held()).toHaveLength(1);
  });

  it('stops a Marketing bot mid-dwell once any seat sees a re-shuffle', async () => {
    // The Joke Maker is moved the moment Marketing starts reading a batch. A
    // Joke Maker that had just submitted would rest ~45 s without checking its
    // seat, far past the dwell, so this one never lands a batch: each refused
    // submit brings it back to its seat check within a few seconds, while
    // Marketing is still reading.
    let moved = false;
    let marketingWhenScrambled: string | null = null;
    const { world, engine } = setup([], {
      onEmit: m => {
        if (m.type !== 'status' || m.status.teams.length === 0) return;
        const marketing = m.status.teams[0].marketing.activity;
        if (!moved && marketing.startsWith('reading batch')) {
          moved = true;
          const jm = world.userNamed(botName(1, 'A'));
          if (jm) jm.teamId = 999;
        }
        if (m.status.scrambled && marketingWhenScrambled === null) marketingWhenScrambled = marketing;
      },
    });
    world.failNext('submitBatch', 1_000_000, botName(1, 'A'), 403);
    await engine.start(options({ speed: 1, startRound: false }));
    const team = teamOf(world, botName(1, 'A'));
    if (team == null) throw new Error('bot team missing');
    world.batches.push({
      id: world.newBatchId(), roundId: world.round.id, teamId: team, state: 'QUEUED', lockedBy: null, jokes: [],
      rawText: variedCorpus.slice(0, 5).map(j => j.text).join('\n\n'),
    });
    world.round.status = 'ACTIVE';

    await until(() => engine.status().scrambled, 'scramble detection');
    await settle(300);
    engine.stop();
    // The re-shuffle landed while Marketing was still reading, so the dwell
    // guard is what held the split back.
    expect(marketingWhenScrambled).toMatch(/^reading batch/);
    expect(world.calls).not.toContain('marketingSplit');
    expect(world.decisions).toEqual([]);
  });

  it('shows only the new run\'s seats once a restart is under way', async () => {
    const { engine } = setup();
    await engine.start(options({ startRound: false }));
    engine.stop();
    const restart = engine.start(options({ teams: [{ index: 1, persona: 'CAREFUL' }], startRound: false }));
    const status = engine.status();
    expect(status.running).toBe(true);
    expect(status.teams.map(t => [t.persona, t.jm.activity, t.marketing.activity]))
      .toEqual([['CAREFUL', 'not started', 'not started']]);
    await restart;
    engine.stop();
  });

  it('keeps the new run\'s seats when a start queues behind a remove', async () => {
    const { world, engine } = setup();
    await engine.start(options({ startRound: false }));
    const removing = engine.remove(1);
    const restart = engine.start(options({ teams: [{ index: 1, persona: 'CAREFUL' }], startRound: false }));
    await removing;
    await restart;
    engine.stop();
    expect(engine.status().teams.map(t => t.persona)).toEqual(['CAREFUL']);
    expect(world.userNamed(botName(1, 'B'))).toMatchObject({ role: 'MARKETING' });
  });

  it('Careful starts round 2 without waiting on round-1 jokes still being classified', async () => {
    const { world, engine } = setup();
    world.autoClassify = false;
    await engine.start(options({ teams: [{ index: 1, persona: 'CAREFUL' }], speed: 1 }));
    const team = teamOf(world, botName(1, 'A'));
    const jm = world.userNamed(botName(1, 'A'));
    if (!jm) throw new Error('bot 01A missing');
    await until(() => world.decisions.some(d => d.teamId === team), 'a round-1 publish');
    expect(world.classified.size).toBe(0);

    world.round = { ...world.round, id: 2, round_number: 2, status: 'ACTIVE' };
    await until(() => world.batches.some(b => b.teamId === team && b.roundId === 2), 'a round-2 batch');
    engine.stop();
    expect(engine.historyFor(jm.id).map(e => e.text).join('\n')).not.toMatch(/gave up waiting/);
  });

  it('publishes an inherited batch that does not split cleanly into the round-1 count', async () => {
    const { world, engine } = setup();
    await engine.start(options({ startRound: false }));
    const team = teamOf(world, botName(1, 'A'));
    if (team == null) throw new Error('bot team missing');
    // Adjust this literal to FakeBatch's required fields if the fake has grown more.
    world.batches.push({
      id: world.newBatchId(), roundId: world.round.id, teamId: team, state: 'QUEUED', lockedBy: null, jokes: [],
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
    expect(world.calls).not.toContain('instructorAssign');
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
    // The instructor resets the round; Fill refuses one that is ACTIVE.
    world.round.status = 'CONFIGURED';
    // Hold the next run at seating, which comes after it resets its counters,
    // so the stopped run's late publish lands on the new run's count.
    gate.hold('sessionJoin', 'request');
    const restart = engine.start(options({ startRound: false }));
    await until(() => gate.count('sessionJoin') >= 1, 'the next run seating its bots');
    gate.stopHolding();
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

  it('backs off from scratch on a real error after a run of 409s', async () => {
    const { world, engine } = setup();
    world.failNext('submitBatch', 5, botName(1, 'A'), 409);
    world.failNext('submitBatch', 1, botName(1, 'A'), 500);
    await engine.start(options());
    const jm = world.userNamed(botName(1, 'A'));
    if (!jm) throw new Error('bot 01A missing');
    await until(() => engine.historyFor(jm.id).some(e => e.text.startsWith('error:')), 'the 500');
    engine.stop();
    expect(engine.historyFor(jm.id).find(e => e.text.startsWith('error:'))?.text).toMatch(/retrying in 2s/);
  });

  it('keeps backing off while the same call keeps failing', async () => {
    const { world, engine } = setup();
    world.failNext('submitBatch', 1_000_000, botName(1, 'A'));
    await engine.start(options());
    const jm = world.userNamed(botName(1, 'A'));
    if (!jm) throw new Error('bot 01A missing');
    const errors = () => engine.historyFor(jm.id).filter(e => e.text.startsWith('error:'));
    await until(() => errors().length >= 6, 'six failed submits');
    engine.stop();
    expect(errors().map(e => e.text.match(/retrying in (\d+)s/)?.[1])).toEqual(['2', '4', '8', '16', '30', '30']);
  });

  it('asks the backend where each seat is at most once per SEAT_CHECK_MS', async () => {
    const { world, engine, clock } = setup();
    await engine.start(options({ startRound: false }));
    const seatChecks = () => world.calls.filter(c => c === 'sessionMe').length;
    const t0 = clock();
    const c0 = seatChecks();
    await settle(400);
    engine.stop();
    const elapsed = clock() - t0;
    expect(elapsed).toBeGreaterThan(20 * SEAT_CHECK_MS);
    expect(seatChecks() - c0).toBeLessThanOrEqual(2 * (Math.floor(elapsed / SEAT_CHECK_MS) + 1));
  });

  it('treats a lost batch (403) as a re-poll, not an error', async () => {
    const { world, engine } = setup();
    world.failNext('marketingPublish', 1, botName(1, 'B'), 403);
    await engine.start(options());
    const team = teamOf(world, botName(1, 'A'));
    await until(() => world.decisions.some(d => d.teamId === team), 'a publish after the lost batch');
    engine.stop();
    expect(engine.status().teams[0].marketing.error).toBeNull();
    const marketer = world.userNamed(botName(1, 'B'));
    if (!marketer) throw new Error('bot 01B missing');
    const texts = engine.historyFor(marketer.id).map(e => e.text);
    expect(texts.some(t => /refused this \(403\)/.test(t))).toBe(true);
    expect(texts.filter(t => t.startsWith('error:'))).toEqual([]);
  });
});

describe('Round 2 batch sizes and the Learner bot', () => {
  /** Wraps the client so every submitted blob is recorded with its round and joke count. */
  interface Submit { roundId: number; teamId: number; texts: string[]; jokes: number }

  function recordSubmits(into: Submit[]): (api: BotApi) => BotApi {
    const wrap = (api: BotApi): BotApi => new Proxy(api, {
      get: (target, prop, receiver) => {
        if (prop === 'as') return (id: number, label: string) => wrap(target.as(id, label));
        if (prop === 'submitBatch') {
          return async (roundId: number, body: BatchSubmitRequest) => {
            const result = await target.submitBatch(roundId, body);
            const raw = 'raw_text' in body && body.raw_text ? body.raw_text : '';
            const texts = splitBlob(raw);
            into.push({ roundId, teamId: body.team_id, texts, jokes: texts.length });
            return result;
          };
        }
        const value: unknown = Reflect.get(target, prop, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    return wrap;
  }

  it('draws batches of 3 in round 2 and of batch_size in round 1', async () => {
    const submits: Submit[] = [];
    const { world, engine } = setup([], { wrapApi: recordSubmits(submits) });
    expect(world.round.batch_size).toBe(5);
    await engine.start(options({ teams: [{ index: 1, persona: 'LEARNER' }] }));
    const team = teamOf(world, botName(1, 'A'));
    await until(() => submits.some(s => s.roundId === 1), 'a round-1 batch');

    world.round = { ...world.round, id: 2, round_number: 2, status: 'ACTIVE' };
    await until(() => submits.some(s => s.roundId === 2), 'a round-2 batch');
    const round2 = new Set(world.batches.filter(b => b.roundId === 2 && b.teamId === team).map(b => b.id));
    await until(() => world.decisions.some(d => round2.has(d.batchId)), 'a round-2 publish');
    engine.stop();

    const r1 = submits.filter(s => s.roundId === 1).map(s => s.jokes);
    const r2 = submits.filter(s => s.roundId === 2).map(s => s.jokes);
    expect(r1.length).toBeGreaterThan(0);
    expect(r1.every(n => n === 5)).toBe(true);
    expect(r2.length).toBeGreaterThan(0);
    expect(r2.every(n => n === 3)).toBe(true);
    // Learner publishes two of its three.
    expect(world.decisions.find(d => round2.has(d.batchId))).toMatchObject({ published: 2, total: 3 });
  });

  it('sends Round 2 batches of 10 (Spray), 5 (Balanced, Careful) and 3 (Learner) when the round allows 10', async () => {
    const submits: Submit[] = [];
    const { world, engine } = setup([], { wrapApi: recordSubmits(submits) });
    world.round = { ...world.round, round_number: 2, batch_size: 10, max_batch_size: 10 };
    const personas = ['SPRAY', 'BALANCED', 'CAREFUL', 'LEARNER'] as const;
    await engine.start(options({ teams: personas.map((persona, i) => ({ index: i + 1, persona })) }));
    const teams = personas.map((_, i) => teamOf(world, botName(i + 1, 'A')));
    await until(() => teams.every(t => submits.some(s => s.teamId === t)), 'a batch from every team');
    engine.stop();
    expect(teams.map(t => submits.find(s => s.teamId === t)?.jokes)).toEqual([10, 5, 5, 3]);
  });

  it('never sends a Round 2 batch above the round\'s batch_size', async () => {
    const submits: Submit[] = [];
    const { world, engine } = setup([], { wrapApi: recordSubmits(submits) });
    world.round = { ...world.round, round_number: 2, batch_size: 4, max_batch_size: 4 };
    const personas = ['SPRAY', 'BALANCED', 'LEARNER'] as const;
    await engine.start(options({ teams: personas.map((persona, i) => ({ index: i + 1, persona })) }));
    const teams = personas.map((_, i) => teamOf(world, botName(i + 1, 'A')));
    await until(() => teams.every(t => submits.some(s => s.teamId === t)), 'a batch from every team');
    engine.stop();
    expect(teams.map(t => submits.find(s => s.teamId === t)?.jokes)).toEqual([4, 4, 3]);
  });

  it('caps a Round 2 Spray team at 40 jokes, 4 batches of 10', async () => {
    const submits: Submit[] = [];
    const { world, engine } = setup([], { wrapApi: recordSubmits(submits) });
    world.round = { ...world.round, round_number: 2, batch_size: 10, max_batch_size: 10 };
    await engine.start(options({ teams: [{ index: 1, persona: 'SPRAY' }] }));
    await until(() => engine.status().teams[0].jm.activity.includes(CAP_REACHED), 'the joke cap');
    const activity = engine.status().teams[0].jm.activity;
    engine.stop();
    expect(submits.map(s => s.jokes)).toEqual([10, 10, 10, 10]);
    expect(activity).toBe(`done — 40-joke ${CAP_REACHED}`);
  });

  it('sends more, smaller batches in round 2, stopping at the 40-joke cap', async () => {
    const submits: Submit[] = [];
    const { world, engine } = setup([], { wrapApi: recordSubmits(submits) });
    world.round.round_number = 2;
    await engine.start(options({ teams: [{ index: 1, persona: 'LEARNER' }] }));
    await until(() => engine.status().teams[0].jm.activity.includes(CAP_REACHED), 'the joke cap');
    engine.stop();
    const cap = JOKE_CAP_PER_ROUND;
    const jokes = submits.reduce((n, s) => n + s.jokes, 0);
    expect(submits.length).toBeGreaterThan(ROUND1_BATCHES_AT_CAP);
    expect(submits.every(s => s.jokes === 3)).toBe(true);
    expect(submits).toHaveLength(Math.ceil(cap / 3));
    expect(jokes).toBeGreaterThanOrEqual(cap);
    expect(jokes - 3).toBeLessThan(cap);
  });

  it('remembers sold jokes from the team batch list and keeps them next time', async () => {
    const { world, engine } = setup();
    world.round.round_number = 2; // a later round: batches of 3, two published
    await engine.start(options({ teams: [{ index: 1, persona: 'LEARNER' }] }));
    const team = teamOf(world, botName(1, 'A'));
    if (team == null) throw new Error('bot team missing');
    await until(() => world.decisions.filter(d => d.teamId === team).length >= 3, 'three processed batches');

    // Batches 1 and 2 each published two jokes: one sold, one did not. Batch 3
    // has since been processed, so neither unsold joke is merely "not sold yet".
    const publishedIn = (n: number) => {
      const b = world.batches.find(x => x.id === world.decisions[n].batchId);
      const [sold, unsold] = b?.jokes.filter(j => j.published) ?? [];
      if (!sold || !unsold) throw new Error(`batch ${n + 1} published fewer than two jokes`);
      return { sold, unsold };
    };
    const one = publishedIn(0);
    const two = publishedIn(1);
    world.setSold(one.sold.joke_id, 3);
    world.setSold(two.sold.joke_id, 1);

    // The deck deals with replacement, so texts recur: deal all four again,
    // with a joke the Learner has never seen, at the front of the team's queue.
    const deal = (joke_text: string) => ({ joke_id: world.newJokeId(), joke_text, published: false });
    const again = {
      id: world.newBatchId(), roundId: world.round.id, teamId: team, rawText: null, state: 'QUEUED' as const, lockedBy: null,
      jokes: [
        deal(one.unsold.joke_text), deal(one.sold.joke_text), deal(two.unsold.joke_text), deal(two.sold.joke_text),
        deal('A joke this team has never seen before, dealt fresh.'),
      ],
    };
    world.batches.unshift(again);
    await until(() => world.decisions.some(d => d.batchId === again.id), 'the repeat batch to publish');
    engine.stop();

    const published = again.jokes.map(j => j.published);
    // Seen selling: kept. Seen not selling: dropped. Two slots, both filled by hits.
    expect(published).toEqual([false, true, false, true, false]);
    // The publish request itself said so.
    expect(world.decisions.find(d => d.batchId === again.id)).toMatchObject({ published: 2, total: 5 });
  });

  it("the Joke Maker resubmits a text it saw sell and skips the dud its deck deals next; Spray's batches are unchanged", async () => {
    const submits: Submit[] = [];
    const { world, engine } = setup([], { wrapApi: recordSubmits(submits) });
    await engine.start(options({ teams: [{ index: 1, persona: 'LEARNER' }, { index: 2, persona: 'SPRAY' }], startRound: false }));
    const learner = teamOf(world, botName(1, 'A'));
    const spray = teamOf(world, botName(2, 'A'));
    if (learner == null || spray == null) throw new Error('bot teams missing');

    // The Learner's deck, seeded as the engine seeds it, deals these next.
    const upcoming = new Deck(variedCorpus, seededRng('engine-test:jm:1')).draw(5);
    const dud = upcoming[0];
    const hit = variedCorpus.find(j => !upcoming.some(u => u.id === j.id)) as (typeof variedCorpus)[number];

    // What the team's batch list already shows: the hit sold; the dud did not,
    // and a later batch has been processed since, so it is not merely "not yet".
    const published = (joke_text: string) => ({ joke_id: world.newJokeId(), joke_text, published: true });
    const earlier = { ...published(dud.text) };
    const sold = { ...published(hit.text) };
    world.batches.push(
      { id: world.newBatchId(), roundId: 1, teamId: learner, rawText: null, state: 'DONE', lockedBy: null,
        jokes: [earlier, sold], processedAt: '2025-12-31T00:00:01Z' },
      { id: world.newBatchId(), roundId: 1, teamId: learner, rawText: null, state: 'DONE', lockedBy: null,
        jokes: [published('Some later joke that has not sold yet, but may.')], processedAt: '2025-12-31T00:00:02Z' },
    );
    world.setSold(sold.joke_id, 1);
    world.profileConfigured = true;
    world.round.status = 'ACTIVE';

    await until(
      () => submits.some(s => s.teamId === learner) && submits.some(s => s.teamId === spray),
      'a batch from each team',
    );
    engine.stop();

    const first = submits.find(s => s.teamId === learner) as Submit;
    expect(first.texts).toHaveLength(5);
    expect(first.texts).toContain(hit.text);
    expect(first.texts).not.toContain(dud.text);

    // Spray draws straight from its own deck, as before.
    const sprays = submits.filter(x => x.teamId === spray);
    expect(sprays.length).toBeGreaterThan(0);
    const deck = new Deck(variedCorpus, seededRng('engine-test:jm:2'));
    for (const s of sprays) expect(s.texts).toEqual(deck.draw(5).map(j => j.text));
  });

  it('carries a sale of a round-1 joke that arrives after round 1 into round 2', async () => {
    const submits: Submit[] = [];
    const { world, engine } = setup([], { wrapApi: recordSubmits(submits) });
    await engine.start(options({ teams: [{ index: 1, persona: 'LEARNER' }] }));
    const team = teamOf(world, botName(1, 'A'));
    await until(() => world.decisions.some(d => d.teamId === team), 'a round-1 publish');
    world.round.status = 'ENDED';
    await settle(300);

    const first = world.batches.find(b => b.id === world.decisions[0].batchId);
    const hit = first?.jokes.find(j => j.published);
    if (!hit) throw new Error('round 1 published nothing');
    world.setSold(hit.joke_id, 1);
    world.round = { ...world.round, id: 2, round_number: 2, status: 'ACTIVE' };
    await until(() => submits.some(s => s.roundId === 2), 'a round-2 batch');
    engine.stop();

    const next = submits.find(s => s.roundId === 2) as Submit;
    expect(next.texts).toHaveLength(3);
    expect(next.texts).toContain(hit.joke_text);
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
