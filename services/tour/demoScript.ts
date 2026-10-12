/* The guided tour's sample data: "Team Demo", its jokes, and every change the
   tour makes to them as it plays.

   A DemoState is everything the stage shows: the demo game (what the views
   read from GameContext) and the DemoUi (what they read in place of their own
   local state, the demo clock included). buildDemoState(steps, k, options,
   elapsedMs) rebuilds the state for step k from scratch — every onEnter and
   beat of the steps before k, then step k's onEnter and the beats whose time
   has come — so Back, Next and replays are deterministic. Nothing is shared or
   mutated: every helper returns new objects.

   The numbers follow the game's own formulas at the round's prices and fees
   (settle() recomputes the team summary after every change, so Profit, Jokes
   Sold / Made, Content Backlog and the fee tiles always agree with the batches
   on screen):
   - sales, listing and discards: services/economics.ts computeProfit;
   - shipping: every sent batch priced by its size (services/leanMode.ts
     shippingFeeFor; an unsplit batch ships as the standard 5);
   - storage: jokes × minutes each batch waited on Marketing's desk, up to its
     release or, while it still waits, up to the demo clock;
   - hosting: released jokes still unsold × minutes since their release.

   Timeline (seconds after T0): batch #101 sent at 0 and released at 60 with
   4 of its 5 jokes sold since (10 sales); the tour opens at 240; the Joke Maker sends
   #102 at 250; Marketing releases it at 310 (3 kept, 2 dropped, with a note);
   in the Marketing tour a third batch, #103, is sent at 320 and has waited
   52 s when the Next step line is shown. */
import type { ApiTeamSummaryResponse, Batch, GameConfig, Joke, JokeId, Role, User } from '../../types';
import type { LeanTeamStats, TeamFeedbackResponse } from '../../types/api';
import { computeProfit } from '../economics';
import { STANDARD_SHIPMENT_JOKES, shippingFeeFor } from '../leanMode';
import { SIM_CONFIG } from '../../config/simConfig';
import type { DemoGameData } from './demoGame';
import { EMPTY_DEMO_UI, type DemoUi } from './demoUi';
import type { TourRole } from './seen';
import { stepDuration, type TourStep, type TypingField } from './tourMachine';

export const DEMO_TEAM_ID = 99;
export const DEMO_TEAM_NAME = 'Team Demo';

/** The five placeholder jokes the tour writes, sends and splits. Original, clean, one line each. */
export const DEMO_JOKES: readonly string[] = [
  'My to-do list has its own to-do list, and both are ignoring me.',
  'The office printer only jams when someone says the word urgent.',
  "My smartwatch says I'm stressed, mostly about my smartwatch.",
  "I labeled my lunch 'kale salad' and nobody has touched it since.",
  "The Wi-Fi went down, so we finally learned each other's names.",
];

/** The batch as the Joke Maker pastes it: the AI's numbered reply. */
export const DEMO_RAW_BATCH = DEMO_JOKES.map((text, i) => `${i + 1}) ${text}`).join('\n');

/** Customers bought each earlier joke this many times: 4 of the 5 jokes have sold (10 sales), so the tour's profit starts believable. */
const EARLIER_SALES: readonly number[] = [0, 3, 2, 3, 2];

/** The earlier batch, already on the market with 4 of 5 sold. Its row stays collapsed in both tours. */
export const EARLIER_JOKES: readonly string[] = [
  'Our team chat has more emoji reactions than actual messages.',
  'I set my alarm to motivated mode and it hit snooze on me.',
  'The coffee machine knows more office secrets than anyone in HR.',
  'My desk plant and I are both pretending we get enough sunlight.',
  'I finally emptied my inbox, and three new meetings moved in.',
];

/** Marketing's note on the new batch. */
export const DEMO_NOTE = 'Customers loved the work jokes. Keep them short and end on a twist.';

/** The three jokes Marketing keeps (indexes into DEMO_JOKES), with their Topic and title. */
export const DEMO_KEEP: ReadonlyArray<{ index: number; topic: string; title: string }> = [
  { index: 0, topic: 'Work', title: 'To-Do Overload' },
  { index: 2, topic: 'Technology', title: 'Stressed Smartwatch' },
  { index: 4, topic: 'Technology', title: 'Wi-Fi Icebreaker' },
];

