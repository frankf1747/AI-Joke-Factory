/**
 * E2E joke corpora.
 *
 * Two deliberately contrasting sets of jokes plus the plumbing an end-to-end
 * run needs to get them through the real pipeline:
 *
 *   Joke Maker pastes a blob  →  Marketing cuts it into jokes, adds a Topic and
 *   a Title  →  publish  →  the AI Customer classifies each joke on the 12
 *   dimensions and buys when true_fit ≥ the round's buy threshold (default 7).
 *
 *   - `variedCorpus` (60 jokes) is spread deliberately across the 12 dimensions
 *     of `config/dimensions.ts`, so the fit scores it produces should spread
 *     widely: some clearly sell, some clearly don't, plenty in between.
 *   - `blandControl` (10 jokes) is the opposite by design — see the SET B block
 *     below before you touch a single word of it.
 *
 * SOURCES THIS FILE IS PINNED TO (read these before editing):
 *   - `config/dimensions.ts`                     — the 12 dimensions, their
 *     ordered categories, dim_fit and true_fit. Mirrors the Go backend.
 *   - `jokefactory_be/src/core/domain/scoring/`  — `dimensions.go`, `fit.go`,
 *     `length.go`: the authority the frontend mirror answers to.
 *   - `jokefactory_be/src/infra/llm/prompt.go`   — what actually reaches the
 *     model: the joke TEXT and the Marketing-entered TITLE, nothing else.
 *   - `jokefactory_be/src/infra/llm/stub_classifier.go` — the fallback the
 *     control set exists to detect.
 *
 * NO SIDE EFFECTS ON IMPORT. Everything below is a frozen literal or a pure
 * function; the lookup index is built lazily on first use.
 */

import type { Dimension } from '../../../config/dimensions';
import { classifyLength, dimById } from '../../../config/dimensions';
import { splitJokes } from '../../../services/jokeSplit';

/* ============================================================================
   THE BLOB SEPARATOR: A BLANK LINE ("\n\n")
   ============================================================================

   `asRawBlob` joins with '\n\n' and nothing else. Three independent consumers
   agree on that, which is why it is safe:

   1. `services/jokeSplit.ts` — the programmatic splitter. Its fallback ladder
      is: trust line-start `1. / 2. / 3.` markers ONLY when they run 1,2,3,… in
      order; otherwise split on a blank line (`/\n[ \t]*\n/`); otherwise split
      on single newlines. Our jokes carry no leading markers, so a blob always
      lands on the blank-line rung and round-trips exactly.

   2. `views/QualityControl.tsx` (`SplitStage`) — what a human marketer and a UI
      driving e2e test actually use. It is offset-based and lossless: the text
      is read-only and Marketing inserts cuts at the caret. A blank line makes
      each joke its own visible paragraph, so the cut points are unambiguous on
      screen. Leading/trailing whitespace in a segment is harmless —
      `MarketingService.Split` runs `strings.TrimSpace` on every piece and drops
      the empties (`src/core/usecase/marketing.go`).

   3. The backend's own canonical re-join. The Go side never tokenizes a blob —
      `Split` receives an already-cut `jokes []string` — but when it has to
      rebuild one it uses a blank line and only a blank line:
        `string_agg(joke_text, E'\n\n' ORDER BY joke_id)`
        (src/infra/repo/postgres/marketing_repo.go:139)
      and `marketing_unsplit_test.go` pins the result as
        `"alpha\n\nbeta\n\ngamma"`.

   CONSEQUENCES FOR ANYONE ADDING A JOKE (`assertFixtureIntegrity` enforces all
   of these, so run it rather than trusting your eye):

   - A joke must never contain a blank line. Multi-paragraph jokes would be cut
     into pieces by rung 2 and could not survive the backend's re-join either.
     Keep each joke on one line.
   - A joke must not START with `1.` / `1)` / `-` / `*` / `•`. The splitter
     treats those as cut markers and strips them, and a run of them flips the
     whole blob onto the numbered rung.
   - Keep `**` and `__` out of the text: the splitter strips markdown emphasis
     before parsing, so they would silently vanish from the published joke.
   - A blob must clear 20 characters after trimming (`minRawTextChars`,
     src/core/usecase/batch.go) — trivially true for any real batch.
   - Round 1 rejects a split that is not EXACTLY `round.batch_size` jokes;
     round 2+ rejects more than `batch_size`. `DEFAULT_PER_TEAM` below is 5 to
     match the standard round-1 batch size.
============================================================================ */

/** The separator `asRawBlob` writes and every consumer above agrees on. */
export const BLOB_SEPARATOR = '\n\n';

