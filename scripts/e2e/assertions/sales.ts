/**
 * CLAIM 5 — sales materialised on the market board.
 *
 * ONE STEP FURTHER DOWNSTREAM THAN CLAIM 4, AND A SEPARATE QUESTION. In
 * ProcessBatch, EvaluatePurchases runs only after PersistJokeFits and
 * MarkClassificationDone have both succeeded, and its own failure is logged and
 * swallowed with the reasoning that "fit is already persisted; purchases can be
 * retried". The consequence is exact: a team's feedback panel can fill
 * completely while not a single purchase row is ever written. Claim 4 would
 * pass. Nothing would be wrong anywhere a person looks. The leaderboard would
 * be all zeroes in front of the class.
 *
 * GET /v1/rounds/{rid}/market IS THE ONLY ENDPOINT THAT KNOWS. It counts the
 * `purchases` table live. The sold_count on /teams/{tid}/batches is a different
 * number for the same joke and is structurally always 0 — there is no such
 * column on the jokes table — so a check pointed there would report zero sales
 * for a perfectly healthy round.
 *
 * TWO CLAIMS, NOT ONE, because they fail for unrelated reasons:
 *   PRESENCE  — every published joke is ON the board. A published joke missing
 *               from the market listing is a publish that did not take, not a
 *               joke that failed to sell.
 *   SALES     — at least one purchase exists somewhere in the round.
 *
 * ZERO SALES IS NOT AUTOMATICALLY A BUG, and this file refuses to pretend
 * otherwise. AI customers buy on true_fit against buy_threshold within a
 * budget; a genuinely poor batch legitimately sells nothing. But there is one
 * specific way to get a class-wide zero that IS a bug, and it is the common
 * one: under StubClassifier every joke scores a constant 6.5 or 6.0 against the
 * default threshold of 7, so NOTHING EVER SELLS. That is why the diagnosis
 * below points at claim 8 rather than guessing — the two failures are the same
 * failure seen from two sides.
 */

import type { MarketItem } from '../../../types/api';
import { fail, pass, type Assertion } from './types';

export const sales: Assertion = (evidence) => {
  const board = new Map(evidence.market.map((i) => [i.joke_id, i]));

  const publishedIds = evidence.outcomes.flatMap((o) => (o.ok ? o.publishedJokeIds : []));
  const missingFromBoard = publishedIds.filter((id) => !board.has(id));

  const perTeam = evidence.outcomes
    .filter((o) => o.ok)
    .map((o) => {
      const items = o.publishedJokeIds
        .map((id) => board.get(id))
        .filter((i): i is MarketItem => i !== undefined);
      return {
        teamNumber: o.teamNumber,
        corpus: o.corpus,
        published: o.publishedJokeIds.length,
        onBoard: items.length,
        sold: items.reduce((n, i) => n + i.sold_count, 0),
        perJoke: items.map((i) => ({ jokeId: i.joke_id, title: i.joke_title, sold: i.sold_count })),
      };
    });

  const totalSales = perTeam.reduce((n, t) => n + t.sold, 0);
  const teamsWithASale = perTeam.filter((t) => t.sold > 0).length;

  const data = {
    boardItems: evidence.market.length,
    publishedJokes: publishedIds.length,
    missingFromBoard,
    totalSales,
    teamsWithASale,
    customerCount: evidence.round.customer_count,
    marketPrice: evidence.round.market_price,
    salesWait: evidence.salesWait,
    marketError: evidence.marketError,
    teams: perTeam,
  };

  if (evidence.marketError) {
    return fail({
      id: 5,
      name: 'sales materialise on the market board',
      layer: 'async pipeline',
      summary: 'the market board could not be read at all',
      diagnosis:
        'GET /v1/rounds/{rid}/market failed, so this claim is UNVERIFIED rather than false. The route ' +
        'requires an X-User-Id header and the caller must be able to see the round — a 400 here is a ' +
        'harness identity bug, a 403/404 is a round-visibility problem, and a 5xx is the backend. ' +
        `Transport said: ${evidence.marketError}`,
      data,
    });
  }

  if (missingFromBoard.length) {
    return fail({
      id: 5,
      name: 'sales materialise on the market board',
      layer: 'async pipeline',
      summary:
        `${missingFromBoard.length}/${publishedIds.length} published joke(s) are absent from the ` +
        `market board (${evidence.market.length} item(s) listed), ${totalSales} sale(s) total`,
      diagnosis:
        `Joke(s) ${missingFromBoard.slice(0, 10).join(', ')}${missingFromBoard.length > 10 ? ' …' : ''} ` +
        'were published — the publish response returned their ids — but the market listing does not ' +
        'carry them. The board lists published jokes for the round regardless of whether they sold, so ' +
        'this is not a sales problem: either the publish transaction did not commit the publish_status ' +
        'it reported, or ListMarket is filtering on something more than published_at (check the round ' +
        'id it was asked for against the round these jokes belong to).',
      data,
    });
  }

  if (totalSales > 0) {
    return pass({
      id: 5,
      name: 'sales materialise on the market board',
      layer: 'async pipeline',
      summary:
        `${totalSales} sale(s) across ${teamsWithASale}/${perTeam.length} team(s); all ` +
        `${publishedIds.length} published joke(s) are on the board`,
      notes: [
        `market price ${evidence.round.market_price}, ${evidence.round.customer_count} AI customer(s) ` +
          'in the round — the ceiling on any one joke is the customer count',
      ],
      data,
    });
  }

  return fail({
    id: 5,
    name: 'sales materialise on the market board',
    layer: 'async pipeline',
    summary:
      `all ${publishedIds.length} published joke(s) are on the board, but the round recorded ZERO sales`,
    diagnosis:
      'Every joke is listed and none sold. Three causes, and claim 8 usually tells you which:\n' +
      '  1. THE STUB CLASSIFIER. Under infra/llm/stub_classifier.go every joke gets identical ' +
      'categories, which works out to a constant fit of 6.5 (Medium) or 6.0 (Short/Long) against the ' +
      'default buy_threshold of 7 — so nothing can EVER sell. If claim 8 reports LIKELY_STUB, this is ' +
      'the answer and the two failures are one failure.\n' +
      '  2. EvaluatePurchases failed and was swallowed. ProcessBatch logs it and moves on precisely ' +
      'because the fits are already saved, which is why the feedback panel can be full while the ' +
      '`purchases` table is empty. Grep the container logs for the batch ids in report.json.\n' +
      '  3. The round has no AI customers. GenerateCustomers runs inside StartRound, so a round that ' +
      `was started by another path has nobody to buy — this round reports customer_count ` +
      `${evidence.round.customer_count}.\n` +
      'A genuinely terrible batch selling nothing is legitimate, but twelve independent teams all ' +
      'selling nothing is not a batch-quality story.' +
      (evidence.salesWait?.shortenedBecause
        ? `\nNOTE: the sales wait was deliberately shortened — ${evidence.salesWait.shortenedBecause}`
        : ''),
    data,
  });
};
