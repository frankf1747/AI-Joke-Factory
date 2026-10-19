/* The Instructor's live market (spec 6b, 7.4): every released joke of the
   current round, best sellers first. The top 5 show; "Show all" pages through
   the rest, 20 at a time. */
import React, { useState } from 'react';
import type { ApiMarketItem } from '../../types';
import { Card } from '../ui';
import { bestSellers, buyersText } from '../../services/liveBoard';

const TOP = 5;
const PAGE_SIZE = 20;
const LONG_JOKE = 180;

export interface LiveMarketProps {
  items: ApiMarketItem[];
  /** The current round has started; before that the market is closed. */
  open: boolean;
  teamNames: Record<string, string>;
  /** Opens on the full, paged list (the render tests use it). */
  initialShowAll?: boolean;
}

const LINK = 'text-sm font-medium hover:underline underline-offset-2 disabled:opacity-40 disabled:no-underline';

export const LiveMarket: React.FC<LiveMarketProps> = ({ items, open, teamNames, initialShowAll = false }) => {
  const [showAll, setShowAll] = useState(initialShowAll);
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const sorted = bestSellers(items);
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const shown = showAll ? sorted.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE) : sorted.slice(0, TOP);
  const count = open && sorted.length > 0
    ? <span className="font-mono text-[13px]" style={{ color: 'var(--ink-3)' }}>{`${sorted.length} ${sorted.length === 1 ? 'joke' : 'jokes'} on the market`}</span>
    : undefined;

  const empty = (text: string) => (
    <p className="px-1 py-6 text-center text-sm" style={{ color: 'var(--ink-3)' }}>{text}</p>
  );

  return (
    <Card title="Live market" subtitle="Released jokes, best sellers first." action={count}>
      {!open ? empty('Market opens when the round starts.')
        : sorted.length === 0 ? empty('Market is empty. Released jokes appear here.')
        : (
          <>
            <table className="w-full border-collapse">
              <tbody>
                {shown.map((it, i) => {
                  const id = String(it.joke_id);
                  const text = String(it.joke_text ?? '');
                  const isLong = text.trim().length > LONG_JOKE;
                  const isOpen = Boolean(expanded[id]);
                  const border = i === shown.length - 1 ? {} : { borderBottom: '1px solid var(--rule)' };
                  return (
                    <tr key={id}>
                      <td className="py-2.5 pr-4 align-top" style={border}>
                        <b className="block text-sm font-semibold" style={{ color: 'var(--ink)' }}>{String(it.joke_title ?? '').trim() || 'Untitled joke'}</b>
                        <p className={`joke-font mt-0.5 max-w-[70ch] whitespace-pre-wrap text-[15px] leading-[1.45] ${isOpen ? '' : 'line-clamp-3'}`} style={{ color: 'var(--ink-2)' }}>
                          {text}
                        </p>
                        {isLong && (
                          <button type="button" className={`${LINK} mt-1`} style={{ color: 'var(--navy)' }} onClick={() => setExpanded(p => ({ ...p, [id]: !p[id] }))}>
                            {isOpen ? 'Show less' : 'Show more'}
                          </button>
                        )}
                      </td>
                      <td className="whitespace-nowrap py-2.5 pr-4 align-top text-sm" style={{ ...border, color: 'var(--ink-2)' }}>
                        {teamNames[String(it.team_id)] || it.team_name || `Team ${it.team_id}`}
                      </td>
                      <td className="whitespace-nowrap py-2.5 text-right align-top font-mono text-[15px] font-semibold tabular-nums" style={{ ...border, color: 'var(--ink)' }}>
                        <span>{buyersText(Number(it.sold_count ?? 0))}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {sorted.length > TOP && (
              <div className="mt-3 flex items-center justify-center gap-6" style={{ color: 'var(--navy)' }}>
                {showAll ? (
                  <>
                    {pages > 1 && (
                      <>
                        <button type="button" className={LINK} disabled={current === 1} onClick={() => setPage(current - 1)}>Previous</button>
                        <span className="text-sm tabular-nums" style={{ color: 'var(--ink-3)' }}>{`Page ${current} of ${pages}`}</span>
                        <button type="button" className={LINK} disabled={current === pages} onClick={() => setPage(current + 1)}>Next</button>
                      </>
                    )}
                    <button type="button" className={LINK} onClick={() => { setShowAll(false); setPage(1); }}>{`Show top ${TOP}`}</button>
                  </>
                ) : (
                  <button type="button" className={LINK} onClick={() => setShowAll(true)}>{`Show all ${sorted.length}`}</button>
                )}
              </div>
            )}
          </>
        )}
    </Card>
  );
};