export const EARLIER_BATCH_ID = 101;
/** The batch the tour sends (Joke Maker) or receives (Marketing). */
export const SENT_BATCH_ID = 102;
/** The batch that lands on Marketing's desk during "Fees add up". */
export const NEXT_BATCH_ID = 103;

/** Joke id of the n-th joke (0-based) of a demo batch. */
export const demoJokeId = (batchId: number, n: number) => batchId * 10 + n + 1;

/** T0 of the demo's timeline (ms epoch); the clock and every timestamp count from it. */
export const DEMO_T0 = Date.parse('2026-10-11T10:00:00Z');
const at = (seconds: number) => DEMO_T0 + seconds * 1000;
const iso = (seconds: number) => new Date(at(seconds)).toISOString();

/** Seconds after T0 of each moment in the script. */
export const DEMO_TIMES = {
  earlierSent: 0, earlierReleased: 60, tourStart: 240, sent: 250, arrivedOnDesk: 255,
  released: 310, nextSent: 320, nextSeen: 372,
} as const;

/** What a caption or a demo number may quote: the round's prices and Lean fees. */
export interface TourMoney {
  marketPrice: number;
  costOfPublishing: number;
  costOfDiscard: number;
  shippingFeeSmall: number;
  shippingFeeStandard: number;
  shippingFeeLarge: number;
  storageFeePerJokeMinute: number;
  hostingFeePerJokeMinute: number;
}

/** The round a tour is played for: its number (the shipping copy differs) and its money. */
export interface TourRound {
  roundNumber: 1 | 2;
  fees: TourMoney;
}

export interface DemoOptions extends TourRound {
  role: TourRole;
}

export interface DemoState {
  options: DemoOptions;
  game: DemoGameData;
  ui: DemoUi;
}

export type DemoStep = TourStep<DemoState, TourRound>;

const amount = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback);

/**
 * The demo's settings, read from the live round's configuration. A price that
 * is missing or broken falls back to the game's default price; a fee falls
 * back to 0, as the rest of the app reads a fee the backend did not send.
 */
export function demoOptionsFor(role: TourRole, config: GameConfig): DemoOptions {
  const econ = SIM_CONFIG.economics;
  return {
    role,
    roundNumber: config.round === 2 ? 2 : 1,
    fees: {
      marketPrice: amount(config.marketPrice, econ.marketPrice),
      costOfPublishing: amount(config.costOfPublishing, econ.costOfPublishing),
      costOfDiscard: amount(config.costOfDiscard, econ.costOfDiscard),
      shippingFeeSmall: amount(config.shippingFeeSmall, 0),
      shippingFeeStandard: amount(config.shippingFeeStandard, 0),
      shippingFeeLarge: amount(config.shippingFeeLarge, 0),
      storageFeePerJokeMinute: amount(config.storageFeePerJokeMinute, 0),
      hostingFeePerJokeMinute: amount(config.hostingFeePerJokeMinute, 0),
    },
  };
}

/* ---------------------------------------------------------------- building blocks */

const isDecided = (b: Batch) => b.status === 'PROCESSED' || b.status === 'RATED';

function joke(id: number, text: string, extra: Partial<Joke> = {}): Joke {
  return { joke_id: id as JokeId, joke_text: text, id: String(id), content: text, ...extra };
}

function batch(id: number, jokes: Joke[], sentS: number, extra: Partial<Batch> = {}): Batch {
  return {
    batch_id: id, round_id: 1, team_id: DEMO_TEAM_ID, status: 'SUBMITTED', jokes,
    submitted_at: iso(sentS), id: String(id), team: String(DEMO_TEAM_ID), round: 1,
    submittedAt: at(sentS), tagSummary: [], marketing_note: null,
    ...extra,
  };
}

/** A sent batch as the team's browser shows it: the pasted jokes, all still with Marketing. */
const waitingBatch = (id: number, sentS: number) =>
  batch(id, DEMO_JOKES.map((text, n) => joke(demoJokeId(id, n), text)), sentS);

const waitingCount = (s: DemoState) => s.game.batches.filter(b => b.status === 'SUBMITTED').length;
/** Jokes a batch is charged for: its jokes, or the standard 5 while unsplit. */
const jokesOf = (b: Batch) => (b.jokes.length > 0 ? b.jokes.length : STANDARD_SHIPMENT_JOKES);
const minutes = (fromMs: number, toMs: number) => Math.max(0, toMs - fromMs) / 60_000;

