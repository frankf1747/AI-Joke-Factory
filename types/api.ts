/* ============================================================================
   Wire types for the Go backend.

   Transcribed by hand from jokefactory_be/src/app/http/handler/*.go, because
   the backend builds its responses as inline gin.H maps rather than typed
   structs — there is nothing to generate from. Every type below cites the Go
   file and line it came from; re-check them against that source, not against
   FRONTEND_PLAN.md, which already lags the implementation.

   Nothing here is defensive. If the backend sends a field this file does not
   declare, that is drift and scripts/smoke-api.ts is what catches it.

   RE-TRANSCRIBED 2026-09-16 against backend commit 824655a, by reading the Go
   source only — nothing was called against a live server, because a real
   deployment is on the other end and a class may be using it. Six shapes had
   drifted since 8f9dfff and are now corrected in place, each marked
   `DRIFT FIXED 2026-09-16` with the Go file:line that proves it:
     1. BatchSubmitRequest gained raw_text (and is now a union — see below).
     2. MarketingQueueBatch gained raw_text.
     3. TeamBatchJoke gained first_sold_at.
     4. TeamSummaryResponse gained jokes_created and jokes_published.
     5. POST .../split and .../unsplit exist and were missing from the route
        table entirely — BatchSplitRequest and MarketingQueueEnvelope are new.
     6. TeamBatchJoke.sold_count is NO LONGER structurally zero. The repository
        now counts it from `purchases`, the same table the market board counts,
        so the two endpoints AGREE. The long warning that said otherwise was
        true at 8f9dfff and is false now; it has been rewritten, not deleted,
        because code written against the old warning is still out there.
   Line numbers below are against 824655a except where a comment says 8f9dfff.

   LIVE-VERIFIED 2026-09-13 — these types are no longer merely transcribed.
   Every type in this file was walked against a running local backend (Go,
   real Postgres, stub classifier) at backend commit 8f9dfff: all 24 endpoints
   in the route table below, first by curl and then again through the real
   services/api/*.ts client. Result: ZERO mismatches. Every declared key was
   present, no undeclared extras appeared, no scalar had the wrong type, and
   nothing that is typed absent came back null (or vice versa). The three RAW
   rows below are exactly the three endpoints that skipped the {data} envelope;
   the PascalCase lobby, the four `| null`-when-empty arrays, the
   NO_JOKE_PUBLISHED 400 and the ideal_profile totality rules all behaved as
   documented.

   What that run does NOT cover, and why the drift warning above still stands:
   - It pins this file to commit 8f9dfff only. A future backend change can
     still drift, and smoke-api.ts is still the thing that catches it.
   - The classifier was the STUB (APP_LLM_* unset), so no scoring behaviour was
     exercised — only response shapes.
   - Two nullable fields were never reached on the wire, so their `| null` is
     still inference: InstructorLoginResponse.round_id and
     MarketingQueueBatch.locked_by. Both are marked in place below.
   See docs/superpowers/plans/2026-09-13-phase2-contracts-transport.md,
   "Live verification (2026-09-13)", for the run and the local setup recipe.

   BEHAVIOURAL GOTCHAS the live run surfaced that are NOT type drift — the
   types are correct and the behaviour is still surprising. Each is documented
   on the type it affects:
   - TeamBatchJoke.sold_count vs MarketItem.sold_count USED to disagree for the
     same joke. They agree at 824655a. READ THAT NOTE before building a joke
     card, because the fix changes what old frontend code should do.
   - RoundsActiveResponse is not filtered by status.
   - ConfigRequest.ideal_profile fails with a different status on config (400)
     than on start (409).
   - GET /v1/rounds/{rid}/market and .../feedback require an X-User-Id header.

   Conventions used throughout:
   - A Go `*T` field (pointer) marshals to `null` when unset  -> `T | null`.
   - A Go `time.Time` marshals to an RFC3339 string           -> `string`.
   - A Go `int64` marshals to a JSON number                   -> `number`.
   - A Go slice built with `var xs []T` marshals to `null` when empty, whereas
     one built with `make([]T, 0, n)` marshals to `[]`. Both forms occur in
     the handlers, so the `| null` unions below are load-bearing, not paranoia.
   - `json:"...,omitempty"` / a key added conditionally -> an optional `?:`
     property (the key is absent, not null).

   CITATIONS: every `file.go:line` below is a path suffix under
   `jokefactory_be/src/`, e.g. `app/http/handler/round.go:55` means
   `jokefactory_be/src/app/http/handler/round.go:55`. Line numbers are against
   backend commit 824655a. A handful of comments quote an 8f9dfff line as well,
   to show what moved; those say so explicitly.

   ENFORCED — the `| null` unions here are checked, not advisory. This repo
   compiles with `strictNullChecks` (tsconfig.json), which was turned on during
   this phase, so `null` is NOT assignable to a non-nullable type and
   `res.batches.map(...)` is a compile error until `batches` is narrowed. Treat
   every union below as a null check the compiler will demand of you.
   (Measured: enabling it took the repo from 5 errors to 1 — see README's
   Scripts section.)

   ---------------------------------------------------------------------------
   ROUTE -> TYPE. `RAW` means the handler calls c.JSON directly and the body is
   NOT wrapped in {data}; everything else is wrapped in Wrapped<T>. Task 2's
   isRawEndpoint list must agree with the RAW rows here, and Task 7's smoke
   script walks this table.

     GET    /health                                  RAW  HealthResponse
     GET    /health/detailed                         RAW  (untyped — see below)

     POST   /v1/session/join                         RAW  SessionJoinResponse
     GET    /v1/session/me                           RAW  SessionMeResponse
     POST   /v1/instructor/login                     RAW  InstructorLoginResponse

     GET    /v1/rounds/active                             RoundsActiveResponse
     GET    /v1/rounds/{rid}/teams/{tid}/summary          TeamSummaryResponse
     GET    /v1/rounds/{rid}/teams/{tid}/feedback         TeamFeedbackResponse
     GET    /v1/rounds/{rid}/market                       MarketResponse

     POST   /v1/rounds/{rid}/batches                      BatchSubmitResponse
     GET    /v1/rounds/{rid}/teams/{tid}/batches          TeamBatchesResponse

     GET    /v1/marketing/queue/next                      MarketingQueueNextResponse
     GET    /v1/marketing/queue/count                     MarketingQueueCountResponse
     POST   /v1/marketing/batches/{bid}/split             MarketingQueueEnvelope
     POST   /v1/marketing/batches/{bid}/unsplit           MarketingQueueEnvelope
     POST   /v1/marketing/batches/{bid}/publish           PublishResponse

     POST   /v1/admin/reset                               AdminResetResponse
     GET    /v1/instructor/rounds/{rid}/lobby             LobbyResponse
     POST   /v1/instructor/rounds/{rid}/assign            LobbyResponse
     PATCH  /v1/instructor/rounds/{rid}/users/{uid}       LobbyResponse
     DELETE /v1/instructor/rounds/{rid}/users/{uid}       DeleteUserResponse
     POST   /v1/instructor/rounds/{rid}/config            InstructorRoundResponse
     POST   /v1/instructor/rounds/{rid}/start             InstructorRoundResponse
     POST   /v1/instructor/rounds/{rid}/end               PublicRoundResponse
     POST   /v1/instructor/rounds/{rid}/popups            PublicRoundResponse
     GET    /v1/instructor/rounds/{rid}/stats             RoundStatsResponse

   Route table transcribed from app/server/server.go:115-176. The split and
   unsplit rows are new at 824655a (app/server/server.go:141-142): they were
   absent from this table entirely, so neither their request nor their response
   had a type here. There are 26 routes now, not 24.

   DELIBERATELY NOT TYPED: GET /health/detailed returns whatever
   usecase.HealthService.Check produces (app/http/handler/health.go:45-48) — it
   has no fixed shape, so any interface here would be a guess that drifts
   silently. scripts/smoke-api.ts probes it for 2xx and valid JSON only, and
   asserts no keys on it. That is the intended end state, not a gap.

   ---------------------------------------------------------------------------
   NAME COLLISIONS WITH THE ROOT `types.ts` — read this before importing.

   Five names exist in BOTH this file and the root `types.ts`. Three mean
   DIFFERENT things, and because both are plain structural types, importing the
   wrong one produces NO error — just wrong behaviour at runtime:

     Role         INCOMPATIBLE. Here: 'INSTRUCTOR'|'JM'|'MARKETING' (the wire).
                  types.ts:6: a UI enum with JOKE_MAKER / QUALITY_CONTROL /
                  CUSTOMER. Nothing maps one to the other automatically.
     BatchStatus  INCOMPATIBLE. Here 'PROCESSED'; types.ts uses 'RATED'.
     Team         INCOMPATIBLE. types.ts adds performance_label, which the wire
                  Team (core/domain/entities.go:5-9) does not carry.
     ParticipantStatus, RoundStatus   Same values in both; harmless today.

   Rule: `types/api.ts` is authoritative for anything crossing the network.
   `types.ts` is authoritative for UI models. A file doing both must import one
   under an alias. views/Instructor.tsx, App.tsx and components.tsx take `Role`
   from './types' today and migrate onto this file in phases 3-7 — that is
   exactly where a silent swap would land.
============================================================================ */

