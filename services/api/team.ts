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

  /** Dimension NAMES only — never categories, never numbers.
   *
   *  REQUIRES AN `X-User-Id` HEADER. Without it the handler short-circuits
   *  before any work with 400 BAD_REQUEST "missing X-User-Id header"
   *  (handler/feedback.go:24 -> handler/session.go:101-106); verified live
   *  2026-09-13. In the browser this is invisible — apiClient's
   *  getUserIdHeader() supplies it from localStorage — but it is a trap for any
   *  Node-side caller with no localStorage, including a future extension of
   *  scripts/smoke-api.ts. Same for market() below, and for submitBatch() /
   *  batches() (handler/batch.go:23, :58); summary() is the one team route that
   *  does not need it. */
  feedback(roundId: number, teamId: number) {
    return apiRequest<TeamFeedbackResponse>(`/v1/rounds/${roundId}/teams/${teamId}/feedback`);
  },

  /** Read-only. AI customers do the buying; there is no buy/return endpoint.
   *
   *  REQUIRES AN `X-User-Id` HEADER — 400 BAD_REQUEST "missing X-User-Id
   *  header" without it (handler/customer.go:25 -> handler/session.go:101-106),
   *  verified live 2026-09-13. See feedback() above.
   *
   *  This is also the ONLY endpoint with a real sold_count. The same joke reads
   *  0 in batches() and its true sales figure here — see the notes on
   *  MarketItem.sold_count and TeamBatchJoke.sold_count in types/api.ts. */
  market(roundId: number) {
    return apiRequest<MarketResponse>(`/v1/rounds/${roundId}/market`);
  },
};
