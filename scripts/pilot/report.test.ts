import { describe, expect, it } from 'vitest';
import {
  SPEC_FEES, feesOf, isLocalUrl, markdown, parseTuning, pilotConfig, settingsLines, spearman, successChecks, summarise,
  teamRowFrom, type RunResult, type TeamRow,
} from './report';

const row = (persona: string, over: Partial<TeamRow> = {}, teamId = 1): TeamRow => ({
  teamId, persona, revenue: 40, shipping: 16, storage: 2, hosting: 1, listing: 1, discard: 0, profit: 20,
  batches: 8, meanBatchSize: 5, sendToFirstSaleS: 120, ...over,
});
const run = (round: 1 | 2, rows: TeamRow[]): RunResult => ({ round, durationS: 100, calls: 30, rows });

/** A class where every check passes: Spray pays 45 % in fees, the Learner sells soonest, holding never pays. */
const passing = (): RunResult[] => [
  run(1, [
    row('SPRAY', { revenue: 40, shipping: 16, storage: 1, hosting: 0.5, listing: 0.5, profit: 20, batches: 8 }, 1),
    row('CAREFUL', { revenue: 20, shipping: 8, storage: 1, hosting: 1, listing: 0.2, profit: 9.8, batches: 4 }, 2),
    row('LEARNER', { revenue: 30, shipping: 12, storage: 0.5, hosting: 1, listing: 0.3, profit: 16.2, batches: 6 }, 3),
  ]),
  run(2, [
    row('SPRAY', { revenue: 30, shipping: 12, storage: 6, hosting: 2, listing: 4, profit: 6, batches: 4, meanBatchSize: 10, sendToFirstSaleS: 150 }, 1),
    row('CAREFUL', { revenue: 25, shipping: 8, storage: 1, hosting: 1, listing: 1, profit: 14, batches: 4, meanBatchSize: 5, sendToFirstSaleS: 120 }, 2),
    row('LEARNER', { revenue: 35, shipping: 13, storage: 0.2, hosting: 0.5, listing: 1, profit: 20.3, batches: 13, meanBatchSize: 3, sendToFirstSaleS: 60 }, 3),
  ]),
];

describe('pilot summary', () => {
  it('means each column per persona and round, with fees as a share of revenue', () => {
    const s = summarise([run(1, [row('SPRAY', {}, 1), row('SPRAY', { revenue: 60, profit: 40, sendToFirstSaleS: null }, 2)])]);
    expect(s[1].SPRAY.n).toBe(2);
    expect(s[1].SPRAY.revenue).toBe(50);
    expect(s[1].SPRAY.profit).toBe(30);
    expect(s[1].SPRAY.sendToFirstSaleS).toBe(120);
    expect(s[1].SPRAY.feesPct).toBeCloseTo((20 / 50) * 100);
    expect(s[2]).toEqual({});
    expect(feesOf(row('X'))).toBe(20);
  });

  it('has no fees share without revenue', () => {
    expect(summarise([run(1, [row('SPRAY', { revenue: 0 })])])[1].SPRAY.feesPct).toBeNull();
  });

  it('ranks with ties averaged', () => {
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1);
    expect(spearman([1, 2, 3, 4], [40, 30, 20, 10])).toBeCloseTo(-1);
    expect(spearman([1, 1, 2], [3, 3, 1])).toBeCloseTo(-1);
    expect(spearman([1, 2], [1, 2])).toBeNull();
    expect(spearman([5, 5, 5], [1, 2, 3])).toBeNull();
  });
});

