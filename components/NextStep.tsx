/* The "Next step" row of both student screens: a small "Next step" label and
   one sentence from services/nextStep.ts, no background. Warn tone turns the
   sentence --warn. When the sentence changes the new text slides in and the row
   flashes gold (index.css, .jf-next-step[data-changed="true"]). Not a live
   region: Marketing's sentence changes every second and must not be
   re-announced. NextStepLive keeps its own one-second clock, so only the row
   re-renders as time passes; the screen's polls re-render it with fresh
   inputs. */
import React, { useEffect, useRef, useState } from 'react';
import { useDemoMode } from '../context';
import type { NextStep } from '../services/nextStep';

/** How long data-changed stays on after a change; matches the 2.2 s flash in index.css. */
const FLASH_MS = 2200;

/** The sentence with its ticking durations ("52 s", "1 min 12 s") blanked out. */
const signature = (text: string): string => text.replace(/\d+ (?:min|s)\b(?: \d+ s\b)?/g, '#');

/**
 * True when `next` is a different sentence from `prev`. The first sentence
 * (prev null) is not a change, and neither is a duration counting up inside the
 * same sentence ("Batch waiting 52 s" to "53 s"), which would flash every second.
 */
export function didChange(prev: string | null, next: string): boolean {
  return prev !== null && signature(prev) !== signature(next);
}

export const NextStepLine: React.FC<{ step: NextStep; changed?: boolean }> = ({ step, changed = false }) => (
  <div
    className="jf-next-step flex items-baseline gap-2 rounded-md px-2 py-1 -mx-2 text-sm"
    data-changed={changed ? 'true' : 'false'}
  >
    <span className="shrink-0 text-[11px] font-medium text-[color:var(--ink-3)]">Next step</span>
    <span className={`jf-next-step-text ${step.tone === 'warn' ? 'text-[color:var(--warn)]' : 'text-[color:var(--ink)]'}`}>
      {step.text}
    </span>
  </div>
);

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

/** The row, recomputed every second: `step` maps the current time to the sentence. */
export const NextStepLive: React.FC<{ step: (now: number) => NextStep }> = ({ step }) => {
  // Inside the demo stage the script's clock drives the line; the wall clock is ignored, so don't tick it.
  const now = useNow(1000, useDemoMode());
  const current = step(now);
  const key = signature(current.text);
  const previous = useRef<string | null>(null);
  const [flashing, setFlashing] = useState(false);
  useEffect(() => {
    const changed = didChange(previous.current, current.text);
    previous.current = current.text;
    if (!changed) return undefined;
    setFlashing(true);
    const id = window.setTimeout(() => setFlashing(false), FLASH_MS);
    return () => window.clearTimeout(id);
    // Runs only when the sentence itself changes, so a re-render with the same text leaves the flash alone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  // Keyed by the sentence so a change remounts the row and the slide-in and flash start afresh.
  return <NextStepLine key={key} step={current} changed={flashing} />;
};
