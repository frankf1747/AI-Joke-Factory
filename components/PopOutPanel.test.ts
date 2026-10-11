import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  POP_OUT_HEIGHT, POP_OUT_WIDTH, PopOutPanel, onPopOutClosed, requestPopOutWindow,
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
  it('asks for a 360 × 520 window and titles it', async () => {
    const pip = fakePipWindow();
    const requestWindow = vi.fn(async () => pip);
    const got = await requestPopOutWindow({ documentPictureInPicture: { requestWindow } }, 'Customer feedback');
    expect(requestWindow).toHaveBeenCalledWith({ width: 360, height: 520 });
    expect([POP_OUT_WIDTH, POP_OUT_HEIGHT]).toEqual([360, 520]);
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
  it('without Document PiP, opens as the in-page panel: header, close button, 360 px wide, at most 70 % high', () => {
    const out = renderToStaticMarkup(createElement(PopOutPanel, { title: 'Customer feedback', open: true, onClose: () => {} }, 'the rows'));
    expect(out).toContain('role="dialog"');
    expect(out).toContain('aria-label="Customer feedback"');
    expect(out).toContain('aria-label="Close Customer feedback"');
    expect(out).toContain('width:360px');
    expect(out).toContain('max-height:70vh');
    expect(out).toContain('fixed bottom-4 right-4');
    expect(out).toContain('overflow-y-auto');
    expect(out).toContain('the rows');
  });
});
