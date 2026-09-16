/**
 * Transport for the end-to-end classroom run. One typed method per backend
 * route, one place that unwraps the envelope, one error type that says enough
 * to diagnose a failure without a second run.
 *
 * RAW FETCH, NOT services/apiClient — the same reasoning scripts/smoke-api.ts
 * gives, applied one level up. The e2e test judges whether a real deployment
 * can carry a class through a round; routed through services/, a broken unwrap,
 * a wrong isRawEndpoint entry or a stray retry would be indistinguishable from
 * a backend fault, because the thing under test would also be the instrument.
 * A diagnostic must not depend on the subsystem it diagnoses. Raw fetch also
 * keeps this file clear of the mock-API path and of import.meta.env, neither of
 * which exists sanely under plain Node.
 *
 * TYPES COME FROM types/api.ts, ALL OF THEM. This file used to carry its own
 * corrections for shapes that had drifted, under a `WIRE DRIFT` heading, on the
 * reasoning that fixing the contract belongs in a contracts change rather than
 * in a test harness. That contracts change has now happened (types/api.ts,
 * re-transcribed against backend commit 824655a), so the local copies are gone
 * and only import aliases remain. If a shape here ever looks wrong again, the
 * fix is upstream — a harness that redeclares the wire is a harness that can
 * pass while the app is broken.
 *
 * IDENTITY IS PER ACTOR, NOT GLOBAL. A round has 24 students and one
 * instructor acting at once. There is no token, no cookie and no mutable
 * "current user": each actor gets its own frozen client from `.as()`, so a
 * marketer claiming a batch can never be mistaken for the JM who submitted it.
 *
 * NOTHING HANGS. Every request carries an AbortSignal with a deadline. A
 * backend that accepts the connection and then stalls is the exact failure
 * this harness exists to catch, so it must surface as a timeout, not as a test
 * run that never returns.
 */

import type {
  AdminResetResponse,
  AssignRequest,
  BatchSplitRequest,
  BatchSubmitRequest,
  BatchSubmitResponse,
  ConfigRequest,
  DeleteUserResponse,
  HealthResponse,
  InstructorLoginRequest,
  InstructorLoginResponse,
  InstructorRoundResponse,
  LobbyResponse,
  MarketResponse,
  MarketingQueueBatch,
  MarketingQueueCountResponse,
  MarketingQueueEnvelope,
  PatchUserRequest,
  PopupStateRequest,
  PublicRoundResponse,
  PublishRequest,
  PublishResponse,
  RoundStatsResponse,
  RoundsActiveResponse,
  SessionJoinRequest,
  SessionJoinResponse,
  SessionMeResponse,
  TeamBatchJoke,
  TeamBatchesResponse,
  TeamFeedbackResponse,
  TeamSummaryResponse,
} from '../../../types/api';

/* ===========================================================================
   WIRE DRIFT — RETIRED 2026-09-16.

   This section used to redeclare six shapes types/api.ts had fallen behind on:
   the raw_text arm of a batch submission, the split request body, the claimed
   batch's raw_text, the {batch, jokes, queue_size} envelope, first_sold_at on
   a batch-listing joke, and jokes_created / jokes_published on a team summary.

   All six are upstream now, re-transcribed against backend commit 824655a and
   cited there. The local copies are GONE rather than kept as parallel
   declarations: a second definition of a wire shape is exactly how the two
   drift apart again, and this harness is meant to fail when the backend moves,
   not to carry its own private idea of the contract.

   What remains below is one-line aliases. They exist only so the rest of the
   harness — wait.ts and assertions/types.ts — keeps importing the names it
   already imports; every shape they name is defined in types/api.ts. Nothing
   here widens, narrows or corrects anything.

   ONE OLD CORRECTION DID NOT SURVIVE CONTACT WITH THE GO, and it matters to
   this harness specifically: this file used to warn that
   TeamBatchJoke.sold_count is structurally always 0, so a convergence check
   watching sales there would wait forever. True at 8f9dfff, FALSE at 824655a —
   ListBatchesByTeam now LEFT JOINs the same `purchases` aggregate ListMarket
   uses (infra/repo/postgres/batch_repo.go:98-111), so the batch listing and
   the market board agree. wait.ts watching the market board is still correct
   and is deliberately left alone; it is no longer the ONLY thing that would
   work.
   =========================================================================== */

/** POST /v1/rounds/{rid}/batches. EXACTLY ONE of `jokes` and `raw_text` — the
 *  union arms, the two 400s and the 20-rune floor are documented upstream on
 *  BatchSubmitRequest. */