import type { Dimension, IdealDimension } from '../config/dimensions';

/* The 12 dimension ids and the 11 that take an instructor ideal. Declared in
   config/dimensions.ts — the Phase-1 mirror of core/domain/scoring — rather
   than duplicated here, so the wire types and the scoring catalog cannot drift
   apart. Re-exported so consumers of this module get them without a second
   import path. */
export type { Dimension, IdealDimension };

// ---- Envelope --------------------------------------------------------------

/** Envelope for every endpoint except the raw ones noted below. app/http/response/response.go:14-16 */
export interface Wrapped<T> { data: T; }

/** Error body, at every status. app/http/response/response.go:19-36 */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    field?: string;
    request_id?: string;
  };
}

// ---- Shared unions ---------------------------------------------------------

/** core/domain/enums.go:16-23 */
export type ParticipantStatus = 'WAITING' | 'ASSIGNED';

/** core/domain/enums.go:3-13 */
export type Role = 'INSTRUCTOR' | 'JM' | 'MARKETING';

/** core/domain/enums.go:26-35 */
export type RoundStatus = 'CONFIGURED' | 'ACTIVE' | 'ENDED';

/** core/domain/enums.go:38-47 */
export type BatchStatus = 'DRAFT' | 'SUBMITTED' | 'PROCESSED';

/** core/domain/enums.go:50-59 — the Go type is named PublishStatus. */
export type JokePublishStatus = 'PENDING' | 'PUBLISHED' | 'DISCARDED';

/**
 * core/domain/entities.go:5-9 — the one domain entity that carries json tags, so it
 * stays snake_case even when nested inside the PascalCase lobby structs.
 */
export interface Team {
  id: number;
  name: string;
  created_at: string;
}

// ---- Session (RAW — no data envelope) --------------------------------------

/** app/http/dto/models.go:6-8 */
export interface SessionJoinRequest { display_name: string; }

/** The identity block shared by join, me and login. app/http/handler/session.go:40-43 */
export interface SessionUser {
  user_id: number;
  display_name: string;
}

/** app/http/handler/session.go:44-48 — assigned_at is *time.Time on the User. */
export interface SessionParticipant {
  status: ParticipantStatus;
  joined_at: string;
  assigned_at: string | null;
}

