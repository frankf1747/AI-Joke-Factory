import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FeedbackMatrix } from './FeedbackMatrix';
import { dimById } from '../config/dimensions';
import type { FeedbackJoke } from '../services/feedbackJokeContext';

const NOW = Date.parse('2026-10-18T10:06:00Z');
const dims = (ids: string[]) => ids.map(id => ({ id, label: dimById(id)!.label }));
const joke = (over: Partial<FeedbackJoke> & Pick<FeedbackJoke, 'joke_id' | 'joke_title'>): FeedbackJoke => ({
  was_bought: false, good: [], improve: [],
  batchId: 5002, position: 1, text: null, releasedAt: Date.parse('2026-10-18T10:00:00Z'), soldCount: 0,
  ...over,
});

const JOKES: FeedbackJoke[] = [
  joke({
    joke_id: 21, joke_title: 'The Self-Starter', was_bought: true, position: 1, soldCount: 6,
    text: 'I told my boss I needed a raise; he said be a self-starter, so I started napping.',
    good: dims(['LENGTH', 'TOPIC']), improve: dims(['WORDPLAY', 'FRESHNESS', 'ENERGY']),
  }),
  joke({
    joke_id: 22, joke_title: 'Pivot Table Therapy', was_bought: true, position: 2, soldCount: 1,
    text: 'My therapist said embrace your mistakes, so I hugged my pivot table.',
    good: dims(['WORDPLAY', 'CLARITY']), improve: dims(['EDGINESS', 'STRUCTURE', 'ENERGY']),
  }),
  joke({
    joke_id: 24, joke_title: 'Could Have Been an Email', position: 4, soldCount: 0,
    releasedAt: Date.parse('2026-10-18T10:02:00Z'),
    text: 'Our standup is five people agreeing it could have been an email.',
    good: dims(['CLARITY', 'TOPIC']), improve: dims(['ENERGY', 'SETUP_PAYOFF', 'TITLE_FIT']),
  }),
];

const render = (jokes: FeedbackJoke[] = JOKES) => renderToStaticMarkup(createElement(FeedbackMatrix, { jokes, now: NOW }));
/** The <tr> whose label cell reads `label`. */
const rowOf = (html: string, label: string) => html.match(new RegExp(`<tr[^>]*><th scope="row"[^>]*><span[^>]*>${label}</span>.*?</tr>`))?.[0] ?? '';
const count = (s: string, needle: string) => s.split(needle).length - 1;

describe('FeedbackMatrix', () => {
  it('heads the window and counts the jokes', () => {
    const out = render();
    expect(out).toContain('What customers keep telling you');
    expect(out).toContain('Your latest 3 released jokes');
    expect(render(JOKES.slice(0, 1))).toContain('Your latest 1 released joke<');
  });

  it('heads each column with batch and position, the title (full title on hover) and the buyers', () => {
    const out = render();
    expect(out).toContain('B-5002 #1');
    expect(out).toContain('B-5002 #4');
    expect(out).toContain('title="The Self-Starter"');
    expect(out).toContain('6 buyers');
    expect(out).toContain('1 buyer<');
    expect(out).toContain('No buyer now');
    expect(out.indexOf('B-5002 #1')).toBeLessThan(out.indexOf('B-5002 #2'));
  });

  it('labels each criterion row with a row header cell', () => {
    const out = render();
    expect(out).toContain('<th scope="row"');
    // One per criterion row, and each row also carries its "×n" count.
    expect(count(out, '<th scope="row"')).toBe(count(out, 'float-right'));
  });

  it('scopes the corner and each joke header cell as column headers', () => {
    const out = render();
    // The corner plus one per joke.
    expect(count(out, '<th scope="col"')).toBe(1 + JOKES.length);
    expect(out).toMatch(/<th scope="col"[^>]*>\s*Latest first/);
  });

  it('groups the rows Fix next, then Keep doing, each with the winning side\'s count', () => {
    const out = render();
    expect(out).toContain('Fix next');
    expect(out).toContain('Keep doing');
    expect(out.indexOf('Fix next')).toBeLessThan(out.indexOf('Keep doing'));
    const energy = rowOf(out, 'Energy');
    expect(energy).toContain('×3');
    expect(count(energy, '✕')).toBe(3);
    expect(count(energy, 'aria-label="missed"')).toBe(3);
    // Wordplay ties 1–1 and goes to Fix next: one ✕, one ✓, one not mentioned.
    const wordplay = rowOf(out, 'Wordplay');
    expect(wordplay).toContain('×1');
    expect(count(wordplay, '✕')).toBe(1);
    expect(count(wordplay, '✓')).toBe(1);
    expect(count(wordplay, 'aria-label="not mentioned"')).toBe(1);
    expect(out.indexOf('>Wordplay<')).toBeLessThan(out.indexOf('Keep doing'));
    const topic = rowOf(out, 'Topic');
    expect(topic).toContain('×2');
    expect(count(topic, 'aria-label="landed"')).toBe(2);
    expect(out.indexOf('>Topic<')).toBeGreaterThan(out.indexOf('Keep doing'));
  });

  it('lists the criteria no joke mentions', () => {
    expect(render()).toContain('No word yet: Humor Style, Complexity.');
  });

  it('gives a joke with no customer read an all-"·" column that leaves No word yet alone', () => {
    const unread = joke({ joke_id: 25, joke_title: 'Fresh Off the Line', position: 5, text: 'Still warm.' });
    const out = render([...JOKES, unread]);
    expect(out).toContain('Your latest 4 released jokes');
    expect(out).toContain('No word yet: Humor Style, Complexity.');
    const energy = rowOf(out, 'Energy');
    expect(count(energy, '<td')).toBe(4); // the label is a <th scope="row">, then one cell per joke
    // Each row's last cell is the unread joke's, and it is never marked.
    for (const label of ['Energy', 'Topic', 'Clarity', 'Title Fit']) {
      expect(rowOf(out, label)).toMatch(/aria-label="not mentioned"[^>]*>·<\/td><\/tr>$/);
    }
  });

  it('keys each joke: title, batch and release time, sales, and its text behind a disclosure', () => {
    const out = render();
    expect(count(out, '<details')).toBe(3);
    expect(out).toContain('B-5002, joke #1, released 6 min ago');
    expect(out).toContain('B-5002, joke #4, released 4 min ago');
    for (const j of JOKES) {
      expect(out).toMatch(new RegExp(`<details[^>]*>(?:(?!</details>).)*${j.text!.replace(/[.;]/g, '\\$&')}(?:(?!</details>).)*</details>`));
    }
    expect(out).not.toContain('<details open');
  });

  it('renders a joke the batch list does not have yet with its title only', () => {
    const missing = joke({ joke_id: 30, joke_title: '', batchId: null, position: null, text: null, releasedAt: null, soldCount: null });
    const out = render([missing]);
    expect(out).toContain('Untitled joke');
    expect(out).not.toContain('B-');
    expect(out).not.toContain('null');
    expect(out).toContain('No buyer now');
  });

  it('closes on the reading note and keeps to the copy rules', () => {
    const out = render();
    expect(out).toContain('Customers say what landed and what missed, never by how much. Each joke shows 5 of the 12 criteria.');
    expect(out).not.toContain('—');
    expect(out).not.toContain('!');
  });
});
