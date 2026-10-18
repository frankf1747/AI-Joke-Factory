import type { LeanTeamStats, LobbyResponse } from './types/api';


/**
 * UI-facing role enum (kept backward-compatible with existing UI text rendering).
 * The API uses `ApiRole` (JM/QC/etc), which we map in the service layer/context.
 */
export enum Role {
  INSTRUCTOR = 'INSTRUCTOR',
  JOKE_MAKER = 'JOKE_MAKER',
  QUALITY_CONTROL = 'QUALITY_CONTROL',
  CUSTOMER = 'CUSTOMER',
  UNASSIGNED = 'UNASSIGNED', // Local-only: represents lobby / WAITING participant status
}

// --- ID types (schema-aligned) ---
export type UserId = number;
export type TeamId = number;
export type RoundId = number;
export type BatchId = number;
export type JokeId = number;

// --- API enums (schema-aligned) ---
/* The backend's domain.Role (core/domain/enums.go:6-14) is INSTRUCTOR | JM | MARKETING.
   'QC' is retained only because a browser may still hold it in localStorage from a pre-V2
   session; the server never sends it. 'CUSTOMER' is likewise never sent by the server —
   human customers were replaced by simulated ones — but the in-browser mock still emits it
   (services/mockApi.ts) and this union types the mock's own response shapes, so dropping it
   here would only make those types lie. It goes when views/Customer.tsx does. */
export type ApiRole = 'INSTRUCTOR' | 'JM' | 'MARKETING' | 'QC' | 'CUSTOMER';
export type ParticipantStatus = 'WAITING' | 'ASSIGNED';
export type RoundStatus = 'CONFIGURED' | 'ACTIVE' | 'ENDED';
/* V2 renamed RATED -> PROCESSED (core/domain/enums.go). 'RATED' is retained only because the
   in-browser mock (services/mockApi.ts) — the default runtime — still emits it. */
export type BatchStatus = 'DRAFT' | 'SUBMITTED' | 'PROCESSED' | 'RATED';

// --- App/UI state ---
export type GameStatus = 'LOBBY' | 'PLAYING';

/**
 * App User model: includes schema-aligned fields (`user_id`, `display_name`, `team_id`)
 * plus backward-compatible aliases (`id`, `name`, `team`) so we do not touch UI components.
 */
export interface User {
  // Schema-aligned
  user_id: UserId;
  display_name: string;
  role: Role;
  team_id: TeamId | null;

  // UI compatibility (derived / mirrored)
  id: string;
  name: string;
  team: string; // "1", "2", etc. or "N/A"

  // Customer view compatibility
  wallet: number;
  purchasedJokes: string[]; // joke ids as strings (legacy); kept for UI compatibility
}

/**
 * App Joke model: includes schema-aligned fields (`joke_id`, `joke_text`) plus legacy aliases.
 */
export interface Joke {
  joke_id: JokeId;
  joke_text: string;

  // UI compatibility
  id: string;
  content: string;

  // Market / publishing info (if provided by backend)
  sold_count?: number;
  is_bought?: boolean;
  is_published?: boolean;

  // QC feedback (client-side only; schema does not include tags/feedback)
  rating?: number; // 1-5
  tags?: string[];
}

/**
 * App Batch model: includes schema-aligned fields (`batch_id`, `round_id`, `team_id`)
 * plus legacy aliases (`id`, `team`, `round`) used by existing views.
 */
export interface Batch {
  batch_id: BatchId;
  round_id: RoundId;
  team_id: TeamId;
  status: BatchStatus;

  jokes: Joke[];

  submitted_at?: string;
  rated_at?: string;

  // UI compatibility aliases
  id: string;
  team: string;
  round: number;
  submittedAt?: number;
  ratedAt?: number;
  /* Local-only, never from the wire: Marketing types this into its own panel and
     it is persisted client-side for the team's own discussion. */
  feedback?: string;
  tagSummary?: Array<{ tag: string; count: number }>;
  /* From the wire (batch list marketing_note): Marketing's note to the Joke
     Maker, or null when there is none. Set by mapBatchFromTeamList. */
  marketing_note?: string | null;
}

