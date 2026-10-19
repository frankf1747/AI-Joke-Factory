import { describe, it, expect, vi } from 'vitest';
import { pollMarketingWork } from './context';
import type { MarketingPollDeps, MarketingPollIo } from './context';
import { ApiError } from './services/apiClient';
import type { ApiQcQueueNextResponse, Role, RoundId, TeamId } from './types';

/* The Marketing poll runs every 2.5 s. While a batch is on the desk it must keep
   refreshing the team summary, the feedback and the batches (the screen's scoreboard
   and feedback rail read them), and it must keep the queue count apart from the held
   batch. Only queue/next, which locks a batch to the caller, is held back: it is
   re-fetched when the desk is empty, or every 10 s while a batch is held so a lock
   change or the round ending is still seen. Driven with a fake API and fake clock. */

const ROUND = 7 as RoundId;
const TEAM = 3 as TeamId;
const MARKETING = 'QUALITY_CONTROL' as Role;

const HELD: ApiQcQueueNextResponse = {
  batch: { batch_id: 41, team_id: 3 },
  jokes: [{ joke_id: 1, joke_text: 'a' }],
  queue_size: 2,
} as unknown as ApiQcQueueNextResponse;

function setup(opts: { queueNext?: () => Promise<unknown>; count?: () => Promise<unknown> } = {}) {
  const io: MarketingPollIo = {
    queueCount: vi.fn(opts.count ?? (async () => ({ data: { queue_size: 2 } }))),
    queueNext: vi.fn(opts.queueNext ?? (async () => ({ data: { batch: null, jokes: [], queue_size: 2 } }))),
    teamSummary: vi.fn(async () => ({ data: { rank: 1 } })),
    listTeamBatches: vi.fn(async () => ({ data: { batches: [] } })),
    pollFeedback: vi.fn(async () => ({ jokes: [] })),
  };
  const state = { queue: null as ApiQcQueueNextResponse | null, size: null as number | null };
  let clock = 1_000_000;
  let cancelled = false;
  const deps = (): MarketingPollDeps => ({
    io,
    role: MARKETING,
    roundId: ROUND,
    roundNumber: 2,
    teamId: TEAM,
    mayClaim: () => true,
    isCancelled: () => cancelled,
    now: () => clock,
    refs: {
      qcQueue: { current: state.queue },
      qcNextRetryAfter: refs.retry,
      qcNextFetchedAt: refs.fetchedAt,
      qcQueueGen: refs.gen,
      teamSummaryUnsupported: { current: false },
      teamFeedbackUnsupported: { current: false },
      submittedBatchJokes: { current: {} },
    },
    set: {
      queue: q => { state.queue = q; },
      queueSize: n => { state.size = n; },
      teamSummary: vi.fn(),
      teamFeedback: vi.fn(),
      batches: vi.fn(),
    },
  });
  const refs = { retry: { current: 0 }, fetchedAt: { current: 0 }, gen: { current: 0 } };
  return { io, state, deps, refs, cancel: () => { cancelled = true; }, advance: (ms: number) => { clock += ms; } };
}

