import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  POP_OUT_HEIGHT, POP_OUT_WIDTH, PopOutPanel, clampPanelPosition, onPopOutClosed, preparePopOutWindow, requestPopOutWindow,
  supportsDocumentPiP, tailwindCdnSrc,
} from './PopOutPanel';

/* environment is 'node': no window, no document. The browser-only paths
   (mirrorStyles, the portal into the PiP window) are checked by hand in the
   final browser checklist; everything that decides WHICH mode runs is here. */

const fakePipWindow = () => ({ document: { title: '' } }) as unknown as Window;

describe('supportsDocumentPiP', () => {
  it('is true only when documentPictureInPicture.requestWindow exists', () => {
    expect(supportsDocumentPiP({ documentPictureInPicture: { requestWindow: () => Promise.resolve(fakePipWindow()) } })).toBe(true);
  });
  it('is false for browsers without it, and for anything that is not a window', () => {
    for (const win of [undefined, null, 42, 'window', {}, { documentPictureInPicture: undefined },
      { documentPictureInPicture: null }, { documentPictureInPicture: {} }, { documentPictureInPicture: { requestWindow: 'no' } }]) {
      expect(supportsDocumentPiP(win)).toBe(false);
    }
  });
});

describe('requestPopOutWindow', () => {
  it('asks for an 840 × 820 window and titles it', async () => {
    const pip = fakePipWindow();
    const requestWindow = vi.fn(async () => pip);
    const got = await requestPopOutWindow({ documentPictureInPicture: { requestWindow } }, 'Customer feedback');
    expect(requestWindow).toHaveBeenCalledWith({ width: 840, height: 820 });
    expect(POP_OUT_WIDTH).toBe(840);
    expect(POP_OUT_HEIGHT).toBe(820);
    expect(got).toBe(pip);
    expect(got!.document.title).toBe('Customer feedback');
  });
  it('resolves null without Document PiP, so the caller shows the in-page panel', async () => {
    expect(await requestPopOutWindow({}, 'Customer feedback')).toBeNull();
    expect(await requestPopOutWindow(undefined, 'Customer feedback')).toBeNull();
  });
  it('resolves null when the browser refuses (e.g. no user gesture), so the caller falls back', async () => {
    const requestWindow = vi.fn(async () => { throw new DOMException('needs a user gesture', 'NotAllowedError'); });
    expect(await requestPopOutWindow({ documentPictureInPicture: { requestWindow } }, 'Customer feedback')).toBeNull();
  });
});

describe('preparePopOutWindow', () => {
  it('closes the window and returns null when the setup throws, so the caller falls back to the panel', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const close = vi.fn();
    const pip = {
      close,
      get document(): Document { throw new Error('head unavailable'); },
    } as unknown as Window;
    const page = { document: {} } as unknown as Window;
    expect(preparePopOutWindow(page, pip, () => {})).toBeNull();
    expect(close).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
  it('still returns null when closing the window also throws', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const pip = {
      close: () => { throw new Error('already closed'); },
      get document(): Document { throw new Error('head unavailable'); },
    } as unknown as Window;
    expect(preparePopOutWindow({ document: {} } as unknown as Window, pip, () => {})).toBeNull();
    warn.mockRestore();
  });
});

describe('onPopOutClosed', () => {
  it('fires once when the window is closed (pagehide), and not after it is stopped', () => {
    const pip = new EventTarget();
    const closed = vi.fn();
    const stop = onPopOutClosed(pip as unknown as Window, closed);
    pip.dispatchEvent(new Event('pagehide'));
    expect(closed).toHaveBeenCalledTimes(1);
    stop();
    pip.dispatchEvent(new Event('pagehide'));
    expect(closed).toHaveBeenCalledTimes(1);
  });
});

describe('tailwindCdnSrc', () => {
  it('finds the Tailwind Play CDN script the page loads, so the PiP window can load it too', () => {
    const doc = {
      querySelector: (sel: string) =>
        sel === 'script[src*="cdn.tailwindcss.com"]' ? { getAttribute: (a: string) => (a === 'src' ? 'https://cdn.tailwindcss.com' : null) } : null,
    } as unknown as Document;
    expect(tailwindCdnSrc(doc)).toBe('https://cdn.tailwindcss.com');
    expect(tailwindCdnSrc({ querySelector: () => null } as unknown as Document)).toBeNull();
  });
});

describe('PopOutPanel', () => {
  it('renders nothing while closed', () => {
    expect(renderToStaticMarkup(createElement(PopOutPanel, { title: 'Customer feedback', open: false, onClose: () => {} }, 'rows'))).toBe('');
  });
  it('without Document PiP, opens as the in-page panel: header, close button, 840 × 820 within the viewport, bottom-right', () => {
    const out = renderToStaticMarkup(createElement(PopOutPanel, { title: 'Customer feedback', open: true, onClose: () => {} }, 'the rows'));
    expect(out).toContain('role="dialog"');
    expect(out).toContain('aria-label="Customer feedback"');
    expect(out).toContain('aria-label="Close Customer feedback"');
    expect(out).toContain('width:min(840px, 100vw - 48px)');
    expect(out).toContain('height:min(820px, 100vh - 48px)');
    expect(out).not.toContain('70vh');
    expect(out).toContain('right:24px;bottom:24px');
    expect(out).toContain('title="Drag to move"');
    expect(out).toContain('overflow-y-auto');
    expect(out).toContain('the rows');
  });
});

describe('clampPanelPosition', () => {
  const size = { width: 840, height: 820 };
  const viewport = { width: 1440, height: 900 };
  it('leaves a position that keeps the panel on screen', () => {
    expect(clampPanelPosition({ x: 100, y: 40 }, size, viewport)).toEqual({ x: 100, y: 40 });
  });
  it('pulls the panel back fully on screen from every edge', () => {
    expect(clampPanelPosition({ x: -50, y: -10 }, size, viewport)).toEqual({ x: 0, y: 0 });
    expect(clampPanelPosition({ x: 900, y: 300 }, size, viewport)).toEqual({ x: 600, y: 80 });
  });
  it('pins the panel to the top-left when the viewport is smaller than it', () => {
    expect(clampPanelPosition({ x: 30, y: 30 }, size, { width: 600, height: 500 })).toEqual({ x: 0, y: 0 });
  });
});