export type BatchSubmitBody = BatchSubmitRequest;

/** POST /v1/marketing/batches/{bid}/split. */
export type BatchSplitRequestBody = BatchSplitRequest;

/** The claimed batch, as queue/next, split and unsplit all render it.
 *  `raw_text` is the state discriminator, not `jokes.length` — see
 *  MarketingQueueBatch. */
export type QueueBatch = MarketingQueueBatch;

/** The `{batch, jokes, queue_size}` envelope shared by GET queue/next, POST
 *  split and POST unsplit. `batch` is null only on the empty-queue
 *  short-circuit, which queue/next alone can reach. */
export type QueueEnvelope = MarketingQueueEnvelope;

/** One joke row in a team's batch listing. */
export type TeamBatchJokeRow = TeamBatchJoke;

/** GET /v1/rounds/{rid}/teams/{tid}/batches — `var out []gin.H`, so an empty
 *  listing is `{"batches": null}`, not `{"batches": []}`. Same for the nested
 *  `jokes` of an unsplit batch. */
export type TeamBatchesBody = TeamBatchesResponse;

/** GET /v1/rounds/{rid}/teams/{tid}/summary, jokes_created and
 *  jokes_published included. */
export type TeamSummaryBody = TeamSummaryResponse;

/* ===========================================================================
   Errors
=========================================================================== */

/** What went wrong at the transport layer, before any body was judged. */
export type ApiFailureKind =
  /** The server answered with a non-2xx status. */
  | 'http'
  /** The deadline expired with no response. */
  | 'timeout'
  /** DNS, TCP, TLS — nothing was answered at all. */
  | 'network'
  /** 2xx, but the body was not JSON or not the envelope the route promises. */
  | 'protocol';

export interface ApiErrorFields {
  kind: ApiFailureKind;
  /** 0 when nothing was answered. */
  status: number;
  method: string;
  /** Path with query, e.g. `/v1/marketing/queue/next?round_id=1`. */
  route: string;
  url: string;
  actor: string;
  elapsedMs: number;
  /** The backend's machine-readable code — response.ErrorDetail.Code. */
  code?: string;
  /** Only validation errors carry one — response.ErrorDetail.Field, omitempty. */
  field?: string;
  /** response.ErrorDetail.RequestID: the key into the backend's own logs. */
  requestId?: string;
  /** The body this client sent, already serialised. */
  requestBody?: string;
  /** The body the server sent, truncated. */
  responseBody?: string;
  detail?: string;
}

/**
 * SECURITY. ApiError's `sent` field is printed to a terminal AND serialised into
 * report.json, and the login body carries the admin password — a failed login is
 * exactly the case that dumps it. So the DUMP gets a redacted copy while the WIRE
 * gets the real body. Keyed on the field NAME rather than the route, so a future
 * endpoint that accepts a secret is covered without anyone remembering to opt in.
 */
const SECRET_KEYS = /pass|secret|token|api[_-]?key|authorization|credential/i;

function redactBody(body: unknown): string | undefined {
  if (body === undefined) return undefined;
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return JSON.stringify(body);
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    safe[k] = SECRET_KEYS.test(k) ? '[redacted]' : v;
  }
  return JSON.stringify(safe);
}

/**
 * The only evidence a 2am pre-class failure leaves behind, so it carries
 * everything needed to act without re-running: which actor, which route, which
 * status, the backend's own error code and request_id (grep the container logs
 * with it), and the exact body that was sent. The fields stay machine-readable
 * on the instance — `err.status`, `err.code`, `err.field` — so a test can
 * assert on an expected 409 without string-matching the message.
 */
export class ApiError extends Error implements ApiErrorFields {
  readonly kind: ApiFailureKind;
  readonly status: number;
  readonly method: string;
  readonly route: string;
  readonly url: string;
  readonly actor: string;
  readonly elapsedMs: number;
  readonly code?: string;
  readonly field?: string;
  readonly requestId?: string;
  readonly requestBody?: string;
  readonly responseBody?: string;
  readonly detail?: string;

  constructor(fields: ApiErrorFields) {
    super(formatApiError(fields));
    this.name = 'ApiError';
    this.kind = fields.kind;
    this.status = fields.status;
    this.method = fields.method;
    this.route = fields.route;
    this.url = fields.url;
    this.actor = fields.actor;
    this.elapsedMs = fields.elapsedMs;
    this.code = fields.code;
    this.field = fields.field;
    this.requestId = fields.requestId;
    this.requestBody = fields.requestBody;
    this.responseBody = fields.responseBody;
    this.detail = fields.detail;
  }
}

