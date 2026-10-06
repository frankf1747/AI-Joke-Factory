// services/bots/testing/fakeApi.ts
/**
 * An in-memory backend for engine tests. It models only what the engine relies
 * on, but models it strictly: role checks, round-1 rules, claim locks, and an
 * Auto-Assign that deliberately scrambles bots and humans together so the tests
 * prove the engine re-pins them.
 */
import type {
  BatchSubmitRequest, ConfigRequest, FeedbackJoke, LobbyResponse, MarketingQueueEnvelope,
  PatchUserRequest, PublicRound, PublishRequest, Role, SessionMeResponse,
} from '../../../types/api';
import type { BotApi } from '../api';

export class FakeApiError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
    this.name = 'FakeApiError';
  }
}

export interface FakeUser {
  id: number;
  name: string;
  role: Role | null;
  teamId: number | null;
  status: 'WAITING' | 'ASSIGNED';
}

interface FakeJoke { joke_id: number; joke_text: string; published: boolean }

export interface FakeBatch {
  id: number;
  /** The round it was submitted in; the queue and feedback are round-scoped. */
  roundId: number;
  teamId: number;
  rawText: string | null;
  jokes: FakeJoke[];
  state: 'QUEUED' | 'CLAIMED' | 'DONE';
  lockedBy: number | null;
}

export interface Decision { teamId: number; batchId: number; published: number; total: number }

const STAMP = '2026-01-01T00:00:00Z';

export class FakeWorld {
  readonly users = new Map<number, FakeUser>();
  teamIds: number[] = [];
  profileConfigured = false;
  round: PublicRound = {
    id: 1, round_number: 1, status: 'CONFIGURED', batch_size: 5, max_batch_size: 5,
    customer_budget: 3, market_price: 1, cost_of_publishing: 0.1, cost_of_discard: 0.01,
    customer_count: 100, feedback_joke_count: 3, started_at: null, ended_at: null,
    is_popped_active: false,
    market_mode: 'CLASSIC', arrival_window_seconds: 900, setup_cost_per_batch: 0,
    carrying_cost_per_joke_minute: 0, wip_limit: 0,
  };
  readonly batches: FakeBatch[] = [];
  readonly decisions: Decision[] = [];
  readonly calls: string[] = [];
  /**
   * Publishing enqueues an LLM classification, so a joke's dimensions arrive
   * after the publish, not with it. Tests turn this off to model the lag, then
   * call classify().
   */
  autoClassify = true;
  readonly classified = new Set<number>();
  /** Published joke ids in publish order, oldest first. */
  readonly publishOrder: number[] = [];
  /**
   * The order Auto-Assign deals participants into seats, two per team. The
   * default, newest first, puts bots and humans on each other's teams. The real
   * assign shuffles randomly (usecase/instructor.go, r.Shuffle), so two calls
   * rarely agree; tests that need that pass an order that changes per call.
   */
  assignOrder: (participants: FakeUser[], call: number) => FakeUser[] =
    ps => [...ps].sort((a, b) => b.id - a.id);
  private assignCalls = 0;
  private failures: Array<{ method: string; userName?: string; remaining: number; status: number }> = [];
  private nextUserId = 100;
  private nextBatchId = 1;
  private nextJokeId = 1000;

  addUser(name: string, role: Role | null = null, teamId: number | null = null): number {
    const id = this.nextUserId++;
    this.users.set(id, { id, name, role, teamId, status: teamId == null ? 'WAITING' : 'ASSIGNED' });
    return id;
  }

  userNamed(name: string): FakeUser | undefined {
    return [...this.users.values()].find(u => u.name === name);
  }

  /**
   * Make `method` fail `times` times, optionally only for one user. Defaults to
   * a 500 'INTERNAL'; pass another status (e.g. 403) to test that error path.
   */
  failNext(method: string, times: number, userName?: string, status = 500): void {
    this.failures.push({ method, userName, remaining: times, status });
  }

  /** Classify the given published jokes, or every published joke when none are named. */
  classify(jokeIds?: number[]): void {
    for (const id of jokeIds ?? this.publishOrder) this.classified.add(id);
  }

  api(): BotApi {
    return new FakeApi(this, null);
  }

