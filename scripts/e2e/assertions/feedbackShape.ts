/**
 * CLAIM 6 — the feedback panel is the right SHAPE: five of the twelve
 * dimensions per joke, weighted toward failures, over the latest N published
 * jokes.
 *
 * WHY SHAPE IS WORTH ITS OWN CLAIM. This is the only thing a student ever sees
 * of the scoring engine. They do not see true_fit, they do not see the ideal
 * profile, and they do not see which dimensions exist — they see five labels,
 * split into "good" and "improve", and from those five they decide what to
 * write next round. If the panel returns six dimensions, or the same dimension
 * in both columns, or dimensions for a joke that was never published, the round
 * still "works" end to end and the teaching is wrong.
 *
 * N IS READ FROM THE ROUND, NOT HARDCODED. `feedback_joke_count` is an
 * instructor knob. A check that assumed the default of 3 would be wrong in
 * exactly the configured class it exists to protect, so the expected count
 * comes from evidence.round and the assertion reports which value it used.
 *
 * FIVE IS NOT A KNOB. The selection size is fixed in FeedbackService, not in
 * ConfigRequest — there is no field for it — so five is asserted literally and
 * a change to it should break this claim loudly rather than drift.
 *
 * "FAILURE-WEIGHTED" IS ASSERTED CAREFULLY, and the limit is stated rather than
 * papered over. The harness cannot see dim_fits, so it cannot verify that the
 * five dimensions chosen were the five furthest from the ideal. What it CAN
 * catch is the weighting collapsing entirely — every joke in the class coming
 * back all-good or all-improve, which no per-joke selection over varied jokes
 * produces and which is the signature of a constant classification. The
 * good/improve split is otherwise reported as a reading, not judged.
 */

import { DIMENSIONS } from '../../../config/dimensions';
import { fail, pass, type Assertion } from './types';

/** FeedbackService.SelectFeedbackDimensions returns this many per joke. */
const DIMENSIONS_PER_JOKE = 5;

const VALID_DIMENSION_IDS = new Set(DIMENSIONS.map((d) => d.id));

