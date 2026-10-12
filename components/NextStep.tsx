/* The "Next step" line under the stat tiles of both student screens: a small
   coloured bar with an arrow, the label "Next step" and one sentence from
   services/nextStep.ts. Not a live region: Marketing's
   sentence changes every second and must not be re-announced. Amber for a warning, blue otherwise. NextStepLive
   keeps its own one-second clock, so only the line re-renders as time
   passes; the screen's polls re-render it with fresh inputs. */
import React, { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { useDemoMode } from '../context';
import type { NextStep } from '../services/nextStep';

export const NextStepLine: React.FC<{ step: NextStep }> = ({ step }) => {
  const warn = step.tone === 'warn';
  return (
    <div
      className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
        warn ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-sky-50 border-sky-200 text-sky-900'
      }`}
    >
      <ArrowRight size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span>
        <span className="mr-1.5 text-[11px] font-bold uppercase tracking-wide">Next step</span>
        {step.text}
      </span>
    </div>
  );
};

/** Date.now(), refreshed every `intervalMs` while mounted. */
export function useNow(intervalMs = 1000, paused = false): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (paused) return undefined;
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs, paused]);
  return now;
}

/** The line, recomputed every second: `step` maps the current time to the sentence. */
export const NextStepLive: React.FC<{ step: (now: number) => NextStep }> = ({ step }) => {
  // Inside the demo stage the script's clock drives the line; the wall clock is ignored, so don't tick it.
  const now = useNow(1000, useDemoMode());
  return <NextStepLine step={step(now)} />;
};
