/**
 * CLAIM 7 — the money adds up: $0.10 per published joke, $0.01 per discarded.
 *
 * WHY THE ARITHMETIC AND NOT JUST THE PRICES. The two prices are the whole
 * teaching mechanic of the round — publishing is ten times the cost of
 * discarding, so a marketer who publishes everything loses to one who is
 * selective, and that difference is the lesson. Two independent things can
 * break it: the PRICES can drift (a config change, a migration default), or the
 * prices can be right while `profit` is computed from something else. The first
 * is invisible until a team's board looks wrong; the second is invisible
 * forever, because nobody hand-checks a leaderboard.
 *
 * So both are asserted, separately, and the arithmetic is printed either way:
 *
 *     profit  ==  total_sales × market_price
 *                 − published_jokes × cost_of_publishing
 *                 − discarded_jokes × cost_of_discard
 *
 * A failure that shows the two sides of that equation tells the reader
 * immediately which half is wrong. "expected 0.37, got 0.41" does not.
 *
 * THE COUNTS ARE CROSS-CHECKED TOO. The team summary's published_jokes and
 * discarded_jokes must match what this run's marketer actually decided. A
 * summary that agrees with itself but disagrees with the publish response is a
 * different bug from a wrong price, and it would otherwise hide inside a profit
 * figure that happens to balance.
 *
 * Compared in cents, never in floats — see MONEY_EPSILON.
 */

import { fail, MONEY_EPSILON, money, pass, type Assertion } from './types';

/** The documented classroom prices. Asserted literally: POST /v1/admin/reset
 *  restores every round to its CONFIGURED defaults and this run does not
 *  override either price, so anything else here is drift in the backend's
 *  defaults and is worth knowing about before a class rather than during one. */
const EXPECTED_COST_OF_PUBLISHING = 0.1;
const EXPECTED_COST_OF_DISCARD = 0.01;