export const feedbackShape: Assertion = (evidence) => {
  const panelSize = evidence.round.feedback_joke_count;
  const publishedByTeam = new Map(
    evidence.outcomes.filter((o) => o.ok).map((o) => [o.teamNumber, o.publishedJokeIds]),
  );

  const problems: string[] = [];
  const rows: Array<Record<string, unknown>> = [];
  let jokesInspected = 0;
  let allGood = 0;
  let allImprove = 0;
  let mixed = 0;

  for (const conv of evidence.convergence) {
    const published = publishedByTeam.get(conv.teamNumber);
    if (!published) continue; // team never published; claim 2/3 owns that failure
    const expectedIds = [...published].sort((a, b) => b - a).slice(0, panelSize);

    if (conv.jokes.length > panelSize) {
      problems.push(
        `team ${conv.teamNumber}: panel carries ${conv.jokes.length} jokes, more than the round's ` +
          `feedback_joke_count of ${panelSize}`,
      );
    }

    const panelIds = conv.jokes.map((j) => j.joke_id);
    const notPublished = panelIds.filter((id) => !published.includes(id));
    if (notPublished.length) {
      problems.push(
        `team ${conv.teamNumber}: panel shows joke(s) ${notPublished.join(', ')} that this team never ` +
          'published — the panel is supposed to list published jokes only',
      );
    }
    // Set comparison, not order: the handler's ordering is its own business,
    // but WHICH jokes it picked is the claim.
    const missingLatest = expectedIds.filter((id) => !panelIds.includes(id));
    if (missingLatest.length && !conv.timedOut) {
      problems.push(
        `team ${conv.teamNumber}: the latest ${expectedIds.length} published joke(s) should be ` +
          `${expectedIds.join(', ')} but ${missingLatest.join(', ')} are absent from the panel`,
      );
    }

    for (const j of conv.jokes) {
      const good = j.good_dimensions;
      const improve = j.improve_dimensions;
      const total = good.length + improve.length;
      if (total === 0) continue; // unscored — claim 4's problem, not this one's
      jokesInspected++;

      if (total !== DIMENSIONS_PER_JOKE) {
        problems.push(
          `team ${conv.teamNumber} joke ${j.joke_id}: ${total} dimension(s) (${good.length} good + ` +
            `${improve.length} improve), expected exactly ${DIMENSIONS_PER_JOKE}`,
        );
      }
      const overlap = good.filter((d) => improve.includes(d));
      if (overlap.length) {
        problems.push(
          `team ${conv.teamNumber} joke ${j.joke_id}: dimension(s) ${overlap.join(', ')} appear in ` +
            'BOTH good and improve — a dimension is above or below the pass threshold, not both',
        );
      }
      const unknown = [...good, ...improve].filter((d) => !VALID_DIMENSION_IDS.has(d));
      if (unknown.length) {
        problems.push(
          `team ${conv.teamNumber} joke ${j.joke_id}: unrecognised dimension id(s) ` +
            `${unknown.join(', ')} — the wire sends enum ids like HUMOR_STYLE, not labels, and ` +
            'config/dimensions.ts is the mirror they must agree with',
        );
      }
      const duplicated = new Set(good).size !== good.length || new Set(improve).size !== improve.length;
      if (duplicated) {
        problems.push(`team ${conv.teamNumber} joke ${j.joke_id}: a dimension is listed twice`);
      }

      if (improve.length === 0) allGood++;
      else if (good.length === 0) allImprove++;
      else mixed++;

      rows.push({
        teamNumber: conv.teamNumber,
        jokeId: j.joke_id,
        title: j.joke_title,
        wasBought: j.was_bought,
        good: good,
        improve: improve,
      });
    }
  }

  // The collapse test. Per-joke selection over a varied corpus produces a mix;
  // every joke in the class landing in one column means the selection is not
  // reacting to the jokes at all.
  const collapsed =
    jokesInspected >= 4 && mixed === 0 && (allGood === jokesInspected || allImprove === jokesInspected);

  const data = {
    feedbackJokeCount: panelSize,
    dimensionsPerJoke: DIMENSIONS_PER_JOKE,
    jokesInspected,
    split: { allGood, allImprove, mixed },
    collapsed,
    jokes: rows,
  };

  const notes = [
    `N read from the round's feedback_joke_count = ${panelSize} (not hardcoded)`,
    `good/improve split across ${jokesInspected} joke(s): ${mixed} mixed, ${allGood} all-good, ` +
      `${allImprove} all-improve`,
    'the harness cannot see dim_fits, so "failure-weighted" is checked only as far as the split not ' +
      'collapsing — the exact five chosen are unverifiable from outside the backend',
  ];

  if (problems.length === 0 && !collapsed && jokesInspected > 0) {
    return pass({
      id: 6,
      name: `feedback shape — ${DIMENSIONS_PER_JOKE} of 12 dims, failure-weighted, latest ${panelSize}`,
      layer: 'async pipeline',
      summary:
        `${jokesInspected} joke(s) each carry exactly ${DIMENSIONS_PER_JOKE} distinct, valid, ` +
        `non-overlapping dimensions over the latest ${panelSize} published joke(s) per team`,
      notes,
      data,
    });
  }

  return fail({
    id: 6,
    name: `feedback shape — ${DIMENSIONS_PER_JOKE} of 12 dims, failure-weighted, latest ${panelSize}`,
    layer: 'async pipeline',
    summary:
      jokesInspected === 0
        ? 'no scored joke reached any feedback panel, so the shape could not be inspected'
        : `${problems.length} shape problem(s) across ${jokesInspected} joke(s)` +
          (collapsed ? '; the good/improve split has COLLAPSED' : ''),
    diagnosis:
      (collapsed
        ? `*** EVERY joke in the class came back ${allGood === jokesInspected ? 'all-good' : 'all-improve'}. *** ` +
          'SelectFeedbackDimensions splits on each dimension\'s fit against feedback_pass_threshold, so a ' +
          'class-wide one-sided split means either every joke got an IDENTICAL classification (the ' +
          'StubClassifier signature — see claim 8) or feedback_pass_threshold is set past the end of ' +
          `the scale (this round: ${evidence.round.feedback_pass_threshold}). `
        : '') +
      (problems.some((p) => p.includes('expected exactly'))
        ? 'A wrong dimension COUNT is FeedbackService.SelectFeedbackDimensions, not the classifier — ' +
          'the classifier fills twelve dimensions and the service picks five from them. '
        : '') +
      (problems.some((p) => p.includes('never published'))
        ? 'A panel listing an unpublished joke means the feedback query is not filtering on ' +
          'publish_status, which would show students feedback on jokes their marketer deliberately ' +
          'discarded. '
        : '') +
      (problems.some((p) => p.includes('absent from the panel'))
        ? 'The panel is showing the wrong N jokes — check its ORDER BY against "latest published". '
        : '') +
      (problems.length ? `Problems: ${problems.slice(0, 12).join(' | ')}` : ''),
    notes,
    data,
  });
};