/** The team's three Lean fees at the demo clock (see the formulas at the top). */
export function demoFees(batches: readonly Batch[], fees: TourMoney, clockMs: number): { shipping: number; storage: number; hosting: number } {
  let shipping = 0;
  let storage = 0;
  let hosting = 0;
  for (const b of batches) {
    shipping += shippingFeeFor(jokesOf(b), fees);
    const sent = b.submittedAt ?? clockMs;
    const left = isDecided(b) && b.ratedAt != null ? Math.min(b.ratedAt, clockMs) : clockMs;
    storage += jokesOf(b) * minutes(sent, left) * fees.storageFeePerJokeMinute;
    if (isDecided(b) && b.ratedAt != null) {
      const unsold = b.jokes.filter(j => j.is_published && !((j.sold_count ?? 0) > 0)).length;
      hosting += unsold * minutes(b.ratedAt, clockMs) * fees.hostingFeePerJokeMinute;
    }
  }
  return { shipping, storage, hosting };
}

/** Recomputes the team summary (and Marketing's queue size) from the batches and the clock. */
export function settle(s: DemoState): DemoState {
  const { fees } = s.options;
  const decided = s.game.batches.filter(isDecided);
  const created = decided.reduce((n, b) => n + b.jokes.length, 0);
  const published = decided.reduce((n, b) => n + b.jokes.filter(j => j.is_published).length, 0);
  const sales = s.game.batches.reduce((n, b) => n + b.jokes.reduce((m, j) => m + (j.sold_count ?? 0), 0), 0);
  const waiting = waitingCount(s);
  const lean = demoFees(s.game.batches, fees, s.ui.clockMs);
  const classic = computeProfit({ created, published, sold: sales }, fees);
  const leanStats: LeanTeamStats = {
    batches_submitted: s.game.batches.length,
    shipping_cost: lean.shipping,
    storage_cost: lean.storage,
    hosting_cost: lean.hosting,
    setup_cost: lean.shipping,
    carrying_cost: lean.storage + lean.hosting,
    avg_submit_to_publish_s: 60,
    avg_publish_to_first_sale_s: 75,
    batch_series: [],
  };
  const summary: ApiTeamSummaryResponse = {
    team: { id: DEMO_TEAM_ID, name: DEMO_TEAM_NAME },
    round_id: 1,
    rank: 2,
    points: sales,
    total_sales: sales,
    profit: classic - lean.shipping - lean.storage - lean.hosting,
    batches_created: s.game.batches.length,
    batches_processed: decided.length,
    published_jokes: published,
    unprocessed_batches: waiting,
    unsold_jokes: Math.max(0, published - sales),
    jokes_created: created,
    jokes_published: published,
    cost_breakdown: {
      revenue: sales * fees.marketPrice,
      publish_cost: published * fees.costOfPublishing,
      discard_cost: (created - published) * fees.costOfDiscard,
      profit: classic,
    },
    lean: leanStats,
  };
  const qcQueue = s.game.qcQueue ? { ...s.game.qcQueue, queue_size: waiting } : null;
  return { ...s, game: { ...s.game, teamSummary: summary, qcQueue } };
}

const withUi = (s: DemoState, ui: Partial<DemoUi>): DemoState => settle({ ...s, ui: { ...s.ui, ...ui } });
const withGame = (s: DemoState, game: Partial<DemoGameData>): DemoState => settle({ ...s, game: { ...s.game, ...game } });
const mapBatch = (s: DemoState, id: number, f: (b: Batch) => Batch): DemoState =>
  withGame(s, { batches: s.game.batches.map(b => (b.batch_id === id ? f(b) : b)) });
const mapJoke = (s: DemoState, batchId: number, n: number, f: (j: Joke) => Joke): DemoState =>
  mapBatch(s, batchId, b => ({ ...b, jokes: b.jokes.map((j, i) => (i === n ? f(j) : j)) }));
const clockAt = (s: DemoState, seconds: number): DemoState => withUi(s, { clockMs: at(seconds) });

/* ---------------------------------------------------------------- the start */

function demoUser(role: TourRole): User {
  return {
    user_id: 900, display_name: 'You', role: role as Role, team_id: DEMO_TEAM_ID,
    id: '900', name: 'You', team: String(DEMO_TEAM_ID), wallet: 0, purchasedJokes: [],
  };
}