/* ============================================================================
   SET B IS A SCIENTIFIC INSTRUMENT — DO NOT "IMPROVE" IT
   ============================================================================

   `blandControl` is ten jokes that are as close to interchangeable as ten
   grammatical jokes can be: identical structure, identical register, identical
   topic (Work), identical word count, one swapped noun apiece, no wordplay.

   That flatness is the measurement, not an oversight.

   WHAT IT MEASURES. `StubClassifier` (src/infra/llm/stub_classifier.go) is the
   offline fallback. For any joke with no `Fixed` override it returns the FIRST
   non-catch-all category of every LLM dimension — the same eleven categories
   for every joke ever submitted:

     TOPIC "Work" · HUMOR_STYLE "Pun" · COMPLEXITY "Very simple" ·
     EDGINESS "Clean" · STRUCTURE "One-liner" · WORDPLAY "None" ·
     FRESHNESS "Timeless" · SETUP_PAYOFF "Immediate" · CLARITY "Crystal clear" ·
     ENERGY "Deadpan" · TITLE_FIT "Perfect"

   LENGTH is the one dimension the stub does not touch (it is computed in code
   by `scoring.ClassifyLength`), so under the stub a joke's fit is a constant
   plus a length term — nothing about the joke's actual content can move it.
   Against `DEFAULT_IDEAL_PROFILE` that constant works out to 5.5, so every
   joke scores 6.5 (Medium) or 6.0 (Short/Long) and NOTHING EVER SELLS at the
   default threshold of 7. `STUB_CLASSIFICATION` below is exported so a test can
   recompute this for any profile instead of hard-coding those numbers.

   THE READING:
     A spreads, B clusters  → the real LLM classifier is running. Expected.
     A and B are both flat  → production is silently on StubClassifier (or the
                              Azure call is failing open). This is the bug the
                              control exists to catch.
     B spreads              → the control has been edited, or the classifier is
                              returning noise. Fix the fixture before trusting
                              any other conclusion from the run.

   A control only works by being boring. Every increment of variety you add to
   set B — a better punchline, a different topic, a joke that is ten words
   longer — moves B's variance toward A's and destroys the ability to tell the
   second reading from the first. If these jokes look repetitive and dull to
   you, they are working. Add your good joke to `variedCorpus` instead; that set
   wants it.
============================================================================ */

/** Exactly what `StubClassifier` returns for every joke, keyed by dimension id.
 *  LENGTH is absent because the stub never classifies it — the backend computes
 *  it in code from the word count. A test can feed this to `trueFit` alongside
 *  the round's real ideal profile to derive the stub's fingerprint fit values
 *  rather than hard-coding them. */
export const STUB_CLASSIFICATION: Readonly<Record<Exclude<Dimension, 'LENGTH'>, string>> =
  Object.freeze({
    TOPIC: 'Work',
    HUMOR_STYLE: 'Pun',
    COMPLEXITY: 'Very simple',
    EDGINESS: 'Clean',
    STRUCTURE: 'One-liner',
    WORDPLAY: 'None',
    FRESHNESS: 'Timeless',
    SETUP_PAYOFF: 'Immediate',
    CLARITY: 'Crystal clear',
    ENERGY: 'Deadpan',
    TITLE_FIT: 'Perfect',
  });

/* ---- Types ---------------------------------------------------------------- */

/** One of the 15 TOPIC categories in `config/dimensions.ts`. Marketing picks
 *  one per joke and the QC view refuses to publish without it. Kept as a
 *  literal union so a typo is a compile error; `assertFixtureIntegrity` pins
 *  the union against the real category list at runtime. */
export type TopicCategory =
  | 'Work'
  | 'Relationships'
  | 'Family'
  | 'Food'
  | 'Technology'
  | 'Animals'
  | 'School'
  | 'Money'
  | 'Travel'
  | 'Health'
  | 'Sports'
  | 'Politics'
  | 'Everyday'
  | 'Language'
  | 'Other';

export interface JokeFixture {
  /** Stable fixture id — `A01`…`A60` for the varied corpus, `B01`…`B10` for the
   *  control. Stable across edits so a failing run names a specific joke. */
  readonly id: string;
  /** The joke as a Joke Maker types it. One line, no blank lines, no leading
   *  list marker — see the separator block above. */
  readonly text: string;
  /** The Topic a marketer would pick. Must be a real TOPIC category. */
  readonly topic: TopicCategory;
  /** The Title a marketer would type. TITLE_FIT is graded intrinsically
   *  (Perfect=1 … Mismatch=0) on how well this matches the joke, so every title
   *  here is written to be genuinely apt — the spread in set A is meant to come
   *  from the 11 matched dimensions, not from sabotaged titles. */
  readonly title: string;
  /** Which axes of the rubric this joke is here to occupy. Documentation for
   *  the next person, and a map of the corpus's coverage. */
  readonly axis: string;
}

/** Anything the helpers accept: a fixture, or its raw text as it comes back out
 *  of the UI / API after a split. */
export type JokeRef = JokeFixture | string;

