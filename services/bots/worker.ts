// services/bots/worker.ts
/**
 * Hosts the bot engine in a dedicated Web Worker.
 *
 * WHY A WORKER. Bots have to keep playing while the instructor looks at another
 * tab, and browsers throttle timers on a hidden page's main thread hard. See the
 * spike result in the spec's §10 for what was measured.
 *
 * Commands arrive from the Bot Panel by postMessage. Reasoning goes out twice:
 * to the panel, and on a BroadcastChannel, which is the only way to reach a
 * watch tab — a separate tab with no handle on this worker.
 */
import { createClient } from '../shared/client';
import type { BotApi } from './api';
import { BotEngine, realDelay } from './engine';
import { BOT_CHANNEL, type ChannelMessage, type FromWorker, type ToWorker } from './protocol';

// Typed narrowly instead of pulling in the WebWorker lib, which conflicts with
// the DOM lib the rest of the project compiles against.
interface WorkerScope {
  postMessage(message: FromWorker): void;
  onmessage: ((event: MessageEvent<ToWorker>) => void) | null;
}
const scope = self as unknown as WorkerScope;
const channel = new BroadcastChannel(BOT_CHANNEL);
let engine: BotEngine | null = null;

function post(message: FromWorker): void {
  scope.postMessage(message);
  if (message.type === 'log') {
    const forward: ChannelMessage = { type: 'log', entry: message.entry };
    channel.postMessage(forward);
  }
}

channel.onmessage = (event: MessageEvent<ChannelMessage>) => {
  const m = event.data;
  // Same-origin, so this is robustness rather than security: ignore anything
  // that isn't a message object.
  if (!m || typeof m !== 'object') return;
  if (m.type !== 'history-request' || !engine) return;
  const entries = engine.historyFor(m.botUserId);
  const meta = engine.metaFor(m.botUserId);
  // A second instructor tab has an idle engine. A watch tab keeps the last reply
  // it receives, so an empty answer from a worker that doesn't run this bot
  // could erase the real history.
  if (!meta && entries.length === 0) return;
  const reply: ChannelMessage = { type: 'history', botUserId: m.botUserId, entries, meta };
  channel.postMessage(reply);
};

scope.onmessage = event => {
  void handle(event.data);
};

async function handle(m: ToWorker): Promise<void> {
  try {
    if (m.type === 'init') {
      engine?.stop();
      // Assigning the real client to BotApi is also the compile-time proof that
      // the engine's fake and the real thing agree on shape.
      const api: BotApi = createClient({ baseUrl: m.baseUrl });
      engine = new BotEngine({
        api, instructorUserId: m.instructorUserId, delay: realDelay,
        now: () => Date.now(), emit: post, seed: m.seed,
      });
      return;
    }
    if (!engine) throw new Error('bot engine not initialised');
    switch (m.type) {
      case 'probe':
        // WHY nothing on failure: the panel polls every 5 s, so a `fatal` here
        // would repeat the error on every blip and clear the panel's pending
        // state mid-start. A zeroed ProbeResult would be worse: `humans: 0`
        // would enable "Run all-bot class" for a lobby that couldn't be read.
        // The panel keeps its last good reading instead.
        try { await engine.probe(m.roundId); } catch { /* best-effort poll */ }
        break;
      case 'start': await engine.start(m.options); break;
      case 'stop': engine.stop(); break;
      case 'setSpeed': engine.setSpeed(m.speed); break;
      case 'remove': await engine.remove(m.roundId); break;
      case 'reform': await engine.reform(); break;
    }
  } catch (err) {
    post({ type: 'fatal', message: err instanceof Error ? err.message : String(err) });
  }
}
