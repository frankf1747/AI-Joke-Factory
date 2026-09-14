import { apiRequest } from './apiClient';
import type {
  ApiQcQueueCountResponse,
  ApiQcQueueNextResponse,
  ApiQcSubmitRatingsRequest,
  ApiQcSubmitRatingsResponse,
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
 * The fifth call, `submitRatings`, is on its way out. V2 deleted the rating
 * model outright (no `joke_ratings` table, no `avg_score`, no `/ratings` route),
 * and an explicit per-joke `publish` replaces it in the very next commit. It
 * survives here ONLY so this commit compiles — see the note on the method.
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

  /** TEMPORARY HOLDOVER — deleted in the next commit, along with context's
   *  `rateBatch`, once `publish` lands.
   *
   *  Deliberately still on the OLD `/v1/qc` prefix: unlike the four calls above,
   *  this one was not merely renamed. The real backend has no ratings route
   *  under EITHER prefix, so there is no correct URL to point it at; the only
   *  thing that still answers it is the in-browser mock. Keeping the old path
   *  makes that honest rather than advertising a `/v1/marketing` route the
   *  server would 404. Do not build anything new on this. */
  submitRatings(batch_id: BatchId, body: ApiQcSubmitRatingsRequest): Promise<ApiQcSubmitRatingsResponse> {
    return apiRequest<ApiQcSubmitRatingsResponse>(`/v1/qc/batches/${batch_id}/ratings`, { method: 'POST', body });
  },
};