/* ============================================================================
   SET A — `variedCorpus`
   ============================================================================
   60 real jokes, deliberately scattered across the rubric:

     LENGTH        short one-liners … 40+ word stories
     TOPIC         all 15 categories represented
     HUMOR_STYLE   Pun, Observational, Irony, Absurdity, Exaggeration,
                   Self-deprecating, Anti-joke, Callback
     STRUCTURE     One-liner, Setup–punchline, Question–answer, Short story,
                   Dialogue/conversation, List/build-up
     COMPLEXITY    "Very simple" … "Thoughtful"
     WORDPLAY      None … Heavy
     FRESHNESS     Timeless … Current
     SETUP_PAYOFF  Immediate … Very long build
     CLARITY       Crystal clear … Reinterpretation
     ENERGY        Deadpan … High-energy
     EDGINESS      Clean throughout, a few Slightly edgy — all workplace-safe,
                   because these go on a classroom projector.

   The `axis` note on each joke says which corner it is holding down. If you
   remove a joke, check you are not removing the corpus's only Long, its only
   Dialogue, or its only Politics entry — the spread is the point.
============================================================================ */
export const variedCorpus: readonly JokeFixture[] = Object.freeze([
  /* --- short one-liners: Length Short, Structure One-liner --------------- */
  {
    id: 'A01',
    text: 'My password is the last eight digits of pi.',
    topic: 'Technology',
    title: 'Uncrackable',
    axis: 'Short · One-liner · Absurdity · Deadpan · needs a beat to land (Clarity slips)',
  },
  {
    id: 'A02',
    text: 'I ran three miles today. Then I remembered where I parked.',
    topic: 'Health',
    title: 'Cardio by Accident',
    axis: 'Short · Setup–punchline · Observational · Quick payoff · no wordplay',
  },
  {
    id: 'A03',
    text: 'I don’t trust stairs. They’re always up to something.',
    topic: 'Everyday',
    title: 'Step Suspicion',
    axis: 'Short · One-liner · Pun · Heavy wordplay · Immediate payoff',
  },
  {
    id: 'A04',
    text: 'My dog used to chase people on a bike. I had to take the bike away.',
    topic: 'Animals',
    title: 'Bike Ban',
    axis: 'Short · Setup–punchline · Pun · Reinterpretation (the whole joke is the re-parse)',
  },
  {
    id: 'A05',
    text: 'I’m on a seafood diet. I see food and I question my choices.',
    topic: 'Food',
    title: 'Seafood Diet, Revised',
    axis: 'Short · One-liner · Pun + Self-deprecating · Heavy wordplay',
  },
  {
    id: 'A06',
    text: 'Autocorrect is my ducking nemesis.',
    topic: 'Technology',
    title: 'Ducking Nemesis',
    axis: 'Shortest in the corpus · One-liner · Pun · Immediate · Very simple',
  },
  {
    id: 'A07',
    text: 'My ceiling fan is my biggest supporter. It has never once looked down on me.',
    topic: 'Everyday',
    title: 'Biggest Supporter',
    axis: 'Short · One-liner · Pun (double meaning twice over) · Moderate complexity',
  },
  {
    id: 'A08',
    text: 'I water my plants with the confidence of a man who has never kept one alive.',
    topic: 'Everyday',
    title: 'Optimistic Gardener',
    axis: 'Short · One-liner · Self-deprecating · No wordplay · Deadpan',
  },

  /* --- anti-jokes: the punchline deliberately refuses to arrive ---------- */
  {
    id: 'A09',
    text: 'Why did the chicken cross the road? Because the crosswalk signal changed and it was safe to proceed.',
    topic: 'Animals',
    title: 'Traffic Compliance',
    axis: 'Question–answer · Anti-joke · Deadpan · Crystal clear · No wordplay',
  },
  {
    id: 'A10',
    text: 'A horse walks into a bar. Several patrons leave, concerned about the lack of health code enforcement.',
    topic: 'Animals',
    title: 'Health Code Violation',
    axis: 'Setup–punchline · Anti-joke subverting a known form · Deadpan',
  },
  {
    id: 'A11',
    text: 'Knock knock. Who’s there? A courier with a package you have to sign for.',
    topic: 'Everyday',
    title: 'Signature Required',
    axis: 'Dialogue/conversation · Anti-joke · Immediate · Very simple',
  },
  {
    id: 'A12',
    text: 'I told my therapist about my fear of speed bumps. She said I would get over it. I have not; I still drive around them.',
    topic: 'Health',
    title: 'Getting Over It',
    axis: 'Medium · Short story · Pun then Anti-joke · Balanced payoff',
  },

  /* --- observational: the bread and butter of the rubric's default ideal -- */
  {
    id: 'A13',
    text: 'Every office has one microwave and a queue of people pretending they don’t mind waiting. The fish guy knows. The fish guy has always known.',
    topic: 'Work',
    title: 'The Fish Guy',
    axis: 'Medium · Observational · Thoughtful · Long build · Animated',
  },
  {
    id: 'A14',
    text: 'The meeting could have been an email. The email could have been a message. The message could have been nothing at all, which is what everyone wanted.',
    topic: 'Work',
    title: 'Could Have Been Nothing',
    axis: 'Medium · List/build-up · Observational + Irony · Long build',
  },
  {
    id: 'A15',
    text: 'There is a specific age where you stop looking at the price of avocados and start looking at the price of avocados very carefully.',
    topic: 'Money',
    title: 'Avocado Economics',
    axis: 'Medium · Observational · Thoughtful · Slightly ambiguous · No wordplay',
  },
  {
    id: 'A16',
    text: 'You never really own a gym membership. You rent a small monthly reminder of the person you meant to become.',
    topic: 'Health',
    title: 'Monthly Reminder',
    axis: 'Medium · Observational · Thoughtful · Low energy · zero wordplay',
  },
  {
    id: 'A17',
    text: 'The fastest way to find a bug in your code is to demonstrate it working to someone else.',
    topic: 'Technology',
    title: 'Demo Effect',
    axis: 'Short · Observational + Irony · Crystal clear · Conversational',
  },
  {
    id: 'A18',
    text: 'Airports are the only place where a cinnamon roll at six in the morning counts as a personal decision rather than a cry for help.',
    topic: 'Travel',
    title: 'Terminal Breakfast',
    axis: 'Medium · Observational · Thoughtful · Balanced · Animated',
  },
  {
    id: 'A19',
    text: 'Grocery self-checkout is the only job I have ever been promoted into without an interview.',
    topic: 'Everyday',
    title: 'Unpaid Promotion',
    axis: 'Short · Irony · Observational · Quick payoff',
  },
  {
    id: 'A20',
    text: 'My phone knows me better than my family does, mostly because my family has never once asked what I searched at two in the morning.',
    topic: 'Technology',
    title: 'Two A.M. Search History',
    axis: 'Medium · Observational + Self-deprecating · Slightly edgy · Balanced',
  },

  /* --- irony ------------------------------------------------------------- */
  {
    id: 'A21',
    text: 'I finally achieved work-life balance: I am equally bad at both.',
    topic: 'Work',
    title: 'Perfect Balance',
    axis: 'Short · Irony + Self-deprecating · Quick · Crystal clear',
  },
  {
    id: 'A22',
    text: 'The productivity app I bought to stop procrastinating has been sitting unopened for four months, which I consider a kind of consistency.',
    topic: 'Technology',
    title: 'Consistent, At Least',
    axis: 'Medium · Irony · Thoughtful · Long build · Deadpan',
  },
  {
    id: 'A23',
    text: 'Our team won an award for efficiency. The ceremony ran three hours.',
    topic: 'Work',
    title: 'Efficiency Award',
    axis: 'Short · Irony · Deadpan · Immediate · Very simple',
  },

  /* --- absurdity: the far end of the Humor Style axis --------------------- */
  {
    id: 'A24',
    text: 'I have started introducing my houseplants at parties. So far only the fern has made a good impression, and frankly it is carrying the rest of them.',
    topic: 'Everyday',
    title: 'The Fern Carries Us',
    axis: 'Medium · Absurdity · Animated · Long build · Slightly ambiguous',
  },
  {
    id: 'A25',
    text: 'My neighbour built a fence so tall that it now has its own weather system. On Tuesdays it drizzles on his side only, and on Thursdays a small cloud sits above the gate and refuses to move until someone acknowledges it.',
    topic: 'Everyday',
    title: 'The Fence Has Weather',
    axis: 'LONG (41+ words) · Absurdity + Exaggeration · Very long build · High-energy',
  },
  {
    id: 'A26',
    text: 'The moon landing was faked, but only the parking. They landed fine; getting the spot was the hard part.',
    topic: 'Other',
    title: 'Lunar Parking',
    axis: 'Medium · Absurdity · Slightly edgy · Reinterpretation · Deadpan',
  },
  {
    id: 'A27',
    text: 'I taught my cat to fetch, and now she brings me things I never threw, which I have decided not to investigate.',
    topic: 'Animals',
    title: 'Unthrown Objects',
    axis: 'Medium · Absurdity · Deadpan · Balanced · No wordplay',
  },
  {
    id: 'A28',
    text: 'Every time I open the fridge, the light judges me. I have started opening it in the dark to level the field.',
    topic: 'Food',
    title: 'Fridge Light Judgment',
    axis: 'Medium · Absurdity + Self-deprecating · Animated · Quick',
  },

  /* --- exaggeration ------------------------------------------------------ */
  {
    id: 'A29',
    text: 'My commute is so long that I have watched two coworkers get hired, promoted and married while I sat in the same left-turn lane.',
    topic: 'Travel',
    title: 'The Left-Turn Lane',
    axis: 'Medium · Exaggeration · Long build · High-energy · no wordplay',
  },
  {
    id: 'A30',
    text: 'The line at the DMV moved so slowly that I aged into a different bracket of the form I was holding.',
    topic: 'Everyday',
    title: 'Aging in Line',
    axis: 'Medium · Exaggeration · Thoughtful · Balanced · Slightly ambiguous',
  },
  {
    id: 'A31',
    text: 'My grandmother’s soup portions assume you have brought four friends, a thermos, and a plan for the winter.',
    topic: 'Family',
    title: 'Soup for the Winter',
    axis: 'Medium · Exaggeration · List/build-up · Animated',
  },
  {
    id: 'A32',
    text: 'I have so many browser tabs open that my laptop has started rationing electricity like a small nation in crisis.',
    topic: 'Technology',
    title: 'Tab Rationing',
    axis: 'Medium · Exaggeration · Animated · Quick · light wordplay',
  },

  /* --- self-deprecating -------------------------------------------------- */
  {
    id: 'A33',
    text: 'I am not saying I am bad at cooking, but my smoke alarm has a favourite recipe.',
    topic: 'Food',
    title: 'The Smoke Alarm’s Favourite',
    axis: 'Short · Self-deprecating · Quick · Crystal clear',
  },
  {
    id: 'A34',
    text: 'I went to the gym once in January. The staff still send me letters like an estranged relative.',
    topic: 'Health',
    title: 'Estranged from the Gym',
    axis: 'Short · Self-deprecating + Exaggeration · Slightly current (January)',
  },
  {
    id: 'A35',
    text: 'My résumé says “detail-oriented” in two different fonts.',
    topic: 'Work',
    title: 'Detail Oriented',
    axis: 'Short · Irony + Self-deprecating · Deadpan · Immediate · Expert compression',
  },
  {
    id: 'A36',
    text: 'I speak three languages: English, sarcasm, and a version of Spanish that only works on menus.',
    topic: 'Language',
    title: 'Menu Spanish',
    axis: 'Short · List/build-up · Self-deprecating · Conversational',
  },

  /* --- question–answer --------------------------------------------------- */
  {
    id: 'A37',
    text: 'What do you call a factory that makes okay products? A satisfactory.',
    topic: 'Work',
    title: 'Satisfactory',
    axis: 'Short · Question–answer · Pun · Heavy wordplay · Very simple',
  },
  {
    id: 'A38',
    text: 'Why don’t scientists trust atoms? Because they make up everything, and frankly so do scientists when the grant deadline is close.',
    topic: 'School',
    title: 'Atoms and Deadlines',
    axis: 'Medium · Question–answer · Pun extended into Irony · Slightly edgy',
  },
  {
    id: 'A39',
    text: 'Why did the developer go broke? He used up all his cache.',
    topic: 'Money',
    title: 'Out of Cache',
    axis: 'Short · Question–answer · Pun · Heavy wordplay · Immediate',
  },
  {
    id: 'A40',
    text: 'What did the ocean say to the shore? Nothing. It just waved, which is more than my neighbour does.',
    topic: 'Other',
    title: 'It Just Waved',
    axis: 'Short · Question–answer · Pun then Observational turn · Moderate',
  },
  {
    id: 'A41',
    text: 'Why do bees have sticky hair? Because they use honeycombs.',
    topic: 'Animals',
    title: 'Honeycombs',
    axis: 'Short · Question–answer · Pun · Very simple · the corpus floor for complexity',
  },

  /* --- short story: the long end of Length and Setup→Payoff -------------- */
  {
    id: 'A42',
    text: 'A man tells his doctor he broke his arm in two places. The doctor advises him to stop going to those places. He now only goes to one place, and he is much happier and slightly more bored.',
    topic: 'Health',
    title: 'Two Places',
    axis: 'Medium (high) · Short story · Pun extended into Callback · Very long build',
  },
  {
    id: 'A43',
    text: 'A woman walks into a hardware store and asks for a hammer that does not judge her. The clerk hands her a rubber mallet and says it is the closest thing they carry. She uses it on a shelf for six months. The shelf holds.',
    topic: 'Everyday',
    title: 'The Non-Judgmental Mallet',
    axis: 'LONG (41+ words) · Short story · Absurdity · Very long build · Ambiguous',
  },
  {
    id: 'A44',
    text: 'My uncle spent thirty years perfecting a recipe for chili he never wrote down. At the funeral we tried to reconstruct it from memory and ended up inventing four new chilis, none of which were his, all of which he would have hated.',
    topic: 'Family',
    title: 'Four New Chilis',
    axis: 'LONG (41+ words) · Short story · Irony · Expert complexity · Low energy',
  },

  /* --- dialogue ---------------------------------------------------------- */
  {
    id: 'A45',
    text: 'Waiter: “How did you find your steak?” Diner: “I moved the potato and there it was.”',
    topic: 'Food',
    title: 'Under the Potato',
    axis: 'Short · Dialogue/conversation · Pun · Reinterpretation · Deadpan',
  },
  {
    id: 'A46',
    text: 'Manager: “We need this by Friday.” Me: “Which Friday?” Manager: “The one that already happened.”',
    topic: 'Work',
    title: 'Which Friday',
    axis: 'Short · Dialogue/conversation · Absurdity + Exaggeration · Quick',
  },
  {
    id: 'A47',
    text: 'Kid: “Dad, are we there yet?” Dad: “We haven’t left.” Kid: “Are we there yet?”',
    topic: 'Travel',
    title: 'We Haven’t Left',
    axis: 'Short · Dialogue/conversation · Callback within the joke · Animated',
  },

  /* --- list / build-up --------------------------------------------------- */
  {
    id: 'A48',
    text: 'Three things I learned from my first startup: hire slowly, fire kindly, and never let the person who bought the office beanbag pick the database.',
    topic: 'Work',
    title: 'Beanbag and Database',
    axis: 'Medium · List/build-up · Observational · Thoughtful · Long build',
  },
  {
    id: 'A49',
    text: 'My morning routine: wake up, check phone, regret checking phone, check phone again to confirm the regret.',
    topic: 'Everyday',
    title: 'Regret Confirmation Loop',
    axis: 'Short · List/build-up · Self-deprecating + Callback · Quick',
  },
  {
    id: 'A50',
    text: 'Packing for a week away: two shirts I will wear, nine shirts I will not, and one shirt that exists purely to make the suitcase look ambitious.',
    topic: 'Travel',
    title: 'The Ambitious Suitcase',
    axis: 'Medium · List/build-up · Exaggeration · Long build · Conversational',
  },

  /* --- callback ---------------------------------------------------------- */
  {
    id: 'A51',
    text: 'I told my wife she should embrace her mistakes. She gave me a hug. Later she embraced the dog, and I have been thinking about that all week.',
    topic: 'Relationships',
    title: 'Embracing Mistakes',
    axis: 'Medium · Callback · Pun · Slightly edgy · Very long build',
  },
  {
    id: 'A52',
    text: 'My friend said he would tell me a joke about construction, but he is still working on it. The scaffolding has been up for six years.',
    topic: 'Other',
    title: 'Still Working On It',
    axis: 'Medium · Callback · Pun · Long build · Conversational',
  },

  /* --- topical: the Freshness axis, which most jokes leave at Timeless --- */
  {
    id: 'A53',
    text: 'I asked an AI to write my performance review. It gave me a raise, a promotion, and a warning about my tone in meetings.',
    topic: 'Technology',
    title: 'The AI Performance Review',
    axis: 'Medium · Current freshness · Irony · List/build-up · Animated',
  },
  {
    id: 'A54',
    text: 'Every product I own now has a subscription, including, as of last Tuesday, my toothbrush.',
    topic: 'Money',
    title: 'The Subscription Toothbrush',
    axis: 'Short · Current freshness · Observational + Absurdity · Quick',
  },
  {
    id: 'A55',
    text: 'My team’s standup has become a support group where we each describe a dashboard we no longer believe in.',
    topic: 'Work',
    title: 'The Dashboard Support Group',
    axis: 'Short · Current freshness · Observational · Thoughtful · Deadpan',
  },
  {
    id: 'A56',
    text: 'Politics is the only industry where you can fail upward in public and call it a listening tour.',
    topic: 'Politics',
    title: 'The Listening Tour',
    axis: 'Short · Irony · SLIGHTLY EDGY (still projector-safe) · Very topical',
  },
  {
    id: 'A57',
    text: 'The referee made a call so bad that the crowd briefly united across three decades of rivalry to boo in perfect harmony.',
    topic: 'Sports',
    title: 'Booing in Perfect Harmony',
    axis: 'Medium · Exaggeration · High-energy · Long build',
  },
  {
    id: 'A58',
    text: 'I joined a fantasy league to feel closer to my brother. Now we text more than ever, entirely in insults.',
    topic: 'Sports',
    title: 'Fantasy League Therapy',
    axis: 'Short · Observational + Irony · Slightly edgy · Balanced',
  },
  {
    id: 'A59',
    text: 'My landlord called the apartment cozy. The estate agent called it efficient. The mouse called it home.',
    topic: 'Money',
    title: 'Cozy, Efficient, Home',
    axis: 'Short · List/build-up · Irony · Thoughtful · Low energy',
  },
  {
    id: 'A60',
    text: 'I finally read the terms and conditions. I now legally owe a company in Delaware one weekend a year.',
    topic: 'Technology',
    title: 'One Weekend a Year',
    axis: 'Short · Absurdity · Deadpan · Quick · Current freshness',
  },
]);