function demoConfig(o: DemoOptions): GameConfig {
  return {
    status: 'PLAYING', round: o.roundNumber, isActive: true, showTeamPopup: false, startTime: null, elapsedTime: 0,
    customerBudget: 3, round1BatchSize: 5, round2BatchLimit: 10,
    marketPrice: o.fees.marketPrice, costOfPublishing: o.fees.costOfPublishing, costOfDiscard: o.fees.costOfDiscard,
    marketingNudge1Seconds: 60, marketingNudge2Seconds: 45, idealProfile: {},
    marketMode: 'LEAN', arrivalWindowSeconds: 900, setupCostPerBatch: 0, carryingCostPerJokeMinute: 0, wipLimit: 0,
    shippingFeeSmall: o.fees.shippingFeeSmall, shippingFeeStandard: o.fees.shippingFeeStandard,
    shippingFeeLarge: o.fees.shippingFeeLarge, storageFeePerJokeMinute: o.fees.storageFeePerJokeMinute,
    hostingFeePerJokeMinute: o.fees.hostingFeePerJokeMinute, customersPerTeam: 18,
  };
}

const EARLIER_FEEDBACK: TeamFeedbackResponse = {
  jokes: [
    {
      joke_id: demoJokeId(EARLIER_BATCH_ID, 3), joke_title: 'Desk Plant Solidarity', was_bought: true,
      good_dimensions: ['TOPIC', 'LENGTH', 'CLARITY'], improve_dimensions: ['WORDPLAY'],
    },
    {
      joke_id: demoJokeId(EARLIER_BATCH_ID, 2), joke_title: 'Coffee Confidential', was_bought: true,
      good_dimensions: ['TOPIC', 'STRUCTURE'], improve_dimensions: ['FRESHNESS', 'WORDPLAY'],
    },
    {
      joke_id: demoJokeId(EARLIER_BATCH_ID, 0), joke_title: 'Reaction Overload', was_bought: false,
      good_dimensions: ['LENGTH'], improve_dimensions: ['TOPIC', 'SETUP_PAYOFF', 'TITLE_FIT'],
    },
  ],
};

/** Team Demo when the tour opens: one earlier batch on the market, 4 of its 5 jokes sold. */
export function initialDemoState(options: DemoOptions): DemoState {
  const earlier = batch(
    EARLIER_BATCH_ID,
    EARLIER_JOKES.map((text, n) => joke(demoJokeId(EARLIER_BATCH_ID, n), text, {
      is_published: true, sold_count: EARLIER_SALES[n],
    })),
    DEMO_TIMES.earlierSent,
    { status: 'PROCESSED', rated_at: iso(DEMO_TIMES.earlierReleased), ratedAt: at(DEMO_TIMES.earlierReleased) },
  );
  return settle({
    options,
    ui: { ...EMPTY_DEMO_UI, clockMs: at(DEMO_TIMES.tourStart) },
    game: {
      user: demoUser(options.role),
      roster: [demoUser(options.role)],
      config: demoConfig(options),
      teamNames: { [String(DEMO_TEAM_ID)]: DEMO_TEAM_NAME },
      batches: [earlier],
      sales: {},
      roundId: 1,
      roundIds: { 1: 1, 2: null },
      roundStatuses: { 1: 'ACTIVE', 2: null },
      marketItems: [],
      teamSummary: null,
      teamFeedback: EARLIER_FEEDBACK,
      instructorLobby: null,
      instructorStats: null,
      instructorStatsRound1: null,
      instructorStatsRound2: null,
      qcQueue: null,
    },
  });
}

/* ---------------------------------------------------------------- script: Joke Maker */

/** The textbox holds the pasted batch (typed in by the stage). */
export const typeDraft = (s: DemoState) => withUi(s, { jmDraft: DEMO_RAW_BATCH });
/** "I certify these jokes are not offensive." is ticked. */
export const certify = (s: DemoState) => withUi(s, { jmCertified: true });

/** Send to Marketing: the textbox clears and batch #102 waits for Marketing. */
export function sendBatch(s: DemoState): DemoState {
  const cleared = clockAt(withUi(s, { jmDraft: '', jmCertified: false }), DEMO_TIMES.sent);
  return withGame(cleared, { batches: [...cleared.game.batches, waitingBatch(SENT_BATCH_ID, DEMO_TIMES.sent)] });
}