export const economics: Assertion = (evidence) => {
  const { round } = evidence;
  const priceProblems: string[] = [];

  if (Math.abs(round.cost_of_publishing - EXPECTED_COST_OF_PUBLISHING) > MONEY_EPSILON) {
    priceProblems.push(
      `cost_of_publishing is ${money(round.cost_of_publishing)}, expected ` +
        `${money(EXPECTED_COST_OF_PUBLISHING)}`,
    );
  }
  if (Math.abs(round.cost_of_discard - EXPECTED_COST_OF_DISCARD) > MONEY_EPSILON) {
    priceProblems.push(
      `cost_of_discard is ${money(round.cost_of_discard)}, expected ${money(EXPECTED_COST_OF_DISCARD)}`,
    );
  }

  const summaryByTeam = new Map(evidence.summaries.map((s) => [s.teamNumber, s]));
  const rows: Array<Record<string, unknown>> = [];
  const countProblems: string[] = [];
  const mathProblems: string[] = [];

  for (const o of evidence.outcomes) {
    if (!o.ok) continue;
    const record = summaryByTeam.get(o.teamNumber);
    if (!record?.summary) {
      countProblems.push(
        `team ${o.teamNumber}: no summary could be read (${record?.error ?? 'not attempted'})`,
      );
      continue;
    }
    const s = record.summary;

    if (s.published_jokes !== o.publishedJokeIds.length) {
      countProblems.push(
        `team ${o.teamNumber}: summary says ${s.published_jokes} published, the publish response ` +
          `returned ${o.publishedJokeIds.length} joke id(s)`,
      );
    }
    if (s.discarded_jokes !== o.discardedJokeIds.length) {
      countProblems.push(
        `team ${o.teamNumber}: summary says ${s.discarded_jokes} discarded, the publish response ` +
          `returned ${o.discardedJokeIds.length} joke id(s)`,
      );
    }

    const cost =
      s.published_jokes * round.cost_of_publishing + s.discarded_jokes * round.cost_of_discard;
    const revenue = s.total_sales * round.market_price;
    const expectedProfit = revenue - cost;
    const delta = s.profit - expectedProfit;
    const balances = Math.abs(delta) <= MONEY_EPSILON;

    if (!balances) {
      mathProblems.push(
        `team ${o.teamNumber}: profit ${money(s.profit)} but ${s.total_sales} × ` +
          `${money(round.market_price)} − ${s.published_jokes} × ${money(round.cost_of_publishing)} − ` +
          `${s.discarded_jokes} × ${money(round.cost_of_discard)} = ${money(expectedProfit)} ` +
          `(off by ${money(delta)})`,
      );
    }

    rows.push({
      teamNumber: o.teamNumber,
      corpus: o.corpus,
      publishedJokes: s.published_jokes,
      discardedJokes: s.discarded_jokes,
      totalSales: s.total_sales,
      revenue: Number(revenue.toFixed(4)),
      cost: Number(cost.toFixed(4)),
      expectedProfit: Number(expectedProfit.toFixed(4)),
      reportedProfit: s.profit,
      deltaCents: Math.round(delta * 100),
      balances,
    });
  }

  const totalPublished = rows.reduce((n, r) => n + (r.publishedJokes as number), 0);
  const totalDiscarded = rows.reduce((n, r) => n + (r.discardedJokes as number), 0);

  const data = {
    prices: {
      costOfPublishing: round.cost_of_publishing,
      costOfDiscard: round.cost_of_discard,
      marketPrice: round.market_price,
      expectedCostOfPublishing: EXPECTED_COST_OF_PUBLISHING,
      expectedCostOfDiscard: EXPECTED_COST_OF_DISCARD,
    },
    totals: {
      publishedJokes: totalPublished,
      discardedJokes: totalDiscarded,
      publishingCost: Number((totalPublished * round.cost_of_publishing).toFixed(2)),
      discardCost: Number((totalDiscarded * round.cost_of_discard).toFixed(2)),
    },
    teams: rows,
  };

  const notes = [
    `${totalPublished} published × ${money(round.cost_of_publishing)} = ` +
      `${money(totalPublished * round.cost_of_publishing)}; ${totalDiscarded} discarded × ` +
      `${money(round.cost_of_discard)} = ${money(totalDiscarded * round.cost_of_discard)}`,
  ];

  const problems = [...priceProblems, ...countProblems, ...mathProblems];
  if (problems.length === 0 && rows.length > 0) {
    return pass({
      id: 7,
      name: 'economics — $0.10 per published joke, $0.01 per discarded',
      layer: 'economics',
      summary:
        `both prices are as documented and all ${rows.length} team(s) balance to within half a cent`,
      notes,
      data,
    });
  }

  return fail({
    id: 7,
    name: 'economics — $0.10 per published joke, $0.01 per discarded',
    layer: 'economics',
    summary:
      rows.length === 0
        ? 'no team summary could be read, so the money was never checked'
        : `${priceProblems.length} price problem(s), ${countProblems.length} count mismatch(es), ` +
          `${mathProblems.length} team(s) whose profit does not balance`,
    diagnosis:
      (priceProblems.length
        ? `THE PRICES THEMSELVES ARE WRONG: ${priceProblems.join('; ')}. This run does not override ` +
          'either price, so these are the backend\'s CONFIGURED defaults as POST /v1/admin/reset ' +
          'restored them. Publishing costing less than ten times a discard removes the reason to be ' +
          'selective, which is the entire mechanic of the round. '
        : '') +
      (countProblems.length
        ? `THE COUNTS DISAGREE WITH THE PUBLISH RESPONSE: ${countProblems.join('; ')}. The summary and ` +
          'the publish response are reading different rows — check that the summary counts ' +
          'publish_status rather than batch membership. '
        : '') +
      (mathProblems.length
        ? `THE ARITHMETIC DOES NOT CLOSE: ${mathProblems.join('; ')}. The prices are right and the ` +
          'counts are right, so profit is being computed from something other than ' +
          'sales × market_price − publishing − discard. A constant offset across every team points at ' +
          'a missing term; a per-team offset proportional to sales points at the wrong market price ' +
          'being applied downstream. '
        : ''),
    notes,
    data,
  });
};
