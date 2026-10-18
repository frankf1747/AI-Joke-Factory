/* The two student tours (spec §4): the Joke Maker's and Marketing's, about a
   minute each. Captions are the spec's copy; every amount in them is read from
   the round (stepsFor fills them in), formatted as the game formats money:
   fmtFee for prices and fees ("$2", "$0.10"), cents for per-minute rates
   ("5¢"). The only round-dependent copy is the Joke Maker's shipping step.

   `target` is a data-tour id on the real screen (views/JokeMaker.tsx,
   views/QualityControl.tsx, components/StatTiles.tsx,
   components/CustomerFeedbackCard.tsx); null shows a centred card. */
import { fmtCents, fmtFee, fmtPerMinute } from '../leanMode';
import {
  batchArrives, certify, customersReport, firstSale, nextBatchArrives, openFees, openSentBatch, pick,
  releaseSentBatch, sendBatch, splitOnDesk, swapOutSale, topicsAndTitles, typeDraft, writeNote,
  type DemoStep, type TourRound,
} from './demoScript';
import type { TourRole } from './seen';

export const JOKE_MAKER_STEPS: readonly DemoStep[] = [
  {
    id: 'jm-welcome', target: null,
    title: "You're the Joke Maker.",
    body: "Your team earns money when AI customers buy your jokes. Here's your screen in one minute.",
  },
  {
    id: 'jm-next', target: 'jm-next-step',
    title: 'Your next step.',
    body: "The top of the Production line watches the game and tells you what to do next. Glance at it whenever you're unsure.",
  },
  {
    id: 'jm-write', target: 'jm-draft', durationMs: 7000,
    title: 'Write, then paste.',
    body: 'Write jokes with your AI tool and paste the whole reply here. Marketing splits it into separate jokes.',
    onEnter: typeDraft, typing: 'jmDraft',
  },
  {
    id: 'jm-send', target: 'jm-send',
    title: 'Send a batch.',
    body: 'Tick the box and press Send to Marketing. Each send is one batch.',
    onEnter: certify, beats: [{ atMs: 3000, apply: sendBatch }],
  },
  {
    id: 'jm-shipping', target: 'jm-shipping',
    title: 'Every batch pays shipping.',
    body: ({ roundNumber, fees }) => (roundNumber === 1
      ? `Each batch of 5 costs ${fmtFee(fees.shippingFeeStandard)} to ship, so keep them coming but make them count.`
      : `You choose the size now: ${fmtFee(fees.shippingFeeSmall)} for 1–4 jokes, ${fmtFee(fees.shippingFeeStandard)} for 5, ${fmtFee(fees.shippingFeeLarge)} for 6–10. Smaller batches come back with feedback sooner.`),
  },
  {
    id: 'jm-value-stream', target: 'jm-value-stream',
    title: 'Follow your batches.',
    body: 'Each row is a batch and each square is a joke. Outline means with Marketing, green is selling, amber is waiting for a buyer, pale green sold before but lost its buyer, and grey was not released. Open a row to see each joke.',
    beats: [{ atMs: 2000, apply: releaseSentBatch }, { atMs: 3000, apply: swapOutSale }, { atMs: 4000, apply: firstSale }],
  },
  {
    id: 'jm-note', target: 'jm-marketing-note',
    title: "Read Marketing's note.",
    body: "Open a batch and Marketing's note sits above its jokes. It says what customers liked and what to change. Read it before you write the next batch.",
    onEnter: openSentBatch,
  },
  {
    id: 'jm-scoreboard', target: 'jm-stats', durationMs: 9000,
    title: 'Your scoreboard.',
    body: 'Team rank, by profit, is your place among all teams, and profit is sales minus fees. "Found a buyer" counts the jokes that have sold. "Fees and wait times" shows where the money went.',
  },
  {
    id: 'jm-customers', target: null, durationMs: 9000,
    title: 'How customers buy.',
    body: 'AI customers are picky: they judge every joke on 12 criteria and only buy the ones that fit what they like. Better-aimed jokes beat lots of random ones.',
  },
  {
    id: 'jm-goal', target: null, finishLabel: 'Start',
    title: 'Your goal.',
    body: 'Keep the line moving, learn from each batch, and improve the next one.',
  },
];

