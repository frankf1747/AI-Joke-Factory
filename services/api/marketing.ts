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
   *  The rules, all re-verified live against the running backend:
   *
   *    1. A decision is required for EVERY joke in the batch. A partial list is
   *       rejected with VALIDATION_ERROR field=jokes, "expected N joke
   *       decisions"; an empty array with "at least one joke decision required".
   *    2. A published joke needs a non-empty title; a discarded one does not.
   *    3. An all-discard batch is rejected with VALIDATION_ERROR field=jokes,
   *       message "NO_JOKE_PUBLISHED" — but ONLY IN ROUND 1.
   *
   *  CORRECTION: an earlier version of this comment said the all-discard
   *  rejection was unconditional and that "a 'publish nothing' flow is NOT
   *  supported by this backend". That is wrong. The check is round-gated —
   *  `requireAtLeastOnePublished` in
   *  infra/repo/postgres/marketing_repo.go:299-301, mirrored at
   *  core/usecase/testutil/memstore.go:610-612 — and the asymmetry is
   *  deliberate: round 1 asks Marketing to prioritise a full batch, while round 2
   *  may hand them a single weak joke they must be able to pass on. Both halves
   *  are pinned by TestPublishRequiresAtLeastOnePublishedInRound1 and
   *  TestPublishAllowsAllDiscardInRound2 (core/usecase/marketing_test.go).
   *  Round 2 all-discard returns 200 with published.count 0.
   *
   *  A rejected publish leaves the batch SUBMITTED: the whole operation runs
   *  inside one WithTx and aborts before markBatchProcessed, so it stays claimed
   *  by this marketer from the earlier queueNext and the call can simply be
   *  retried with a valid decision set. */
  publish(batchId: number, body: PublishRequest) {
    return apiRequest<PublishResponse>(`/v1/marketing/batches/${batchId}/publish`, { method: 'POST', body });
  },
};
