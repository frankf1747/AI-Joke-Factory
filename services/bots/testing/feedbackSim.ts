// services/bots/testing/feedbackSim.ts
/**
 * The backend's customer feedback for one joke, for the fake backend and the
 * learning tests: a port of jokefactory_be core/usecase/feedback.go
 * (SelectFeedbackDimensionsFrom from FeedbackStart, DirectionHint). Pass =
 * dim_fit ≥ 0.75; up to 2 landed and 3 missed, backfilled to 5, walking the 12
 * dimensions from joke id mod 12; a missed ordered dimension says LOWER or
 * HIGHER.
 */
import { DIMENSIONS, dimFit, isCatchAll, type Classification, type IdealProfile } from '../../../config/dimensions';
import type { FeedbackJoke } from '../../../types/api';

export const FEEDBACK_PASS = 0.75;

export function directionHint(dim: string, ideal: string, joke: string): 'LOWER' | 'HIGHER' | undefined {
  const spec = DIMENSIONS.find(d => d.id === dim);
  if (!spec || spec.scoring !== 'ordinal' || !ideal || !joke || isCatchAll(ideal) || isCatchAll(joke)) return undefined;
  const ii = spec.categories.indexOf(ideal);
  const ji = spec.categories.indexOf(joke);
  if (ii < 0 || ji < 0 || ii === ji) return undefined;
  return ji > ii ? 'LOWER' : 'HIGHER';
}

export function simulateFeedback(
  jokeId: number, classification: Classification, ideal: IdealProfile,
): Pick<FeedbackJoke, 'good_dimensions' | 'improve_dimensions' | 'improve_hints'> {
  const n = DIMENSIONS.length;
  const start = ((jokeId % n) + n) % n;
  const pass: string[] = [];
  const fail: string[] = [];
  for (let k = 0; k < n; k++) {
    const d = DIMENSIONS[(start + k) % n];
    const fit = dimFit(d.id, d.hasIdeal ? ideal[d.id] ?? '' : '', classification[d.id] ?? '');
    (fit >= FEEDBACK_PASS ? pass : fail).push(d.id);
  }
  const improve = fail.slice(0, 3);
  const good = pass.slice(0, 2);
  let fi = improve.length;
  let pi = good.length;
  while (improve.length + good.length < 5) {
    if (fi < fail.length) improve.push(fail[fi++]);
    else if (pi < pass.length) good.push(pass[pi++]);
    else break;
  }
  const hints: Record<string, 'LOWER' | 'HIGHER'> = {};
  for (const dim of improve) {
    const h = directionHint(dim, ideal[dim] ?? '', classification[dim] ?? '');
    if (h) hints[dim] = h;
  }
  return {
    good_dimensions: good as FeedbackJoke['good_dimensions'],
    improve_dimensions: improve as FeedbackJoke['improve_dimensions'],
    improve_hints: hints,
  };
}
