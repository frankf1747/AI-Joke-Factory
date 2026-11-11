/* Each round's own fee amounts, for the Instructor's Live and Debrief tables.
   The backend prices a round's profit with that round's stored listing and
   discard (and its Lean fees), so Round 1's Fees column is priced from Round 1's
   stored config, not from the round selected in Setup. Both rounds normally
   play one set of fees; this keeps the identity sales × price − fees = profit
   per round even when they differ (an old game, or a round started before a
   later edit). GET /v1/instructor/rounds/:id/config returns the stored round. */
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { instructorService } from './instructorService';
import type { FeeRates } from './shownFees';

const FEE_FIELDS: ReadonlyArray<[keyof FeeRates, string]> = [
  ['costOfPublishing', 'cost_of_publishing'],
  ['costOfDiscard', 'cost_of_discard'],
  ['shippingFeeSmall', 'shipping_fee_small'],
  ['shippingFeeStandard', 'shipping_fee_standard'],
  ['shippingFeeLarge', 'shipping_fee_large'],
  ['storageFeePerJokeMinute', 'storage_fee_per_joke_minute'],
  ['hostingFeePerJokeMinute', 'hosting_fee_per_joke_minute'],
];

/** The fee amounts a stored round carries; a field it lacks (or a bad value) is left out. */
export function feeRatesFromRound(round: Record<string, unknown> | null | undefined): Partial<FeeRates> {
  const out: Partial<FeeRates> = {};
  for (const [key, field] of FEE_FIELDS) {
    const v = round?.[field];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) out[key] = v;
  }
  return out;
}

/** The round's stored amounts over the selected config's (used until the round has been read). */
export function ratesFor(stored: Partial<FeeRates> | null | undefined, fallback: FeeRates): FeeRates {
  const base: FeeRates = {
    costOfPublishing: fallback.costOfPublishing,
    costOfDiscard: fallback.costOfDiscard,
    shippingFeeSmall: fallback.shippingFeeSmall,
    shippingFeeStandard: fallback.shippingFeeStandard,
    shippingFeeLarge: fallback.shippingFeeLarge,
    storageFeePerJokeMinute: fallback.storageFeePerJokeMinute,
    hostingFeePerJokeMinute: fallback.hostingFeePerJokeMinute,
  };
  return { ...base, ...(stored ?? {}) };
}

type RoundNo = 1 | 2;
export type StoredRoundRates = Record<RoundNo, Partial<FeeRates> | null>;
type ReadRates = Record<RoundNo, { id: number; rates: Partial<FeeRates> } | null>;

/**
 * Reads each round's stored fee amounts. A round is read again when its id or
 * status changes, and before its start whenever `refreshKey` changes (the
 * selected config's fees, so a Setup edit is picked up). A failed read keeps
 * the last good one; a round never read (or read for another id, as after
 * Reset Game) is null, and the caller then prices it with the selected config.
 */
export function useRoundRates(
  ids: Readonly<Record<RoundNo, number | null>>,
  statuses: Readonly<Record<RoundNo, string | null>>,
  refreshKey: string,
): StoredRoundRates {
  const [read, setRead] = useState<ReadRates>({ 1: null, 2: null });
  useRoundRead(1, ids[1], statuses[1], refreshKey, setRead);
  useRoundRead(2, ids[2], statuses[2], refreshKey, setRead);
  return {
    1: read[1] && read[1].id === ids[1] ? read[1].rates : null,
    2: read[2] && read[2].id === ids[2] ? read[2].rates : null,
  };
}

function useRoundRead(
  n: RoundNo, id: number | null, status: string | null, refreshKey: string,
  setRead: Dispatch<SetStateAction<ReadRates>>,
): void {
  // A started round's fees are locked, so its key stops following the Setup edits.
  const key = status === 'ACTIVE' || status === 'ENDED' ? `started:${status}` : `open:${refreshKey}`;
  useEffect(() => {
    if (id == null) return;
    let cancelled = false;
    instructorService.getRoundConfig(id).then(
      res => {
        if (cancelled) return;
        const rates = feeRatesFromRound(res?.round as unknown as Record<string, unknown>);
        if (Object.keys(rates).length > 0) setRead(prev => ({ ...prev, [n]: { id, rates } }));
      },
      () => { /* keep the last good read; the caller falls back to the selected config */ },
    );
    return () => { cancelled = true; };
  }, [n, id, key, setRead]);
}