/** The sent batch's row is expanded in Value stream. */
export const openSentBatch = (s: DemoState) => withUi(s, { jmOpenBatchIds: [String(SENT_BATCH_ID)] });

/* ---------------------------------------------------------------- script: Marketing */

function landOnDesk(s: DemoState, id: number, sentS: number, seenS: number): DemoState {
  const withBatch = clockAt(withGame(s, { batches: [...s.game.batches, waitingBatch(id, sentS)] }), seenS);
  return withGame(withBatch, {
    qcQueue: {
      batch: { batch_id: id, round_id: 1, team_id: DEMO_TEAM_ID, submitted_at: iso(sentS), raw_text: DEMO_RAW_BATCH },
      jokes: [],
      queue_size: 0,
    },
  });
}

/** The Joke Maker's batch #102 lands on Marketing's desk, not yet split. */
export const batchArrives = (s: DemoState) => landOnDesk(s, SENT_BATCH_ID, DEMO_TIMES.sent, DEMO_TIMES.arrivedOnDesk);

/** Marketing splits the batch on its desk into its five jokes. */
export function splitOnDesk(s: DemoState): DemoState {
  if (!s.game.qcQueue) return s;
  const id = s.game.qcQueue.batch.batch_id;
  return withGame(s, {
    qcQueue: { ...s.game.qcQueue, jokes: DEMO_JOKES.map((text, n) => ({ joke_id: demoJokeId(id, n) as JokeId, joke_text: text })) },
  });
}

/** Marketing selects the k-th joke it keeps. */
export const pick = (k: number) => (s: DemoState): DemoState => {
  const id = demoJokeId(SENT_BATCH_ID, DEMO_KEEP[k].index);
  return s.ui.mkSelectedIds.includes(id) ? s : withUi(s, { mkSelectedIds: [...s.ui.mkSelectedIds, id] });
};

/** Every kept joke gets its Topic and title (the stage types the first title in). */
export function topicsAndTitles(s: DemoState): DemoState {
  const mkTopics: Record<number, string> = {};
  const mkTitles: Record<number, string> = {};
  for (const k of DEMO_KEEP) {
    const id = demoJokeId(SENT_BATCH_ID, k.index);
    mkTopics[id] = k.topic;
    mkTitles[id] = k.title;
  }
  return withUi(s, { mkSelectedIds: DEMO_KEEP.map(k => demoJokeId(SENT_BATCH_ID, k.index)), mkTopics, mkTitles });
}

/** The note box holds Marketing's note (typed in by the stage). */
export const writeNote = (s: DemoState) => withUi(s, { mkNote: DEMO_NOTE });

/** "More numbers" opens, showing the Shipping, Storage and Hosting fee tiles. */
export const openMore = (s: DemoState) => withUi(s, { moreOpen: true });

/** The next batch, #103, has been waiting on Marketing's desk for 52 s. */
export const nextBatchArrives = (s: DemoState) => landOnDesk(s, NEXT_BATCH_ID, DEMO_TIMES.nextSent, DEMO_TIMES.nextSeen);

/* ---------------------------------------------------------------- both tours */

/** Marketing releases #102: 3 jokes on the market, 2 dropped, with its note. The desk is clear again. */
export function releaseSentBatch(s: DemoState): DemoState {
  const keep = new Set(DEMO_KEEP.map(k => k.index));
  const released = mapBatch(s, SENT_BATCH_ID, b => ({
    ...b,
    status: 'PROCESSED',
    rated_at: iso(DEMO_TIMES.released),
    ratedAt: at(DEMO_TIMES.released),
    marketing_note: DEMO_NOTE,
    jokes: DEMO_JOKES.map((text, n) => joke(demoJokeId(SENT_BATCH_ID, n), text, { is_published: keep.has(n), sold_count: 0 })),
  }));
  const cleared = withUi(released, { mkSelectedIds: [], mkTopics: {}, mkTitles: {}, mkNote: '' });
  return clockAt(withGame(cleared, { qcQueue: null }), DEMO_TIMES.released);
}

/** A customer buys the first joke Marketing kept. */
export const firstSale = (s: DemoState) =>
  mapJoke(s, SENT_BATCH_ID, DEMO_KEEP[0].index, j => ({ ...j, sold_count: (j.sold_count ?? 0) + 1 }));

