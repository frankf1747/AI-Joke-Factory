import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Modal } from '../components';

describe('Modal', () => {
  const html = renderToStaticMarkup(createElement(Modal, { isOpen: true, onClose: () => {}, title: 'Reshuffle the teams?' }, 'Body'));

  it('is a modal dialog named by its title', () => {
    expect(html).toMatch(/role="dialog"[^>]*aria-modal="true"/);
    const id = html.match(/aria-labelledby="([^"]+)"/)?.[1];
    expect(id).toBeTruthy();
    expect(html).toContain(`id="${id}"`);
    expect(html).toMatch(new RegExp(`<h3[^>]*id="${id}"[^>]*>Reshuffle the teams\\?</h3>`));
  });

  it('names the close button', () => {
    expect(html).toMatch(/<button[^>]*aria-label="Close"/);
  });
});