/* ============================================================================
   SET B — `blandControl`. READ THE INSTRUMENT BLOCK ABOVE BEFORE EDITING.
   ============================================================================
   Ten jokes, one template, one swapped noun each. Identical structure,
   identical topic (Work), identical register, identical word count (so they all
   land in the same LENGTH bucket and the one code-classified dimension cannot
   introduce variance either), and no wordplay anywhere. They are supposed to be
   interchangeable. That is the whole design.
============================================================================ */
export const blandControl: readonly JokeFixture[] = Object.freeze([
  {
    id: 'B01',
    text: 'The Monday meeting ran late because someone asked about the budget. No one had an answer, so we agreed to meet again on Monday.',
    topic: 'Work',
    title: 'The Budget Question',
    axis: 'CONTROL — identical to every other B joke but for one noun',
  },
  {
    id: 'B02',
    text: 'The Monday meeting ran late because someone asked about the roadmap. No one had an answer, so we agreed to meet again on Monday.',
    topic: 'Work',
    title: 'The Roadmap Question',
    axis: 'CONTROL — identical to every other B joke but for one noun',
  },
  {
    id: 'B03',
    text: 'The Monday meeting ran late because someone asked about the timeline. No one had an answer, so we agreed to meet again on Monday.',
    topic: 'Work',
    title: 'The Timeline Question',
    axis: 'CONTROL — identical to every other B joke but for one noun',
  },
  {
    id: 'B04',
    text: 'The Monday meeting ran late because someone asked about the headcount. No one had an answer, so we agreed to meet again on Monday.',
    topic: 'Work',
    title: 'The Headcount Question',
    axis: 'CONTROL — identical to every other B joke but for one noun',
  },
  {
    id: 'B05',
    text: 'The Monday meeting ran late because someone asked about the spreadsheet. No one had an answer, so we agreed to meet again on Monday.',
    topic: 'Work',
    title: 'The Spreadsheet Question',
    axis: 'CONTROL — identical to every other B joke but for one noun',
  },
  {
    id: 'B06',
    text: 'The Monday meeting ran late because someone asked about the agenda. No one had an answer, so we agreed to meet again on Monday.',
    topic: 'Work',
    title: 'The Agenda Question',
    axis: 'CONTROL — identical to every other B joke but for one noun',
  },
  {
    id: 'B07',
    text: 'The Monday meeting ran late because someone asked about the dashboard. No one had an answer, so we agreed to meet again on Monday.',
    topic: 'Work',
    title: 'The Dashboard Question',
    axis: 'CONTROL — identical to every other B joke but for one noun',
  },
  {
    id: 'B08',
    text: 'The Monday meeting ran late because someone asked about the invoice. No one had an answer, so we agreed to meet again on Monday.',
    topic: 'Work',
    title: 'The Invoice Question',
    axis: 'CONTROL — identical to every other B joke but for one noun',
  },
  {
    id: 'B09',
    text: 'The Monday meeting ran late because someone asked about the calendar. No one had an answer, so we agreed to meet again on Monday.',
    topic: 'Work',
    title: 'The Calendar Question',
    axis: 'CONTROL — identical to every other B joke but for one noun',
  },
  {
    id: 'B10',
    text: 'The Monday meeting ran late because someone asked about the checklist. No one had an answer, so we agreed to meet again on Monday.',
    topic: 'Work',
    title: 'The Checklist Question',
    axis: 'CONTROL — identical to every other B joke but for one noun',
  },
]);

