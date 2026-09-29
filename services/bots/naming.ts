// services/bots/naming.ts
/**
 * Bot identity lives entirely in the display name.
 *
 * WHY THE NAME AND NOT A FLAG: the backend has no notion of a bot user, and this
 * feature is frontend-only by design. A name the backend stores verbatim is the
 * one marker every existing screen already renders — lobby, leaderboard, team
 * names — so bots show up as bots with zero component changes. The prefix is
 * therefore the single source of truth for "is this user a bot".
 *
 * `🤖 Bot 03A`: two-digit team index, then the seat. A is the Joke Maker, B is
 * Marketing. Session join is idempotent by display name, so a second run reuses
 * the same users instead of accumulating new ones.
 *
 * The parser also accepts `[BOT] 03A`, the fallback if a deployment ever turns
 * out to mangle the emoji.
 */
export const BOT_PREFIX = '🤖 Bot ';

export type Seat = 'A' | 'B';
export type SeatRole = 'JM' | 'MARKETING';

export const SEAT_ROLE: Readonly<Record<Seat, SeatRole>> = { A: 'JM', B: 'MARKETING' };

export interface BotIdentity {
  index: number;
  seat: Seat;
}

export function botName(index: number, seat: Seat): string {
  if (!Number.isInteger(index) || index < 1 || index > 99) {
    throw new RangeError(`bot team index must be 1..99, got ${index}`);
  }
  return `${BOT_PREFIX}${String(index).padStart(2, '0')}${seat}`;
}

const PATTERN = /^(?:🤖 Bot |\[BOT\] )(\d{2})([AB])$/u;

export function parseBotName(name: string): BotIdentity | null {
  const m = PATTERN.exec(name);
  return m ? { index: Number(m[1]), seat: m[2] as Seat } : null;
}

export function isBotName(name: string): boolean {
  return parseBotName(name) !== null;
}
