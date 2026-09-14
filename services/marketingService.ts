import { apiRequest } from './apiClient';
import type {
  ApiQcQueueCountResponse,
  ApiQcQueueNextResponse,
  ApiSplitBatchRequest,
  BatchId,
  RoundId,
} from '../types';

/**
 * Marketing API client — formerly `qcService`.
 *
 * The backend's V2 refactor renamed the route prefix `/v1/qc` → `/v1/marketing`.
 * Four of the five calls that used to live here needed nothing but that prefix
 * change: `queueNext`, `queueCount`, `splitBatch` and `unsplitBatch` are
 * otherwise byte-for-byte what `qcService` sent.
 *
 * Split and unsplit were dropped during that V2 refactor and RESTORED in phase
 * 3B, so both routes exist again under the new prefix. An older audit that told
 * us to delete these two calls is out of date — do not remove them.
 *
 * The fifth call, `submitRatings`, is gone. V2 deleted the rating model outright
 * — no `joke_ratings` table, no `avg_score`, no `/ratings` route under either
 * prefix — so `publish` replaces it with an explicit per-joke decision.
 */
export const marketingService = {
  queueNext(round_id: RoundId): Promise<ApiQcQueueNextResponse> {
    const q = encodeURIComponent(String(round_id));
    return apiRequest<ApiQcQueueNextResponse>(`/v1/marketing/queue/next?round_id=${q}`, { method: 'GET' });
  },

  queueCount(round_id: RoundId): Promise<ApiQcQueueCountResponse> {
    const q = encodeURIComponent(String(round_id));
    return apiRequest<ApiQcQueueCountResponse>(`/v1/marketing/queue/count?round_id=${q}`, { method: 'GET' });
  },

  splitBatch(batch_id: BatchId, body: ApiSplitBatchRequest): Promise<ApiQcQueueNextResponse> {
    return apiRequest<ApiQcQueueNextResponse>(`/v1/marketing/batches/${batch_id}/split`, { method: 'POST', body });
  },

  unsplitBatch(batch_id: BatchId): Promise<ApiQcQueueNextResponse> {
    return apiRequest<ApiQcQueueNextResponse>(`/v1/marketing/batches/${batch_id}/unsplit`, { method: 'POST' });
  },

  /** One decision per joke in the batch. A published joke needs a non-empty title.
   *  Round 1 rejects an all-discard batch with 400 NO_JOKE_PUBLISHED; round 2 allows it. */
  publish(batch_id: BatchId, body: {
    jokes: Array<{ joke_id: number; joke_title: string; is_published: boolean }>;
  }): Promise<unknown> {
    return apiRequest<unknown>(`/v1/marketing/batches/${batch_id}/publish`, { method: 'POST', body });
  },
};
