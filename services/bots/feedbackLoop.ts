// services/bots/feedbackLoop.ts
/**
 * Bots that use feedback (docs/superpowers/specs/2026-11-10-two-costs-feedback-bots-design.md §4).
 *
 * Pure, so the engine and the tests share it:
 *   - Marketing turns the team's customer feedback (the endpoint and fields its
 *     screen reads: landed, missed, direction hints) into a plain-words note,
 *     one line per joke, named by its title:
 *       On "Office Memo No. 3": Keep: Topic, Length. Change: Humor Style, Energy. Energy: calmer.
 *   - The Joke Maker parses every unread note of its team, oldest first (so the
 *     newest evidence wins), and updates its picture of what customers want
 *     (a Belief): a landed criterion keeps that joke's
 *     category; a missed categorical one (or an ordered one without a
 *     direction) avoids it; a missed ordered one with a direction moves one
 *     step that way from the joke's category; criteria nobody mentioned stay.
 *   - Its next batch is the trait-corpus jokes that best match the belief,
 *     ties broken by the team's seeded order, never a joke already used this
 *     round. With an empty belief that is exactly the seeded order, which is
 *     how a feedback-off twin always picks.
 *
 * A bot knows its own jokes' traits (by title, from the trait corpus) and
 * nothing else: never the ideal, never a fit score.
 */
import { DIMENSIONS, IDEAL_DIMENSIONS, dimById, isCatchAll, type IdealDimension } from '../../config/dimensions';
import { DIRECTION_WORDS } from '../../views/feedback';
import type { FeedbackJoke } from '../../types/api';
import type { TraitJoke, Traits } from '../shared/traitCorpus';

/** The backend refuses a publish note over 500 characters (runes). */
export const NOTE_MAX = 500;

export type Direction = 'LOWER' | 'HIGHER';

/** One joke's line in a note. */
export interface NoteEntry {
  title: string;
  /** Dimension ids that landed. */
  landed: string[];
  /** Dimension ids that missed, with the direction when the note gives one. */
  missed: Array<{ dim: string; direction?: Direction }>;
}

const labelOf = (id: string): string => dimById(id)?.label ?? id;
const byLabel = new Map(DIMENSIONS.map(d => [d.label, d.id as string]));

/** The note line for one joke: `On "<title>": Keep: A, B. Change: C. C: shorter.` */
export function noteLine(e: NoteEntry): string {
  const parts: string[] = [];
  if (e.landed.length) parts.push(`Keep: ${e.landed.map(labelOf).join(', ')}.`);
  if (e.missed.length) parts.push(`Change: ${e.missed.map(m => labelOf(m.dim)).join(', ')}.`);
  for (const m of e.missed) {
    const word = m.direction ? DIRECTION_WORDS[m.dim]?.[m.direction] : undefined;
    if (word) parts.push(`${labelOf(m.dim)}: ${word}.`);
  }
  return `On "${e.title}": ${parts.join(' ')}`;
}

/**
 * Marketing's note from its team's feedback: one line per joke that has been
 * scored (it has landed or missed criteria) and is not in `reported`, newest
 * first as the feedback lists them, kept under NOTE_MAX. Returns the note ("" when
 * there is nothing new) and the joke ids it reported.
 */
export function composeNote(
  jokes: readonly FeedbackJoke[], reported: ReadonlySet<number>,
): { note: string; reported: number[] } {
  const lines: string[] = [];
  const ids: number[] = [];
  for (const j of jokes) {
    if (reported.has(j.joke_id) || j.good_dimensions.length + j.improve_dimensions.length === 0) continue;
    const hints = (j.improve_hints ?? {}) as Partial<Record<string, string>>;
    const line = noteLine({
      title: j.joke_title,
      landed: [...j.good_dimensions],
      missed: j.improve_dimensions.map(dim => {
        const h = hints[dim];
        return h === 'LOWER' || h === 'HIGHER' ? { dim, direction: h } : { dim };
      }),
    });
    if (Array.from([...lines, line].join('\n')).length > NOTE_MAX) break;
    lines.push(line);
    ids.push(j.joke_id);
  }
  return { note: lines.join('\n'), reported: ids };
}

const LINE = /^On "(.+)": (.*)$/;

/** The entries of a note, one per `On "<title>": …` line; anything else is ignored. */
export function parseNote(note: string | null | undefined): NoteEntry[] {
  const out: NoteEntry[] = [];
  for (const raw of (note ?? '').split('\n')) {
    const m = LINE.exec(raw.trim());
    if (!m) continue;
    const entry: NoteEntry = { title: m[1], landed: [], missed: [] };
    const directions = new Map<string, Direction>();
    for (const sentence of m[2].split(/\.(?:\s+|$)/).map(s => s.trim()).filter(Boolean)) {
      const colon = sentence.indexOf(': ');
      if (colon < 0) continue;
      const head = sentence.slice(0, colon);
      const tail = sentence.slice(colon + 2);
      if (head === 'Keep' || head === 'Change') {
        const ids = tail.split(', ').map(l => byLabel.get(l)).filter((id): id is string => id != null);
        if (head === 'Keep') entry.landed.push(...ids);
        else entry.missed.push(...ids.map(dim => ({ dim })));
        continue;
      }
      const dim = byLabel.get(head);
      const words = dim ? DIRECTION_WORDS[dim] : undefined;
      if (dim && words) {
        if (words.LOWER === tail) directions.set(dim, 'LOWER');
        else if (words.HIGHER === tail) directions.set(dim, 'HIGHER');
      }
    }
    entry.missed = entry.missed.map(x => (directions.has(x.dim) ? { ...x, direction: directions.get(x.dim) } : x));
    out.push(entry);
  }
  return out;
}

