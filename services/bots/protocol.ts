// services/bots/protocol.ts
/**
 * Messages between the Bot Panel, its worker, and watch tabs.
 *
 * Panel ↔ worker uses postMessage. Worker → watch tabs uses a BroadcastChannel,
 * because a watch tab is a separate tab with no handle on the worker; the
 * channel reaches every same-origin tab with no backend involved.
 */
import type { Seat } from './naming';
import type { PersonaId } from './personas';

export type Speed = 1 | 3 | 10;
export const SPEEDS: readonly Speed[] = [1, 3, 10];
export const BOT_CHANNEL = 'jf-bots';

export interface BotTeamSpec {
  index: number;
  persona: PersonaId;
}

export interface StartOptions {
  roundId: number;
  teams: BotTeamSpec[];
  speed: Speed;
  /** true for "Run all-bot class"; false for "Fill with bot teams". */
  startRound: boolean;
  /**
   * The instructor's hidden ideal joke, sent in the start request exactly as the
   * real Start button does (context.tsx). A freshly reset round has none, and
   * the backend refuses to start without one (usecase/instructor.go:239-245).
   */
  idealProfile?: Record<string, string>;
}

/**
 * The panel's commands. Each carries a `commandId` from a counter in the panel,
 * and the worker answers each with exactly one `done` carrying the same id once
 * the engine call settles. The panel's "working…" state is keyed to that id, so
 * it never guesses completion from how the status looks.
 */
export type Command = 'start' | 'stop' | 'remove' | 'reform';

export type ToWorker =
  | { type: 'init'; baseUrl: string; instructorUserId: number; seed: string }
  | { type: 'probe'; roundId: number }
  | { type: 'start'; commandId: number; options: StartOptions }
  | { type: 'stop'; commandId: number }
  | { type: 'setSpeed'; speed: Speed }
  | { type: 'remove'; commandId: number; roundId: number }
  | { type: 'reform'; commandId: number };

export interface SeatStatus {
  userId: number | null;
  name: string;
  activity: string;
  error: string | null;
}

export interface TeamStatus {
  index: number;
  persona: PersonaId;
  teamId: number | null;
  batchesPublished: number;
  jm: SeatStatus;
  marketing: SeatStatus;
}

export interface EngineStatus {
  running: boolean;
  speed: Speed;
  teams: TeamStatus[];
  /** Published jokes = Azure LLM classification calls this session. */
  classificationCalls: number;
  scrambled: boolean;
  warnings: string[];
}

export interface ProbeResult {
  humans: number;
  bots: number;
  roundStatus: 'CONFIGURED' | 'ACTIVE' | 'ENDED' | 'UNKNOWN';
}

export interface ReasoningEntry {
  botUserId: number;
  teamIndex: number;
  seat: Seat;
  persona: PersonaId;
  at: number;
  text: string;
}

export interface BotMeta {
  teamIndex: number;
  seat: Seat;
  persona: PersonaId;
  teamId: number | null;
  /**
   * True exactly when the engine itself would call marketing/queue/next for
   * this bot: it is running, not paused for a scramble or mid re-form, and this
   * is a live Marketing seat. A watch tab claims batches only while it is true.
   */
  claiming: boolean;
}

export type CommandDone =
  | { type: 'done'; commandId: number; command: Command; ok: true }
  | { type: 'done'; commandId: number; command: Command; ok: false; message: string };

export type FromWorker =
  | { type: 'status'; status: EngineStatus }
  | { type: 'probe'; result: ProbeResult }
  | { type: 'log'; entry: ReasoningEntry }
  | CommandDone
  /** A failure outside any command: init, or a probe or speed change before init. */
  | { type: 'fatal'; message: string };

export type ChannelMessage =
  | { type: 'log'; entry: ReasoningEntry }
  | { type: 'history-request'; botUserId: number }
  | { type: 'history'; botUserId: number; entries: ReasoningEntry[]; meta: BotMeta | null };
