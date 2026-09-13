// 12-dimension joke rubric (the professor's joke universe).
// Each dim has an ordered list of levels. CATEGORICAL_DIMS have no inherent
// order (match-or-not); the rest are ordinal (distance-based scoring).
// See REFACTOR_PLAN.md §1–§2 for the authoritative backend spec.

export interface DimensionDef {
  id: string;
  label: string;
  levels: string[];
}

export const DIMENSIONS: DimensionDef[] = [
  { id: 'length',       label: 'Length',       levels: ['Short', 'Medium', 'Long'] },
  { id: 'topic',        label: 'Topic',        levels: ['Workplace', 'MBA Life', 'Tech', 'AI', 'Animals', 'Sports', 'Everyday', 'Social media', 'Education', 'Random'] },
  { id: 'humor_style',  label: 'Humor Style',  levels: ['Pun', 'Observational', 'Irony', 'Absurdity', 'Exaggeration', 'Self-deprecating', 'Anti-joke', 'Callback'] },
  { id: 'complexity',   label: 'Complexity',   levels: ['Very simple', 'Simple', 'Moderate', 'Thoughtful', 'Expert'] },
  { id: 'edginess',     label: 'Edginess',     levels: ['Clean', 'Slightly edgy'] },
  { id: 'structure',    label: 'Structure',    levels: ['One-liner', 'Setup-punchline', 'Q&A', 'Short story', 'Dialogue', 'List'] },
  { id: 'wordplay',     label: 'Wordplay',     levels: ['None', 'Light', 'Moderate', 'Heavy'] },
  { id: 'freshness',    label: 'Freshness',    levels: ['Timeless', 'Slightly current', 'Current', 'Very topical', 'Time-sensitive'] },
  { id: 'setup_payoff', label: 'Setup→Payoff', levels: ['Immediate', 'Quick', 'Balanced', 'Long', 'Very long build'] },
  { id: 'clarity',      label: 'Clarity',      levels: ['Crystal clear', 'Mostly clear', 'Slightly ambiguous', 'Ambiguous', 'Reinterpretation'] },
  { id: 'energy',       label: 'Energy',       levels: ['Deadpan', 'Low', 'Conversational', 'Animated', 'High-energy'] },
  // 12th dim. Levels run best → worst: how well Marketing's title suits the joke.
  { id: 'title_fit',    label: 'Title Fit',    levels: ['Perfect', 'Strong', 'Moderate', 'Weak', 'Mismatch'] },
];

/** Dimensions with no inherent order — shown as a match/off check, not a scale. */
export const CATEGORICAL_DIMS = new Set<string>(['topic', 'humor_style', 'structure']);

/**
 * Intrinsic dims are graded on their own scale and are NEVER compared to the
 * instructor's ideal — they measure execution, not taste. Title Fit is the only
 * one: it asks "does Marketing's title match this joke?", which has no ideal.
 */
export const INTRINSIC_DIMS = new Set<string>(['title_fit']);

/**
 * Defined-but-unscored placeholders (REFACTOR_PLAN §2.3). Structure has no agreed
 * categories yet, so it contributes 0 and is excluded from scoring and feedback —
 * otherwise it would read as a permanent failure on every joke.
 */
export const PLACEHOLDER_DIMS = new Set<string>(['structure']);

/** The dims that actually contribute to true_fit: 11 of 12 → true_fit ∈ [0, 11]. */
export const SCORED_DIMENSIONS: DimensionDef[] = DIMENSIONS.filter(
  d => !PLACEHOLDER_DIMS.has(d.id),
);

const byId = new Map(DIMENSIONS.map(d => [d.id, d]));
export function dimById(id: string): DimensionDef | undefined {
  return byId.get(id);
}

/** Hidden ideal joke profile (instructor-set in production; default for Phase 1 mock). */
export const IDEAL_PROFILE: Record<string, string> = {
  length: 'Short',
  topic: 'Workplace',
  humor_style: 'Pun',
  complexity: 'Simple',
  edginess: 'Clean',
  structure: 'Setup-punchline',
  wordplay: 'Heavy',
  freshness: 'Timeless',
  setup_payoff: 'Quick',
  clarity: 'Crystal clear',
  energy: 'Conversational',
  // Intrinsic: the "ideal" is simply a title that fits its joke perfectly.
  title_fit: 'Perfect',
};

/**
 * Proximity of a joke's level on a dim to the ideal level on that dim.
 * 1.0 = exact match, 0 = furthest apart.
 * Categorical dims: 1 if exact else 0.
 * Ordinal dims: 1 - |levelIdx - idealIdx| / (levels.length - 1)
 */
export function dimProx(dim: DimensionDef, level: string): number {
  const lv = dim.levels.indexOf(level);
  if (lv < 0) return 0;
  // Intrinsic dims grade on their own best→worst scale, with no ideal lookup:
  // Perfect 1 · Strong 0.75 · Moderate 0.5 · Weak 0.25 · Mismatch 0.
  if (INTRINSIC_DIMS.has(dim.id)) {
    return 1 - lv / Math.max(1, dim.levels.length - 1);
  }
  const il = dim.levels.indexOf(IDEAL_PROFILE[dim.id]);
  if (il < 0) return 0;
  if (CATEGORICAL_DIMS.has(dim.id)) return lv === il ? 1 : 0;
  return 1 - Math.abs(lv - il) / Math.max(1, dim.levels.length - 1);
}