export const MARKETING_STEPS: readonly DemoStep[] = [
  {
    id: 'mk-welcome', target: null,
    title: "You're Marketing.",
    body: ({ fees }) => `You decide which jokes go to market. Listing a joke costs ${fmtFee(fees.costOfPublishing)}, and each sale earns ${fmtFee(fees.marketPrice)}.`,
  },
  {
    id: 'mk-next', target: 'mk-next-step',
    title: 'Your next step.',
    body: "The top of the Marketing desk watches the game and tells you what to do next. Glance at it whenever you're unsure.",
  },
  {
    id: 'mk-arrives', target: 'mk-desk',
    title: 'A batch arrives.',
    body: "Your Joke Maker's batch lands on your desk. Cut it into separate jokes: click between two jokes and press Enter.",
    onEnter: batchArrives, beats: [{ atMs: 3000, apply: splitOnDesk }],
  },
  {
    id: 'mk-pick', target: 'mk-jokes', durationMs: 9000,
    title: 'Pick the winners, quickly.',
    body: ({ fees }) => `Tick the jokes customers will buy and leave the rest to be discarded (discarding costs ${fmtFee(fees.costOfDiscard)}). Don't be too strict: customers can only buy what's on the shelf.`,
    onEnter: pick(0), beats: [{ atMs: 1500, apply: pick(1) }, { atMs: 3000, apply: pick(2) }],
  },
  {
    id: 'mk-title', target: 'mk-topic-title',
    title: 'Topic and title.',
    body: 'Choose a topic from the dropdown and write a title for each joke you sell. A good title helps it sell.',
    onEnter: topicsAndTitles, typing: 'mkTitle',
  },
  {
    id: 'mk-note', target: 'mk-note', durationMs: 7000,
    title: 'Tell your Joke Maker.',
    body: 'Say what to change next. Your note is sent with this batch.',
    onEnter: writeNote, typing: 'mkNote',
  },
  {
    id: 'mk-release', target: 'mk-release', durationMs: 5000,
    title: 'Release.',
    body: 'Release to market puts the jokes you ticked on the market, where customers start buying. The tally beside it shows what it costs.',
  },
  {
    id: 'mk-scoreboard', target: 'mk-stats',
    title: 'Your scoreboard.',
    body: 'Your team rank, by profit, sits beside your profit and sales. "Found a buyer" shows how many of your released jokes have sold so far.',
    onEnter: releaseSentBatch, beats: [{ atMs: 3000, apply: firstSale }],
  },
  {
    id: 'mk-fees', target: 'mk-more', durationMs: 9000,
    title: 'Fees add up.',
    body: ({ fees }) => `"Fees and wait times" shows where your sales went. Every batch pays shipping. A batch waiting on your desk pays storage (${fmtCents(fees.storageFeePerJokeMinute)} a joke each minute), and an unsold joke pays hosting (${fmtPerMinute(fees.hostingFeePerJokeMinute)}). Release quickly.`,
    onEnter: s => nextBatchArrives(openFees(s)),
  },
  {
    id: 'mk-feedback', target: 'mk-feedback',
    title: 'What customers said.',
    body: 'For your latest jokes: which criteria landed and which missed. It never says by how much.',
    onEnter: customersReport,
  },
  {
    id: 'mk-expand', target: 'mk-expand', durationMs: 5000,
    title: 'Keep it in view.',
    body: 'Pop out opens a window that stays on top while you work. It groups the criteria into "Fix next" and "Keep doing".',
  },
  {
    id: 'mk-goal', target: null, finishLabel: 'Start',
    title: 'Your goal.',
    body: 'Ship what sells, tell your Joke Maker why, and improve every batch.',
  },
];

/** A step's caption, with the round's amounts filled in. */
export function captionText(step: Pick<DemoStep, 'body'>, round: TourRound): string {
  return typeof step.body === 'function' ? step.body(round) : step.body;
}

/** The role's tour for this round, every caption filled in from the round. */
export function stepsFor(role: TourRole, round: TourRound): DemoStep[] {
  const all = role === 'JOKE_MAKER' ? JOKE_MAKER_STEPS : MARKETING_STEPS;
  return all.map(step => ({ ...step, body: captionText(step, round) }));
}