/** The customers' read on that sale reaches Marketing's feedback card: ✓ and ✗ criteria boxes. */
export function customersReport(s: DemoState): DemoState {
  const id = demoJokeId(SENT_BATCH_ID, DEMO_KEEP[0].index);
  const rest = (s.game.teamFeedback?.jokes ?? []).filter(j => j.joke_id !== id);
  return withGame(s, {
    teamFeedback: {
      jokes: [
        {
          joke_id: id, joke_title: DEMO_KEEP[0].title, was_bought: true,
          good_dimensions: ['TOPIC', 'LENGTH', 'STRUCTURE'], improve_dimensions: ['WORDPLAY'],
        },
        ...rest,
      ],
    },
  });
}

/* ---------------------------------------------------------------- frames */

/** Typing finishes at this share of its step. */
export const TYPING_SHARE = 0.7;

/** Characters shown at `elapsedMs` into a typing step; everything at once with reduced motion. */
export function typedLength(length: number, elapsedMs: number, durationMs: number, reducedMotion: boolean): number {
  if (reducedMotion) return length;
  const share = Math.min(1, Math.max(0, elapsedMs / (durationMs * TYPING_SHARE)));
  return Math.floor(length * share);
}

function typingValue(ui: DemoUi, field: TypingField): string {
  if (field === 'jmDraft') return ui.jmDraft;
  if (field === 'mkNote') return ui.mkNote;
  const first = ui.mkSelectedIds[0];
  return first == null ? '' : ui.mkTitles[first] ?? '';
}

/** The ui with `field` cut to its first `chars` characters. */
export function revealTyping(ui: DemoUi, field: TypingField, chars: number): DemoUi {
  const text = typingValue(ui, field).slice(0, Math.max(0, chars));
  if (field === 'jmDraft') return { ...ui, jmDraft: text };
  if (field === 'mkNote') return { ...ui, mkNote: text };
  const first = ui.mkSelectedIds[0];
  return first == null ? ui : { ...ui, mkTitles: { ...ui.mkTitles, [first]: text } };
}

const sortedBeats = (step: DemoStep) => [...(step.beats ?? [])].sort((a, b) => a.atMs - b.atMs);

/**
 * The state for step k, `elapsedMs` into it, rebuilt from scratch: the onEnter
 * and every beat of the steps before k, then step k's onEnter and its beats
 * whose time has come. Same arguments, same state.
 */
export function buildDemoState(steps: ReadonlyArray<DemoStep>, k: number, options: DemoOptions, elapsedMs = 0): DemoState {
  let s = initialDemoState(options);
  const last = Math.min(Math.max(0, Math.floor(k)), steps.length - 1);
  for (let i = 0; i <= last; i++) {
    const step = steps[i];
    if (step.onEnter) s = step.onEnter(s);
    for (const beat of sortedBeats(step)) {
      if (i < last || beat.atMs <= elapsedMs) s = beat.apply(s);
    }
  }
  return s;
}

/** What the stage shows: buildDemoState, with step k's typing field part-typed. */
export function demoFrame(
  steps: ReadonlyArray<DemoStep>, k: number, options: DemoOptions, elapsedMs: number, reducedMotion: boolean,
): DemoState {
  const s = buildDemoState(steps, k, options, elapsedMs);
  const step = steps[Math.min(Math.max(0, k), steps.length - 1)];
  if (!step?.typing) return s;
  const full = typingValue(s.ui, step.typing).length;
  return { ...s, ui: revealTyping(s.ui, step.typing, typedLength(full, elapsedMs, stepDuration(step), reducedMotion)) };
}

/**
 * Changes exactly when demoFrame's result would: the step, the beats that have
 * fired, and how far the typing has got. The stage memoises on it, so the
 * clock's 100 ms ticks do not re-render the view in between.
 */
export function demoFrameKey(steps: ReadonlyArray<DemoStep>, k: number, elapsedMs: number, reducedMotion: boolean): string {
  const step = steps[k];
  if (!step) return `${k}`;
  const beats = (step.beats ?? []).filter(b => b.atMs <= elapsedMs).length;
  const typed = step.typing && !reducedMotion
    ? Math.floor(Math.min(1, Math.max(0, elapsedMs / (stepDuration(step) * TYPING_SHARE))) * 1000)
    : 0;
  return `${k}:${beats}:${typed}`;
}
