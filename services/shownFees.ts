/* Which fees a round charges, and a team's fees by kind
   (docs/superpowers/specs/2026-11-10-two-costs-feedback-bots-design.md §2.2).
   The default round charges two costs, both Marketing's: listing
   (cost_of_publishing, once per released joke) and hosting (per joke-minute a
   released joke has not sold). A fee whose amount is 0 for the round is not
   shown anywhere, so an old round with shipping still shows shipping, and a
   class that sets storage back above 0 sees storage again. */
import { leanFeesOf } from './leanMode';

/** The round's fee amounts, as GameConfig carries them. */
export interface FeeRates {
  costOfPublishing: number;
  costOfDiscard: number;
  shippingFeeSmall: number;
  shippingFeeStandard: number;
  shippingFeeLarge: number;
  storageFeePerJokeMinute: number;
  hostingFeePerJokeMinute: number;
}

export type FeeKind = 'listing' | 'hosting' | 'shipping' | 'storage' | 'discard';

/** Display order everywhere a list of fees is written out. */
export const FEE_KINDS: readonly FeeKind[] = ['listing', 'hosting', 'shipping', 'storage', 'discard'];

export type ShownFees = Readonly<Record<FeeKind, boolean>>;

/** Every fee shown: what a caller that knows no round falls back to. */
export const ALL_FEES_SHOWN: ShownFees = { listing: true, hosting: true, shipping: true, storage: true, discard: true };

const charged = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v) && v > 0;

/** A fee is shown when the round charges it: an amount above 0 (any shipping tier for shipping). */
export function shownFees(r: Partial<FeeRates> | null | undefined): ShownFees {
  return {
    listing: charged(r?.costOfPublishing),
    hosting: charged(r?.hostingFeePerJokeMinute),
    shipping: charged(r?.shippingFeeSmall) || charged(r?.shippingFeeStandard) || charged(r?.shippingFeeLarge),
    storage: charged(r?.storageFeePerJokeMinute),
    discard: charged(r?.costOfDiscard),
  };
}

/** A team's fees so far, in dollars, by kind. */
export type TeamFees = Record<FeeKind, number>;

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * One team's fees: shipping, storage and hosting from its Lean stats (an older
 * backend's setup and carrying costs, see leanFeesOf), listing and discard from
 * its released and discarded jokes at the round's prices. Never NaN.
 */
export function teamFees(
  row: { lean?: Parameters<typeof leanFeesOf>[0]; published_jokes?: unknown; discarded_jokes?: unknown },
  rates: Pick<FeeRates, 'costOfPublishing' | 'costOfDiscard'> | null | undefined,
): TeamFees {
  const lean = leanFeesOf(row.lean);
  return {
    ...lean,
    listing: num(row.published_jokes) * num(rates?.costOfPublishing),
    discard: num(row.discarded_jokes) * num(rates?.costOfDiscard),
  };
}

/** Every fee added up: profit = sales × price − this. */
export function feesTotal(f: TeamFees): number {
  return FEE_KINDS.reduce((sum, k) => sum + f[k], 0);
}

/** "listing and hosting", "listing, hosting and shipping": the shown fees in words; "no fees" when none. */
export function feeNames(shown: ShownFees): string {
  const names = FEE_KINDS.filter(k => shown[k]);
  if (names.length === 0) return 'no fees';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
