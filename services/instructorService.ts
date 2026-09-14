import { apiRequest } from './apiClient';
import type {
  ApiInstructorLobbyResponse,
  ApiInstructorStatsResponse,
  ApiInstructorDeleteUserResponse,
  ApiInstructorLoginRequest,
  ApiInstructorLoginResponse,
  ApiInstructorRoundConfigResponse,
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

  autoAssign(round_id: RoundId, body: { customer_count: number; team_count: number }): Promise<void> {
    return apiRequest<void>(`/v1/instructor/rounds/${round_id}/assign`, { method: 'POST', body });
  },

  patchUser(
    round_id: RoundId,
    user_id: UserId,
    body: { status?: 'WAITING' | 'ASSIGNED'; role?: PatchUserRole; team_id?: TeamId | null },
  ): Promise<void> {
    return apiRequest<void>(`/v1/instructor/rounds/${round_id}/users/${user_id}`, { method: 'PATCH', body });
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
    },
  ): Promise<ApiInstructorRoundConfigResponse> {
    return apiRequest<ApiInstructorRoundConfigResponse>(`/v1/instructor/rounds/${round_id}/config`, { method: 'POST', body });
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
      customer_budget: number;
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


