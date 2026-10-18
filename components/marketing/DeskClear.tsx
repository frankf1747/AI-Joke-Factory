/* Marketing's desk when nothing is on it: a calm "Desk is clear" (or, once the
   round has ended, "Round over") and a one-row recap of this team's last release. */
import React from 'react';
import type { LatestRelease } from '../../services/desk';

const MONO = "'IBM Plex Mono', ui-monospace, monospace";

export const DeskClear: React.FC<{ roundOver: boolean; last: LatestRelease | null }> = ({ roundOver, last }) => (
  <div className="px-6 pb-8 pt-9 text-center">
    <h3 className="m-0 text-lg font-semibold" style={{ color: 'var(--ink)', letterSpacing: '-0.01em' }}>
      {roundOver ? 'Round over. Nothing more to release.' : 'Desk is clear'}
    </h3>
    {!roundOver && (
      <p className="mx-auto mb-0 mt-1.5 max-w-[44ch] text-[14.5px]" style={{ color: 'var(--ink-3)' }}>
        Your Joke Maker&apos;s next batch shows up here as soon as they send it.
      </p>
    )}
    {last && (
      <div
        className="mx-auto mt-[22px] flex max-w-[440px] justify-between gap-3 px-3.5 py-2.5 text-left text-[13.5px]"
        style={{ borderRadius: 'var(--r-md)', background: 'var(--paper)', color: 'var(--ink-2)' }}
      >
        <span>
          Last release, <span style={{ fontFamily: MONO, fontWeight: 600 }}>{`B-${last.batchId}`}</span>
        </span>
        <span>{`${last.published} to market, ${last.discarded} discarded${last.noteSent ? ', note sent' : ''}`}</span>
      </div>
    )}
  </div>
);