/** POST /v1/session/join — RAW. app/http/handler/session.go:39-49 */
export interface SessionJoinResponse {
  user: SessionUser;
  participant: SessionParticipant;
}

/**
 * GET /v1/session/me — RAW. app/http/handler/session.go:87-98
 * teammates is make([]gin.H, 0, n) at app/http/handler/session.go:78, so it is
 * [] and never null.
 */
export interface SessionMeResponse {
  user: SessionUser;
  participant: SessionParticipant;
  assignment: { role: Role | null; team_id: number | null };
  teammates: Array<SessionUser & { role: Role }>;
}

/**
 * POST /v1/instructor/login — RAW. app/http/handler/admin.go:41-48
 * Note: served by AdminHandler, not InstructorHandler.
 *
 * RE-CHECKED 2026-09-16, NOT DRIFT. This was flagged as possibly wrong and is
 * not: the handler calls `c.JSON(http.StatusOK, gin.H{...})` directly at
 * app/http/handler/admin.go:41, so the body IS unwrapped — no {data} — exactly
 * as the RAW row in the route table says, and the user object's id key IS
 * `user_id` (admin.go:43), which is what SessionUser already declares. The
 * body is `{round_id, user: {display_name, role, user_id}}` and this type
 * matches it key for key. Nothing changed here.
 */
export interface InstructorLoginResponse {
  user: SessionUser & { role: Role };
  /**
   * `| null` IS UNVERIFIED AGAINST LIVE. Every login in the 2026-09-13 run
   * returned a number. The null branch is defensible from the Go — the handler
   * declares `var roundID interface{}` and only assigns when res.Round != nil
   * (app/http/handler/admin.go:36-39), so an unset Round marshals to null —
   * but it may be unreachable in practice: AdminAuthService.Login backfills
   * round 1 when the rounds table is empty and keeps it in the result
   * (core/usecase/admin_auth.go:52-74), so Round is non-nil even on a fresh
   * database. Kept as-is: the type matches what the handler can emit, and
   * narrowing it to `number` would be a claim the handler does not make.
   */
  round_id: number | null;
}

/**
 * app/http/dto/admin.go:4-7 — POST /v1/instructor/login. Consumed by Task 3
 * (sessionApi.instructorLogin), which would otherwise declare it inline.
 *
 * RENAMED: Go calls this `dto.AdminLoginRequest`. Kept as
 * InstructorLoginRequest here so it pairs with InstructorLoginResponse and
 * matches the route it posts to; the handler is AdminHandler.Login but the
 * endpoint is /v1/instructor/login. Grep AdminLoginRequest to find it.
 */
export interface InstructorLoginRequest {
  display_name: string;
  password: string;
}

// ---- Rounds ----------------------------------------------------------------

/**
 * app/http/dto/round.go:9-24 — the student-safe projection. buy_threshold, jitter,
 * swap_margin, feedback_pass_threshold and ideal_profile are deliberately
 * absent; only InstructorRound carries them.
 *
 * started_at / ended_at are declared `any` in Go but always hold a
 * *time.Time (app/http/dto/round.go:54-55 from core/domain/entities.go:37-38).
 */
export interface PublicRound {
  id: number;
  round_number: number;
  status: RoundStatus;
  batch_size: number;
  max_batch_size: number;
  customer_budget: number;
  market_price: number;
  cost_of_publishing: number;
  cost_of_discard: number;
  customer_count: number;
  feedback_joke_count: number;
  started_at: string | null;
  ended_at: string | null;
  is_popped_active: boolean;
}

/**
 * GET /v1/rounds/active — wrapped. app/http/handler/round.go:30-35
 * rounds is make([]dto.PublicRound, 0, n) at app/http/handler/round.go:30, so
 * it is [] and never null.
 *
 * THE NAME LIES: "active" applies no status filter. RoundHandler.Active calls
 * RoundService.List (core/usecase/round.go:28-30) -> Repositories.ListRounds,
 * which is `SELECT ... FROM rounds ORDER BY round_id ASC` with no WHERE clause
 * (infra/repo/postgres/round_repo.go:48-49). Every round in the table comes
 * back — CONFIGURED, ACTIVE and ENDED alike. A caller that wants genuinely
 * active rounds must filter on `status` itself.
 */
export interface RoundsActiveResponse { rounds: PublicRound[]; }

/**
 * app/http/dto/round.go:27-34 — the instructor projection: PublicRound plus the hidden
 * engine knobs. ideal_profile carries `omitempty`, so the key is absent (not
 * null) when no profile is configured.
 *
 * Optional at the property level but TOTAL once present — see ConfigRequest
 * for why a partial profile is not a legal value.
 */
export interface InstructorRound extends PublicRound {
  buy_threshold: number;
  jitter: number;
  swap_margin: number;
  feedback_pass_threshold: number;
  ideal_profile?: Record<IdealDimension, string>;
}

/**
 * POST /v1/instructor/rounds/{rid}/config — app/http/handler/instructor.go:86-88
 * POST /v1/instructor/rounds/{rid}/start  — app/http/handler/instructor.go:192
 * Both wrapped, and both return the instructor projection.
 */
export interface InstructorRoundResponse { round: InstructorRound; }

/**
 * POST /v1/instructor/rounds/{rid}/end    — app/http/handler/instructor.go:221
 * POST /v1/instructor/rounds/{rid}/popups — app/http/handler/instructor.go:248
 * Both wrapped. Consumed by Task 5 (instructorApi.end, instructorApi.popups).
 *
 * These two return the PUBLIC projection, not the instructor one: both call
 * dto.ToPublicRound, so buy_threshold, jitter, swap_margin,
 * feedback_pass_threshold and ideal_profile are ABSENT from the body. Only
 * config (:86-88) and start (:192) use dto.ToInstructorRound.
 *
 * Not interchangeable with RoundsActiveResponse, which is {rounds: [...]} — a
 * list, not a single round.
 */