export interface GameConfig {
  status: GameStatus;
  round: number; // displayed round number (round_number)
  isActive: boolean;
  showTeamPopup: boolean;
  startTime: number | null;
  elapsedTime: number; // seconds
  customerBudget: number;
  round1BatchSize: number;
  round2BatchLimit: number;
  marketPrice: number;
  costOfPublishing: number;
  costOfDiscard: number;
  /** Seconds Marketing may deliberate on a split batch before the first nudge. */
  marketingNudge1Seconds: number;
  /** Seconds after that nudge is dismissed before the second (and last) one. */
  marketingNudge2Seconds: number;
  /** Instructor-only. Never sent to students; the backend strips it from the public round. */
  idealProfile: Record<string, string>;
  /* Lean market mode (newer backends). Read off the current public round via
     services/leanMode.ts; CLASSIC with zero costs and no WIP limit otherwise. */
  marketMode: 'CLASSIC' | 'LEAN';
  arrivalWindowSeconds: number;
  setupCostPerBatch: number;
  carryingCostPerJokeMinute: number;
  /** Max batches waiting for Marketing per team; 0 = no limit. */
  wipLimit: number;
  /* Lean fees (newer backends), read off the current public round the same
     way; 0 when absent. Shipping per sent batch by size (1–4 / 5 / 6+ jokes),
     storage and hosting per joke per minute. */
  shippingFeeSmall: number;
  shippingFeeStandard: number;
  shippingFeeLarge: number;
  storageFeePerJokeMinute: number;
  hostingFeePerJokeMinute: number;
  /** AI customers per team (0 = fixed count); read from the round, shared by both rounds like the fees. */
  customersPerTeam: number;
}

// --- API shapes (schema-aligned) ---
export interface Team {
  id: TeamId;
  name: string;
  // Some endpoints (e.g., market) include an optional performance label.
  performance_label?: string;
}

export interface ApiErrorResponse {
  code?: string;
  message?: string;
  error?: { code?: string; message?: string };
}

export interface ApiUser {
  user_id: UserId;
  display_name: string;
}

export interface ApiParticipant {
  status: ParticipantStatus;
  joined_at: string;
  assigned_at: string | null;
}

export interface ApiSessionJoinRequest {
  display_name: string;
}

export interface ApiSessionJoinResponse {
  user: ApiUser;
  participant: ApiParticipant;
}

export interface ApiSessionMeResponse {
  user: { user_id: UserId; display_name: string };
  round_id: RoundId;
  participant: ApiParticipant;
  assignment: { role: ApiRole | null; team_id: TeamId | null };
  teammates?: Array<{ user_id: UserId; display_name: string; role: ApiRole }>;
}

export interface ApiInstructorLoginRequest {
  display_name: string;
  password: string;
}

export interface ApiInstructorLoginResponse {
  user: { user_id: UserId; display_name: string; role: 'INSTRUCTOR' };
  round_id: RoundId;
}

export interface ApiRound {
  id: RoundId;
  round_number: number;
  status: string; // backend may return "Active"/"Ended"/"Configured"; we normalize client-side
  batch_size: number;
  // Some backends expose Round 2 batch cap as `max_batch_size` on /v1/rounds/active.
  // Keep optional for backward compatibility with older schemas.
  max_batch_size?: number;
  customer_budget: number;
  started_at?: string | null;
  ended_at?: string | null;
  created_at?: string;
  is_popped_active?: boolean;
  // Lean market mode fields; absent on backends that predate the feature.
  market_mode?: 'CLASSIC' | 'LEAN';
  arrival_window_seconds?: number;
  setup_cost_per_batch?: number;
  carrying_cost_per_joke_minute?: number;
  wip_limit?: number;
  // Lean fees; absent on backends before migration 0005.
  shipping_fee_small?: number;
  shipping_fee_standard?: number;
  shipping_fee_large?: number;
  storage_fee_per_joke_minute?: number;
  hosting_fee_per_joke_minute?: number;
  // On every public round (newer backends).
  customers_per_team?: number;
}

