import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiError } from '../apiClient';
import { sessionApi } from './session';
import { teamApi } from './team';
import { marketingApi } from './marketing';
import { instructorApi } from './instructor';
import type {
  Wrapped,
  SessionJoinResponse, SessionMeResponse, InstructorLoginResponse, RoundsActiveResponse,
  BatchSubmitResponse, TeamBatchesResponse, TeamSummaryResponse, TeamFeedbackResponse,
  MarketResponse,
  MarketingQueueNextResponse, MarketingQueueCountResponse, PublishResponse,
  LobbyResponse, InstructorRoundResponse, PublicRoundResponse, DeleteUserResponse,
  RoundStatsResponse, AdminResetResponse, ApiErrorBody, IdealDimension,
} from '../../types/api';

/* ============================================================================
   CONTRACT TESTS

   Every payload below is transcribed from jokefactory_be/src/app/http/handler/*.go
   (backend commit 8f9dfff). They ARE the contract. The backend is not deployed
   and cannot be run here, so these tests — driving the real service modules
   through the real apiRequest over a stubbed fetch — are the only proof the
   client is correct. If a test here fails after a backend change, the backend
   moved and this file is the record of what it moved from. Fix the service or
   the type; never the payload.

   Each fixture is ANNOTATED with its wire type, so tsc checks the transcription
   against types/api.ts. `Wrapped<T>` marks a {data}-enveloped endpoint; a bare
   type marks one of the three RAW endpoints (join, me, instructor/login).
============================================================================ */

/**
 * Snag A: vitest runs with environment 'node' — no DOM, no localStorage. Same
 * dependency-free stand-in services/apiClient.test.ts uses, so apiRequest's
 * real getUserIdHeader path runs rather than a mock of it.
 */
class MemoryStorage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  clear() { this.map.clear(); }
  getItem(key: string) { return this.map.has(key) ? this.map.get(key)! : null; }
  setItem(key: string, value: string) { this.map.set(key, String(value)); }
  removeItem(key: string) { this.map.delete(key); }
  key(i: number) { return Array.from(this.map.keys())[i] ?? null; }
}

const realFetch = globalThis.fetch;

/** Minimal Response stand-in — only the fields apiRequest reads. */
function stub(body: unknown, status = 200) {
  const spy = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => body,
    text: async () => JSON.stringify(body),
  })) as any;
  globalThis.fetch = spy;
  return spy;
}

/** The JSON body the service actually put on the wire. */
function sentBody(spy: any): any {
  return JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string);
}

/** The URL the service actually requested. */
function sentUrl(spy: any): string {
  return spy.mock.calls[0][0] as string;
}

/**
 * Snag C: the repo commits a .env.local with VITE_USE_MOCK_API=true, which Vite
 * loads for the test run — without this, apiRequest takes the mock branch and
 * never calls the stubbed fetch, and these tests would silently assert against
 * mockApi instead of the client. import.meta.env is baked in per module at
 * transform time, so process.env (which apiClient's envOverride consults first)
 * is the only channel that can steer it.
 */
beforeEach(() => {
  (globalThis as any).localStorage = new MemoryStorage();
  localStorage.clear();
  vi.stubEnv('VITE_API_BASE_URL', 'http://api.test');
  vi.stubEnv('VITE_USE_MOCK_API', 'false');
});

afterEach(() => {
  globalThis.fetch = realFetch;
  delete (globalThis as any).localStorage;
  vi.unstubAllEnvs();
});

// ---- session ---------------------------------------------------------------

