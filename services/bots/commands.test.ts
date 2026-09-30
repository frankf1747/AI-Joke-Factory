// services/bots/commands.test.ts
import { describe, it, expect } from 'vitest';
import { handleMessage, type CommandEngine } from './commands';
import type { FromWorker, StartOptions, ToWorker } from './protocol';

const startOptions: StartOptions = {
  roundId: 1, teams: [{ index: 1, persona: 'SPRAY' }], speed: 1, startRound: false,
};

/** Records every call; each async method resolves, or rejects with `fail`. */
function fakeEngine(fail: Partial<Record<keyof CommandEngine, Error>> = {}) {
  const calls: string[] = [];
  const settle = (name: keyof CommandEngine) => {
    calls.push(name);
    return fail[name] ? Promise.reject(fail[name]) : Promise.resolve();
  };
  const engine: CommandEngine = {
    probe: () => settle('probe').then(() => ({ humans: 0, bots: 0, roundStatus: 'CONFIGURED' as const })),
    start: () => settle('start'),
    remove: () => settle('remove').then(() => 0),
    reform: () => settle('reform'),
    stop: () => {
      calls.push('stop');
      if (fail.stop) throw fail.stop;
    },
    setSpeed: () => {
      calls.push('setSpeed');
      if (fail.setSpeed) throw fail.setSpeed;
    },
  };
  return { engine, calls };
}

async function run(engine: CommandEngine | null, message: Exclude<ToWorker, { type: 'init' }>): Promise<FromWorker[]> {
  const posted: FromWorker[] = [];
  await handleMessage(engine, message, m => posted.push(m));
  return posted;
}

const commands: Array<Exclude<ToWorker, { type: 'init' | 'probe' | 'setSpeed' }>> = [
  { type: 'start', commandId: 7, options: startOptions },
  { type: 'stop', commandId: 7 },
  { type: 'remove', commandId: 7, roundId: 1 },
  { type: 'reform', commandId: 7 },
];

describe('handleMessage', () => {
  for (const message of commands) {
    it(`acknowledges ${message.type} exactly once when it succeeds`, async () => {
      const { engine, calls } = fakeEngine();
      expect(await run(engine, message)).toEqual([{ type: 'done', commandId: 7, command: message.type, ok: true }]);
      expect(calls).toEqual([message.type]);
    });

    it(`reports a failed ${message.type} through its acknowledgement, not fatal`, async () => {
      const { engine } = fakeEngine({ [message.type]: new Error('backend said no') });
      expect(await run(engine, message)).toEqual([
        { type: 'done', commandId: 7, command: message.type, ok: false, message: 'backend said no' },
      ]);
    });

    it(`fails ${message.type} through its acknowledgement when the engine is not initialised`, async () => {
      expect(await run(null, message)).toEqual([
        { type: 'done', commandId: 7, command: message.type, ok: false, message: 'bot engine not initialised' },
      ]);
    });
  }

  it('acknowledges only after the engine call settles', async () => {
    let finish: () => void = () => undefined;
    const { engine } = fakeEngine();
    engine.start = () => new Promise<void>(resolve => { finish = resolve; });
    const posted: FromWorker[] = [];
    const handled = handleMessage(engine, commands[0], m => posted.push(m));
    await Promise.resolve();
    expect(posted).toEqual([]);
    finish();
    await handled;
    expect(posted).toEqual([{ type: 'done', commandId: 7, command: 'start', ok: true }]);
  });

  it('keeps a non-Error rejection readable', async () => {
    const { engine } = fakeEngine();
    engine.reform = () => Promise.reject('plain string');
    expect(await run(engine, { type: 'reform', commandId: 3 })).toEqual([
      { type: 'done', commandId: 3, command: 'reform', ok: false, message: 'plain string' },
    ]);
  });

  it('posts nothing when a probe fails: it is a best-effort poll', async () => {
    const { engine, calls } = fakeEngine({ probe: new Error('network down') });
    expect(await run(engine, { type: 'probe', roundId: 1 })).toEqual([]);
    expect(calls).toEqual(['probe']);
  });

  it('posts no acknowledgement for a probe or a speed change', async () => {
    const { engine, calls } = fakeEngine();
    expect(await run(engine, { type: 'probe', roundId: 1 })).toEqual([]);
    expect(await run(engine, { type: 'setSpeed', speed: 3 })).toEqual([]);
    expect(calls).toEqual(['probe', 'setSpeed']);
  });

  it('reports fatal for a probe or speed change before the engine exists', async () => {
    expect(await run(null, { type: 'probe', roundId: 1 })).toEqual([{ type: 'fatal', message: 'bot engine not initialised' }]);
    expect(await run(null, { type: 'setSpeed', speed: 3 })).toEqual([{ type: 'fatal', message: 'bot engine not initialised' }]);
  });
});
