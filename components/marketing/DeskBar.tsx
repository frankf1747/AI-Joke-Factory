/* The batch bar of Marketing's desk card: which batch is on the desk, how long
   it has waited, and where the team is in Split, Choose, Release. */
import React from 'react';
import { useDemoUi } from '../../context';
import { fmtMinSec } from '../../services/format';
import { useNow } from '../NextStep';

const MONO = "'IBM Plex Mono', ui-monospace, monospace";
const STAGES = [['split', 'Split'], ['choose', 'Choose'], ['release', 'Release']] as const;

export type DeskStage = (typeof STAGES)[number][0];

/** Seconds a batch has waited, or null when it has no usable submitted_at. */
export function waitedSeconds(submittedAt: string | null | undefined, now: number): number | null {
  const since = submittedAt ? Date.parse(submittedAt) : NaN;
  return Number.isNaN(since) ? null : Math.max(0, (now - since) / 1000);
}

export const DeskBar: React.FC<{
  batchId: number;
  submittedAt: string | null | undefined;
  stage: DeskStage;
}> = ({ batchId, submittedAt, stage }) => {
  // Inside the demo stage the script's clock drives the time; the wall clock is ignored.
  const demoUi = useDemoUi();
  const wallNow = useNow(1000, demoUi !== null);
  const waited = waitedSeconds(submittedAt, demoUi ? demoUi.clockMs : wallNow);
  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-1 pb-3"
      style={{ borderBottom: '1px solid var(--rule)' }}
    >
      <span className="text-sm font-semibold" style={{ fontFamily: MONO, color: 'var(--ink)' }}>
        {`B-${batchId}`}
      </span>
      {waited !== null && (
        <span className="text-[13px] tabular-nums" style={{ color: 'var(--ink-3)' }}>
          {`waiting ${fmtMinSec(waited)}`}
        </span>
      )}
      <span className="ml-auto flex gap-0.5 text-[12.5px]" aria-label="Where you are">
        {STAGES.map(([id, label]) => {
          const current = id === stage;
          return (
            <span
              key={id}
              aria-current={current ? 'step' : undefined}
              className={`rounded-full px-2.5 py-0.5 ${current ? 'font-semibold' : ''}`}
              style={current
                ? { color: 'var(--navy)', background: 'var(--navy-tint)' }
                : { color: 'var(--ink-3)' }}
            >
              {label}
            </span>
          );
        })}
      </span>
    </div>
  );
};
