import { describe, expect, it } from 'vitest';
import { batchCurve, formatMeasure, MEASURES, measureValue, type MeasureId } from './measures';
import { RUN_RECORD_FORMAT, type RunBatch, type RunRecord, type RunRound, type RunTeam } from './types';

const batch = (seq: number, sent_s: number, jokes: number, released: number, sold: number, first_sale_s: number | null): RunBatch =>
  ({ seq, sent_s, jokes, released, sold, first_sale_s });

const team = (id: number, over: Partial<RunTeam> = {}): RunTeam => ({
  team_id: id, team: `Team ${id}`, profit: 0, sold: 0, released: 0, made: 0, never_sold: 0, discarded: 0,
  fees: { listing: 0, hosting: 0, shipping: 0, storage: 0, discard: 0, total: 0 },
  sent_to_released_s: null, to_first_sale_s: null, ...over,
});

const fees = (listing: number, hosting: number, total: number) => ({ listing, hosting, shipping: 0, storage: 0, discard: 0, total });

const round = (n: 1 | 2, teams: RunTeam[], settings: RunRound['settings'] = { market_price: 1 }): RunRound => ({
  round: n, round_id: n, status: 'ENDED', started_at: null, ended_at: null, settings, teams,
});

const record = (...rounds: RunRound[]): RunRecord => ({
  format: RUN_RECORD_FORMAT, version: 1, name: 'Run', played_by: 'students', exported_at: 'x', rounds,
});

/* Round 1: profits 4, -1, 3; sold 6+2+4 = 12; released 10+8+6 = 24; price 1 so revenue 12. */
const r1 = round(1, [
  team(1, {
    profit: 4, sold: 6, released: 10, never_sold: 2, fees: fees(1, 0.5, 2), sent_to_released_s: 20,
    batches: [batch(1, 10, 4, 4, 3, 5), batch(2, 60, 6, 6, 3, null)],
  }),
  team(2, {
    profit: -1, sold: 2, released: 8, never_sold: 6, fees: fees(2, 1, 4), sent_to_released_s: 40,
    batches: [batch(1, 20, 8, 8, 2, 15)],
  }),
  team(3, {
    profit: 3, sold: 4, released: 6, never_sold: null, fees: fees(1, 0.5, 1.5), sent_to_released_s: null,
    batches: [batch(1, 5, 2, 2, 2, 25), batch(2, 30, 4, 4, 2, 10)],
  }),
]);

/* Round 2: profits 6, -2, 3; sold 9+5+6 = 20; released 24. */
const r2 = round(2, [
  team(1, {
    profit: 6, sold: 9, released: 10, fees: fees(1, 0.5, 2),
    fit_by_batch: [{ seq: 1, fit: 3 }, { seq: 2, fit: null }, { seq: 3, fit: 7 }],
  }),
  team(2, { profit: -2, sold: 5, released: 8, fit_by_batch: [{ seq: 1, fit: 4 }, { seq: 2, fit: null }] }),
  team(3, { profit: 3, sold: 6, released: 6, fit_by_batch: [{ seq: 1, fit: 5 }, { seq: 2, fit: 6 }] }),
]);

const rec = record(r1, r2);
const v = (id: MeasureId, round: 1 | 2 = 1, r: RunRecord = rec) => measureValue(r, id, round);

describe('measureValue, round measures (Round 1 by hand)', () => {
  it('money', () => {
    expect(v('mean_profit')).toBeCloseTo(2, 10);
    expect(v('median_profit')).toBe(3);
    expect(v('teams_in_profit')).toBeCloseTo(66.6667, 3);
    expect(v('fees_total')).toBe(7.5);
    expect(v('fees_pct_revenue')).toBeCloseTo(62.5, 10);
    expect(v('listing')).toBe(4);
    expect(v('hosting')).toBe(2);
  });

  it('sales', () => {
    expect(v('sold')).toBe(12);
    expect(v('released')).toBe(24);
    expect(v('sold_share')).toBe(50);
    expect(v('never_sold')).toBe(8);
  });

  it('flow', () => {
    expect(v('batches_per_team')).toBeCloseTo(5 / 3, 10);
    expect(v('mean_batch_size')).toBeCloseTo(4.8, 10);
    expect(v('sent_to_released_s')).toBe(30);
    expect(v('send_to_first_sale_s')).toBeCloseTo(13.75, 10);
    expect(v('first_sale_in_round_s')).toBe(15);
  });

  it('reads the round it is asked for', () => {
    expect(v('mean_profit', 2)).toBeCloseTo(7 / 3, 10);
    expect(v('sold', 2)).toBe(20);
    expect(v('sold_share', 2)).toBeCloseTo(83.3333, 3);
  });

  it('is null for never_sold when every team has null', () => {
    const r = record(round(1, [team(1, { never_sold: null }), team(2, { never_sold: null })]));
    expect(v('never_sold', 1, r)).toBeNull();
  });

  it('takes the median of the middle two with four teams', () => {
    const r = record(round(1, [1, 10, 3, 2].map((p, i) => team(i + 1, { profit: p }))));
    expect(v('median_profit', 1, r)).toBe(2.5);
  });

  it('first sale in the round is the earliest sent_s + first_sale_s, ignoring batches with no sale', () => {
    const r = record(round(1, [team(1, { batches: [batch(1, 1, 1, 1, 0, null), batch(2, 50, 1, 1, 1, 2)] })]));
    expect(v('first_sale_in_round_s', 1, r)).toBe(52);
  });
});