/* ---- Text accessors ------------------------------------------------------- */

/** Just the joke texts of set A, in fixture order. */
export const variedTexts: readonly string[] = Object.freeze(variedCorpus.map(j => j.text));

/** Just the joke texts of set B, in fixture order. */
export const blandTexts: readonly string[] = Object.freeze(blandControl.map(j => j.text));

/** Every fixture in both sets. Ids are unique across the two. */
export const allFixtures: readonly JokeFixture[] = Object.freeze([
  ...variedCorpus,
  ...blandControl,
]);

/* ---- Blob assembly -------------------------------------------------------- */

function textOf(joke: JokeRef): string {
  return typeof joke === 'string' ? joke : joke.text;
}

/** Collapse runs of whitespace so a lookup survives a round trip through a
 *  textarea, the caret splitter and `strings.TrimSpace` on the Go side. */
function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Join jokes into the raw text blob a Joke Maker pastes into the submit box.
 *
 * Blank-line delimited — see the separator block at the top of this file for
 * why that and nothing else. Accepts fixtures or bare strings, so a caller can
 * pass `variedCorpus`, `variedTexts`, or a dealt slice of either.
 *
 * Pure: no trailing separator, no numbering, no reformatting of the joke text.
 */
export function asRawBlob(jokes: readonly JokeRef[]): string {
  return jokes.map(textOf).map(t => t.trim()).filter(t => t !== '').join(BLOB_SEPARATOR);
}

