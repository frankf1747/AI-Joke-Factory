/* The live bots' jokes with the grades the production AI grader gave them,
   so a "Uses feedback" bot team knows its own jokes' traits on the live site
   the way a writer knows what they wrote.

   The jokes are the 60 hand-written variedCorpus jokes every live bot already
   draws from. graded-jokes.json holds what the live grader (grok-4-1-fast-
   reasoning, 2026-11-16) said about each on the 10 criteria it grades; Length
   comes from the word count, as the backend computes it. In a check that day,
   the grader gave the same category to the same joke 82% of the time across
   two gradings, and an average joke matched 4.9 of the default ideal's 10 graded
   criteria (the best 8), so there is room to learn. A joke whose grade is a
   catch-all ("Other") is left out: a note can never steer toward or away from it.

   It is never the ideal and never a fit score: the bot still learns only from
   Marketing's notes. */
import { IDEAL_DIMENSIONS, classifyLength, isCatchAll } from '../../config/dimensions';
import { variedCorpus } from '../shared/jokes';
import { TRAIT_CORPUS_VERSION, parseTraitCorpus, type TraitCorpus, type Traits } from '../shared/traitCorpus';
import graded from './graded-jokes.json';

const GRADES = graded.jokes as Record<string, Record<string, string>>;

function traitsOf(id: string, text: string): Traits | null {
  const grade = GRADES[id];
  if (!grade) return null;
  const traits: Record<string, string> = {};
  for (const d of IDEAL_DIMENSIONS) {
    const cat = d.id === 'LENGTH' ? classifyLength(text) : grade[d.id];
    if (typeof cat !== 'string' || !d.categories.includes(cat) || isCatchAll(cat)) return null;
    traits[d.id] = cat;
  }
  return traits as Traits;
}

/** The graded live jokes as a trait corpus (the shape the feedback loop reads). */
export const GRADED_JOKES: TraitCorpus = parseTraitCorpus({
  version: TRAIT_CORPUS_VERSION,
  seed: `graded-varied-${graded.graded_on}`,
  jokes: variedCorpus.flatMap(j => {
    const traits = traitsOf(j.id, j.text);
    return traits ? [{ id: j.id, title: j.title, text: j.text, traits }] : [];
  }),
});
