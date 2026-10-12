/* The guided tour: the demo stage, the spotlight, the control bar, the clock
   and the keyboard, put together (spec §3).

   Mounted by TutorialLauncher (components.tsx) and portalled to <body>, above
   everything, while the live app keeps running underneath — made `inert` for
   the tour's lifetime, so no click or focus reaches it. The steps, prices and
   fees are read once, when the tour starts (tourPlan): the round
   changing mid-tour does not reshuffle the steps, it only turns Skip into
   "Round started — go to the game".

   The clock is one interval sending `tick` to the step machine
   (services/tour/tourMachine.ts); the demo state is rebuilt from (step,
   elapsed) by services/tour/demoScript.ts, memoised on demoFrameKey so the
   view re-renders only when something on it changes. An error anywhere in the
   stage or spotlight ends the tour through the error boundary: logged, no
   seen-flag written, the student lands on the live screen. */
import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, Pause, Play } from 'lucide-react';
import { Button } from '../ui';
import type { GameConfig } from '../../types';
import { DemoStage } from './DemoStage';
import { Spotlight } from './Spotlight';
import { CONTROL_BAR_HEIGHT } from './spotlightGeometry';
import { keyAction, tourControls } from './tourControls';
import {
  demoFrame, demoFrameKey, demoOptionsFor, type DemoOptions, type DemoStep,
} from '../../services/tour/demoScript';
import { captionText, stepsFor } from '../../services/tour/tourSteps';
import { INITIAL_TOUR_STATE, tourReducer, type TourAction, type TourState } from '../../services/tour/tourMachine';
import type { TourOutcome, TourRole } from '../../services/tour/seen';

/** How often the clock ticks. */
export const TICK_MS = 100;
/** A tick never counts for more than this, so a throttled background tab does not fast-forward. */
export const MAX_TICK_MS = 250;

export interface TourPlan { options: DemoOptions; steps: DemoStep[] }

/** The tour for this role and round, fixed when the tour starts. */
export function tourPlan(role: TourRole, config: GameConfig): TourPlan {
  const options = demoOptionsFor(role, config);
  return { options, steps: stepsFor(role, options) };
}

export function usePrefersReducedMotion(): boolean {
  const query = '(prefers-reduced-motion: reduce)';
  const [reduced, setReduced] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia(query);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);
  return reduced;
}

interface BoundaryProps { onError: (error: unknown) => void; children?: React.ReactNode }
interface BoundaryState { failed: boolean }

