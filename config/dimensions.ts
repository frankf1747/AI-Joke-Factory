/* ============================================================================
   The 12-dimension joke rubric.

   This module is a direct mirror of the Go backend's scoring package:
     jokefactory_be/src/core/domain/scoring/{dimensions,fit,length}.go
   and of the classifier sandbox that the instructor uses to explore it.

   Keep it in lockstep with that package. If the two ever disagree, the Go code
   wins — it is what actually decides whether a joke sells.

   Ids are the backend's enum values (UPPER_SNAKE) so they can be sent straight
   back in an `ideal_profile` payload with no translation.
============================================================================ */

export type ScoringType = 'ordinal' | 'categorical' | 'graded';

/** The classifier's escape hatch when a joke fits no listed category. */
export const CATCH_ALL = 'None of the above';

export interface DimensionSpec {
  /** Backend enum value, e.g. 'HUMOR_STYLE'. */
  id: string;
  label: string;
  scoring: ScoringType;
  /** Ordered — ordinal adjacency is defined by this order. */
  categories: string[];
  /** False only for Title Fit, which is graded against itself. */
  hasIdeal: boolean;
  classifiedBy: 'code' | 'llm';
  /** The instructor's default pick, matching the sandbox. */
  defaultIdeal?: string;
}

export const DIMENSIONS: DimensionSpec[] = [
  {
    id: 'LENGTH', label: 'Length', scoring: 'ordinal', classifiedBy: 'code',
    categories: ['Short', 'Medium', 'Long'],
    hasIdeal: true, defaultIdeal: 'Medium',
  },
  {
    id: 'TOPIC', label: 'Topic', scoring: 'categorical', classifiedBy: 'llm',
    categories: [
      'Work', 'Relationships', 'Family', 'Food', 'Technology',
      'Animals', 'School', 'Money', 'Travel', 'Health',
      'Sports', 'Politics', 'Everyday', 'Language', 'Other',
    ],
    hasIdeal: true, defaultIdeal: 'Work',
  },
  {
    id: 'HUMOR_STYLE', label: 'Humor Style', scoring: 'categorical', classifiedBy: 'llm',
    categories: [
      'Pun', 'Observational', 'Irony', 'Absurdity', 'Exaggeration',
      'Self-deprecating', 'Anti-joke', 'Callback', CATCH_ALL,
    ],
    hasIdeal: true, defaultIdeal: 'Observational',
  },
  {
    id: 'COMPLEXITY', label: 'Complexity', scoring: 'ordinal', classifiedBy: 'llm',
    categories: ['Very simple', 'Simple', 'Moderate', 'Thoughtful', 'Expert'],
    hasIdeal: true, defaultIdeal: 'Moderate',
  },
  {
    id: 'EDGINESS', label: 'Edginess', scoring: 'categorical', classifiedBy: 'llm',
    categories: ['Clean', 'Slightly edgy', CATCH_ALL],
    hasIdeal: true, defaultIdeal: 'Clean',
  },
  {
    id: 'STRUCTURE', label: 'Structure', scoring: 'categorical', classifiedBy: 'llm',
    categories: [
      'One-liner', 'Setup–punchline', 'Question–answer', 'Short story',
      'Dialogue/conversation', 'List/build-up', CATCH_ALL,
    ],
    hasIdeal: true, defaultIdeal: 'Setup–punchline',
  },
  {
    id: 'WORDPLAY', label: 'Wordplay', scoring: 'ordinal', classifiedBy: 'llm',
    categories: ['None', 'Light', 'Moderate', 'Heavy'],
    hasIdeal: true, defaultIdeal: 'Light',
  },
  {
    id: 'FRESHNESS', label: 'Freshness', scoring: 'ordinal', classifiedBy: 'llm',
    categories: ['Timeless', 'Slightly current', 'Current', 'Very topical', 'Time-sensitive'],
    hasIdeal: true, defaultIdeal: 'Timeless',
  },
  {
    id: 'SETUP_PAYOFF', label: 'Setup→Payoff', scoring: 'ordinal', classifiedBy: 'llm',
    categories: ['Immediate', 'Quick', 'Balanced', 'Long', 'Very long build'],
    hasIdeal: true, defaultIdeal: 'Balanced',
  },
  {
    id: 'CLARITY', label: 'Clarity', scoring: 'ordinal', classifiedBy: 'llm',
    categories: ['Crystal clear', 'Mostly clear', 'Slightly ambiguous', 'Ambiguous', 'Reinterpretation'],
    hasIdeal: true, defaultIdeal: 'Crystal clear',
  },
  {
    id: 'ENERGY', label: 'Energy', scoring: 'ordinal', classifiedBy: 'llm',
    categories: ['Deadpan', 'Low', 'Conversational', 'Animated', 'High-energy', CATCH_ALL],
    hasIdeal: true, defaultIdeal: 'Conversational',
  },
  {
    id: 'TITLE_FIT', label: 'Title Fit', scoring: 'graded', classifiedBy: 'llm',
    categories: ['Perfect', 'Strong', 'Moderate', 'Weak', 'Mismatch'],
    hasIdeal: false,
  },
];

/** Every dimension contributes to true_fit, so the ceiling is 12. */
export const MAX_FIT = DIMENSIONS.length;

