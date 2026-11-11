/* ============================ Team customer feedback ============================
   GET /v1/rounds/{rid}/teams/{tid}/feedback, mapped for rendering.

   Only Marketing's screen (views/QualityControl.tsx) renders it; the Joke
   Maker no longer loads it (context.tsx TEAM_FEEDBACK_ROLES). The payload is
   scoped to the TEAM, not to a batch or a seat — the backend returns the
   team's latest `feedback_joke_count` published jokes
   (core/usecase/feedback.go:38-74).

   Marketing's panel used to invent its own data: it scored each joke against
   config/dimensions' DEFAULT_IDEAL_PROFILE — the frontend's hardcoded default,
   NOT the round's real ideal, which the instructor configures and the scoring
   engine actually uses — then picked three dimensions from a hash of the joke
   id and drew a proximity bar. Two bugs in one: the numbers were fiction, and a
   graded distance-to-ideal reveal leaks more than the learning design allows.
   Teams are meant to reverse-engineer the hidden ideal from partial feedback;
   a per-dimension "how far off" bar would let them solve the profile without
   ever selling a joke.

   So the backend sends dimension IDS ONLY — no numbers, no categories, no ideal
   levels — and this mapper keeps it that way. A dimension either passed or
   needs work. Nothing here may carry a score. The one extra: for a missed
   dimension on an ordered scale the backend may send a direction (LOWER or
   HIGHER), shown as a word such as "shorter". It says which way to move, never
   how far, so teams close in on the ideal over several batches.

   Pure and JSX-free so the mapping is testable without React
   (views/feedback.test.ts). */

import { dimById } from '../config/dimensions';
import type { TeamFeedbackResponse } from '../types/api';

export interface FeedbackDim {
  /** The backend enum id, e.g. 'HUMOR_STYLE'. */
  id: string;
  /** Display label from the dimension catalog, falling back to the raw id so a
      dimension added upstream renders as itself rather than vanishing. */
  label: string;
  /** Missed dimensions on an ordered scale: which way to move, as a word
      ("shorter", "simpler"). Absent when there is no direction to give. */
  direction?: string;
}

/** The word for each direction on each ordered scale. LOWER = toward the
    first category of the scale (core/domain/scoring/dimensions.go). */
export const DIRECTION_WORDS: Record<string, { LOWER: string; HIGHER: string }> = {
  LENGTH: { LOWER: 'shorter', HIGHER: 'longer' },
  COMPLEXITY: { LOWER: 'simpler', HIGHER: 'more complex' },
  WORDPLAY: { LOWER: 'less wordplay', HIGHER: 'more wordplay' },
  FRESHNESS: { LOWER: 'more timeless', HIGHER: 'more topical' },
  SETUP_PAYOFF: { LOWER: 'quicker payoff', HIGHER: 'longer build-up' },
  CLARITY: { LOWER: 'clearer', HIGHER: 'less obvious' },
  ENERGY: { LOWER: 'calmer', HIGHER: 'more energy' },
};

/** "Length: shorter", or just the label when there is no direction. */
export const dimWithDirection = (d: FeedbackDim): string => (d.direction ? `${d.label}: ${d.direction}` : d.label);

export interface FeedbackRow {
  joke_id: number;
  joke_title: string;
  was_bought: boolean;
  good: FeedbackDim[];
  improve: FeedbackDim[];
}

export function toFeedbackRows(payload: TeamFeedbackResponse | null | undefined): FeedbackRow[] {
  const toDims = (ids: readonly string[] | null | undefined): FeedbackDim[] =>
    (ids ?? []).map(id => ({ id, label: dimById(id)?.label ?? id }));
  return (payload?.jokes ?? []).map(j => ({
    joke_id: j.joke_id,
    joke_title: j.joke_title,
    was_bought: j.was_bought,
    good: toDims(j.good_dimensions),
    improve: toDims(j.improve_dimensions).map(d => {
      const hint = (j.improve_hints as Record<string, string> | undefined)?.[d.id];
      const words = DIRECTION_WORDS[d.id];
      const direction = hint === 'LOWER' || hint === 'HIGHER' ? words?.[hint] : undefined;
      return direction ? { ...d, direction } : d;
    }),
  }));
}