describe('session', () => {
  it('reads a RAW join response without unwrapping', async () => {
    const body: SessionJoinResponse = {
      user: { user_id: 12, display_name: 'Alice' },
      participant: { status: 'WAITING', joined_at: '2026-01-12T10:00:00Z', assigned_at: null },
    };
    stub(body);
    const res = await sessionApi.join({ display_name: 'Alice' });
    expect(res.user.user_id).toBe(12);
    expect(res.participant.status).toBe('WAITING');
  });

  it('reads assignment as null before the instructor assigns', async () => {
    const body: SessionMeResponse = {
      user: { user_id: 12, display_name: 'Alice' },
      participant: { status: 'WAITING', joined_at: '2026-01-12T10:00:00Z', assigned_at: null },
      assignment: { role: null, team_id: null },
      teammates: [],
    };
    stub(body);
    const res = await sessionApi.me();
    expect(res.assignment.role).toBeNull();
  });

  /** RAW. handler/admin.go:41-48 — served by AdminHandler, not InstructorHandler.
   *  round_id is `var roundID interface{}`, so it is null when no round exists. */
  it('reads a RAW instructor login', async () => {
    const body: InstructorLoginResponse = {
      user: { user_id: 1, display_name: 'Instructor', role: 'INSTRUCTOR' },
      round_id: 1,
    };
    stub(body);
    const res = await sessionApi.instructorLogin({ display_name: 'Instructor', password: 'pw' });
    expect(res.user.role).toBe('INSTRUCTOR');
    expect(res.round_id).toBe(1);
  });

  /** handler/round.go:30-35. The STUDENT-SAFE projection: dto.ToPublicRound, so
   *  the engine knobs and the ideal profile are absent. Asserted, because a
   *  view that reaches for round.buy_threshold here would leak the answer key. */
  it('reads active rounds without the engine knobs', async () => {
    const body: Wrapped<RoundsActiveResponse> = {
      data: {
        rounds: [{
          id: 1, round_number: 1, status: 'ACTIVE', batch_size: 5, max_batch_size: 5,
          customer_budget: 100, market_price: 5, cost_of_publishing: 1, cost_of_discard: 0.5,
          customer_count: 20, feedback_joke_count: 3,
          started_at: '2026-01-12T10:05:00Z', ended_at: null, is_popped_active: false,
        }],
      },
    };
    stub(body);
    const res = await sessionApi.activeRounds();
    expect(res.rounds).toHaveLength(1);
    expect(res.rounds[0].status).toBe('ACTIVE');
    expect(res.rounds[0]).not.toHaveProperty('buy_threshold');
    expect(res.rounds[0]).not.toHaveProperty('jitter');
    expect(res.rounds[0]).not.toHaveProperty('swap_margin');
    expect(res.rounds[0]).not.toHaveProperty('feedback_pass_threshold');
    expect(res.rounds[0]).not.toHaveProperty('ideal_profile');
  });
});

// ---- marketing -------------------------------------------------------------

