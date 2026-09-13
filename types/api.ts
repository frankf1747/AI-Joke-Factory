/* ============================================================================
   Wire types for the Go backend.

   Transcribed by hand from jokefactory_be/src/app/http/handler/*.go, because
   the backend builds its responses as inline gin.H maps rather than typed
   structs — there is nothing to generate from. Every type below cites the Go
   file and line it came from; re-check them against that source, not against
   FRONTEND_PLAN.md, which already lags the implementation.

   Nothing here is defensive. If the backend sends a field this file does not
   declare, that is drift and scripts/smoke-api.ts is what catches it.

   Conventions used throughout:
   - A Go `*T` field (pointer) marshals to `null` when unset  -> `T | null`.
   - A Go `time.Time` marshals to an RFC3339 string           -> `string`.
   - A Go `int64` marshals to a JSON number                   -> `number`.
   - A Go slice built with `var xs []T` marshals to `null` when empty, whereas
     one built with `make([]T, 0, n)` marshals to `[]`. Both forms occur in
     the handlers, so the `| null` unions below are load-bearing, not paranoia.
   - `json:"...,omitempty"` / a key added conditionally -> an optional `?:`
     property (the key is absent, not null).
============================================================================ */

// ---- Envelope --------------------------------------------------------------

/** Envelope for every endpoint except the raw ones noted below. response.go:14-16 */
export interface Wrapped<T> { data: T; }

/** Error body, at every status. response.go:19-36 */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    field?: string;
    request_id?: string;
  };
}

// ---- Shared unions ---------------------------------------------------------

/** domain/enums.go:16-23 */
export type ParticipantStatus = 'WAITING' | 'ASSIGNED';

/** domain/enums.go:3-13 */
export type Role = 'INSTRUCTOR' | 'JM' | 'MARKETING';

/** domain/enums.go:26-35 */
export type RoundStatus = 'CONFIGURED' | 'ACTIVE' | 'ENDED';

/** domain/enums.go:38-47 */
export type BatchStatus = 'DRAFT' | 'SUBMITTED' | 'PROCESSED';

/** domain/enums.go:50-59 — the Go type is named PublishStatus. */
export type JokePublishStatus = 'PENDING' | 'PUBLISHED' | 'DISCARDED';

/** domain/enums.go:76-103 — the 12 judging dimensions, as ideal_profile keys. */
export type Dimension =
  | 'LENGTH'
  | 'TOPIC'
  | 'HUMOR_STYLE'
  | 'COMPLEXITY'
  | 'EDGINESS'
  | 'STRUCTURE'
  | 'WORDPLAY'
  | 'FRESHNESS'
  | 'SETUP_PAYOFF'
  | 'CLARITY'
  | 'ENERGY'
  | 'TITLE_FIT';

/**
 * domain/entities.go:5-9 — the one domain entity that carries json tags, so it
 * stays snake_case even when nested inside the PascalCase lobby structs.
 */
export interface Team {
  id: number;
  name: string;
  created_at: string;
}

// ---- Session (RAW — no data envelope) --------------------------------------

/** dto/models.go:6-8 */
export interface SessionJoinRequest { display_name: string; }

/** handler/session.go:39-49 — RAW, c.JSON straight to the body. */
export interface SessionJoinResponse {
  user: { user_id: number; display_name: string };
  participant: { status: ParticipantStatus; joined_at: string; assigned_at: string | null };
}

/** handler/session.go:87-98 — RAW, c.JSON straight to the body. */
export interface SessionMeResponse {
  user: { user_id: number; display_name: string };
  participant: { status: ParticipantStatus; joined_at: string; assigned_at: string | null };
  assignment: { role: Role | null; team_id: number | null };
  teammates: Array<{ user_id: number; display_name: string; role: Role }>;
}

/** handler/admin.go:41-48 — RAW. Note: served by AdminHandler, not InstructorHandler. */
export interface InstructorLoginResponse {
  user: { user_id: number; display_name: string; role: Role };
  round_id: number | null;
}

/** dto/admin.go:4-7 — POST /v1/instructor/login. */
export interface InstructorLoginRequest {
  display_name: string;
  password: string;
}