describe('pollMarketingWork', () => {
  it('keeps refreshing summary, feedback and batches while a batch is held, and fetches queue/next once', async () => {
    const t = setup({ queueNext: async () => ({ data: HELD }) });

    await pollMarketingWork(t.deps());
    expect(t.state.queue?.batch?.batch_id).toBe(41);

    t.advance(2500);
    await pollMarketingWork(t.deps());

    expect(t.io.teamSummary).toHaveBeenCalledTimes(2);
    expect(t.io.pollFeedback).toHaveBeenCalledTimes(2);
    expect(t.io.listTeamBatches).toHaveBeenCalledTimes(2);
    expect(t.io.queueCount).toHaveBeenCalledTimes(2);
    expect(t.io.queueNext).toHaveBeenCalledTimes(1);
  });

  it('re-fetches queue/next once the held batch is older than 10 s', async () => {
    const t = setup({ queueNext: async () => ({ data: HELD }) });
    await pollMarketingWork(t.deps());
    t.advance(9_000);
    await pollMarketingWork(t.deps());
    expect(t.io.queueNext).toHaveBeenCalledTimes(1);
    t.advance(1_000);
    await pollMarketingWork(t.deps());
    expect(t.io.queueNext).toHaveBeenCalledTimes(2);
  });

  it('asks queue/next every tick while the desk is empty', async () => {
    const t = setup();
    await pollMarketingWork(t.deps());
    t.advance(2500);
    await pollMarketingWork(t.deps());
    expect(t.io.queueNext).toHaveBeenCalledTimes(2);
  });

  it('reports the queue count even when queue/next answers batch null', async () => {
    const t = setup();
    await pollMarketingWork(t.deps());
    expect(t.state.queue).toBeNull();
    expect(t.state.size).toBe(2);
  });

  it('reports the queue count on a tick that skips queue/next', async () => {
    const t = setup({ queueNext: async () => ({ data: HELD }) });
    await pollMarketingWork(t.deps());
    t.advance(2500);
    await pollMarketingWork(t.deps());
    expect(t.io.queueNext).toHaveBeenCalledTimes(1);
    expect(t.state.size).toBe(2);
  });

  it('leaves the previous count when queue/count fails', async () => {
    let fail = false;
    const t = setup({ count: async () => { if (fail) throw new Error('down'); return { data: { queue_size: 4 } }; } });
    await pollMarketingWork(t.deps());
    expect(t.state.size).toBe(4);
    fail = true;
    await pollMarketingWork(t.deps());
    expect(t.state.size).toBe(4);
  });

  it('does not call queue/next from a watch tab that may not claim', async () => {
    const t = setup();
    const d = t.deps();
    await pollMarketingWork({ ...d, mayClaim: () => false });
    expect(t.io.queueNext).not.toHaveBeenCalled();
    expect(t.state.size).toBe(2);
    expect(t.io.listTeamBatches).toHaveBeenCalledTimes(1);
  });

  it('drops a queue/next answer that lands after a desk action bumped the generation', async () => {
    let resolveNext!: (v: unknown) => void;
    const t = setup({ queueNext: () => new Promise(r => { resolveNext = r; }) });
    const tick = pollMarketingWork(t.deps());
    await vi.waitFor(() => expect(t.io.queueNext).toHaveBeenCalledTimes(1));

    // Marketing releases (or splits) the batch while queue/next is still in flight.
    t.refs.gen.current += 1;
    t.state.queue = null;
    resolveNext({ data: HELD });
    await tick;

    expect(t.state.queue).toBeNull();
    expect(t.io.teamSummary).toHaveBeenCalledTimes(1);
  });

  it('writes neither the ref nor the setter when the tick was cancelled mid-flight', async () => {
    let resolveNext!: (v: unknown) => void;
    const t = setup({ queueNext: () => new Promise(r => { resolveNext = r; }) });
    const d = t.deps();
    const tick = pollMarketingWork(d);
    await vi.waitFor(() => expect(t.io.queueNext).toHaveBeenCalledTimes(1));

    t.cancel();
    resolveNext({ data: HELD });
    await tick;

    expect(d.refs.qcQueue.current).toBeNull();
    expect(t.state.queue).toBeNull();
    expect(t.state.size).toBe(2);
  });

  it('clears the desk on a queue/next 404 and does not ask again for 30 s', async () => {
    const t = setup({ queueNext: async () => { throw new ApiError({ status: 404, code: 'NOT_FOUND', message: 'not found' }); } });
    await pollMarketingWork(t.deps());
    expect(t.state.queue).toBeNull();
    expect(t.io.queueNext).toHaveBeenCalledTimes(1);

    t.advance(29_000);
    await pollMarketingWork(t.deps());
    expect(t.io.queueNext).toHaveBeenCalledTimes(1);

    t.advance(1_000);
    await pollMarketingWork(t.deps());
    expect(t.io.queueNext).toHaveBeenCalledTimes(2);
  });

  it('sets the batch list to the API batches only, with no legacy local history merged in', async () => {
    const t = setup();
    t.io.listTeamBatches = vi.fn(async () => ({ data: { batches: [{ batch_id: 41, team_id: 3, status: 'SUBMITTED', jokes: [] }] } }));
    const d = t.deps();
    await pollMarketingWork(d);
    const lists = (d.set.batches as ReturnType<typeof vi.fn>).mock.calls;
    expect(lists).toHaveLength(1);
    expect(lists[0][0].map((b: { batch_id: number }) => b.batch_id)).toEqual([41]);
  });

  it('keeps the batch on the desk when queue/count fails for a transient reason', async () => {
    let fail = false;
    const t = setup({
      queueNext: async () => ({ data: HELD }),
      count: async () => { if (fail) throw new ApiError({ status: 503, code: 'UNAVAILABLE', message: 'down' }); return { data: { queue_size: 2 } }; },
    });
    await pollMarketingWork(t.deps());
    expect(t.state.queue?.batch?.batch_id).toBe(41);
    fail = true;
    await pollMarketingWork(t.deps());
    expect(t.state.queue?.batch?.batch_id).toBe(41);
    const network = setup({ queueNext: async () => ({ data: HELD }), count: async () => { if (fail) throw new TypeError('Failed to fetch'); return { data: { queue_size: 2 } }; } });
    fail = false;
    await pollMarketingWork(network.deps());
    fail = true;
    await pollMarketingWork(network.deps());
    expect(network.state.queue?.batch?.batch_id).toBe(41);
  });

  it('keeps the batch on the desk when a due queue/next re-ask fails with a 5xx', async () => {
    let fail = false;
    const t = setup({ queueNext: async () => { if (fail) throw new ApiError({ status: 500, code: 'INTERNAL', message: 'boom' }); return { data: HELD }; } });
    await pollMarketingWork(t.deps());
    fail = true;
    t.advance(10_000);
    await pollMarketingWork(t.deps());
    expect(t.io.queueNext).toHaveBeenCalledTimes(2);
    expect(t.state.queue?.batch?.batch_id).toBe(41);
  });

  it('clears the desk when the round is no longer active (409) or the queue is empty', async () => {
    let mode: 'held' | '409' = 'held';
    const t = setup({ queueNext: async () => { if (mode === '409') throw new ApiError({ status: 409, code: 'CONFLICT', message: 'round not active' }); return { data: HELD }; } });
    await pollMarketingWork(t.deps());
    mode = '409';
    t.advance(10_000);
    await pollMarketingWork(t.deps());
    expect(t.state.queue).toBeNull();

    let size = 2;
    const e = setup({ queueNext: async () => ({ data: HELD }), count: async () => ({ data: { queue_size: size } }) });
    await pollMarketingWork(e.deps());
    size = 0;
    await pollMarketingWork(e.deps());
    expect(e.state.queue).toBeNull();
  });
});
