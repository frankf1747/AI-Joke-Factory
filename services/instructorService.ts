import { apiRequest } from './apiClient';
import type {
  ApiInstructorLobbyResponse,
  ApiInstructorStatsResponse,
  ApiInstructorDeleteUserResponse,
  ApiInstructorLoginRequest,
  ApiInstructorLoginResponse,
  ApiInstructorRoundConfigResponse,
  ApiInstructorRoundReadResponse,
  RoundId,
  TeamId,
  UserId,
} from '../types';

/**
 * Exactly the roles the backend will accept on a write (usecase/instructor.go:207-218:
 * `switch *desiredRole { case RoleInstructor: ...; case RoleJM, RoleMarketing: ...;
 * default: return NewValidationError("role", "unsupported role") }`).
 *
 * Deliberately narrower than `ApiRole`. `ApiRole` describes what we may *read* — it tolerates
 * the legacy 'QC' and the mock's 'CUSTOMER' because a stale browser or the in-browser mock can
 * still produce them. This describes what we may *send*, where there is exactly one correct
 * value per seat and any other is a guaranteed 400. Keep them separate: widening this to be
 * "consistent" with ApiRole would re-open the bug it exists to prevent.
 */
export type PatchUserRole = 'INSTRUCTOR' | 'JM' | 'MARKETING';

export const instructorService = {
  login(body: ApiInstructorLoginRequest): Promise<ApiInstructorLoginResponse> {
    return apiRequest<ApiInstructorLoginResponse>('/v1/instructor/login', { method: 'POST', body });
  },

  lobby(round_id: RoundId): Promise<ApiInstructorLobbyResponse> {
    return apiRequest<ApiInstructorLobbyResponse>(`/v1/instructor/rounds/${round_id}/lobby`, { method: 'GET' });
  },

  stats(round_id: RoundId): Promise<ApiInstructorStatsResponse> {
    return apiRequest<ApiInstructorStatsResponse>(`/v1/instructor/rounds/${round_id}/stats`, { method: 'GET' });
  },

  /**
   * POST /assign — dto.AssignRequest is {team_count} only (app/http/dto/models.go:17-19).
   * The old call site also sent customer_count; the backend silently ignored it. Keeping
   * this type narrow is what stops that from coming back.
   */
  autoAssign(round_id: RoundId, body: { team_count: number }): Promise<unknown> {
    return apiRequest<unknown>(`/v1/instructor/rounds/${round_id}/assign`, { method: 'POST', body });
  },

  patchUser(
    round_id: RoundId,
    user_id: UserId,
    body: { status?: 'WAITING' | 'ASSIGNED'; role?: PatchUserRole; team_id?: TeamId | null },
  ): Promise<unknown> {
    // Go answers with the full lobby (ports.LobbySnapshot, PascalCase); the mock answers 204.
    return apiRequest<unknown>(`/v1/instructor/rounds/${round_id}/users/${user_id}`, { method: 'PATCH', body });
  },

  deleteUser(round_id: RoundId, user_id: UserId): Promise<ApiInstructorDeleteUserResponse> {
    return apiRequest<ApiInstructorDeleteUserResponse>(`/v1/instructor/rounds/${round_id}/users/${user_id}`, { method: 'DELETE' });
  },

  /**
   * POST /config — mirrors dto.ConfigRequest (app/http/dto/models.go:51-63), where every
   * field is a Go pointer and therefore optional; omitted values keep the existing round.
   * This is the only non-start path that accepts an ideal_profile.
   */
  updateRoundConfig(
    round_id: RoundId,
    body: {
      customer_budget?: number;
      batch_size?: number;
      market_price?: number;
      cost_of_publishing?: number;
      cost_of_discard?: number;
      customer_count?: number;
      ideal_profile?: Record<string, string>;
      // Lean market mode (newer backends). market_mode is locked once the round
      // starts: the backend answers 409 with a "MARKET_MODE_LOCKED" message.
      market_mode?: 'CLASSIC' | 'LEAN';
      arrival_window_seconds?: number;
      setup_cost_per_batch?: number;
      carrying_cost_per_joke_minute?: number;
      wip_limit?: number;
      preference_base?: number;
      customers_per_team?: number;
      shipping_fee_small?: number;
      shipping_fee_standard?: number;
      shipping_fee_large?: number;
      storage_fee_per_joke_minute?: number;
      hosting_fee_per_joke_minute?: number;
    },
  ): Promise<ApiInstructorRoundConfigResponse> {
    return apiRequest<ApiInstructorRoundConfigResponse>(`/v1/instructor/rounds/${round_id}/config`, { method: 'POST', body });
  },

  /**
   * GET /config — the stored round config and hidden ideal joke (instructor only). The body is
   * the snake_case instructor round DTO POST /config returns; ideal_profile is absent when none
   * is stored. A backend without this route answers 404: callers treat that as "nothing stored".
   */
  getRoundConfig(round_id: RoundId | number): Promise<ApiInstructorRoundReadResponse> {
    return apiRequest<ApiInstructorRoundReadResponse>(`/v1/instructor/rounds/${round_id}/config`, { method: 'GET' });
  },

  popups(round_id: RoundId, body: { is_popped_active: boolean }): Promise<ApiInstructorRoundConfigResponse> {
    return apiRequest<ApiInstructorRoundConfigResponse>(`/v1/instructor/rounds/${round_id}/popups`, { method: 'POST', body });
  },

  /**
   * POST /start — the handler binds the same dto.ConfigRequest as /config and merges it
   * before activating (handler/instructor.go:151-183), so the profile can ride along with
   * the start call. It must: StartRound validates the stored profile unconditionally and
   * returns 409 CONFLICT if none was ever configured (usecase/instructor.go:239-245).
   */
  start(
    round_id: RoundId,
    body: {
      customer_budget?: number;
      batch_size: number;
      market_price: number;
      cost_of_publishing: number;
      ideal_profile?: Record<string, string>;
    },
  ): Promise<void> {
    return apiRequest<void>(`/v1/instructor/rounds/${round_id}/start`, { method: 'POST', body });
  },

  end(round_id: RoundId): Promise<void> {
    return apiRequest<void>(`/v1/instructor/rounds/${round_id}/end`, { method: 'POST' });
  },

  reset(): Promise<{ status?: string; message?: string }> {
    return apiRequest<{ status?: string; message?: string }>(`/v1/admin/reset`, { method: 'POST', body: {} });
  },
};