describe('measureValue, change and bots measures', () => {
  it('profit_change, teams_improved, sold_share_change', () => {
    expect(v('profit_change')).toBeCloseTo(1 / 3, 10);
    expect(v('teams_improved')).toBeCloseTo(33.3333, 3);
    expect(v('sold_share_change')).toBeCloseTo(100 / 3, 10);
  });

  it('ignores the round argument for change measures', () => {
    expect(v('profit_change', 2)).toBe(v('profit_change', 1));
  });

  it('pairs teams by team_id and leaves out a team in only one round', () => {
    const r = record(
      round(1, [team(1, { profit: 1 }), team(2, { profit: 5 })]),
      round(2, [team(1, { profit: 4 }), team(3, { profit: 99 })]),
    );
    expect(v('profit_change', 1, r)).toBe(3);
    expect(v('teams_improved', 1, r)).toBe(100);
  });

  it('is null when no team is in both rounds', () => {
    const r = record(round(1, [team(1)]), round(2, [team(2)]));
    expect(v('profit_change', 1, r)).toBeNull();
    expect(v('teams_improved', 1, r)).toBeNull();
  });

  it('sold_share_change is null when either round released nothing', () => {
    const r = record(round(1, [team(1)]), round(2, [team(1, { sold: 1, released: 2 })]));
    expect(v('sold_share_change', 1, r)).toBeNull();
  });

  it('fit_gain: mean over Round 2 teams with at least two fits of last minus first', () => {
    // team 1: 7 - 3 = 4; team 2 has one non-null fit, left out; team 3: 6 - 5 = 1
    expect(v('fit_gain')).toBe(2.5);
  });

  it('fit_gain takes first and last fits by ascending seq, not stored order', () => {
    const r = record(r1, round(2, [
      team(1, { fit_by_batch: [{ seq: 2, fit: 6 }, { seq: 1, fit: 3 }] }),
      team(2, { fit_by_batch: [{ seq: 3, fit: 9 }, { seq: 1, fit: 5 }, { seq: 2, fit: null }] }),
    ]));
    // team 1: 6 - 3 = 3; team 2: 9 - 5 = 4
    expect(v('fit_gain', 1, r)).toBe(3.5);
  });

  it('fit_gain is null with no fit data', () => {
    expect(v('fit_gain', 1, record(r1, round(2, [team(1)])))).toBeNull();
  });
});

describe('measureValue, cannot be computed', () => {
  it('is null, never NaN or Infinity, when nothing was sold or released', () => {
    const r = record(round(1, [team(1), team(2)]));
    expect(v('sold_share', 1, r)).toBeNull();
    expect(v('fees_pct_revenue', 1, r)).toBeNull();
  });

  it('is null, not NaN, when a hand-edited record lacks a field', () => {
    const t = team(1, { released: 4 }) as unknown as Record<string, unknown>;
    delete t.sold;
    const r = record(round(1, [t as unknown as RunTeam]));
    expect(v('sold_share', 1, r)).toBeNull();
  });

  it('fees_pct_revenue is null with no price', () => {
    const r = record(round(1, [team(1, { sold: 2, fees: fees(1, 0, 1) })], {}));
    expect(v('fees_pct_revenue', 1, r)).toBeNull();
  });

  it('a Classic round has no Flow measures except sent_to_released_s', () => {
    const r = record(round(1, [team(1, { sent_to_released_s: 12 }), team(2, { sent_to_released_s: 18 })]));
    for (const id of ['batches_per_team', 'mean_batch_size', 'send_to_first_sale_s', 'first_sale_in_round_s'] as const) {
      expect(v(id, 1, r)).toBeNull();
    }
    expect(v('sent_to_released_s', 1, r)).toBe(15);
  });

  it('a Round 1-only record has no change measures, no fit_gain and no Round 2 values', () => {
    const r = record(r1);
    for (const id of ['profit_change', 'teams_improved', 'sold_share_change', 'fit_gain'] as const) {
      expect(v(id, 1, r)).toBeNull();
    }
    expect(v('mean_profit', 2, r)).toBeNull();
    expect(v('mean_profit', 1, r)).toBeCloseTo(2, 10);
  });

  it('a round with no teams gives null', () => {
    expect(v('mean_profit', 1, record(round(1, [])))).toBeNull();
  });
});

