import { apiRequest } from '../apiClient';
import type {
  BatchSubmitRequest, BatchSubmitResponse, TeamBatchesResponse,
  TeamSummaryResponse, TeamFeedbackResponse, MarketResponse,
} from '../../types/api';

export const teamApi = {
  /** Jokes are plain strings — titling is Marketing's job. dto/models.go:11 */
  submitBatch(roundId: number, body: BatchSubmitRequest) {
    return apiRequest<BatchSubmitResponse>(`/v1/rounds/${roundId}/batches`, { method: 'POST', body });
  },

  batches(roundId: number, teamId: number) {
    return apiRequest<TeamBatchesResponse>(`/v1/rounds/${roundId}/teams/${teamId}/batches`);
  },

  summary(roundId: number, teamId: number) {
    return apiRequest<TeamSummaryResponse>(`/v1/rounds/${roundId}/teams/${teamId}/summary`);
  },

  /** Dimension NAMES only — never categories, never numbers. */
  feedback(roundId: number, teamId: number) {
    return apiRequest<TeamFeedbackResponse>(`/v1/rounds/${roundId}/teams/${teamId}/feedback`);
  },

  /** Read-only. AI customers do the buying; there is no buy/return endpoint. */
  market(roundId: number) {
    return apiRequest<MarketResponse>(`/v1/rounds/${roundId}/market`);
  },
};