/* ---- Marketing-entered Topic and Title ------------------------------------ */

let index: Map<string, JokeFixture> | null = null;

/** Built on first use, not at import — this module stays side-effect free. */
function fixtureIndex(): Map<string, JokeFixture> {
  if (!index) {
    index = new Map(allFixtures.map(j => [normalize(j.text), j]));
  }
  return index;
}

function lookup(joke: JokeRef, helper: string): JokeFixture {
  if (typeof joke !== 'string') return joke;
  const found = fixtureIndex().get(normalize(joke));
  if (!found) {
    throw new Error(
      `${helper}: no fixture matches this text, so there is no curated value to return. ` +
        `Either it was edited on the way through the pipeline, or it did not come from ` +
        `variedCorpus/blandControl. Text: ${JSON.stringify(joke.slice(0, 80))}`,
    );
  }
  return found;
}

/**
 * The Topic a marketer would pick for this joke — always one of the 15 real
 * TOPIC categories, because the QC view will not let a joke be published
 * without one.
 *
 * Throws on an unknown string rather than inventing a plausible-looking Topic:
 * a silent fallback here would turn "the pipeline mangled the joke text" into
 * "the scores came out a bit odd", which is exactly the failure this fixture
 * exists to make loud.
 */
export function topicFor(joke: JokeRef): TopicCategory {
  return lookup(joke, 'topicFor').topic;
}

