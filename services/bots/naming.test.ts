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
    const humans = [
      'alice_bob',
      'bot_alice',
      'Bot 03A',
      '🤖 Bot 3A',
      '🤖 Bot 03C',
      '🤖 Bot 03A extra',
      '🤖 Bot 00A', // index 0 is outside botName's 1..99 domain
      '🤖 bot 03a', // case variants: case sensitivity is what stops forgery
      '[bot] 04a',
      ' 🤖 Bot 03A', // no trimming
      '🤖 Bot 03A\n',
    ];
    for (const name of humans) {
      expect(isBotName(name)).toBe(false);
    }
  });

  it('maps seat A to the Joke Maker and B to Marketing', () => {
    expect(SEAT_ROLE).toEqual({ A: 'JM', B: 'MARKETING' });
  });

  it('refuses indices it cannot print in two digits', () => {
    expect(() => botName(0, 'A')).toThrow(RangeError);
    expect(() => botName(100, 'A')).toThrow(RangeError);
    expect(() => botName(1.5, 'A')).toThrow(RangeError);
    expect(() => botName(NaN, 'A')).toThrow(RangeError);
  });
});