describe('a team row from the backend', () => {
  it('prices revenue, listing and discard, reads the three fees, and averages batch size and time to first sale', () => {
    const lean = {
      batches_submitted: 3, shipping_cost: 5, storage_cost: 1.25, hosting_cost: 0.5, setup_cost: 5, carrying_cost: 1.75,
      avg_submit_to_publish_s: 30, avg_publish_to_first_sale_s: 20,
      batch_series: [
        { seq: 1, submitted_at: '', jokes: 3, published: 2, sold: 1 },
        { seq: 2, submitted_at: '', jokes: 5, published: 4, sold: 0 },
        { seq: 3, submitted_at: '', jokes: 0, published: 0, sold: 0 },
      ],
    };
    const r = teamRowFrom(
      { team: { id: 4 }, total_sales: 9, published_jokes: 6, discarded_jokes: 2, profit: 0.1, lean },
      'LEARNER', { market_price: 1, cost_of_publishing: 0.1, cost_of_discard: 0.01 },
      [{ first_sale_s: 40 }, { first_sale_s: null }, { first_sale_s: 80 }],
    );
    expect(r).toMatchObject({
      teamId: 4, persona: 'LEARNER', revenue: 9, shipping: 5, storage: 1.25, hosting: 0.5,
      discard: 0.02, profit: 0.1, batches: 3, meanBatchSize: 4, sendToFirstSaleS: 60,
    });
    expect(r.listing).toBeCloseTo(0.6);
  });

  it('has no batch size or first sale when nothing was split or sold', () => {
    const r = teamRowFrom(
      { team: { id: 1 }, total_sales: 0, published_jokes: 0, discarded_jokes: 0, profit: -2, lean: undefined },
      'SPRAY', { market_price: 1, cost_of_publishing: 0.1, cost_of_discard: 0.01 }, undefined,
    );
    expect(r).toMatchObject({ shipping: 0, storage: 0, hosting: 0, batches: 0, meanBatchSize: null, sendToFirstSaleS: null });
  });
});

describe('success checks', () => {
  it('passes all three on a class that teaches the lesson', () => {
    const checks = successChecks(passing());
    expect(checks.map(c => c.pass)).toEqual([true, true, true]);
    expect(checks[0].detail).toBe('Spray Round 1 fees are 45.0 % of revenue');
    expect(checks[1].detail).toBe('send → first sale: Learner 60 s, Spray 150 s');
  });

  it('fails the fee check outside 40–60 %, at both ends', () => {
    for (const shipping of [10, 30]) {
      const runs = passing();
      runs[0].rows[0] = { ...runs[0].rows[0], shipping };
      expect(successChecks(runs)[0].pass).toBe(false);
    }
  });

  it('fails the speed check when the Learner is not sooner, or never sold', () => {
    const slower = passing();
    slower[1].rows[2] = { ...slower[1].rows[2], sendToFirstSaleS: 150 };
    expect(successChecks(slower)[1].pass).toBe(false);
    const unsold = passing();
    unsold[1].rows[2] = { ...unsold[1].rows[2], sendToFirstSaleS: null };
    const check = successChecks(unsold)[1];
    expect(check.pass).toBe(false);
    expect(check.detail).toBe('no first sale for Learner in Round 2');
  });

  it('fails the desk check when more storage per batch goes with more profit', () => {
    const runs = passing();
    runs[1].rows = runs[1].rows.map(r => ({ ...r, storage: r.profit * r.batches }));
    const check = successChecks(runs)[2];
    expect(check.pass).toBe(false);
    expect(check.detail).toContain('Round 2: ρ = 1.00');
  });

  it('fails every check when there is nothing to judge', () => {
    expect(successChecks([]).map(c => c.pass)).toEqual([false, false, false]);
  });
});