  record(method: string, user: FakeUser | undefined): void {
    this.calls.push(method);
    const f = this.failures.find(
      x => x.method === method && x.remaining > 0 && (x.userName === undefined || x.userName === user?.name),
    );
    if (f) {
      f.remaining--;
      throw new FakeApiError(f.status, f.status === 500 ? 'INTERNAL' : 'INJECTED');
    }
  }

  participants(): FakeUser[] {
    return [...this.users.values()].filter(u => u.role !== 'INSTRUCTOR');
  }

  lobby(): LobbyResponse {
    const ps = this.participants();
    const unassigned = ps.filter(u => u.teamId == null);
    return {
      RoundID: this.round.id,
      Summary: { Waiting: unassigned.length, Assigned: ps.length - unassigned.length, Dropped: 0, TeamCount: this.teamIds.length },
      // real: stats_repo.go:42 — a team with no members is not listed.
      Teams: this.teamIds
        .map(id => ({
          Team: { id, name: `Team ${id}`, created_at: STAMP },
          Members: ps.filter(u => u.teamId === id).map(u => ({ UserID: u.id, DisplayName: u.name, Role: (u.role ?? 'JM') as Role })),
        }))
        .filter(t => t.Members.length > 0),
      Unassigned: unassigned.map(u => ({ UserID: u.id, DisplayName: u.name, Status: 'WAITING' as const })),
    };
  }

  newBatchId(): number { return this.nextBatchId++; }
  nextAssignCall(): number { return ++this.assignCalls; }
  newJokeId(): number { return this.nextJokeId++; }

  /**
   * real: usecase/marketing.go:143-160, repo/marketing_repo.go:228-238 — a batch
   * of another team or held by another marketer is 403, not 409; 409 is only
   * for a batch that is already processed.
   */
  claimedBy(batchId: number, user: FakeUser): FakeBatch {
    const b = this.batches.find(x => x.id === batchId);
    if (!b) throw new FakeApiError(404, 'NOT_FOUND');
    if (b.teamId !== user.teamId) throw new FakeApiError(403, 'FORBIDDEN');
    if (b.state === 'DONE') throw new FakeApiError(409, 'CONFLICT');
    if (b.state !== 'CLAIMED' || b.lockedBy !== user.id) throw new FakeApiError(403, 'FORBIDDEN');
    return b;
  }

  envelope(b: FakeBatch): MarketingQueueEnvelope {
    return {
      batch: {
        batch_id: b.id, round_id: b.roundId, team_id: b.teamId, status: 'SUBMITTED',
        submitted_at: STAMP, locked_at: STAMP, locked_by: b.lockedBy, raw_text: b.rawText,
      },
      jokes: b.jokes.map(j => ({ joke_id: j.joke_id, joke_text: j.joke_text })),
      queue_size: this.batches.filter(x => x.roundId === b.roundId && x.teamId === b.teamId && x.state === 'QUEUED').length,
    };
  }
}

class FakeApi implements BotApi {
  constructor(private readonly w: FakeWorld, private readonly userId: number | null) {}

  as(userId: number): BotApi {
    return new FakeApi(this.w, userId);
  }

  private enter(method: string): FakeUser | undefined {
    const user = this.userId == null ? undefined : this.w.users.get(this.userId);
    this.w.record(method, user);
    return user;
  }

  private requireUser(method: string): FakeUser {
    const user = this.enter(method);
    if (!user) throw new FakeApiError(404, 'NOT_FOUND');
    return user;
  }

  private requireInstructor(method: string): void {
    if (this.requireUser(method).role !== 'INSTRUCTOR') throw new FakeApiError(403, 'FORBIDDEN');
  }

  private requireMarketing(method: string): FakeUser {
    const u = this.requireUser(method);
    if (u.role !== 'MARKETING') throw new FakeApiError(403, 'FORBIDDEN');
    return u;
  }

  private requireActive(): void {
    if (this.w.round.status !== 'ACTIVE') throw new FakeApiError(409, 'ROUND_NOT_ACTIVE');
  }

  async sessionJoin(body: { display_name: string }) {
    this.enter('sessionJoin');
    const id = this.w.userNamed(body.display_name)?.id ?? this.w.addUser(body.display_name);
    const u = this.w.users.get(id) as FakeUser;
    return { user: { user_id: id, display_name: u.name }, participant: { status: u.status, joined_at: STAMP, assigned_at: null } };
  }