export interface PublicRoundResponse { round: PublicRound; }

// ---- JM batches ------------------------------------------------------------

/**
 * DRIFT FIXED 2026-09-16 — app/http/dto/models.go:15-19. The Go DTO carries a
 * third field, `RawText string json:"raw_text"`, which this file declared for
 * neither shape. A JM now submits a batch one of two ways: an already-split
 * array of jokes, or an unsplit raw blob that Marketing cuts up later via
 * POST .../split.
 *
 * EXACTLY ONE OF THE TWO, and the rule is a UNION here because the backend
 * cannot express it as a binding tag. Neither field is binding:"required"
 * (dto/models.go:12-14 says so in as many words), so the check lives in
 * BatchService.Submit and fires only at runtime
 * (core/usecase/batch.go:31-39):
 *   both     -> 400 VALIDATION_ERROR, field "jokes",
 *               "supply either jokes or raw_text, not both"  (batch.go:36)
 *   neither  -> 400 VALIDATION_ERROR, field "jokes",
 *               "either jokes or raw_text required"          (batch.go:38)
 * The `?: never` arms make both mistakes a compile error instead, so the 400
 * is unreachable from TypeScript that type-checks. `hasRaw` is computed on the
 * TRIMMED string (batch.go:32), so `raw_text: "   "` counts as neither and is
 * the one runtime 400 the union cannot catch.
 *
 * RAW BLOBS HAVE A FLOOR: at least 20 runes after trimming, or 400
 * VALIDATION_ERROR field "raw_text", "at least 20 characters required"
 * (core/usecase/batch.go:41-46; the constant is minRawTextChars at
 * core/usecase/batch.go:13-15, which mirrors the frontend's MIN_RAW_CHARS).
 * Counted in RUNES, not UTF-16 code units, so a blob of 20 emoji passes the Go
 * check while `s.length` in JS reads 40 — measure with [...s].length.
 *
 * THE BATCH-SIZE RULES SPLIT ACROSS THE TWO ARMS. On the jokes arm Submit
 * enforces them itself: round 1 demands EXACTLY batch_size jokes, round 2+
 * allows up to batch_size (core/usecase/batch.go:76-85). A raw blob has no
 * joke count yet, so on that arm the same two rules move to
 * MarketingService.Split and fire there, with the same message strings
 * (core/usecase/marketing.go:95-102).
 */
export type BatchSubmitRequest =
  | { team_id: number; jokes: string[]; raw_text?: never }
  | { team_id: number; raw_text: string; jokes?: never };

/**
 * POST /v1/rounds/{rid}/batches — wrapped. app/http/handler/batch.go:45-54
 * jokes_count is len(req.Jokes), echoed back rather than counted server-side.
 *
 * WHICH MEANS IT IS 0 ON THE RAW ARM. app/http/handler/batch.go:52 counts the
 * request's jokes array, and a raw_text submission has none — the jokes do not
 * exist until Marketing splits the batch. A screen that renders "submitted N
 * jokes" off this number will say 0 for every unsplit batch. Nothing here is
 * wrong on the wire; the field just answers a question the raw arm has not
 * reached yet.
 */
export interface BatchSubmitResponse {
  batch: {
    batch_id: number;
    round_id: number;
    team_id: number;
    status: BatchStatus;
    submitted_at: string | null;
    jokes_count: number;
  };
}

/** app/http/handler/batch.go:83-91 — one joke row inside a team's batch listing. */
export interface TeamBatchJoke {
  joke_id: number;
  joke_text: string;
  /** core/domain/entities.go:72 — *string, null until Marketing titles it. */
  joke_title: string | null;
  publish_status: JokePublishStatus;
  published_at: string | null;
  /**
   * FIXED UPSTREAM — this now AGREES with MarketItem.sold_count for the same
   * joke, and the warning that used to live here is obsolete.
   *
   * At 8f9dfff this field was structurally always 0: the repository selected
   * only the `jokes` columns, so domain.Joke.SoldCount kept its Go zero value
   * and handler/batch.go emitted it. That was observed live 2026-09-13 as 0
   * here against 20 on the market board for the same joke.
   *
   * At 824655a ListBatchesByTeam LEFT JOINs the same aggregate ListMarket uses
   * — `SELECT joke_id, COUNT(*)::int FROM purchases WHERE round_id = $2 GROUP
   * BY joke_id`, COALESCEd to 0 (infra/repo/postgres/batch_repo.go:98-111,
   * against infra/repo/postgres/aicustomer_repo.go:225-230). The repository
   * says so itself at batch_repo.go:93-95, and domain.Joke.SoldCount is
   * documented as counted from purchases at core/domain/entities.go:80-82.
   *
   * SO: reading sales off this listing is correct now. It counts CURRENT
   * HOLDINGS, not lifetime sales — a returned joke drops its `purchases` row
   * and this number falls back toward 0. That is the same semantics
   * MarketItem.sold_count has always had, which is precisely why they agree.
   * For "did this joke ever sell", read first_sold_at, which survives returns.
   *
   * GetBatchWithJokes — the read behind marketing's queue/split/unsplit — does
   * NOT join it (infra/repo/postgres/batch_repo.go:145-147), but that path
   * emits neither sold_count nor first_sold_at, so no wire type is affected.
   */
  sold_count: number;
  /**
   * DRIFT FIXED 2026-09-16 — app/http/handler/batch.go:90 emits it and this
   * type did not declare it. `*time.Time` on domain.Joke
   * (core/domain/entities.go:86), so `string | null` like every other time
   * pointer on this endpoint.
   *
   * THE ONE FIELD THAT REMEMBERS A RETURNED SALE. It is sourced from
   * `purchase_events`, the append-only log — `MIN(created_at) ... WHERE
   * round_id = $2 AND delta = 1` (infra/repo/postgres/batch_repo.go:106-109) —
   * not from `purchases`, which holds only what customers still own. A joke
   * every buyer returned therefore reads `sold_count: 0` with a non-null
   * first_sold_at, and that combination is the signal that it sold at all.
   * core/domain/entities.go:83-85 spells the same thing out; the sales
   * lead-time metric is what reads it.
   */
  first_sold_at: string | null;
}