describe('pilot settings', () => {
  it('defaults to the spec fees, a 90 s window and no overrides', () => {
    const t = parseTuning({});
    expect(t).toEqual({
      fees: SPEC_FEES, window: 90, preferenceBase: undefined, customers: undefined, budget: undefined, tag: undefined, overrides: [],
    });
  });

  it('reads the fee knobs and refuses bad ones', () => {
    const t = parseTuning({ PILOT_SHIP_LARGE: '4', PILOT_STORAGE: '0.2', PILOT_WINDOW: '120', PILOT_TAG: 'storage 20¢' });
    expect(t.fees).toEqual({ ...SPEC_FEES, shippingLarge: 4, storage: 0.2 });
    expect(t.window).toBe(120);
    expect(t.tag).toBe('storage 20¢');
    expect(t.overrides).toEqual(['PILOT_SHIP_LARGE', 'PILOT_STORAGE', 'PILOT_WINDOW']);
    expect(() => parseTuning({ PILOT_STORAGE: '-1' })).toThrow(/PILOT_STORAGE/);
    expect(() => parseTuning({ PILOT_WINDOW: '0' })).toThrow(/PILOT_WINDOW/);
    expect(() => parseTuning({ PILOT_SHIP_SMALL: '3' })).toThrow(/rise with batch size/);
    expect(() => parseTuning({ PILOT_CUSTOMERS: '2.5' })).toThrow(/PILOT_CUSTOMERS/);
  });

  it('scales storage and hosting by the bot speed, never shipping, with batch 5 then up to 10', () => {
    const t = parseTuning({});
    expect(pilotConfig(t, 10, 1)).toEqual({
      market_mode: 'LEAN', arrival_window_seconds: 90, wip_limit: 0, batch_size: 5,
      shipping_fee_small: 1, shipping_fee_standard: 2, shipping_fee_large: 3,
      storage_fee_per_joke_minute: 1, hosting_fee_per_joke_minute: 0.5,
    });
    expect(pilotConfig(t, 10, 2).batch_size).toBe(10);
    expect(pilotConfig({ ...t, customers: 150, preferenceBase: 3 }, 10, 2)).toMatchObject({ customer_count: 150, preference_base: 3 });
    expect(settingsLines(t, 10, '3 CAREFUL, 3 BALANCED, 3 SPRAY, 3 LEARNER')).toContain(
      'Storage and hosting are sent ×10 ($1 and $0.5) because the backend charges per wall-clock minute; shipping is per batch and is not scaled.',
    );
  });

  it('treats only localhost, 127.0.0.1 and [::1] as local', () => {
    expect(isLocalUrl('http://localhost:8081')).toBe(true);
    expect(isLocalUrl('http://127.0.0.1:8081')).toBe(true);
    expect(isLocalUrl('http://[::1]:8081')).toBe(true);
    expect(isLocalUrl('https://jf.example.azurecontainerapps.io')).toBe(false);
    expect(isLocalUrl('http://localhost.evil.com')).toBe(false);
    expect(isLocalUrl('not a url')).toBe(false);
  });
});

describe('pilot report', () => {
  it('prints the PASS/FAIL checks, a table per round with the spec columns, and the rounds', () => {
    const md = markdown(passing(), '2026-10-12', ['Bots at 10×'], [], 'first fees run');
    expect(md).toContain('# Lean fees pilot — 2026-10-12\n\n_first fees run_');
    expect(md).toContain('- **PASS** — Spray spends 40–60 % of its revenue on fees in Round 1: Spray Round 1 fees are 45.0 % of revenue');
    expect(md).toContain('## Round 1');
    expect(md).toContain('## Round 2');
    expect(md).toContain(
      '| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |',
    );
    expect(md).toContain('| SPRAY | 1 | $30.00 | $12.00 | $6.00 | $2.00 | $4.00 | **$6.00** | 4.0 | 10.0 | 150 s | 80.0 % |');
    expect(md).toContain('| 2 | LEARNER | $20.30 | 100s | 30 |');
    expect(md).toContain('## Settings\n\n- Bots at 10×');
  });

  it('prints FAIL lines and errors', () => {
    const md = markdown([], '2026-10-12', [], ['Round 2: boom']);
    expect(md).toContain('- **FAIL** — Spray spends 40–60 % of its revenue on fees in Round 1: no Spray Round 1 revenue');
    expect(md).toContain('## Errors\n\n- Round 2: boom');
    expect(md).not.toContain('## Round 1');
  });
});