/**
 * The Title a marketer would type for this joke.
 *
 * TITLE_FIT is a genuinely graded dimension — the classifier is asked directly
 * "how well does the title match the joke's actual theme" and the grade maps
 * Perfect=1 … Mismatch=0 straight into true_fit. So these are written to be
 * specific and apt: no "Joke 7", no "Funny One". The spread in set A is meant
 * to come from the 11 matched dimensions; if titles were generic, TITLE_FIT
 * would collapse to a constant and the corpus would lose a twelfth of its
 * range. Throws on an unknown string, for the reason given on `topicFor`.
 */
export function titleFor(joke: JokeRef): string {
  return lookup(joke, 'titleFor').title;
}

/** LENGTH bucket via the backend's own rule (`scoring.ClassifyLength`, mirrored
 *  in `config/dimensions.ts`). Useful for asserting that set A spans buckets and
 *  set B does not. */
export function lengthBucketFor(joke: JokeRef): 'Short' | 'Medium' | 'Long' {
  return classifyLength(textOf(joke));
}

/* ---- Deterministic dealing ------------------------------------------------ */

/** The classroom runs 12 teams. */
export const TEAM_COUNT = 12;

/** 12 teams × 5 jokes = 60 = the whole varied corpus, dealt with nothing left
 *  over. 5 is also the standard round-1 batch size, and round 1 rejects a split
 *  that is not exactly `batch_size` jokes. */
export const DEFAULT_PER_TEAM = 5;

/** Fixed seed so a run is reproducible. Change it and every team's batch
 *  changes — which is a legitimate thing to want between runs, but it must be
 *  an explicit argument, never a wall-clock or random default. */
export const DEFAULT_DEAL_SEED = 'joke-factory-e2e-v1';

export interface DealOptions {
  /** How many teams to deal to. Default 12. */
  readonly teams?: number;
  /** How many jokes each team gets. Default 5. */
  readonly perTeam?: number;
  /** Seed for the shuffle. A string is hashed; a number is used directly. */
  readonly seed?: string | number;
}

