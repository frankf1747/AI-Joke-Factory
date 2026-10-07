/**
 * Polls the lean-charts endpoint for one round. The timing lives in
 * startLeanChartsPoller, a plain function the tests drive with fake timers;
 * useLeanCharts only wires it to React state.
 *
 *  - live (ACTIVE) round: one request at once, then one LEAN_CHARTS_POLL_MS
 *    after each answer — never two in flight;
 *  - ended round: one request; a failure retries on the same clock until one
 *    succeeds;
 *  - a failed poll keeps the last good response; LEAN_CHARTS_FAILURE_LIMIT
 *    failures in a row set `unavailable` ("Chart data unavailable — retrying");
 *  - 409 NOT_LEAN_ROUND clears the data and sets `notLean` so the caller hides
 *    the charts; a live poller keeps asking, so the next good answer shows
 *    them again;
 *  - an answer that arrives after stop() is dropped: a slow response for the
 *    round you just left never paints over the round you switched to.
 */
import { useEffect, useRef, useState } from 'react';
import type { LeanChartsResponse } from '../types/api';
import { instructorApi } from './api/instructor';
import { teamApi } from './api/team';
import { LEAN_CHARTS_FAILURE_LIMIT, LEAN_CHARTS_POLL_MS, isNotLeanRound } from './leanCharts';

export interface LeanChartsState {
  data: LeanChartsResponse | null;
  /** Consecutive failed polls since the last good answer. */
  failures: number;
  /** True once `failures` reaches LEAN_CHARTS_FAILURE_LIMIT. */
  unavailable: boolean;
  /** The server says the round is not Lean (409 NOT_LEAN_ROUND). */
  notLean: boolean;
}

export const EMPTY_LEAN_CHARTS_STATE: LeanChartsState = { data: null, failures: 0, unavailable: false, notLean: false };

export interface LeanChartsPollerOptions {
  fetch: () => Promise<LeanChartsResponse>;
  /** true: poll while the round runs; false: fetch once (retrying failures). */
  live: boolean;
  onState: (state: LeanChartsState) => void;
  /** The state to build on (kept when only `live` changed). Not emitted. */
  initial?: LeanChartsState;
  intervalMs?: number;
}

/** Starts polling; returns stop(). onState is never called after stop(). */
export function startLeanChartsPoller(opts: LeanChartsPollerOptions): () => void {
  const interval = opts.intervalMs ?? LEAN_CHARTS_POLL_MS;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let state: LeanChartsState = opts.initial ?? EMPTY_LEAN_CHARTS_STATE;

  const emit = (next: LeanChartsState) => {
    state = next;
    opts.onState(next);
  };
  const schedule = () => {
    if (!stopped) timer = setTimeout(() => { void tick(); }, interval);
  };
  const tick = async () => {
    timer = null;
    let res: LeanChartsResponse;
    try {
      res = await opts.fetch();
    } catch (err) {
      if (stopped) return;
      if (isNotLeanRound(err)) {
        emit({ data: null, failures: 0, unavailable: false, notLean: true });
        if (opts.live) schedule();
        return;
      }
      const failures = state.failures + 1;
      emit({ ...state, failures, unavailable: failures >= LEAN_CHARTS_FAILURE_LIMIT });
      schedule();
      return;
    }
    if (stopped) return;
    emit({ data: res, failures: 0, unavailable: false, notLean: false });
    if (opts.live) schedule();
  };

  void tick();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    timer = null;
  };
}

export interface LeanChartsSource {
  roundId: number | null;
  /** null: the instructor route (every team). A number: that team's route. */
  teamId: number | null;
  /** false: no requests at all (a Classic round, or no round yet). */
  enabled: boolean;
  /** true while the round is ACTIVE (poll every 10 s); false once ended (fetch once). */
  live: boolean;
}

/** What the charts are of. A new key starts empty; the same key keeps its data. */
export function leanChartsKey(src: Pick<LeanChartsSource, 'roundId' | 'teamId' | 'enabled'>): string | null {
  if (!src.enabled || src.roundId == null) return null;
  return `${src.roundId}:${src.teamId ?? 'all'}`;
}

export function useLeanCharts(src: LeanChartsSource): LeanChartsState {
  const { roundId, teamId, enabled, live } = src;
  const [state, setState] = useState<LeanChartsState>(EMPTY_LEAN_CHARTS_STATE);
  const stateRef = useRef<LeanChartsState>(EMPTY_LEAN_CHARTS_STATE);
  const keyRef = useRef<string | null>(null);

  useEffect(() => {
    const key = leanChartsKey({ roundId, teamId, enabled });
    // Same round and route (only `live` changed — the round started or ended):
    // keep what is on screen. A different round or team starts empty.
    const initial = key !== null && key === keyRef.current ? stateRef.current : EMPTY_LEAN_CHARTS_STATE;
    keyRef.current = key;
    const publish = (next: LeanChartsState) => {
      stateRef.current = next;
      setState(next);
    };
    publish(initial);
    if (key === null || roundId == null) return undefined;
    const fetch = teamId == null
      ? () => instructorApi.leanCharts(roundId)
      : () => teamApi.leanCharts(roundId, teamId);
    return startLeanChartsPoller({ fetch, live, initial, onState: publish });
  }, [roundId, teamId, enabled, live]);

  return state;
}
