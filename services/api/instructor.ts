import { apiRequest } from '../apiClient';
import type {
  LobbyResponse, ConfigRequest, InstructorRoundResponse, PublicRoundResponse,
  PatchUserRequest, DeleteUserResponse, RoundStatsResponse, AdminResetResponse,
  AssignRequest, PopupStateRequest,
} from '../../types/api';

/* AssignRequest and PopupStateRequest are built inline below rather than taken
   as parameters — the call sites take plain arguments, which is friendlier than
   making every caller construct a body object. The `satisfies` clauses on those
   literals are what enforce the match: without them the claim would be a
   comment, and a renamed wire key would compile. They also keep the key names
   visible to a reader, which the scalar-parameter signatures otherwise hide. */

export const instructorApi = {
  /** NOTE: this response is PascalCase, unlike every other endpoint — the Go
   *  struct is serialised without json tags. Transcribed as-is in types/api.ts. */
  lobby(roundId: number) {
    return apiRequest<LobbyResponse>(`/v1/instructor/rounds/${roundId}/lobby`);
  },

  /** All fields optional; omitted values keep the existing round's. Includes
   *  the hidden knobs and the ideal profile, which students never receive. */
  config(roundId: number, body: ConfigRequest) {
    return apiRequest<InstructorRoundResponse>(`/v1/instructor/rounds/${roundId}/config`, { method: 'POST', body });
  },

  /** Body is {team_count} only — there is no customer_count, customers are
   *  simulated. The old frontend sent one and it was ignored. */
  assign(roundId: number, teamCount: number) {
    return apiRequest<LobbyResponse>(`/v1/instructor/rounds/${roundId}/assign`, {
      method: 'POST',
      body: { team_count: teamCount } satisfies AssignRequest,
    });
  },

  patchUser(roundId: number, userId: number, body: PatchUserRequest) {
    return apiRequest<LobbyResponse>(`/v1/instructor/rounds/${roundId}/users/${userId}`, { method: 'PATCH', body });
  },

  deleteUser(roundId: number, userId: number) {
    return apiRequest<DeleteUserResponse>(`/v1/instructor/rounds/${roundId}/users/${userId}`, { method: 'DELETE' });
  },

  /** Locks the config and the ideal profile, then generates the AI customers.
   *
   *  MISSING IDEAL PROFILE FAILS AS **409**, NOT 400 — verified live 2026-09-13.
   *  Starting a round whose ideal profile was never configured returns
   *  409 CONFLICT with message "conflict: ideal_profile must be configured
   *  before start" and **no `field` key at all**: usecase/instructor.go:243-245
   *  re-wraps the scoring failure in domain.NewConflictError, which carries no
   *  Field, and `field` is omitempty on the error body.
   *
   *  config() is the one that returns 400 VALIDATION_ERROR with
   *  field: "ideal_profile" (usecase/instructor.go:53-56). So error handling
   *  that branches on `err.field === 'ideal_profile'` covers config() ONLY and
   *  will silently miss this path — branch on status/code here instead.
   *  Also 409 from here: "round already active" / "round already ended"
   *  (usecase/instructor.go:231-236), likewise with no field. */
  start(roundId: number, body: ConfigRequest = {}) {
    return apiRequest<InstructorRoundResponse>(`/v1/instructor/rounds/${roundId}/start`, { method: 'POST', body });
  },

  /** CORRECTED: returns the PUBLIC projection, not the instructor one.
   *  handler/instructor.go:221 calls dto.ToPublicRound — so buy_threshold,
   *  jitter, swap_margin, feedback_pass_threshold and ideal_profile are NOT
   *  on this response. Only config (:87) and start (:192) return
   *  ToInstructorRound. Typing this as InstructorRoundResponse would be a
   *  lie the compiler cannot catch, because the type is a claim about the
   *  wire rather than a check of it. */
  end(roundId: number) {
    return apiRequest<PublicRoundResponse>(`/v1/instructor/rounds/${roundId}/end`, { method: 'POST' });
  },

  /** Also the PUBLIC projection — handler/instructor.go:248. See end(). */
  popups(roundId: number, isActive: boolean) {
    return apiRequest<PublicRoundResponse>(`/v1/instructor/rounds/${roundId}/popups`, {
      method: 'POST',
      body: { is_popped_active: isActive } satisfies PopupStateRequest,
    });
  },

  /** Leaderboard ONLY. There are no time-series or chart payloads — ports.RoundStats
   *  is {round_id, leaderboard[]}. Any dashboard chart needs a different source. */
  stats(roundId: number) {
    return apiRequest<RoundStatsResponse>(`/v1/instructor/rounds/${roundId}/stats`);
  },

  /** Wipes all game data. Instructor-guarded. */
  resetGame() {
    return apiRequest<AdminResetResponse>('/v1/admin/reset', { method: 'POST' });
  },
};