  async sessionMe(): Promise<SessionMeResponse> {
    const u = this.requireUser('sessionMe');
    return {
      user: { user_id: u.id, display_name: u.name },
      participant: { status: u.status, joined_at: STAMP, assigned_at: null },
      assignment: { role: u.role, team_id: u.teamId },
      teammates: [],
    };
  }

  async roundsActive() {
    this.enter('roundsActive');
    return { rounds: [{ ...this.w.round }] };
  }

  async submitBatch(_roundId: number, body: BatchSubmitRequest) {
    // real: usecase/batch.go:41-71 — validate the body, then role/team, then
    // round status, in that order.
    const u = this.requireUser('submitBatch');
    const raw = 'raw_text' in body && body.raw_text ? body.raw_text : null;
    if (!raw || raw.trim().length < 20) throw new FakeApiError(400, 'VALIDATION_ERROR');
    if (u.role !== 'JM' || u.teamId !== body.team_id) throw new FakeApiError(403, 'FORBIDDEN');
    this.requireActive();
    this.w.batches.push({
      id: this.w.newBatchId(), roundId: this.w.round.id, teamId: u.teamId, rawText: raw, jokes: [], state: 'QUEUED', lockedBy: null,
    });
    return {};
  }

  async teamFeedback(roundId: number, teamId: number) {
    this.requireUser('teamFeedback');
    // real: usecase/feedback.go:38-76 — nothing before the round has started.
    if (this.w.round.status === 'CONFIGURED') throw new FakeApiError(409, 'ROUND_NOT_ACTIVE');
    // real: repo/stats_repo.go:134-157 — only the latest feedback_joke_count
    // published jokes of the team in this round (WHERE b.round_id = $1), newest
    // first; dimensions land once classified.
    const mine = new Set(
      this.w.batches
        .filter(b => b.roundId === roundId && b.teamId === teamId && b.state === 'DONE')
        .flatMap(b => b.jokes.map(j => j.joke_id)),
    );
    const jokes: FeedbackJoke[] = [...this.w.publishOrder]
      .reverse()
      .filter(id => mine.has(id))
      .slice(0, this.w.round.feedback_joke_count)
      .map(id => {
        const done = this.w.classified.has(id);
        return {
          joke_id: id, joke_title: 't', was_bought: false,
          good_dimensions: (done ? ['LENGTH'] : []) as FeedbackJoke['good_dimensions'],
          improve_dimensions: [],
        };
      });
    return { jokes };
  }

  async marketingQueueNext(roundId: number): Promise<MarketingQueueEnvelope> {
    // real: usecase/marketing.go:33-43 — role is checked before round status.
    const u = this.requireMarketing('marketingQueueNext');
    this.requireActive();
    // real: repo/marketing_repo.go:38,52 — the queue is scoped to the round.
    const b = this.w.batches.find(
      x => x.roundId === roundId && x.teamId === u.teamId
        && (x.state === 'QUEUED' || (x.state === 'CLAIMED' && x.lockedBy === u.id)),
    );
    if (!b) return { batch: null, jokes: [], queue_size: 0 };
    b.state = 'CLAIMED';
    b.lockedBy = u.id;
    return this.w.envelope(b);
  }

  async marketingSplit(batchId: number, body: { jokes: string[] }) {
    // real: usecase/marketing.go:236-241 — role, then round status, then the claim.
    const u = this.requireMarketing('marketingSplit');
    this.requireActive();
    const b = this.w.claimedBy(batchId, u);
    // real: usecase/marketing.go:85-102 — blanks are dropped first; round 1
    // must split into exactly batch_size, later rounds into 1..batch_size.
    const jokes = body.jokes.map(t => t.trim()).filter(t => t !== '');
    const size = this.w.round.batch_size;
    const ok = this.w.round.round_number === 1 ? jokes.length === size : jokes.length >= 1 && jokes.length <= size;
    if (!ok) throw new FakeApiError(400, 'VALIDATION_ERROR');
    b.jokes = jokes.map(joke_text => ({ joke_id: this.w.newJokeId(), joke_text, published: false }));
    b.rawText = null;
    return this.w.envelope(b);
  }

