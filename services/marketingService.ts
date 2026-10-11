import { apiRequest, ApiError } from './apiClient';
import type {
  ApiQcQueueCountResponse,
  ApiQcQueueNextResponse,
  ApiSplitBatchRequest,
  BatchId,
  RoundId,
} from '../types';

/**
 * Longest note Marketing may send with a batch. The backend counts runes after
 * trimming (usecase.MaxMarketingNoteRunes); the textarea's maxLength counts
 * UTF-16 code units, which are never fewer than runes, so the box can never
 * hold a note the backend would reject for length.
 */
export const MARKETING_NOTE_MAX = 500;

/** The body of POST /v1/marketing/batches/{id}/publish (dto.PublishRequest). */
export interface PublishBody {
  jokes: Array<{ joke_id: number; joke_title: string; is_published: boolean }>;
  /** Marketing's note to the Joke Maker. Left off when blank, so a publish
   *  without a note is exactly what it was before notes existed. */
  note?: string;
}

/**
 * Builds the publish body from the claimed batch. The backend requires a
 * decision for EVERY joke in the batch, not just the published ones (a partial
 * list is rejected), so it is built from the batch contents. A published joke
 * carries its trimmed title; a discarded one sends ''. The note is sent as
 * typed when it has any non-blank text (the backend trims it).
 */
export function buildPublishBody(
  jokes: ReadonlyArray<{ joke_id: number | string }>,
  publishedIds: ReadonlyArray<number>,
  jokeTitles: Readonly<Record<string, string>>,
  note: string,
): PublishBody {
  const published = new Set(publishedIds.map(Number));
  const body: PublishBody = {
    jokes: jokes.map(j => {
      const id = Number(j.joke_id);
      const isPublished = published.has(id);
      return {
        joke_id: id,
        joke_title: isPublished ? (jokeTitles[String(id)] ?? '').trim() : '',
        is_published: isPublished,
      };
    }),
  };
  if (note.trim() !== '') body.note = note;
  return body;
}

/** A batch's marketing_note as the UI keeps it: the text, or null when absent, null or blank. */
export function toMarketingNote(raw: unknown): string | null {
  return typeof raw === 'string' && raw.trim() !== '' ? raw : null;
}

/** The alert Marketing sees when a publish fails. The batch stays claimed and
 *  the desk keeps its decisions and note, so the user can fix and retry. */
export function publishFailureMessage(e: unknown): string {
  if (e instanceof ApiError) {
    // A note over the limit: show the server's own message ("must be at most 500 characters").
    if (e.field === 'note') {
      return `Your note to the Joke Maker was not sent: ${e.message}. Shorten it and release again.`;
    }
    // NO_JOKE_PUBLISHED arrives as a 400 VALIDATION_ERROR whose *message* is the
    // sentinel (field: 'jokes'). Round 1 only — round 2 accepts an all-discard
    // batch by design, so this alert should never fire there.
    if (e.message === 'NO_JOKE_PUBLISHED') return 'Round 1 requires at least one joke to be published.';
    if (e.status === 409 && e.code === 'ROUND_NOT_ACTIVE') {
      return 'Round is not active. Please wait for the instructor to start.';
    }
    // V2 renamed these two: BATCH_ALREADY_RATED -> BATCH_ALREADY_PROCESSED and
    // NOT_ASSIGNED_TO_THIS_QC -> NOT_ASSIGNED_TO_THIS_MARKETER.
    if (e.status === 409 && e.code === 'BATCH_ALREADY_PROCESSED') return 'This batch was already processed.';
    if (e.status === 403 && e.code === 'NOT_ASSIGNED_TO_THIS_MARKETER') return 'You are not assigned to this batch.';
  }
  return 'Failed to publish the batch. Please try again.';
}

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

  /** One decision per joke in the batch, plus Marketing's optional note. A
   *  published joke needs a non-empty title. Round 1 rejects an all-discard
   *  batch with 400 NO_JOKE_PUBLISHED; round 2 allows it. A note over 500
   *  characters is 400 VALIDATION_ERROR field "note". Build the body with
   *  buildPublishBody. */
  publish(batch_id: BatchId, body: PublishBody): Promise<unknown> {
    return apiRequest<unknown>(`/v1/marketing/batches/${batch_id}/publish`, { method: 'POST', body });
  },
};