/** The Joke Maker's picture of what customers want, per matched criterion. */
export interface Belief {
  /** The category it aims for. */
  want: Partial<Record<IdealDimension, string>>;
  /** Categories it has seen miss. */
  avoid: Partial<Record<IdealDimension, string[]>>;
}

export const emptyBelief = (): Belief => ({ want: {}, avoid: {} });

const IDEAL_IDS = new Set<string>(IDEAL_DIMENSIONS.map(d => d.id));

/** The category one step from `cat` on dim's ordered scale, never the catch-all; `cat` itself at an end. */
function step(dim: IdealDimension, cat: string, direction: Direction): string {
  const scale = (dimById(dim)?.categories ?? []).filter(c => !isCatchAll(c));
  const i = scale.indexOf(cat);
  if (i < 0) return cat;
  return scale[Math.max(0, Math.min(scale.length - 1, i + (direction === 'LOWER' ? -1 : 1)))];
}

/** The belief after one joke's feedback, given that joke's traits. Title Fit is ignored (it has no ideal). */
export function applyFeedback(belief: Belief, traits: Traits, entry: NoteEntry): Belief {
  const want = { ...belief.want };
  const avoid: Belief['avoid'] = { ...belief.avoid };
  for (const id of entry.landed) {
    if (!IDEAL_IDS.has(id)) continue;
    const dim = id as IdealDimension;
    want[dim] = traits[dim];
    const left = (avoid[dim] ?? []).filter(c => c !== traits[dim]);
    if (left.length > 0) avoid[dim] = left;
    else delete avoid[dim];
  }
  for (const { dim: id, direction } of entry.missed) {
    if (!IDEAL_IDS.has(id)) continue;
    const dim = id as IdealDimension;
    const cat = traits[dim];
    avoid[dim] = [...new Set([...(avoid[dim] ?? []), cat])];
    const ordered = dimById(dim)?.scoring === 'ordinal';
    if (ordered && direction) want[dim] = step(dim, cat, direction);
    else if (want[dim] === cat) delete want[dim];
  }
  return { want, avoid };
}

/** How well a joke matches the belief: +1 per wanted category, +0.5 for one step off on an ordered scale, −1 per avoided one. */
export function beliefScore(belief: Belief, traits: Traits): number {
  let score = 0;
  for (const d of IDEAL_DIMENSIONS) {
    const dim = d.id as IdealDimension;
    const cat = traits[dim];
    const want = belief.want[dim];
    if (want !== undefined) {
      if (cat === want) score += 1;
      else if (d.scoring === 'ordinal' && Math.abs(d.categories.indexOf(cat) - d.categories.indexOf(want)) === 1) score += 0.5;
    }
    if (belief.avoid[dim]?.includes(cat)) score -= 1;
  }
  return score;
}

/** How many criteria the belief aims at (for the reasoning log). */
export const beliefSize = (b: Belief): number => Object.keys(b.want).length;

/** A seeded shuffle of the corpus ids: the order a team falls back on (and a feedback-off team always uses). */
export function seededOrder(corpus: readonly TraitJoke[], rand: () => number): string[] {
  const ids = corpus.map(j => j.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const k = Math.floor(rand() * (i + 1));
    [ids[i], ids[k]] = [ids[k], ids[i]];
  }
  return ids;
}

/**
 * The next batch: the `size` unused corpus jokes that best match the belief,
 * ties in `order`. Throws when the corpus has fewer unused jokes than `size`.
 */
export function pickBatch(
  corpus: readonly TraitJoke[], order: readonly string[], belief: Belief, used: ReadonlySet<string>, size: number,
): TraitJoke[] {
  const byId = new Map(corpus.map(j => [j.id, j]));
  const candidates = order.filter(id => !used.has(id)).map(id => byId.get(id) as TraitJoke);
  if (candidates.length < size) throw new RangeError(`only ${candidates.length} unused corpus jokes for a batch of ${size}`);
  const rank = new Map(order.map((id, i) => [id, i]));
  return candidates
    .map(j => ({ j, score: beliefScore(belief, j.traits) }))
    .sort((a, b) => b.score - a.score || (rank.get(a.j.id) as number) - (rank.get(b.j.id) as number))
    .slice(0, size)
    .map(x => x.j);
}
