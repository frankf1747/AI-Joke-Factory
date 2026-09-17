/* ============================ Team customer feedback ============================
   GET /v1/rounds/{rid}/teams/{tid}/feedback, mapped for rendering.

   This lives outside any view because BOTH team seats read it: Marketing
   (views/QualityControl.tsx) and the Joke Maker (views/JokeMaker.tsx). The
   payload is scoped to the TEAM, not to a batch or a seat — the backend returns
   the team's latest `feedback_joke_count` published jokes
   (core/usecase/feedback.go:38-74) and its handler accepts exactly the two team
   roles — so the two screens are looking at the same rows and must agree on
   what they mean.

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
   levels (core/usecase/feedback.go:18-26, :78-81) — and this mapper keeps it
   that way. A dimension either passed or needs work. Nothing here may carry a
   score.

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
}

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
    improve: toDims(j.improve_dimensions),
  }));
}
