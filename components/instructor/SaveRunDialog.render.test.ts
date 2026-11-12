import { describe, expect, it, beforeEach } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { LeaderboardRow } from '../../services/classTotals';
import { clearBotTeams, recordBotTeams } from '../../services/runRecord/botRegistry';
import { SaveRunDialog, trackClosed, type SaveRunDialogProps } from './SaveRunDialog';

const team = (id: number): LeaderboardRow => ({
  rank: 1, team: { id, name: `Team ${id}` }, points: 0, total_sales: 1, unsold_jokes: 0, discarded_jokes: 0,
  batches_processed: 1, profit: 1, total_jokes: 1, published_jokes: 1,
});
const rates = {
  costOfPublishing: 0.1, costOfDiscard: 0, shippingFeeSmall: 0, shippingFeeStandard: 0, shippingFeeLarge: 0,
  storageFeePerJokeMinute: 0, hostingFeePerJokeMinute: 0.05,
};
const props = (over: Partial<SaveRunDialogProps> = {}): SaveRunDialogProps => ({
  open: true, onClose: () => {},
  roundIds: { 1: 41, 2: 42 }, roundStatuses: { 1: 'ENDED', 2: 'ENDED' },
  statsR1: { leaderboard: [team(1), team(2)] }, statsR2: { leaderboard: [team(1), team(2)] },
  ratesR1: rates, ratesR2: rates, teamNames: {},
  ...over,
});
/** Whether the radio with this value is checked. */
const isChecked = (html: string, value: string): boolean =>
  (html.match(new RegExp(`<input[^>]*value="${value}"[^>]*>`)) ?? [''])[0].includes('checked');
const render = (over: Partial<SaveRunDialogProps> = {}) => renderToStaticMarkup(createElement(SaveRunDialog, props(over)));

beforeEach(() => clearBotTeams());

describe('SaveRunDialog', () => {
  it('shows the title and the three fields', () => {
    const html = render();
    expect(html).toContain('Save run record');
    for (const label of ['Name', 'Who played', 'Notes']) expect(html).toContain(label);
    expect(html).toContain('Students');
    expect(html).toContain('Mixed');
  });

  it('says so when only Round 1 is savable, and not when both are', () => {
    const line = 'Round 2 has not ended, so this record holds Round 1 only.';
    expect(render({ roundStatuses: { 1: 'ENDED', 2: 'ACTIVE' } })).toContain(line);
    expect(render()).not.toContain(line);
  });

  it('checks Bots when every playing team is a bot team, Students when none is', () => {
    expect(isChecked(render(), 'students')).toBe(true);
    recordBotTeams([{ teamId: 1, persona: 'steady' }, { teamId: 2, persona: 'rusher' }]);
    const html = render();
    expect(isChecked(html, 'bots')).toBe(true);
    expect(isChecked(html, 'students')).toBe(false);
  });

  it('once saved, offers both downloads again and Done, not the form', () => {
    const file = (fileName: string) => ({ fileName, text: '{}', mime: 'application/json' });
    const html = render({ initialState: { saved: { json: file('a.jfrun.json'), csv: file('a.csv') } } });
    expect(html).toContain('Saved. If a file did not download, use the links below.');
    expect(html).toContain('Download record (.jfrun.json)');
    expect(html).toContain('Download spreadsheet (.csv)');
    expect(html).toContain('>Done<');
    expect(html).not.toContain('Who played');
    expect(html).not.toContain('>Cancel<');
  });

  it('while saving, disables Cancel and hides the close button', () => {
    const html = render({ initialState: { saving: true } });
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Cancel<\/button>/);
    expect(html).not.toContain('aria-label="Close"');
    expect(render()).toContain('aria-label="Close"');
  });

  it('renders nothing when closed', () => {
    expect(render({ open: false })).toBe('');
  });
});

describe('trackClosed', () => {
  it('reads open after StrictMode mounts, unmounts and remounts, and closed after the real unmount', () => {
    const closed = { current: false };
    const cleanup1 = trackClosed(closed);
    cleanup1();
    const cleanup2 = trackClosed(closed);
    expect(closed.current).toBe(false);
    cleanup2();
    expect(closed.current).toBe(true);
  });
});