function formatApiError(f: ApiErrorFields): string {
  const head =
    f.kind === 'http'
      ? `${f.method} ${f.route} -> HTTP ${f.status}${f.code ? ` ${f.code}` : ''}`
      : `${f.method} ${f.route} -> ${f.kind.toUpperCase()}`;

  const rows: Array<[string, string | undefined]> = [
    ['detail', f.detail],
    ['field', f.field],
    ['actor', f.actor],
    ['elapsed', `${Math.round(f.elapsedMs)}ms`],
    ['request_id', f.requestId],
    ['sent', f.requestBody],
    ['received', f.kind === 'http' || f.kind === 'protocol' ? f.responseBody : undefined],
    ['url', f.url],
  ];

  const body = rows
    .filter((r): r is [string, string] => r[1] !== undefined && r[1] !== '')
    .map(([k, v]) => `  ${k.padEnd(10)} ${v}`)
    .join('\n');

  return `${head}\n${body}`;
}

/* ===========================================================================
   Client
=========================================================================== */

/** One completed request. Emitted for every call, success or failure, so a run
 *  can report latency per route without the client owning a logger. */
export interface RequestRecord {
  actor: string;
  method: string;
  route: string;
  /** 0 when nothing was answered. */
  status: number;
  elapsedMs: number;
  ok: boolean;
  kind?: ApiFailureKind;
}

export type RequestObserver = (record: RequestRecord) => void;

export interface ClientOptions {
  /** Backend origin, trailing slashes trimmed. */
  baseUrl: string;
  /** Per-request deadline. 15s is generous for every route here: publish
   *  returns immediately and hands classification to a worker, so no request in
   *  this API is supposed to be slow. Waiting for the WORKER is wait.ts's job
   *  and has its own, much larger, budget. */
  timeoutMs?: number;
  /** Called once per completed request. */
  onRequest?: RequestObserver;
}

const DEFAULT_TIMEOUT_MS = 15_000;
/** Enough of a body to identify the failure; not enough to bury it. */
const BODY_EXCERPT_CHARS = 600;

interface Identity {
  /** Sent as `X-User-Id`. null = anonymous. */
  userId: number | null;
  /** Human label for diagnostics, e.g. `JM t3 (u17)`. */
  label: string;
}

interface CallSpec {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  query?: Record<string, string | number>;
  body?: unknown;
  /** `raw` skips the {data} unwrap. See RAW_ROUTES below. */
  envelope: 'raw' | 'wrapped';
  /** false for /health, /v1/rounds/active, join and login. */
  needsIdentity: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
}

/**
 * The client. Immutable once constructed: `.as()` returns a NEW instance rather
 * than mutating identity, which is what makes 25 concurrent actors safe.
 *
 * Every route the backend serves is here, grouped as the server groups them.
 * Instructor-gated routes are marked; see `.as()` for how identity travels.
 */
export class JokeFactoryClient {
  readonly baseUrl: string;
  readonly identity: Identity;
  private readonly timeoutMs: number;
  private readonly onRequest?: RequestObserver;