/** The 11 the instructor picks an ideal for. Title Fit is graded intrinsically. */
export const IDEAL_DIMENSIONS: DimensionSpec[] = DIMENSIONS.filter(d => d.hasIdeal);

const byId = new Map(DIMENSIONS.map(d => [d.id, d]));

export function dimById(id: string): DimensionSpec | undefined {
  return byId.get(id);
}

/** Position of `category` in a dimension's ordered list, or -1 if unknown. */
export function categoryIndex(dimId: string, category: string): number {
  return byId.get(dimId)?.categories.indexOf(category) ?? -1;
}

export function isCatchAll(category: string): boolean {
  return category === CATCH_ALL;
}

/** The sandbox's starting profile — a sensible default for any picker. */
export const DEFAULT_IDEAL_PROFILE: Record<string, string> = Object.fromEntries(
  IDEAL_DIMENSIONS.map(d => [d.id, d.defaultIdeal ?? d.categories[0]]),
);

/** Title Fit's intrinsic grade → score map (backend: titleFitGrades). */
export const TITLE_FIT_GRADES: Record<string, number> = {
  Perfect: 1,
  Strong: 0.75,
  Moderate: 0.5,
  Weak: 0.25,
  Mismatch: 0,
};

/**
 * Per-dimension fit in [0, 1], matching scoring.DimFit in the Go backend.
 *
 *   ordinal     → 1 exact, 0.5 one step away, 0 beyond. A cliff, not a ramp:
 *                 two steps off is worth exactly as much as being wrong.
 *   categorical → 1 on an exact match, else 0.
 *   graded      → Title Fit's own scale; the ideal is ignored.
 *
 * The catch-all short-circuits ordinal adjacency: "None of the above" is not
 * near anything, so it only ever matches itself.
 *
 * Unknown dimensions, unknown categories and empty strings score 0 rather than
 * throwing — a mis-classified joke should cost points, not crash the page.
 */
export function dimFit(dimId: string, ideal: string, joke: string): number {
  const spec = byId.get(dimId);
  if (!spec) return 0;

  switch (spec.scoring) {
    case 'graded':
      return gradedFit(joke);
    case 'categorical':
      return categoricalFit(ideal, joke);
    case 'ordinal':
      return ordinalFit(spec, ideal, joke);
    default:
      return 0;
  }
}

/** Title Fit grades itself — there is no ideal to compare against. */
function gradedFit(joke: string): number {
  return TITLE_FIT_GRADES[joke] ?? 0;
}

function categoricalFit(ideal: string, joke: string): number {
  if (!joke || !ideal) return 0;
  return joke === ideal ? 1 : 0;
}

function ordinalFit(spec: DimensionSpec, ideal: string, joke: string): number {
  if (!joke || !ideal) return 0;

  // "None of the above" is not near anything — it only matches itself.
  if (isCatchAll(joke) || isCatchAll(ideal)) {
    return joke === ideal ? 1 : 0;
  }

  const ji = spec.categories.indexOf(joke);
  const ii = spec.categories.indexOf(ideal);
  if (ji < 0 || ii < 0) return 0;

  const gap = Math.abs(ji - ii);
  if (gap === 0) return 1;
  if (gap === 1) return 0.5;
  return 0;
}

/* ---- Length: the one dimension the code classifies, not the LLM ----------
   Mirrors scoring/length.go. The backend never sends Length to the model, so
   the frontend can compute it locally and show it live as the writer types. */

export const LENGTH_SHORT_MAX = 15;   // Short:  ≤ 15 words
export const LENGTH_MEDIUM_MAX = 40;  // Medium: 16–40 words; Long: 41+

/* Go's isWhitespace recognises exactly these six. JavaScript's \s is wider —
   it also matches U+00A0 and friends — so splitting on \s would count
   "one two" as two words where the backend counts one. Text pasted from
   Google Docs or a chat window is full of non-breaking spaces, so this is a
   real divergence near the Short/Medium boundary, not a theoretical one. */
const GO_WHITESPACE = /[ \t\n\r\v\f]+/;

/** Whitespace-separated token count, matching scoring.WordCount exactly. */
export function wordCount(text: string): number {
  return text.split(GO_WHITESPACE).filter(token => token !== '').length;
}

export function classifyLength(text: string): 'Short' | 'Medium' | 'Long' {
  const n = wordCount(text);
  if (n <= LENGTH_SHORT_MAX) return 'Short';
  if (n <= LENGTH_MEDIUM_MAX) return 'Medium';
  return 'Long';
}

/** A joke's classified category per dimension, keyed by dimension id. */
export type Classification = Record<string, string>;
/** The instructor's hidden ideal, keyed by dimension id. No TITLE_FIT. */
export type IdealProfile = Record<string, string>;

/**
 * Sum of dim_fit across all 12 dimensions — the number the market buys on.
 * Range [0, 12]. Rounded to 2dp so a run of 0.5s doesn't drift in float.
 * Mirrors scoring.TrueFit.
 */
export function trueFit(classification: Classification, profile: IdealProfile): number {
  let sum = 0;
  for (const dim of DIMENSIONS) {
    sum += dimFit(dim.id, profile[dim.id] ?? '', classification[dim.id] ?? '');
  }
  return Math.round(sum * 100) / 100;
}