/** app/http/handler/batch.go:93-99 — one batch row. */
export interface TeamBatch {
  batch_id: number;
  status: BatchStatus;
  submitted_at: string | null;
  processed_at: string | null;
  /** `var jokes []gin.H` at app/http/handler/batch.go:81 — null, not [], for an empty batch. */
  jokes: TeamBatchJoke[] | null;
}

/**
 * GET /v1/rounds/{rid}/teams/{tid}/batches — wrapped.
 * app/http/handler/batch.go:101. `var out []gin.H` at :79, so an empty listing
 * serialises as `{"batches": null}` rather than `{"batches": []}`.
 */
export interface TeamBatchesResponse { batches: TeamBatch[] | null; }

// ---- Team summary ----------------------------------------------------------

/**
 * GET /v1/rounds/{rid}/teams/{tid}/summary — wrapped.
 * app/http/handler/round.go:55-77. Served by RoundHandler.TeamSummary
 * (app/server/server.go:132), sourced from ports.TeamSummary at
 * core/ports/repositories.go:50-72. Note `performance_label` on the wire maps
 * to the Go field `Performance`.
 *
 * `team` is NOT the full domain.Team: the handler emits only id and name
 * (app/http/handler/round.go:56-59), so there is no created_at here.
 */
export interface TeamSummaryResponse {
  team: { id: number; name: string };
  round_id: number;
  rank: number;
  points: number;
  profit: number;
  total_sales: number;
  performance_label: string;
  unsold_jokes: number;
  sold_jokes_count: number;
  batches_created: number;
  batches_processed: number;
  published_jokes: number;
  discarded_jokes: number;
  unprocessed_batches: number;
  /**
   * DRIFT FIXED 2026-09-16 — app/http/handler/round.go:75 emits it and this
   * type did not declare it.
   *
   * ADDED ALONGSIDE the keys above, never instead of them: the handler's own
   * comment at app/http/handler/round.go:73-74 says the screens that work
   * today still read published_jokes / discarded_jokes, and they are all still
   * on the wire. Nothing above was replaced.
   *
   * Every joke this team's marketer DECIDED on, published plus discarded
   * (core/ports/repositories.go:65-69). It exists because the frontend cannot
   * derive it: round 2 batch sizes vary, so batches_created * batch_size is
   * not the joke count. Marketing's Content Waste tile is
   * jokes_created - jokes_published.
   */
  jokes_created: number;
  /**
   * DRIFT FIXED 2026-09-16 — app/http/handler/round.go:76.
   *
   * THE SAME NUMBER AS published_jokes, under the name the spec uses
   * (core/ports/repositories.go:70-71 says "mirrors PublishedJokes"). Both
   * keys ship; pick one and stay consistent rather than treating a difference
   * between them as meaningful, because there cannot be one.
   */
  jokes_published: number;
}

// ---- Feedback --------------------------------------------------------------

/**
 * app/http/dto/models.go:41-47 — joke_title is a plain string here (not a
 * pointer), and both dimension arrays are always allocated
 * (core/usecase/feedback.go:83-84), so they are [] and never null.
 *
 * The arrays carry string(domain.Dimension) enum ids — 'HUMOR_STYLE', not the
 * label 'Humor Style' (core/usecase/feedback.go:127-132).
 */
export interface FeedbackJoke {
  joke_id: number;
  joke_title: string;
  was_bought: boolean;
  good_dimensions: Dimension[];
  improve_dimensions: Dimension[];
}

/**
 * GET /v1/rounds/{rid}/teams/{tid}/feedback — wrapped.
 * app/http/handler/feedback.go:45-55. jokes is make([]dto.FeedbackJoke, 0, n)
 * at :45, so it is [] and never null.
 */
export interface TeamFeedbackResponse { jokes: FeedbackJoke[]; }

// ---- Market ----------------------------------------------------------------

/**
 * app/http/handler/customer.go:49-59 — one published joke on the market board.
 * joke_title is flattened from a *string to "" when unset
 * (app/http/handler/customer.go:45-48), so it is never null.
 * published_at is only added to the map when non-nil (app/http/handler/customer.go:57),
 * so the KEY IS ABSENT rather than null — hence `?:`, not `| null`.
 */
export interface MarketItem {
  joke_id: number;
  joke_text: string;
  joke_title: string;
  team_id: number;
  team_name: string;
  /**
   * Counted live from the `purchases` table for this round — `COUNT(*) ...
   * FROM purchases WHERE round_id = $1 GROUP BY joke_id`, LEFT JOINed and
   * COALESCEd to 0 (infra/repo/postgres/aicustomer_repo.go:218-232).
   *
   * NO LONGER THE ONLY TRUSTWORTHY SALES FIGURE, which it was at 8f9dfff.
   * TeamBatchJoke.sold_count now runs the identical aggregate over the same
   * table (infra/repo/postgres/batch_repo.go:98-111), so the two agree for the
   * same joke. Both count CURRENT HOLDINGS and both fall when a joke is
   * returned. Read TeamBatchJoke.first_sold_at for "did it ever sell".
   */
  sold_count: number;
  published_at?: string;
}

/**
 * GET /v1/rounds/{rid}/market — wrapped. app/http/handler/customer.go:43-62
 * `make([]gin.H, 0, n)` at :43, so [] never null.
 */
export interface MarketResponse { items: MarketItem[]; }