  private constructor(opts: ClientOptions, identity: Identity) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.onRequest = opts.onRequest;
    this.identity = identity;
    Object.freeze(this.identity);
  }

  /** An unauthenticated client: /health, /v1/rounds/active, session join and
   *  instructor login are the only routes it can complete. */
  static anonymous(opts: ClientOptions): JokeFactoryClient {
    return new JokeFactoryClient(opts, { userId: null, label: 'anonymous' });
  }

  /**
   * A client bound to one user id, for one actor.
   *
   * AUTH MODEL — read before changing. There is no token and no session cookie
   * anywhere in this backend. BOTH kinds of identity travel in the SAME header:
   *
   *   Student routes  app/http/handler/session.go `parseUserID` reads
   *                   `X-User-Id`, parses it as int64, and hands it to the
   *                   usecase, which does the role check (JM / MARKETING).
   *                   A missing or unparseable header is a 400.
   *
   *   Instructor      app/middleware/instructor_auth.go `InstructorAuth` reads
   *                   the SAME `X-User-Id` header — there is no separate admin
   *                   header, bearer token or password on these requests. It
   *                   loads the user and requires role == INSTRUCTOR:
   *                     missing header   -> 401 UNAUTHORIZED
   *                     unparseable / <=0 -> 400 BAD_REQUEST
   *                     user not found   -> 401 UNAUTHORIZED
   *                     wrong role       -> 403 FORBIDDEN
   *                   Instructor-ness is therefore a property of the USER ROW,
   *                   granted by POST /v1/instructor/login, which is the one
   *                   place the admin password is checked. The id it returns is
   *                   the whole credential from then on.
   *
   * Consequence for this harness: instructor authority is just a user id, so a
   * test must never hand an instructor client to a simulated student. Keeping
   * identity immutable per instance is what enforces that.
   */
  as(userId: number, label: string): JokeFactoryClient {
    return new JokeFactoryClient(
      { baseUrl: this.baseUrl, timeoutMs: this.timeoutMs, onRequest: this.onRequest },
      { userId, label: `${label} (u${userId})` },
    );
  }

  // ---- Health (RAW, and outside /v1) ---------------------------------------

  health(signal?: AbortSignal): Promise<HealthResponse> {
    return this.call<HealthResponse>({
      method: 'GET', path: '/health', envelope: 'raw', needsIdentity: false, signal,
    });
  }

  // ---- Session -------------------------------------------------------------

  /** POST /v1/session/join — RAW, anonymous. Creates or re-finds the student. */
  sessionJoin(body: SessionJoinRequest, signal?: AbortSignal): Promise<SessionJoinResponse> {
    return this.call<SessionJoinResponse>({
      method: 'POST', path: '/v1/session/join', body, envelope: 'raw', needsIdentity: false, signal,
    });
  }

  /** GET /v1/session/me — RAW. The only way a student learns its role and team,
   *  so the harness polls it after assign rather than guessing the mapping. */
  sessionMe(signal?: AbortSignal): Promise<SessionMeResponse> {
    return this.call<SessionMeResponse>({
      method: 'GET', path: '/v1/session/me', envelope: 'raw', needsIdentity: true, signal,
    });
  }

  /**
   * POST /v1/instructor/login — RAW, anonymous, served by AdminHandler.
   *
   * This is the ONLY route that takes the admin password. On success it
   * promotes the named user to INSTRUCTOR and backfills rounds 1 and 2 when the
   * rounds table is short, so `round_id` is in practice always a number even on
   * a fresh database.
   */
  instructorLogin(body: InstructorLoginRequest, signal?: AbortSignal): Promise<InstructorLoginResponse> {
    return this.call<InstructorLoginResponse>({
      method: 'POST', path: '/v1/instructor/login', body, envelope: 'raw', needsIdentity: false, signal,
    });
  }

  // ---- Rounds --------------------------------------------------------------

  /**
   * GET /v1/rounds/active — anonymous.
   *
   * THE NAME LIES, and the harness depends on knowing it: RoundHandler.Active
   * applies no status filter (ListRounds is a bare SELECT with no WHERE), so
   * CONFIGURED, ACTIVE and ENDED rounds all come back. Filter on `status`.
   */
  roundsActive(signal?: AbortSignal): Promise<RoundsActiveResponse> {
    return this.call<RoundsActiveResponse>({
      method: 'GET', path: '/v1/rounds/active', envelope: 'wrapped', needsIdentity: false, signal,
    });
  }

  /** GET /v1/rounds/{rid}/teams/{tid}/summary. The handler does NOT read
   *  X-User-Id — it is open to any caller — but the harness sends it anyway so
   *  every request in a run is attributable. */
  teamSummary(roundId: number, teamId: number, signal?: AbortSignal): Promise<TeamSummaryBody> {
    return this.call<TeamSummaryBody>({
      method: 'GET',
      path: `/v1/rounds/${roundId}/teams/${teamId}/summary`,
      envelope: 'wrapped', needsIdentity: true, signal,
    });
  }

  /** GET /v1/rounds/{rid}/market — requires X-User-Id, and the caller must be
   *  able to see the round.
   *
   *  NO LONGER THE ONLY ENDPOINT WHOSE sold_count IS REAL, though it was when
   *  this harness was written: teamBatches() now returns the same figure from
   *  the same `purchases` aggregate (batch_repo.go:98-111). Both count current
   *  holdings, so both fall when a customer returns a joke. */
  market(roundId: number, signal?: AbortSignal): Promise<MarketResponse> {
    return this.call<MarketResponse>({
      method: 'GET', path: `/v1/rounds/${roundId}/market`,
      envelope: 'wrapped', needsIdentity: true, signal,
    });
  }

  // ---- JM batches ----------------------------------------------------------

  /**
   * POST /v1/rounds/{rid}/batches — the JM submission.
   *
   * Exactly one of `jokes` and `raw_text`; see BatchSubmitBody. On the split
   * path R1 demands EXACTLY batch_size jokes and R2+ allows up to batch_size.
   * On the raw path there is no count yet, so those rules move to
   * MarketingService.Split and fire there instead.
   */
  submitBatch(roundId: number, body: BatchSubmitBody, signal?: AbortSignal): Promise<BatchSubmitResponse> {
    return this.call<BatchSubmitResponse>({
      method: 'POST', path: `/v1/rounds/${roundId}/batches`, body,
      envelope: 'wrapped', needsIdentity: true, signal,
    });
  }

  /** GET /v1/rounds/{rid}/teams/{tid}/batches. `batches` is null, not [], when
   *  empty — and so is each batch's `jokes`. */
  teamBatches(roundId: number, teamId: number, signal?: AbortSignal): Promise<TeamBatchesBody> {
    return this.call<TeamBatchesBody>({
      method: 'GET', path: `/v1/rounds/${roundId}/teams/${teamId}/batches`,
      envelope: 'wrapped', needsIdentity: true, signal,
    });
  }

  // ---- Feedback ------------------------------------------------------------

  /**
   * GET /v1/rounds/{rid}/teams/{tid}/feedback — requires X-User-Id, caller must
   * be JM or MARKETING on that team, and the round must be ACTIVE or ENDED.
   *
   * CONVERGENCE SIGNAL. Each joke's good/improve arrays are derived from its
   * persisted dim_fits (FeedbackService.SelectFeedbackDimensions). An
   * unclassified joke has no dim_fits, so it comes back with BOTH arrays empty
   * rather than absent. wait.ts keys on exactly that.
   */
  teamFeedback(roundId: number, teamId: number, signal?: AbortSignal): Promise<TeamFeedbackResponse> {
    return this.call<TeamFeedbackResponse>({
      method: 'GET', path: `/v1/rounds/${roundId}/teams/${teamId}/feedback`,
      envelope: 'wrapped', needsIdentity: true, signal,
    });
  }

  // ---- Marketing -----------------------------------------------------------

  /** GET /v1/marketing/queue/count?round_id=. Counts SUBMITTED batches for the
   *  caller's own team only — it is not a global queue. */
  marketingQueueCount(roundId: number, signal?: AbortSignal): Promise<MarketingQueueCountResponse> {
    return this.call<MarketingQueueCountResponse>({
      method: 'GET', path: '/v1/marketing/queue/count', query: { round_id: roundId },
      envelope: 'wrapped', needsIdentity: true, signal,
    });
  }

  /**
   * GET /v1/marketing/queue/next?round_id= — NOT a pure read.
   *
   * ClaimNextBatch LOCKS the batch to this marketer (or re-loads the one they
   * already hold). Polling it from two actors is a race by construction, and
   * split/unsplit/publish all refuse a batch this marketer does not hold with a
   * 403 NOT_ASSIGNED_TO_THIS_MARKETER. One marketer per team, one poller.
   */
  marketingQueueNext(roundId: number, signal?: AbortSignal): Promise<QueueEnvelope> {
    return this.call<QueueEnvelope>({
      method: 'GET', path: '/v1/marketing/queue/next', query: { round_id: roundId },
      envelope: 'wrapped', needsIdentity: true, signal,
    });
  }

  /**
   * POST /v1/marketing/batches/{bid}/split — cuts the JM's raw blob into jokes.
   * This is where joke ids are first assigned, and where the R1 exact-count /
   * R2 at-most-count rules land for the raw path.
   */
  marketingSplit(batchId: number, body: BatchSplitRequestBody, signal?: AbortSignal): Promise<QueueEnvelope> {
    return this.call<QueueEnvelope>({
      method: 'POST', path: `/v1/marketing/batches/${batchId}/split`, body,
      envelope: 'wrapped', needsIdentity: true, signal,
    });
  }

  /** POST /v1/marketing/batches/{bid}/unsplit — drops the joke rows and
   *  restores raw_text from the immutable raw_text_original, so the round trip
   *  is lossless rather than a re-join of the split texts. */
  marketingUnsplit(batchId: number, signal?: AbortSignal): Promise<QueueEnvelope> {
    return this.call<QueueEnvelope>({
      method: 'POST', path: `/v1/marketing/batches/${batchId}/unsplit`,
      envelope: 'wrapped', needsIdentity: true, signal,
    });
  }

  /**
   * POST /v1/marketing/batches/{bid}/publish.
   *
   * ITS RESPONSE IS NOT THE RESULT. PublishBatch commits the publish/discard
   * decisions and then MarketingService.Publish calls `dispatcher.Enqueue` and
   * returns. Classification — an Azure LLM call per joke — and the purchase
   * evaluation that follows it happen on a worker goroutine afterwards. Worse,
   * an Enqueue failure is LOGGED AND SWALLOWED, so a 200 here does not even
   * promise the work was queued. Assert on convergence via wait.ts, never on
   * this body.
   *
   * R1 requires at least one published joke (400 rejects an all-discard batch);
   * R2+ allows passing on the whole batch.
   */
  marketingPublish(batchId: number, body: PublishRequest, signal?: AbortSignal): Promise<PublishResponse> {
    return this.call<PublishResponse>({
      method: 'POST', path: `/v1/marketing/batches/${batchId}/publish`, body,
      envelope: 'wrapped', needsIdentity: true, signal,
    });
  }

  // ---- Instructor (middleware.InstructorAuth) -------------------------------

  /**
   * POST /v1/admin/reset — DESTRUCTIVE AND IRREVERSIBLE. NOT A TEST FIXTURE
   * RESET.
   *
   * In one transaction (infra/repo/postgres/round_repo.go ResetGame) it:
   *   - TRUNCATEs ... RESTART IDENTITY CASCADE over purchase_events, purchases,
   *     ai_customers, classification_jobs, joke_fit, joke_dim_fit,
   *     joke_dimension_values, batch_submission_events, round_ideal_profile,
   *     jokes, batches and team_rounds_state;
   *   - resets every row in `rounds` to CONFIGURED with DEFAULT config, wiping
   *     started_at, ended_at and any instructor-tuned knobs;
   *   - DELETEs every user whose role is not INSTRUCTOR, and every team.
   *
   * There is no undo and no backup. Against the live deployment this ends any
   * class currently in progress and deletes the students' work. The harness
   * must only ever call it against a backend it is certain is not in use, and
   * the long name is here so that an accidental call is visible in review.
   */
  adminResetGame_DESTRUCTIVE_TRUNCATES_ALL_GAME_DATA(signal?: AbortSignal): Promise<AdminResetResponse> {
    return this.call<AdminResetResponse>({
      method: 'POST', path: '/v1/admin/reset', envelope: 'wrapped', needsIdentity: true, signal,
    });
  }

  /** GET /v1/instructor/rounds/{rid}/lobby. PascalCase body — LobbySnapshot
   *  carries no json tags, so Go falls back to Go field names. Teams and
   *  Unassigned are null, not [], when empty. */
  instructorLobby(roundId: number, signal?: AbortSignal): Promise<LobbyResponse> {
    return this.call<LobbyResponse>({
      method: 'GET', path: `/v1/instructor/rounds/${roundId}/lobby`,
      envelope: 'wrapped', needsIdentity: true, signal,
    });
  }

  /**
   * POST /v1/instructor/rounds/{rid}/config. Every field optional; omitted
   * values keep the existing round (MergeConfig).
   *
   * `ideal_profile` is optional but TOTAL once present: all 11 IdealDimensions,
   * no TITLE_FIT, no catch-all category. A malformed one fails HERE with
   * 400 VALIDATION_ERROR and `field: "ideal_profile"`; an ABSENT one fails at
   * START with 409 CONFLICT and NO `field` key. Branch on status, not on field.
   */
  instructorConfig(roundId: number, body: ConfigRequest, signal?: AbortSignal): Promise<InstructorRoundResponse> {
    return this.call<InstructorRoundResponse>({
      method: 'POST', path: `/v1/instructor/rounds/${roundId}/config`, body,
      envelope: 'wrapped', needsIdentity: true, signal,
    });
  }

  /**
   * POST /v1/instructor/rounds/{rid}/assign — creates N teams and assigns one
   * JM + one MARKETING per team from the WAITING and ASSIGNED pools, SHUFFLED.
   *
   * The harness cannot predict who lands where: it must read the lobby, or each
   * student's /session/me, to learn the mapping. Participants beyond 2N are put
   * back to WAITING with no role or team.
   *
   * team_count only. The old frontend sent a customer_count here and the
   * backend ignored it; AssignRequest makes that impossible to repeat.
   */
  instructorAssign(roundId: number, body: AssignRequest, signal?: AbortSignal): Promise<LobbyResponse> {
    return this.call<LobbyResponse>({
      method: 'POST', path: `/v1/instructor/rounds/${roundId}/assign`, body,
      envelope: 'wrapped', needsIdentity: true, signal,
    });
  }

  /** PATCH /v1/instructor/rounds/{rid}/users/{uid}. Returns the whole lobby.
   *  Setting status to WAITING clears role and team regardless of what else the
   *  body says; a JM/MARKETING role with no team is a 400 on `team_id`. */
  instructorPatchUser(
    roundId: number, userId: number, body: PatchUserRequest, signal?: AbortSignal,
  ): Promise<LobbyResponse> {
    return this.call<LobbyResponse>({
      method: 'PATCH', path: `/v1/instructor/rounds/${roundId}/users/${userId}`, body,
      envelope: 'wrapped', needsIdentity: true, signal,
    });
  }

  /** DELETE /v1/instructor/rounds/{rid}/users/{uid}. Deletes the USER ROW, not
   *  just the round membership — the round id in the path is ignored by
   *  InstructorService.DeleteUser. Unlike the other three lobby routes this
   *  returns `{deleted_user_id}`, not a lobby. */
  instructorDeleteUser(roundId: number, userId: number, signal?: AbortSignal): Promise<DeleteUserResponse> {
    return this.call<DeleteUserResponse>({
      method: 'DELETE', path: `/v1/instructor/rounds/${roundId}/users/${userId}`,
      envelope: 'wrapped', needsIdentity: true, signal,
    });
  }

  /**
   * POST /v1/instructor/rounds/{rid}/start. Optional ConfigRequest body: when
   * it carries any config field the handler runs a config merge first, so start
   * can fail with config's 400s as well as its own 409s.
   *
   * Requires a valid ideal_profile to already exist (409 otherwise) and
   * generates the round's AI customers on the way through. Returns the
   * INSTRUCTOR projection.
   */
  instructorStart(roundId: number, body?: ConfigRequest, signal?: AbortSignal): Promise<InstructorRoundResponse> {
    return this.call<InstructorRoundResponse>({
      method: 'POST', path: `/v1/instructor/rounds/${roundId}/start`, body: body ?? {},
      envelope: 'wrapped', needsIdentity: true, signal,
    });
  }

  /** POST /v1/instructor/rounds/{rid}/end. 409 if the round is not ACTIVE.
   *  Returns the PUBLIC projection — no buy_threshold, jitter, swap_margin,
   *  feedback_pass_threshold or ideal_profile. */
  instructorEnd(roundId: number, signal?: AbortSignal): Promise<PublicRoundResponse> {
    return this.call<PublicRoundResponse>({
      method: 'POST', path: `/v1/instructor/rounds/${roundId}/end`,
      envelope: 'wrapped', needsIdentity: true, signal,
    });
  }

  /** POST /v1/instructor/rounds/{rid}/popups. Also the PUBLIC projection. */
  instructorSetPopups(roundId: number, body: PopupStateRequest, signal?: AbortSignal): Promise<PublicRoundResponse> {
    return this.call<PublicRoundResponse>({
      method: 'POST', path: `/v1/instructor/rounds/${roundId}/popups`, body,
      envelope: 'wrapped', needsIdentity: true, signal,
    });
  }

  /** GET /v1/instructor/rounds/{rid}/stats — the leaderboard. Reassembled by
   *  hand into exactly {round_id, leaderboard}; `leaderboard` is [] never
   *  null. */
  instructorStats(roundId: number, signal?: AbortSignal): Promise<RoundStatsResponse> {
    return this.call<RoundStatsResponse>({
      method: 'GET', path: `/v1/instructor/rounds/${roundId}/stats`,
      envelope: 'wrapped', needsIdentity: true, signal,
    });
  }

  // ---- The one place a request is made ------------------------------------

  /**
   * ONE ENVELOPE UNWRAP, ONE ERROR CONSTRUCTION, ONE DEADLINE. Every method
   * above is a description of a route; nothing else in this file touches fetch.
   * That is what makes `envelope: 'raw' | 'wrapped'` auditable instead of a
   * list that silently rots.
   */
  private async call<T>(spec: CallSpec): Promise<T> {
    const query = spec.query
      ? `?${new URLSearchParams(
          Object.entries(spec.query).map(([k, v]) => [k, String(v)]),
        ).toString()}`
      : '';
    const route = `${spec.path}${query}`;
    const url = `${this.baseUrl}${route}`;
    const actor = this.identity.label;
    const requestBody = spec.body === undefined ? undefined : JSON.stringify(spec.body);
    // The redacted twin: everything the error dump is allowed to remember.
    const dumpBody = redactBody(spec.body);

    const fail = (fields: Omit<ApiErrorFields, 'method' | 'route' | 'url' | 'actor' | 'requestBody'>) => {
      this.onRequest?.({
        actor, method: spec.method, route, status: fields.status,
        elapsedMs: fields.elapsedMs, ok: false, kind: fields.kind,
      });
      return new ApiError({ ...fields, method: spec.method, route, url, actor, requestBody: dumpBody });
    };

    // Caught here rather than at the server, because a 400 "missing X-User-Id"
    // from a route the harness *meant* to authenticate is a harness bug wearing
    // a backend's clothes.
    if (spec.needsIdentity && this.identity.userId === null) {
      throw fail({
        kind: 'protocol', status: 0, elapsedMs: 0,
        detail:
          'this route is identified by the X-User-Id header, but the client is anonymous — ' +
          'derive an actor client with .as(userId, label) first',
      });
    }

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (this.identity.userId !== null) headers['X-User-Id'] = String(this.identity.userId);
    if (requestBody !== undefined) headers['Content-Type'] = 'application/json';

    const timeoutMs = spec.timeoutMs ?? this.timeoutMs;
    const signal = mergeSignals(AbortSignal.timeout(timeoutMs), spec.signal);

    const started = performance.now();
    let resp: Response;
    try {
      resp = await fetch(url, { method: spec.method, headers, body: requestBody, signal });
    } catch (err) {
      const elapsedMs = performance.now() - started;
      const e = err as { name?: string; message?: string; cause?: { code?: string } };
      const timedOut = e?.name === 'TimeoutError' || (e?.name === 'AbortError' && elapsedMs >= timeoutMs - 50);
      throw fail({
        kind: timedOut ? 'timeout' : 'network',
        status: 0,
        elapsedMs,
        detail: timedOut
          ? `no response within ${timeoutMs}ms — the server accepted the connection or never answered; ` +
            'check the container is up and not cold-starting'
          : `${e?.message ?? String(err)}${e?.cause?.code ? ` (${e.cause.code})` : ''}`,
      });
    }
    const elapsedMs = performance.now() - started;

    const text = await resp.text().catch(() => '');

    if (!resp.ok) {
      const parsed = safeJson(text);
      const detail = (parsed as { error?: { code?: string; message?: string; field?: string; request_id?: string } })
        ?.error;
      throw fail({
        kind: 'http',
        status: resp.status,
        elapsedMs,
        code: detail?.code,
        field: detail?.field,
        requestId: detail?.request_id,
        detail: detail?.message ?? `${resp.status} ${resp.statusText}`.trim(),
        responseBody: detail?.message ? undefined : excerpt(text),
      });
    }

    const body = safeJson(text);
    if (body === undefined) {
      throw fail({
        kind: 'protocol', status: resp.status, elapsedMs,
        detail: '2xx but the body is not valid JSON', responseBody: excerpt(text),
      });
    }

    let payload: unknown = body;
    if (spec.envelope === 'wrapped') {
      // response.OK wraps everything under /v1 except join, me and login, which
      // call c.JSON directly. A bare body here means either a route moved out
      // of the wrapper or this table is wrong — both worth failing loudly for.
      if (body === null || typeof body !== 'object' || !('data' in body)) {
        throw fail({
          kind: 'protocol', status: resp.status, elapsedMs,
          detail: 'expected a {data} envelope, got a bare body', responseBody: excerpt(text),
        });
      }
      payload = (body as { data: unknown }).data;
    } else if (body !== null && typeof body === 'object' && !Array.isArray(body) && 'data' in body) {
      throw fail({
        kind: 'protocol', status: resp.status, elapsedMs,
        detail: 'declared RAW but the body has a "data" key — the route moved behind response.OK',
        responseBody: excerpt(text),
      });
    }

    this.onRequest?.({
      actor, method: spec.method, route, status: resp.status, elapsedMs, ok: true,
    });
    return payload as T;
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function excerpt(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > BODY_EXCERPT_CHARS ? `${flat.slice(0, BODY_EXCERPT_CHARS)}…` : flat;
}

/** AbortSignal.any is Node >= 20.3; fall back to the deadline alone on older
 *  20.x rather than dropping the deadline, which is the one that must hold. */
function mergeSignals(deadline: AbortSignal, extra?: AbortSignal): AbortSignal {
  if (!extra) return deadline;
  const any = (AbortSignal as { any?: (s: AbortSignal[]) => AbortSignal }).any;
  return typeof any === 'function' ? any([deadline, extra]) : deadline;
}

/** Convenience for a run that wants one place to hold the base URL. */
export function createClient(opts: ClientOptions): JokeFactoryClient {
  return JokeFactoryClient.anonymous(opts);
}