// ---- Rounds ----------------------------------------------------------------

/**
 * dto/round.go:9-24 — the student-safe projection. buy_threshold, jitter,
 * swap_margin, feedback_pass_threshold and ideal_profile are deliberately
 * absent; only InstructorRound carries them.
 *
 * started_at / ended_at are declared `any` in Go but always hold a
 * *time.Time (dto/round.go:54-55 from domain/entities.go:37-38).
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

/** handler/round.go:30-35 — GET /v1/rounds/active, wrapped. */
export interface RoundsActiveResponse { rounds: PublicRound[]; }

/**
 * dto/round.go:27-34 — the instructor projection: PublicRound plus the hidden
 * engine knobs. ideal_profile carries `omitempty`, so the key is absent (not
 * null) when no profile is configured.
 */
export interface InstructorRound extends PublicRound {
  buy_threshold: number;
  jitter: number;
  swap_margin: number;
  feedback_pass_threshold: number;
  ideal_profile?: Partial<Record<Dimension, string>>;
}

/**
 * handler/instructor.go:86-88 (config), :192 (start) — wrapped.
 * Both endpoints return the instructor projection.
 */
export interface InstructorRoundResponse { round: InstructorRound; }

/**
 * handler/instructor.go:221 (end), :248 (popups) — wrapped.
 * These two return the PUBLIC projection, not the instructor one.
 */
export interface PublicRoundResponse { round: PublicRound; }

// ---- JM batches ------------------------------------------------------------

/** dto/models.go:11-14 */
export interface BatchSubmitRequest {
  team_id: number;
  jokes: string[];
}

/** handler/batch.go:45-54 — wrapped. jokes_count is len(req.Jokes), echoed back. */
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

/** handler/batch.go:83-90 — one joke row inside a team's batch listing. */
export interface TeamBatchJoke {
  joke_id: number;
  joke_text: string;
  /** domain/entities.go:71 — *string, null until Marketing titles it. */
  joke_title: string | null;
  publish_status: JokePublishStatus;
  published_at: string | null;
  sold_count: number;
}

/** handler/batch.go:92-98 — one batch row. */
export interface TeamBatch {
  batch_id: number;
  status: BatchStatus;
  submitted_at: string | null;
  processed_at: string | null;
  /** `var jokes []gin.H` at handler/batch.go:81 — null, not [], for an empty batch. */
  jokes: TeamBatchJoke[] | null;
}

/**
 * handler/batch.go:100 — wrapped.
 * `var out []gin.H` at handler/batch.go:79, so an empty listing serialises as
 * `{"batches": null}` rather than `{"batches": []}`.
 */
export interface TeamBatchesResponse { batches: TeamBatch[] | null; }

// ---- Team summary ----------------------------------------------------------

/**
 * handler/round.go:55-73 — wrapped. Served by RoundHandler.TeamSummary
 * (server.go:132), sourced from ports.TeamSummary at
 * core/ports/repositories.go:50-65. Note `performance_label` on the wire maps
 * to the Go field `Performance`.
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
}

// ---- Feedback --------------------------------------------------------------

/**
 * dto/models.go:41-47 — joke_title is a plain string here (not a pointer), and
 * both dimension arrays are always allocated (usecase/feedback.go:83-84), so
 * they are [] and never null.
 */
export interface FeedbackJoke {
  joke_id: number;
  joke_title: string;
  was_bought: boolean;
  good_dimensions: string[];
  improve_dimensions: string[];
}

/** handler/feedback.go:45-55 — wrapped. */
export interface TeamFeedbackResponse { jokes: FeedbackJoke[]; }

// ---- Market ----------------------------------------------------------------

/**
 * handler/customer.go:49-59 — one published joke on the market board.
 * joke_title is flattened from a *string to "" when unset
 * (handler/customer.go:45-48), so it is never null.
 * published_at is only added to the map when non-nil (handler/customer.go:57),
 * so the KEY IS ABSENT rather than null — hence `?:`, not `| null`.
 */
