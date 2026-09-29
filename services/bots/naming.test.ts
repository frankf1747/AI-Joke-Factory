// services/bots/naming.test.ts
import { describe, it, expect } from 'vitest';
import { BOT_PREFIX, SEAT_ROLE, botName, isBotName, parseBotName } from './naming';

describe('bot naming', () => {
  it('names seats with a two-digit team index', () => {
    expect(botName(3, 'A')).toBe(`${BOT_PREFIX}03A`);
    expect(botName(12, 'B')).toBe(`${BOT_PREFIX}12B`);
  });

  it('round-trips through the parser', () => {
    expect(parseBotName(botName(7, 'B'))).toEqual({ index: 7, seat: 'B' });
  });

  it('also accepts the text-only prefix', () => {
    expect(parseBotName('[BOT] 04A')).toEqual({ index: 4, seat: 'A' });
  });

  it('does not mistake humans for bots', () => {
    for (const name of ['alice_bob', 'Bot 03A', '🤖 Bot 3A', '🤖 Bot 03C', '🤖 Bot 03A extra']) {
      expect(isBotName(name)).toBe(false);
    }
  });

  it('maps seat A to the Joke Maker and B to Marketing', () => {
    expect(SEAT_ROLE).toEqual({ A: 'JM', B: 'MARKETING' });
  });

  it('refuses indices it cannot print in two digits', () => {
    expect(() => botName(0, 'A')).toThrow(RangeError);
    expect(() => botName(100, 'A')).toThrow(RangeError);
  });
});