describe('MEASURES', () => {
  const ids: MeasureId[] = [
    'mean_profit', 'median_profit', 'teams_in_profit', 'fees_total', 'fees_pct_revenue', 'listing', 'hosting',
    'sold', 'released', 'sold_share', 'never_sold',
    'batches_per_team', 'mean_batch_size', 'sent_to_released_s', 'send_to_first_sale_s', 'first_sale_in_round_s',
    'profit_change', 'teams_improved', 'sold_share_change', 'fit_gain',
  ];

  it('lists every MeasureId exactly once', () => {
    expect(MEASURES.map(m => m.id).sort()).toEqual([...ids].sort());
    expect(new Set(MEASURES.map(m => m.id)).size).toBe(MEASURES.length);
  });

  it('carries the labels, units, directions and scopes of the spec', () => {
    const m = (id: MeasureId) => MEASURES.find(d => d.id === id)!;
    expect(m('mean_profit')).toMatchObject({ group: 'Money', label: 'Mean profit per team', unit: 'money', better: 'higher', scope: 'round' });
    expect(m('fees_total')).toMatchObject({ unit: 'money', better: 'lower' });
    expect(m('teams_in_profit')).toMatchObject({ unit: 'percent', better: 'higher' });
    expect(m('never_sold')).toMatchObject({ group: 'Sales', unit: 'count', better: 'lower' });
    expect(m('mean_batch_size')).toMatchObject({ group: 'Flow', unit: 'number', better: 'lower' });
    expect(m('first_sale_in_round_s')).toMatchObject({ label: 'First sale in the round', unit: 'seconds', better: 'lower' });
    expect(m('sold_share_change')).toMatchObject({ group: 'Round 1 → 2', unit: 'points', scope: 'change' });
    expect(m('fit_gain')).toMatchObject({ group: 'Bots only', unit: 'number', better: 'higher', scope: 'bots' });
  });
});

describe('formatMeasure', () => {
  it('null is an en dash for every unit', () => {
    for (const u of ['money', 'percent', 'points', 'count', 'seconds', 'number'] as const) expect(formatMeasure(null, u)).toBe('–');
  });
  it('money', () => {
    expect(formatMeasure(1.234, 'money')).toBe('$1.23');
    expect(formatMeasure(-1.25, 'money')).toBe('−$1.25');
  });
  it('percent is whole', () => {
    expect(formatMeasure(45.4, 'percent')).toBe('45%');
    expect(formatMeasure(66.67, 'percent')).toBe('67%');
  });
  it('points carry a sign', () => {
    expect(formatMeasure(3, 'points')).toBe('+3 pts');
    expect(formatMeasure(-3, 'points')).toBe('−3 pts');
    expect(formatMeasure(0.2, 'points')).toBe('0 pts');
  });
  it('count is whole, seconds are m:ss, number has one decimal', () => {
    expect(formatMeasure(12, 'count')).toBe('12');
    expect(formatMeasure(8.4, 'count')).toBe('8');
    expect(formatMeasure(75, 'seconds')).toBe('1:15');
    expect(formatMeasure(4.8, 'number')).toBe('4.8');
    expect(formatMeasure(2, 'number')).toBe('2.0');
    expect(formatMeasure(-1.5, 'number')).toBe('−1.5');
  });
});

describe('batchCurve', () => {
  it('sold_share pools teams by seq: sold over released', () => {
    const r = record(round(1, [
      team(1, { batches: [batch(1, 0, 5, 4, 2, 1), batch(2, 0, 3, 3, 3, 1)] }),
      team(2, { batches: [batch(1, 0, 1, 1, 1, 1)] }),
    ]));
    expect(batchCurve(r, 1, 'sold_share')).toEqual([{ seq: 1, value: 60 }, { seq: 2, value: 100 }]);
  });

  it('omits a seq where nothing was released, and sorts by seq', () => {
    const r = record(round(1, [
      team(1, { batches: [batch(3, 0, 2, 2, 1, 1), batch(2, 0, 2, 0, 0, null), batch(1, 0, 2, 2, 2, 1)] }),
    ]));
    expect(batchCurve(r, 1, 'sold_share')).toEqual([{ seq: 1, value: 100 }, { seq: 3, value: 50 }]);
  });

  it('is empty for a Classic round or a missing round', () => {
    expect(batchCurve(record(round(1, [team(1)])), 1, 'sold_share')).toEqual([]);
    expect(batchCurve(record(r1), 2, 'sold_share')).toEqual([]);
  });

  it('fit averages fit_by_batch per seq, skipping nulls and omitting seqs with no fit', () => {
    expect(batchCurve(rec, 2, 'fit')).toEqual([
      { seq: 1, value: 4 }, // 3, 4, 5
      { seq: 2, value: 6 }, // null, null, 6
      { seq: 3, value: 7 },
    ]);
    const none = record(round(2, [team(1, { fit_by_batch: [{ seq: 1, fit: null }] })]));
    expect(batchCurve(none, 2, 'fit')).toEqual([]);
  });
});
