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
  };
  readonly batches: FakeBatch[] = [];
  readonly decisions: Decision[] = [];
  readonly calls: string[] = [];
  private failures: Array<{ method: string; userName?: string; remaining: number }> = [];
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

  /** Make `method` fail with a 500, `times` times, optionally only for one user. */
  failNext(method: string, times: number, userName?: string): void {
    this.failures.push({ method, userName, remaining: times });
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
      throw new FakeApiError(500, 'INTERNAL');
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
      Teams: this.teamIds.map(id => ({
        Team: { id, name: `Team ${id}`, created_at: STAMP },
        Members: ps.filter(u => u.teamId === id).map(u => ({ UserID: u.id, DisplayName: u.name, Role: (u.role ?? 'JM') as Role })),
      })),
      Unassigned: unassigned.map(u => ({ UserID: u.id, DisplayName: u.name, Status: 'WAITING' as const })),
    };
  }

  newBatchId(): number { return this.nextBatchId++; }
  newJokeId(): number { return this.nextJokeId++; }

  claimedBy(batchId: number, userId: number): FakeBatch {
    const b = this.batches.find(x => x.id === batchId);
    if (!b) throw new FakeApiError(404, 'NOT_FOUND');
    if (b.state !== 'CLAIMED' || b.lockedBy !== userId) throw new FakeApiError(409, 'NOT_LOCKED');
    return b;
  }

  envelope(b: FakeBatch): MarketingQueueEnvelope {
    return {
      batch: {
        batch_id: b.id, round_id: this.round.id, team_id: b.teamId, status: 'SUBMITTED',
        submitted_at: STAMP, locked_at: STAMP, locked_by: b.lockedBy, raw_text: b.rawText,
      },
      jokes: b.jokes.map(j => ({ joke_id: j.joke_id, joke_text: j.joke_text })),
      queue_size: this.batches.filter(x => x.teamId === b.teamId && x.state === 'QUEUED').length,
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
    const u = this.requireUser('submitBatch');
    this.requireActive();
    if (u.role !== 'JM' || u.teamId !== body.team_id) throw new FakeApiError(403, 'FORBIDDEN');
    const raw = 'raw_text' in body && body.raw_text ? body.raw_text : null;
    if (!raw) throw new FakeApiError(400, 'VALIDATION_ERROR');
    this.w.batches.push({ id: this.w.newBatchId(), teamId: u.teamId, rawText: raw, jokes: [], state: 'QUEUED', lockedBy: null });
    return {};
  }

  async teamFeedback(_roundId: number, teamId: number) {
    this.requireUser('teamFeedback');
    const jokes: FeedbackJoke[] = this.w.batches
      .filter(b => b.teamId === teamId && b.state === 'DONE')
      .flatMap(b => b.jokes.filter(j => j.published))
      .map(j => ({
        joke_id: j.joke_id, joke_title: 't', was_bought: false,
        good_dimensions: ['LENGTH'] as FeedbackJoke['good_dimensions'], improve_dimensions: [],
      }));
    return { jokes };
  }

  async marketingQueueNext(_roundId: number): Promise<MarketingQueueEnvelope> {
    const u = this.requireUser('marketingQueueNext');
    this.requireActive();
    if (u.role !== 'MARKETING') throw new FakeApiError(403, 'FORBIDDEN');
    const b = this.w.batches.find(
      x => x.teamId === u.teamId && (x.state === 'QUEUED' || (x.state === 'CLAIMED' && x.lockedBy === u.id)),
    );
    if (!b) return { batch: null, jokes: [], queue_size: 0 };
    b.state = 'CLAIMED';
    b.lockedBy = u.id;
    return this.w.envelope(b);
  }

  async marketingSplit(batchId: number, body: { jokes: string[] }) {
    const u = this.requireUser('marketingSplit');
    const b = this.w.claimedBy(batchId, u.id);
    if (this.w.round.round_number === 1 && body.jokes.length !== this.w.round.batch_size) {
      throw new FakeApiError(400, 'VALIDATION_ERROR');
    }
    b.jokes = body.jokes.map(joke_text => ({ joke_id: this.w.newJokeId(), joke_text, published: false }));
    b.rawText = null;
    return this.w.envelope(b);
  }

  async marketingPublish(batchId: number, body: PublishRequest) {
    const u = this.requireUser('marketingPublish');
    const b = this.w.claimedBy(batchId, u.id);
    const published = body.jokes.filter(j => j.is_published).length;
    if (this.w.round.round_number === 1 && published === 0) throw new FakeApiError(400, 'VALIDATION_ERROR');
    for (const d of body.jokes) {
      const joke = b.jokes.find(j => j.joke_id === d.joke_id);
      if (joke) joke.published = d.is_published;
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
    this.w.teamIds = Array.from({ length: body.team_count }, (_, i) => i + 1);
    // Deliberately scrambled, like the real shuffle: newest users first, so
    // bots and humans land on each other's teams and must be re-pinned.
    const ps = this.w.participants().sort((a, b) => b.id - a.id);
    ps.forEach((u, i) => {
      const t = Math.floor(i / 2);
      if (t < body.team_count) {
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
    const sent = body?.ideal_profile && Object.keys(body.ideal_profile).length > 0;
    if (!this.w.profileConfigured && !sent) throw new FakeApiError(409, 'IDEAL_PROFILE_REQUIRED');
    this.w.profileConfigured = true;
    this.w.round.status = 'ACTIVE';
    return {};
  }
}