/* WARNING — `joke_title` is NOT the same type on every endpoint, because each
   handler flattens domain.Joke.Title (*string) differently:
     TeamBatchJoke.joke_title       string | null  (raw pointer, batch.go:86)
     MarketItem.joke_title          string         ("" when nil, customer.go:45-48)
     MarketingQueueJoke             ABSENT         (untitled until published)
     FeedbackJoke.joke_title        string         (dto field is a plain string)
   A shared joke component must normalise before it renders. */

// ---- Marketing -------------------------------------------------------------

/**
 * app/http/handler/marketing.go:111-120 — the claimed batch, as queue/next,
 * split and unsplit all render it. The shape moved out of QueueNext into the
 * shared `queueEnvelope` helper at 824655a, which is why the citation moved.
 */
export interface MarketingQueueBatch {
  batch_id: number;
  round_id: number;
  team_id: number;
  status: BatchStatus;
  submitted_at: string | null;
  locked_at: string | null;
  /**
   * `| null` IS UNVERIFIED AGAINST LIVE. Every batch the 2026-09-13 run pulled
   * from queue/next carried the claiming marketer's user id. Observing null
   * needs an UNLOCKED batch, which this endpoint never returns: ClaimNextBatch
   * either re-loads the batch this marketer already holds
   * (`... AND locked_by = $3`, infra/repo/postgres/marketing_repo.go:34-41) or
   * claims a fresh one, setting locked_by on the way out. Kept as `| null`
   * because domain.Batch.LockedBy is a *int64 (core/domain/entities.go:63) and
   * handler/marketing.go:118 emits it raw.
   */
  locked_by: number | null;
  /**
   * DRIFT FIXED 2026-09-16 — app/http/handler/marketing.go:119 emits it and
   * this type did not declare it. `*string` on domain.Batch
   * (core/domain/entities.go:66-67), so `string | null`.
   *
   * THIS IS THE STATE DISCRIMINATOR, and it is the reason the omission
   * mattered: the two batch states are mutually exclusive and both explicit,
   * per the handler's own comment at app/http/handler/marketing.go:92-94.
   *   UNSPLIT — raw_text is a non-null blob, jokes is `[]`. Marketing has to
   *             cut it up: POST .../split.
   *   SPLIT   — raw_text is null, jokes is populated. Marketing titles and
   *             publishes, or POST .../unsplit to start the cut over.
   * Never both, never neither. A marketing client that cannot see raw_text
   * cannot tell which of the two screens to show, and an empty `jokes` array
   * alone does not disambiguate.
   *
   * Unsplit is LOSSLESS, not a re-join. The blob is restored from
   * `raw_text_original`, an immutable copy taken at submit
   * (core/domain/entities.go:68-69, core/usecase/marketing.go:111-114), so a
   * split/unsplit round trip returns the JM's exact original text rather than
   * the split jokes glued back together.
   */
  raw_text: string | null;
}

/** app/http/handler/marketing.go:105-108 — jokes are untitled at this point. */
export interface MarketingQueueJoke {
  joke_id: number;
  joke_text: string;
}

/**
 * The `{batch, jokes, queue_size}` envelope, emitted by THREE routes from one
 * helper: `queueEnvelope` at app/http/handler/marketing.go:95-124, called by
 * QueueNext (:40), Split (:65) and Unsplit (:85). One shape, three routes,
 * deliberately — core/usecase/marketing.go:165-166 says the point is that the
 * frontend can drop any of them straight into its queue state.
 *
 * `batch` is nullable because of the empty-queue short-circuit at
 * app/http/handler/marketing.go:96-102: a zero batch id emits `batch: null`
 * with `jokes: []`. That branch is reachable on queue/next only. Split and
 * unsplit operate on a batch the marketer already holds, so they always carry
 * one — but they share this type rather than a narrowed one, because the
 * narrowing is a property of the route, not of the handler.
 *
 * `jokes` is `make([]gin.H, 0, n)` on both paths (:99, :103), so it is `[]` and
 * never null — including for an unsplit batch, which has no jokes yet. Read
 * `batch.raw_text` to tell the two apart, not `jokes.length`.
 */
export interface MarketingQueueEnvelope {
  batch: MarketingQueueBatch | null;
  jokes: MarketingQueueJoke[];
  queue_size: number;
}

/**
 * GET /v1/marketing/queue/next — wrapped. app/http/handler/marketing.go:24-41
 *
 * NOT A PURE READ, despite the GET. ClaimNextBatch locks the batch to this
 * marketer, or re-loads the one they already hold
 * (core/usecase/marketing.go:45); split, unsplit and publish all refuse a
 * batch this marketer does not hold with 403 NOT_ASSIGNED_TO_THIS_MARKETER
 * (core/usecase/marketing.go:159-161). Polling it from two actors is a race by
 * construction.
 *
 * `queue_size` counts SUBMITTED batches for the caller's own team only
 * (core/usecase/marketing.go:49), not a global queue.
 */
export type MarketingQueueNextResponse = MarketingQueueEnvelope;

/**
 * POST /v1/marketing/batches/{bid}/split — wrapped, returns
 * MarketingQueueEnvelope. app/http/handler/marketing.go:44-66, routed at
 * app/server/server.go:141. Request DTO: app/http/dto/models.go:40-45, where
 * `jokes` IS binding:"required".
 *
 * DRIFT FIXED 2026-09-16: this route was absent from this file entirely — no
 * request type, no response type, no row in the table above.
 *
 * Marketing cuts the JM's unsplit blob into individual jokes. THIS IS WHERE
 * JOKE IDS ARE FIRST ASSIGNED, so nothing keyed by joke_id exists for an
 * unsplit batch. Blank entries are trimmed and dropped before counting
 * (core/usecase/marketing.go:85-90), and an all-blank array is 400
 * VALIDATION_ERROR field "jokes", "at least one joke required" (:91-93).
 *
 * THE BATCH-SIZE RULES LAND HERE ON THE RAW PATH, not at submit: round 1 needs
 * EXACTLY batch_size jokes, round 2+ at most batch_size, counted after
 * trimming (core/usecase/marketing.go:95-102). The message strings are the
 * ones BatchService.Submit uses on the split path — "expected N jokes" and
 * "expected up to N jokes" — so the same 400 reaches the frontend from two
 * different layers depending on which arm of BatchSubmitRequest was used.
 */