describe('marketing', () => {
  it('unwraps the queue payload', async () => {
    const body: Wrapped<MarketingQueueNextResponse> = {
      data: {
        batch: {
          batch_id: 501, round_id: 1, team_id: 3, status: 'SUBMITTED',
          submitted_at: '2026-01-12T10:20:00Z', locked_at: '2026-01-12T10:22:00Z', locked_by: 15,
        },
        jokes: [{ joke_id: 9101, joke_text: 'a' }, { joke_id: 9102, joke_text: 'b' }],
        queue_size: 4,
      },
    };
    stub(body);
    const res = await marketingApi.queueNext(1);
    expect(res.batch?.batch_id).toBe(501);
    expect(res.jokes).toHaveLength(2);
    expect(res.queue_size).toBe(4);
  });

  it('handles an empty queue', async () => {
    // handler/marketing.go:41-45 short-circuits: batch null, jokes [].
    const body: Wrapped<MarketingQueueNextResponse> = {
      data: { batch: null, jokes: [], queue_size: 0 },
    };
    stub(body);
    const res = await marketingApi.queueNext(1);
    expect(res.batch).toBeNull();
  });

  /** round_id travels in the QUERY STRING, not the path — handler/marketing.go:29
   *  and :125 both read c.Query("round_id"). Pinned because a path-style URL
   *  would 400 on a live server and pass every shape assertion here. */
  it('puts round_id in the query string, not the path', async () => {
    const body: Wrapped<MarketingQueueCountResponse> = { data: { queue_size: 4 } };
    const spy = stub(body);
    const res = await marketingApi.queueCount(1);
    expect(res.queue_size).toBe(4);
    expect(sentUrl(spy)).toBe('http://api.test/v1/marketing/queue/count?round_id=1');
  });

  it('reads a publish result', async () => {
    const body: Wrapped<PublishResponse> = {
      data: {
        batch: { batch_id: 501, status: 'PROCESSED', processed_at: '2026-01-12T10:30:00Z' },
        published: { count: 1, joke_ids: [9101] },
        discarded: { count: 1, joke_ids: [9102] },
      },
    };
    stub(body);
    const res = await marketingApi.publish(501, {
      jokes: [
        { joke_id: 9101, joke_title: 'Corporate Comedy', is_published: true },
        { joke_id: 9102, joke_title: '', is_published: false },
      ],
    });
    expect(res.published.joke_ids).toEqual([9101]);
    expect(res.batch.status).toBe('PROCESSED');
  });

  it('sends the publish decisions as the backend expects', async () => {
    const body: Wrapped<PublishResponse> = {
      data: {
        batch: { batch_id: 501, status: 'PROCESSED', processed_at: '2026-01-12T10:30:00Z' },
        published: { count: 0, joke_ids: [] },
        discarded: { count: 0, joke_ids: [] },
      },
    };
    const spy = stub(body);
    await marketingApi.publish(501, { jokes: [{ joke_id: 1, joke_title: 't', is_published: true }] });
    expect(sentBody(spy)).toEqual({ jokes: [{ joke_id: 1, joke_title: 't', is_published: true }] });
  });

  it('rejects an all-discard publish with NO_JOKE_PUBLISHED', async () => {
    // CORRECTED. An earlier draft of this plan asserted the opposite, on the
    // strength of usecase/marketing.go:81-82, which validates only that
    // *decisions* exist. The >=1-PUBLISHED rule lives one layer down, inside
    // the transaction: infra/repo/postgres/marketing_repo.go:198-200 returns
    // NewValidationError("jokes", "NO_JOKE_PUBLISHED") when len(published)==0.
    // Mirrored in testutil/memstore.go:474-475 and pinned by the backend's own
    // test at usecase/marketing_test.go:145-153.
    //
    // This matters beyond the contract: the Round 2 "Marketing may publish
    // nothing" flow is NOT supported by the deployed backend, and a screen
    // migrated onto this layer must either handle the 400 or prevent the
    // all-discard state.
    const body: ApiErrorBody = {
      error: { code: 'VALIDATION_ERROR', message: 'NO_JOKE_PUBLISHED', field: 'jokes' },
    };
    stub(body, 400);
    const err = await marketingApi.publish(501, {
      jokes: [
        { joke_id: 1, joke_title: '', is_published: false },
        { joke_id: 2, joke_title: '', is_published: false },
      ],
    }).catch(e => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(400);
    expect(err.field).toBe('jokes');
    expect(err.message).toBe('NO_JOKE_PUBLISHED');
  });
});

// ---- team ------------------------------------------------------------------

describe('team', () => {
  it('submits jokes as plain strings', async () => {
    // dto/models.go:11-14 — jokes is []string; titling is Marketing's job.
    const body: Wrapped<BatchSubmitResponse> = {
      data: {
        batch: {
          batch_id: 501, round_id: 1, team_id: 3, status: 'SUBMITTED',
          submitted_at: '2026-01-12T10:20:00Z', jokes_count: 2,
        },
      },
    };
    const spy = stub(body);
    await teamApi.submitBatch(1, { team_id: 3, jokes: ['one', 'two'] });
    expect(sentBody(spy).jokes).toEqual(['one', 'two']);
  });

  it('reads a team batch listing', async () => {
    const body: Wrapped<TeamBatchesResponse> = {
      data: {
        batches: [{
          batch_id: 501, status: 'PROCESSED',
          submitted_at: '2026-01-12T10:20:00Z', processed_at: '2026-01-12T10:30:00Z',
          jokes: [{
            joke_id: 9101, joke_text: 'a', joke_title: 'Corporate Comedy',
            publish_status: 'PUBLISHED', published_at: '2026-01-12T10:30:00Z', sold_count: 4,
          }, {
            // handler/batch.go:86 emits the raw *string, so an untitled joke is
            // null here — unlike the market board, which flattens it to "".
            joke_id: 9102, joke_text: 'b', joke_title: null,
            publish_status: 'DISCARDED', published_at: null, sold_count: 0,
          }],
        }],
      },
    };
    stub(body);
    const res = await teamApi.batches(1, 3);
    expect(res.batches![0].jokes![1].joke_title).toBeNull();
  });

  /** NULLABLE ARRAYS. handler/batch.go:79 declares `var out []gin.H` and :81
   *  `var jokes []gin.H`; Go marshals a nil slice as `null`, not `[]`. A view
   *  that calls .map() straight off either will crash on a team's first visit. */
  it('reads batches as null — not [] — when a team has none', async () => {
    const body: Wrapped<TeamBatchesResponse> = { data: { batches: null } };
    stub(body);
    const res = await teamApi.batches(1, 3);
    expect(res.batches).toBeNull();
    expect(res.batches).not.toEqual([]);
  });

  it('reads a batch with no jokes as jokes: null', async () => {
    const body: Wrapped<TeamBatchesResponse> = {
      data: {
        batches: [{
          batch_id: 502, status: 'DRAFT', submitted_at: null, processed_at: null, jokes: null,
        }],
      },
    };
    stub(body);
    const res = await teamApi.batches(1, 3);
    expect(res.batches![0].jokes).toBeNull();
  });

  it('reads feedback as dimension names only', async () => {
    const body: Wrapped<TeamFeedbackResponse> = {
      data: {
        jokes: [{
          joke_id: 9101, joke_title: 'Corporate Comedy', was_bought: true,
          good_dimensions: ['LENGTH', 'TOPIC'],
          improve_dimensions: ['WORDPLAY', 'CLARITY', 'ENERGY'],
        }],
      },
    };
    stub(body);
    const res = await teamApi.feedback(1, 3);
    expect(res.jokes[0].good_dimensions).toEqual(['LENGTH', 'TOPIC']);
    // The contract carries no categories and no numbers. If either ever appears,
    // it is a privacy regression, not a feature.
    expect(res.jokes[0]).not.toHaveProperty('dim_fit');
  });

  it('reads the team summary keys', async () => {
    const body: Wrapped<TeamSummaryResponse> = {
      data: {
        team: { id: 3, name: 'Team 3' }, round_id: 1, rank: 1, points: 42,
        profit: 40.85, total_sales: 42, performance_label: 'AVERAGE PERFORMING',
        unsold_jokes: 0, sold_jokes_count: 10, batches_created: 4,
        batches_processed: 3, published_jokes: 10, discarded_jokes: 5,
        unprocessed_batches: 1,
      },
    };
    stub(body);
    const res = await teamApi.summary(1, 3);
    expect(res.profit).toBeCloseTo(40.85);
    expect(res.unprocessed_batches).toBe(1);
  });

  /** handler/customer.go:43-62. joke_title is flattened to "" (never null), and
   *  published_at is only added to the map when non-nil — so the KEY IS ABSENT
   *  on an unpublished row rather than present-and-null. */
  it('reads the market board with a flattened title and an optional published_at', async () => {
    const body: Wrapped<MarketResponse> = {
      data: {
        items: [{
          joke_id: 9101, joke_text: 'a', joke_title: 'Corporate Comedy',
          team_id: 3, team_name: 'Team 3', sold_count: 4,
          published_at: '2026-01-12T10:30:00Z',
        }, {
          joke_id: 9103, joke_text: 'c', joke_title: '',
          team_id: 4, team_name: 'Team 4', sold_count: 0,
        }],
      },
    };
    stub(body);
    const res = await teamApi.market(1);
    expect(res.items[0].joke_title).toBe('Corporate Comedy');
    expect(res.items[1].joke_title).toBe('');
    expect(res.items[1]).not.toHaveProperty('published_at');
  });
});

// ---- instructor ------------------------------------------------------------

/* The instructor round projections, reused by the config/start/end/popups tests
   below. handler/instructor.go:86 and :192 emit dto.ToInstructorRound; :221 and
   :248 emit dto.ToPublicRound. The difference is the whole point of two of the
   tests, so both shapes are spelled out once here. */

const idealProfile: Record<IdealDimension, string> = {
  LENGTH: 'Medium', TOPIC: 'Work', HUMOR_STYLE: 'Observational',
  COMPLEXITY: 'Moderate', EDGINESS: 'Clean', STRUCTURE: 'Setup–punchline',
  WORDPLAY: 'Light', FRESHNESS: 'Timeless', SETUP_PAYOFF: 'Balanced',
  CLARITY: 'Crystal clear', ENERGY: 'Conversational',
};

describe('instructor', () => {
  it('reads the PascalCase lobby without renaming it', async () => {
    const body: Wrapped<LobbyResponse> = {
      data: {
        RoundID: 1,
        Summary: { Waiting: 2, Assigned: 8, Dropped: 0, TeamCount: 4 },
        Teams: [{
          Team: { id: 3, name: 'Team 3', created_at: '2026-01-12T10:10:00Z' },
          Members: [{ UserID: 12, DisplayName: 'Alice', Role: 'JM' }],
        }],
        Unassigned: [{ UserID: 20, DisplayName: 'Carol', Status: 'WAITING' }],
      },
    };
    stub(body);
    const res = await instructorApi.lobby(1);
    expect(res.Summary.TeamCount).toBe(4);
    expect(res.Teams![0].Members[0].Role).toBe('JM');
  });

  it('sends team_count alone on assign', async () => {
    const body: Wrapped<LobbyResponse> = {
      data: {
        RoundID: 1,
        Summary: { Waiting: 0, Assigned: 8, Dropped: 0, TeamCount: 4 },
        Teams: [],
        Unassigned: [],
      },
    };
    const spy = stub(body);
    await instructorApi.assign(1, 4);
    expect(sentBody(spy)).toEqual({ team_count: 4 });
  });

  /** stats_repo.go:43 and :56 append onto a nil slice, so an untouched lobby
   *  sends null for Teams and Unassigned rather than []. */
  it('reads an empty lobby as null rosters', async () => {
    const body: Wrapped<LobbyResponse> = {
      data: {
        RoundID: 1,
        Summary: { Waiting: 0, Assigned: 0, Dropped: 0, TeamCount: 0 },
        Teams: null,
        Unassigned: null,
      },
    };
    stub(body);
    const res = await instructorApi.lobby(1);
    expect(res.Teams).toBeNull();
    expect(res.Unassigned).toBeNull();
  });

  /** handler/instructor.go:86-88 — the INSTRUCTOR projection. ideal_profile
   *  carries omitempty, so the key is absent (not null) until one is set. */
  it('reads the instructor projection back from config', async () => {
    const body: Wrapped<InstructorRoundResponse> = {
      data: {
        round: {
          id: 1, round_number: 1, status: 'CONFIGURED', batch_size: 5, max_batch_size: 5,
          customer_budget: 100, market_price: 5, cost_of_publishing: 1, cost_of_discard: 0.5,
          customer_count: 20, feedback_joke_count: 3,
          started_at: null, ended_at: null, is_popped_active: false,
          buy_threshold: 0.6, jitter: 0.05, swap_margin: 0.1, feedback_pass_threshold: 0.7,
        },
      },
    };
    const spy = stub(body);
    const res = await instructorApi.config(1, { batch_size: 5, buy_threshold: 0.6 });
    expect(sentBody(spy)).toEqual({ batch_size: 5, buy_threshold: 0.6 });
    expect(res.round.buy_threshold).toBe(0.6);
    expect(res.round).not.toHaveProperty('ideal_profile');
  });

  /** handler/instructor.go:192 — also the INSTRUCTOR projection, and start
   *  always validates an ideal profile (usecase/instructor.go:243), so the key
   *  is present and TOTAL over all 11 IdealDimensions. */
  it('reads the locked config and ideal profile back from start', async () => {
    const body: Wrapped<InstructorRoundResponse> = {
      data: {
        round: {
          id: 1, round_number: 1, status: 'ACTIVE', batch_size: 5, max_batch_size: 5,
          customer_budget: 100, market_price: 5, cost_of_publishing: 1, cost_of_discard: 0.5,
          customer_count: 20, feedback_joke_count: 3,
          started_at: '2026-01-12T10:05:00Z', ended_at: null, is_popped_active: false,
          buy_threshold: 0.6, jitter: 0.05, swap_margin: 0.1, feedback_pass_threshold: 0.7,
          ideal_profile: idealProfile,
        },
      },
    };
    stub(body);
    const res = await instructorApi.start(1);
    expect(res.round.status).toBe('ACTIVE');
    expect(res.round.ideal_profile!.TOPIC).toBe('Work');
  });

  /** CORRECTED, and got wrong once already in this plan: handler/instructor.go:221
   *  calls dto.ToPublicRound, NOT ToInstructorRound. The engine knobs and the
   *  ideal profile are ABSENT from this body — an instructor screen that reads
   *  round.buy_threshold off the end() result gets undefined, silently. */
  it('reads end() as the PUBLIC projection, with no engine knobs', async () => {
    const body: Wrapped<PublicRoundResponse> = {
      data: {
        round: {
          id: 1, round_number: 1, status: 'ENDED', batch_size: 5, max_batch_size: 5,
          customer_budget: 100, market_price: 5, cost_of_publishing: 1, cost_of_discard: 0.5,
          customer_count: 20, feedback_joke_count: 3,
          started_at: '2026-01-12T10:05:00Z', ended_at: '2026-01-12T11:00:00Z',
          is_popped_active: false,
        },
      },
    };
    stub(body);
    const res = await instructorApi.end(1);
    expect(res.round.status).toBe('ENDED');
    expect(res.round).not.toHaveProperty('buy_threshold');
    expect(res.round).not.toHaveProperty('ideal_profile');
    expect(res.round).not.toHaveProperty('jitter');
    expect(res.round).not.toHaveProperty('swap_margin');
    expect(res.round).not.toHaveProperty('feedback_pass_threshold');
  });

  /** handler/instructor.go:248 — the PUBLIC projection here too. See end(). */
  it('reads popups() as the PUBLIC projection and sends is_popped_active', async () => {
    const body: Wrapped<PublicRoundResponse> = {
      data: {
        round: {
          id: 1, round_number: 1, status: 'ACTIVE', batch_size: 5, max_batch_size: 5,
          customer_budget: 100, market_price: 5, cost_of_publishing: 1, cost_of_discard: 0.5,
          customer_count: 20, feedback_joke_count: 3,
          started_at: '2026-01-12T10:05:00Z', ended_at: null, is_popped_active: true,
        },
      },
    };
    const spy = stub(body);
    const res = await instructorApi.popups(1, true);
    expect(sentBody(spy)).toEqual({ is_popped_active: true });
    expect(res.round.is_popped_active).toBe(true);
    expect(res.round).not.toHaveProperty('buy_threshold');
    expect(res.round).not.toHaveProperty('ideal_profile');
  });

  /** handler/instructor.go:139 — patch returns the same lobby snapshot. */
  it('patches a user and gets the lobby back', async () => {
    const body: Wrapped<LobbyResponse> = {
      data: {
        RoundID: 1,
        Summary: { Waiting: 1, Assigned: 9, Dropped: 0, TeamCount: 4 },
        Teams: [{
          Team: { id: 3, name: 'Team 3', created_at: '2026-01-12T10:10:00Z' },
          Members: [{ UserID: 20, DisplayName: 'Carol', Role: 'MARKETING' }],
        }],
        Unassigned: null,
      },
    };
    const spy = stub(body);
    const res = await instructorApi.patchUser(1, 20, { status: 'ASSIGNED', role: 'MARKETING', team_id: 3 });
    expect(sentBody(spy)).toEqual({ status: 'ASSIGNED', role: 'MARKETING', team_id: 3 });
    expect(res.Teams![0].Members[0].Role).toBe('MARKETING');
  });

  /** handler/instructor.go:287 — delete does NOT return the lobby snapshot. */
  it('deletes a user and gets only the id back', async () => {
    const body: Wrapped<DeleteUserResponse> = { data: { deleted_user_id: 20 } };
    const spy = stub(body);
    const res = await instructorApi.deleteUser(1, 20);
    expect(res.deleted_user_id).toBe(20);
    expect(res).not.toHaveProperty('Teams');
    expect((spy.mock.calls[0][1] as RequestInit).method).toBe('DELETE');
  });

  it('reads leaderboard-only stats', async () => {
    const body: Wrapped<RoundStatsResponse> = {
      data: {
        round_id: 1,
        leaderboard: [{
          rank: 1,
          // TeamStats.Team is a full domain.Team (json tags, so snake_case) and
          // CreatedAt is a non-pointer time.Time — it always marshals. The
          // leaderboard query (stats_repo.go:224-228) never scans it, so the
          // wire really does carry Go's zero time here.
          team: { id: 3, name: 'Team 3', created_at: '0001-01-01T00:00:00Z' },
          batches_processed: 3,
          total_sales: 42, published_jokes: 10, discarded_jokes: 5,
          total_jokes: 15, unsold_jokes: 0, profit: 40.85,
        }],
      },
    };
    stub(body);
    const res = await instructorApi.stats(1);
    expect(res.leaderboard).toHaveLength(1);
    // No time-series keys exist. Assert it, so a future "the charts are back"
    // assumption fails here rather than in a view.
    expect(res).not.toHaveProperty('sales_over_time');
  });

  /** handler/admin.go:60-63 — the literal strings the handler hard-codes. */
  it('reads the admin reset acknowledgement', async () => {
    const body: Wrapped<AdminResetResponse> = {
      data: { status: 'reset', message: 'all game data cleared' },
    };
    const spy = stub(body);
    const res = await instructorApi.resetGame();
    expect(res.status).toBe('reset');
    expect(sentUrl(spy)).toBe('http://api.test/v1/admin/reset');
  });
});
