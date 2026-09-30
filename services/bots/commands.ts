// services/bots/commands.ts
/**
 * What the worker does with each panel message once the engine exists. Kept out
 * of worker.ts, which touches `self` and a BroadcastChannel at import, so the
 * acknowledgement contract can be tested under node.
 *
 * The contract: every command (start, stop, remove, reform) gets exactly one
 * `done` with its `commandId`, posted after the engine call settles, and a
 * command's failure travels in that `done` — never as `fatal`, which would
 * leave the panel unable to tell which command failed.
 */
import type { BotEngine } from './engine';
import type { Command, FromWorker, ToWorker } from './protocol';

/** The slice of BotEngine the worker drives; a fake stands in for it in tests. */
export type CommandEngine = Pick<BotEngine, 'probe' | 'start' | 'stop' | 'setSpeed' | 'remove' | 'reform'>;

const NOT_INITIALISED = 'bot engine not initialised';

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function runCommand(
  engine: CommandEngine | null, m: Extract<ToWorker, { type: Command }>, post: (message: FromWorker) => void,
): Promise<void> {
  const { commandId, type: command } = m;
  try {
    if (!engine) throw new Error(NOT_INITIALISED);
    switch (m.type) {
      case 'start': await engine.start(m.options); break;
      case 'stop': engine.stop(); break;
      case 'remove': await engine.remove(m.roundId); break;
      case 'reform': await engine.reform(); break;
    }
  } catch (err) {
    post({ type: 'done', commandId, command, ok: false, message: messageOf(err) });
    return;
  }
  post({ type: 'done', commandId, command, ok: true });
}

export async function handleMessage(
  engine: CommandEngine | null, m: Exclude<ToWorker, { type: 'init' }>, post: (message: FromWorker) => void,
): Promise<void> {
  if (m.type !== 'probe' && m.type !== 'setSpeed') {
    await runCommand(engine, m, post);
    return;
  }
  if (!engine) {
    post({ type: 'fatal', message: NOT_INITIALISED });
    return;
  }
  if (m.type === 'setSpeed') {
    engine.setSpeed(m.speed);
    return;
  }
  // WHY nothing on failure: the panel polls every 5 s, so an error here would
  // repeat on every blip. A zeroed ProbeResult would be worse: `humans: 0` would
  // enable "Run all-bot class" for a lobby that couldn't be read. The panel
  // keeps its last good reading, and treats it as stale once it is too old.
  try {
    await engine.probe(m.roundId);
  } catch {
    /* best-effort poll */
  }
}
