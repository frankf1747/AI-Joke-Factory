import { apiRequest } from './apiClient';
import type {
  ApiActiveRoundResponse,
  ApiSessionJoinRequest,
  ApiSessionJoinResponse,
  ApiSessionMeResponse,
} from '../types';

export const sessionService = {
  join(body: ApiSessionJoinRequest): Promise<ApiSessionJoinResponse> {
    return apiRequest<ApiSessionJoinResponse>('/v1/session/join', { method: 'POST', body });
  },

  me(): Promise<ApiSessionMeResponse> {
    return apiRequest<ApiSessionMeResponse>('/v1/session/me', { method: 'GET' });
  },

  activeRound(): Promise<ApiActiveRoundResponse> {
    return apiRequest<ApiActiveRoundResponse>('/v1/rounds/active', { method: 'GET' });
  },
};


