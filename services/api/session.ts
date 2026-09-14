import { apiRequest } from '../apiClient';
import type {
  SessionJoinRequest, SessionJoinResponse, SessionMeResponse,
  InstructorLoginRequest, InstructorLoginResponse, RoundsActiveResponse,
} from '../../types/api';

export const sessionApi = {
  /** RAW — no data envelope. handler/session.go:39 */
  join(body: SessionJoinRequest) {
    return apiRequest<SessionJoinResponse>('/v1/session/join', { method: 'POST', body });
  },

  /** RAW. Poll this on the waiting screen to detect assignment. handler/session.go:87 */
  me() {
    return apiRequest<SessionMeResponse>('/v1/session/me');
  },

  /** RAW. handler/admin.go:41 */
  instructorLogin(body: InstructorLoginRequest) {
    return apiRequest<InstructorLoginResponse>('/v1/instructor/login', { method: 'POST', body });
  },

  /** Student-safe projection — the engine knobs and ideal profile are stripped. */
  activeRounds() {
    return apiRequest<RoundsActiveResponse>('/v1/rounds/active');
  },
};
