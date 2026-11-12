/* What the pilot writes into a run record (docs/superpowers/specs/2026-11-12-experiment-records-design.md §6):
   the bot each team was created with, its fit per batch, the file name. Pure. */
import type { BotTeamSpec } from '../../services/bots/protocol';
import { feeRatesFromRound, ratesFor } from '../../services/roundRates';
import { fileSafeName } from '../../services/runRecord/build';
import type { RunBot } from '../../services/runRecord/types';
import type { FeeRates } from '../../services/shownFees';
import type { InstructorRound } from '../../types/api';
import type { BatchFit } from './feedbackReport';

const ZERO_RATES: FeeRates = {
  costOfPublishing: 0, costOfDiscard: 0, shippingFeeSmall: 0, shippingFeeStandard: 0, shippingFeeLarge: 0,
  storageFeePerJokeMinute: 0, hostingFeePerJokeMinute: 0,
};

/** A round's fee amounts as its stored config carries them; a fee the config lacks is 0. */
export function pilotRates(config: InstructorRound): FeeRates {
  return ratesFor(feeRatesFromRound(config as unknown as Record<string, unknown>), ZERO_RATES);
}

/** The bot fields of a pilot team; release_all only when the spec sets it. */
export function botOf(
  spec: Pick<BotTeamSpec, 'persona' | 'useFeedback' | 'round2BatchSize' | 'releaseAll'>, seed: string,
): RunBot {
  const bot: RunBot = { persona: spec.persona };
  if (spec.useFeedback != null) bot.use_feedback = spec.useFeedback;
  if (spec.round2BatchSize != null) bot.round2_batch_size = spec.round2BatchSize;
  if (spec.releaseAll != null) bot.release_all = spec.releaseAll;
  bot.seed = seed;
  return bot;
}

export function fitsOf(fits: readonly BatchFit[]): Array<{ seq: number; fit: number | null }> {
  return fits.map(f => ({ seq: f.seq, fit: f.meanFit }));
}

export function recordFileName(costsLabel: string, classNo: number): string {
  return `${fileSafeName(`${costsLabel} class ${classNo}`)}.jfrun.json`;
}
