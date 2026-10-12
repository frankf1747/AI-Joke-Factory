import { describe, expect, it } from 'vitest';
import {
  CAPTION_GAP, VIEW_MARGIN, captionWidth, findTourTarget, needsScroll, placeCaption, spotlightBox, visibleBox,
  type Box, type CaptionPlacement, type Size,
} from './spotlightGeometry';

const DESKTOP: Size = { width: 1280, height: 800 };
const PHONE: Size = { width: 375, height: 667 };
const CAPTION: Size = { width: 360, height: 150 };
const BAR = 72;

/** The caption lies inside the usable viewport (16 px gutters, control bar kept clear). */
function expectInside(p: CaptionPlacement, viewport: Size, height = CAPTION.height) {
  expect(p.left).toBeGreaterThanOrEqual(VIEW_MARGIN);
  expect(p.left + p.width).toBeLessThanOrEqual(viewport.width - VIEW_MARGIN);
  expect(p.top).toBeGreaterThanOrEqual(VIEW_MARGIN);
  expect(p.top + height).toBeLessThanOrEqual(viewport.height - BAR - VIEW_MARGIN);
}

describe('spotlightBox', () => {
  it('pads the target by 8 px on every side', () => {
    expect(spotlightBox({ top: 100, left: 50, width: 200, height: 40 })).toEqual({ top: 92, left: 42, width: 216, height: 56 });
  });
});

describe('visibleBox — a target scrolled partly or wholly out of view', () => {
  it('clips to the viewport above the control bar', () => {
    expect(visibleBox({ top: -50, left: 10, width: 100, height: 100 }, DESKTOP, BAR)).toEqual({ top: 0, left: 10, width: 100, height: 50 });
    expect(visibleBox({ top: 700, left: 10, width: 100, height: 100 }, DESKTOP, BAR)).toEqual({ top: 700, left: 10, width: 100, height: 28 });
  });
  it('is null when nothing of it is on screen', () => {
    expect(visibleBox({ top: -300, left: 10, width: 100, height: 100 }, DESKTOP, BAR)).toBeNull();
    expect(visibleBox({ top: 900, left: 10, width: 100, height: 100 }, DESKTOP, BAR)).toBeNull();
    expect(visibleBox({ top: 760, left: 10, width: 100, height: 100 }, DESKTOP, BAR)).toBeNull();
  });
});

describe('needsScroll — a target below the fold, or a smooth scroll that never ran', () => {
  it('is true when none or under half of the target is on screen', () => {
    expect(needsScroll({ top: 1600, left: 40, width: 600, height: 140 }, DESKTOP, BAR)).toBe(true);
    expect(needsScroll({ top: 680, left: 40, width: 600, height: 140 }, DESKTOP, BAR)).toBe(true);
    expect(needsScroll({ top: 300, left: 40, width: 600, height: 140 }, DESKTOP, BAR)).toBe(false);
  });
  it('a target taller than the screen only needs half the screen filled', () => {
    expect(needsScroll({ top: -200, left: 40, width: 600, height: 1000 }, DESKTOP, BAR)).toBe(false);
    expect(needsScroll({ top: 500, left: 40, width: 600, height: 1000 }, DESKTOP, BAR)).toBe(true);
  });
});

describe('placeCaption', () => {
  it('centres the card when the step has no target, or its target is scrolled away', () => {
    for (const hole of [null, { top: -400, left: 0, width: 50, height: 50 }]) {
      const p = placeCaption(hole, CAPTION, DESKTOP, BAR);
      expect(p.side).toBe('center');
      expect(p.left).toBe((DESKTOP.width - 360) / 2);
      expectInside(p, DESKTOP);
    }
  });

  it('prefers below, then above, then right, then left', () => {
    expect(placeCaption({ top: 80, left: 100, width: 300, height: 60 }, CAPTION, DESKTOP, BAR)).toMatchObject({ side: 'below', top: 140 + CAPTION_GAP });
    expect(placeCaption({ top: 550, left: 100, width: 300, height: 140 }, CAPTION, DESKTOP, BAR)).toMatchObject({ side: 'above', top: 550 - CAPTION_GAP - 150 });
    expect(placeCaption({ top: 20, left: 40, width: 700, height: 690 }, CAPTION, DESKTOP, BAR)).toMatchObject({ side: 'right', left: 740 + CAPTION_GAP });
    expect(placeCaption({ top: 20, left: 500, width: 700, height: 690 }, CAPTION, DESKTOP, BAR)).toMatchObject({ side: 'left', left: 500 - CAPTION_GAP - 360 });
  });

  it('a target taller and wider than the room around it (the Marketing Desk on a phone) gets the caption over it, inside the screen', () => {
    const p = placeCaption({ top: -200, left: 8, width: 359, height: 1400 }, CAPTION, PHONE, BAR);
    expect(p.side).toBe('over');
    expectInside(p, PHONE);
  });

  it('stays inside the screen when the window is resized mid-step, down to phone width', () => {
    const targets: Box[] = [
      { top: 10, left: 10, width: 120, height: 40 },
      { top: 300, left: 900, width: 340, height: 200 },
      { top: 620, left: 0, width: 1280, height: 60 },
      { top: 100, left: 1200, width: 70, height: 30 },
    ];
    for (const viewport of [DESKTOP, { width: 1024, height: 700 }, { width: 768, height: 1024 }, PHONE, { width: 320, height: 568 }]) {
      expect(captionWidth(viewport)).toBeLessThanOrEqual(viewport.width - 2 * VIEW_MARGIN);
      for (const t of targets) {
        const p = placeCaption(spotlightBox(t), CAPTION, viewport, BAR);
        expectInside(p, viewport);
      }
    }
  });
});

describe('findTourTarget', () => {
  const el = (box: Box) => ({ getBoundingClientRect: () => box });
  const root = (found: ReturnType<typeof el> | null) => {
    const seen: string[] = [];
    return { seen, querySelector: (sel: string) => { seen.push(sel); return found; } };
  };

  it('looks the target up by its data-tour id inside the stage', () => {
    const r = root(el({ top: 1, left: 2, width: 3, height: 4 }));
    expect(findTourTarget(r, 'jm-draft')).not.toBeNull();
    expect(r.seen).toEqual(['[data-tour="jm-draft"]']);
  });

  it('is null — a centred card — for no target, a missing element, or one with no size', () => {
    expect(findTourTarget(root(el({ top: 0, left: 0, width: 10, height: 10 })), null)).toBeNull();
    expect(findTourTarget(null, 'jm-draft')).toBeNull();
    expect(findTourTarget(root(null), 'mk-expand')).toBeNull();
    expect(findTourTarget(root(el({ top: 0, left: 0, width: 0, height: 0 })), 'mk-expand')).toBeNull();
    expect(findTourTarget(root(el({ top: 0, left: 0, width: 120, height: 0 })), 'mk-expand')).toBeNull();
  });
});