export interface ApiActiveRoundResponse {
  rounds: ApiRound[];
}

export interface ApiInstructorRoundConfigResponse {
  data: { round: ApiRound };
}

export interface ApiTeamSummaryResponse {
  team: Team;
  round_id: RoundId;
  rank: number;
  performance_label?: string;
  points: number;
  total_sales: number;
  profit?: number;
  batches_created: number;
  batches_processed: number;
  published_jokes: number;
  unprocessed_batches: number;
  unsold_jokes?: number;
  sold_jokes_count?: number;
  discarded_jokes?: number;
  jokes_created?: number;
  jokes_published?: number;
  /** Lean rounds only: the team's fees so far (read through services/leanMode.ts leanFeesOf). */
  lean?: LeanTeamStats;
}

export interface ApiTeamBatchesResponse {
  batches: Array<{
    batch_id: BatchId;
    status: BatchStatus;
    submitted_at: string;
    // V2 name, null until Marketing decides; rated_at is the pre-V2 (mock) name.
    processed_at?: string | null;
    rated_at?: string;
    // No avg_score / passes_count / feedback / tag_summary: V2 removed ratings,
    // and the batch listing (handler/batch.go) never carried a feedback column
    // or a tag summary in the first place.
    jokes?: Array<{
      joke_id: JokeId;
      joke_text: string;
      joke_title?: string | null;
      publish_status?: 'PENDING' | 'PUBLISHED' | 'DISCARDED';
      published_at?: string | null;
      sold_count?: number;
      first_sold_at?: string | null;
    }>;
    // Marketing's note to the Joke Maker; absent on backends before migration 0004.
    marketing_note?: string | null;
  }>;
}

export interface ApiCreateBatchRequest {
  team_id: TeamId;
  // Legacy: pre-split jokes array. V2: JM submits a raw text blob instead and
  // Marketing does the splitting. One of `jokes` / `raw_text` is required.
  jokes?: string[];
  raw_text?: string;
}

export interface ApiCreateBatchResponse {
  batch: {
    batch_id: BatchId;
    round_id: RoundId;
    team_id: TeamId;
    status: BatchStatus;
    submitted_at: string;
    jokes_count: number;
  };
}

export interface ApiQcQueueNextResponse {
  // Null when every waiting batch is held by a teammate (queue_size can still be > 0).
  batch: {
    batch_id: BatchId;
    round_id: RoundId;
    team_id: TeamId;
    status?: BatchStatus;
    submitted_at: string;
    locked_at?: string | null;
    locked_by?: UserId | null;
    // The Joke Maker's blob; null once Marketing has split the batch.
    raw_text?: string | null;
  } | null;
  // Empty until Marketing splits the raw_text into individual jokes.
  jokes: Array<{ joke_id: JokeId; joke_text: string }>;
  queue_size: number;
}

export interface ApiSplitBatchRequest {
  jokes: string[];
}

export interface ApiQcQueueCountResponse {
  queue_size: number;
}

export interface ApiQcSubmitRatingsRequest {
  ratings: Array<{ joke_id: JokeId; rating: number; tag: string; joke_title?: string }>;
  feedback?: string;
}

export interface ApiQcSubmitRatingsResponse {
  batch: { batch_id: BatchId; status: BatchStatus; rated_at: string; avg_score: number; passes_count: number };
  published: { count: number; joke_ids: JokeId[] };
}

