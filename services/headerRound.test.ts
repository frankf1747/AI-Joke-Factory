import { describe, expect, it } from 'vitest';
import { headerRound } from './headerRound';

const NOW = 1_000_000_000;
const s = (seconds: number) => seconds * 1000;
const none = { startedAt: null, endedAt: null };

describe('header round and clock', () => {
  it('shows a running round with seconds elapsed since it started', () => {
    expect(headerRound({
      selectedRound: 1,
      statuses: { 1: 'ACTIVE', 2: 'CONFIGURED' },
      times: { 1: { startedAt: NOW - s(439), endedAt: null }, 2: none },
      now: NOW,
    })).toEqual({ round: 1, state: 'running', clockSecs: 439, clockLabel: 'elapsed' });
  });

  it('between rounds keeps Round 1 and its total time, even when Round 2 is selected', () => {
    expect(headerRound({
      selectedRound: 2,
      statuses: { 1: 'ENDED', 2: 'CONFIGURED' },
      times: { 1: { startedAt: NOW - s(1200), endedAt: NOW - s(300) }, 2: none },
      now: NOW,
    })).toEqual({ round: 1, state: 'over', clockSecs: 900, clockLabel: 'total' });
  });

  it('switches to Round 2 when it is running', () => {
    expect(headerRound({
      selectedRound: 2,
      statuses: { 1: 'ENDED', 2: 'ACTIVE' },
      times: { 1: { startedAt: NOW - s(2000), endedAt: NOW - s(1100) }, 2: { startedAt: NOW - s(60), endedAt: null } },
      now: NOW,
    })).toEqual({ round: 2, state: 'running', clockSecs: 60, clockLabel: 'elapsed' });
  });

  it('shows Round 2 as over, with its total, when both rounds have ended', () => {
    expect(headerRound({
      selectedRound: 2,
      statuses: { 1: 'ENDED', 2: 'ENDED' },
      times: { 1: { startedAt: 0, endedAt: s(900) }, 2: { startedAt: NOW - s(800), endedAt: NOW - s(20) } },
      now: NOW,
    })).toEqual({ round: 2, state: 'over', clockSecs: 780, clockLabel: 'total' });
  });

  it('shows Round 1 as not started when nothing has started', () => {
    expect(headerRound({
      selectedRound: 1,
      statuses: { 1: 'CONFIGURED', 2: 'CONFIGURED' },
      times: { 1: none, 2: none },
      now: NOW,
    })).toEqual({ round: 1, state: 'not-started', clockSecs: 0, clockLabel: 'not started' });
  });

  it('treats unknown statuses as not started', () => {
    expect(headerRound({ selectedRound: 1, statuses: { 1: null, 2: null }, times: { 1: none, 2: none }, now: NOW }))
      .toEqual({ round: 1, state: 'not-started', clockSecs: 0, clockLabel: 'not started' });
  });

  it('floors to whole seconds and never goes negative', () => {
    const base = { selectedRound: 1 as const, statuses: { 1: 'ACTIVE' as const, 2: null } };
    expect(headerRound({ ...base, times: { 1: { startedAt: NOW - 61_999, endedAt: null }, 2: none }, now: NOW }).clockSecs).toBe(61);
    expect(headerRound({ ...base, times: { 1: { startedAt: NOW + s(5), endedAt: null }, 2: none }, now: NOW }).clockSecs).toBe(0);
  });

  it('reads 0 for an ended round when either time is missing', () => {
    const base = { selectedRound: 1 as const, statuses: { 1: 'ENDED' as const, 2: null } };
    expect(headerRound({ ...base, times: { 1: { startedAt: NOW - s(5), endedAt: null }, 2: none }, now: NOW }).clockSecs).toBe(0);
    expect(headerRound({ ...base, times: { 1: { startedAt: null, endedAt: NOW }, 2: none }, now: NOW }).clockSecs).toBe(0);
  });
});