/** Ends the tour on any render error in the stage or spotlight. */
export class TourErrorBoundary extends React.Component<BoundaryProps, BoundaryState> {
  declare readonly props: Readonly<BoundaryProps>;
  state: BoundaryState = { failed: false };
  constructor(props: BoundaryProps) {
    super(props);
  }
  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    this.props.onError(error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export interface GuidedTourProps {
  role: TourRole;
  /** The student's real screen: views/JokeMaker.tsx or views/QualityControl.tsx. */
  view: React.ComponentType;
  /** The live round's configuration, read once when the tour starts. */
  config: GameConfig;
  /** Live: the student's round is ACTIVE. */
  roundActive: boolean;
  /** Called once: 'finished' (Start / → on the last step), 'skipped' (Skip / Esc) or 'error'. */
  onEnd: (outcome: TourOutcome) => void;
}

export const GuidedTour: React.FC<GuidedTourProps> = ({ role, view, config, roundActive, onEnd }) => {
  const [plan] = useState<TourPlan>(() => tourPlan(role, config));
  const { options, steps } = plan;
  const [state, dispatch] = useReducer(
    (s: TourState, a: TourAction) => tourReducer(s, a, steps),
    INITIAL_TOUR_STATE,
  );
  const reducedMotion = usePrefersReducedMotion();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const controlsRef = useRef<HTMLDivElement | null>(null);
  const [barHeight, setBarHeight] = useState(CONTROL_BAR_HEIGHT);
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
  const endedRef = useRef(false);

  const end = useCallback((outcome: TourOutcome) => {
    if (endedRef.current) return;
    endedRef.current = true;
    onEndRef.current(outcome);
  }, []);

  // The clock. Stops while paused or ended.
  useEffect(() => {
    if (state.ended || state.paused) return undefined;
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      dispatch({ type: 'tick', dtMs: Math.min(now - last, MAX_TICK_MS) });
      last = now;
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [state.ended, state.paused]);

  useEffect(() => {
    if (state.ended) end(state.ended);
  }, [state.ended, end]);

  // Keyboard: Esc, ←, →, Space. Captured before the live page sees them.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const action = keyAction({
        key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey,
        targetTag: (e.target as HTMLElement | null)?.tagName,
      });
      if (!action) return;
      e.preventDefault();
      e.stopPropagation();
      dispatch(action);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  // While the tour is up the live app is inert and the page does not scroll.
  useEffect(() => {
    const root = document.getElementById('root');
    const wasInert = root?.hasAttribute('inert') ?? false;
    root?.setAttribute('inert', '');
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const previouslyFocused = document.activeElement as HTMLElement | null;
    previouslyFocused?.blur?.();
    controlsRef.current?.focus();
    return () => {
      if (!wasInert) root?.removeAttribute('inert');
      document.body.style.overflow = overflow;
      // Hand focus back to where the student was (the root is no longer inert).
      if (previouslyFocused && previouslyFocused !== document.body && document.contains(previouslyFocused)) {
        previouslyFocused.focus?.();
      }
    };
  }, []);

  // Keep the caption clear of the control bar, whatever its height (it wraps on phones).
  useEffect(() => {
    const bar = controlsRef.current;
    if (!bar || typeof ResizeObserver !== 'function') return undefined;
    const observer = new ResizeObserver(() => setBarHeight(bar.offsetHeight || CONTROL_BAR_HEIGHT));
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);

  const frameKey = demoFrameKey(steps, state.index, state.elapsedMs, reducedMotion);
  const frame = useMemo(
    () => demoFrame(steps, state.index, options, state.elapsedMs, reducedMotion),
    // frameKey changes exactly when the frame would.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [frameKey, steps, options],
  );
  const controls = tourControls(state, steps, roundActive);
  const step = steps[state.index];
  const onStageError = useCallback((error: unknown) => {
    console.error('Guided tour stopped:', error);
    end('error');
  }, [end]);

  // A static render (tests) has no document to portal into.
  if (typeof document === 'undefined' || !step) return null;

  const label = role === 'JOKE_MAKER' ? 'Joke Maker' : 'Marketing';
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`${label} tour`} data-guided-tour="">
      <TourErrorBoundary onError={onStageError}>
        <DemoStage view={view} frame={frame} stageRef={stageRef} />
        <Spotlight
          stageRef={stageRef}
          target={step.target}
          stepIndex={state.index}
          frameKey={frameKey}
          reducedMotion={reducedMotion}
          bottomReserve={barHeight}
          title={step.title}
          body={captionText(step, options)}
          stepText={controls.stepText}
        />
      </TourErrorBoundary>
      <div
        ref={controlsRef}
        tabIndex={-1}
        className="fixed inset-x-0 bottom-0 z-[62] border-t border-gray-200 bg-white shadow-2xl outline-none"
      >
        <div className="h-1 bg-gray-100" aria-hidden="true">
          <div
            className="h-full bg-[#ffd100]"
            style={{ width: `${Math.round(controls.progress * 1000) / 10}%`, transition: reducedMotion ? 'none' : 'width .1s linear' }}
          />
        </div>
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-2.5">
          <span className="text-xs font-semibold tabular-nums text-gray-500">{controls.stepText}</span>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <Button
              variant="outline"
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm"
              onClick={() => dispatch({ type: 'back' })}
              disabled={controls.backDisabled}
            >
              <ArrowLeft size={14} /> Back
            </Button>
            <Button
              variant="outline"
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm"
              onClick={() => dispatch({ type: 'togglePause' })}
            >
              {state.paused ? <Play size={14} /> : <Pause size={14} />} {controls.pauseLabel}
            </Button>
            <Button
              variant="navy"
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm"
              onClick={() => dispatch({ type: 'next' })}
            >
              {controls.nextLabel} <ArrowRight size={14} />
            </Button>
            <Button
              variant={controls.skipPrimary ? 'primary' : 'secondary'}
              className="px-3 py-1.5 text-sm font-semibold"
              onClick={() => dispatch({ type: 'skip' })}
            >
              {controls.skipLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default GuidedTour;
