// Pure economics + force-release helpers shared by the mock and (eventually) FE views.

export interface CostRates {
  marketPrice: number;
  costOfCreation: number;
  costOfPublishing: number;
}

export interface Counts {
  created: number;
  published: number;
  sold: number;
}

/**
 * Two-cost profit model:
 *   profit = sold*price - created*creation - published*publish
 */
export function computeProfit(counts: Counts, rates: CostRates): number {
  return (
    counts.sold * rates.marketPrice -
    counts.created * rates.costOfCreation -
    counts.published * rates.costOfPublishing
  );
}

export interface RatedJoke {
  joke_id: number;
  rating: number;
}

/**
 * Force-release rule: publish all 5-rated jokes; if none scored 5, publish the
 * single highest-rated joke (ties broken by lowest joke_id). Never returns empty
 * for a non-empty batch.
 */
export function selectPublishedJokeIds(jokes: RatedJoke[]): number[] {
  if (jokes.length === 0) return [];
  const fives = jokes.filter(j => j.rating === 5).map(j => j.joke_id);
  if (fives.length > 0) return fives;
  const best = [...jokes].sort((a, b) => b.rating - a.rating || a.joke_id - b.joke_id)[0];
  return [best.joke_id];
}

/**
 * Lead time = seconds between joke "created" (batch submitted_at) and the joke's
 * first sale (first purchase_events.created_at). Returns null if not yet sold.
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
