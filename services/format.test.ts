import { describe, it, expect } from 'vitest';
import { fmtDuration, fmtClock, fmtMinSec, pairNames, ordinal } from './format';

describe('fmtDuration', () => {
  it.each([
    [45, '45 s'],
    [60, '1 min'],
    [72, '1 min 12 s'],
    [599, '9 min 59 s'],
    [600, '10 min'],
    [3391, '56 min'],
  ])('%i -> %s', (secs, out) => {
    expect(fmtDuration(secs)).toBe(out);
  });

  it('floors fractional seconds', () => {
    expect(fmtDuration(72.9)).toBe('1 min 12 s');
  });

  it('clamps negative input to 0', () => {
    expect(fmtDuration(-5)).toBe('0 s');
  });
});

describe('fmtClock', () => {
  it('pads minutes and seconds to two digits', () => {
    expect(fmtClock(439)).toBe('07:19');
    expect(fmtClock(5795)).toBe('96:35');
  });
  it('floors fractions and clamps negatives', () => {
    expect(fmtClock(439.8)).toBe('07:19');
    expect(fmtClock(-3)).toBe('00:00');
  });
});

describe('fmtMinSec', () => {
  it.each([
    [72, '1:12'],
    [161, '2:41'],
    [52, '0:52'],
    [213, '3:33'],
    [3, '0:03'],
  ])('%i -> %s', (secs, out) => {
    expect(fmtMinSec(secs)).toBe(out);
  });

  it('floors fractional seconds', () => {
    expect(fmtMinSec(72.9)).toBe('1:12');
  });

  it('clamps negative input to 0', () => {
    expect(fmtMinSec(-1)).toBe('0:00');
  });
});

describe('pairNames', () => {
  it('splits on underscore and capitalises each name', () => {
    expect(pairNames('priya_tomás')).toBe('Priya and Tomás');
  });
  it('capitalises a solo name', () => {
    expect(pairNames('solo')).toBe('Solo');
  });
  it('returns empty for empty input', () => {
    expect(pairNames('')).toBe('');
  });
});

describe('ordinal', () => {
  it.each([
    [1, 'st'],
    [2, 'nd'],
    [3, 'rd'],
    [4, 'th'],
    [11, 'th'],
    [12, 'th'],
    [13, 'th'],
    [21, 'st'],
    [22, 'nd'],
  ])('%i -> %s', (n, suffix) => {
    expect(ordinal(n)).toEqual({ n, suffix });
  });
});