/**
 * GET /v1/rounds/{rid}/market — one published joke.
 *
 * FLAT, not nested: the backend emits team_id/team_name inline and there is no
 * `team` object, no `bought_count` and no `is_bought_by_me` (the AI Customer is
 * not a session, so "bought by me" has no referent). Mirrors `MarketItem` in
 * types/api.ts, which is the live-verified transcription of the handler.
 *
 * `sold_count` is the only trustworthy sales figure — counted from `purchases`.
 */
export interface ApiMarketItem {
  joke_id: JokeId;
  joke_text: string;
  joke_title: string;
  team_id: TeamId;
  team_name: string;
  sold_count: number;
  published_at?: string;
}

export interface ApiMarketResponse {
  items: ApiMarketItem[];
}

export interface ApiCustomerBudgetResponse {
  round_id: RoundId;
  starting_budget: number;
  remaining_budget: number;
}

export interface ApiMarketBuyReturnResponse {
  purchase: { purchase_id: number; joke_id: JokeId };
  budget: { starting_budget: number; remaining_budget: number };
  team_points_awarded: { team_id: TeamId; points_delta: number };
}

/** GET /v1/instructor/rounds/{rid}/lobby as Go sends it: ports.LobbySnapshot has no json
 *  tags, so the keys are PascalCase (RoundID, Summary, Teams, Unassigned) apart from the
 *  nested domain.Team; Teams and Unassigned are null when empty. See types/api.ts. */
export type ApiInstructorLobbyResponse = LobbyResponse;

/** The lobby as the client holds it, after normalizeInstructorLobby (context.tsx), which
 *  also reads the mock backend's older snake_case shape. Go has no customers; only the
 *  mock sends them, so `customers` is [] against the real backend. */
export interface InstructorLobby {
  round_id: RoundId | null;
  summary: {
    waiting: number;
    assigned: number;
    dropped: number;
    team_count: number;
  };
  teams: Array<{ team: { id: TeamId; name: string }; members: Array<{ user_id: UserId; display_name: string; role: ApiRole | null }> }>;
  customers: Array<{ user_id: UserId; display_name: string; role: ApiRole }>;
  unassigned: Array<{ user_id: UserId; display_name: string; status: ParticipantStatus }>;
}

export interface ApiInstructorStatsResponse {
  round_id: RoundId;
  leaderboard: Array<{
    rank: number;
    team: Team;
    points: number;
    total_sales: number;
    unsold_jokes: number;
    discarded_jokes: number;
    batches_processed: number;
    profit: number;
    total_jokes: number;
    published_jokes: number;
    /** Lean market mode only (newer backends): present on LEAN rounds. */
    lean?: LeanTeamStats;
  }>;
  /* The four series below are NOT sent by the Go backend — GET /v1/instructor/rounds/{id}/stats
     returns {round_id, leaderboard} only (ports.RoundStats). They are optional because the
     views render an honest "Not available yet" state when absent, and rejection_by_team is
     derived client-side from leaderboard counts. Do not make them required again without a
     backend that actually sends them. */
  cumulative_sales?: Array<{
    event_index: number;
    timestamp: string;
    team_id: TeamId;
    team_name: string;
    total_sales: number;
  }>;
  unrated_jokes_over_time?: Array<{
    team_event_index: number;
    timestamp: string;
    team_id: TeamId;
    team_name: string;
    queue_count: number;
  }>;
  learning_curve?: Array<{
    team_id: TeamId;
    team_name: string;
    batch_order: number;
    avg_score: number;
  }>;
  /* DERIVED, not from the wire. The backend sends no rejection series, but the
     "Wasted Jokes" bars only need discarded_jokes / total_jokes, and both are on
     the leaderboard — so context.tsx computes this from it. */
  rejection_by_team?: Array<{
    team_id: TeamId;
    team_name: string;
    unaccepted_jokes: number;
    rejection_rate: number;
  }>;
}

export interface ApiInstructorDeleteUserResponse {
  deleted_user_id: UserId;
}

export interface ApiTeamsResponse {
  teams: Team[];
}
