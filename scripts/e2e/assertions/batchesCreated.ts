/**
 * CLAIM 2 — every team created a batch, and every raw blob was parsed back into
 * exactly the jokes that went in.
 *
 * WHAT IS ACTUALLY AT RISK HERE. The Joke Maker pastes ONE string; the joke
 * rows do not exist until Marketing splits it. Between those two points the
 * text passes through `strings.TrimSpace` on every piece, the blank-line
 * separator the three consumers in fixtures/jokes.ts all agree on, and the
 * markdown-emphasis stripper. Any of those can silently eat a character, and a
 * joke that arrives at the classifier one word short scores differently for a
 * reason no one will ever connect to the splitter.
 *
 * So this check is a byte-level round trip, not a count. The count alone
 * (5 jokes in, 5 jokes out) passes happily while the text is wrong, and the
 * text being wrong is precisely what poisons CLAIM 8 downstream.
 *
 * Whitespace is normalised before comparing, and only whitespace. That is the
 * one transformation the pipeline is entitled to make — the backend trims every
 * segment — and collapsing runs of it is what lets a textarea round trip
 * compare equal. Nothing else is forgiven.
 */

import { allFixtures } from '../fixtures/jokes';
import { fail, pass, type Assertion } from './types';

/** Same rule fixtures/jokes.ts uses for its own lookups, restated rather than
 *  exported from there — this file must not be able to drift into forgiving a
 *  difference the fixture would not forgive. */
function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export const batchesCreated: Assertion = (evidence) => {
  const { teamCount, perTeam, outcomes } = evidence;
  const textById = new Map(allFixtures.map((f) => [f.id, f.text]));

  const submitted = outcomes.filter((o) => o.submittedBatchId !== null);
  const batchIds = submitted.map((o) => o.submittedBatchId as number);
  const distinctBatchIds = new Set(batchIds);

  const problems: string[] = [];
  const perTeamDetail: Array<Record<string, unknown>> = [];

  for (const o of outcomes) {
    const expected = o.handIds.map((id) => textById.get(id) ?? `<unknown fixture ${id}>`);
    const got = o.splitJokeTexts;
    const mismatches: string[] = [];

    if (o.submittedBatchId === null) {
      problems.push(`team ${o.teamNumber} never created a batch (died at ${o.failedPhase ?? 'an unknown phase'})`);
    } else if (got.length !== perTeam) {
      problems.push(
        `team ${o.teamNumber} batch ${o.submittedBatchId}: the blob split into ${got.length} joke(s), ` +
          `expected ${perTeam}`,
      );
    } else {
      expected.forEach((want, i) => {
        if (normalize(got[i]) !== normalize(want)) {
          mismatches.push(
            `#${i + 1} (${o.handIds[i]}): sent ${JSON.stringify(want.slice(0, 60))}, ` +
              `got back ${JSON.stringify(got[i].slice(0, 60))}`,
          );
        }
      });
      if (mismatches.length) {
        problems.push(
          `team ${o.teamNumber} batch ${o.submittedBatchId}: ${mismatches.length} joke(s) did not ` +
            `survive the blob round trip — ${mismatches.join('; ')}`,
        );
      }
    }

    perTeamDetail.push({
      teamNumber: o.teamNumber,
      batchId: o.submittedBatchId,
      corpus: o.corpus,
      blobChars: o.blobChars,
      jokesIn: o.handIds.length,
      jokesOut: got.length,
      mismatches: mismatches.length,
    });
  }

  if (distinctBatchIds.size !== batchIds.length) {
    problems.push(
      `two teams were handed the SAME batch id — ${batchIds.length} submissions produced only ` +
        `${distinctBatchIds.size} distinct ids`,
    );
  }

  const data = {
    teamCount,
    jokesPerTeam: perTeam,
    batchesCreated: distinctBatchIds.size,
    batchIds: [...distinctBatchIds].sort((a, b) => a - b),
    jokesExpected: teamCount * perTeam,
    jokesParsed: outcomes.reduce((n, o) => n + o.splitJokeTexts.length, 0),
    teams: perTeamDetail,
  };

  if (problems.length === 0 && distinctBatchIds.size === teamCount) {
    return pass({
      id: 2,
      name: `${teamCount} batches created, all raw blobs parsed`,
      layer: 'ingest',
      summary:
        `${distinctBatchIds.size} distinct batch(es), ${data.jokesParsed}/${data.jokesExpected} joke(s) ` +
        'split back out byte-for-byte (whitespace normalised)',
      data,
    });
  }

  const shortOfTeams = distinctBatchIds.size !== teamCount;

  return fail({
    id: 2,
    name: `${teamCount} batches created, all raw blobs parsed`,
    layer: 'ingest',
    summary:
      `${distinctBatchIds.size}/${teamCount} batch(es) created, ${data.jokesParsed}/${data.jokesExpected} ` +
      `joke(s) parsed; ${problems.length} problem(s)`,
    diagnosis:
      (shortOfTeams
        ? 'Fewer batches than teams. A missing batch is a team that failed BEFORE the split, so read ' +
          "that team's failedPhase and error in report.json first — a 409 ROUND_NOT_ACTIVE means the " +
          'round ended under the run, a 400 means the blob was rejected (raw_text must be >= 20 runes ' +
          'after trimming, and exactly one of jokes/raw_text may be supplied). '
        : '') +
      (problems.some((p) => p.includes('round trip'))
        ? 'Text came back different from what was sent. That is the splitter or the blob separator, not ' +
          'the network: check services/jokeSplit.ts against the separator contract at the top of ' +
          'scripts/e2e/fixtures/jokes.ts, and confirm no fixture gained a blank line, a leading list ' +
          'marker or markdown emphasis — all three are stripped silently. '
        : '') +
      (problems.some((p) => p.includes('split into'))
        ? 'A wrong joke COUNT out of a correct blob means the splitter took a different rung of its ' +
          'fallback ladder than the fixture expects (numbered markers beat blank lines). '
        : '') +
      `Problems: ${problems.join(' | ')}`,
    data,
  });
};