  async marketingPublish(batchId: number, body: PublishRequest) {
    // real: usecase/marketing.go:236-241 — role, round status, then the claim.
    const u = this.requireMarketing('marketingPublish');
    this.requireActive();
    const b = this.w.claimedBy(batchId, u);
    // real: handler/marketing.go:189, usecase/marketing.go:209,
    // repo/marketing_repo.go:254-273 — exactly one decision per joke in the
    // batch, a title on every published one, and round 1 needs a publish.
    const ids = body.jokes.map(d => d.joke_id);
    const batchIds = new Set(b.jokes.map(j => j.joke_id));
    if (
      body.jokes.length === 0 ||
      new Set(ids).size !== ids.length ||
      ids.length !== batchIds.size ||
      !ids.every(id => batchIds.has(id)) ||
      body.jokes.some(d => d.is_published && !(d.joke_title ?? '').trim())
    ) {
      throw new FakeApiError(400, 'VALIDATION_ERROR');
    }
    const published = body.jokes.filter(j => j.is_published).length;
    if (this.w.round.round_number === 1 && published === 0) throw new FakeApiError(400, 'VALIDATION_ERROR');
    for (const d of body.jokes) {
      const joke = b.jokes.find(j => j.joke_id === d.joke_id) as FakeJoke;
      joke.published = d.is_published;
      if (d.is_published) {
        this.w.publishOrder.push(d.joke_id);
        if (this.w.autoClassify) this.w.classified.add(d.joke_id);
      }
    }
    b.state = 'DONE';
    this.w.decisions.push({ teamId: b.teamId, batchId, published, total: body.jokes.length });
    return {};
  }

  async instructorLobby() {
    this.requireInstructor('instructorLobby');
    return this.w.lobby();
  }

  async instructorAssign(_roundId: number, body: { team_count: number }) {
    this.requireInstructor('instructorAssign');
    // real: repo/team_repo.go:20, usecase/instructor.go:114-124 — Assign only
    // ever adds teams; existing ones (and their ids) are kept and reused.
    while (this.w.teamIds.length < body.team_count) {
      this.w.teamIds.push(Math.max(0, ...this.w.teamIds) + 1);
    }
    // Deliberately scrambled, like the real shuffle: newest users first, so
    // bots and humans land on each other's teams and must be re-pinned.
    const ps = this.w.assignOrder(this.w.participants(), this.w.nextAssignCall());
    ps.forEach((u, i) => {
      const t = Math.floor(i / 2);
      if (t < this.w.teamIds.length) {
        u.teamId = this.w.teamIds[t];
        u.role = i % 2 === 0 ? 'JM' : 'MARKETING';
        u.status = 'ASSIGNED';
      } else {
        u.teamId = null;
        u.role = null;
        u.status = 'WAITING';
      }
    });
    return this.w.lobby();
  }

  async instructorPatchUser(_roundId: number, userId: number, body: PatchUserRequest) {
    this.requireInstructor('instructorPatchUser');
    const u = this.w.users.get(userId);
    if (!u) throw new FakeApiError(404, 'NOT_FOUND');
    u.status = body.status;
    if (body.role !== undefined) u.role = body.role;
    if (body.team_id !== undefined) u.teamId = body.team_id;
    return this.w.lobby();
  }

  async instructorDeleteUser(_roundId: number, userId: number) {
    this.requireInstructor('instructorDeleteUser');
    if (!this.w.users.delete(userId)) throw new FakeApiError(404, 'NOT_FOUND');
    return { deleted_user_id: userId };
  }

  async instructorStart(_roundId: number, body?: ConfigRequest) {
    this.requireInstructor('instructorStart');
    // real: usecase/instructor.go:232-245 — status checks precede the profile check.
    if (this.w.round.status === 'ACTIVE') throw new FakeApiError(409, 'CONFLICT');
    if (this.w.round.status === 'ENDED') throw new FakeApiError(409, 'CONFLICT');
    const sent = body?.ideal_profile && Object.keys(body.ideal_profile).length > 0;
    if (!this.w.profileConfigured && !sent) throw new FakeApiError(409, 'IDEAL_PROFILE_REQUIRED');
    this.w.profileConfigured = true;
    this.w.round.status = 'ACTIVE';
    return {};
  }
}
