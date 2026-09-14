import { apiRequest } from '../apiClient';
import type {
  MarketingQueueNextResponse, MarketingQueueCountResponse,
  PublishRequest, PublishResponse,
} from '../../types/api';

export const marketingApi = {
  /** Claims AND locks the next submitted batch for this marketer's team.
   *  `batch` is null when the queue is empty. Locks expire after 15 minutes
   *  (infra/repo/postgres/marketing_repo.go:53).
   *
   *  round_id travels in the QUERY STRING, not the path — the handler reads
   *  c.Query("round_id") (handler/marketing.go:29). */
  queueNext(roundId: number) {
    return apiRequest<MarketingQueueNextResponse>(`/v1/marketing/queue/next?round_id=${roundId}`);
  },

  /** round_id in the query string here too. handler/marketing.go:125 */
  queueCount(roundId: number) {
    return apiRequest<MarketingQueueCountResponse>(`/v1/marketing/queue/count?round_id=${roundId}`);
  },

  /** One decision per joke. Publishing is final for the batch.
   *
   *  CORRECTED: the backend DOES require at least one PUBLISHED joke. An
   *  earlier draft of this module claimed it validated only "at least one
   *  joke decision" — that is just the first of two checks:
   *
   *    1. usecase/marketing.go:81-82 rejects an empty `jokes` array with
   *       VALIDATION_ERROR field=jokes, "at least one joke decision required".
   *    2. The store then rejects an all-discard batch with VALIDATION_ERROR
   *       field=jokes, message "NO_JOKE_PUBLISHED" — enforced in
   *       infra/repo/postgres/marketing_repo.go:198-200, mirrored in the
   *       in-memory store at core/usecase/testutil/memstore.go:474-475, and
   *       locked in by core/usecase/marketing_test.go:145-153.
   *
   *  Both surface as HTTP 400. So a "publish nothing" flow is NOT supported
   *  by this backend: any caller that lets Marketing discard every joke in a
   *  batch must handle the 400, or forbid the all-discard selection in the UI.
   *  A rejected publish leaves the batch SUBMITTED: the whole operation runs
   *  inside one WithTx (infra/repo/postgres/marketing_repo.go:83) and aborts
   *  before markBatchProcessed, so it stays claimed by this marketer from the
   *  earlier queueNext and the call can simply be retried with a valid
   *  decision set. */
  publish(batchId: number, body: PublishRequest) {
    return apiRequest<PublishResponse>(`/v1/marketing/batches/${batchId}/publish`, { method: 'POST', body });
  },
};
