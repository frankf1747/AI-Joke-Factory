/* The guided tour's spotlight: the page dims except a rounded hole around the
   step's target, and a caption sits beside it on the side with room.

   The hole is one element with a huge box-shadow, so everything around it
   dims. The target is looked up as [data-tour=<id>] inside the stage and
   scrolled into view (block: center), which also scrolls any scroll container
   it sits in — the Value stream list, the feedback list. The hole then follows
   the target: scroll events from the stage or any container inside it
   (captured), window resizes, and a ResizeObserver on the stage and target.
   A step with no target, or whose target is missing or has no size, gets a
   centred card over a full dim; the tour never stalls on a missing element.

   The overlay takes every click, so nothing under it — demo or live page — can
   be pressed by accident. Reduced motion: no transitions, instant scrolling. */
import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import {
  CONTROL_BAR_HEIGHT, findTourTarget, needsScroll, placeCaption, spotlightBox,
  type Box, type CaptionPlacement,
} from './spotlightGeometry';

export interface SpotlightProps {
  /** The demo stage (components/tour/DemoStage.tsx), searched for the target. */
  stageRef: React.RefObject<HTMLDivElement | null>;
  /** data-tour id, or null for a centred card. */
  target: string | null;
  /** The step index: a new step looks its target up and scrolls to it again. */
  stepIndex: number;
  /** demoFrameKey: content changed, so measure again (a batch split, a card grew). */
  frameKey: string;
  reducedMotion: boolean;
  /** Height of the fixed control bar, kept clear at the bottom. */
  bottomReserve?: number;
  title: string;
  body: string;
  stepText: string;
}

const DIM = 'rgba(15, 23, 42, 0.62)';
/** How long a smooth scroll gets before the target is jumped into view instead. */
export const SCROLL_SETTLE_MS = 700;
const ESTIMATED_CAPTION = { width: 360, height: 150 };

export const Spotlight: React.FC<SpotlightProps> = ({
  stageRef, target, stepIndex, frameKey, reducedMotion, bottomReserve = CONTROL_BAR_HEIGHT, title, body, stepText,
}) => {
  const captionRef = useRef<HTMLDivElement | null>(null);
  const [hole, setHole] = useState<Box | null>(null);
  const [caption, setCaption] = useState<CaptionPlacement | null>(null);

  const measure = useCallback(() => {
    const el = findTourTarget(stageRef.current, target);
    const nextHole = el ? spotlightBox(el.getBoundingClientRect()) : null;
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const size = captionRef.current
      ? { width: ESTIMATED_CAPTION.width, height: captionRef.current.offsetHeight || ESTIMATED_CAPTION.height }
      : ESTIMATED_CAPTION;
    setHole(nextHole);
    setCaption(placeCaption(nextHole, size, viewport, bottomReserve));
  }, [stageRef, target, bottomReserve]);

  // A new step: bring its target into view, then measure. If a smooth scroll
  // did not get it there (a background tab does not animate), jump instead.
  useLayoutEffect(() => {
    const scrollTo = (behavior: 'auto' | 'smooth') => {
      const el = findTourTarget(stageRef.current, target) as HTMLElement | null;
      el?.scrollIntoView?.({ block: 'center', inline: 'nearest', behavior });
      return el;
    };
    scrollTo(reducedMotion ? 'auto' : 'smooth');
    measure();
    const settle = window.setTimeout(() => {
      const el = findTourTarget(stageRef.current, target);
      if (el && needsScroll(el.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight }, bottomReserve)) {
        scrollTo('auto');
        measure();
      }
    }, SCROLL_SETTLE_MS);
    return () => window.clearTimeout(settle);
  }, [stepIndex, target, reducedMotion, measure, stageRef, bottomReserve]);

  // The content changed under the same step.
  useLayoutEffect(() => {
    measure();
  }, [frameKey, title, body, measure]);

  // Follow scrolling (the stage and every container in it), resizes and layout changes.
  useLayoutEffect(() => {
    const stage = stageRef.current;
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    };
    window.addEventListener('resize', schedule);
    stage?.addEventListener('scroll', schedule, true);
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    const el = findTourTarget(stage, target);
    if (observer && stage?.firstElementChild) observer.observe(stage.firstElementChild);
    if (observer && el) observer.observe(el as Element);
    return () => {
      window.removeEventListener('resize', schedule);
      stage?.removeEventListener('scroll', schedule, true);
      observer?.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [stageRef, target, stepIndex, measure]);

  const move = reducedMotion ? 'none' : 'top .3s ease, left .3s ease, width .3s ease, height .3s ease';
  return (
    <div className="fixed inset-0 z-[61]" data-tour-overlay="">
      {hole ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-xl ring-2 ring-[#ffd100]"
          style={{ top: hole.top, left: hole.left, width: hole.width, height: hole.height, boxShadow: `0 0 0 9999px ${DIM}`, transition: move }}
        />
      ) : (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ background: DIM }} />
      )}
      <div
        ref={captionRef}
        role="status"
        aria-live="polite"
        className="absolute rounded-xl border border-gray-200 bg-white p-4 shadow-2xl"
        style={{
          top: caption?.top ?? '30%',
          left: caption?.left ?? 'calc(50% - 180px)',
          width: caption?.width ?? ESTIMATED_CAPTION.width,
          maxWidth: 'calc(100vw - 32px)',
          transition: reducedMotion ? 'none' : 'top .3s ease, left .3s ease',
        }}
      >
        <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{stepText}</div>
        <h2 className="mt-1 text-lg font-bold leading-snug text-gray-900">{title}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-gray-600">{body}</p>
      </div>
    </div>
  );
};

export default Spotlight;