/** FNV-1a, so a human-readable string seed becomes a stable 32-bit number. */
function hashSeed(seed: string | number): number {
  if (typeof seed === 'number') return seed >>> 0;
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — a small, fast, fully deterministic PRNG. Deliberately NOT
 *  `Math.random`: a fixture that deals differently on every run makes a flaky
 *  failure impossible to reproduce. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seeded Fisher–Yates on a copy. The input is never mutated. */
function shuffled<T>(items: readonly T[], seed: string | number): T[] {
  const out = items.slice();
  const rand = mulberry32(hashSeed(seed));
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Deal `perTeam` jokes to each of `teams` teams: distinct batches, no overlap,
 * identical on every run for a given seed.
 *
 * The pool is shuffled once with a seeded PRNG and then cut into consecutive
 * chunks. Shuffling first matters — dealing straight off the fixture order
 * would hand team 1 all the short one-liners and team 12 all the long stories,
 * and every team would draw a different conclusion about the hidden ideal for
 * reasons that have nothing to do with their own writing.
 *
 * Returns an array indexed by team (team 1 is `[0]`). Throws when the pool is
 * too small, rather than quietly handing the last teams short batches — round 1
 * would reject those with a confusing "expected 5 jokes" validation error from
 * deep inside the backend.
 */
export function dealToTeams(
  pool: readonly JokeFixture[],
  options: DealOptions = {},
): readonly (readonly JokeFixture[])[] {
  const teams = options.teams ?? TEAM_COUNT;
  const perTeam = options.perTeam ?? DEFAULT_PER_TEAM;
  const seed = options.seed ?? DEFAULT_DEAL_SEED;

  if (!Number.isInteger(teams) || teams < 1) {
    throw new Error(`dealToTeams: teams must be a positive integer, got ${teams}`);
  }
  if (!Number.isInteger(perTeam) || perTeam < 1) {
    throw new Error(`dealToTeams: perTeam must be a positive integer, got ${perTeam}`);
  }
  const needed = teams * perTeam;
  if (pool.length < needed) {
    throw new Error(
      `dealToTeams: need ${needed} jokes (${teams} teams × ${perTeam}) but the pool has ` +
        `${pool.length}. Add jokes to the corpus or lower perTeam — do not deal short ` +
        `batches, round 1 rejects them.`,
    );
  }

  const deck = shuffled(pool, seed);
  const hands: JokeFixture[][] = [];
  for (let t = 0; t < teams; t++) {
    hands.push(deck.slice(t * perTeam, (t + 1) * perTeam));
  }
  return Object.freeze(hands.map(h => Object.freeze(h)));
}

/** `dealToTeams(variedCorpus)` — the standard classroom deal: 12 teams × 5,
 *  consuming the corpus exactly. */
export function dealVariedCorpus(
  options: DealOptions = {},
): readonly (readonly JokeFixture[])[] {
  return dealToTeams(variedCorpus, options);
}

/** The same deal, already rendered as the blob each team's Joke Maker pastes.
 *  Indexed by team, team 1 at `[0]`. */
export function dealVariedCorpusAsBlobs(options: DealOptions = {}): readonly string[] {
  return Object.freeze(dealVariedCorpus(options).map(hand => asRawBlob(hand)));
}

/* ---- Self-check ----------------------------------------------------------- */

/**
 * Assert every invariant this fixture's users rely on. Not run at import — call
 * it once from the e2e suite's setup, where a failure reads as "the fixture is
 * broken" rather than as a mysterious backend error twenty steps later.
 *
 * Checks, in order of how expensive the failure is to debug:
 *   - joke text is blob-safe (single line, no leading list marker, no markdown
 *     emphasis), so `asRawBlob` round-trips through the real `splitJokes`;
 *   - Topics are real TOPIC categories, titles are non-empty and specific;
 *   - ids are unique and texts are distinct;
 *   - set A actually spans LENGTH buckets and set B actually does not — the
 *     control's homogeneity is the instrument, so it is worth pinning.
 */
export function assertFixtureIntegrity(): void {
  const problems: string[] = [];
  const topicCategories = dimById('TOPIC')?.categories ?? [];
  if (topicCategories.length === 0) {
    problems.push('config/dimensions.ts exposes no TOPIC categories — the mirror is broken.');
  }

  const seenIds = new Set<string>();
  const seenTexts = new Set<string>();

  for (const joke of allFixtures) {
    const where = `${joke.id}`;
    if (seenIds.has(joke.id)) problems.push(`${where}: duplicate id`);
    seenIds.add(joke.id);

    const norm = normalize(joke.text);
    if (seenTexts.has(norm)) problems.push(`${where}: duplicate joke text`);
    seenTexts.add(norm);

    if (/\n/.test(joke.text)) {
      problems.push(`${where}: contains a newline — keep each joke on one line`);
    }
    if (/^[ \t]*(?:\d{1,2}[.)]|[-*•])\s/.test(joke.text)) {
      problems.push(`${where}: starts with a list marker, which splitJokes would strip`);
    }
    if (/\*\*|__/.test(joke.text)) {
      problems.push(`${where}: contains markdown emphasis, which splitJokes strips silently`);
    }
    if (joke.text.trim() !== joke.text) {
      problems.push(`${where}: has leading or trailing whitespace`);
    }
    if (topicCategories.length > 0 && !topicCategories.includes(joke.topic)) {
      problems.push(`${where}: topic ${JSON.stringify(joke.topic)} is not a TOPIC category`);
    }
    if (joke.title.trim().length < 3) {
      problems.push(`${where}: title is too short to be a real Marketing title`);
    }
    if (/^(joke|test|untitled)\b/i.test(joke.title.trim())) {
      problems.push(`${where}: generic title — TITLE_FIT is graded, so titles must be apt`);
    }
  }

  // The round trip that matters: what a Joke Maker pastes must come back out of
  // the real splitter as exactly the jokes that went in.
  for (const [name, set] of [
    ['variedCorpus', variedCorpus],
    ['blandControl', blandControl],
  ] as const) {
    const back = splitJokes(asRawBlob(set));
    if (back.length !== set.length) {
      problems.push(
        `${name}: asRawBlob → splitJokes produced ${back.length} jokes, expected ${set.length}`,
      );
    } else {
      set.forEach((joke, i) => {
        if (normalize(back[i]) !== normalize(joke.text)) {
          problems.push(`${name}[${i}] (${joke.id}): did not survive the blob round trip`);
        }
      });
    }
  }

  // Spread, which is the reason set A exists.
  const bucketsA = new Set(variedCorpus.map(j => lengthBucketFor(j)));
  if (bucketsA.size < 3) {
    problems.push(
      `variedCorpus spans only ${[...bucketsA].join('/')} — it is supposed to cover Short, ` +
        `Medium and Long so LENGTH contributes to the spread.`,
    );
  }
  const topicsA = new Set(variedCorpus.map(j => j.topic));
  if (topicsA.size < 10) {
    problems.push(`variedCorpus covers only ${topicsA.size} topics — it should span most of the 15.`);
  }

  // Flatness, which is the reason set B exists. See the instrument block.
  const bucketsB = new Set(blandControl.map(j => lengthBucketFor(j)));
  if (bucketsB.size !== 1) {
    problems.push(
      `blandControl spans ${[...bucketsB].join('/')} — the control must sit in ONE length ` +
        `bucket, or LENGTH alone gives it variance and the stub-classifier test loses its ` +
        `signal. Read the SET B block before changing these jokes.`,
    );
  }
  const topicsB = new Set(blandControl.map(j => j.topic));
  if (topicsB.size !== 1) {
    problems.push(
      `blandControl uses ${topicsB.size} topics — it must use exactly one. Read the SET B block.`,
    );
  }
  const wordCountsB = new Set(blandControl.map(j => normalize(j.text).split(' ').length));
  if (wordCountsB.size !== 1) {
    problems.push(
      `blandControl jokes differ in length (${[...wordCountsB].join('/')} words) — they are ` +
        `meant to be interchangeable. Read the SET B block.`,
    );
  }

  if (problems.length > 0) {
    throw new Error(`Joke fixture integrity failed:\n  - ${problems.join('\n  - ')}`);
  }
}
