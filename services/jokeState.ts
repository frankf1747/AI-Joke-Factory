import type { Batch, Joke } from '../types';
import { fmtDuration } from './format';

export type JokeState = 'with-marketing' | 'selling' | 'lost-buyers' | 'no-buyer' | 'not-released';

const buyersOf = (j: Joke): number => Number(j.sold_count ?? 0);

/** V2 renamed RATED to PROCESSED; the mock still says RATED. Both mean Marketing has finished. */
const isProcessed = (b: Batch): boolean => b.status === 'PROCESSED' || b.status === 'RATED';

/** A published joke, split by whether anyone holds it now and whether anyone ever did. */
function marketState(j: Joke): JokeState {
  if (buyersOf(j) > 0) return 'selling';
  return j.first_sold_at ? 'lost-buyers' : 'no-buyer';
}

/**
 * The state of one joke, from `publish_status`, `sold_count` and `first_sold_at`.
 * The legacy mock has no `publish_status`: there the state comes from `is_published`,
 * and a joke in a batch that is not processed yet counts as with Marketing (pass the batch).
 */
export function jokeState(j: Joke, batch?: Batch): JokeState {
  switch (j.publish_status) {
    case 'PENDING': return 'with-marketing';
    case 'DISCARDED': return 'not-released';
    case 'PUBLISHED': return marketState(j);
  }
  if (batch && !isProcessed(batch)) return 'with-marketing';
  return j.is_published ? marketState(j) : 'not-released';
}

/** The text at a joke card's top right. `now` is epoch milliseconds. */
export function jokeDetail(j: Joke, now: number, batch?: Batch): string {
  switch (jokeState(j, batch)) {
    case 'with-marketing': return 'With Marketing';
    case 'selling': return buyersOf(j) === 1 ? '1 buyer' : `${buyersOf(j)} buyers`;
    case 'lost-buyers': return 'Sold before, swapped out';
    case 'no-buyer': {
      const since = j.published_at ? Date.parse(j.published_at) : NaN;
      return Number.isNaN(since)
        ? 'No buyer yet'
        : `No buyer yet, on market ${fmtDuration((now - since) / 1000)}`;
    }
    case 'not-released': return 'Not released by Marketing';
  }
}

/** The line on a batch row: "With Marketing", "4 on market, 12 buyers" or "None released". */
export function batchSummary(b: Batch): string {
  if (!isProcessed(b)) return 'With Marketing';
  const onMarket = b.jokes.filter((j) => {
    const s = jokeState(j, b);
    return s === 'selling' || s === 'lost-buyers' || s === 'no-buyer';
  });
  if (onMarket.length === 0) return 'None released';
  const buyers = onMarket.reduce((sum, j) => sum + buyersOf(j), 0);
  const tail = buyers === 0 ? 'no buyers yet' : buyers === 1 ? '1 buyer' : `${buyers} buyers`;
  return `${onMarket.length} on market, ${tail}`;
}

/** Jokes by stage across all batches. Jokes still with Marketing are counted elsewhere. */
export function stageCounts(
  batches: Batch[],
): { selling: number; lostBuyers: number; noBuyer: number; notReleased: number } {
  const counts = { selling: 0, lostBuyers: 0, noBuyer: 0, notReleased: 0 };
  for (const b of batches) {
    for (const j of b.jokes) {
      switch (jokeState(j, b)) {
        case 'selling': counts.selling++; break;
        case 'lost-buyers': counts.lostBuyers++; break;
        case 'no-buyer': counts.noBuyer++; break;
        case 'not-released': counts.notReleased++; break;
      }
    }
  }
  return counts;
}
