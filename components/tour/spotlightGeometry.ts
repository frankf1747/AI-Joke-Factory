/* Where the guided tour's spotlight and caption go — pure geometry, no DOM
   beyond what a test can fake.

   Coordinates are viewport pixels (getBoundingClientRect). The control bar is
   fixed at the bottom, so `bottomReserve` pixels there are never used. The
   caption keeps VIEW_MARGIN (16 px) from every edge, the same gutter the app
   keeps at phone width. */

export interface Box { top: number; left: number; width: number; height: number }
export interface Size { width: number; height: number }

export type CaptionSide = 'below' | 'above' | 'right' | 'left' | 'over' | 'center';
export interface CaptionPlacement { side: CaptionSide; top: number; left: number; width: number }

export const SPOT_PADDING = 8;
export const VIEW_MARGIN = 16;
export const CAPTION_GAP = 12;
export const CAPTION_MAX_WIDTH = 360;
/** Fallback height for the control bar until it has been measured. */
export const CONTROL_BAR_HEIGHT = 72;

const clamp = (v: number, lo: number, hi: number) => (hi < lo ? lo : Math.min(Math.max(v, lo), hi));

/** The spotlight's hole: the target plus padding. */
export function spotlightBox(target: Box, pad = SPOT_PADDING): Box {
  return { top: target.top - pad, left: target.left - pad, width: target.width + 2 * pad, height: target.height + 2 * pad };
}

/** The part of `box` inside the usable viewport, or null when none of it is (scrolled away). */
export function visibleBox(box: Box, viewport: Size, bottomReserve = CONTROL_BAR_HEIGHT): Box | null {
  const top = Math.max(box.top, 0);
  const left = Math.max(box.left, 0);
  const bottom = Math.min(box.top + box.height, viewport.height - bottomReserve);
  const right = Math.min(box.left + box.width, viewport.width);
  if (bottom <= top || right <= left) return null;
  return { top, left, width: right - left, height: bottom - top };
}

/**
 * True when too little of the target is on screen to spotlight it: none of
 * it, or less than half of what could fit. Used to finish a smooth scroll that
 * never ran (a background tab, an interrupted scroll).
 */
export function needsScroll(target: Box, viewport: Size, bottomReserve = CONTROL_BAR_HEIGHT): boolean {
  const visible = visibleBox(target, viewport, bottomReserve);
  if (!visible) return true;
  const room = Math.min(target.height, viewport.height - bottomReserve);
  return visible.height < room / 2;
}

/** Caption width: at most 360 px, and never wider than the viewport minus its gutters. */
export function captionWidth(viewport: Size): number {
  return Math.max(0, Math.min(CAPTION_MAX_WIDTH, viewport.width - 2 * VIEW_MARGIN));
}

/**
 * Puts the caption beside the spotlight on the first side with room — below,
 * above, right, left — and otherwise over the spotlight near the bottom of the
 * screen (a target taller than the viewport). With no hole, or a hole scrolled
 * out of view, it is centred. The result is always inside the usable viewport.
 */
export function placeCaption(
  hole: Box | null,
  caption: Size,
  viewport: Size,
  bottomReserve = CONTROL_BAR_HEIGHT,
): CaptionPlacement {
  const width = Math.min(caption.width, captionWidth(viewport));
  const height = caption.height;
  const floor = viewport.height - bottomReserve;
  const clampLeft = (x: number) => clamp(x, VIEW_MARGIN, viewport.width - VIEW_MARGIN - width);
  const clampTop = (y: number) => clamp(y, VIEW_MARGIN, floor - VIEW_MARGIN - height);
  const visible = hole ? visibleBox(hole, viewport, bottomReserve) : null;
  if (!visible) {
    return { side: 'center', top: clampTop((floor - height) / 2), left: clampLeft((viewport.width - width) / 2), width };
  }
  const bottom = visible.top + visible.height;
  const right = visible.left + visible.width;
  const midLeft = clampLeft(visible.left + visible.width / 2 - width / 2);
  const midTop = clampTop(visible.top + visible.height / 2 - height / 2);
  if (floor - VIEW_MARGIN - bottom - CAPTION_GAP >= height) return { side: 'below', top: bottom + CAPTION_GAP, left: midLeft, width };
  if (visible.top - CAPTION_GAP - VIEW_MARGIN >= height) return { side: 'above', top: visible.top - CAPTION_GAP - height, left: midLeft, width };
  if (viewport.width - VIEW_MARGIN - right - CAPTION_GAP >= width) return { side: 'right', top: midTop, left: right + CAPTION_GAP, width };
  if (visible.left - CAPTION_GAP - VIEW_MARGIN >= width) return { side: 'left', top: midTop, left: visible.left - CAPTION_GAP - width, width };
  return { side: 'over', top: clampTop(floor - VIEW_MARGIN - height), left: midLeft, width };
}

/**
 * The element to spotlight inside the stage, or null when the step has no
 * target, the element is missing, or it has no size (hidden or collapsed) —
 * the caller then shows a centred card instead of an empty hole. `root` is
 * the stage element; tests pass a fake with the same two methods.
 */
export function findTourTarget<E extends { getBoundingClientRect(): Box }>(
  root: { querySelector(selectors: string): E | null } | null,
  id: string | null,
): E | null {
  if (!root || !id) return null;
  const el = root.querySelector(`[data-tour="${id}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? el : null;
}