export interface BatchSplitRequest { jokes: string[]; }

/** POST /v1/marketing/batches/{bid}/split — see BatchSplitRequest. */
export type BatchSplitResponse = MarketingQueueEnvelope;

/**
 * POST /v1/marketing/batches/{bid}/unsplit — wrapped, returns
 * MarketingQueueEnvelope. app/http/handler/marketing.go:69-86, routed at
 * app/server/server.go:142. NO REQUEST BODY: the handler reads only the path
 * param and never binds one.
 *
 * DRIFT FIXED 2026-09-16: absent from this file entirely, like split.
 *
 * Drops the joke rows and puts the batch back in the unsplit state so
 * Marketing can cut the blob differently. Lossless — raw_text is restored from
 * the immutable raw_text_original rather than re-joined from the split texts
 * (core/usecase/marketing.go:111-114). The joke ids the previous split
 * assigned do not survive it.
 *
 * BOTH ROUTES REQUIRE AN EDITABLE BATCH, and the preconditions are worth
 * knowing because four of them are 409s that look like bugs from the UI
 * (core/usecase/marketing.go:131-163): caller is MARKETING on the batch's own
 * team (else 403 NOT_ASSIGNED_TO_THIS_MARKETER), round ACTIVE (409
 * ROUND_NOT_ACTIVE), batch not already PROCESSED (409 BATCH_ALREADY_PROCESSED),
 * batch SUBMITTED (409 "batch not submitted"), and the lock held by THIS
 * marketer — checked explicitly so an expired lock cannot let a second
 * marketer overwrite the first one's work (403 NOT_ASSIGNED_TO_THIS_MARKETER).
 */
export type BatchUnsplitResponse = MarketingQueueEnvelope;

/**
 * GET /v1/marketing/queue/count — wrapped. app/http/handler/marketing.go:190
 * Consumed by Task 4 (marketingApi.queueCount), which would otherwise declare
 * `{ queue_size: number }` inline at the call site.
 */
export interface MarketingQueueCountResponse { queue_size: number; }

/** app/http/dto/models.go:29-33 */
export interface PublishJokeDecision {
  joke_id: number;
  joke_title: string;
  is_published: boolean;
}

/** app/http/dto/models.go:36-38 */
export interface PublishRequest { jokes: PublishJokeDecision[]; }

/**
 * POST /v1/marketing/batches/{bid}/publish — wrapped.
 * app/http/handler/marketing.go:126-173
 * Both joke_ids arrays are `make([]int64, 0, n)`
 * (infra/repo/postgres/marketing_repo.go:157-158), so they are [] never null.
 */
export interface PublishResponse {
  batch: {
    batch_id: number;
    status: BatchStatus;
    processed_at: string | null;
  };
  published: { count: number; joke_ids: number[] };
  discarded: { count: number; joke_ids: number[] };
}

// ---- Instructor: lobby -----------------------------------------------------

/* The lobby endpoints hand ports.LobbySnapshot straight to response.OK
   (app/http/handler/instructor.go:35, :107, :139). That struct and its children carry
   NO json tags (core/ports/repositories.go:19-48), so Go's encoder falls back
   to the exported Go field names and this one response is PascalCase while
   every other endpoint is snake_case. Do not "fix" it here — this is what the
   server actually sends. The one exception is the nested `Team`, which is
   domain.Team and DOES have json tags (core/domain/entities.go:5-9), so its own
   keys stay snake_case inside the PascalCase wrapper. */

/** core/ports/repositories.go:19-23 — PascalCase, no json tags. */
export interface LobbyTeamMember {
  UserID: number;
  DisplayName: string;
  Role: Role;
}

/**
 * core/ports/repositories.go:39-42 — PascalCase wrapper around a snake_case Team.
 *
 * Members is non-null despite ListTeamMembers building a nil-able slice: the
 * only construction site appends a LobbyTeam ONLY when len(members) > 0
 * (infra/repo/postgres/stats_repo.go:42-44), so a team with no members is
 * omitted from Teams entirely rather than appearing with a null roster.
 */
export interface LobbyTeam {
  Team: Team;
  Members: LobbyTeamMember[];
}

/** core/ports/repositories.go:44-48 — PascalCase, no json tags. */
export interface LobbyUnassigned {
  UserID: number;
  DisplayName: string;
  Status: ParticipantStatus;
}

/**
 * core/ports/repositories.go:32-37 — PascalCase, no json tags.
 * Dropped is never written by the Postgres implementation
 * (infra/repo/postgres/stats_repo.go:14-63) and is therefore always 0.
 */
export interface LobbySummary {
  Waiting: number;
  Assigned: number;
  Dropped: number;
  TeamCount: number;
}

/**
 * core/ports/repositories.go:25-30, served wrapped at app/http/handler/instructor.go:35
 * (lobby), :107 (assign) and :139 (patch user) — all three return this same
 * snapshot. DeleteUser does NOT; see DeleteUserResponse.
 *
 * Teams and Unassigned are built with `append` onto a nil slice
 * (infra/repo/postgres/stats_repo.go:43, :56), so an empty lobby sends
 * `null` for them rather than `[]`.
 */
export interface LobbyResponse {
  RoundID: number;
  Summary: LobbySummary;
  Teams: LobbyTeam[] | null;
  Unassigned: LobbyUnassigned[] | null;
}

// ---- Instructor: config and users ------------------------------------------

