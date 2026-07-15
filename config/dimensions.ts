// 11-dimension joke rubric (the professor's joke universe).
// Each dim has an ordered list of levels. CATEGORICAL_DIMS have no inherent
// order (match-or-not); the rest are ordinal (distance-based scoring).

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
];

/** Dimensions with no inherent order — shown as a match/off check, not a scale. */
export const CATEGORICAL_DIMS = new Set<string>(['topic', 'humor_style', 'structure']);

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
};

/**
 * Proximity of a joke's level on a dim to the ideal level on that dim.
 * 1.0 = exact match, 0 = furthest apart.
 * Categorical dims: 1 if exact else 0.
 * Ordinal dims: 1 - |levelIdx - idealIdx| / (levels.length - 1)
 */
export function dimProx(dim: DimensionDef, level: string): number {
  const lv = dim.levels.indexOf(level);
  const il = dim.levels.indexOf(IDEAL_PROFILE[dim.id]);
  if (lv < 0 || il < 0) return 0;
  if (CATEGORICAL_DIMS.has(dim.id)) return lv === il ? 1 : 0;
  return 1 - Math.abs(lv - il) / Math.max(1, dim.levels.length - 1);
}