export interface MarketItem {
  joke_id: number;
  joke_text: string;
  joke_title: string;
  team_id: number;
  team_name: string;
  sold_count: number;
  published_at?: string;
}

/** handler/customer.go:43-62 — wrapped. `make([]gin.H, 0, n)`, so [] never null. */
export interface MarketResponse { items: MarketItem[]; }

// ---- Marketing -------------------------------------------------------------

/** handler/marketing.go:57-65 — the claimed batch. */
export interface MarketingQueueBatch {
  batch_id: number;
  round_id: number;
  team_id: number;
  status: BatchStatus;
  submitted_at: string | null;
  locked_at: string | null;
  locked_by: number | null;
}

/** handler/marketing.go:51-54 — jokes are untitled at this point. */
export interface MarketingQueueJoke {
  joke_id: number;
  joke_text: string;
}

/**
 * handler/marketing.go:40-68 — wrapped.
 * When the queue is empty the handler short-circuits at :41-45 and emits
 * `batch: null` with `jokes: []`, so `batch` is genuinely nullable.
 */
export interface MarketingQueueResponse {
  batch: MarketingQueueBatch | null;
  jokes: MarketingQueueJoke[];
  queue_size: number;
}

/** handler/marketing.go:135 — wrapped. GET /v1/marketing/queue/count. */
export interface MarketingQueueCountResponse { queue_size: number; }

/** dto/models.go:29-33 */
export interface PublishJokeDecision {
  joke_id: number;
  joke_title: string;
  is_published: boolean;
}

/** dto/models.go:36-38 */
export interface PublishRequest { jokes: PublishJokeDecision[]; }

/**
 * handler/marketing.go:103-117 — wrapped.
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
   (handler/instructor.go:35, :107, :139). That struct and its children carry
   NO json tags (core/ports/repositories.go:19-48), so Go's encoder falls back
   to the exported Go field names and this one response is PascalCase while
   every other endpoint is snake_case. Do not "fix" it here — this is what the
   server actually sends. The one exception is the nested `Team`, which is
   domain.Team and DOES have json tags (domain/entities.go:5-9), so its own
   keys stay snake_case inside the PascalCase wrapper. */

/** core/ports/repositories.go:19-23 — PascalCase, no json tags. */
export interface LobbyTeamMember {
  UserID: number;
  DisplayName: string;
  Role: Role;
}

/** core/ports/repositories.go:39-42 — PascalCase wrapper around a snake_case Team. */
export interface LobbyTeam {
  Team: Team;
  Members: LobbyTeamMember[] | null;
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
 * core/ports/repositories.go:25-30, served wrapped at handler/instructor.go:35
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
 * dto/models.go:51-64 — every field is a Go pointer, so every field is
 * optional; omitted values keep the existing round or the defaults
 * (usecase.MergeConfig, via handler/instructor.go:60-72).
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
  ideal_profile?: Partial<Record<Dimension, string>>;
}

/**
 * dto/models.go:17-19 — POST /v1/instructor/rounds/{id}/assign.
 * team_count only; there is no customer_count on this endpoint.
 */
export interface AssignRequest { team_count: number; }

/**
 * dto/models.go:22-26 — status is required; role and team_id are pointers and
 * may be omitted or null. `status` is a plain Go string that is cast to
 * domain.ParticipantStatus at handler/instructor.go:132 without validation.
 */
export interface PatchUserRequest {
  status: ParticipantStatus;
  role?: Role | null;
  team_id?: number | null;
}

/** handler/instructor.go:287 — wrapped. DELETE .../users/{user_id}. */
export interface DeleteUserResponse { deleted_user_id: number; }

/** dto/popup.go:4-6 — POST /v1/instructor/rounds/{id}/popups, required field. */
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
 * handler/instructor.go:263-266 — wrapped. The handler reassembles
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

/** handler/admin.go:60-63 — wrapped. POST /v1/admin/reset. */
export interface AdminResetResponse {
  status: string;
  message: string;
}

// ---- Health (RAW — no data envelope) ---------------------------------------

/** handler/health.go:29-31, emitted at :38 — RAW. GET /health. */
export interface HealthResponse { status: string; }