/**
 * app/http/dto/models.go:51-64 — every field is a Go pointer, so every field is
 * optional; omitted values keep the existing round or the defaults
 * (usecase.MergeConfig, via app/http/handler/instructor.go:60-72).
 */
export interface ConfigRequest {
  customer_budget?: number;
  batch_size?: number;
  market_price?: number;
  cost_of_publishing?: number;
  cost_of_discard?: number;
  customer_count?: number;
  buy_threshold?: number;
  jitter?: number;
  swap_margin?: number;
  feedback_joke_count?: number;
  feedback_pass_threshold?: number;
  /**
   * Optional at the property level, TOTAL once present. Go's map type would
   * accept anything, but scoring.ValidateIdealProfile rejects an incomplete or
   * over-complete one with a 400:
   *   - every one of the 11 IdealDimensions must carry a category, or
   *     "missing category for <DIM>" (core/domain/scoring/dimensions.go:189-194);
   *   - any key whose spec lacks HasIdeal — i.e. TITLE_FIT — gets
   *     "dimension has no ideal selector: <DIM>" (dimensions.go:201-205);
   *   - the catch-all category is refused as an ideal (dimensions.go:195-197);
   *   - an empty map is refused outright as "ideal_profile is required"
   *     (dimensions.go:184-186), which `Record` already forbids.
   * Enforced on both live paths: core/usecase/instructor.go:53-57 (config, whenever
   * the profile is non-nil) and :243 (start, unconditionally).
   *
   * THE TWO PATHS FAIL WITH DIFFERENT STATUSES — verified live 2026-09-13:
   *   POST .../config with a malformed profile
   *     -> 400 VALIDATION_ERROR, field: "ideal_profile", message is the raw
   *        scoring text, e.g. "missing category for COMPLEXITY" or
   *        "dimension has no ideal selector: TITLE_FIT".
   *        (instructor.go:53-56 returns the scoring error unwrapped;
   *        response.FromDomainError maps ErrInvalidInput -> ValidationError,
   *        which carries Field.)
   *   POST .../start with NO profile configured
   *     -> 409 CONFLICT, message "conflict: ideal_profile must be configured
   *        before start", and NO `field` key at all.
   *        (instructor.go:243-245 re-wraps the scoring error in
   *        domain.NewConflictError, which has no Field; `field` is omitempty
   *        on response.ErrorDetail, so the key is absent, not empty.)
   * Consequence: code that branches on `err.field === 'ideal_profile'` handles
   * the config path ONLY and will silently miss the start path. Branch on the
   * status/code for start, not on the field.
   */
  ideal_profile?: Record<IdealDimension, string>;
}

/**
 * app/http/dto/models.go:17-19 — POST /v1/instructor/rounds/{id}/assign.
 * Consumed by Task 5 (instructorApi.assign).
 *
 * team_count only; there is no customer_count on this endpoint. The old
 * frontend sent one and the backend ignored it — this type makes that
 * impossible to repeat.
 */
export interface AssignRequest { team_count: number; }

/**
 * app/http/dto/models.go:22-26 — status is required; role and team_id are pointers and
 * may be omitted or null. `status` is a plain Go string that is cast to
 * domain.ParticipantStatus at app/http/handler/instructor.go:132 without validation.
 */
export interface PatchUserRequest {
  status: ParticipantStatus;
  role?: Role | null;
  team_id?: number | null;
}

/**
 * DELETE /v1/instructor/rounds/{rid}/users/{uid} — wrapped.
 * app/http/handler/instructor.go:287.
 * Consumed by Task 5 (instructorApi.deleteUser), which would otherwise declare
 * `{ deleted_user_id: number }` inline at the call site.
 */
export interface DeleteUserResponse { deleted_user_id: number; }

/**
 * app/http/dto/popup.go:4-6 — POST /v1/instructor/rounds/{id}/popups, required field.
 * Consumed by Task 5 (instructorApi.popups).
 */
export interface PopupStateRequest { is_popped_active: boolean; }

// ---- Instructor: stats -----------------------------------------------------

/**
 * core/ports/repositories.go:67-77 — this struct DOES have json tags, so it is
 * snake_case, including the nested snake_case Team.
 */
export interface TeamStats {
  rank: number;
  team: Team;
  batches_processed: number;
  total_sales: number;
  published_jokes: number;
  discarded_jokes: number;
  total_jokes: number;
  unsold_jokes: number;
  profit: number;
}

/**
 * GET /v1/instructor/rounds/{rid}/stats — wrapped.
 * app/http/handler/instructor.go:263-266. The handler reassembles
 * ports.RoundStats (core/ports/repositories.go:88-91) by hand into exactly
 * {round_id, leaderboard} and nothing else.
 *
 * Leaderboard is initialised to []ports.TeamStats{}
 * (infra/repo/postgres/stats_repo.go:233), so it is [] never null.
 */
export interface RoundStatsResponse {
  round_id: number;
  leaderboard: TeamStats[];
}

// ---- Admin -----------------------------------------------------------------

/** POST /v1/admin/reset — wrapped. app/http/handler/admin.go:60-63 */
export interface AdminResetResponse {
  status: string;
  message: string;
}

// ---- Health (RAW — no data envelope) ---------------------------------------

/**
 * GET /health — RAW, and outside /v1. app/http/handler/health.go:29-31,
 * emitted at :38.
 * Consumed by scripts/smoke-api.ts, which probes /health first and checks every
 * declared key is present.
 *
 * NOTE: /health/detailed (app/http/handler/health.go:45-48) returns whatever
 * usecase.HealthService.Check produces and has NO type here ON PURPOSE — the
 * shape is not fixed, so there is nothing honest to declare. The smoke script
 * checks it for 2xx and valid JSON and asserts no keys. Do not add a type.
 */
export interface HealthResponse { status: string; }
