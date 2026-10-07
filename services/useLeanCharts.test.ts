import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_LEAN_CHARTS_STATE, leanChartsKey, startLeanChartsPoller, type LeanChartsState } from './useLeanCharts';
import { LEAN_CHARTS_POLL_MS } from './leanCharts';
import { leanChartsFixture } from './leanCharts.testdata';
import type { LeanChartsResponse } from '../types/api';

const resp = (round_id: number): LeanChartsResponse => leanChartsFixture({ round_id });
const fail = (status: number, message: string) => Object.assign(new Error(message), { status });
/** Fake timers do not fake promises: a few microtask hops let `await fetch()` settle. */
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const advance = async (ms: number) => { await vi.advanceTimersByTimeAsync(ms); await flush(); };

function record() {
  const states: LeanChartsState[] = [];
  return { states, onState: (s: LeanChartsState) => { states.push(s); }, last: () => states[states.length - 1] };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('startLeanChartsPoller', () => {
  it('fetches at once, then every 10 s while live', async () => {
    const fetch = vi.fn<() => Promise<LeanChartsResponse>>()
      .mockResolvedValueOnce(resp(1))
      .mockResolvedValueOnce(resp(2));
    const rec = record();
    const stop = startLeanChartsPoller({ fetch, live: true, onState: rec.onState });
    expect(fetch).toHaveBeenCalledTimes(1);
    await flush();
    expect(rec.last().data?.round_id).toBe(1);
    await advance(LEAN_CHARTS_POLL_MS - 1);
    expect(fetch).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(rec.last().data?.round_id).toBe(2);
    stop();
  });

  it('keeps the last good data through failures and reports unavailable after three in a row', async () => {
    const fetch = vi.fn<() => Promise<LeanChartsResponse>>()
      .mockResolvedValueOnce(resp(1))
      .mockRejectedValueOnce(fail(500, 'boom'))
      .mockRejectedValueOnce(fail(502, 'HTTP 502'))
      .mockRejectedValueOnce(fail(0, 'network'))
      .mockResolvedValueOnce(resp(2));
    const rec = record();
    const stop = startLeanChartsPoller({ fetch, live: true, onState: rec.onState });
    await flush();
    await advance(LEAN_CHARTS_POLL_MS);
    expect(rec.last()).toMatchObject({ failures: 1, unavailable: false });
    expect(rec.last().data?.round_id).toBe(1);
    await advance(LEAN_CHARTS_POLL_MS);
    expect(rec.last()).toMatchObject({ failures: 2, unavailable: false });
    await advance(LEAN_CHARTS_POLL_MS);
    expect(rec.last()).toMatchObject({ failures: 3, unavailable: true });
    expect(rec.last().data?.round_id).toBe(1);
    await advance(LEAN_CHARTS_POLL_MS);
    expect(rec.last()).toMatchObject({ failures: 0, unavailable: false });
    expect(rec.last().data?.round_id).toBe(2);
    stop();
  });

  it('hides on NOT_LEAN_ROUND and comes back on the next good poll', async () => {
    const fetch = vi.fn<() => Promise<LeanChartsResponse>>()
      .mockRejectedValueOnce(fail(409, 'conflict: NOT_LEAN_ROUND: lean charts exist only for LEAN rounds'))
      .mockResolvedValueOnce(resp(1));
    const rec = record();
    const stop = startLeanChartsPoller({ fetch, live: true, onState: rec.onState });
    await flush();
    expect(rec.last()).toEqual({ ...EMPTY_LEAN_CHARTS_STATE, notLean: true });
    await advance(LEAN_CHARTS_POLL_MS);
    expect(rec.last().notLean).toBe(false);
    expect(rec.last().data?.round_id).toBe(1);
    stop();
  });

  it('fetches an ended round once', async () => {
    const fetch = vi.fn<() => Promise<LeanChartsResponse>>().mockResolvedValue(resp(1));
    const rec = record();
    const stop = startLeanChartsPoller({ fetch, live: false, onState: rec.onState });
    await flush();
    await advance(LEAN_CHARTS_POLL_MS * 6);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(rec.last().data?.round_id).toBe(1);
    stop();
  });

  it('retries a failed one-shot fetch until it succeeds, then stops', async () => {
    const fetch = vi.fn<() => Promise<LeanChartsResponse>>()
      .mockRejectedValueOnce(fail(500, 'boom'))
      .mockResolvedValue(resp(1));
    const rec = record();
    const stop = startLeanChartsPoller({ fetch, live: false, onState: rec.onState });
    await flush();
    expect(rec.last().failures).toBe(1);
    await advance(LEAN_CHARTS_POLL_MS);
    expect(rec.last().data?.round_id).toBe(1);
    await advance(LEAN_CHARTS_POLL_MS * 6);
    expect(fetch).toHaveBeenCalledTimes(2);
    stop();
  });

  // Review focus 5: a slow answer for the round you just left never paints the new one.
  it('drops an answer that arrives after stop', async () => {
    let resolve!: (r: LeanChartsResponse) => void;
    const fetch = vi.fn(() => new Promise<LeanChartsResponse>(r => { resolve = r; }));
    const rec = record();
    const stop = startLeanChartsPoller({ fetch, live: true, onState: rec.onState });
    stop();
    resolve(resp(9));
    await flush();
    expect(rec.states).toHaveLength(0);
    await advance(LEAN_CHARTS_POLL_MS * 3);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  // Review focus 5: a round that just ended restarts its poller without blanking the chart.
  it('starts from the given initial state', async () => {
    const fetch = vi.fn<() => Promise<LeanChartsResponse>>().mockRejectedValueOnce(fail(500, 'boom'));
    const rec = record();
    const initial: LeanChartsState = { ...EMPTY_LEAN_CHARTS_STATE, data: resp(1) };
    const stop = startLeanChartsPoller({ fetch, live: false, onState: rec.onState, initial });
    await flush();
    expect(rec.last()).toMatchObject({ failures: 1, unavailable: false });
    expect(rec.last().data?.round_id).toBe(1);
    stop();
  });
});

describe('leanChartsKey', () => {
  it('is null when disabled or without a round, else round and route', () => {
    expect(leanChartsKey({ roundId: 7, teamId: null, enabled: false })).toBeNull();
    expect(leanChartsKey({ roundId: null, teamId: 3, enabled: true })).toBeNull();
    expect(leanChartsKey({ roundId: 7, teamId: null, enabled: true })).toBe('7:all');
    expect(leanChartsKey({ roundId: 7, teamId: 3, enabled: true })).toBe('7:3');
  });
});
