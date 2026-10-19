/* "Fees and wait times" (spec 4.4): the disclosure that replaces "More numbers"
   in Lean rounds, on both student screens. Collapsed by default. Two charts:
   where this round's sales went (shipping, storage, hosting, listing and
   discard fees, profit) and how long a joke waits on average. Amber is
   low-contrast, so every segment also has its amount in the legend.

   Imports nothing from the components barrel (it pulls in context). The screen
   passes the team summary and the round's prices in; `extras` keeps the other
   More numbers (Batches, Content Waste...) as a plain list so none disappears. */

import React, { useId, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { feeBar, type FeeSegmentKey } from '../services/feeBar';
import { fmtMinSec } from '../services/format';
import { fmtMoney, leanFeesOf } from '../services/leanMode';
import { readMoreOpen, writeMoreOpen } from './StatTiles';
import type { ApiTeamSummaryResponse, GameConfig } from '../types';

const MONO = "'IBM Plex Mono', ui-monospace, monospace";

const SEGMENT: Record<FeeSegmentKey, { name: string; color: string }> = {
  shipping: { name: 'Shipping', color: 'var(--chart-shipping)' },
  storage: { name: 'Storage', color: 'var(--chart-storage)' },
  hosting: { name: 'Hosting', color: 'var(--chart-hosting)' },
  listing: { name: 'Listing and discard fees', color: 'var(--chart-discards)' },
  profit: { name: 'Profit', color: 'var(--selling)' },
};

/** The bar: segments split by 2 px gaps, 4 px outer corners and 2 px inner ones. */
const Bar: React.FC<{
  parts: Array<{ key: string; weight: number; color: string; title: string }>;
}> = ({ parts }) => {
  const shown = parts.filter(p => p.weight > 0);
  const sum = shown.reduce((t, p) => t + p.weight, 0);
  return (
    <div className="flex rounded" style={{ height: 14, gap: 2, background: shown.length ? undefined : 'var(--paper-2)', borderRadius: 4 }}>
      {shown.map((p, i) => (
        <div
          key={p.key}
          title={p.title}
          style={{
            flex: `${(p.weight / sum) * 100} 1 0`, // grow factors below 1 would leave the bar short
            minWidth: 2,
            background: p.color,
            borderRadius: `${i === 0 ? 4 : 2}px ${i === shown.length - 1 ? 4 : 2}px ${i === shown.length - 1 ? 4 : 2}px ${i === 0 ? 4 : 2}px`,
          }}
        />
      ))}
    </div>
  );
};

const LegendRow: React.FC<{ color?: string; children: React.ReactNode; sub?: string; right?: React.ReactNode }> = ({ color, children, sub, right }) => (
  <li className="flex items-baseline gap-2 text-sm">
    <span aria-hidden="true" className="shrink-0 self-center rounded-sm" style={{ width: 10, height: 10, background: color ?? 'transparent' }} />
    <span className="text-[color:var(--ink)]">{children}</span>
    {sub && <span className="text-xs text-[color:var(--ink-3)]">{sub}</span>}
    {right != null && <span className="ml-auto" style={{ fontFamily: MONO, fontWeight: 500 }}>{right}</span>}
  </li>
);

const SalesChart: React.FC<{ summary: ApiTeamSummaryResponse; config: GameConfig }> = ({ summary, config }) => {
  const fees = leanFeesOf(summary.lean);
  const bar = feeBar({
    marketPrice: config.marketPrice, totalSales: summary.total_sales,
    costOfPublishing: config.costOfPublishing, costOfDiscard: config.costOfDiscard,
    publishedJokes: summary.published_jokes, discardedJokes: summary.discarded_jokes ?? 0,
    ...fees, profit: summary.profit,
  });
  const amountOf = (key: FeeSegmentKey) => bar.segments.find(s => s.key === key)?.amount ?? 0;
  const pct = (amount: number) => (bar.revenue > 0 ? Math.round((amount / bar.revenue) * 100) : 0);
  const sub: Partial<Record<FeeSegmentKey, string | undefined>> = {
    shipping: typeof summary.batches_created === 'number'
      ? `${summary.batches_created} ${summary.batches_created === 1 ? 'batch' : 'batches'} sent` : undefined,
    storage: "while on Marketing's desk",
    hosting: 'while no one has bought',
  };
  const rows: FeeSegmentKey[] = ['shipping', 'storage', 'hosting', 'listing'];
  return (
    <section aria-label="Where your sales went" className="space-y-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-[color:var(--ink)]">Where your sales went</h3>
        <span className="text-sm" style={{ fontFamily: MONO, fontWeight: 500 }}>{fmtMoney(bar.revenue)}</span>
      </div>
      <Bar
        parts={bar.segments.map(s => ({
          key: s.key,
          weight: bar.scaleTo > 0 ? s.amount : 0,
          color: SEGMENT[s.key].color,
          title: `${SEGMENT[s.key].name} ${fmtMoney(s.amount)}, ${pct(s.amount)}% of sales`,
        }))}
      />
      <ul className="space-y-1">
        {rows.map(k => <LegendRow key={k} color={SEGMENT[k].color} sub={sub[k]} right={fmtMoney(amountOf(k))}>{SEGMENT[k].name}</LegendRow>)}
        {bar.loss != null ? (
          <LegendRow><span style={{ color: 'var(--warn)', fontWeight: 600 }}>Loss −{fmtMoney(bar.loss)}</span></LegendRow>
        ) : (
          <LegendRow color={SEGMENT.profit.color} sub="what you kept" right={fmtMoney(amountOf('profit'))}>Profit</LegendRow>
        )}
      </ul>
    </section>
  );
};

/** Two averages over different sets of jokes, so the total reads "about". The Released label is clamped so the tick labels never collide. */
const WaitChart: React.FC<{ marketing: number; market: number }> = ({ marketing, market }) => {
  const total = marketing + market;
  const releasedAt = (marketing / total) * 100;
  const tick = 'text-[11px] text-[color:var(--ink-3)]';
  return (
    <section aria-label="How long a joke waits" className="space-y-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-[color:var(--ink)]">How long a joke waits, on average</h3>
        <span className="text-sm" style={{ fontFamily: MONO, fontWeight: 500 }}>about {fmtMinSec(total)}</span>
      </div>
      <Bar
        parts={[
          { key: 'marketing', weight: marketing, color: 'var(--chart-storage)', title: `With Marketing ${fmtMinSec(marketing)}` },
          { key: 'market', weight: market, color: 'var(--chart-hosting)', title: `On market, waiting for a buyer ${fmtMinSec(market)}` },
        ]}
      />
      <div className="relative h-4" aria-hidden="true">
        <span className={`absolute left-0 ${tick}`}>Sent</span>
        <span className={`absolute ${tick}`} style={{ left: `${Math.min(78, Math.max(22, releasedAt))}%`, transform: 'translateX(-50%)' }}>Released</span>
        <span className={`absolute right-0 ${tick}`}>First sale</span>
      </div>
      <ul className="space-y-1">
        <LegendRow color="var(--chart-storage)" sub="storage is charged">{`With Marketing ${fmtMinSec(marketing)}`}</LegendRow>
        <LegendRow color="var(--chart-hosting)" sub="hosting is charged">{`On market, waiting for a buyer ${fmtMinSec(market)}`}</LegendRow>
      </ul>
    </section>
  );
};

export interface FeesAndWaitsExtra {
  label: string;
  value: React.ReactNode;
}

const NO_EXTRAS: FeesAndWaitsExtra[] = [];

export const FeesAndWaits: React.FC<{
  summary: ApiTeamSummaryResponse | null;
  config: GameConfig;
  /** data-tour id for the guided tour (Marketing's "Fees add up" step). */
  tourId?: 'mk-more';
  /** The More numbers that no chart shows, as a plain list under the charts. */
  extras?: FeesAndWaitsExtra[];
  storageKey: string;
  /** Start open (tests); default is the remembered choice, else closed. */
  initialOpen?: boolean;
  /** Controlled (the guided tour's demo); the remembered choice is then neither read nor written. */
  open?: boolean;
}> = ({ summary, config, tourId, extras = NO_EXTRAS, storageKey, initialOpen, open: forcedOpen }) => {
  const [openState, setOpen] = useState(() => forcedOpen ?? initialOpen ?? readMoreOpen(storageKey));
  const open = forcedOpen ?? openState;
  const panelId = useId();
  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (forcedOpen === undefined) writeMoreOpen(storageKey, next);
  };
  const Chevron = open ? ChevronUp : ChevronDown;
  const marketing = Math.max(0, summary?.lean?.avg_submit_to_publish_s ?? 0);
  const market = Math.max(0, summary?.lean?.avg_publish_to_first_sale_s ?? 0);
  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="w-full flex items-center justify-between gap-1 py-1.5 text-xs font-semibold text-[color:var(--ink-3)] hover:text-[color:var(--ink)]"
      >
        Fees and wait times
        <Chevron size={14} aria-hidden="true" />
      </button>
      <div
        id={panelId}
        data-tour={tourId}
        hidden={!open}
        className="mt-1 space-y-5 rounded-xl border p-4"
        style={{ background: 'var(--sheet)', borderColor: 'var(--rule)' }}
      >
        {open && (
          <>
            {summary ? (
              <>
                <SalesChart summary={summary} config={config} />
                {marketing + market > 0 && <WaitChart marketing={marketing} market={market} />}
              </>
            ) : (
              <p className="text-sm text-[color:var(--ink-3)]">Fees and wait times appear once the round starts.</p>
            )}
            {extras.length > 0 && (
              <dl className="space-y-1 border-t pt-3" style={{ borderColor: 'var(--rule)' }}>
                {extras.map(e => (
                  <div key={e.label} className="flex items-baseline justify-between gap-2 text-sm">
                    <dt className="text-[color:var(--ink-2)]">{e.label}</dt>
                    <dd style={{ fontFamily: MONO, fontWeight: 500 }}>{e.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </>
        )}
      </div>
    </div>
  );
};
