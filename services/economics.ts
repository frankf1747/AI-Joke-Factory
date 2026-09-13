// Pure economics + force-release helpers shared by the mock and (eventually) FE views.

export interface CostRates {
  marketPrice: number;
  costOfPublishing: number;
  costOfDiscard: number;
}

export interface Counts {
  created: number;
  published: number;
  sold: number;
}

/**
 * Marketing-only cost model: Joke Makers create for free, so they are never
 * discouraged from producing. Every cost lands on Marketing's decisions —
 * publishing a joke, or throwing one away.
 *
 *   discarded = created - published
 *   profit    = sold*price - published*publish - discarded*discard
 */
export function computeProfit(counts: Counts, rates: CostRates): number {
  const discarded = Math.max(0, counts.created - counts.published);
  return (
    counts.sold * rates.marketPrice -
    counts.published * rates.costOfPublishing -
    discarded * rates.costOfDiscard
  );
}

export interface RatedJoke {
  joke_id: number;
  rating: number;
}

export interface PublishOptions {
  /**
   * Let a batch reach the market with nothing published. Round 2 batches can be
   * a single joke, so Marketing must be able to reject the lot; Round 1 leaves
   * this off and keeps the safety net below.
   */
  allowEmpty?: boolean;
}

/**
 * Force-release rule: publish all 5-rated jokes; if none scored 5, publish the
 * single highest-rated joke (ties broken by lowest joke_id), so a Round 1 batch
 * can never reach the market empty.
 *
 * With `allowEmpty`, that fallback stands down and an all-rejected batch
 * publishes nothing — the jokes are discarded and charged as waste.
 */
export function selectPublishedJokeIds(
  jokes: RatedJoke[],
  opts: PublishOptions = {},
): number[] {
  if (jokes.length === 0) return [];
  const fives = jokes.filter(j => j.rating === 5).map(j => j.joke_id);
  if (fives.length > 0) return fives;
  if (opts.allowEmpty) return [];
  const best = [...jokes].sort((a, b) => b.rating - a.rating || a.joke_id - b.joke_id)[0];
  return [best.joke_id];
}

/**
 * Whole seconds between two ISO timestamps, clamped at 0 so a clock skew can't
 * report negative elapsed time. Returns null if either end is missing or
 * unparseable — i.e. the event hasn't happened yet.
 */
export function computeLeadTimeSeconds(
  submittedAt: string | undefined | null,
  firstSoldAt: string | undefined | null,
): number | null {
  if (!submittedAt || !firstSoldAt) return null;
  const t0 = Date.parse(submittedAt);
  const t1 = Date.parse(firstSoldAt);
  if (!Number.isFinite(t0) || !Number.isFinite(t1)) return null;
  return Math.max(0, Math.round((t1 - t0) / 1000));
}

/** The two timestamps a batch needs for the created-to-publish measure. */
export interface BatchTimes {
  submitted_at?: string | null;
  rated_at?: string | null;
}

/**
 * Created → Publish: the average seconds a team's batches spend between the
 * Joke Maker submitting them and Marketing releasing them.
 *
 * This replaces the old created-to-first-sale lead time. That number mixed in
 * whether customers happened to want the joke, which the team cannot control;
 * this one measures only how fast their own pipeline moves.
 *
 * Batches with no `rated_at` are still in the backlog and have no publish event
 * yet, so they're excluded rather than counted as zero. Returns null when no
 * batch has been released.
 */
export function computeAvgCreatedToPublishSeconds(batches: BatchTimes[]): number | null {
  const spans: number[] = [];
  for (const b of batches) {
    const t = computeLeadTimeSeconds(b.submitted_at, b.rated_at);
    if (t != null) spans.push(t);
  }
  if (spans.length === 0) return null;
  return Math.round(spans.reduce((a, c) => a + c, 0) / spans.length);
}
